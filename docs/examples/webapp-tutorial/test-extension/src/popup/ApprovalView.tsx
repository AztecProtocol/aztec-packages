import React, { useState } from 'react';

import { MessageTypes } from '../config';
import { getOriginHost } from '../utils';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';
import type { PendingDiscovery } from '@aztec/wallet-sdk/extension/handlers';
import type { PendingTransaction, PendingCapabilities, PendingSessionVerification } from '../shared-types';
import { sendToBackground, truncateAddress } from './helpers';

interface ApprovalsViewProps {
  discoveries: PendingDiscovery[];
  transactions: PendingTransaction[];
  pendingCapabilities: PendingCapabilities[];
  onRefresh: () => void;
}

export function ApprovalsView({
  discoveries,
  transactions,
  pendingCapabilities,
  onRefresh,
}: ApprovalsViewProps) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Generic approval/rejection handler — eliminates per-type boilerplate. */
  const handleAction = async (type: string, payload: Record<string, string>, key: string) => {
    try {
      setProcessing(key);
      setError(null);
      await sendToBackground({ type, ...payload });
    } catch (err: any) {
      // "Transaction not found" means it was already processed — just refresh
      if (type !== MessageTypes.APPROVE_TRANSACTION) {
        setError(err.message);
      } else {
        console.debug('Approve failed (likely stale):', err.message);
      }
    } finally {
      setProcessing(null);
      onRefresh();
    }
  };

  const handleApproveConnection = (requestId: string) =>
    handleAction(MessageTypes.APPROVE_CONNECTION, { requestId }, requestId);
  const handleRejectConnection = (requestId: string) =>
    handleAction(MessageTypes.REJECT_CONNECTION, { requestId }, requestId);
  const handleApproveTx = (messageId: string) =>
    handleAction(MessageTypes.APPROVE_TRANSACTION, { messageId }, messageId);
  const handleRejectTx = (messageId: string) =>
    handleAction(MessageTypes.REJECT_TRANSACTION, { messageId }, messageId);
  const handleApproveCapabilities = (messageId: string) =>
    handleAction(MessageTypes.APPROVE_CAPABILITIES, { messageId }, messageId);
  const handleRejectCapabilities = (messageId: string) =>
    handleAction(MessageTypes.REJECT_CAPABILITIES, { messageId }, messageId);

  if (discoveries.length === 0 && transactions.length === 0 && pendingCapabilities.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">&#10003;</div>
        <div className="empty-text">No pending approvals</div>
      </div>
    );
  }

  return (
    <div className="section">
      {error && <div className="message message-error">{error}</div>}

      {discoveries.map((discovery) => (
        <ConnectionApproval
          key={discovery.requestId}
          discovery={discovery}
          onApprove={() => handleApproveConnection(discovery.requestId)}
          onReject={() => handleRejectConnection(discovery.requestId)}
          processing={processing === discovery.requestId}
        />
      ))}

      {transactions.map((tx) => (
        <TransactionApproval
          key={tx.messageId}
          transaction={tx}
          onApprove={() => handleApproveTx(tx.messageId)}
          onReject={() => handleRejectTx(tx.messageId)}
          processing={processing === tx.messageId}
        />
      ))}

      {pendingCapabilities.map((cap) => (
        <CapabilitiesApproval
          key={cap.messageId}
          pending={cap}
          onApprove={() => handleApproveCapabilities(cap.messageId)}
          onReject={() => handleRejectCapabilities(cap.messageId)}
          processing={processing === cap.messageId}
        />
      ))}
    </div>
  );
}

