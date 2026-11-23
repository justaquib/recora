@preconcurrency import AVFoundation
@preconcurrency import ScreenCaptureKit
import CoreImage
import CoreMedia
import Foundation

private final class CapturePickerObserver: NSObject, SCContentSharingPickerObserver {
    var onSelection: ((SCContentFilter?) -> Void)?

    func contentSharingPicker(_ picker: SCContentSharingPicker, didUpdateWith filter: SCContentFilter, for stream: SCStream?) {
        onSelection?(filter)
    }

    func contentSharingPicker(_ picker: SCContentSharingPicker, didCancelFor stream: SCStream?) {
        onSelection?(nil)
    }

    func contentSharingPickerStartDidFailWithError(_ error: any Error) {
        onSelection?(nil)
    }
}

@available(macOS 15.0, *)
private final class NativeRecordingOutputDelegate: NSObject, SCRecordingOutputDelegate {
    weak var recorder: NativeRecorder?

    init(recorder: NativeRecorder) {
        self.recorder = recorder
    }

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        recorder?.recordingOutputDidFinish()
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: any Error) {
        recorder?.recordingOutputDidFail(error)
    }
}

private final class NativeRecorder: NSObject, SCStreamOutput, SCStreamDelegate {
    static let shared = NativeRecorder()
    private let lock = NSRecursiveLock()
    private let sampleQueue = DispatchQueue(label: "com.recora.capture.samples")
    private var pickerObserver: CapturePickerObserver?
    private var selectedFilter: SCContentFilter?
    private var stream: SCStream?
    private var writer: AVAssetWriter?
    private var videoInput: AVAssetWriterInput?
    private var audioInput: AVAssetWriterInput?
    private var activeRecordingOutput: NSObject?
    private var recordingOutputDelegate: NSObject?
    private var recordingOutputFinished: DispatchSemaphore?
    private var recordingOutputError: String?
    private var segmentURLs: [URL] = []
    private var usesNativeRecordingOutput = false
    private var outputURL: URL?
    private var isPaused = false
    private var pauseStarted: CMTime?
    private var pausedDuration = CMTime.zero
    private var firstVideoTime: CMTime?
    private var videoSamples = 0
    private var audioSamples = 0
    private var microphoneEnabled = false
    private var latestFrame: CVPixelBuffer?
    private let imageContext = CIContext()

