# @aztec/wallet-sdk

Version: v4.0.0-nightly.20260207

## Quick Import Reference

```typescript
import {
  BackgroundConnectionHandler,
  BaseWallet,
  ContentScriptConnectionHandler,
  ExtensionProvider,
  ExtensionWallet,
  // ... and more
} from '@aztec/wallet-sdk';
```

## Classes

### BackgroundConnectionHandler

Handles wallet session flow in the extension background script. This class manages: - Pending discovery requests (before user approval) - Active sessions (after key exchange) - Per-session ECDH key exchange - Message encryption/decryption

**Constructor**
```typescript
new BackgroundConnectionHandler(config: BackgroundConnectionConfig, transport: BackgroundTransport, callbacks: BackgroundConnectionCallbacks)
```

**Methods**
- `approveDiscovery(requestId: string) => boolean`
- `clearAll() => void`
- `getActiveSessions() => ActiveSession[]`
- `getPendingDiscoveries() => PendingDiscovery[]`
- `getPendingDiscovery(requestId: string) => PendingDiscovery | undefined`
- `getPendingDiscoveryCount() => number`
- `getSession(sessionId: string) => ActiveSession | undefined`
- `getWalletInfo() => WalletInfo`
- `handleDiscoveryRequest(request: DiscoveryRequest, tabId: number, origin: string) => void`
- `handleEncryptedMessage(sessionId: string, encrypted: EncryptedPayload) => Promise<void>`
- `handleKeyExchangeRequest(sessionId: string, request: KeyExchangeRequest) => Promise<void>`
- `initialize() => void`
- `rejectDiscovery(requestId: string) => boolean`
- `sendResponse(sessionId: string, response: WalletResponse) => Promise<void>`
- `terminateForTab(tabId: number) => void`
- `terminateSession(sessionId: string) => void`

### BaseWallet

A base class for Wallet implementations
Implements: `Wallet`

**Constructor**
```typescript
new BaseWallet(pxe: PXE, aztecNode: AztecNode)
```

**Properties**
- `readonly aztecNode: AztecNode`
- `cancellableTransactions: boolean`
- `log: Logger`
- `minFeePadding: number`
- `readonly pxe: PXE`

**Methods**
- `batch<T extends readonly BatchedMethod[]>(methods: T) => Promise<BatchResults<T>>`
- `completeFeeOptions(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<FeeOptions>` - Completes partial user-provided fee options with wallet defaults.
- `completeFeeOptionsForEstimation(from: AztecAddress, feePayer?: AztecAddress, gasSettings?: Partial<FieldsOf<GasSettings>>) => Promise<{ accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions; gasSettings: GasSettings; walletFeePaymentMethod?: FeePaymentMethod }>` - Completes partial user-provided fee options with unreasonably high gas limits for gas estimation. Uses the same logic as completeFeeOptions but sets high limits to avoid running out of gas during estimation.
- `contextualizeError(err: Error, ...context: string[]) => Error`
- `createAuthWit(from: AztecAddress, messageHashOrIntent: IntentInnerHash | CallIntent) => Promise<AuthWitness>`
- `createTxExecutionRequestFromPayloadAndFee(executionPayload: ExecutionPayload, from: AztecAddress, feeOptions: FeeOptions) => Promise<TxExecutionRequest>`
- `getAccountFromAddress(address: AztecAddress) => Promise<Account>`
- `getAccounts() => Promise<Aliased<AztecAddress>[]>`
- `getAddressBook() => Promise<Aliased<AztecAddress>[]>` - Returns the list of aliased contacts associated with the wallet. This base implementation directly returns PXE's senders, but note that in general contacts are a superset of senders. - Senders: Addresses we check during synching in case they sent us notes, - Contacts: more general concept akin to a phone's contact list.
- `getChainInfo() => Promise<ChainInfo>`
- `getContractClassMetadata(id: Fr) => Promise<{ isArtifactRegistered: boolean; isContractClassPubliclyRegistered: boolean }>`
- `getContractMetadata(address: AztecAddress) => Promise<{ instance: ContractInstanceWithAddress | undefined; isContractInitialized: boolean; ... }>`
- `getPrivateEvents<T>(eventDef: EventMetadataDefinition, eventFilter: PrivateEventFilter) => Promise<PrivateEvent<T>[]>`
- `profileTx(executionPayload: ExecutionPayload, opts: ProfileOptions) => Promise<TxProfileResult>`
- `registerContract(instance: ContractInstanceWithAddress, artifact?: ContractArtifact, secretKey?: Fr) => Promise<ContractInstanceWithAddress>`
- `registerSender(address: AztecAddress, _alias: string) => Promise<AztecAddress>`
- `requestCapabilities(_manifest: AppCapabilities) => Promise<WalletCapabilities>` - Request capabilities from the wallet. This method is wallet-implementation-dependent and must be provided by classes extending BaseWallet. Embedded wallets typically don't support capability-based authorization (no user authorization flow), while external wallets (browser extensions, hardware wallets) implement this to reduce authorization friction by allowing apps to request permissions upfront. Consider making it abstract so implementing it is a conscious decision. Leaving it as-is while the feature stabilizes.
- `sendTx<W extends InteractionWaitOptions>(executionPayload: ExecutionPayload, opts: SendOptions<W>) => Promise<SendReturn<W>>`
- `simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions) => Promise<TxSimulationResult>`
- `simulateUtility(call: FunctionCall, authwits?: AuthWitness[]) => Promise<UtilitySimulationResult>`

