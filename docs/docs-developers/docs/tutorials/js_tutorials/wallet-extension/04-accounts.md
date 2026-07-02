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

The wallet uses the standard derivation from `@aztec/stdlib/keys`:

```typescript
import { deriveSigningKey } from '@aztec/stdlib/keys';

// Generate a random secret
const secret = Fr.random();

// Derive the signing key
const signingKey = deriveSigningKey(secret);
```

The derivation uses SHA-512 with domain separators to derive different keys:

```typescript
// From stdlib/src/keys/derivation.ts
export function deriveSigningKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.IVSK_M]);
}

export function deriveMasterNullifierHidingSecretKey(secretKey: Fr): GrumpkinScalar {
  return sha512ToGrumpkinScalar([secretKey, GeneratorIndex.NHK_M]);
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

#include_code create-new-account docs/examples/webapp-tutorial/test-extension/src/wallet/wallet-impl.ts typescript

Breaking this down:

1. **Generate secrets** - Random `Fr` for secret and salt via `Fr.random()`
2. **Compute address** - Uses the shared `instantiateAccount()` utility to derive keys and compute the contract address deterministically
3. **Encrypt and store** - Secret is encrypted with the master `CryptoKey` before storage
4. **Auto-activate** - The first account is automatically set as active

Note that PXE (Private eXecution Environment) registration happens separately - either when the user unlocks the wallet or when they deploy the account. This separation means account creation is fast (no PXE or network interaction required).

## Encrypted Key Storage

Keys are encrypted using PBKDF2 + AES-GCM with a non-extractable `CryptoKey`:

#include_code derive-master-key docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts typescript

Key derivation parameters:
- **600,000 iterations** - OWASP 2023 recommendation for SHA-256, slows brute-force attacks
- **SHA-256** - Hash function for PBKDF2
- **AES-256-GCM** - Authenticated encryption
- **Non-extractable** - The derived `CryptoKey` cannot be read from JavaScript, even if an attacker has a reference to the object

Encryption and decryption use the derived `CryptoKey` directly - the raw password string is never stored or passed around:

#include_code encrypt-decrypt docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts typescript

Each account gets a unique random IV for AES-GCM. The stored data includes:
- `encrypted` - The encrypted secret (base64)
- `iv` - AES-GCM IV, unique per account (base64)

## Storage Operations

The offscreen document cannot access `chrome.storage` directly, so all storage operations are proxied through the background script via Chrome messaging:

#include_code account-operations docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts typescript

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

#include_code password-management docs/examples/webapp-tutorial/test-extension/src/wallet/storage.ts typescript

This provides:
- `setupPassword()` - Derives a master key, encrypts a known plaintext for future verification, returns the `CryptoKey`
- `verifyAndDeriveMasterKey()` - Re-derives the key, tries to decrypt the known plaintext; returns the `CryptoKey` on success or `null` on failure
- `hasPassword()` - Checks if a master password has been set

The caller caches the `CryptoKey` in memory and discards the password string immediately.

## Loading Accounts

When the user unlocks the wallet, the extension verifies the password, derives the master `CryptoKey`, initializes PXE, and registers all stored accounts:

#include_code load-accounts docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

Each account:
1. Has its secret decrypted using the master `CryptoKey`
2. Gets its keys derived and contract instantiated via `instantiateAccount()`
3. Is registered with PXE (contract instance, artifact, and secret key)
4. Gets an `AccountManager` created and account registered with the `OffscreenWallet`

## Deploying Accounts

Accounts must be deployed before they can receive notes or initiate transactions:

#include_code deploy-account docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

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
