import MainApp from "./pages/MainApp";
import FloatingWidget from "./widgets/FloatingWidget";
import AnnotationWidget from "./widgets/AnnotationWidget";
import RecordingSetupWindow from "./features/recording/RecordingSetupWindow";
import CountdownWidget from "./widgets/CountdownWidget";

export default function App() {
  const widget = new URLSearchParams(window.location.search).get("widget");
  if (widget === "setup") return <RecordingSetupWindow />;
  if (widget === "annotations") return <AnnotationWidget />;
  if (widget === "countdown") return <CountdownWidget />;
  if (widget === "camera" || widget === "controls") return <FloatingWidget kind={widget} />;
  return <MainApp />;
}
