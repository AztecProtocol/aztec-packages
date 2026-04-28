// docs:start:account-info
import React from 'react';
import { AztecAddress } from '@aztec/aztec.js/addresses';

interface AccountInfoProps {
  address: AztecAddress;
}

/**
 * Displays the connected account address (truncated).
 */
export function AccountInfo({ address }: AccountInfoProps) {
  const addr = address.toString();
  const display = `${addr.slice(0, 10)}...${addr.slice(-6)}`;

  return (
    <div className="account-info">
      <span className="account-label">Connected:</span>
      <span className="account-address" title={addr}>{display}</span>
    </div>
  );
}
// docs:end:account-info