### ContentScriptConnectionHandler

Handles wallet connection flow in the extension content script. This class manages: - Listening for discovery requests from the page - Creating MessageChannels after discovery approval - Relaying key exchange messages between page and background - Relaying encrypted messages between page and background The content script acts as a pure relay - it never has access to private keys or shared secrets.

**Constructor**
```typescript
new ContentScriptConnectionHandler(transport: ContentScriptTransport)
```

**Methods**
- `closeAllConnections() => void`
- `closeConnection(sessionId: string) => void`
- `getConnectionCount() => number`
- `start() => void`

### ExtensionProvider

Provider for discovering Aztec wallet extensions. NOTE: Most users should use WalletManager instead of this class directly. WalletManager provides a higher-level API with streaming support. The connection flow is split into two phases for security: 1. **Discovery Phase** (discoverWallets): - Broadcasts a discovery request (NO public keys) - Wallet shows pending request to user - User must approve before wallet reveals itself - Wallets are streamed via callback as they're approved 2. **Secure Channel Phase** (DiscoveredWallet.establishSecureChannel): - Performs ECDH key exchange over private MessageChannel - Both parties compute verification hash locally - Has a 2s timeout for MITM defense - Returns connected wallet with shared key and verification hash

**Constructor**
```typescript
new ExtensionProvider()
```

**Methods**
- `static discoverWallets(chainInfo: ChainInfo, options: DiscoveryOptions) => Promise<void>` - Discovers wallet extensions that user has approved. Wallets are streamed via the `onWalletDiscovered` callback as users approve them. The promise resolves when the timeout expires or signal is aborted.

### ExtensionWallet

A wallet implementation that communicates with browser extension wallets using an encrypted MessageChannel. This class uses a secure channel established after discovery: 1. **MessageChannel**: Created during discovery and transferred via window.postMessage. Note: The port transfer is visible to page scripts, but security comes from encryption. 2. **ECDH Key Exchange**: The shared secret was derived after discovery using Elliptic Curve Diffie-Hellman key exchange over the MessagePort. 3. **AES-GCM Encryption**: All messages are encrypted using AES-256-GCM, providing both confidentiality and authenticity. This is what secures the channel.

