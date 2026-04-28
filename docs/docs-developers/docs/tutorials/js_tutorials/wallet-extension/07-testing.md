---
title: "7. Testing"
description: Loading the wallet extension in Chrome and testing with the Pod Racing dApp
sidebar_position: 7
---

# Testing the Wallet Extension

This final section covers loading your wallet extension in Chrome and testing it with the Pod Racing dApp from the webapp tutorial.

## Building the Extension

From the `webapp-tutorial` directory:

```bash
# Install dependencies if needed
yarn install

# Build the extension
node esbuild.extension.mjs
```

You should see:

```text
Extension build complete!
```

The build creates:
- `test-extension/dist/background.js`
- `test-extension/dist/content-script.js`
- `test-extension/dist/offscreen.js`
- `test-extension/dist/popup.js`

## Loading in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `test-extension` folder (not `dist/`)
5. The extension "Aztec Tutorial Wallet" should appear

You should see:
- Extension icon in the toolbar
- "Service Worker" link under "Inspect views"

## First Launch

Click the extension icon to open the popup:

1. You'll see the setup screen prompting you to create a master password
2. Enter and confirm your password, then click "Create Wallet"
3. Once the password is set, you'll be prompted to create your first account
4. Enter an account alias (optional) and click "Create Account"

The account appears with status "Pending" (not deployed yet).

## Deploying an Account

To deploy the account contract:

1. The wallet should already be unlocked from the setup step above
2. Click "Deploy" next to the account
3. Wait for the transaction (uses SponsoredFPC, no tokens needed)
4. Status changes to "Deployed"

Check the console (Service Worker inspector) for logs:

```text
[offscreen] Initializing wallet...
[offscreen] Wallet initialized
[offscreen] Received message: deploy-account
```

## Running the dApp

In another terminal, start the webapp tutorial:

```bash
cd docs/examples/webapp-tutorial

# Start the dev server
yarn dev
```

Open `http://localhost:5173` in Chrome.

## Connecting the Wallet

1. In the dApp, select network "Browser Wallet"
2. Click "Connect Wallet"
3. Choose "Browser Wallet"

The extension should:
1. Show a badge with "1" (pending connection)
2. When you click the icon, show the connection request

To approve:
1. Click the extension icon
2. Go to "Approvals" tab
3. Review the origin (localhost:5173)
4. Click "Connect"

The dApp should now show your account address.

## Deploying a Contract

In the dApp:

1. Click "Deploy Pod Racing Contract"
2. The extension shows a pending transaction

To approve:
1. Click the extension icon
2. Go to "Approvals" tab
3. Review the transaction:
   - From: your account address
   - Method: sendTx
   - Calls: contract deployment
4. Click "Approve"

Wait for the transaction to complete. This takes 30-60 seconds due to:
- Proof generation (WASM)
- Block confirmation

## Playing the Game

Once deployed:

1. Click "Boost" in the dApp
2. Approve the transaction in the extension
3. Watch your pod accelerate!

Each boost is a private transaction that:
- Updates your pod's speed (private state)
- Generates a ZK proof
- Gets included in a block

## Debugging

### Background Script

1. Go to `chrome://extensions/`
2. Find "Aztec Tutorial Wallet"
3. Click "Service Worker" under "Inspect views"
4. Check Console for `[background]` logs

### Offscreen Document

1. On the extensions page, look for "Offscreen document"
2. Click to open DevTools
3. Check Console for `[offscreen]` logs

### Content Script

1. Open DevTools on the dApp page (F12)
2. Check Console for `[content-script]` logs
3. May need to filter by extension

### Common Issues

**"Cannot read properties of undefined"**
- PXE (Private eXecution Environment) hasn't initialized yet
- Check offscreen console for initialization errors

**"Account not found"**
- Account isn't loaded in memory
- Try entering password to unlock

**"Transaction rejected"**
- Check if the Aztec node is reachable
- Verify SponsoredFPC is registered

**Popup doesn't show pending items**
- Refresh the popup (close and reopen)
- Check background console for errors

## Verifying on Explorer

If your network has a block explorer, you can verify transactions:

1. Copy your transaction hash from logs
2. Visit the explorer
3. Search for the transaction
4. Verify it's included in a block

## Reloading After Changes

When you modify the extension:

1. Rebuild: `node esbuild.extension.mjs`
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension
4. Reload any open dApp pages

## End-to-End Test Flow

Complete test checklist:

1. [ ] Build extension
2. [ ] Load in Chrome
3. [ ] Create account in popup
4. [ ] Deploy account (SponsoredFPC)
5. [ ] Start dApp
6. [ ] Connect wallet (approve in popup)
7. [ ] Verify account shows in dApp
8. [ ] Deploy Pod Racing contract (approve in popup)
9. [ ] Play game (approve boost transactions)
10. [ ] Check transactions in explorer

## Production Considerations

Before releasing a wallet extension:

1. **Security audit** - Professional review of crypto code
2. **Key management** - Consider hardware wallet support
3. **Network switching** - Support testnet, mainnet
4. **Error recovery** - Graceful handling of failures
5. **Backup/restore** - Seed phrase support
6. **Multi-account** - Better account management UI
7. **Transaction history** - Show past transactions
8. **Note management** - Display synced notes

## Summary

You've built a functional wallet extension that:

- Creates and stores encrypted accounts
- Deploys contracts using SponsoredFPC
- Connects to dApps via the wallet SDK protocol
- Approves transactions with a popup UI
- Generates ZK proofs for private transactions

This is the foundation for a production Aztec wallet. The architecture patterns - offscreen documents, message routing, BaseWallet extension - apply to any browser wallet.

## What's Next?

- Add more account types (ECDSA, multisig)
- Implement transaction history
- Add network switching
- Build a note browser
- Support hardware wallets

Happy building!
