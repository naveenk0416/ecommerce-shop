const DEVICE_ID_KEY = 'sa_device_id';

/**
 * A random id for this browser, sent as X-Device-Id so the backend can refuse referral rewards
 * between two accounts on the same device. Not a fingerprint — clearing site data resets it.
 */
export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}