**Methods**
- `static create(extensionId: string, port: MessagePort, sharedKey: CryptoKey, chainInfo: ChainInfo, appId: string) => Wallet` - Creates a Wallet that communicates with a browser extension over a secure encrypted MessageChannel.
- `disconnect() => Promise<void>` - Disconnects from the wallet and cleans up resources. This method notifies the wallet extension that the session is ending, allowing it to clean up its state. After calling this method, the wallet instance can no longer be used and any pending requests will be rejected.
- `isDisconnected() => boolean` - Returns whether the wallet has been disconnected.
- `onDisconnect(callback: DisconnectCallback) => () => void` - Registers a callback to be invoked when the wallet disconnects.

### WalletManager

Manager for wallet discovery, configuration, and connection. This is the main entry point for dApps to discover and connect to wallets.

**Methods**
- `static configure(config: WalletManagerConfig) => WalletManager` - Configures the WalletManager with provider settings
- `getAvailableWallets(options: DiscoverWalletsOptions) => DiscoverySession` - Discovers all available wallets for a given chain and version. Returns a `DiscoverySession` with: - `wallets`: AsyncIterable to iterate over discovered wallets - `done`: Promise that resolves when discovery completes or is cancelled - `cancel()`: Function to stop discovery immediately If `onWalletDiscovered` callback is provided, wallets are also streamed via callback.

## Interfaces

### ActiveSession

An active session with a connected dApp. Created after key exchange completes.

**Properties**
- `appId: string` - Application identifier.
- `chainInfo: ChainInfo` - Network information.
- `connectedAt: number` - Connection timestamp.
- `origin: string` - Origin URL of the connected app.
- `sessionId: string` - Unique session identifier.
- `sharedKey: CryptoKey` - Derived AES-GCM encryption key.
- `tabId: number` - Browser tab ID.
- `verificationHash: string` - Hex-encoded verification hash for visual comparison.

### BackgroundConnectionCallbacks

Event callbacks for the background connection handler. All callbacks are optional.

**Properties**
- `onPendingDiscovery?: (discovery: PendingDiscovery) => void` - Called when a new discovery request is received and stored as pending.
- `onSessionEstablished?: (session: ActiveSession) => void` - Called when a session is established (key exchange complete).
- `onSessionTerminated?: (sessionId: string) => void` - Called when a session is terminated.
- `onWalletMessage?: (session: ActiveSession, message: WalletMessage) => void` - Called when a decrypted wallet message is received.

### BackgroundConnectionConfig

Configuration for the background connection handler.

**Properties**
- `walletIcon?: string` - Optional wallet icon URL.
- `walletId: string` - Unique wallet identifier.
- `walletName: string` - Display name for the wallet.
- `walletVersion: string` - Wallet version string.

### BackgroundMessage

Message sent from background to content script.

**Properties**
- `content?: unknown` - Optional message payload.
- `origin: "background"` - Message source identifier.
- `sessionId: string` - Session identifier.
- `type: string` - Message type.

### BackgroundTransport

Transport interface for background script communication.

**Properties**
- `addContentListener: (handler: (message: unknown, sender: MessageSender) => void) => void` - Register a listener for messages from content scripts. Typically `browser.runtime.onMessage.addListener`.
- `sendToTab: (tabId: number, message: BackgroundMessage) => void` - Send a message to a specific tab. Typically `(tabId, message) => browser.tabs.sendMessage(tabId, message)`.

### ConnectedWallet

A fully connected wallet with secure channel established. Available after key exchange completes.

**Properties**
- `info: ConnectedWalletInfo` - Full wallet info including public key and verification hash
- `port: MessagePort` - The MessagePort for encrypted communication
- `sharedKey: CryptoKey` - The derived AES-256-GCM shared key for encryption

### ConnectedWalletInfo

Full information about a connected Aztec wallet including crypto material. Available after key exchange completes.

Extends: `WalletInfo`

