/**
 * Encrypted key storage for the Aztec Tutorial Wallet.
 *
 * Security design:
 * - Master password is NEVER stored or cached as a string (#2)
 * - Password verification uses PBKDF2 + AES-GCM (encrypt known plaintext) (#1)
 * - A non-extractable CryptoKey is derived once at unlock and cached in memory
 * - All account secrets are encrypted with this master CryptoKey
 * - Each account gets a unique random IV for AES-GCM
 *
 * WARNING: This is for tutorial purposes. Production wallets should use
 * hardware security modules, secure enclaves, or platform keychain APIs.
 */

/** Known plaintext used to verify the master password is correct */
const VERIFICATION_PLAINTEXT = 'aztec-wallet-verify';

/**
 * PBKDF2 iteration count.
 * OWASP 2023 recommends >= 600,000 for SHA-256.
 * Higher = slower brute force, but also slower unlock.
 */
const PBKDF2_ITERATIONS = 600_000;

/** Stored account data structure */
export interface StoredAccount {
  /** Aztec address as hex string */
  address: string;
  /** Encrypted secret key (base64 encoded) */
  encryptedSecret: string;
  /** IV for AES-GCM (base64 encoded) — unique per account */
  iv: string;
  /** User-friendly alias */
  alias: string;
  /** Whether the account contract is deployed */
  isDeployed: boolean;
  /** Account contract salt as hex string */
  contractSalt: string;
}

/** Storage keys — shared with background.ts for direct chrome.storage access. */
export const STORAGE_KEYS = {
  ACCOUNTS: 'aztec_accounts',
  PASSWORD_DATA: 'aztec_password_data',
  ACTIVE_ACCOUNT: 'aztec_active_account',
} as const;

/** Encode bytes to base64 */
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/** Decode base64 to bytes */
function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// docs:start:derive-master-key
/**
 * Derives a non-extractable AES-GCM CryptoKey from a password and salt using PBKDF2.
 *
 * The key is non-extractable: once created, the raw key material cannot be read
 * from JavaScript. This means even if an attacker has a reference to the CryptoKey
 * object, they cannot extract the underlying bytes.
 */
export async function deriveMasterKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    ['encrypt', 'decrypt']
  );
}
// docs:end:derive-master-key

// docs:start:encrypt-decrypt
/**
 * Encrypts a secret using a CryptoKey.
 * Each call generates a fresh random IV for AES-GCM.
 */
export async function encryptWithKey(
  secret: string,
  key: CryptoKey
): Promise<{ encrypted: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(secret)
  );

  return {
    encrypted: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypts a secret using a CryptoKey.
 */
export async function decryptWithKey(
  encrypted: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const ivBytes = base64ToBytes(iv);
  const ciphertextBytes = base64ToBytes(encrypted);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    ciphertextBytes
  );

  return new TextDecoder().decode(decrypted);
}
// docs:end:encrypt-decrypt

import { getChromeRuntime } from '../utils';

/**
 * Chrome runtime for messaging (available in offscreen documents).
 * Offscreen documents don't have direct chrome.storage access,
 * so all storage operations are proxied through the background script.
 */

/**
 * Storage operations are proxied through the background script because
 * offscreen documents have limited chrome API access (no chrome.storage).
 */
const STORAGE_PROXY_TIMEOUT_MS = 30_000; // 30 seconds

async function storageGet(key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Storage proxy timed out')), STORAGE_PROXY_TIMEOUT_MS);
    getChromeRuntime().runtime.sendMessage(
      { type: 'storage-get', key },
      (response: any) => {
        clearTimeout(timer);
        if (response?.success) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || 'Storage get failed'));
        }
      }
    );
  });
}

async function storageSet(data: Record<string, any>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Storage proxy timed out')), STORAGE_PROXY_TIMEOUT_MS);
    getChromeRuntime().runtime.sendMessage(
      { type: 'storage-set', data },
      (response: any) => {
        clearTimeout(timer);
        if (response?.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Storage set failed'));
        }
      }
    );
  });
}

