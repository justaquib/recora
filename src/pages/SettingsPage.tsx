import PageFooter from "../components/PageFooter";
import { User, SlidersHorizontal, HelpCircle } from "lucide-react";

export default function SettingsPage() {
  return (
    <section className="library-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SETTINGS</div>
          <h1>Settings</h1>
          <p>Manage your account, preferences, and help.</p>
        </div>
      </div>
      <div className="storage-card save-location-card" style={{ maxWidth: 480 }}>
        <div className="storage-top"><User size={14} /><span>Account</span></div>
        <div className="storage-note">Personal workspace</div>
      </div>
      <div className="storage-card save-location-card" style={{ maxWidth: 480, marginTop: 12 }}>
        <div className="storage-top"><SlidersHorizontal size={14} /><span>Preferences</span></div>
        <div className="storage-note">Theme and notifications</div>
      </div>
      <div className="storage-card save-location-card" style={{ maxWidth: 480, marginTop: 12 }}>
        <div className="storage-top"><HelpCircle size={14} /><span>Help</span></div>
        <div className="storage-note">Documentation and support</div>
      </div>
      <PageFooter />
    </section>
  );
}
