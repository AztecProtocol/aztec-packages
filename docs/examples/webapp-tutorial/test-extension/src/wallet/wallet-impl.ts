/**
 * Wallet implementation for the Aztec Tutorial Wallet extension.
 *
 * With the crossOriginIsolated monkey-patch, Barretenberg WASM works in Chrome
 * extension offscreen documents. This allows full cryptographic operations:
 * - Fr.random() for secure random field elements
 * - deriveKeys() and deriveSecretKeyFromSigningKey() for key derivation
 * - Address computation with SchnorrAccountContract
 *
 * All encryption uses a non-extractable CryptoKey — the raw password
 * is never stored or passed around after initial derivation. (#2)
 */

import { Fr, GrumpkinScalar } from "@aztec/aztec.js/fields";

import { instantiateAccount } from "../account-utils";
import type { PublicAccountInfo } from "../shared-types";
import {
  type StoredAccount,
  getStoredAccounts,
  getStoredAccount,
  saveAccount,
  encryptWithKey,
  decryptWithKey,
  markAccountDeployed,
  getActiveAccount,
  setActiveAccount,
} from "./storage";
import { log } from "../config";

/**
 * Generates a new secret and salt for account creation using real Aztec primitives.
 * Uses Fr.random() which is cryptographically secure via Barretenberg.
 */
export function generateSecret(): { secret: string; salt: string } {
  log.debug("[wallet-manager] Generating new signing key and salt...");
  // The account's root is its signing key; the privacy secret is derived from it in instantiateAccount.
  const secret = GrumpkinScalar.random().toString();
  const salt = Fr.random().toString();
  return { secret, salt };
}

/**
 * Computes the account address from a secret and salt.
 * Runs in the extension offscreen document where Barretenberg works.
 */
export async function computeAddress(
  secretHex: string,
  saltHex: string,
): Promise<string> {
  log.debug("[wallet-manager] Computing address...");
  const { instance } = await instantiateAccount(secretHex, saltHex);
  log.debug("[wallet-manager] Computed address:", instance.address.toString());
  return instance.address.toString();
}

/**
 * Creates a complete account: generates secret/salt, computes address, and stores encrypted.
 * Takes a CryptoKey (not a password string) for encryption. (#2)
 */
// docs:start:create-new-account
export async function createAccount(
  masterKey: CryptoKey,
  alias: string = "",
): Promise<{ address: string; secret: string; salt: string }> {
  log.debug("[wallet-manager] Creating account...");

  const { secret, salt } = generateSecret();
  const address = await computeAddress(secret, salt);
  await storeAccount(address, secret, salt, masterKey, alias);

  // Auto-set as active if this is the first account
  const currentActive = await getActiveAccount();
  if (!currentActive) {
    await setActiveAccount(address);
    log.debug("[wallet-manager] Set as active account (first account)");
  }

  log.debug("[wallet-manager] Account created:", address);
  return { address, secret, salt };
}
// docs:end:create-new-account

/**
 * Stores an account with encrypted secret.
 * Uses the master CryptoKey for AES-GCM encryption with a per-account random IV.
 */
export async function storeAccount(
  address: string,
  secret: string,
  salt: string,
  masterKey: CryptoKey,
  alias: string = "",
): Promise<void> {
  log.debug("[wallet-manager] Storing account:", address);

  const { encrypted, iv } = await encryptWithKey(secret, masterKey);

  const storedAccount: StoredAccount = {
    address,
    encryptedSecret: encrypted,
    iv,
    alias,
    isDeployed: false,
    contractSalt: salt,
  };

  await saveAccount(storedAccount);
  log.debug("[wallet-manager] Account stored successfully");
}

/**
 * Gets the decrypted secret for an account.
 * Takes a CryptoKey (not a password string). (#2)
 */
export async function getAccountSecret(
  address: string,
  masterKey: CryptoKey,
): Promise<{ secret: string; salt: string } | null> {
  const stored = await getStoredAccount(address);
  if (!stored) {
    return null;
  }

  const secret = await decryptWithKey(
    stored.encryptedSecret,
    stored.iv,
    masterKey,
  );

  return {
    secret,
    salt: stored.contractSalt,
  };
}

/**
 * Gets all stored accounts (without secrets).
 */
export async function getAccounts(): Promise<PublicAccountInfo[]> {
  const accounts = await getStoredAccounts();
  return accounts.map((acc) => ({
    address: acc.address,
    alias: acc.alias,
    isDeployed: acc.isDeployed,
  }));
}

/**
 * Marks an account as deployed.
 */
export async function markDeployed(address: string): Promise<void> {
  await markAccountDeployed(address);
}

// Re-export storage functions for convenience
export { getActiveAccount, setActiveAccount };
