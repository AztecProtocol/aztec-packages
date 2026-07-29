import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig, TRACK_AXES } from './context';
import styles from './trackpicker.module.css';

const AXIS_META = {
  network: {
    label: 'Network',
    options: [
      { value: 'testnet', label: 'Testnet (Sepolia)' },
      { value: 'mainnet', label: 'Mainnet (alpha)' },
    ],
  },
  stakeMode: {
    label: 'Stake mode',
    options: [
      { value: 'self', label: 'Self-stake' },
      { value: 'provider', label: 'Staking provider' },
    ],
  },
  topology: {
    label: 'Topology',
    options: [
      { value: 'single', label: 'Single server' },
      { value: 'ha', label: 'HA setup' },
    ],
  },
};

function TrackPickerInner({ compact = false, hideStake = false, axes: axesProp = null }) {
  const { track, trackTouched, setTrack } = useOperatorConfig();
  const axes = Object.keys(TRACK_AXES).filter((axis) =>
    axesProp ? axesProp.includes(axis) : !(hideStake && axis === 'stakeMode'),
  );

  return (
    <div className={`${styles.picker} ${compact ? styles.compact : ''}`}>
      <div className={styles.row}>
        {axes.map((axis) => {
          const meta = AXIS_META[axis];
          return (
            <div key={axis} className={styles.group}>
              <span className={styles.groupLabel}>{meta.label}</span>
              <div className={styles.groupBtns} role="radiogroup" aria-label={meta.label}>
                {meta.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={track[axis] === opt.value}
                    className={styles.btn}
                    data-active={track[axis] === opt.value}
                    onClick={() => setTrack(axis, opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {!trackTouched && !axesProp && (
        <div className={styles.banner}>
          {hideStake ? (
            <>Showing the <strong>testnet · single-server</strong> path. Flip any toggle above to see mainnet or HA variants. Your choice persists across pages.</>
          ) : (
            <>Showing the <strong>testnet · self-stake · single-server</strong> path. Flip any toggle above to see provider or HA variants. Your choice persists across pages.</>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrackPicker(props) {
  return <BrowserOnly fallback={null}>{() => <TrackPickerInner {...props} />}</BrowserOnly>;
}
