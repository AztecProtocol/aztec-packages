import React, { useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig, SECRET_FIELDS, MAX_SEQUENCER_COUNT } from './context';
import styles from './styles.module.css';

const FIELD_DEFS = [
  {
    key: 'ETH_RPC',
    label: 'L1 Execution RPC',
    placeholderTestnet: 'https://eth-sepolia.g.alchemy.com/v2/...',
    placeholderMainnet: 'https://eth-mainnet.g.alchemy.com/v2/...',
  },
  {
    key: 'CONSENSUS_RPC',
    label: 'L1 Consensus RPC',
    placeholderTestnet: 'http://localhost:5052',
    placeholderMainnet: 'http://localhost:5052',
  },
  {
    key: 'DEBUG_RPC',
    label: 'L1 Debug/Trace RPC',
    placeholderTestnet: 'https://eth-sepolia.g.alchemy.com/v2/...',
    placeholderMainnet: 'https://eth-mainnet.g.alchemy.com/v2/...',
  },
  {
    key: 'P2P_IP',
    label: 'External IP (P2P)',
    placeholderTestnet: '203.0.113.42',
    placeholderMainnet: '203.0.113.42',
  },
  { _separator: true },
  {
    key: 'PUBLISHER_KEY',
    label: 'Publisher Private Key',
    placeholderTestnet: '0x7988a4a7...',
    placeholderMainnet: '0x7988a4a7...',
    secret: true,
  },
  {
    key: 'ATTESTER_ADDR',
    label: 'Attester Address',
    placeholderTestnet: '0x... (from key1_staker_output.json)',
    placeholderMainnet: '0x... (from key1_staker_output.json)',
  },
  {
    key: 'PUBLISHER_ADDR',
    label: 'Publisher Address',
    placeholderTestnet: '0x... (from cast wallet address)',
    placeholderMainnet: '0x... (from cast wallet address)',
  },
  {
    key: 'COINBASE_ADDR',
    label: 'Coinbase Address',
    placeholderTestnet: '0x... (receives rewards)',
    placeholderMainnet: '0x... (receives rewards)',
    showWhen: ({ track }) => track.stakeMode === 'self',
  },
  {
    key: 'WITHDRAWER_ADDR',
    label: 'Withdrawer Address',
    placeholderTestnet: '0x... (can withdraw stake + sign governance)',
    placeholderMainnet: '0x... (can withdraw stake + sign governance)',
    showWhen: ({ track }) => track.stakeMode === 'self',
  },
  {
    key: 'PROVIDER_ID',
    label: 'Provider ID',
    placeholderTestnet: 'e.g. 5',
    placeholderMainnet: 'e.g. 5',
    showWhen: ({ track }) => track.stakeMode === 'provider',
  },
  {
    key: 'PROVIDER_ADMIN_ADDR',
    label: 'Provider Admin Address',
    placeholderTestnet: '0x... (manages your provider entry)',
    placeholderMainnet: '0x... (manages your provider entry)',
    showWhen: ({ track }) => track.stakeMode === 'provider',
  },
  {
    key: 'REWARDS_RECIPIENT_ADDR',
    label: 'Rewards Recipient Address',
    placeholderTestnet: '0x... (receives your commission)',
    placeholderMainnet: '0x... (receives your commission)',
    showWhen: ({ track }) => track.stakeMode === 'provider',
  },
  {
    key: 'COMMISSION_BPS',
    label: 'Commission (basis points)',
    placeholderTestnet: 'e.g. 700 = 7%',
    placeholderMainnet: 'e.g. 700 = 7%',
    showWhen: ({ track }) => track.stakeMode === 'provider',
  },
];

