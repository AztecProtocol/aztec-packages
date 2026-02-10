# @aztec/wallet-sdk

Version: v3.0.0-devnet.6-patch.1

## Quick Import Reference

```typescript
import {
  BaseWallet,
  ExtensionProvider,
  ExtensionWallet,
  WalletManager,
  decrypt,
  // ... and more
} from '@aztec/wallet-sdk';
```

## Classes

### BaseWallet

A base class for Wallet implementations
Implements: `Wallet`

**Constructor**
```typescript
new BaseWallet(pxe: PXE, aztecNode: AztecNode)
```

**Properties**
- `readonly aztecNode: AztecNode`
- `baseFeePadding: number`
- `cancellableTransactions: boolean`
- `log: Logger`
- `readonly pxe: PXE`

**Methods**
- `batch<T extends readonly BatchedMethod<"registerContract" | "sendTx" | "registerSender" | "simulateUtility" | "simulateTx">[]>(methods: T) => Promise<BatchResults<T>>`
- `completeFeeOptions(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<FeeOptions>` - Completes partial user-provided fee options with wallet defaults.
- `completeFeeOptionsForEstimation(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<{ accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions; gasSettings: GasSettings; walletFeePaymentMethod?: FeePaymentMethod }>` - Completes partial user-provided fee options with unreasonably high gas limits for gas estimation. Uses the same logic as completeFeeOptions but sets high limits to avoid running out of gas during estimation.
- `contextualizeError(err: Error, ...context: string[]) => Error`
- `createAuthWit(from: AztecAddress, messageHashOrIntent: Fr | IntentInnerHash | CallIntent) => Promise<AuthWitness>`
- `createTxExecutionRequestFromPayloadAndFee(executionPayload: ExecutionPayload, from: AztecAddress, feeOptions: FeeOptions) => Promise<TxExecutionRequest>`
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<Aliased<AztecAddress>[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>` - Returns the list of aliased contacts associated with the wallet. This base implementation directly returns PXE's senders, but note that in general contacts are a superset of senders. - Senders: Addresses we check during synching in case they sent us notes, - Contacts: more general concept akin to a phone's contact list.
- `getChainInfo() => Promise<ChainInfo>`
- `getContractClassMetadata(id: Fr, includeArtifact?: boolean) => Promise<ContractClassMetadata>`
- `getContractMetadata(address: AztecAddress) => Promise<ContractMetadata>`
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `getTxReceipt(txHash: TxHash) => Promise<TxReceipt>`
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `registerContract(instance: ContractInstanceWithAddress, artifact?: ContractArtifact, secretKey?: Fr) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, _alias?: string) => Promise<AztecAddress>`
- `sendTx(executionPayload: ExecutionPayload, opts: SendOptions) => Promise<TxHash>`
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResult>`
- `simulateUtility(call: FunctionCall, authwits?: AuthWitness[]) => Promise<UtilitySimulationResult>`

### ExtensionProvider

Provider for discovering Aztec wallet extensions. This class handles the discovery phase of wallet communication: 1. Broadcasts a discovery request with the dApp's public key 2. Receives responses from installed wallets with their public keys 3. Derives shared secrets and computes verification hashes 4. Returns discovered wallets with their secure channel components

**Constructor**
```typescript
new ExtensionProvider()
```

**Methods**
- `static discoverExtensions(chainInfo: ChainInfo, timeout?: number) => Promise<DiscoveredWallet[]>` - Discovers all installed Aztec wallet extensions and establishes secure channel components. This method: 1. Generates an ECDH key pair for this discovery session 2. Broadcasts a discovery request with the dApp's public key 3. Receives responses from wallets with their public keys and MessagePorts 4. Derives shared secrets and computes verification hashes

### ExtensionWallet

A wallet implementation that communicates with browser extension wallets using a secure encrypted MessageChannel. This class uses a pre-established secure channel from the discovery phase: 1. **MessageChannel**: A private communication channel created during discovery, not visible to other scripts on the page (unlike window.postMessage). 2. **ECDH Key Exchange**: The shared secret was derived during discovery using Elliptic Curve Diffie-Hellman key exchange. 3. **AES-GCM Encryption**: All messages are encrypted using AES-256-GCM, providing both confidentiality and authenticity.

**Methods**
- `static create(walletInfo: WalletInfo, chainInfo: ChainInfo, port: MessagePort, sharedKey: CryptoKey, appId: string) => ExtensionWallet` - Creates an ExtensionWallet instance that communicates with a browser extension over a secure encrypted MessageChannel.
- `disconnect() => Promise<void>` - Disconnects from the wallet and cleans up resources. This method notifies the wallet extension that the session is ending, allowing it to clean up its state. After calling this method, the wallet instance can no longer be used and any pending requests will be rejected.
- `getWallet() => Wallet` - Returns a Wallet interface that proxies all method calls through the secure channel. The returned Wallet can be used directly by dApps - all method calls are automatically encrypted and sent to the wallet extension.
- `isDisconnected() => boolean` - Returns whether the wallet has been disconnected.
- `onDisconnect(callback: DisconnectCallback) => () => void` - Registers a callback to be invoked when the wallet disconnects.

