import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations.map(async (registration) => {
            await registration.unregister();
          })
        )
      )
      .then(async () => {
        if (!("caches" in window)) return;
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("mtaka-app"))
            .map((key) => caches.delete(key))
        );
      })
      .catch(() => {
        // Ignore cleanup failures in environments where service workers are unavailable.
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
