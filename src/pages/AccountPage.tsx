import PageFooter from "../components/PageFooter";
import { Icon } from "../components/Icon";
import { HardDrive, ShieldCheck } from "lucide-react";

export default function AccountPage() {
  return <section className="library-page settings-page">
    <div className="page-heading settings-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Account</h1><p>Your Recodex workspace profile.</p></div><span className="settings-local-badge"><Icon lucide={ShieldCheck} size={14} /> Private by default</span></div>
    <div className="settings-content settings-single-page">
      <section className="settings-section">
        <div className="settings-panel">
          <div className="account-panel"><div className="account-avatar">A</div><div className="settings-row-copy"><strong>Personal workspace</strong><span>Workspace name</span></div><span className="settings-state"><span /> Active</span></div>
          <div className="settings-divider" /><div className="settings-info-row"><span>Account type</span><strong>Local account</strong></div><div className="settings-divider" /><div className="settings-info-row"><span>Sign-in</span><strong>Not required</strong></div>
        </div>
        <div className="settings-footnote"><Icon lucide={HardDrive} size={14} /> Your library and workspace details are stored on this device.</div>
      </section>
    </div>
    <PageFooter />
  </section>;
}
