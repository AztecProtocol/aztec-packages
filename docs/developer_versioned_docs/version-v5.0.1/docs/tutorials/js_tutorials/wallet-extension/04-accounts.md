---
title: "4. Account Management"
description: Key derivation, encrypted storage, and SchnorrAccountContract for Aztec wallet accounts
sidebar_position: 4
---

# Account Management

Aztec accounts are smart contracts with associated keys. This section covers how the wallet creates, stores, and manages accounts securely.

## Aztec Account Model

Unlike Ethereum's EOA model, Aztec accounts are:

1. **Smart contracts** - Each account is a deployed contract
2. **Abstracted** - Custom authentication logic (Schnorr, ECDSA, multisig, etc.)
3. **Key-based** - Derived from a secret key using standardized derivation

An Aztec account has:
- **Secret key** (`Fr`) - The root secret, never exposed
- **Signing key** (`GrumpkinScalar`) - Derived from secret, used for signatures
- **Public keys** - For viewing, tagging, and nullifying
- **Contract address** - Computed from keys and contract salt

## Key Derivation

The wallet generates a random signing key as the account's root and derives the privacy secret from it:

```typescript
import { GrumpkinScalar } from '@aztec/aztec.js/fields';
import { deriveSecretKeyFromSigningKey } from '@aztec/accounts/utils';

// The signing key is the account's root; the privacy secret is derived from it
const signingKey = GrumpkinScalar.random();
const secret = await deriveSecretKeyFromSigningKey(signingKey);
```

The nullifier, viewing, and tagging keys are then derived from that secret with SHA-512 and domain separators, while the signing key is supplied to the account contract directly:

```typescript
// From stdlib/src/keys/derivation.ts
export function deriveMasterIncomingViewingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, DomainSeparator.IVSK_M]);
}

export function deriveMasterNullifierHidingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, DomainSeparator.NHK_M]);
}
```

## SchnorrAccountContract

The wallet uses `SchnorrAccountContract` for authentication:

```typescript
import { SchnorrAccountContract } from '@aztec/accounts/schnorr/lazy';

const accountContract = new SchnorrAccountContract(signingKey);
```

This account contract:
- Verifies Schnorr signatures on transactions
- Is battle-tested and widely used
- Supports standard Aztec authorization patterns

The "lazy" import defers loading the Noir artifact until needed.

## Creating an Account

Account creation is handled by the `ExtensionWalletManager` utility class:

```typescript title="create-new-account" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/wallet/wallet-impl.ts#L61-L82" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/wallet/wallet-impl.ts#L61-L82</a></sub></sup>


Breaking this down:

1. **Generate secrets** - Random `Fr` for secret and salt via `Fr.random()`
2. **Compute address** - Uses the shared `instantiateAccount()` utility to derive keys and compute the contract address deterministically
3. **Encrypt and store** - Secret is encrypted with the master `CryptoKey` before storage
4. **Auto-activate** - The first account is automatically set as active

Note that PXE (Private eXecution Environment) registration happens separately - either when the user unlocks the wallet or when they deploy the account. This separation means account creation is fast (no PXE or network interaction required).

## Encrypted Key Storage

Keys are encrypted using PBKDF2 + AES-GCM with a non-extractable `CryptoKey`:

```typescript title="derive-master-key" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L58-L92" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L58-L92</a></sub></sup>


Key derivation parameters:
- **600,000 iterations** - OWASP 2023 recommendation for SHA-256, slows brute-force attacks
- **SHA-256** - Hash function for PBKDF2
- **AES-256-GCM** - Authenticated encryption
- **Non-extractable** - The derived `CryptoKey` cannot be read from JavaScript, even if an attacker has a reference to the object

Encryption and decryption use the derived `CryptoKey` directly - the raw password string is never stored or passed around:

```typescript title="encrypt-decrypt" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L94-L137" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L94-L137</a></sub></sup>


Each account gets a unique random IV for AES-GCM. The stored data includes:
- `encrypted` - The encrypted secret (base64)
- `iv` - AES-GCM IV, unique per account (base64)

## Storage Operations

The offscreen document cannot access `chrome.storage` directly, so all storage operations are proxied through the background script via Chrome messaging:

```typescript title="account-operations" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L263-L333" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L263-L333</a></sub></sup>


The stored account structure:

```typescript
interface StoredAccount {
  address: string;           // Aztec address (hex)
  encryptedSecret: string;   // Encrypted Fr (base64)
  iv: string;                // AES-GCM IV (base64)
  alias: string;             // User-friendly name
  isDeployed: boolean;       // Whether contract is deployed
  contractSalt: string;      // Contract deployment salt (hex)
}
```

## Password Management

Instead of storing a password hash (vulnerable to rainbow tables), the wallet uses an encrypt-then-verify approach: derive a `CryptoKey` via PBKDF2 with a random salt, encrypt a known plaintext, and verify by attempting to decrypt it:

```typescript title="password-management" showLineNumbers 
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
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L187-L261" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts#L187-L261</a></sub></sup>


This provides:
- `setupPassword()` - Derives a master key, encrypts a known plaintext for future verification, returns the `CryptoKey`
- `verifyAndDeriveMasterKey()` - Re-derives the key, tries to decrypt the known plaintext; returns the `CryptoKey` on success or `null` on failure
- `hasPassword()` - Checks if a master password has been set

The caller caches the `CryptoKey` in memory and discards the password string immediately.

## Loading Accounts

When the user unlocks the wallet, the extension verifies the password, derives the master `CryptoKey`, initializes PXE, and registers all stored accounts:

```typescript title="load-accounts" showLineNumbers 
/**
 * Unlocks the wallet: verifies password, caches CryptoKey, initializes PXE,
 * registers all stored accounts. (#1, #2)
 *
 * After unlock:
 * - cachedMasterKey holds the non-extractable CryptoKey
 * - The password string is discarded (goes out of scope)
 * - All accounts are registered with PXE and the BaseWallet
 */
