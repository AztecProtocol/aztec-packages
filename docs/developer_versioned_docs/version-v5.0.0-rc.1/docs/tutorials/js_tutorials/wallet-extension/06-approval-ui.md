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

```typescript title="main-app" showLineNumbers 
function App() {
  const [view, setView] = useState<View>('loading');
  const [accounts, setAccounts] = useState<PublicAccountInfo[]>([]);
  const [activeAccount, setActiveAccount] = useState<string | null>(null);
  const [discoveries, setDiscoveries] = useState<PendingDiscovery[]>([]);
  const [transactions, setTransactions] = useState<PendingTransaction[]>([]);
  const [connectedSites, setConnectedSites] = useState<ConnectedSite[]>([]);
  const [sessionVerifications, setSessionVerifications] = useState<PendingSessionVerification[]>([]);
  const [pendingCapabilities, setPendingCapabilities] = useState<PendingCapabilities[]>([]);
  const [runningTasks, setRunningTasks] = useState<BackgroundTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [pendingImportData, setPendingImportData] = useState<WalletExportData | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingCount = discoveries.length + transactions.length + sessionVerifications.length + pendingCapabilities.length;

  /**
   * Applies state pushed from the background via the port. (#10)
   * This is the single source of truth for pending items, tasks, and connected sites.
   */
  const applyBackgroundState = useCallback((data: any) => {
    if (data.discoveries) setDiscoveries(data.discoveries);
    if (data.transactions) setTransactions(data.transactions);
    if (data.pendingSessionVerifications) setSessionVerifications(data.pendingSessionVerifications);
    if (data.pendingCapabilities) setPendingCapabilities(data.pendingCapabilities);
    if (data.connectedSites) setConnectedSites(data.connectedSites);
    if (data.tasks) {
      setRunningTasks(data.tasks.filter((t: BackgroundTask) => t.status === 'running'));
      // Resolve any waitForTask promises for completed tasks (#12)
      for (const task of data.tasks) {
        handleTaskUpdate(task);
      }
    }
  }, []);

  /**
   * Loads account data and determines the initial view.
   * Pending items come from the port push, NOT from a separate fetch. (#10)
   */
  const loadData = useCallback(async () => {
    try {
      setError(null);

      const [accountsResult, activeAccountResult, statusResult] = await Promise.all([
        sendToBackground({ type: MessageTypes.GET_ACCOUNTS }),
        sendToBackground({ type: MessageTypes.GET_ACTIVE_ACCOUNT }),
        sendToBackground({ type: MessageTypes.GET_WALLET_STATUS }),
      ]);

      setAccounts(accountsResult || []);
      setActiveAccount(activeAccountResult || null);

      const unlocked = statusResult?.unlocked || false;
      const hasPassword = statusResult?.hasPassword || false;
      const hasAccounts = (accountsResult || []).length > 0;

      if (!hasPassword && !hasAccounts) {
        setView('setup');
      } else if (!unlocked) {
        setView('lock');
      } else {
        setView((prev) => prev === 'loading' ? 'main' : prev);
      }
    } catch (err: any) {
      console.error('Failed to load data:', err);
      setError(err.message);
      setView('setup');
    }
  }, []);

  /**
   * Connect persistent port to background. (#9)
   * Reconnects automatically if the background disconnects (e.g., SW restart).
   */
  const connectPort = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    try {
      const port = chrome.runtime.connect({ name: 'popup' });
      portRef.current = port;

      port.onMessage.addListener((message: any) => {
        if (message.type === 'state') {
          applyBackgroundState(message.data);

          // Auto-navigate to approvals/verification if there are pending items
          const d = message.data.discoveries?.length || 0;
          const t = message.data.transactions?.length || 0;
          const sv = message.data.pendingSessionVerifications?.length || 0;
          const c = message.data.pendingCapabilities?.length || 0;
          if (sv > 0) {
            setView((prev) => (prev === 'main' || prev === 'loading' || prev === 'approvals') ? 'verifySession' : prev);
          } else if (d > 0 || t > 0 || c > 0) {
            setView((prev) => (prev === 'main' || prev === 'loading') ? 'approvals' : prev);
          }
        } else if (message.type === 'task-update') {
          const task: BackgroundTask = message.task;
          handleTaskUpdate(task);

          setRunningTasks((prev) => {
            if (task.status === 'running') {
              const existing = prev.findIndex((t) => t.id === task.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = task;
                return updated;
              }
              return [...prev, task];
            }
            return prev.filter((t) => t.id !== task.id);
          });

          // Refresh account data if a state-changing task completed
          if (task.status === 'success') {
            const refreshTypes = ['create-account', 'deploy-account', 'unlock', 'setup-password', 'import-wallet-accounts'];
            if (refreshTypes.includes(task.type)) {
              loadData();
            }
          }
        }
      });

      port.onDisconnect.addListener(() => {
        console.log('[popup] Port disconnected, will reconnect...');
        portRef.current = null;
        // Reconnect after a short delay (SW may be restarting) (#9)
        reconnectTimerRef.current = setTimeout(connectPort, 1000);
      });

    } catch (err) {
      console.error('[popup] Failed to connect port:', err);
      // Retry connection (#9)
      reconnectTimerRef.current = setTimeout(connectPort, 2000);
    }
  }, [applyBackgroundState, loadData]);

  useEffect(() => {
    connectPort();
    loadData();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (portRef.current) {
        portRef.current.disconnect();
        portRef.current = null;
      }
    };
  }, [connectPort, loadData]);

  // Reactive auto-navigation: ensures the popup shows the right view whenever
  // pending items exist, even if the port message handler's auto-nav fired while
  // the popup was on a non-target view (e.g. 'setup' or 'lock').
  useEffect(() => {
    if (sessionVerifications.length > 0 &&
        (view === 'main' || view === 'loading' || view === 'approvals')) {
      setView('verifySession');
    } else if ((discoveries.length > 0 || transactions.length > 0 || pendingCapabilities.length > 0) &&
               (view === 'main' || view === 'loading')) {
      setView('approvals');
    }
  }, [sessionVerifications, discoveries, transactions, pendingCapabilities, view]);

  // Tick elapsed time while tasks are running
  useEffect(() => {
    if (runningTasks.length === 0) {
      setElapsed(0);
      return;
    }
    const oldest = Math.min(...runningTasks.map((t) => t.startedAt));
    setElapsed(Math.round((Date.now() - oldest) / 1000));
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - oldest) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [runningTasks]);

  const handleUnlocked = () => {
    setView('main');
    loadData();
  };

  const handleSetupComplete = async () => {
    if (pendingImportData) {
      try {
        const { taskId } = await sendToBackground({
          type: MessageTypes.IMPORT_WALLET_ACCOUNTS,
          accounts: pendingImportData.accounts,
          activeAccount: pendingImportData.activeAccount,
        });
        await waitForTask(taskId);
        setPendingImportData(null);
      } catch (err: any) {
        console.error('Failed to import accounts:', err);
        setError(err.message);
        setPendingImportData(null);
      }
    }
    setView('main');
    loadData();
  };

  const handleImportStart = (data: WalletExportData) => {
    setPendingImportData(data);
    sendToBackground({ type: MessageTypes.IMPORT_WALLET }).then(() => {
      setView('setup');
    }).catch((err) => {
      console.error('Failed to wipe wallet:', err);
      setError(err.message);
      setPendingImportData(null);
    });
  };

  const handleDisconnectSite = async (sessionId: string) => {
    try {
      await sendToBackground({ type: MessageTypes.DISCONNECT_SESSION, sessionId });
    } catch (err) {
      console.error('Failed to disconnect session:', err);
    }
  };

  const handleConfirmSession = async (sessionId: string) => {
    try {
      await sendToBackground({ type: MessageTypes.CONFIRM_SESSION, sessionId });
      setView('main');
    } catch (err) {
      console.error('Failed to confirm session:', err);
    }
  };

  const handleRejectSession = async (sessionId: string) => {
    try {
      await sendToBackground({ type: MessageTypes.REJECT_SESSION, sessionId });
      setView('main');
    } catch (err) {
      console.error('Failed to reject session:', err);
    }
  };

  const activeAccountData = accounts.find((a) => a.address === activeAccount) || accounts[0] || null;

  const handleApprovalClick = () => {
    if (sessionVerifications.length > 0) {
      setView('verifySession');
    } else {
      setView('approvals');
    }
  };

  const noopDisconnect = () => {};

  if (view === 'loading') {
    return (
      <div>
        <Header pendingCount={0} onApprovalClick={() => {}} connectedSites={[]} onDisconnect={noopDisconnect} onSettingsClick={() => {}} />
        <div className="loading">
          <div className="spinner" />
          Loading...
        </div>
      </div>
    );
  }

  if (view === 'setup') {
    return (
      <div>
        <Header pendingCount={0} onApprovalClick={() => {}} connectedSites={[]} onDisconnect={noopDisconnect} onSettingsClick={() => {}} />
        <SetupScreen onComplete={handleSetupComplete} skipAccountCreation={!!pendingImportData} />
      </div>
    );
  }

  if (view === 'lock') {
    return (
      <div>
        <Header pendingCount={0} onApprovalClick={() => {}} connectedSites={[]} onDisconnect={noopDisconnect} onSettingsClick={() => {}} />
        <LockScreen onUnlocked={handleUnlocked} />
      </div>
    );
  }

  if (view === 'approvals') {
    return (
      <div>
        <Header pendingCount={pendingCount} onApprovalClick={() => {}} connectedSites={connectedSites} onDisconnect={handleDisconnectSite} onSettingsClick={() => setView('settings')} />
        <SubHeader title="Approvals" onBack={() => setView('main')} />
        <ApprovalsView
          discoveries={discoveries}
          transactions={transactions}
          pendingCapabilities={pendingCapabilities}
          onRefresh={loadData}
        />
      </div>
    );
  }

  if (view === 'verifySession') {
    const currentVerification = sessionVerifications[0];
    return (
      <div>
        <Header pendingCount={pendingCount} onApprovalClick={() => {}} connectedSites={connectedSites} onDisconnect={handleDisconnectSite} onSettingsClick={() => setView('settings')} />
        <SubHeader title="Verify Connection" onBack={() => setView('main')} />
        {currentVerification ? (
          <SessionVerificationView
            verification={currentVerification}
            onConfirm={() => handleConfirmSession(currentVerification.sessionId)}
            onReject={() => handleRejectSession(currentVerification.sessionId)}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">&#10003;</div>
            <div className="empty-text">No pending verifications</div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'switcher') {
    return (
      <div>
        <Header pendingCount={pendingCount} onApprovalClick={handleApprovalClick} connectedSites={connectedSites} onDisconnect={handleDisconnectSite} onSettingsClick={() => setView('settings')} />
        <SubHeader title="Switch Account" onBack={() => setView('main')} />
        <AccountSwitcher
          accounts={accounts}
          activeAccount={activeAccount}
          onSelect={(address) => {
            sendToBackground({ type: MessageTypes.SET_ACTIVE_ACCOUNT, address })
              .then(() => { setActiveAccount(address); setView('main'); })
              .catch((err) => console.error('Failed to switch account:', err));
          }}
          onCreateNew={() => setView('createAccount')}
        />
      </div>
    );
  }

  if (view === 'createAccount') {
    return (
      <div>
        <Header pendingCount={pendingCount} onApprovalClick={handleApprovalClick} connectedSites={connectedSites} onDisconnect={handleDisconnectSite} onSettingsClick={() => setView('settings')} />
        <SubHeader title="Create Account" onBack={() => setView('switcher')} />
        <CreateAccountView onCreated={() => { setView('main'); loadData(); }} />
      </div>
    );
  }

  if (view === 'settings') {
    return (
      <div>
        <Header pendingCount={pendingCount} onApprovalClick={handleApprovalClick} connectedSites={connectedSites} onDisconnect={handleDisconnectSite} onSettingsClick={() => {}} />
        <SubHeader title="Settings" onBack={() => setView('main')} />
        <SettingsPage onImportStart={handleImportStart} />
      </div>
    );
  }

  // Main view
  return (
    <div>
      <Header pendingCount={pendingCount} onApprovalClick={handleApprovalClick} connectedSites={connectedSites} onDisconnect={handleDisconnectSite} onSettingsClick={() => setView('settings')} />

      {error && <div className="message message-error">{error}</div>}

      {runningTasks.length > 0 && (
        <div className="task-banner">
          <div className="spinner" />
          <div style={{ flex: 1 }}>
            {runningTasks.map((t) => {
              const labels: Record<string, string> = {
                'deploy-account': 'Deploying account...',
                'create-account': 'Creating account...',
                'unlock': 'Unlocking wallet...',
                'setup-password': 'Setting up password...',
                'export-wallet': 'Exporting wallet...',
                'import-wallet-accounts': 'Importing accounts...',
              };
              const genericLabel = t.type.startsWith('wallet:')
                ? `Processing ${t.type.replace('wallet:', '')}...`
                : t.type.startsWith('tx:')
                  ? `Executing ${t.type.replace('tx:', '')}...`
                  : labels[t.type] || 'Processing...';
              return (
                <div key={t.id}>
                  <div>{t.progress || genericLabel}</div>
                  {t.progress && (
                    <div className="task-progress-stage">{genericLabel}</div>
                  )}
                </div>
              );
            })}
            <div style={{ fontSize: 10, color: '#6b5f50', marginTop: 1 }}>
              Elapsed: {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </div>
          </div>
        </div>
      )}

      {activeAccountData ? (
        <MainPage
          account={activeAccountData}
          busy={runningTasks.length > 0}
          onSwitcherOpen={() => setView('switcher')}
          onRefresh={loadData}
        />
      ) : (
        <div className="empty-state">
          <div className="empty-icon">&#128091;</div>
          <div className="empty-text">No accounts yet</div>
          <button
            className="btn btn-primary"
            onClick={() => setView('createAccount')}
            disabled={runningTasks.length > 0}
            style={{ marginTop: 12 }}
          >
            + Create Account
          </button>
        </div>
      )}
    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/popup/popup.tsx#L34-L463" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/popup/popup.tsx#L34-L463</a></sub></sup>


Key features:
- **Persistent port** to background for real-time push updates (no polling)
- Auto-reconnects if the background service worker restarts
- Auto-switches to Approvals if there are pending items
- Loads accounts and pending items on mount

## Communication with Background

The popup sends messages to the background script:

```typescript title="send-message" showLineNumbers 
/**
 * Sends a message to the background script via chrome.runtime.sendMessage.
 * Used for simple request/response calls (accounts, status, approvals).
 */
