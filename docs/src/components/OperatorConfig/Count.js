import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig } from './context';

function CountInner() {
  const { sequencerCount } = useOperatorConfig();
  return <>{sequencerCount}</>;
}

/**
 * Inline component that renders the current SEQUENCER_COUNT.
 * Use in MDX prose where you need the value: "Generates <Count /> validator identities."
 */
export default function Count() {
  return <BrowserOnly fallback={<>1</>}>{() => <CountInner />}</BrowserOnly>;
}
