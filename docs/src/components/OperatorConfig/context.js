import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import networkVersionConfig from '@site/network_version_config.json';

// Default to the testnet version, fall back to mainnet, then to a sane string.
// docusaurus.config.js reads the same file to render the version label in the navbar.
const RECOMMENDED_VERSION =
  networkVersionConfig.testnet || networkVersionConfig.mainnet || 'latest';

const SAFE_FIELDS = [
  'P2P_IP',
  'ATTESTER_ADDR',
  'PUBLISHER_ADDR',
  'COINBASE_ADDR',
  'WITHDRAWER_ADDR',
  'PROVIDER_ID',
  'PROVIDER_ADMIN_ADDR',
  'REWARDS_RECIPIENT_ADDR',
  'COMMISSION_BPS',
];
const SECRET_FIELDS = ['PUBLISHER_KEY', 'ETH_RPC', 'CONSENSUS_RPC', 'DEBUG_RPC'];
const ALL_FIELDS = [...SAFE_FIELDS, ...SECRET_FIELDS];

const STORAGE_KEY = 'aztec-playbook-config';
const SECRET_KEY = 'aztec-playbook-secrets';
const TRACK_KEY = 'aztec-playbook-track';
const TRACK_TOUCHED_KEY = 'aztec-playbook-track-touched';
const COUNT_KEY = 'aztec-playbook-sequencer-count';
const PORT_KEY = 'aztec-playbook-aztec-port';

const DEFAULT_SEQUENCER_COUNT = 1;
const MAX_SEQUENCER_COUNT = 100;
const DEFAULT_AZTEC_PORT = 8080;

function sanitizeCount(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SEQUENCER_COUNT;
  if (n > MAX_SEQUENCER_COUNT) return MAX_SEQUENCER_COUNT;
  return n;
}

function sanitizePort(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 65535) return DEFAULT_AZTEC_PORT;
  return n;
}

const DEFAULT_VALUES = ALL_FIELDS.reduce((acc, k) => ({ ...acc, [k]: '' }), {});

const DEFAULT_TRACK = {
  network: 'testnet',
  stakeMode: 'self',
  topology: 'single',
};

const TRACK_AXES = {
  network: ['testnet', 'mainnet'],
  stakeMode: ['self', 'provider'],
  topology: ['single', 'ha'],
};

const Ctx = createContext({
  values: DEFAULT_VALUES,
  track: DEFAULT_TRACK,
  trackTouched: false,
  sequencerCount: DEFAULT_SEQUENCER_COUNT,
  aztecPort: DEFAULT_AZTEC_PORT,
  setField: () => {},
  setTrack: () => {},
  setSequencerCount: () => {},
  setAztecPort: () => {},
  reset: () => {},
});

function sanitizeTrack(raw) {
  const t = { ...DEFAULT_TRACK };
  if (raw && typeof raw === 'object') {
    for (const axis of Object.keys(TRACK_AXES)) {
      if (TRACK_AXES[axis].includes(raw[axis])) t[axis] = raw[axis];
    }
  }
  return t;
}

// Map of ?<param>= -> internal axis name. Only these param names are honored.
// Allowed values per axis are constrained by TRACK_AXES; unknown values are ignored.
const TRACK_QUERY_PARAMS = {
  network: 'network',
  stake: 'stakeMode',
  topology: 'topology',
};

function readTrackFromQuery(base) {
  if (typeof window === 'undefined' || !window.location) return base;
  let params;
  try {
    params = new URLSearchParams(window.location.search || '');
  } catch (_) {
    return base;
  }
  const next = { ...base };
  let changed = false;
  for (const [param, axis] of Object.entries(TRACK_QUERY_PARAMS)) {
    const raw = params.get(param);
    if (raw == null) continue;
    if (TRACK_AXES[axis] && TRACK_AXES[axis].includes(raw)) {
      next[axis] = raw;
      changed = true;
    }
  }
  return changed ? next : base;
}