export function sendToBackground(message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { ...message, target: MessageTarget.BACKGROUND },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response?.success) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || 'Unknown error'));
        }
      }
    );
  });
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/popup/helpers.ts#L4-L27" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/popup/helpers.ts#L4-L27</a></sub></sup>


The popup targets the background explicitly with `target: MessageTarget.BACKGROUND` to distinguish from content script messages.

## Main Page

The main page shows the active account and provides key actions:

```typescript title="main-page" showLineNumbers 
interface MainPageProps {
  account: StoredAccount;
  busy: boolean;
  onSwitcherOpen: () => void;
  onRefresh: () => void;
}

export function MainPage({ account, busy, onSwitcherOpen, onRefresh }: MainPageProps) {
  const [deployError, setDeployError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleDeploy = async () => {
    setDeployError(null);
    try {
      const { taskId } = await sendToBackground({
        type: MessageTypes.DEPLOY_ACCOUNT,
        address: account.address,
      });
      await waitForTask(taskId);
      onRefresh();
    } catch (err: any) {
      setDeployError(err.message);
    }
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(account.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="section">
      {/* Account selector pill */}
      <button className="account-selector" onClick={onSwitcherOpen} disabled={busy}>
        <span className="account-selector-name">{account.alias || 'Unnamed Account'}</span>
        <span className="account-selector-arrow">&#9662;</span>
      </button>

      {/* Account detail card */}
      <div className="account-detail-card">
        <div className="account-detail-status">
          <span className={`account-status ${account.isDeployed ? 'status-deployed' : 'status-pending'}`}>
            {account.isDeployed ? 'Deployed' : 'Not Deployed'}
          </span>
        </div>

        <div className="account-detail-address" onClick={copyAddress} title="Click to copy">
          {account.address}
        </div>

        <button className="btn btn-secondary btn-small" onClick={copyAddress}>
          {copied ? 'Copied!' : 'Copy Address'}
        </button>
      </div>

      {/* Deploy button */}
      {!account.isDeployed && (
        <div style={{ marginTop: 12 }}>
          {deployError && <div className="message message-error">{deployError}</div>}
          <button
            className="btn btn-primary btn-block"
            onClick={handleDeploy}
            disabled={busy}
          >
            Deploy Account
          </button>
        </div>
      )}

    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/popup/MainScreen.tsx#L7-L81" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/popup/MainScreen.tsx#L7-L81</a></sub></sup>


Features:
- Active account with alias and truncated address
- Deployment status indicator with deploy button for undeployed accounts
- Account switcher for selecting between multiple accounts
- Navigation to create-account and settings views

## Connection Approval

When a dApp requests connection, the wallet shows the approval UI:

```typescript title="connection-approval" showLineNumbers 
interface ConnectionApprovalProps {
  discovery: PendingDiscovery;
  onApprove: () => void;
  onReject: () => void;
  processing: boolean;
}

