import { useState } from "react";
import { Icon } from "./Icon";

export default function RecordingIssueModal({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const finalizationTimeout = message.includes("did not signal recording finalization");
  const pathMatch = message.match(/Recovery file:\s*(.+?)(?:\s+Recovery files remain|$)/i);
  const recoveryPath = pathMatch?.[1]?.trim();

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (cause) {
      console.warn("Could not copy recording issue details", cause);
    }
  };

  return <div className="recording-issue-backdrop" role="presentation">
    <section className="recording-issue-modal" role="alertdialog" aria-modal="true" aria-labelledby="recording-issue-title" aria-describedby="recording-issue-description">
      <div className="recording-issue-icon"><Icon name="warning" size={20} /></div>
      <span className="recording-issue-eyebrow">RECORDING NOT SAVED</span>
      <h2 id="recording-issue-title">{finalizationTimeout ? "Could not finish the recording" : "Recording issue"}</h2>
      <p id="recording-issue-description">
        {finalizationTimeout
          ? "ScreenCaptureKit did not confirm that the MP4 was finalized within 30 seconds. Recodex kept the recovery file so the captured video is not discarded."
          : "Recodex could not complete this recording. Review the details below; any recovery file has been kept on this device."}
      </p>

      {recoveryPath && <div className="recording-recovery-location">
        <span>RECOVERY FILE</span>
        <code title={recoveryPath}>{recoveryPath}</code>
      </div>}

      <details className="recording-issue-details">
        <summary>Technical details</summary>
        <pre>{message}</pre>
      </details>

      <footer className="recording-issue-actions">
        <button className="button secondary" onClick={() => void copyDetails()}><Icon name={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy details"}</button>
        <button className="button primary" onClick={onDismiss}>Got it</button>
      </footer>
    </section>
  </div>;
}
