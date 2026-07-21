import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig } from './context';

const LABELS = {
  testnet: 'Testnet (Sepolia)',
  mainnet: 'Mainnet (alpha)',
};

function NetworkNameInner() {
  const { track } = useOperatorConfig();
  return <>{LABELS[track.network] || track.network}</>;
}

export default function NetworkName() {
  return <BrowserOnly fallback={<>Testnet (Sepolia)</>}>{() => <NetworkNameInner />}</BrowserOnly>;
}
