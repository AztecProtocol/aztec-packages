import React, { useState } from 'react';

import { MessageTypes } from '../config';
import type { StoredAccount } from './types';
import { sendToBackground, waitForTask } from './helpers';

// docs:start:main-page
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
// docs:end:main-page
