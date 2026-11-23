export type VideoItem = {
  id: string;
  title: string;
  createdAt: number;
  duration: number;
  captureDuration?: number;
  blob?: Blob;
  sizeBytes: number;
  thumbnail: string;
  hasCamera: boolean;
  filePath?: string;
  filePaths?: string[];
  mimeType?: string;
};
export type Source = { deviceId: string; label: string };
export type CaptureMode = "screen" | "camera";
export type CameraFilter = "original" | "warm" | "mono";
export type WidgetStatus = { active: boolean; ready?: boolean; recording?: boolean; preparing?: boolean; paused: boolean; elapsed: number; camera: boolean; microphone?: boolean; microphoneLevel?: number; microphoneAvailable?: boolean; cameraDeviceId?: string; cameraFilter?: CameraFilter; cameraBlur?: boolean; avatar?: string; saving?: boolean; savingStage?: "finalizing" | "saving"; screen?: boolean; bubble?: boolean; bubbleRevision?: number };
export type AnnotationTool = "cursor" | "pen" | "eraser" | "circle" | "square" | "arrow" | "off";

