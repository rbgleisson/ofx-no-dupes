import { createRoot } from "react-dom/client";
import "./index.css";
import { runBrowserStorageMaintenance } from "./lib/storageMaintenance";

runBrowserStorageMaintenance();

const root = createRoot(document.getElementById("root")!);

async function bootstrap() {
  const { default: App } = await import("./App.tsx");
  root.render(<App />);
}

bootstrap();