function loadInitial() {
  if (typeof window === 'undefined') {
    return {
      values: DEFAULT_VALUES,
      track: DEFAULT_TRACK,
      trackTouched: false,
      sequencerCount: DEFAULT_SEQUENCER_COUNT,
      aztecPort: DEFAULT_AZTEC_PORT,
    };
  }
  let safe = {};
  let secret = {};
  let track = DEFAULT_TRACK;
  let trackTouched = false;
  let sequencerCount = DEFAULT_SEQUENCER_COUNT;
  let aztecPort = DEFAULT_AZTEC_PORT;
  try {
    safe = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (_) {}
  try {
    secret = JSON.parse(window.sessionStorage.getItem(SECRET_KEY) || '{}');
  } catch (_) {}
  try {
    const raw = JSON.parse(window.localStorage.getItem(TRACK_KEY) || 'null');
    track = sanitizeTrack(raw);
  } catch (_) {}
  try {
    trackTouched = window.localStorage.getItem(TRACK_TOUCHED_KEY) === '1';
  } catch (_) {}
  try {
    sequencerCount = sanitizeCount(window.localStorage.getItem(COUNT_KEY));
  } catch (_) {}
  try {
    aztecPort = sanitizePort(window.localStorage.getItem(PORT_KEY));
  } catch (_) {}

  // On the very first visit (track not yet touched), let URL query strings
  // seed the track. Each axis is independent: ?stake=provider sets only
  // stakeMode and leaves network and topology at their defaults.
  // Once applied, mark the track touched so refreshes don't re-apply.
  if (!trackTouched) {
    const fromQuery = readTrackFromQuery(track);
    if (fromQuery !== track) {
      track = fromQuery;
      trackTouched = true;
      try { window.localStorage.setItem(TRACK_KEY, JSON.stringify(track)); } catch (_) {}
      try { window.localStorage.setItem(TRACK_TOUCHED_KEY, '1'); } catch (_) {}
    }
  }

  return {
    values: { ...DEFAULT_VALUES, ...safe, ...secret },
    track,
    trackTouched,
    sequencerCount,
    aztecPort,
  };
}

export function OperatorConfigProvider({ children }) {
  const [values, setValues] = useState(DEFAULT_VALUES);
  const [track, setTrackState] = useState(DEFAULT_TRACK);
  const [trackTouched, setTrackTouched] = useState(false);
  const [sequencerCount, setSequencerCountState] = useState(DEFAULT_SEQUENCER_COUNT);
  const [aztecPort, setAztecPortState] = useState(DEFAULT_AZTEC_PORT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = loadInitial();
    setValues(initial.values);
    setTrackState(initial.track);
    setTrackTouched(initial.trackTouched);
    setSequencerCountState(initial.sequencerCount);
    setAztecPortState(initial.aztecPort);
    setHydrated(true);
  }, []);

  const setField = useCallback((key, value) => {
    if (!ALL_FIELDS.includes(key)) return;
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (typeof window !== 'undefined') {
        const safe = {};
        const secret = {};
        SAFE_FIELDS.forEach((k) => { safe[k] = next[k] || ''; });
        SECRET_FIELDS.forEach((k) => { secret[k] = next[k] || ''; });
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe)); } catch (_) {}
        try { window.sessionStorage.setItem(SECRET_KEY, JSON.stringify(secret)); } catch (_) {}
      }
      return next;
    });
  }, []);

  const setTrack = useCallback((axis, value) => {
    if (!TRACK_AXES[axis] || !TRACK_AXES[axis].includes(value)) return;
    setTrackState((prev) => {
      const next = { ...prev, [axis]: value };
      if (typeof window !== 'undefined') {
        try { window.localStorage.setItem(TRACK_KEY, JSON.stringify(next)); } catch (_) {}
        try { window.localStorage.setItem(TRACK_TOUCHED_KEY, '1'); } catch (_) {}
      }
      return next;
    });
    setTrackTouched(true);
  }, []);

  const setSequencerCount = useCallback((raw) => {
    const next = sanitizeCount(raw);
    setSequencerCountState(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(COUNT_KEY, String(next)); } catch (_) {}
    }
  }, []);

  const setAztecPort = useCallback((raw) => {
    const next = sanitizePort(raw);
    setAztecPortState(next);
    if (typeof window !== 'undefined') {
      try { window.localStorage.setItem(PORT_KEY, String(next)); } catch (_) {}
    }
  }, []);

  const reset = useCallback(() => {
    setValues(DEFAULT_VALUES);
    setSequencerCountState(DEFAULT_SEQUENCER_COUNT);
    setAztecPortState(DEFAULT_AZTEC_PORT);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      try { window.sessionStorage.removeItem(SECRET_KEY); } catch (_) {}
      try { window.localStorage.removeItem(COUNT_KEY); } catch (_) {}
      try { window.localStorage.removeItem(PORT_KEY); } catch (_) {}
    }
  }, []);

  const ctxValue = useMemo(
    () => ({
      values, track, trackTouched, sequencerCount, aztecPort,
      setField, setTrack, setSequencerCount, setAztecPort, reset, hydrated,
    }),
    [values, track, trackTouched, sequencerCount, aztecPort, setField, setTrack, setSequencerCount, setAztecPort, reset, hydrated],
  );

  return <Ctx.Provider value={ctxValue}>{children}</Ctx.Provider>;
}

