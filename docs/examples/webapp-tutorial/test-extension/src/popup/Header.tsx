import React, { useState, useEffect, useRef } from 'react';

import { getOriginHost } from '../utils';
import type { ConnectedSite } from './types';

export function Header({ pendingCount, onApprovalClick, connectedSites, onDisconnect, onSettingsClick }: {
  pendingCount: number;
  onApprovalClick: () => void;
  connectedSites: ConnectedSite[];
  onDisconnect: (sessionId: string) => void;
  onSettingsClick: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const connected = connectedSites.length > 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showDropdown]);

  return (
    <div className="header">
      <h1>Aztec Wallet</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="network-badge">local</span>

        <div className="connection-status-wrapper" ref={dropdownRef}>
          <button
            className={`connection-status ${connected ? 'connection-status-connected' : ''}`}
            onClick={() => connected && setShowDropdown((v) => !v)}
            style={{ cursor: connected ? 'pointer' : 'default' }}
          >
            <span className={`connection-dot ${connected ? 'connection-dot-active' : ''}`} />
            {connected ? (
              <>
                <span className="connection-label">{getOriginHost(connectedSites[0].origin)}</span>
                {connectedSites.length > 1 && (
                  <span className="connection-count">+{connectedSites.length - 1}</span>
                )}
              </>
            ) : (
              <span className="connection-label">Not Connected</span>
            )}
          </button>

          {showDropdown && connected && (
            <div className="connection-dropdown">
              {connectedSites.map((site) => (
                <div key={site.sessionId} className="connection-dropdown-item">
                  <span className="connection-dropdown-origin">{getOriginHost(site.origin)}</span>
                  <button
                    className="btn btn-danger btn-small"
                    onClick={() => {
                      onDisconnect(site.sessionId);
                      if (connectedSites.length <= 1) setShowDropdown(false);
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          className={`notification-badge${pendingCount === 0 ? ' notification-badge-empty' : ''}`}
          onClick={onApprovalClick}
          disabled={pendingCount === 0}
          title={pendingCount > 0 ? 'Pending approvals' : 'No pending approvals'}
        >
          {pendingCount > 0 ? pendingCount : '\u{1F514}'}
        </button>

        <button
          className="settings-gear"
          onClick={onSettingsClick}
          title="Settings"
        >
          &#9881;
        </button>
      </div>
    </div>
  );
}

export function SubHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sub-header">
      <button className="back-button" onClick={onBack}>
        &#8592;
      </button>
      <span className="sub-header-title">{title}</span>
    </div>
  );
}
