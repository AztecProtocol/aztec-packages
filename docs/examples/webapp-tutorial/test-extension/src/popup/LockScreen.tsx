import React, { useState } from 'react';

import { MessageTypes } from '../config';
import { sendToBackground, waitForTask } from './helpers';

export function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnlock = async () => {
    if (!password) return;
    setUnlocking(true);
    setError(null);
    try {
      const { taskId } = await sendToBackground({
        type: MessageTypes.UNLOCK_WALLET,
        password,
      });
      await waitForTask(taskId);
      onUnlocked();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <div className="section" style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
      <h3 style={{ marginBottom: 16 }}>Wallet Locked</h3>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
        Enter your password to unlock.
      </p>

      {error && <div className="message message-error">{error}</div>}

      <div className="form-group">
        <input
          className="form-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          placeholder="Enter password"
          disabled={unlocking}
        />
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={handleUnlock}
        disabled={unlocking || !password}
      >
        {unlocking ? 'Unlocking...' : 'Unlock'}
      </button>
    </div>
  );
}
