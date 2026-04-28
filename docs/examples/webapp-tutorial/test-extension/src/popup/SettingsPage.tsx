import React, { useState, useRef } from 'react';

import { MessageTypes, AZTEC_PACKAGES_VERSION } from '../config';
import type { WalletExportData } from '../shared-types';
import { sendToBackground, waitForTask } from './helpers';

export function SettingsPage({ onImportStart }: { onImportStart: (data: WalletExportData) => void }) {
  const [exporting, setExporting] = useState(false);
  const [importPreview, setImportPreview] = useState<WalletExportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const { taskId } = await sendToBackground({ type: MessageTypes.EXPORT_WALLET });
      const result = await waitForTask(taskId);

      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aztec-wallet-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setImportPreview(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as WalletExportData;
        if (data.version !== 1) {
          setError('Unsupported backup version');
          return;
        }
        if (!Array.isArray(data.accounts) || data.accounts.some((a) => !a.address || !a.secret || !a.salt)) {
          setError('Invalid backup file: missing account data');
          return;
        }
        setImportPreview(data);
      } catch {
        setError('Failed to parse backup file');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const versionMismatch = importPreview && importPreview.aztecPackagesVersion !== AZTEC_PACKAGES_VERSION;

  return (
    <div className="section">
      {error && <div className="message message-error">{error}</div>}

      {/* Export section */}
      <div className="settings-section">
        <div className="settings-section-title">Export Wallet Backup</div>
        <div className="settings-description">
          Download a JSON file containing all your accounts with decrypted secrets.
          Store this file securely.
        </div>
        <button
          className="btn btn-primary btn-block"
          onClick={handleExport}
          disabled={exporting}
          style={{ marginTop: 12 }}
        >
          {exporting ? 'Exporting...' : 'Export Wallet Backup'}
        </button>
      </div>

      {/* Import section */}
      <div className="settings-section">
        <div className="settings-section-title">Import Wallet Backup</div>
        <div className="settings-description">
          Restore accounts from a previously exported backup file.
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <button
          className="btn btn-secondary btn-block"
          onClick={() => fileInputRef.current?.click()}
          style={{ marginTop: 12 }}
        >
          Select Backup File
        </button>

        {importPreview && (
          <div className="import-preview" style={{ marginTop: 12 }}>
            <div className="import-preview-header">Backup Preview</div>
            <div className="detail-row" style={{ marginTop: 8 }}>
              <span className="detail-label">Accounts</span>
              <span className="detail-value">{importPreview.accounts.length}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Aztec Version</span>
              <span className="detail-value">{importPreview.aztecPackagesVersion}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Exported</span>
              <span className="detail-value">{new Date(importPreview.exportedAt).toLocaleDateString()}</span>
            </div>

            {versionMismatch && (
              <div className="message message-error" style={{ marginTop: 8 }}>
                Version mismatch! This backup was created with {importPreview.aztecPackagesVersion} but
                the current wallet uses {AZTEC_PACKAGES_VERSION}. Imported addresses may not match.
              </div>
            )}

            <div className="message message-error" style={{ marginTop: 8 }}>
              This will wipe your current wallet. You will need to set a new master password.
            </div>

            <button
              className="btn btn-danger btn-block"
              onClick={() => onImportStart(importPreview)}
              style={{ marginTop: 8 }}
            >
              Wipe &amp; Import
            </button>
          </div>
        )}
      </div>

      {/* Version info */}
      <div className="settings-version">
        <span className="detail-label">Aztec Packages Version</span>
        <span className="detail-value">{AZTEC_PACKAGES_VERSION}</span>
      </div>
    </div>
  );
}
