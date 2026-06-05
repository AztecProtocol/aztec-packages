---
title: "6. Approval UI"
description: Building React popups for connection and transaction approval in Aztec wallet extensions
sidebar_position: 6
---

# Approval UI

The popup is the user-facing part of the wallet. It displays accounts, pending approvals, and handles user interactions. This section covers building the React-based popup.

## Popup Structure

The popup is a small React app rendered when clicking the extension icon:

```text
popup/
├── popup.html          # HTML entry point
├── popup.css           # Styles
└── src/popup/
    ├── popup.tsx        # Top-level orchestrator (state machine + routing)
    ├── helpers.ts       # sendToBackground, waitForTask, truncateAddress
    ├── types.ts         # Shared TypeScript interfaces
    ├── Header.tsx       # Header + SubHeader components
    ├── SetupScreen.tsx  # First-time password setup
    ├── LockScreen.tsx   # Unlock with password
    ├── MainScreen.tsx   # Active account detail + deploy
    ├── AccountSwitcher.tsx  # Account list overlay
    ├── CreateAccountView.tsx # New account creation
    ├── ApprovalView.tsx # Connection + transaction approvals
    └── SettingsPage.tsx # Export/import wallet
```

The HTML loads the compiled JavaScript:

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="../dist/popup.js"></script>
</body>
</html>
```

## Main App Component

The popup is split into focused components. The top-level `popup.tsx` acts as an orchestrator with a state machine that routes between views: setup, lock, main, create-account, approvals, session-verification, and settings.

#include_code main-app docs/examples/webapp-tutorial/test-extension/src/popup/popup.tsx typescript

Key features:
- **Persistent port** to background for real-time push updates (no polling)
- Auto-reconnects if the background service worker restarts
- Auto-switches to Approvals if there are pending items
- Loads accounts and pending items on mount

## Communication with Background

The popup sends messages to the background script:

#include_code send-message docs/examples/webapp-tutorial/test-extension/src/popup/helpers.ts typescript

The popup targets the background explicitly with `target: MessageTarget.BACKGROUND` to distinguish from content script messages.

## Main Page

The main page shows the active account and provides key actions:

#include_code main-page docs/examples/webapp-tutorial/test-extension/src/popup/MainScreen.tsx typescript

Features:
- Active account with alias and truncated address
- Deployment status indicator with deploy button for undeployed accounts
- Account switcher for selecting between multiple accounts
- Navigation to create-account and settings views

## Connection Approval

When a dApp requests connection, the wallet shows the approval UI:

#include_code connection-approval docs/examples/webapp-tutorial/test-extension/src/popup/ApprovalView.tsx typescript

The approval shows:
- Origin URL (the dApp's domain)
- App ID if provided
- Connect/Reject buttons

The wallet also includes emoji verification for secure channel confirmation — see the `session-verification` marker in the popup source.

## Transaction Approval

Transaction approvals show more detail:

#include_code transaction-approval docs/examples/webapp-tutorial/test-extension/src/popup/ApprovalView.tsx typescript

The popup displays:
- Origin and method type (sendTx, simulateTx, etc.)
- From address (the signing account)
- Function calls being made (if available)
- Approve/Reject buttons

## Helper Functions

Utility for address truncation:

#include_code helpers docs/examples/webapp-tutorial/test-extension/src/popup/helpers.ts typescript

## Styling

The CSS provides a dark theme suited for wallet UIs:

See the full stylesheet at [`popup/popup.css`](https://github.com/AztecProtocol/aztec-packages/blob/#include_aztec_version/docs/examples/webapp-tutorial/test-extension/popup/popup.css).

Key design choices:
- Dark background (`#1a1a2e`) for modern look
- Orange accent color (`#ff6b00`) for Aztec branding
- Compact cards for account and approval display
- Clear visual hierarchy with section titles

## State Management

The popup uses React's `useState` for local state:

```typescript
const [view, setView] = useState<View>('loading');
const [accounts, setAccounts] = useState<StoredAccount[]>([]);
const [activeAccount, setActiveAccount] = useState<string | null>(null);
const [discoveries, setDiscoveries] = useState<PendingDiscovery[]>([]);
const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>([]);
const [sessionVerifications, setSessionVerifications] = useState<PendingSessionVerification[]>([]);
const [error, setError] = useState<string | null>(null);
```

For a production wallet, consider:
- Redux or Zustand for complex state
- React Query for async data fetching
- Local storage for UI preferences

## Error Handling

Errors are displayed inline:

```typescript
{error && <div className="message message-error">{error}</div>}
{success && <div className="message message-success">{success}</div>}
```

Common errors:
- Wrong password (decryption fails)
- Network errors (node unreachable)
- Transaction failures (contract reverts)

## Loading States

The popup shows spinners during async operations:

```typescript
{loading ? (
  <div className="loading">
    <div className="spinner" />
    Loading...
  </div>
) : (
  // Content
)}
```

And disable buttons during processing:

```typescript
<button disabled={processing}>
  {processing ? 'Processing...' : 'Approve'}
</button>
```

## Building the Popup

The popup is built by **Vite** (not esbuild) as part of the main extension build. Vite handles JSX transformation, React support, and bundling:

```bash
node esbuild.extension.mjs
# Step 1: Vite builds background, offscreen, and popup (with React JSX support)
# Step 2: esbuild builds the content script separately as IIFE
# Step 3-4: Copy static files (offscreen HTML, WASM binaries)
```

## Popup Dimensions

The popup size is controlled by CSS:

```css
body {
  width: 360px;
  min-height: 400px;
}
```

Chrome allows popups up to 800x600, but 360x500 is typical for wallets.

## Security Considerations

For production popups:

1. **Input validation** - Sanitize all displayed data
2. **Origin verification** - Always show full origin for approvals
3. **Confirmation dialogs** - For destructive actions
4. **Rate limiting** - Prevent rapid-fire approvals
5. **Session timeout** - Auto-lock after inactivity

## Accessibility

The current UI is minimal. Production improvements:

- Keyboard navigation
- ARIA labels
- Screen reader support
- High contrast mode
- Focus management

## Testing the Popup

To test popup changes:

1. Rebuild: `node esbuild.extension.mjs`
2. Go to `chrome://extensions/`
3. Click refresh on the extension
4. Click the extension icon

DevTools for popup:
1. Right-click the popup
2. Select "Inspect"
3. Use Console and Elements tabs

## Next Steps

With the UI complete, let's put it all together in [Testing](./07-testing.md) - loading the extension and testing with the Pod Racing dApp.
