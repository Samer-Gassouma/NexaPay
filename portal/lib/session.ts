/**
 * Session utilities for developer portal
 */

export interface DeveloperSession {
  developerApiKey?: string;
  developerApiKeyPrefix?: string;
  merchantKeys: Record<string, string>;
}

const SESSION_KEY = 'nexapay-dev-session';

/**
 * Get developer session from localStorage
 */
export function getDeveloperSession(): DeveloperSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;

    const parsed = JSON.parse(data);

    // Ensure backward compatibility
    return {
      developerApiKey: parsed.developerApiKey || '',
      developerApiKeyPrefix: parsed.developerApiKeyPrefix || '',
      merchantKeys: parsed.merchantKeys || {},
    };
  } catch (error) {
    console.error('Failed to parse developer session:', error);
    return null;
  }
}

/**
 * Save developer session to localStorage
 */
export function setDeveloperSession(session: DeveloperSession): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error('Failed to save developer session:', error);
  }
}

/**
 * Update developer session with a callback
 */
export function updateDeveloperSession(
  updater: (current: DeveloperSession | null) => DeveloperSession
): void {
  const current = getDeveloperSession();
  const updated = updater(current);
  setDeveloperSession(updated);
}

/**
 * Clear developer session from localStorage
 */
export function clearDeveloperSession(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error('Failed to clear developer session:', error);
  }
}

/**
 * Check if developer session exists
 */
export function hasDeveloperSession(): boolean {
  return getDeveloperSession() !== null;
}

/**
 * Get merchant key for a specific merchant
 */
export function getMerchantKey(merchantId: string): string | null {
  const session = getDeveloperSession();
  if (!session) return null;

  return session.merchantKeys[merchantId] || null;
}

/**
 * Set merchant key for a specific merchant
 */
export function setMerchantKey(merchantId: string, apiKey: string): void {
  updateDeveloperSession((current) => ({
    developerApiKey: current?.developerApiKey || '',
    developerApiKeyPrefix: current?.developerApiKeyPrefix || '',
    merchantKeys: {
      ...(current?.merchantKeys || {}),
      [merchantId]: apiKey,
    },
  }));
}

/**
 * Remove merchant key for a specific merchant
 */
export function removeMerchantKey(merchantId: string): void {
  updateDeveloperSession((current) => {
    if (!current) {
      return {
        developerApiKey: '',
        developerApiKeyPrefix: '',
        merchantKeys: {},
      };
    }

    const { [merchantId]: _, ...rest } = current.merchantKeys;

    return {
      ...current,
      merchantKeys: rest,
    };
  });
}