**Properties**
- `icon?: string` - URL to the wallet's icon
- `id: string` - Unique identifier for the wallet
- `name: string` - Display name of the wallet
- `publicKey: ExportedPublicKey` - Wallet's ECDH public key for secure channel establishment
- `verificationHash?: string` - Verification hash for verification. Both dApp and wallet independently compute this from the ECDH shared secret. Use hashToEmoji to convert to a visual representation for user verification.
- `version: string` - Wallet version

### ContentScriptMessage

Message sent from content script to background.

**Properties**
- `content?: unknown` - Optional message payload.
- `origin: "content-script"` - Message source identifier.
- `sessionId?: string` - Optional session identifier.
- `type: string` - Message type.

### ContentScriptTransport

Transport interface for content script communication.

**Properties**
- `addBackgroundListener: (handler: (message: BackgroundMessage) => void) => void` - Register a listener for messages from the background script. Typically `browser.runtime.onMessage.addListener`.
- `sendToBackground: (message: ContentScriptMessage) => void` - Send a message to the background script. Typically `browser.runtime.sendMessage`.

### DiscoverWalletsOptions

Options for discovering wallets

**Properties**
- `appId: string` - Application ID making the request
- `chainInfo: ChainInfo` - Chain information to filter by
- `onWalletDiscovered?: (provider: WalletProvider) => void` - Callback invoked when a wallet provider is discovered. Use this to show wallets to users as they approve them, rather than waiting for the full timeout.
- `timeout?: number` - Discovery timeout in milliseconds. Default: 60000 (60s)

### DiscoveredWallet

A discovered wallet before key exchange. Has basic info and MessagePort, but no shared key yet. Call establishSecureChannel to perform key exchange and get a connected wallet.

**Properties**
- `readonly info: WalletInfo` - Basic wallet information (id, name, icon, version)
- `readonly port: MessagePort` - The MessagePort for private communication with the wallet
- `readonly requestId: string` - Request ID for correlation

**Methods**
- `establishSecureChannel() => Promise<ConnectedWallet>` - Establishes a secure connection with this wallet. This method: 1. Generates an ECDH key pair 2. Sends public key to wallet over the MessagePort 3. Receives wallet's public key 4. Derives shared secret and computes verification hash locally **IMPORTANT**: Has a 2 second timeout for MITM defense. Both parties must exchange keys relatively quickly. The verification hash is computed independently by both parties and should be displayed to the user for visual comparison.

### DiscoveryOptions

Options for wallet discovery.

**Properties**
- `appId: string` - Application ID making the request
- `onWalletDiscovered?: (wallet: DiscoveredWallet) => void` - Callback invoked when a wallet is discovered. Wallets are streamed as users approve them.
- `signal?: AbortSignal` - AbortSignal for cancelling discovery early. When aborted, cleanup happens immediately instead of waiting for timeout.
- `timeout?: number` - How long to wait for user approval (ms). Default: 60000 (60s)

### DiscoveryRequest

Discovery message for finding installed wallets (public, unencrypted).

**Properties**
- `appId: string` - Application ID making the request
- `chainInfo: ChainInfo` - Chain information to check if wallet supports this network
- `requestId: string` - Request ID
- `type: DISCOVERY` - Message type for discovery

### DiscoveryResponse

Discovery response from a wallet (public, unencrypted).

**Properties**
- `requestId: string` - Request ID matching the discovery request
- `type: DISCOVERY_RESPONSE` - Message type for discovery response
- `walletInfo: WalletInfo` - Basic wallet information

### DiscoverySession

A cancellable discovery session. Returned by `WalletManager.getAvailableWallets()` to allow consumers to cancel discovery when no longer needed (e.g., network changes, user navigates away).

**Properties**
- `cancel: () => void` - Cancel discovery immediately and clean up resources
- `done: Promise<void>` - Promise that resolves when discovery completes or is cancelled
- `wallets: AsyncIterable<WalletProvider>` - Async iterator that yields wallet providers as they're discovered

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

### KeyExchangeRequest

Key exchange request sent over MessageChannel after discovery approval.

