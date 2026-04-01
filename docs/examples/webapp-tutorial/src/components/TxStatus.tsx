// docs:start:tx-status
import React from 'react';

type TxState = 'idle' | 'sending' | 'proving' | 'confirmed' | 'error';

interface TxStatusProps {
  state: TxState;
  txHash?: string;
  error?: string;
}

// docs:start:tx-status-component
/**
 * Displays the current transaction lifecycle stage.
 * Transactions flow: send() -> proving -> confirmed (or error).
 */
export function TxStatus({ state, txHash, error }: TxStatusProps) {
  if (state === 'idle') return null;

  const messages: Record<TxState, string> = {
    idle: '',
    sending: 'Sending transaction...',
    proving: 'Proving transaction (generating ZK proof)...',
    confirmed: 'Transaction confirmed!',
    error: `Transaction failed: ${error}`,
  };

  return (
    <div className={`tx-status tx-status-${state}`}>
      <p>{messages[state]}</p>
      {txHash && <p className="tx-hash">Tx: {txHash.slice(0, 10)}...</p>}
    </div>
  );
}
// docs:end:tx-status-component
// docs:end:tx-status