    func chooseSource() throws {
        guard #available(macOS 14.0, *) else {
            throw NSError(domain: "RecoraCapture", code: 1, userInfo: [NSLocalizedDescriptionKey: "Native screen capture requires macOS 14 or later."])
        }
        let pickerFinished = DispatchSemaphore(value: 0)
        DispatchQueue.main.async {
                let picker = SCContentSharingPicker.shared
                let observer = CapturePickerObserver()
                observer.onSelection = { [weak self, weak picker] filter in
                    guard let self else { return }
                    picker?.remove(observer)
                    picker?.isActive = false
                    self.lock.lock()
                    self.pickerObserver = nil
                    self.selectedFilter = filter
                    self.lock.unlock()
                    pickerFinished.signal()
                }
                self.lock.lock()
                self.pickerObserver = observer
                self.lock.unlock()
                picker.add(observer)
                picker.isActive = true
                picker.present()
        }
        guard pickerFinished.wait(timeout: .now() + 120) == .success else {
            throw NSError(domain: "RecoraCapture", code: 2, userInfo: [NSLocalizedDescriptionKey: "The screen picker timed out. Try selecting a display or window again."])
        }
        lock.lock()
        let hasSelection = selectedFilter != nil
        lock.unlock()
        guard hasSelection else {
            throw NSError(domain: "RecoraCapture", code: 2, userInfo: [NSLocalizedDescriptionKey: "Screen selection was cancelled."])
        }
    }

    func start(path: String, microphone: Bool) throws {
        lock.lock()
        guard let filter = selectedFilter else {
            lock.unlock()
            throw NSError(domain: "RecoraCapture", code: 3, userInfo: [NSLocalizedDescriptionKey: "Choose a screen or window before recording."])
        }
        guard stream == nil else {
            lock.unlock()
            throw NSError(domain: "RecoraCapture", code: 4, userInfo: [NSLocalizedDescriptionKey: "A native recording is already active."])
        }
        selectedFilter = nil
        lock.unlock()

        if #unavailable(macOS 15.0), microphone {
            throw NSError(domain: "RecoraCapture", code: 5, userInfo: [NSLocalizedDescriptionKey: "Native screen and microphone capture requires macOS 15 or later. Turn off microphone audio or update macOS."])
        }

        let url = URL(fileURLWithPath: path)
        let usesNativeOutput: Bool
        let config = SCStreamConfiguration()
        let sourceSize = filter.contentRect
        let scale = CGFloat(max(filter.pointPixelScale, 1))
        let width = max(2, Int(sourceSize.width * scale) / 2 * 2)
        let height = max(2, Int(sourceSize.height * scale) / 2 * 2)
        config.width = width
        config.height = height
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.queueDepth = 5
        config.showsCursor = true
        config.capturesAudio = false
        if #available(macOS 15.0, *) {
            config.captureMicrophone = microphone
            config.sampleRate = 48_000
            config.channelCount = 2
        }

        let nativeStream = SCStream(filter: filter, configuration: config, delegate: self)
        var assetWriter: AVAssetWriter?
        var video: AVAssetWriterInput?
        var audio: AVAssetWriterInput?
        var recordingOutput: NSObject?
        var newSegments: [URL] = []
        if #available(macOS 15.0, *) {
            usesNativeOutput = true
            let segmentURL = segmentURL(for: url, index: 0)
            try? FileManager.default.removeItem(at: segmentURL)
            let output = try makeRecordingOutput(url: segmentURL)
            try nativeStream.addRecordingOutput(output)
            recordingOutput = output
            newSegments = [segmentURL]
        } else {
            usesNativeOutput = false
            try? FileManager.default.removeItem(at: url)
            let fallbackWriter = try AVAssetWriter(outputURL: url, fileType: .mp4)
            let videoInput = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: width,
                AVVideoHeightKey: height,
                AVVideoCompressionPropertiesKey: [AVVideoExpectedSourceFrameRateKey: 30, AVVideoAverageBitRateKey: 5_000_000],
            ])
            videoInput.expectsMediaDataInRealTime = true
            guard fallbackWriter.canAdd(videoInput) else {
                throw NSError(domain: "RecoraCapture", code: 6, userInfo: [NSLocalizedDescriptionKey: "The native MP4 writer cannot add a video track."])
            }
            fallbackWriter.add(videoInput)
            assetWriter = fallbackWriter
            video = videoInput
        }

        try nativeStream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
        lock.lock()
        self.stream = nativeStream
        self.writer = assetWriter
        self.videoInput = video
        self.audioInput = audio
        self.activeRecordingOutput = recordingOutput
        self.recordingOutputFinished = recordingOutput.map { _ in DispatchSemaphore(value: 0) }
        self.recordingOutputError = nil
        self.segmentURLs = newSegments
        self.usesNativeRecordingOutput = usesNativeOutput
        self.outputURL = url
        self.microphoneEnabled = microphone
        self.isPaused = false
        self.pauseStarted = nil
        self.pausedDuration = .zero
        self.firstVideoTime = nil
        self.videoSamples = 0
        self.audioSamples = 0
        self.latestFrame = nil
        lock.unlock()

        let startFinished = DispatchSemaphore(value: 0)
        var startError: String?
        nativeStream.startCapture { error in
            startError = error?.localizedDescription
            startFinished.signal()
        }
        startFinished.wait()
        if let startError {
            assetWriter?.cancelWriting()
            if let segment = newSegments.first { try? FileManager.default.removeItem(at: segment) }
            lock.lock()
            self.stream = nil
            self.writer = nil
            self.videoInput = nil
            self.audioInput = nil
            self.activeRecordingOutput = nil
            self.recordingOutputFinished = nil
            self.segmentURLs = []
            self.usesNativeRecordingOutput = false
            self.outputURL = nil
            lock.unlock()
            throw NSError(domain: "RecoraCapture", code: 14, userInfo: [NSLocalizedDescriptionKey: startError])
        }
    }

    func setPaused(_ paused: Bool) throws {
        lock.lock()
        guard let nativeStream = stream else {
            lock.unlock()
            throw NSError(domain: "RecoraCapture", code: 8, userInfo: [NSLocalizedDescriptionKey: "There is no active native recording."])
        }
        if isPaused == paused {
            lock.unlock()
            return
        }
        let nativeOutput = usesNativeRecordingOutput
        let activeOutputObject = activeRecordingOutput
        let destination = outputURL
        let nextSegmentIndex = segmentURLs.count
        if nativeOutput && paused {
            guard #available(macOS 15.0, *), let activeOutput = activeOutputObject as? SCRecordingOutput else {
                lock.unlock()
                throw NSError(domain: "RecoraCapture", code: 17, userInfo: [NSLocalizedDescriptionKey: "The native recording output is missing while pausing."])
            }
            let finished = recordingOutputFinished ?? DispatchSemaphore(value: 0)
            recordingOutputFinished = finished
            lock.unlock()
            do {
                try nativeStream.removeRecordingOutput(activeOutput)
            } catch {
                lock.lock(); recordingOutputFinished = nil; lock.unlock()
                throw error
            }
            guard finished.wait(timeout: .now() + 30) == .success else {
                lock.lock(); recordingOutputFinished = nil; lock.unlock()
                throw NSError(domain: "RecoraCapture", code: 18, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit did not finish the current recording segment while pausing."])
            }
            lock.lock()
            let finishError = recordingOutputError
            recordingOutputFinished = nil
            if finishError == nil {
                activeRecordingOutput = nil
                isPaused = true
                pauseStarted = CMClockGetTime(CMClockGetHostTimeClock())
            }
            lock.unlock()
            if let finishError { throw NSError(domain: "RecoraCapture", code: 19, userInfo: [NSLocalizedDescriptionKey: "Could not pause native recording: \(finishError)"]) }
            return
        }
        if nativeOutput {
            guard #available(macOS 15.0, *) else {
                lock.unlock()
                throw NSError(domain: "RecoraCapture", code: 20, userInfo: [NSLocalizedDescriptionKey: "Segmented native recording requires macOS 15 or later."])
            }
            lock.unlock()
            guard let destination else { throw NSError(domain: "RecoraCapture", code: 20, userInfo: [NSLocalizedDescriptionKey: "The native recording destination is unavailable."]) }
            let nextSegment = segmentURL(for: destination, index: nextSegmentIndex)
            try? FileManager.default.removeItem(at: nextSegment)
            let output = try makeRecordingOutput(url: nextSegment)
            lock.lock()
            recordingOutputFinished = DispatchSemaphore(value: 0)
            recordingOutputError = nil
            lock.unlock()
            do {
                try nativeStream.addRecordingOutput(output)
            } catch {
                try? FileManager.default.removeItem(at: nextSegment)
                lock.lock(); recordingOutputFinished = nil; lock.unlock()
                throw error
            }
            lock.lock()
            segmentURLs.append(nextSegment)
            activeRecordingOutput = output
            if let pauseStarted {
                pausedDuration = CMTimeAdd(pausedDuration, CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), pauseStarted))
            }
            pauseStarted = nil
            isPaused = false
            lock.unlock()
            return
        }
        if paused && !isPaused {
            pauseStarted = CMClockGetTime(CMClockGetHostTimeClock())
            isPaused = true
        } else if !paused && isPaused {
            if let pauseStarted {
                pausedDuration = CMTimeAdd(pausedDuration, CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), pauseStarted))
            }
            pauseStarted = nil
            isPaused = false
        }
        lock.unlock()
    }

    func snapshotBase64() throws -> String {
        lock.lock()
        let frame = latestFrame
        lock.unlock()
        guard let frame else {
            throw NSError(domain: "RecoraCapture", code: 12, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit has not delivered a screen frame yet."])
        }
        let image = CIImage(cvPixelBuffer: frame)
        guard let data = imageContext.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [:]) else {
            throw NSError(domain: "RecoraCapture", code: 13, userInfo: [NSLocalizedDescriptionKey: "Could not encode a screen snapshot for annotation."])
        }
        return data.base64EncodedString()
    }

    func stop() throws -> String {
        lock.lock()
        guard let nativeStream = stream else {
            lock.unlock()
            throw NSError(domain: "RecoraCapture", code: 9, userInfo: [NSLocalizedDescriptionKey: "There is no active native recording to stop."])
        }
        let assetWriter = writer
        let video = videoInput
        let audioInput = self.audioInput
        let activeOutput = activeRecordingOutput
        let nativeOutput = usesNativeRecordingOutput
        let segmentURLs = self.segmentURLs
        let destination = outputURL?.path ?? ""
        if isPaused, let pauseStarted {
            pausedDuration = CMTimeAdd(pausedDuration, CMTimeSubtract(CMClockGetTime(CMClockGetHostTimeClock()), pauseStarted))
        }
        isPaused = false
        let outputFinished = nativeOutput && activeOutput != nil ? (recordingOutputFinished ?? DispatchSemaphore(value: 0)) : nil
        recordingOutputFinished = outputFinished
        lock.unlock()

        let stopFinished = DispatchSemaphore(value: 0)
        var stopError: String?
        nativeStream.stopCapture { error in
            stopError = error?.localizedDescription
            stopFinished.signal()
        }
        stopFinished.wait()
        if let stopError {
            assetWriter?.cancelWriting()
            resetCaptureState()
            throw NSError(domain: "RecoraCapture", code: 15, userInfo: [NSLocalizedDescriptionKey: stopError])
        }
        if let outputFinished {
            guard outputFinished.wait(timeout: .now() + 30) == .success else {
                resetCaptureState()
                throw NSError(domain: "RecoraCapture", code: 21, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit did not signal that the MP4 recording was finalized."])
            }
        }
        sampleQueue.sync {}

        lock.lock()
        let frames = videoSamples
        let audioFrames = audioSamples
        let outputError = recordingOutputError
        lock.unlock()
        guard frames > 0 else {
            assetWriter?.cancelWriting()
            resetCaptureState()
            throw NSError(domain: "RecoraCapture", code: 10, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit stopped without delivering any video frames. Check macOS Screen Recording permission and the selected source."])
        }

        if nativeOutput {
            if let outputError {
                let recoveryFiles = segmentURLs.map(\.path).joined(separator: ", ")
                resetCaptureState()
                throw NSError(domain: "RecoraCapture", code: 22, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit recording output failed: \(outputError). Recovery segment files: \(recoveryFiles)"])
            }
            do {
                try finalizeRecordingSegments(segmentURLs, destination: URL(fileURLWithPath: destination))
            } catch {
                let recoveryFiles = segmentURLs.map(\.path).joined(separator: ", ")
                resetCaptureState()
                throw NSError(domain: "RecoraCapture", code: 32, userInfo: [NSLocalizedDescriptionKey: "Could not finalize native recording: \(error.localizedDescription). Recovery segment files: \(recoveryFiles)"])
            }
            resetCaptureState()
            return destination
        }

        guard let assetWriter, let video else {
            resetCaptureState()
            throw NSError(domain: "RecoraCapture", code: 23, userInfo: [NSLocalizedDescriptionKey: "The fallback MP4 writer was not initialized."])
        }
        video.markAsFinished()
        audioInput?.markAsFinished()
        let writerFinished = DispatchSemaphore(value: 0)
        var writerError: String?
        assetWriter.finishWriting {
            if assetWriter.status != .completed {
                if let underlying = assetWriter.error as NSError? {
                    writerError = "AVAssetWriter finalization failed (status \(assetWriter.status.rawValue), video frames \(frames), microphone samples \(audioFrames), error \(underlying.domain) / \(underlying.code)): \(underlying.localizedDescription)"
                } else {
                    writerError = "AVAssetWriter finalization ended with status \(assetWriter.status.rawValue) after \(frames) video frames and \(audioFrames) microphone samples, without an underlying error."
                }
            }
            writerFinished.signal()
        }
        writerFinished.wait()
        if let writerError {
            resetCaptureState()
            throw NSError(domain: "RecoraCapture", code: 11, userInfo: [NSLocalizedDescriptionKey: writerError])
        }
        resetCaptureState()
        return destination
    }

    private func resetCaptureState() {
        lock.lock()
        stream = nil
        writer = nil
        videoInput = nil
        audioInput = nil
        activeRecordingOutput = nil
        recordingOutputFinished = nil
        recordingOutputError = nil
        segmentURLs = []
        usesNativeRecordingOutput = false
        outputURL = nil
        isPaused = false
        pauseStarted = nil
        pausedDuration = .zero
        firstVideoTime = nil
        latestFrame = nil
        lock.unlock()
    }

    private func segmentURL(for destination: URL, index: Int) -> URL {
        let baseName = destination.deletingPathExtension().lastPathComponent
        return destination.deletingLastPathComponent()
            .appendingPathComponent("\(baseName) - segment \(index + 1) - \(UUID().uuidString).mp4")
    }

    @available(macOS 15.0, *)
    private func makeRecordingOutput(url: URL) throws -> SCRecordingOutput {
        let config = SCRecordingOutputConfiguration()
        config.outputURL = url
        config.outputFileType = .mp4
        config.videoCodecType = AVVideoCodecType.h264
        guard config.availableOutputFileTypes.contains(.mp4) else {
            throw NSError(domain: "RecoraCapture", code: 16, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit does not support MP4 recording on this Mac."])
        }
        let delegate: NativeRecordingOutputDelegate
        if let retainedDelegate = recordingOutputDelegate as? NativeRecordingOutputDelegate {
            delegate = retainedDelegate
        } else {
            delegate = NativeRecordingOutputDelegate(recorder: self)
            recordingOutputDelegate = delegate
        }
        return SCRecordingOutput(configuration: config, delegate: delegate)
    }

    private func finalizeRecordingSegments(_ segments: [URL], destination: URL) throws {
        guard !segments.isEmpty else {
            throw NSError(domain: "RecoraCapture", code: 24, userInfo: [NSLocalizedDescriptionKey: "ScreenCaptureKit did not create a recording segment."])
        }
        let fileManager = FileManager.default
        if segments.count == 1 {
            try? fileManager.removeItem(at: destination)
            try fileManager.moveItem(at: segments[0], to: destination)
            return
        }

        let composition = AVMutableComposition()
        var cursor = CMTime.zero
        for segment in segments {
            let asset = AVURLAsset(url: segment)
            guard asset.isReadable, asset.duration.isValid, asset.duration > .zero else {
                throw NSError(domain: "RecoraCapture", code: 25, userInfo: [NSLocalizedDescriptionKey: "A ScreenCaptureKit recording segment is unreadable or empty: \(segment.lastPathComponent)"])
            }
            let videoSource = asset.tracks(withMediaType: .video).first
            guard let videoSource else {
                throw NSError(domain: "RecoraCapture", code: 26, userInfo: [NSLocalizedDescriptionKey: "A ScreenCaptureKit segment does not contain a video track: \(segment.lastPathComponent)"])
            }
            let range = videoSource.timeRange
            guard range.duration.isValid, range.duration > .zero else {
                throw NSError(domain: "RecoraCapture", code: 27, userInfo: [NSLocalizedDescriptionKey: "A ScreenCaptureKit segment has no playable video duration: \(segment.lastPathComponent)"])
            }
            let destinationVideo = composition.tracks(withMediaType: .video).first ?? composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
            guard let destinationVideo else {
                throw NSError(domain: "RecoraCapture", code: 28, userInfo: [NSLocalizedDescriptionKey: "Could not create the combined recording video track."])
            }
            try destinationVideo.insertTimeRange(range, of: videoSource, at: cursor)
            destinationVideo.preferredTransform = videoSource.preferredTransform

            if let audioSource = asset.tracks(withMediaType: .audio).first {
                let destinationAudio = composition.tracks(withMediaType: .audio).first ?? composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
                if let destinationAudio {
                    let audioRange = CMTimeRange(start: audioSource.timeRange.start, duration: min(audioSource.timeRange.duration, range.duration))
                    try destinationAudio.insertTimeRange(audioRange, of: audioSource, at: cursor)
                }
            }
            cursor = CMTimeAdd(cursor, range.duration)
        }

        try? fileManager.removeItem(at: destination)
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
            throw NSError(domain: "RecoraCapture", code: 29, userInfo: [NSLocalizedDescriptionKey: "AVFoundation could not create an MP4 segment exporter."])
        }
        exporter.outputURL = destination
        exporter.outputFileType = .mp4
        exporter.shouldOptimizeForNetworkUse = true
        let exportFinished = DispatchSemaphore(value: 0)
        exporter.exportAsynchronously { exportFinished.signal() }
        guard exportFinished.wait(timeout: .now() + 60) == .success else {
            exporter.cancelExport()
            throw NSError(domain: "RecoraCapture", code: 30, userInfo: [NSLocalizedDescriptionKey: "AVFoundation timed out while joining paused recording segments."])
        }
        guard exporter.status == .completed else {
            let underlying = exporter.error as NSError?
            let reason = underlying.map { "\($0.domain) / \($0.code): \($0.localizedDescription)" } ?? "export status \(exporter.status.rawValue)"
            throw NSError(domain: "RecoraCapture", code: 31, userInfo: [NSLocalizedDescriptionKey: "Could not join native recording segments: \(reason)"])
        }
        for segment in segments { try? fileManager.removeItem(at: segment) }
    }

    func recordingOutputDidFinish() {
        lock.lock()
        let finished = recordingOutputFinished
        lock.unlock()
        finished?.signal()
    }

    func recordingOutputDidFail(_ error: any Error) {
        lock.lock()
        recordingOutputError = error.localizedDescription
        let finished = recordingOutputFinished
        lock.unlock()
        finished?.signal()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard CMSampleBufferDataIsReady(sampleBuffer) else { return }
        lock.lock()
        let paused = isPaused
        let writer = self.writer
        let video = videoInput
        let audio = audioInput
        let offset = pausedDuration
        let started = firstVideoTime != nil
        lock.unlock()
        guard !paused else { return }

        if type == .screen {
            if let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
                lock.lock(); latestFrame = pixelBuffer; lock.unlock()
            }
            guard let writer else {
                lock.lock()
                videoSamples += 1
                if firstVideoTime == nil { firstVideoTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer) }
                lock.unlock()
                return
            }
            if writer.status == .unknown {
                let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
                guard pts.isValid, writer.startWriting() else { return }
                writer.startSession(atSourceTime: pts)
                lock.lock()
                firstVideoTime = pts
                lock.unlock()
            }
            if writer.status == .writing, let video, video.isReadyForMoreMediaData {
                if let adjusted = shiftedBuffer(sampleBuffer, offset: offset), video.append(adjusted) {
                    lock.lock(); videoSamples += 1; lock.unlock()
                }
            }
        } else if #available(macOS 15.0, *), type == .microphone, started, let writer, writer.status == .writing, let audio, audio.isReadyForMoreMediaData {
            if let adjusted = shiftedBuffer(sampleBuffer, offset: offset), audio.append(adjusted) {
                lock.lock(); audioSamples += 1; lock.unlock()
            }
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: any Error) {
        lock.lock()
        isPaused = true
        lock.unlock()
        NSLog("Recora ScreenCaptureKit stream stopped: %@", error.localizedDescription)
    }

    private func shiftedBuffer(_ sample: CMSampleBuffer, offset: CMTime) -> CMSampleBuffer? {
        guard offset.isValid, offset > .zero else { return sample }
        var count = 0
        CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: 0, arrayToFill: nil, entriesNeededOut: &count)
        guard count > 0 else { return sample }
        var timings = Array(repeating: CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .invalid, decodeTimeStamp: .invalid), count: count)
        let status = timings.withUnsafeMutableBufferPointer { buffer in
            CMSampleBufferGetSampleTimingInfoArray(sample, entryCount: count, arrayToFill: buffer.baseAddress, entriesNeededOut: &count)
        }
        guard status == noErr else { return sample }
        for index in timings.indices {
            if timings[index].presentationTimeStamp.isValid { timings[index].presentationTimeStamp = CMTimeSubtract(timings[index].presentationTimeStamp, offset) }
            if timings[index].decodeTimeStamp.isValid { timings[index].decodeTimeStamp = CMTimeSubtract(timings[index].decodeTimeStamp, offset) }
        }
        var copied: CMSampleBuffer?
        let copyStatus = timings.withUnsafeMutableBufferPointer { buffer in
            CMSampleBufferCreateCopyWithNewTiming(allocator: kCFAllocatorDefault, sampleBuffer: sample, sampleTimingEntryCount: count, sampleTimingArray: buffer.baseAddress!, sampleBufferOut: &copied)
        }
        return copyStatus == noErr ? copied : sample
    }
}

