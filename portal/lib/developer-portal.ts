export type DeveloperProfile = {
  developer_id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string | null;
  plan: string;
  call_limit: number;
  monthly_calls: number;
  created_at: string;
};

export type DeveloperPortalSession = {
  sessionToken: string;
  developer: DeveloperProfile;
  developerApiKey?: string;
  developerApiKeyPrefix?: string;
  merchantKeys: Record<string, string>;
};

const STORAGE_KEY = "nexapay_dev_portal_session_v1";

function isBrowser() {
  return typeof window !== "undefined";
}

export function readDeveloperSession(): DeveloperPortalSession | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DeveloperPortalSession>;
    if (!parsed.sessionToken || !parsed.developer) return null;

    return {
      sessionToken: parsed.sessionToken,
      developer: parsed.developer,
      developerApiKey: parsed.developerApiKey,
      developerApiKeyPrefix: parsed.developerApiKeyPrefix,
      merchantKeys: parsed.merchantKeys ?? {},
    };
  } catch (_err) {
    return null;
  }
}

export function writeDeveloperSession(session: DeveloperPortalSession) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearDeveloperSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function updateDeveloperSession(
  updater: (current: DeveloperPortalSession | null) => DeveloperPortalSession | null,
) {
  const next = updater(readDeveloperSession());
  if (!next) {
    clearDeveloperSession();
    return;
  }
  writeDeveloperSession(next);
}
