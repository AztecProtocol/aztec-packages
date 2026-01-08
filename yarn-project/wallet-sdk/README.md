# Wallet SDK Integration Guide for Third-Party Wallet Developers

This guide explains how to integrate your wallet with the Aztec Wallet SDK, enabling dApps to discover and interact with your wallet implementation.

## Available Types

All types and utilities needed for wallet integration are exported from `@aztec/wallet-sdk/manager`:

```typescript
import type {
  ChainInfo,
  ConnectRequest,
  DiscoveryRequest,
  DiscoveryResponse,
  WalletInfo,
  WalletMessage,
  WalletResponse,
} from '@aztec/wallet-sdk/manager';
import { ChainInfoSchema, WalletSchema, jsonStringify } from '@aztec/wallet-sdk/manager';
```

Cryptographic utilities for secure channel establishment are exported from `@aztec/wallet-sdk/crypto`:

```typescript
import type { EncryptedPayload, ExportedPublicKey } from '@aztec/wallet-sdk/crypto';
import {
  decrypt,
  deriveSharedKey,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
} from '@aztec/wallet-sdk/crypto';
```

## Overview

The Wallet SDK uses a **request-based discovery** model with **end-to-end encryption**:

1. **dApp requests wallets** for a specific chain/version via `WalletManager.getAvailableWallets({ chainInfo })`
2. **SDK broadcasts** a discovery message with chain information
3. **Your wallet responds** ONLY if it supports that specific network, including its ECDH public key
4. **dApp receives** only compatible wallets
5. **dApp establishes secure channel** via ECDH key exchange (see [Secure Channel](#secure-channel))
6. **All subsequent communication** is encrypted using AES-256-GCM

### Transport Mechanisms

This guide uses **browser extension wallets** as the primary example, which communicate via `window.postMessage`. However, the same message protocol can be used with other transport mechanisms:

- **Extension wallets**: Use `window.postMessage` (examples shown throughout this guide)
- **Web wallets**: Could use WebSockets, HTTP, or other protocols (see comments in examples for hypothetical WebSocket usage)
- **Mobile wallets**: Could use deep links, app-to-app communication, or custom protocols

The message format remains the same regardless of transport - only the delivery mechanism changes.

## Discovery Protocol

### 1. Listen for Discovery Requests

**Extension wallet example:**

```typescript
window.addEventListener('message', event => {
  if (event.source !== window) {
    return;
  }

  const data = JSON.parse(event.data);

  if (data.type === 'aztec-wallet-discovery') {
    handleDiscovery(data);
  }
});

// Using WebSocket:
// websocket.on('message', (message) => {
//   const data = JSON.parse(message);
//   if (data.type === 'aztec-wallet-discovery') {
//     handleDiscovery(data);
//   }
// });
```

### 2. Discovery Message Format

Discovery messages have this structure:

```typescript
{
  type: 'aztec-wallet-discovery',
  requestId: string,              // UUID for tracking this request
  chainInfo: {
    chainId: Fr,                  // Chain ID
    version: Fr                   // Protocol version
  }
}
```

### 3. Check Network Support

Before responding, verify your wallet supports the requested network:

```typescript
import { ChainInfoSchema } from '@aztec/wallet-sdk/manager';

function handleDiscovery(message: any) {
  const { requestId, chainInfo } = message;

  // Parse and validate chain info
  const { chainId, version } = ChainInfoSchema.parse(chainInfo);

  // Check if your wallet supports this network
  const isSupported = checkNetworkSupport(chainId, version);

  if (!isSupported) {
    // Do NOT respond if you don't support this network
    return;
  }

  // Respond if supported
  respondToDiscovery(requestId);
}
```

### 4. Respond to Discovery

If your wallet supports the network, respond with your wallet information:

**Extension wallet example:**

```typescript
import { jsonStringify } from '@aztec/wallet-sdk/manager';

// Your wallet should generate and store a key pair on initialization
let walletKeyPair: CryptoKeyPair;

async function initializeWallet() {
  // Generate ECDH key pair for secure channel establishment
  walletKeyPair = await generateKeyPair();
}

async function respondToDiscovery(requestId: string) {
  // Export the public key for sharing with dApps
  const publicKey = await exportPublicKey(walletKeyPair.publicKey);

  const response = {
    type: 'aztec-wallet-discovery-response',
    requestId,
    walletInfo: {
      id: 'my-aztec-wallet', // Unique wallet identifier
      name: 'My Aztec Wallet', // Display name
      icon: 'https://example.com/icon.png', // Optional icon URL
      version: '1.0.0', // Wallet version
      publicKey, // ECDH public key for secure channel (required)
    },
  };

  // Send as JSON string via window.postMessage
  window.postMessage(jsonStringify(response), '*');
}

// Using WebSocket:
// websocket.send(jsonStringify(response));
```

**Important Notes:**

- Both the SDK and wallets send messages as JSON strings (using `jsonStringify`)
- Both the SDK and wallets must parse incoming JSON strings
- Always use `jsonStringify` from `@aztec/foundation/json-rpc` for sending messages
- Always parse incoming messages with `JSON.parse` and the proper schemas
- The `publicKey` field is required for secure channel establishment

## Secure Channel

After discovery, the dApp establishes a secure encrypted channel with your wallet using ECDH key exchange and AES-256-GCM encryption. This ensures all wallet method calls and responses are encrypted end-to-end.

### Security Model

- **ECDH Key Exchange**: Uses P-256 (secp256r1) elliptic curve for key agreement
- **AES-256-GCM Encryption**: All messages after channel establishment are encrypted
- **Per-Session Keys**: Each connection derives a unique shared secret
- **MessageChannel (Extension wallets)**: Uses a private MessagePort for communication, not visible to other page scripts

### 1. Handle Connection Requests

When a dApp connects, it sends a `ConnectRequest` containing its ECDH public key:

```typescript
interface ConnectRequest {
  type: 'aztec-wallet-connect';
  walletId: string; // Your wallet's ID
  appId: string; // Application identifier
  publicKey: ExportedPublicKey; // dApp's ECDH public key
}
```

**Extension wallet example:**

```typescript
import { decrypt, deriveSharedKey, encrypt, importPublicKey } from '@aztec/wallet-sdk/crypto';

// Store connections by appId
const connections = new Map<string, { sharedKey: CryptoKey }>();

window.addEventListener('message', async event => {
  if (event.source !== window) return;

  const data = JSON.parse(event.data);

  if (data.type === 'aztec-wallet-connect') {
    await handleConnect(data, event.ports[0]);
  }
});

async function handleConnect(request: ConnectRequest, port: MessagePort) {
  // Import dApp's public key
  const dappPublicKey = await importPublicKey(request.publicKey);

  // Derive shared secret using our private key and dApp's public key
  const sharedKey = await deriveSharedKey(walletKeyPair.privateKey, dappPublicKey);

  // Store the connection
  connections.set(request.appId, { sharedKey });

  // Set up encrypted message handler on the MessagePort
  port.onmessage = async event => {
    await handleEncryptedMessage(request.appId, event.data);
  };

  port.start();
}
```

### 2. Handle Encrypted Messages

All wallet method calls arrive as encrypted payloads:

```typescript
interface EncryptedPayload {
  iv: string; // Base64-encoded initialization vector
  ciphertext: string; // Base64-encoded encrypted data
}
```

Decrypt incoming messages and encrypt responses:

```typescript
async function handleEncryptedMessage(appId: string, encrypted: EncryptedPayload) {
  const connection = connections.get(appId);
  if (!connection) {
    console.error('Unknown connection');
    return;
  }

  try {
    // Decrypt the incoming message
    const message = await decrypt<WalletMessage>(connection.sharedKey, encrypted);

    const { type, messageId, args, chainInfo, walletId } = message;

    // Process the wallet method call
    const wallet = await getWalletForChain(chainInfo);
    const result = await wallet[type](...args);

    // Create response
    const response: WalletResponse = {
      messageId,
      result,
      walletId,
    };

    // Encrypt and send the response
    const encryptedResponse = await encrypt(connection.sharedKey, response);
    sendEncryptedResponse(appId, encryptedResponse);
  } catch (error) {
    // Send encrypted error response
    const errorResponse: WalletResponse = {
      messageId: message?.messageId ?? '',
      error: { message: error.message },
      walletId: message?.walletId ?? '',
    };

    const encryptedError = await encrypt(connection.sharedKey, errorResponse);
    sendEncryptedResponse(appId, encryptedError);
  }
}
```

### 3. Extension Wallet Architecture

For browser extension wallets, the recommended architecture separates concerns:

```
┌─────────────┐    window.postMessage    ┌─────────────────┐    browser.runtime   ┌──────────────────┐
│   dApp      │◄────────────────────────►│  Content Script │◄────────────────────►│ Background Script│
│ (web page)  │    (discovery only)      │  (message relay)│    (encrypted msgs)  │ (decrypt+process)│
└─────────────┘                          └─────────────────┘                      └──────────────────┘
       │                                            │
       │         MessagePort (private channel)      │
       └────────────────────────────────────────────┘
                (encrypted wallet method calls)
```

**Security benefits:**

- Content script never has access to private keys or shared secrets
- All cryptographic operations happen in the background script (service worker)
- MessagePort provides a private channel not visible to other page scripts
- Only the initial connection handshake uses `window.postMessage`

## Message Format

### Wallet Method Request

After discovery, dApps will call wallet methods. These arrive as:

```typescript
{
  type: string,                    // Wallet method name from the Wallet interface
  messageId: string,               // UUID for tracking this request
  args: unknown[],                 // Method arguments
  chainInfo: {
    chainId: Fr,                   // Same chain that was used in discovery
    version: Fr
  },
  appId: string,                   // Application identifier
  walletId: string                 // Your wallet's ID (from discovery response)
}
```

Example method calls:

- `type: 'getAccounts'` - Get list of accounts
- `type: 'getChainInfo'` - Get chain information
- `type: 'sendTx'` - Send a transaction
- `type: 'registerContract'` - Register a contract instance

### Wallet Method Response

Your wallet must respond with:

```typescript
{
  messageId: string,               // MUST match the request's messageId
  result?: unknown,                // Method result (if successful)
  error?: unknown,                 // Error (if failed)
  walletId: string                 // Your wallet's ID
}
```

## Parsing Messages

### Using Zod Schemas

Use the provided Zod schemas to parse and validate incoming messages:

```typescript
import { ChainInfoSchema, WalletSchema } from '@aztec/wallet-sdk/manager';

// Parse chain info
const chainInfo = ChainInfoSchema.parse(message.chainInfo);

// Validate result against expected schema for a method
const accountsResult = await wallet.getAccounts(...args);
// The SDK handles schema validation on the client side
```

The Wallet SDK automatically validates return values using `WalletSchema` on the client side, so your wallet implementation should return values that match the `Wallet` interface specification.

## Error Handling

### Error Response Format

Always send error responses with this structure:

```typescript
{
  messageId: string,               // Match the request
  error: {
    message: string,               // Error message
    code?: string,                 // Optional error code
    stack?: string                 // Optional stack trace
  },
  walletId: string
}
```

### Common Error Scenarios

Common errors to handle within the encrypted message handler:

- **Network not supported**: Chain info doesn't match wallet's supported networks
- **Unknown method**: The requested wallet method doesn't exist
- **Invalid arguments**: Method arguments fail validation
- **User rejection**: User declined the transaction or action

### User Rejection Handling

If a user rejects an action:

```typescript
{
  messageId: 'abc-123',
  error: {
    message: 'User rejected the request',
    code: 'USER_REJECTED'
  },
  walletId: 'my-wallet'
}
```

## Testing Your Integration

### WalletManager

In a dApp using the Wallet SDK:

```typescript
import { Fr } from '@aztec/foundation/curves/bn254';
import { WalletManager } from '@aztec/wallet-sdk/manager';

const manager = WalletManager.configure({
  extensions: { enabled: true },
});

// Discover wallets
const wallets = await manager.getAvailableWallets({
  chainInfo: {
    chainId: new Fr(31337),
    version: new Fr(0),
  },
  timeout: 2000,
});

console.log('Discovered wallets:', wallets);

// Connect to your wallet
const walletProvider = wallets.find(w => w.id === 'my-aztec-wallet');
if (walletProvider) {
  const wallet = await walletProvider.connect('test-app');

  // Test wallet methods from the Wallet interface
  const accounts = await wallet.getAccounts();
  console.log('Accounts:', accounts);

  const chainInfo = await wallet.getChainInfo();
  console.log('Chain info:', chainInfo);
}
```

## Reference Implementation

For a complete reference implementation, see the demo wallet at:

- Repository: `~/repos/demo-wallet`