function Field({ def, value, onChange, network }) {
  const [revealed, setRevealed] = useState(false);
  const placeholder = network === 'mainnet' ? def.placeholderMainnet : def.placeholderTestnet;
  const inputType = def.secret && !revealed ? 'password' : 'text';
  return (
    <div className={styles.field}>
      <label htmlFor={`cfg-${def.key}`}>{def.label}</label>
      <div className={styles.inputRow}>
        <input
          id={`cfg-${def.key}`}
          type={inputType}
          value={value}
          onChange={(e) => onChange(def.key, e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {def.secret && (
          <button
            type="button"
            className={styles.pwToggle}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  );
}

function Panel() {
  const { values, track, sequencerCount, aztecPort, setField, setTrack, setSequencerCount, setAztecPort, reset } = useOperatorConfig();
  const network = track.network;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.panel}>
      <div
        className={styles.header}
        onClick={() => setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCollapsed((c) => !c); }}
      >
        <span>⚙ Your configuration</span>
        <span className={styles.headerToggle}>{collapsed ? '▸ EXPAND' : '▾ COLLAPSE'}</span>
      </div>
      {!collapsed && (
        <>
          <div className={styles.desc}>
            <strong>Paste once, code blocks auto-fill on every page.</strong> Commands fill in
            with your real values and copy ready to run. Keys stay masked in the panel inputs.
            Your values persist locally; nothing is sent to a server.
          </div>
          <div className={styles.networkRow}>
            <strong>Network</strong>
            <button
              type="button"
              className={styles.netBtn}
              data-active={network === 'testnet'}
              onClick={() => setTrack('network', 'testnet')}
            >
              Testnet (Sepolia)
            </button>
            <button
              type="button"
              className={styles.netBtn}
              data-active={network === 'mainnet'}
              onClick={() => setTrack('network', 'mainnet')}
            >
              Mainnet (alpha)
            </button>
          </div>
          <div className={styles.networkRow}>
            <strong>Sequencer count</strong>
            <input
              type="number"
              min={1}
              max={MAX_SEQUENCER_COUNT}
              step={1}
              value={sequencerCount}
              onChange={(e) => setSequencerCount(e.target.value)}
              style={{
                width: '5rem',
                fontFamily: 'var(--ifm-font-family-monospace, monospace)',
                fontSize: '0.85rem',
                padding: '0.3rem 0.5rem',
                border: '1px solid var(--ifm-color-emphasis-300, #d9d4c7)',
                borderRadius: '4px',
                background: 'var(--ifm-background-color, #f2eee1)',
                color: 'var(--ifm-color-emphasis-900, #1a1400)',
              }}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600, #64748b)' }}>
              How many validator identities you'll register from this keystore.
            </span>
          </div>
          <div className={styles.networkRow}>
            <strong>Aztec port</strong>
            <input
              type="number"
              min={1}
              max={65535}
              step={1}
              value={aztecPort}
              onChange={(e) => setAztecPort(e.target.value)}
              style={{
                width: '5rem',
                fontFamily: 'var(--ifm-font-family-monospace, monospace)',
                fontSize: '0.85rem',
                padding: '0.3rem 0.5rem',
                border: '1px solid var(--ifm-color-emphasis-300, #d9d4c7)',
                borderRadius: '4px',
                background: 'var(--ifm-background-color, #f2eee1)',
                color: 'var(--ifm-color-emphasis-900, #1a1400)',
              }}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--ifm-color-emphasis-600, #64748b)' }}>
              JSON-RPC port your node listens on. Default is 8080; change here if 8080 was taken on your box.
            </span>
          </div>
          <div className={styles.body}>
            {FIELD_DEFS
              .filter((def) => !def.showWhen || def.showWhen({ track }))
              .map((def, i) =>
                def._separator ? (
                  <hr key={`sep-${i}`} className={styles.sep} />
                ) : (
                  <Field
                    key={def.key}
                    def={def}
                    value={values[def.key] || ''}
                    onChange={setField}
                    network={network}
                  />
                ),
              )}
          </div>
          <div className={styles.security}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>
              <strong>Keys and RPC URLs use session-only storage</strong>, erased when you close this tab.
              Addresses persist between sessions. Nothing is sent to a server.
            </span>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={reset}>Clear all fields</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function OperatorConfig() {
  return <BrowserOnly fallback={null}>{() => <Panel />}</BrowserOnly>;
}