### WalletManager

Manager for wallet discovery, configuration, and connection

**Methods**
- `static configure(config: WalletManagerConfig) => WalletManager` - Configures the WalletManager with provider settings
- `getAvailableWallets(options: DiscoverWalletsOptions) => Promise<WalletProvider[]>` - Discovers all available wallets for a given chain and version. Only returns wallets that support the requested chain and version.

## Interfaces

### DiscoverWalletsOptions

Options for discovering wallets

**Properties**
- `chainInfo: ChainInfo` - Chain information to filter by
- `timeout?: number` - Discovery timeout in milliseconds

### DiscoveredWallet

A discovered wallet with its secure channel components. Returned by ExtensionProvider.discoverExtensions.

**Properties**
- `info: WalletInfo` - Basic wallet information (id, name, icon, version, publicKey, verificationHash)
- `port: MessagePort` - The MessagePort for private communication with the wallet
- `sharedKey: CryptoKey` - The derived AES-256-GCM shared key for encryption

### DiscoveryRequest

Discovery message for finding installed wallets (public, unencrypted)

**Properties**
- `chainInfo: ChainInfo` - Chain information to check if wallet supports this network
- `publicKey: ExportedPublicKey` - dApp's ECDH public key for deriving shared secret
- `requestId: string` - Request ID
- `type: DISCOVERY` - Message type for discovery

### DiscoveryResponse

Discovery response from a wallet (public, unencrypted)

**Properties**
- `requestId: string` - Request ID matching the discovery request
- `type: DISCOVERY_RESPONSE` - Message type for discovery response
- `walletInfo: WalletInfo` - Wallet information

### EncryptedPayload

Encrypted message payload containing ciphertext and initialization vector. Both fields are base64-encoded for safe transmission as JSON.

**Properties**
- `ciphertext: string` - Ciphertext (base64 encoded)
- `iv: string` - Initialization vector (base64 encoded, 12 bytes)

### ExportedPublicKey

Exported public key in JWK format for transmission over untrusted channels. Contains only the public components of an ECDH P-256 key, safe to share.

**Properties**
- `crv: string` - Curve name - always "P-256"
- `kty: string` - Key type - always "EC" for elliptic curve
- `x: string` - X coordinate (base64url encoded)
- `y: string` - Y coordinate (base64url encoded)

### ExtensionWalletConfig

Configuration for extension wallets

**Properties**
- `allowList?: string[]` - Optional list of allowed extension IDs (whitelist)
- `blockList?: string[]` - Optional list of blocked extension IDs (blacklist)
- `enabled: boolean` - Whether extension wallets are enabled

### SecureKeyPair

ECDH key pair for secure communication. The private key should never be exported or transmitted. The public key can be exported via exportPublicKey for exchange.

**Properties**
- `privateKey: CryptoKey` - Private key - keep secret, used for key derivation
- `publicKey: CryptoKey` - Public key - safe to share

### WalletInfo

Information about an installed Aztec wallet

**Properties**
- `icon?: string` - URL to the wallet's icon
- `id: string` - Unique identifier for the wallet
- `name: string` - Display name of the wallet
- `publicKey: ExportedPublicKey` - Wallet's ECDH public key for secure channel establishment
- `verificationHash?: string` - Hash of the shared secret for anti-MITM verification. Both dApp and wallet independently compute this from the ECDH shared secret. Use hashToEmoji to convert to a visual representation for user verification.
- `version: string` - Wallet version

### WalletManagerConfig

Configuration for the WalletManager

**Properties**
- `extensions?: ExtensionWalletConfig` - Extension wallet configuration
- `webWallets?: WebWalletConfig` - Web wallet configuration

### WalletMessage

Message format for wallet communication (internal, before encryption)

**Properties**
- `appId: string` - Application ID making the request
- `args: unknown[]` - Arguments for the method
- `chainInfo: ChainInfo` - Chain information
- `messageId: string` - Unique message ID for tracking responses
- `type: string` - The wallet method to call
- `walletId: string` - Wallet ID to target a specific wallet

### WalletProvider

A wallet provider that can connect to create a wallet instance. Chain information is already baked in from the discovery process.

**Properties**
- `icon?: string` - Icon URL
- `id: string` - Unique identifier for the provider
- `metadata?: Record<string, unknown>` - Additional metadata
- `name: string` - Display name
- `type: WalletProviderType` - Type of wallet provider

**Methods**
- `connect(appId: string) => Promise<Wallet>` - Connect to this wallet provider with an application ID
- `disconnect() => Promise<void>` - Disconnects the current wallet and cleans up resources. After calling this, the wallet returned from connect() should no longer be used.
- `isDisconnected() => boolean` - Returns whether the provider's wallet connection has been disconnected.
- `onDisconnect(callback: ProviderDisconnectionCallback) => () => void` - Registers a callback to be invoked when the wallet disconnects unexpectedly.

