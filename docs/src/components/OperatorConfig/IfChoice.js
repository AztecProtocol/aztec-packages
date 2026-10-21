import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig, TRACK_AXES } from './context';
import styles from './ifchoice.module.css';

function normalizeIs(is) {
  if (Array.isArray(is)) return is;
  if (typeof is === 'string') {
    return is.split('|').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function IfChoiceInner({ axis, is, label, children }) {
  const { track } = useOperatorConfig();
  const allowed = normalizeIs(is);
  if (!TRACK_AXES[axis]) return null;
  if (!allowed.includes(track[axis])) return null;

  // Render plain (no branch chrome) when no label is provided. Labels are reserved
  // for branches that meaningfully diverge from the default path (e.g. "HA topology",
  // "Staking provider"); the default-path branches should render as inline content.
  if (!label) return <>{children}</>;

  return (
    <div className={styles.branch} data-axis={axis} data-value={track[axis]}>
      <div className={styles.tag}>
        <span className={styles.tagLabel}>{label}</span>
      </div>
      {children}
    </div>
  );
}

function IfNotChoiceInner({ axis, is, children }) {
  const { track } = useOperatorConfig();
  const blocked = normalizeIs(is);
  if (!TRACK_AXES[axis]) return null;
  if (blocked.includes(track[axis])) return null;
  return <>{children}</>;
}

export function IfChoice(props) {
  return <BrowserOnly fallback={null}>{() => <IfChoiceInner {...props} />}</BrowserOnly>;
}

export function IfNotChoice(props) {
  return <BrowserOnly fallback={null}>{() => <IfNotChoiceInner {...props} />}</BrowserOnly>;
}

export default IfChoice;
