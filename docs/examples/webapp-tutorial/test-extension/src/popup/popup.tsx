/**
 * Popup UI for the Aztec Tutorial Wallet.
 *
 * MetaMask-like layout with:
 * - Setup screen (first-time password + first account)
 * - Lock screen (unlock with master password)
 * - Main page (active account detail, deploy button)
 * - Account switcher overlay
 * - Create account sub-page
 * - Approvals view for connection/transaction requests
 *
 * Communication:
 * - Persistent port to background for real-time push updates (no polling)
 * - Port auto-reconnects if background disconnects (#9)
 * - Initial state comes from the port, not separate fetches (#10)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { MessageTypes } from '../config';
import type { WalletExportData, PublicAccountInfo, PendingTransaction, PendingCapabilities, ConnectedSite, PendingSessionVerification, BackgroundTask, View } from '../shared-types';
import type { PendingDiscovery } from '@aztec/wallet-sdk/extension/handlers';
import { sendToBackground, waitForTask, handleTaskUpdate } from './helpers';
import { Header, SubHeader } from './Header';
import { SetupScreen } from './SetupScreen';
import { LockScreen } from './LockScreen';
import { MainPage } from './MainScreen';
import { AccountSwitcher } from './AccountSwitcher';
import { CreateAccountView } from './CreateAccountView';
import { ApprovalsView, SessionVerificationView } from './ApprovalView';
import { SettingsPage } from './SettingsPage';

// docs:start:main-app
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
// docs:end:main-app

// Mount the app
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
