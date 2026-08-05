---
title: "1. Extension Architecture"
description: Understanding Chrome extension architecture for Aztec wallets - service workers, offscreen documents, and message passing
sidebar_position: 1
---

# Extension Architecture

Browser extension wallets face unique challenges that don't exist in embedded wallets. This section explains why you need a multi-component architecture and how the pieces fit together.

## The Service Worker Problem

Chrome's Manifest V3 requires extensions to use **service workers** instead of persistent background pages. Service workers have limitations that affect wallet development:

1. **5-minute timeout** - Service workers terminate after 5 minutes of inactivity
2. **No DOM access** - Can't use DOM APIs or run WASM directly
3. **Limited storage** - Must use async storage APIs like `chrome.storage`
4. **Cold starts** - Must reinitialize state when waking up

For a wallet, these limitations are problematic because:

- **PXE needs persistence** - The Private eXecution Environment maintains Merkle tree state
- **Proof generation takes time** - Can exceed the 5-minute timeout
- **WASM is essential** - Aztec's cryptographic operations use WASM

## The Solution: Offscreen Documents

Manifest V3 introduced **offscreen documents** as a way to handle operations that service workers can't:

```javascript
// In background.ts (service worker)
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: [chrome.offscreen.Reason.WORKERS],
  justification: 'Aztec PXE requires long-running WASM operations',
});
```

Offscreen documents:
- Run longer than service workers
- Support WASM and IndexedDB
- Can maintain state across requests
- Are invisible to users (no UI)

## Component Responsibilities

### Content Script (`content-script.ts`)

The content script runs in the context of every web page. Its only job is to relay messages:

```typescript title="content-script" showLineNumbers 
import {
  ContentScriptConnectionHandler,
  type ContentScriptTransport,
} from '@aztec/wallet-sdk/extension/handlers';

const transport: ContentScriptTransport = {
  sendToBackground: (message) => {
    chrome.runtime.sendMessage(message);
  },
  addBackgroundListener: (handler) => {
    chrome.runtime.onMessage.addListener((message) => {
      handler(message);
    });
  },
};

const handler = new ContentScriptConnectionHandler(transport);
handler.start();
console.log('[content-script] Wallet SDK handler started');
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/content-script.ts#L1-L21" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/content-script.ts#L1-L21</a></sub></sup>


It uses the `ContentScriptConnectionHandler` from the wallet SDK, which:
- Listens for messages from the page (dApp)
- Forwards them to the background service worker
- Relays responses back to the page

### Service Worker (`background.ts`)

The service worker handles the wallet SDK protocol and coordinates between components:

```typescript title="offscreen-management" showLineNumbers 
let offscreenCreating: Promise<void> | null = null;

/**
 * Ensures the offscreen document exists. Creates it if needed.
 * The offscreen document hosts the PXE and wallet implementation.
 */
async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  const offscreenUrl = chrome.runtime.getURL("dist/offscreen.html");
  log.debug("[background] Creating offscreen document:", offscreenUrl);

  offscreenCreating = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "Aztec PXE requires long-running WASM operations",
  });

  await offscreenCreating;
  offscreenCreating = null;
  log.debug("[background] Offscreen document created");
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/background.ts#L36-L70" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/background.ts#L36-L70</a></sub></sup>


Key responsibilities:
- **Protocol handling** - Discovery, key exchange, session management
- **Offscreen lifecycle** - Creating/checking the offscreen document
- **Message routing** - Forwarding wallet calls to offscreen
- **User approvals** - Triggering popups for connection/transaction approval

### Offscreen Document (`offscreen.ts`)

The offscreen document is where the heavy lifting happens:

```typescript title="pxe-instance" showLineNumbers 
/**
 * PXE + node — lazily initialized as a pair, with dedup on the inflight promise.
 */
let pxeState: { pxe: PXE; node: AztecNode } | null = null;
let pxeInitializing: Promise<{ pxe: PXE; node: AztecNode }> | null = null;

async function ensurePXE(nodeUrl: string = NODE_URL): Promise<{ pxe: PXE; node: AztecNode }> {
  if (pxeState) return pxeState;
  if (pxeInitializing) return pxeInitializing;

  log.debug('[offscreen] Initializing PXE with node:', nodeUrl);
  pxeInitializing = (async () => {
    try {
      const node = createAztecNodeClient(nodeUrl);
      const config = getPXEConfig();
      config.l1Contracts = await node.getL1ContractAddresses();
      const isLocal = nodeUrl.includes('localhost') || nodeUrl.includes('127.0.0.1');
      config.proverEnabled = !isLocal;

      const pxe = await createPXE(node, config, {});
      log.debug('[offscreen] PXE initialized, connected to node at:', nodeUrl);

      pxeState = { pxe, node };
      return pxeState;
    } finally {
      pxeInitializing = null; // Always clear so a retry can re-attempt
    }
  })();

  return pxeInitializing;
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L123-L155" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts#L123-L155</a></sub></sup>


It hosts:
- **PXE instance** - The Private eXecution Environment
- **Wallet implementation** - The `OffscreenWallet` that extends `BaseWallet`
- **Method handlers** - All wallet operations (send, simulate, sign)

### Popup (`popup.tsx`)

The popup provides the user interface for:
- Viewing accounts
- Creating new accounts
- Deploying account contracts
- Approving connections
- Approving transactions

## Message Flow

Here's how a transaction flows through the system:

```text
1. dApp calls wallet.sendTx(...)
   ↓
2. Page postMessage to content script
   ↓
3. Content script → chrome.runtime.sendMessage → Background
   ↓
4. Background checks: requires approval?
   ├─ No: Forward directly to offscreen
   └─ Yes: Store pending, update badge, wait for popup approval
   ↓
5. User clicks extension icon, sees pending tx
   ↓
6. User clicks "Approve"
   ↓
7. Popup → chrome.runtime.sendMessage → Background
   ↓
8. Background → persistent port → Offscreen
   ↓
9. Offscreen executes: wallet.sendTx(...)
   - Creates execution request
   - Generates proof (WASM, can take time)
   - Submits to node
   ↓
10. Response flows back: Offscreen → port → Background → Content → Page
```

The extension uses two messaging strategies:
- **Persistent ports** (`chrome.runtime.connect`) for background ↔ offscreen and background ↔ popup. Ports provide point-to-point channels with automatic disconnect detection.
- **One-shot messages** (`chrome.runtime.sendMessage`) for content script → background and popup → background requests. These are broadcast messages filtered by a `target` field.

## The Manifest

The `manifest.json` declares all components:

```json
{
  "manifest_version": 3,
  "name": "Aztec Tutorial Wallet",
  "version": "1.0.0",
  "permissions": ["storage", "offscreen"],
  "background": {
    "service_worker": "dist/background.js",
    "type": "module"
  },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["dist/content-script.js"],
    "run_at": "document_start"
  }],
  "action": {
    "default_popup": "popup/popup.html"
  }
}
```

:::note
This is a simplified manifest. The full version in the example project includes additional permissions (`alarms`, `notifications`, `windows`), `host_permissions`, `content_security_policy` for WASM, and `web_accessible_resources` for WASM files.
:::

Key points:
- `"offscreen"` permission enables offscreen document creation
- `"storage"` permission for encrypted key storage
- `"type": "module"` enables ES modules in the service worker
- `"run_at": "document_start"` ensures content script loads early

## Configuration

Constants are centralized in `config.ts`:

```typescript title="wallet-config" showLineNumbers 
/**
 * Configuration for the Aztec Tutorial Wallet extension.
 * Uses SponsoredFPC for fee payment.
 */

/** Aztec node URL — defaults to a local sandbox. */
export const NODE_URL = 'http://localhost:8080';

/** Current @aztec/* package version, injected at build time by Vite. */
declare const __AZTEC_PACKAGES_VERSION__: string;
export const AZTEC_PACKAGES_VERSION: string =
  typeof __AZTEC_PACKAGES_VERSION__ !== 'undefined' ? __AZTEC_PACKAGES_VERSION__ : 'unknown';