**Properties**
- `publicKey: ExportedPublicKey` - dApp's ECDH public key for deriving shared secret
- `requestId: string` - Request ID matching the discovery request
- `type: KEY_EXCHANGE_REQUEST` - Message type

### KeyExchangeResponse

Key exchange response sent over MessageChannel.

**Properties**
- `publicKey: ExportedPublicKey` - Wallet's ECDH public key for deriving shared secret
- `requestId: string` - Request ID matching the discovery request
- `type: KEY_EXCHANGE_RESPONSE` - Message type

### MessageSender

Sender information for messages from browser runtime.

**Properties**
- `tab?: { id?: number; url?: string }` - Tab information if available.

### PendingConnection

A pending connection that requires user verification before finalizing. After key exchange, both dApp and wallet compute a verification hash independently. The dApp should display this hash (typically as emojis) and let the user confirm it matches what's shown in their wallet before calling `confirm()`. This protects the dApp from connecting to a malicious wallet that might be intercepting the connection (MITM attack).

**Properties**
- `verificationHash: string` - The verification hash computed from the shared secret. Use `hashToEmoji()` to convert to a visual representation for user verification. The user should confirm this matches what their wallet displays.

**Methods**
- `cancel() => void` - Cancels the pending connection. Call this if the user indicates the emojis don't match.
- `confirm() => Promise<Wallet>` - Confirms the connection after user verifies the emojis match.

### PendingDiscovery

A pending discovery request from a dApp.

**Properties**
- `appId: string` - Application identifier.
- `appName?: string` - Optional application name.
- `chainInfo: ChainInfo` - Network information.
- `origin: string` - Origin URL of the requesting page.
- `requestId: string` - Unique request identifier.
- `status: DiscoveryStatus` - Current status.
- `tabId: number` - Browser tab ID.
- `timestamp: number` - Request timestamp.

### SecureKeyPair

ECDH key pair for secure communication. The private key should never be exported or transmitted. The public key can be exported via exportPublicKey for exchange.

**Properties**
- `privateKey: CryptoKey` - Private key - keep secret, used for key derivation
- `publicKey: CryptoKey` - Public key - safe to share

### SessionKeys

Session keys derived from ECDH key exchange. Contains both the encryption key and the verification hash (verificationHash) computed from a separate HMAC key.

**Properties**
- `encryptionKey: CryptoKey` - AES-256-GCM key for message encryption/decryption
- `verificationHash: string` - Hex-encoded verificationHash for verification

### WalletInfo

Information about an installed Aztec wallet. Used during discovery phase before key exchange.

**Properties**
- `icon?: string` - URL to the wallet's icon
- `id: string` - Unique identifier for the wallet
- `name: string` - Display name of the wallet
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
- `disconnect() => Promise<void>` - Disconnects the current wallet and cleans up resources. After calling this, the wallet returned from confirm() should no longer be used.
- `establishSecureChannel(appId: string) => Promise<PendingConnection>` - Establishes a secure channel with this wallet provider. This performs the ECDH key exchange and returns a pending connection with the verification hash. The channel is encrypted but NOT yet verified - the dApp should display the hash (as emojis) to the user and let them confirm it matches their wallet before calling `confirm()`.
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

### deriveSessionKeys
```typescript
function deriveSessionKeys(ownKeyPair: SecureKeyPair, peerPublicKey: CryptoKey, isApp: boolean) => Promise<SessionKeys>
```
Derives session keys from ECDH key exchange using HKDF. This is the main key derivation function that produces: 1. An AES-256-GCM encryption key (first 256 bits) 2. An HMAC key for verificationHash computation (second 256 bits) 3. A verificationHash computed as HMAC(hmacKey, "aztec-wallet-verification-verificationHash") The keys are derived using a single HKDF call that produces 512 bits, then split into the two keys.

### encrypt
```typescript
function encrypt(key: CryptoKey, data: string) => Promise<EncryptedPayload>
```
Encrypts data using AES-256-GCM. A random 12-byte IV is generated for each encryption operation. AES-GCM provides both confidentiality and authenticity - any tampering with the ciphertext will cause decryption to fail.

