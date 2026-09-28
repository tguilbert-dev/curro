import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

/**
 * Offers a new version instead of reloading on its own, so an update can never wipe
 * something half-typed. Also checks for updates hourly while the app stays open.
 */
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => registration.update().catch(() => {}), HOUR);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-bar" role="status">
      <span>A new version of Curro is ready.</span>
      <span className="spacer" />
      <button className="btn small ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
      <button className="btn small primary" onClick={() => updateServiceWorker(true)}>
        Reload
      </button>
    </div>
  );
}