### WalletResponse

Response message from wallet

**Properties**
- `error?: unknown` - Error data (if failed)
- `messageId: string` - Message ID matching the request
- `result?: unknown` - Result data (if successful)
- `walletId: string` - Wallet ID that sent the response

### WebWalletConfig

Configuration for web wallets

**Properties**
- `urls: string[]` - URLs of web wallet services

## Functions

### decrypt
```typescript
function decrypt<T>(key: CryptoKey, payload: EncryptedPayload) => Promise<T>
```
Decrypts data using AES-256-GCM. The decrypted data is JSON parsed before returning.

### deriveSharedKey
```typescript
function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey) => Promise<CryptoKey>
```
Derives a shared AES-256-GCM key from ECDH key exchange. Both parties will derive the same shared key when using their own private key and the other party's public key. This is the core of ECDH key agreement.

### encrypt
```typescript
function encrypt(key: CryptoKey, data: unknown) => Promise<EncryptedPayload>
```
Encrypts data using AES-256-GCM. The data is JSON serialized before encryption. A random 12-byte IV is generated for each encryption operation. AES-GCM provides both confidentiality and authenticity - any tampering with the ciphertext will cause decryption to fail.

### exportPublicKey
```typescript
function exportPublicKey(publicKey: CryptoKey) => Promise<ExportedPublicKey>
```
Exports a public key to JWK format for transmission. The exported key contains only public components and is safe to transmit over untrusted channels.

### generateKeyPair
```typescript
function generateKeyPair() => Promise<SecureKeyPair>
```
Generates an ECDH P-256 key pair for key exchange. The generated key pair can be used to derive a shared secret with another party's public key using deriveSharedKey.

### hashSharedSecret
```typescript
function hashSharedSecret(sharedKey: CryptoKey) => Promise<string>
```
Hashes a shared AES key to a hex string for verification. This extracts the raw key material and hashes it with SHA-256, returning the first 16 bytes as a hex string.

### hashToEmoji
```typescript
function hashToEmoji(hash: string, length?: number) => string
```
Converts a hex hash to an emoji sequence for visual verification. This is used for anti-MITM verification - both the dApp and wallet independently compute the same emoji sequence from the shared secret. Users can visually compare the sequences to detect interception. Similar to SAS (Short Authentication String) in ZRTP/Signal.

### importPublicKey
```typescript
function importPublicKey(exported: ExportedPublicKey) => Promise<CryptoKey>
```
Imports a public key from JWK format. Used to import the other party's public key for deriving a shared secret.

### jsonStringify
```typescript
function jsonStringify(obj: unknown, prettify?: boolean) => string
```
JSON.stringify helper that stringifies bigints, buffers, maps, and sets.

## Types

### ChainInfo
```typescript
type ChainInfo = { chainId: Fr; version: Fr }
```
Information on the connected chain. Used by wallets when constructing transactions to protect against replay attacks.

### DisconnectCallback
```typescript
type DisconnectCallback = () => void
```
Callback type for wallet disconnect events.

### FeeOptions
```typescript
type FeeOptions = { accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions; gasSettings: GasSettings; walletFeePaymentMethod?: FeePaymentMethod }
```
Options to configure fee payment for a transaction

### ProviderDisconnectionCallback
```typescript
type ProviderDisconnectionCallback = () => void
```
Callback type for wallet disconnect events at the provider level.

### WalletProviderType
```typescript
type WalletProviderType = "extension" | "web" | "embedded"
```
Type of wallet provider

## Enums

### WalletMessageType
Message types for wallet SDK communication. All types are prefixed with 'aztec-wallet-' for namespacing.

Values: `aztec-wallet-disconnect`, `aztec-wallet-discovery`, `aztec-wallet-discovery-response`, `aztec-wallet-session-disconnected`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/aztec.js**
- `Account`, `Aliased`, `BatchResults`, `BatchedMethod`, `CallIntent`, `FeePaymentMethod`, `IntentInnerHash`, `PrivateEvent`, `PrivateEventFilter`, `ProfileOptions`, `SendOptions`, `SimulateOptions`, `Wallet`

**@aztec/entrypoints**
- `AccountFeePaymentMethodOptions`, `ChainInfo`

**@aztec/foundation**
- `FieldsOf`, `Fr`, `Logger`

**@aztec/pxe**
- `PXE`

**@aztec/stdlib**
- `AuthWitness`, `AztecAddress`, `AztecNode`, `ContractArtifact`, `ContractClassMetadata`, `ContractInstanceWithAddress`, `ContractMetadata`, `EventMetadataDefinition`, `ExecutionPayload`, `FunctionCall`, `GasSettings`, `TxExecutionRequest`, `TxHash`, `TxProfileResult`, `TxReceipt`, `TxSimulationResult`, `UtilitySimulationResult`
