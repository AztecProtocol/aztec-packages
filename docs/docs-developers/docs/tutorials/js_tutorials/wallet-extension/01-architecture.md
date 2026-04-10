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

#include_code content-script docs/examples/webapp-tutorial/test-extension/src/content-script.ts typescript

It uses the `ContentScriptConnectionHandler` from the wallet SDK, which:
- Listens for messages from the page (dApp)
- Forwards them to the background service worker
- Relays responses back to the page

### Service Worker (`background.ts`)

The service worker handles the wallet SDK protocol and coordinates between components:

#include_code offscreen-management docs/examples/webapp-tutorial/test-extension/src/background.ts typescript

Key responsibilities:
- **Protocol handling** - Discovery, key exchange, session management
- **Offscreen lifecycle** - Creating/checking the offscreen document
- **Message routing** - Forwarding wallet calls to offscreen
- **User approvals** - Triggering popups for connection/transaction approval

### Offscreen Document (`offscreen.ts`)

The offscreen document is where the heavy lifting happens:

#include_code pxe-instance docs/examples/webapp-tutorial/test-extension/src/offscreen/offscreen.ts typescript

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

#include_code wallet-config docs/examples/webapp-tutorial/test-extension/src/config.ts typescript

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