function ConnectionApproval({
  discovery,
  onApprove,
  onReject,
  processing,
}: ConnectionApprovalProps) {
  return (
    <div className="approval-card">
      <div className="approval-header">
        <div className="approval-icon">&#128279;</div>
        <div>
          <div className="approval-origin">{getOriginHost(discovery.origin)}</div>
          <div className="approval-type">Connection Request</div>
        </div>
      </div>

      <div className="approval-details">
        <div className="detail-row">
          <span className="detail-label">Origin</span>
          <span className="detail-value">{discovery.origin}</span>
        </div>
        {discovery.appId && (
          <div className="detail-row">
            <span className="detail-label">App ID</span>
            <span className="detail-value">{discovery.appId}</span>
          </div>
        )}
      </div>

      <div className="btn-group">
        <button
          className="btn btn-danger"
          onClick={onReject}
          disabled={processing}
        >
          Reject
        </button>
        <button
          className="btn btn-primary"
          onClick={onApprove}
          disabled={processing}
        >
          {processing ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/popup/ApprovalView.tsx#L142-L198" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/popup/ApprovalView.tsx#L142-L198</a></sub></sup>


The approval shows:
- Origin URL (the dApp's domain)
- App ID if provided
- Connect/Reject buttons

The wallet also includes emoji verification for secure channel confirmation — see the `session-verification` marker in the popup source.

## Transaction Approval

Transaction approvals show more detail:

```typescript title="transaction-approval" showLineNumbers 
interface TransactionApprovalProps {
  transaction: PendingTransaction;
  onApprove: () => void;
  onReject: () => void;
  processing: boolean;
}

function TransactionApproval({
  transaction,
  onApprove,
  onReject,
  processing,
}: TransactionApprovalProps) {
  const methodLabels: Record<string, string> = {
    sendTx: 'Send Transaction',
    simulateTx: 'Simulate Transaction',
    createAuthWit: 'Create Authorization',
    profileTx: 'Profile Transaction',
    batch: 'Batch Transaction',
  };

  return (
    <div className="approval-card">
      <div className="approval-header">
        <div className="approval-icon">&#128221;</div>
        <div>
          <div className="approval-origin">{getOriginHost(transaction.origin)}</div>
          <div className="approval-type">
            {methodLabels[transaction.method] || transaction.method}
          </div>
        </div>
      </div>

      <div className="approval-details">
        <div className="detail-row">
          <span className="detail-label">From</span>
          <span className="detail-value">{truncateAddress(transaction.from)}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Method</span>
          <span className="detail-value">{transaction.method}</span>
        </div>

        {/* sendTx: show function calls from the execution payload (args[0]) */}
        {transaction.method === 'sendTx' && transaction.args?.[0]?.calls && (
          <div className="tx-calls">
            <div className="detail-label">Function Calls:</div>
            {transaction.args[0].calls.map((call: any, i: number) => (
              <div key={i} className="tx-call">
                <div className="tx-call-header">{call.name || 'Unknown Function'}</div>
                <div className="tx-call-arg">Contract: {truncateAddress(call.to?.toString?.() || '')}</div>
              </div>
            ))}
          </div>
        )}

        {/* batch: show list of batched operations and their function calls */}
        {transaction.method === 'batch' && Array.isArray(transaction.args?.[0]) && (
          <div className="tx-calls">
            <div className="detail-label">Batched Operations:</div>
            {transaction.args[0].map((method: any, i: number) => (
              <div key={i} className="tx-call">
                <div className="tx-call-header">
                  {methodLabels[method.name] || method.name}
                </div>
                {method.name === 'sendTx' && method.args?.[0]?.calls?.map((call: any, j: number) => (
                  <div key={j} className="tx-call-arg">
                    {call.name || 'Unknown'} &rarr; {truncateAddress(call.to?.toString?.() || '')}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="btn-group">
        <button
          className="btn btn-danger"
          onClick={onReject}
          disabled={processing}
        >
          Reject
        </button>
        <button
          className="btn btn-primary"
          onClick={onApprove}
          disabled={processing}
        >
          {processing ? 'Processing...' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/popup/ApprovalView.tsx#L200-L296" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/popup/ApprovalView.tsx#L200-L296</a></sub></sup>


The popup displays:
- Origin and method type (sendTx, simulateTx, etc.)
- From address (the signing account)
- Function calls being made (if available)
- Approve/Reject buttons

## Helper Functions

Utility for address truncation:

```typescript title="helpers" showLineNumbers 
export function truncateAddress(address: string): string {
  if (!address) return '';
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

/**
 * Creates an account and sets it as active.
 * Shared between SetupScreen (first account) and CreateAccountView (additional accounts).
 */
export async function createAndActivateAccount(alias: string): Promise<void> {
  const { taskId } = await sendToBackground({
    type: MessageTypes.CREATE_ACCOUNT,
    alias,
  });
  const result = await waitForTask(taskId);

  if (result?.address) {
    await sendToBackground({
      type: MessageTypes.SET_ACTIVE_ACCOUNT,
      address: result.address,
    });
  }
}
```
> <sup><sub><a href="https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/src/popup/helpers.ts#L75-L100" target="_blank" rel="noopener noreferrer">Source code: docs/examples/webapp-tutorial/test-extension/src/popup/helpers.ts#L75-L100</a></sub></sup>


## Styling

The CSS provides a dark theme suited for wallet UIs:

See the full stylesheet at [`popup/popup.css`](https://github.com/AztecProtocol/aztec-packages/blob/v5.0.0-rc.1/docs/examples/webapp-tutorial/test-extension/popup/popup.css).

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
