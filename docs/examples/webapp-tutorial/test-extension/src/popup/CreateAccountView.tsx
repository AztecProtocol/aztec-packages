import React, { useState } from 'react';

import { createAndActivateAccount } from './helpers';

export function CreateAccountView({ onCreated }: { onCreated: () => void }) {
  const [alias, setAlias] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      await createAndActivateAccount(alias || 'My Account');
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="section" style={{ padding: '8px 0' }}>
      {error && <div className="message message-error">{error}</div>}

      <div className="form-group">
        <label className="form-label">Account Name</label>
        <input
          className="form-input"
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="My Account"
          disabled={creating}
        />
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={handleCreate}
        disabled={creating}
      >
        {creating ? 'Creating...' : 'Create Account'}
      </button>
    </div>
  );
}
