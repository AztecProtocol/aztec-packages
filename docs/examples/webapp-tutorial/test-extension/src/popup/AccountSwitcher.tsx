import React from 'react';

import type { StoredAccount } from './types';
import { truncateAddress } from './helpers';

interface AccountSwitcherProps {
  accounts: StoredAccount[];
  activeAccount: string | null;
  onSelect: (address: string) => void;
  onCreateNew: () => void;
}

export function AccountSwitcher({ accounts, activeAccount, onSelect, onCreateNew }: AccountSwitcherProps) {
  return (
    <div className="section">
      {accounts.map((account) => {
        const isActive = activeAccount === account.address;
        return (
          <div
            key={account.address}
            className={`switcher-item ${isActive ? 'switcher-item-active' : ''}`}
            onClick={() => onSelect(account.address)}
          >
            <div className="switcher-item-info">
              <div className="switcher-item-name">
                {account.alias || 'Unnamed Account'}
              </div>
              <div className="switcher-item-address">
                {truncateAddress(account.address)}
              </div>
            </div>
            <div className="switcher-item-right">
              <span className={`account-status ${account.isDeployed ? 'status-deployed' : 'status-pending'}`}>
                {account.isDeployed ? 'Deployed' : 'Not Deployed'}
              </span>
              {isActive && <span className="switcher-checkmark">&#10003;</span>}
            </div>
          </div>
        );
      })}

      <button
        className="btn btn-primary btn-block"
        onClick={onCreateNew}
        style={{ marginTop: 12 }}
      >
        + Create Account
      </button>
    </div>
  );
}
