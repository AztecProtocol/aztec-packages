// docs:start:network-picker
import React from 'react';
import type { NetworkType } from '../config';

interface NetworkPickerProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
  disabled?: boolean;
}

/**
 * Toggle between local network (uses EmbeddedWallet) and devnet (uses wallet extension).
 */
export function NetworkPicker({ network, onNetworkChange, disabled }: NetworkPickerProps) {
  return (
    <div className="network-picker">
      <label>Network:</label>
      <select
        value={network}
        onChange={(e) => onNetworkChange(e.target.value as NetworkType)}
        disabled={disabled}
      >
        <option value="local">Local (localhost:8080)</option>
        <option value="devnet">Devnet</option>
      </select>
    </div>
  );
}
// docs:end:network-picker