/** Wallet identification for the SDK protocol */
export const WALLET_CONFIG = {
  walletId: 'aztec-tutorial-wallet',
  walletName: 'Aztec Tutorial Wallet',
  walletVersion: '1.0.0',
  walletIcon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔮</text></svg>',
};

/** Auto-lock timeout in minutes. The wallet locks after this period of inactivity. (#28) */
export const AUTO_LOCK_MINUTES = 15;

/** Message types for internal extension communication */
export const MessageTypes = {
  // Account management
  GET_ACCOUNTS: 'get-accounts',
  MARK_DEPLOYED: 'mark-deployed',

  // Full account creation in extension (uses Barretenberg)
  CREATE_ACCOUNT: 'create-account',
  DEPLOY_ACCOUNT: 'deploy-account',

  // Master password + wallet unlock
  SETUP_PASSWORD: 'setup-password',
  UNLOCK_WALLET: 'unlock-wallet',
  GET_WALLET_STATUS: 'get-wallet-status',

  // PXE operations
  INIT_PXE: 'init-pxe',
  REGISTER_ACCOUNT: 'register-account',

  // Active account management
  GET_ACTIVE_ACCOUNT: 'get-active-account',
  SET_ACTIVE_ACCOUNT: 'set-active-account',

  // Wallet export/import
  EXPORT_WALLET: 'export-wallet',
  IMPORT_WALLET: 'import-wallet',
  IMPORT_WALLET_ACCOUNTS: 'import-wallet-accounts',

  // Wallet SDK protocol — dispatches to BaseWallet
  WALLET_METHOD: 'wallet-method',

  // Auto-lock
  LOCK_WALLET: 'lock-wallet',

  // Popup -> Background
  APPROVE_CONNECTION: 'approve-connection',
  REJECT_CONNECTION: 'reject-connection',
  APPROVE_TRANSACTION: 'approve-transaction',
  REJECT_TRANSACTION: 'reject-transaction',
  CONFIRM_SESSION: 'confirm-session',
  REJECT_SESSION: 'reject-session',
  DISCONNECT_SESSION: 'disconnect-session',
  APPROVE_CAPABILITIES: 'approve-capabilities',
  REJECT_CAPABILITIES: 'reject-capabilities',
} as const;

/** Union type of all message type values — use for exhaustive checking. */
export type MessageType = (typeof MessageTypes)[keyof typeof MessageTypes];

/** Targets for chrome.runtime messages */
export const MessageTarget = {
  OFFSCREEN: 'offscreen',
  POPUP: 'popup',
  BACKGROUND: 'background',
} as const;


/**
 * Conditional logging. (#26)
 * Strips verbose logs in production while keeping errors visible.
 * Set DEBUG=true in the build to enable verbose logging.
 */
const DEBUG = process.env.NODE_ENV !== 'production'; // Toggle via build environment

export const log = {
  debug: (...args: unknown[]) => { if (DEBUG) console.log(...args); },
  info: (...args: unknown[]) => { if (DEBUG) console.info(...args); },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.1/docs/examples/webapp-tutorial/test-extension/src/config.ts#L1-L96" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/config.ts#L1-L96</a></sub></sup>


This keeps configuration in one place and provides typed message constants.

## Building the Extension

The build uses a two-step process orchestrated by `esbuild.extension.mjs`:

1. **Vite** bundles the background script, offscreen document, and popup — with React support, node polyfills, and a custom plugin that patches Barretenberg worker files for `crossOriginIsolated` (see `vite.extension.config.ts`)
2. **esbuild** bundles the content script separately as IIFE (Chrome content scripts don't support ES modules)

```bash
node esbuild.extension.mjs
```

The script also copies static files (offscreen HTML, WASM binaries) to the correct locations.

## Next Steps

Now that you understand the architecture, let's implement the [Wallet Protocol](./02-wallet-protocol.md) - the discovery and key exchange that establishes secure connections between dApps and the wallet.
