import React, { useState } from 'react';

import { MessageTypes } from '../config';
import { sendToBackground, waitForTask, createAndActivateAccount } from './helpers';

export function SetupScreen({ onComplete, skipAccountCreation = false }: { onComplete: () => void; skipAccountCreation?: boolean }) {
  const [step, setStep] = useState<'password' | 'account'>('password');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSetPassword = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { taskId } = await sendToBackground({ type: MessageTypes.SETUP_PASSWORD, password });
      await waitForTask(taskId);
      if (skipAccountCreation) {
        onComplete();
        return;
      }
      setStep('account');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFirstAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      await createAndActivateAccount(alias || 'Account 1');
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'password') {
    return (
      <div className="section" style={{ textAlign: 'center', padding: 24 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
        <h3 style={{ marginBottom: 8 }}>Welcome to Aztec Wallet</h3>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
          Set a master password to protect your accounts.
        </p>

        {error && <div className="message message-error">{error}</div>}

        <div className="form-group">
          <input
            className="form-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            disabled={loading}
          />
        </div>

        <div className="form-group">
          <input
            className="form-input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetPassword()}
            placeholder="Confirm password"
            disabled={loading}
          />
        </div>

        <button
          className="btn btn-primary btn-block"
          onClick={handleSetPassword}
          disabled={loading || !password || !confirmPassword}
        >
          {loading ? 'Setting up...' : 'Continue'}
        </button>
      </div>
    );
  }

  return (
    <div className="section" style={{ textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>&#128100;</div>
      <h3 style={{ marginBottom: 8 }}>Create Your First Account</h3>
      <p style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
        Choose a name for your first Aztec account.
      </p>

      {error && <div className="message message-error">{error}</div>}

      <div className="form-group">
        <input
          className="form-input"
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateFirstAccount()}
          placeholder="Account name (e.g. Account 1)"
          disabled={loading}
        />
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={handleCreateFirstAccount}
        disabled={loading}
      >
        {loading ? 'Creating...' : 'Create Account'}
      </button>
    </div>
  );
}
