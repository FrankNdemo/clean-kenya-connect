import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration failures in environments where service workers are unavailable.
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