export function useOperatorConfig() {
  return useContext(Ctx);
}

export {
  SAFE_FIELDS,
  SECRET_FIELDS,
  ALL_FIELDS,
  TRACK_AXES,
  DEFAULT_TRACK,
  DEFAULT_SEQUENCER_COUNT,
  MAX_SEQUENCER_COUNT,
};

export function maskSecret(val) {
  if (!val || val.length < 10) return val;
  return `${val.slice(0, 6)}****${val.slice(-4)}`;
}

// IMAGE_TAG is sourced from network_version_config.json, the same file docusaurus.config.js
// reads to render the version label in the navbar. Bump that file on each release;
// it cascades to compose snippets and install-toolchain version examples.
//
// Contract addresses (REGISTRY_ADDR, ROLLUP_ADDR, GSE_ADDR, SLASHER_ADDR) are hardcoded
// from https://docs.aztec.network/networks. Rollup and Slasher addresses change when
// governance migrates contracts; Registry and GSE addresses are stable anchors and
// rotate only on major upgrades. Resync this block from /networks on each major release.
// Last synced: 2026-04-27.
const NETWORK_TOKENS = {
  testnet: {
    REGISTRY_ADDR: '0xa0bfb1b494fb49041e5c6e8c2c1be09cd171c6ba',
    ROLLUP_ADDR: '0xf6D0D42aCE06829bECB78C74F49879528fC632c1',
    GSE_ADDR: '0xb6a38a51a6c1de9012f9d8ea9745ef957212eaac',
    STAKING_REGISTRY_ADDR: '0xC6EcC1832c8BF6a41c927BEb4E9ec610FBeDd1C2',
    SLASHER_ADDR: '0xCF750B724558098E5db67B651f03a31AE2b252f4',
    L1_CHAIN_ID: '11155111',
    NETWORK_NAME: 'testnet',
    TOKEN_SYMBOL: 'STK',
    IMAGE_TAG: RECOMMENDED_VERSION,
    DEFAULT_RPC_HINT: 'https://eth-sepolia.g.alchemy.com/v2/...',
  },
  mainnet: {
    REGISTRY_ADDR: '0x35b22e09ee0390539439e24f06da43d83f90e298',
    ROLLUP_ADDR: '0xae2001f7e21d5ecabf6234e9fdd1e76f50f74962',
    GSE_ADDR: '0xa92ecFD0E70c9cd5E5cd76c50Af0F7Da93567a4f',
    STAKING_REGISTRY_ADDR: '0x042dF8f42790d6943F41C25C2132400fd727f452',
    SLASHER_ADDR: '0x64E6e9Bb9f1E33D319578B9f8a9C719Ca6D46eBb',
    L1_CHAIN_ID: '1',
    NETWORK_NAME: 'mainnet',
    TOKEN_SYMBOL: 'AZTEC',
    IMAGE_TAG: networkVersionConfig.mainnet || RECOMMENDED_VERSION,
    DEFAULT_RPC_HINT: 'https://eth-mainnet.g.alchemy.com/v2/...',
  },
};

export { RECOMMENDED_VERSION };

export function networkTokens(track) {
  const network = (track && track.network) || 'testnet';
  return NETWORK_TOKENS[network] || NETWORK_TOKENS.testnet;
}

export function substitute(template, values, { mask = false, track, sequencerCount, aztecPort } = {}) {
  if (!template) return template;
  const tokens = networkTokens(track);
  const count = sanitizeCount(sequencerCount);
  const port = sanitizePort(aztecPort);
  // Tokens derived from sequencerCount + aztecPort. Keep this list small and obvious;
  // downstream shell templates compose anything fancier.
  const derivedTokens = {
    COUNT: String(count),
    COUNT_MINUS_1: String(count - 1),
    ETH_TOTAL: (count * 0.01).toFixed(2).replace(/\.?0+$/, '') || '0',
    AZTEC_TOTAL: String(count * 200000),
    AZTEC_TOTAL_WEI: String(BigInt(count) * 200000n * 10n ** 18n),
    RECOMMENDED_VERSION,
    AZTEC_PORT: String(port),
  };
  return template.replace(/\{\{([A-Z_][A-Z0-9_]*)\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(derivedTokens, key)) return derivedTokens[key];
    if (Object.prototype.hasOwnProperty.call(tokens, key)) return tokens[key];
    const raw = values[key];
    if (!raw) return `{{${key}}}`;
    if (mask && SECRET_FIELDS.includes(key)) return maskSecret(raw);
    return raw;
  });
}