### exportPublicKey
```typescript
function exportPublicKey(publicKey: CryptoKey) => Promise<ExportedPublicKey>
```
Exports a public key to JWK format for transmission. The exported key contains only public components and is safe to transmit over untrusted channels.

### generateKeyPair
```typescript
function generateKeyPair() => Promise<SecureKeyPair>
```
Generates an ECDH P-256 key pair for key exchange. The generated key pair can be used to derive session keys with another party's public key using deriveSessionKeys.

### hashToEmoji
```typescript
function hashToEmoji(hash: string, count: number) => string
```
Converts a hex hash to an emoji sequence for visual verification. This is used for verification - both the dApp and wallet independently compute the same emoji sequence from the derived keys. Users can visually compare the sequences to detect interception. With a 256-emoji alphabet and 9 emojis (3x3 grid), this provides 72 bits of security (9 * 8 = 72 bits), making brute-force attacks computationally infeasible.

### importPublicKey
```typescript
function importPublicKey(exported: ExportedPublicKey) => Promise<CryptoKey>
```
Imports a public key from JWK format. Used to import the other party's public key for deriving session keys.

## Types

### DEFAULT_EMOJI_GRID_SIZE
```typescript
type DEFAULT_EMOJI_GRID_SIZE = 9
```
Default grid size for emoji verification display. 3x3 grid = 9 emojis = 72 bits of security.

### DisconnectCallback
```typescript
type DisconnectCallback = () => void
```
Callback type for wallet disconnect events.

### DiscoveryStatus
```typescript
type DiscoveryStatus = "pending" | "approved" | "rejected"
```
Status of a pending discovery request.

### FeeOptions
```typescript
type FeeOptions = unknown
```
Options to configure fee payment for a transaction

### MessageOrigin
```typescript
type MessageOrigin = { BACKGROUND: "background"; CONTENT_SCRIPT: "content-script" }
```
Message origins for internal extension communication.

### MessageOriginType
```typescript
type MessageOriginType = typeof MessageOrigin[keyof typeof MessageOrigin]
```
Union type of message origins.

### ProviderDisconnectionCallback
```typescript
type ProviderDisconnectionCallback = () => void
```
Callback type for wallet disconnect events at the provider level.

### WalletProviderType
```typescript
type WalletProviderType = "extension" | "web"
```
Type of wallet provider

## Enums

### WalletMessageType
Message types for wallet SDK communication. All types are prefixed with 'aztec-wallet-' for namespacing.

Values: `aztec-wallet-disconnect`, `aztec-wallet-discovery`, `aztec-wallet-discovery-response`, `aztec-wallet-key-exchange-request`, `aztec-wallet-key-exchange-response`

## Cross-Package References

This package references types from other Aztec packages:

**@aztec/aztec.js**
- `Account`, `Aliased`, `AppCapabilities`, `BatchResults`, `BatchedMethod`, `CallIntent`, `FeePaymentMethod`, `IntentInnerHash`, `InteractionWaitOptions`, `PrivateEvent`, `PrivateEventFilter`, `ProfileOptions`, `SendOptions`, `SendReturn`, `SimulateOptions`, `Wallet`, `WalletCapabilities`

**@aztec/entrypoints**
- `AccountFeePaymentMethodOptions`, `ChainInfo`

**@aztec/foundation**
- `FieldsOf`, `Fr`, `Logger`

**@aztec/pxe**
- `PXE`

**@aztec/stdlib**
- `AuthWitness`, `AztecAddress`, `AztecNode`, `ContractArtifact`, `ContractInstanceWithAddress`, `EventMetadataDefinition`, `ExecutionPayload`, `FunctionCall`, `GasSettings`, `TxExecutionRequest`, `TxProfileResult`, `TxSimulationResult`, `UtilitySimulationResult`
