---
title: "7. Testing"
description: Loading the wallet extension in Chrome and testing with the Pod Racing dApp
sidebar_position: 7
references: ["docs/examples/webapp-tutorial/esbuild.extension.mjs", "docs/examples/webapp-tutorial/test-extension/*"]
---

# Testing the Wallet Extension

This final section covers loading your wallet extension in Chrome and testing it with the Pod Racing dApp from the webapp tutorial.

## Building the Extension

From the `webapp-tutorial` directory:

:::warning Fix the wallet method handler in v6.0.0
In v6.0.0, `test-extension/src/offscreen/offscreen.ts` fails every wallet call that returns nothing, so creating a game from the dApp fails with `"undefined" is not valid JSON` (raised by `registerContract`). Before building, change this line in `handleWalletMethod`:

```typescript
const jsonSafe = JSON.parse(jsonStringify(result));
```

to:

```typescript
const jsonSafe = result === undefined ? undefined : JSON.parse(jsonStringify(result));
```
:::


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

## First launch

Click the extension icon to open the popup:

1. On the "Welcome to Aztec Wallet" screen, enter a password (at least 8 characters), confirm it, and click "Continue"
2. Under "Create Your First Account", enter an account name and click "Create Account"

The account appears with the status "Not Deployed".

## Deploying an account

1. Click "Deploy Account"
2. Wait for the transaction (it uses SponsoredFPC, so no tokens are needed)
3. The status changes to "Deployed"

If the deployment fails, the error appears above the "Deploy Account" button. See [Debugging](#debugging) for where to find the logs.

## Running the dApp

In another terminal, start the webapp tutorial:

```bash
cd docs/examples/webapp-tutorial

# Start the dev server
yarn dev
```

Open `http://localhost:5173` in Chrome.

## Connecting the wallet

1. In the dApp, set **Network** to "Browser Wallet"
2. The extension receives a **Connection Request** from `localhost:5173` and shows a badge. Open the popup and click "Connect"
3. Back in the dApp, click "Connect to Aztec Tutorial Wallet"
4. The dApp shows a grid of emojis, and the popup shows **Verify Connection** with the same emojis. If they match, click "Emojis Match"
5. The popup then shows a **Capabilities Request** listing the permissions the dApp asks for. Click "Approve"

The dApp now shows your account address and the game lobby.

## Creating a game

In the dApp, click "Deploy Contract & Create Game". The popup shows a **Send Transaction** approval for each transaction: first the contract deployment, then `create_game`. Review the function calls and click "Approve" for each.

Each transaction takes a little while because the proof is generated in the extension (WASM) and then included in a block.

## Playing the game

1. Set the track sliders (the total must be less than 10) and click "Submit Allocation"
2. Approve the `play_round` transaction in the popup
3. The dApp moves on to the next round

Each round is a private transaction: your allocation is stored as a private note, and only the round counter is public. To finish a game, a second player joins with the contract address and game ID shown in the dApp.

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
3. [ ] Set a password and create an account in the popup
4. [ ] Deploy the account (SponsoredFPC)
5. [ ] Start the dApp
6. [ ] Connect the wallet (approve the connection, emojis and capabilities in the popup)
7. [ ] Verify the account address shows in the dApp
8. [ ] Deploy the Pod Racing contract and create a game (approve in the popup)
9. [ ] Submit a round (approve the `play_round` transaction)
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
