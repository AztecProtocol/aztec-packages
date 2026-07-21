import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig } from './context';

function EthTotalInner() {
  const { sequencerCount } = useOperatorConfig();
  // Opening publisher top-up: ~0.01 ETH per sequencer is months of runway at
  // current L1 gas. The funding calculator re-derives precise runway from a live
  // 30-day RPC scan; this is the static placeholder used in the cost tables.
  const total = sequencerCount * 0.01;
  // Trim trailing zeros (0.10 -> 0.1, 1.00 -> 1)
  const formatted = total.toFixed(2).replace(/\.?0+$/, '') || '0';
  return <>{formatted}</>;
}

function AztecTotalInner() {
  const { sequencerCount } = useOperatorConfig();
  return <>{(sequencerCount * 200000).toLocaleString('en-US')}</>;
}

export function EthTotal() {
  return <BrowserOnly fallback={<>0.01</>}>{() => <EthTotalInner />}</BrowserOnly>;
}

export function AztecTotal() {
  return <BrowserOnly fallback={<>200,000</>}>{() => <AztecTotalInner />}</BrowserOnly>;
}

export { default as PublisherFundingCalculator } from './PublisherFundingCalculator';