// docs:start:password-management
/**
 * Sets the master password for the first time. (#1)
 *
 * Instead of storing an unsalted SHA-256 hash (vulnerable to rainbow tables),
 * we derive a CryptoKey via PBKDF2 with a random salt, then encrypt a known
 * plaintext. Verification = re-derive key + try to decrypt.
 *
 * Returns the derived master CryptoKey so the caller can cache it immediately.
 */
export async function setupPassword(password: string): Promise<CryptoKey> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const masterKey = await deriveMasterKey(password, salt);

  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    encoder.encode(VERIFICATION_PLAINTEXT)
  );

  await storageSet({
    [STORAGE_KEYS.PASSWORD_DATA]: {
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      verifier: bytesToBase64(new Uint8Array(ciphertext)),
    },
  });

  return masterKey;
}

/**
 * Verifies the password and returns the derived master CryptoKey. (#1, #2)
 *
 * If the password is correct, returns the non-extractable CryptoKey.
 * If wrong, returns null (AES-GCM decryption fails with wrong key).
 * The caller should cache the CryptoKey and discard the password string.
 */
export async function verifyAndDeriveMasterKey(password: string): Promise<CryptoKey | null> {
  const data = await storageGet(STORAGE_KEYS.PASSWORD_DATA);
  if (!data) return null;

  const salt = base64ToBytes(data.salt);
  const iv = base64ToBytes(data.iv);
  const verifier = base64ToBytes(data.verifier);

  const masterKey = await deriveMasterKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      masterKey,
      verifier
    );
    const decoded = new TextDecoder().decode(decrypted);
    if (decoded === VERIFICATION_PLAINTEXT) {
      return masterKey;
    }
    return null;
  } catch {
    // AES-GCM decryption throws on wrong key (authentication tag mismatch)
    return null;
  }
}

/**
 * Checks if a master password has been set.
 */
export async function hasPassword(): Promise<boolean> {
  const data = await storageGet(STORAGE_KEYS.PASSWORD_DATA);
  return !!data;
}
// docs:end:password-management

// docs:start:account-operations
/**
 * Saves an account to storage.
 */
export async function saveAccount(account: StoredAccount): Promise<void> {
  const accounts = await getStoredAccounts();
  const existingIndex = accounts.findIndex((a) => a.address === account.address);

  if (existingIndex >= 0) {
    accounts[existingIndex] = account;
  } else {
    accounts.push(account);
  }

  await storageSet({ [STORAGE_KEYS.ACCOUNTS]: accounts });
}

/**
 * Retrieves all stored accounts.
 */
export async function getStoredAccounts(): Promise<StoredAccount[]> {
  const result = await storageGet(STORAGE_KEYS.ACCOUNTS);
  return result || [];
}

/**
 * Gets a specific account by address.
 */
export async function getStoredAccount(
  address: string
): Promise<StoredAccount | undefined> {
  const accounts = await getStoredAccounts();
  return accounts.find((a) => a.address === address);
}

/**
 * Updates an account's deployment status.
 */
export async function markAccountDeployed(address: string): Promise<void> {
  const accounts = await getStoredAccounts();
  const account = accounts.find((a) => a.address === address);
  if (account) {
    account.isDeployed = true;
    await storageSet({ [STORAGE_KEYS.ACCOUNTS]: accounts });
  }
}

/**
 * Removes an account from storage.
 */
export async function removeAccount(address: string): Promise<void> {
  const accounts = await getStoredAccounts();
  const filtered = accounts.filter((a) => a.address !== address);
  await storageSet({ [STORAGE_KEYS.ACCOUNTS]: filtered });
}

/**
 * Gets the active account address.
 */
export async function getActiveAccount(): Promise<string | null> {
  const result = await storageGet(STORAGE_KEYS.ACTIVE_ACCOUNT);
  return result || null;
}

/**
 * Sets the active account address.
 */
export async function setActiveAccount(address: string): Promise<void> {
  await storageSet({ [STORAGE_KEYS.ACTIVE_ACCOUNT]: address });
}
// docs:end:account-operations
