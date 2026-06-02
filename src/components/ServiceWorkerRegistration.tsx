"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    let reloadingForUpdate = false;
    const hadController = Boolean(navigator.serviceWorker.controller);

    function activateWaitingWorker(registration: ServiceWorkerRegistration) {
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    }

    function handleControllerChange() {
      if (!hadController || reloadingForUpdate) {
        return;
      }

      reloadingForUpdate = true;
      window.location.reload();
    }

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => {
        activateWaitingWorker(registration);

        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;

          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        return registration.update();
      })
      .catch((error) => {
        console.error("Service worker registration failed:", error);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  return null;
}