private func nativeError(_ operation: () throws -> Void) -> UnsafeMutablePointer<CChar>? {
    do {
        try operation()
        return nil
    } catch {
        return strdup(error.localizedDescription)
    }
}

@_cdecl("recora_capture_choose_source")
public func recoraCaptureChooseSource() -> UnsafeMutablePointer<CChar>? {
    nativeError { try NativeRecorder.shared.chooseSource() }
}

@_cdecl("recora_capture_start")
public func recoraCaptureStart(_ path: UnsafePointer<CChar>, _ microphone: Int32) -> UnsafeMutablePointer<CChar>? {
    let filePath = String(cString: path)
    return nativeError { try NativeRecorder.shared.start(path: filePath, microphone: microphone != 0) }
}

@_cdecl("recora_capture_pause")
public func recoraCapturePause(_ paused: Int32) -> UnsafeMutablePointer<CChar>? {
    return nativeError { try NativeRecorder.shared.setPaused(paused != 0) }
}

@_cdecl("recora_capture_stop")
public func recoraCaptureStop() -> UnsafeMutablePointer<CChar>? {
    return nativeError { _ = try NativeRecorder.shared.stop() }
}

@_cdecl("recora_capture_snapshot")
public func recoraCaptureSnapshot() -> UnsafeMutablePointer<CChar>? {
    guard let encoded = try? NativeRecorder.shared.snapshotBase64() else { return nil }
    return strdup(encoded)
}

@_cdecl("recora_capture_free_error")
public func recoraCaptureFreeError(_ value: UnsafeMutablePointer<CChar>) {
    free(value)
}
