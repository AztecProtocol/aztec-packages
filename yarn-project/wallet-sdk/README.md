# Wallet SDK Integration Guide for Third-Party Wallet Developers

This guide explains how to integrate your wallet with the Aztec Wallet SDK, enabling dApps to discover and interact with your wallet implementation.

## Available Types

All types and utilities needed for wallet integration are exported from `@aztec/wallet-sdk/manager`:

```typescript
import type {
  ChainInfo,
  DiscoveryRequest,
  DiscoveryResponse,
  WalletInfo,
  WalletMessage,
  WalletResponse,
} from '@aztec/wallet-sdk/manager';
import { ChainInfoSchema, WalletSchema, jsonStringify } from '@aztec/wallet-sdk/manager';
```

## Overview

The Wallet SDK uses a **request-based discovery** model:

1. **dApp requests wallets** for a specific chain/version via `WalletManager.getAvailableWallets({ chainInfo })`
2. **SDK broadcasts** a discovery message with chain information
3. **Your wallet responds** ONLY if it supports that specific network
4. **dApp receives** only compatible wallets
5. **dApp calls wallet methods** which your wallet handles and responds to

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

function respondToDiscovery(requestId: string) {
  const response = {
    type: 'aztec-wallet-discovery-response',
    requestId,
    walletInfo: {
      id: 'my-aztec-wallet', // Unique wallet identifier
      name: 'My Aztec Wallet', // Display name
      icon: 'https://example.com/icon.png', // Optional icon URL
      version: '1.0.0', // Wallet version
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

## Handling Wallet Methods

### 1. Set Up Message Listener

**Extension wallet example:**

```typescript
window.addEventListener('message', event => {
  if (event.source !== window) {
    return;
  }

  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return; // Not a valid JSON message
  }

  // Handle discovery
  if (data.type === 'aztec-wallet-discovery') {
    handleDiscovery(data);
    return;
  }

  // Handle wallet methods
  if (data.messageId && data.type && data.walletId === 'my-aztec-wallet') {
    handleWalletMethod(data);
  }
});

// Using WebSocket:
// websocket.on('message', (message) => {
//   const data = JSON.parse(message);
//   if (data.type === 'aztec-wallet-discovery') {
//     handleDiscovery(data);
//   } else if (data.messageId && data.type) {
//     handleWalletMethod(data);
//   }
// });
```

### 2. Route to Wallet Implementation

```typescript
import { ChainInfoSchema } from '@aztec/wallet-sdk/manager';

async function handleWalletMethod(message: any) {
  const { type, messageId, args, chainInfo, appId, walletId } = message;

  try {
    // Parse and validate chain info
    const parsedChainInfo = ChainInfoSchema.parse(chainInfo);

    // Get the wallet instance for this chain
    const wallet = await getWalletForChain(parsedChainInfo);

    // Verify the method exists on the Wallet interface
    if (typeof wallet[type] !== 'function') {
      throw new Error(`Unknown wallet method: ${type}`);
    }

    // Call the wallet method
    const result = await wallet[type](...args);

    // Send success response
    sendResponse(messageId, walletId, result);
  } catch (error) {
    // Send error response
    sendError(messageId, walletId, error);
  }
}
```

### 3. Send Response

**Extension wallet example:**

```typescript
import { jsonStringify } from '@aztec/wallet-sdk/manager';

function sendResponse(messageId: string, walletId: string, result: unknown) {
  const response = {
    messageId,
    result,
    walletId,
  };

  // Send as JSON string
  window.postMessage(jsonStringify(response), '*');
}

function sendError(messageId: string, walletId: string, error: Error) {
  const response = {
    messageId,
    error: {
      message: error.message,
      stack: error.stack,
    },
    walletId,
  };

  window.postMessage(jsonStringify(response), '*');
}

// Using WebSocket:
// websocket.send(jsonStringify({ messageId, result, walletId }));
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

```typescript
import { ChainInfoSchema } from '@aztec/wallet-sdk/manager';

async function handleWalletMethod(message: any) {
  const { type, messageId, args, chainInfo, walletId } = message;

  try {
    // 1. Parse and validate chain info
    const parsedChainInfo = ChainInfoSchema.parse(chainInfo);

    // 2. Check network support
    if (!isNetworkSupported(parsedChainInfo)) {
      throw new Error('Network not supported by wallet');
    }

    // 3. Get wallet instance
    const wallet = await getWalletForChain(parsedChainInfo);

    // 4. Validate method exists
    if (typeof wallet[type] !== 'function') {
      throw new Error(`Unknown wallet method: ${type}`);
    }

    // 5. Execute method
    const result = await wallet[type](...args);
    sendResponse(messageId, walletId, result);
  } catch (error) {
    sendError(messageId, walletId, error);
  }
}
```

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
import { Fr } from '@aztec/foundation/fields';
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
