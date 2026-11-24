import PageFooter from "../components/PageFooter";
import { Icon } from "../components/Icon";
import { ChevronRight, Mail, ShieldCheck } from "lucide-react";

export default function HelpPage() {
  return <section className="library-page settings-page">
    <div className="page-heading settings-heading"><div><div className="eyebrow">WORKSPACE</div><h1>Help & support</h1><p>Quick answers and support resources.</p></div><span className="settings-local-badge"><Icon lucide={ShieldCheck} size={14} /> Private by default</span></div>
    <div className="settings-content settings-single-page">
      <section className="settings-section">
        <div className="settings-panel settings-help-panel">
          <details className="settings-help-item"><summary>Where are my recordings stored?<Icon lucide={ChevronRight} size={15} /></summary><p>Recordings stay in the local Recodex library and are copied to your selected save location. The default folder is Documents/Recodex.</p></details>
          <details className="settings-help-item"><summary>How do I start a recording?<Icon lucide={ChevronRight} size={15} /></summary><p>Select New recording in the sidebar, choose a screen or window, then start the capture.</p></details>
          <details className="settings-help-item"><summary>How can I get more help?<Icon lucide={ChevronRight} size={15} /></summary><p>Support contact details and documentation links will be added here.</p></details>
        </div>
        <div className="settings-panel settings-contact-card"><div className="settings-section-icon"><Icon lucide={Mail} size={16} /></div><div><strong>Contact support</strong><span>developer@justaquib.com</span></div></div>
      </section>
    </div>
    <PageFooter />
  </section>;
}