async function handleUnlockWallet(password: string) {
  log.debug('[offscreen] Unlocking wallet...');

  reportProgress('Verifying password...');
  const { verifyAndDeriveMasterKey, hasPassword: checkHasPassword } = await import('../wallet/storage');

  if (await checkHasPassword()) {
    const masterKey = await verifyAndDeriveMasterKey(password);
    if (!masterKey) {
      throw new Error('Incorrect password');
    }
    cachedMasterKey = masterKey;
    // password string goes out of scope — only the CryptoKey survives
  } else {
    throw new Error('No password set. Please set up your wallet first.');
  }

  // Initialize PXE
  reportProgress('Initializing PXE (loading WASM)...');
  await ensurePXE();
  log.debug('[offscreen] PXE initialized for unlock');

  // Register all stored accounts
  const storedAccounts = await getAccounts();
  reportProgress(`Registering ${storedAccounts.length} account(s)...`);
  log.debug('[offscreen] Registering', storedAccounts.length, 'accounts with PXE');

  const failedAccounts: string[] = [];
  for (const account of storedAccounts) {
    try {
      const secretData = await getAccountSecret(account.address, cachedMasterKey);
      if (secretData) {
        await registerAccountInWallet(account.address, secretData.secret, secretData.salt);
        log.debug('[offscreen] Registered account:', account.address);
      }
    } catch (err: any) {
      log.error('[offscreen] Failed to register account:', account.address, err.message);
      failedAccounts.push(account.address);
      // Continue with remaining accounts — partial unlock is better than full lockout
    }
  }

  if (failedAccounts.length === storedAccounts.length && storedAccounts.length > 0) {
    // ALL accounts failed — password is likely wrong
    cachedMasterKey = null;
    throw new Error('Failed to unlock: wrong password or corrupted data');
  }
  if (failedAccounts.length > 0) {
    log.warn('[offscreen] Partial unlock:', failedAccounts.length, 'account(s) failed to register');
  }

  log.debug('[offscreen] Wallet unlocked,', storedAccounts.length - failedAccounts.length, 'of', storedAccounts.length, 'accounts registered');
  return { success: true };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L601-L665" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L601-L665</a></sub></sup>


Each account:
1. Has its secret decrypted using the master `CryptoKey`
2. Gets its keys derived and contract instantiated via `instantiateAccount()`
3. Is registered with PXE (contract instance, artifact, and secret key)
4. Gets an `AccountManager` created and account registered with the `OffscreenWallet`

## Deploying Accounts

Accounts must be deployed before they can receive notes or initiate transactions:

```typescript title="deploy-account" showLineNumbers 
/**
 * Deploys an account contract onchain using SponsoredFPC for fee payment.
 * Uses the cached master CryptoKey to decrypt the account secret. (#2, #4)
 */
async function handleDeployAccount(address: string) {
  const masterKey = getCachedMasterKey();
  log.debug('[offscreen] Deploying account:', address);

  // 1. Decrypt the account secret
  reportProgress('Decrypting account secret...');
  const secretData = await getAccountSecret(address, masterKey);
  if (!secretData) {
    throw new Error(`Account not found: ${address}`);
  }

  // 2. Ensure PXE is initialized (needed by the wallet)
  reportProgress('Connecting to PXE...');
  await ensurePXE();

  // 3. Register account with PXE and wallet (shared with unlock flow)
  reportProgress('Registering account contract...');
  const { accountManager } = await registerAccountInWallet(address, secretData.secret, secretData.salt);

  // 4. Register SponsoredFPC contract with PXE (shared helper)
  reportProgress('Registering fee payment contract...');
  const { AztecAddress, SponsoredFeePaymentMethod, SponsoredFPCContract } = await getAztecDeploy();
  const sponsoredFPCInstance = await getSponsoredFPCInstance();
  const wallet = await getWallet();
  await wallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);

  // 5. Deploy with SponsoredFPC fee payment.
  //    PXE log matchers (PXE_STAGE_MATCHERS) provide granular progress updates
  //    (simulating → proving → proof generated → sending → awaiting confirmation).
  reportProgress('Starting deploy tx...');

  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPCInstance.address);
  const deployMethod = await accountManager.getDeployMethod();
  const receipt = await deployMethod.send({
    from: AztecAddress.ZERO,
    fee: { paymentMethod },
    wait: { timeout: 2400 },
  });

  // 6. Mark deployed in storage
  await markDeployed(address);
  reportProgress('Deploy complete!');

  log.debug('[offscreen] Account deployed:', address, 'txHash:', receipt.txHash?.toString());
  return { success: true, txHash: receipt.txHash?.toString() };
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L548-L599" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L548-L599</a></sub></sup>


The deployment:
1. Gets the cached master `CryptoKey` (wallet must be unlocked)
2. Decrypts the account secret
3. Instantiates the account contract with derived keys
4. Initializes PXE and registers the account
5. Registers SponsoredFPC for fee payment
6. Deploys via `AccountManager.getDeployMethod()` with `SponsoredFeePaymentMethod`
7. Uses a heartbeat interval to keep the service worker alive during the long-running proof generation
8. Marks the account as deployed in storage

## Account Registration with PXE

For PXE to track notes for an account, the extension registers the contract instance, artifact, and secret key. This is handled by the shared `registerAccountInWallet()` function:

```typescript
async function registerAccountInWallet(address, secret, salt) {
  const { secretFr, saltFr, accountContract, artifact, instance } =
    await instantiateAccount(secret, salt);

  const wallet = await getWallet();
  await wallet.registerContract(instance, artifact, secretFr);

  const accountManager = await AccountManager.create(wallet, secretFr, accountContract, saltFr);
  const account = await accountManager.getAccount();
  wallet.registerAccount(address, account);
}
```

Registration includes:
- **Contract instance** - Address, class, initialization args
- **Artifact** - The Noir contract artifact for simulation
- **Secret key** - For note decryption

## Account Recovery

Since the wallet stores:
- Encrypted secret
- Contract salt

Users can recover accounts by:
1. Entering their password
2. Decrypting the secret
3. Recomputing the account address (deterministic)

The account address is derived from:
- Public keys (from secret)
- Contract class ID (SchnorrAccountContract)
- Contract salt

## Security Considerations

The tutorial wallet implements several security best practices:

1. **Non-extractable CryptoKey** - The master key cannot be read from JavaScript
2. **600,000 PBKDF2 iterations** - Follows OWASP 2023 recommendations
3. **Per-account random IV** - Each account uses a unique AES-GCM initialization vector
4. **Auto-lock** - The wallet clears the cached key after 15 minutes of inactivity
5. **Secure random** - Uses `crypto.getRandomValues()` and `Fr.random()` (CSPRNG)

For a production wallet, also consider:
- Hardware security modules or platform keychain APIs
- Seed phrase support for backup and restore
- Memory protection (zeroing secrets after use)

## Next Steps

With accounts created and stored, let's handle [Transaction Handling](./05-transactions.md) - the signing and proof generation flow.