export function SessionVerificationView({ verification, onConfirm, onReject }: {
  verification: PendingSessionVerification;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const emojis = hashToEmoji(verification.verificationHash);

  return (
    <div className="section">
      <div className="approval-card">
        <div className="approval-header">
          <div className="approval-icon">&#128272;</div>
          <div>
            <div className="approval-origin">{getOriginHost(verification.origin)}</div>
            <div className="approval-type">Verify Connection</div>
          </div>
        </div>

        <div className="emoji-verification-card">
          <p className="emoji-verification-label">
            Confirm these emojis match what the dApp shows:
          </p>
          <div className="emoji-grid">{emojis}</div>
        </div>

        <div className="btn-group">
          <button className="btn btn-danger" onClick={onReject}>
            Reject
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            Emojis Match
          </button>
        </div>
      </div>
    </div>
  );
}

// docs:start:connection-approval
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
// docs:end:connection-approval

// docs:start:transaction-approval
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
// docs:end:transaction-approval

interface ExpandableSection {
  summary: string;
  items: string[];
}

interface CapabilityDescription {
  label: string;
  details: string[];
  expandable: ExpandableSection[];
}

function formatPatterns(scope: any): { summary: string; items: string[] } {
  if (!Array.isArray(scope)) return { summary: 'unknown', items: [] };
  const items = scope.map((p: any) => {
    const contract = p.contract === '*' ? '*' : truncateAddress(String(p.contract));
    const fn = p.function || '*';
    return `${contract}:${fn}`;
  });
  return { summary: `${scope.length} specific pattern(s)`, items };
}

function describeCapability(cap: any): CapabilityDescription {
  switch (cap.type) {
    case 'accounts': {
      const details = [];
      if (cap.canGet) details.push('View account addresses');
      if (cap.canCreateAuthWit) details.push('Create authentication witnesses');
      return { label: 'Account Access', details: details.length ? details : ['Basic account access'], expandable: [] };
    }
    case 'contracts': {
      const expandable: ExpandableSection[] = [];
      let scopeText: string;
      if (cap.contracts === '*') {
        scopeText = 'Scope: All contracts';
      } else if (Array.isArray(cap.contracts)) {
        scopeText = `Scope: ${cap.contracts.length} specific contract(s)`;
        expandable.push({
          summary: `${cap.contracts.length} specific contract(s)`,
          items: cap.contracts.map((c: any) => truncateAddress(String(c))),
        });
      } else {
        scopeText = 'Scope: unknown';
      }
      return {
        label: 'Contract Access',
        details: [
          cap.canRegister ? 'Register contracts' : '',
          cap.canGetMetadata ? 'Query contract metadata' : '',
          scopeText,
        ].filter(Boolean),
        expandable,
      };
    }
    case 'transaction': {
      const expandable: ExpandableSection[] = [];
      let scopeText: string;
      if (cap.scope === '*') {
        scopeText = 'Scope: Any transaction';
      } else if (Array.isArray(cap.scope)) {
        const { summary, items } = formatPatterns(cap.scope);
        scopeText = `Scope: ${summary}`;
        expandable.push({ summary, items });
      } else {
        scopeText = 'Scope: unknown';
      }
      return { label: 'Send Transactions', details: [scopeText], expandable };
    }
    case 'simulation': {
      const expandable: ExpandableSection[] = [];
      const details: string[] = [];
      if (cap.transactions) {
        if (cap.transactions.scope === '*') {
          details.push('Tx simulation: any');
        } else if (Array.isArray(cap.transactions.scope)) {
          const { summary, items } = formatPatterns(cap.transactions.scope);
          details.push(`Tx simulation: ${summary}`);
          expandable.push({ summary: `Tx: ${summary}`, items });
        }
      }
      if (cap.utilities) {
        if (cap.utilities.scope === '*') {
          details.push('Utility calls: any');
        } else if (Array.isArray(cap.utilities.scope)) {
          const { summary, items } = formatPatterns(cap.utilities.scope);
          details.push(`Utility calls: ${summary}`);
          expandable.push({ summary: `Util: ${summary}`, items });
        }
      }
      return { label: 'Simulate Transactions', details, expandable };
    }
    case 'data':
      return {
        label: 'Data Access',
        details: [
          cap.addressBook ? 'Address book' : '',
          cap.privateEvents ? 'Private events' : '',
        ].filter(Boolean),
        expandable: [],
      };
    default:
      return { label: cap.type, details: ['Unknown capability'], expandable: [] };
  }
}

interface CapabilitiesApprovalProps {
  pending: PendingCapabilities;
  onApprove: () => void;
  onReject: () => void;
  processing: boolean;
}

function CapabilitiesApproval({
  pending,
  onApprove,
  onReject,
  processing,
}: CapabilitiesApprovalProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="approval-card">
      <div className="approval-header">
        <div className="approval-icon">&#128274;</div>
        <div>
          <div className="approval-origin">{getOriginHost(pending.origin)}</div>
          <div className="approval-type">Capabilities Request</div>
        </div>
      </div>

      <div className="approval-details">
        <div className="detail-row">
          <span className="detail-label">App</span>
          <span className="detail-value">
            {pending.appMetadata.name} v{pending.appMetadata.version}
          </span>
        </div>
        {pending.appMetadata.description && (
          <div className="detail-row">
            <span className="detail-label">Description</span>
            <span className="detail-value">{pending.appMetadata.description}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-label">Origin</span>
          <span className="detail-value">{pending.origin}</span>
        </div>

        <div className="tx-calls">
          <div className="detail-label">Requested Permissions:</div>
          {pending.capabilities.map((cap, i) => {
            const desc = describeCapability(cap);
            return (
              <div key={i} className="tx-call">
                <div className="tx-call-header">{desc.label}</div>
                {desc.details.map((detail, j) => (
                  <div key={j} className="tx-call-arg">{detail}</div>
                ))}
                {desc.expandable.map((section, k) => {
                  const key = `${i}-${k}`;
                  const isExpanded = expanded.has(key);
                  return (
                    <div key={k}>
                      <button
                        className="expandable-toggle"
                        onClick={() => toggleExpanded(key)}
                      >
                        {isExpanded ? '\u25BE' : '\u25B8'} {section.summary}
                      </button>
                      {isExpanded && (
                        <div className="expandable-items">
                          {section.items.map((item, l) => (
                            <div key={l} className="expandable-item">{item}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
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
          {processing ? 'Approving...' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
