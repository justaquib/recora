import MainApp from "./pages/MainApp";
import FloatingWidget from "./widgets/FloatingWidget";
import AnnotationWidget from "./widgets/AnnotationWidget";
import RecordingSetupWindow from "./features/recording/RecordingSetupWindow";

export default function App() {
  const widget = new URLSearchParams(window.location.search).get("widget");
  if (widget === "setup") return <RecordingSetupWindow />;
  if (widget === "annotations") return <AnnotationWidget />;
  if (widget === "camera" || widget === "controls" || widget === "home") return <FloatingWidget kind={widget} />;
  return <MainApp />;
}
