# Aztec Tutorial Wallet Extension

A functional Chrome extension wallet for Aztec that demonstrates how to build a real wallet with:

- **Encrypted key storage** using PBKDF2 + AES-GCM
- **SponsoredFPC fee payment** so users don't need fee tokens
- **Transaction approval UI** for secure transaction signing
- **Connection approval** with the wallet SDK protocol

This wallet connects to a local Aztec network and is designed for learning how to build wallet extensions for Aztec.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  Content Script (content-script.ts)                          │
│  - Relays messages between page and background               │
└──────────────────────┬──────────────────────────────────────┘
                       │ chrome.runtime messages
┌──────────────────────▼──────────────────────────────────────┐
│  Service Worker (background.ts)                              │
│  - Handles wallet SDK protocol (discovery, key exchange)     │
│  - Routes wallet method calls to offscreen document          │
│  - Manages popup for user approvals                          │
└──────────────────────┬──────────────────────────────────────┘
                       │ chrome.runtime messages
┌──────────────────────▼──────────────────────────────────────┐
│  Offscreen Document (offscreen.ts)                           │
│  - Runs PXE instance (long-lived, supports WASM)             │
│  - Extends BaseWallet with SponsoredFPC fee payment          │
│  - Manages accounts (create, store, sign)                    │
└──────────────────────────────────────────────────────────────┘
```

### Why Offscreen Document?

Service workers have a 5-minute inactivity timeout and don't fully support long-running WASM operations. The PXE needs persistent state and proof generation, so the extension uses a Manifest V3 offscreen document that can run longer and supports IndexedDB/WASM.

## Building

From the `webapp-tutorial` directory:

```bash
# Full build with Vite (includes PXE and all dependencies)
yarn build:wallet-extension

# Or using npx directly:
npx vite build --config vite.extension.config.ts
```

This compiles:
- `src/background.ts` → `dist/background.js`
- `src/content-script.ts` → `dist/content-script.js`
- `src/offscreen/offscreen.ts` → `dist/offscreen.js` (includes PXE and kernel circuits)
- `src/popup/popup.tsx` → `dist/popup.js`

**Note:** `node esbuild.extension.mjs` is the primary build command. It runs the full Vite build (background, offscreen, popup) plus esbuild for the content script, and copies static files to the correct locations.

## Installing in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `test-extension` folder
5. The extension "Aztec Tutorial Wallet" should appear

## Using the Wallet

### Create an Account

1. Click the extension icon in Chrome toolbar
2. Click "Create New Account"
3. Enter a password to encrypt your keys
4. The account address will appear (not yet deployed)

### Deploy an Account

1. Enter your password in the password field
2. Click "Deploy" next to an undeployed account
3. Wait for the transaction to complete (uses SponsoredFPC for fees)

### Connect to a dApp

1. Visit a dApp that uses `@aztec/wallet-sdk`
2. When the dApp calls `aztec.connect()`, a connection request appears
3. Click the extension icon to see the pending approval
4. Click "Connect" to approve

### Approve Transactions

1. When a dApp calls `sendTx()`, the extension shows an approval popup
2. Review the transaction details
3. Click "Approve" to sign and submit

Note: `simulateTx()` does **not** require approval — it auto-executes because simulations are read-only and don't change state. Only `sendTx()` (which submits a state-changing transaction) triggers the approval popup.

## File Structure

```text
test-extension/
├── manifest.json              # Chrome extension manifest
├── popup/
│   ├── popup.html            # Popup UI HTML
│   └── popup.css             # Popup styles
├── src/
│   ├── background.ts         # Service worker - protocol + routing
│   ├── content-script.ts     # Page <-> background relay
│   ├── config.ts             # Constants and message types
│   ├── account-utils.ts      # Shared account instantiation logic
│   ├── aztec-imports.ts      # Lazy import caching for Aztec modules
│   ├── utils.ts              # Chrome runtime helpers and utilities
│   ├── offscreen/
│   │   ├── offscreen.html    # Offscreen document HTML
│   │   └── offscreen.ts      # PXE host + wallet implementation
│   ├── popup/
│   │   └── popup.tsx         # React popup component
│   └── wallet/
│       ├── wallet-impl.ts    # ExtensionWalletManager - secret generation and encrypted storage
│       └── storage.ts        # Encrypted key storage
└── dist/                      # Compiled JavaScript (gitignored)
```

## Key Implementation Details

### SponsoredFPC Fee Payment

The wallet overrides `completeFeeOptions()` to use SponsoredFPC by default:

```typescript
override async completeFeeOptions(config) {
  if (!config.feePayer) {
    const sponsoredFPC = await getSponsoredFPCContract();
    return {
      walletFeePaymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
      accountFeePaymentMethodOptions: AccountFeePaymentMethodOptions.EXTERNAL,
      // ...
    };
  }
  return super.completeFeeOptions(config);
}
```

### Encrypted Key Storage

Account secrets are encrypted with the user's password:

1. Generate random salt and IV
2. Derive AES-256-GCM key from password using PBKDF2 (600,000 iterations)
3. Encrypt secret with AES-GCM
4. Store encrypted data in `chrome.storage.local`

### Message Routing

1. **Content script** receives messages from page, forwards to background
2. **Background** handles wallet SDK protocol, forwards wallet calls to offscreen
3. **Offscreen** executes wallet methods using PXE, returns results
4. **Popup** sends approval/rejection messages to background

## Debugging

### Background Script (Service Worker)

1. Go to `chrome://extensions/`
2. Find "Aztec Tutorial Wallet"
3. Click "Service Worker" under "Inspect views"
4. Check Console for `[background]` logs

### Offscreen Document

1. Open `chrome://extensions/`
2. Find "Aztec Tutorial Wallet"
3. Look for "Offscreen document" in "Inspect views"
4. Check Console for `[offscreen]` logs

### Content Script

1. Open DevTools on any page where the extension is active
2. Check Console for `[content-script]` logs (may be filtered by extension)

## Security Notes

This is a **tutorial wallet** for learning purposes. For production:

- Use hardware security modules or secure enclaves for key storage
- Implement proper session management and auto-lock
- Add transaction simulation previews
- Support multiple networks with network switching
- Implement proper error recovery

## Related Documentation

See the wallet extension tutorial and webapp tutorial in the Aztec documentation site for full explanations of this implementation and how to build dApps that connect to wallets.
