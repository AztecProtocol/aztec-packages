import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig } from './context';

/**
 * Conditionally render children based on SEQUENCER_COUNT.
 * Props (any combination):
 *   eq={n}    — render only when sequencerCount === n
 *   gt={n}    — render only when sequencerCount > n
 *   lt={n}    — render only when sequencerCount < n
 *   gte={n}   — render only when sequencerCount >= n
 *   lte={n}   — render only when sequencerCount <= n
 *
 * Examples (from MDX):
 *   <IfCount eq={1}>Single sequencer notes</IfCount>
 *   <IfCount gt={1}>Multi-sequencer loop</IfCount>
 */
function IfCountInner({ eq, gt, lt, gte, lte, children }) {
  const { sequencerCount } = useOperatorConfig();
  if (eq !== undefined && sequencerCount !== eq) return null;
  if (gt !== undefined && !(sequencerCount > gt)) return null;
  if (lt !== undefined && !(sequencerCount < lt)) return null;
  if (gte !== undefined && !(sequencerCount >= gte)) return null;
  if (lte !== undefined && !(sequencerCount <= lte)) return null;
  return <>{children}</>;
}

export default function IfCount(props) {
  return <BrowserOnly fallback={null}>{() => <IfCountInner {...props} />}</BrowserOnly>;
}
