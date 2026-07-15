import React, { useState, useEffect, useRef, useCallback } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig } from './context';
import styles from './fundingCalculator.module.css';

const ROLLUP_ADDRESS = '0xae2001f7e21d5ecabf6234e9fdd1e76f50f74962';
const ACTIVE_ATTESTER_COUNT_SELECTOR = '0x90a3b386'; // getActiveAttesterCount()
// Top-level selector of the propose() call. On mainnet the proposer submits it
// wrapped in a Multicall3 aggregate3, so this is the calldata selector seen on
// the receipt's tx, used only to filter the gas/price receipt sample.
const PROPOSE_SELECTOR = '0x82ad56cb';
// topic0 of the event a propose() emits (one per proposed checkpoint). Filtering
// eth_getLogs on this counts propose() calls EXACTLY, with no per-tx fetching:
// it excludes submitEpochRootProof (topic 0x034dd13d...) and other rollup entry
// points that also emit logs. Verified one-log-per-propose, no overlap with the
// epoch-proof event, against the live v4 rollup.
const PROPOSE_EVENT_TOPIC =
  '0x6ff492bf2b4ca1b93a175167d14b3e46085b935cab3f39ca94013000799b93a0';

// Historical baseline. Derived from a full sweep of the v4 rollup contract
// (0xae2001...74962) from launch (block 24769362, 2026-03-30) through end of
// May 2026 (block 25218539). 140,986 unique txs hit the contract; sampled the
// shuffled set until we had 100 propose() receipts (200 candidate fetches; the
// rollup's non-propose entry points like attestation and claim account for the
// other ~50% of traffic). Median gasUsed = 358,650. Used as the fallback when
// the operator has not run their own scan yet.
const DEFAULT_GAS_PER_PROPOSE = 358650;

const RECEIPT_SAMPLE_SIZE = 20; // target count of propose() receipts to sample
const RECEIPT_OVERSAMPLE_MULT = 3; // draw N * mult candidates so receipt-fetch failures still leave N samples

const STATIC_SCENARIOS = [
  { key: 'quiet', label: 'Quiet', gwei: 0.5 },
  { key: 'typical', label: 'Typical', gwei: 1 },
  { key: 'busy', label: 'Busy', gwei: 5 },
  { key: 'spike', label: 'Spike', gwei: 20 },
];

const PUBLIC_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
];

const SCAN_CHUNK_BLOCKS = 1800; // ~6h per chunk; publicnode-tested upper bound
const SCAN_TOTAL_BLOCKS = (30 * 24 * 60 * 60) / 12; // 30 days at 12s/block = 216,000
const CHUNK_COUNT = Math.ceil(SCAN_TOTAL_BLOCKS / SCAN_CHUNK_BLOCKS); // ~120 chunks
const SCAN_STALE_DAYS = 7;
const STORAGE_KEY_PREFIX = 'aztec-funding-calc.v1.scan.';

// ---- pure helpers ----
const fmtEth = (eth) => {
  if (eth >= 0.01) return eth.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  if (eth >= 0.0001) return eth.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  return eth.toExponential(2);
};
const fmtWeeks = (weeks) => {
  if (!isFinite(weeks) || weeks <= 0) return 'n/a';
  if (weeks >= 104) return `${(weeks / 52).toFixed(1)} years`;
  if (weeks >= 52) return `~1 year`;
  if (weeks >= 8) return `${(weeks / 4.33).toFixed(1)} months`;
  if (weeks >= 1) return `${weeks.toFixed(1)} weeks`;
  return `${(weeks * 7).toFixed(1)} days`;
};
const fmtGwei = (g) => {
  if (!isFinite(g) || g <= 0) return 'n/a';
  if (g < 0.01) return g.toFixed(4);
  if (g < 1) return g.toFixed(3);
  if (g < 10) return g.toFixed(2);
  return g.toFixed(1);
};
const safeHostname = (url) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
};
const daysAgo = (ts) => (Date.now() - ts) / (1000 * 60 * 60 * 24);
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  return n === 0 ? null : n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
// Fisher-Yates sample without replacement.
const sampleN = (arr, n) => {
  const a = [...arr];
  const out = [];
  for (let i = 0; i < n && a.length > 0; i++) {
    const j = Math.floor(Math.random() * a.length);
    out.push(a[j]);
    a.splice(j, 1);
  }
  return out;
};

async function rpcCall(url, method, params, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

function loadScanState(hostname) {
  if (!hostname || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PREFIX + hostname);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function saveScanState(state) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + state.hostname, JSON.stringify(state));
  } catch (e) {
    /* localStorage disabled, swallow */
  }
}

// When a scan has produced effectiveGasPrice samples, replace the static four
// with live percentiles derived from what publishers actually paid.
function scenariosFor(scanState) {
  if (scanState && scanState.gwei) {
    const g = scanState.gwei;
    return [
      { key: 'p50', label: 'Scan p50', gwei: g.p50 },
      { key: 'p75', label: 'Scan p75', gwei: g.p75 },
      { key: 'p90', label: 'Scan p90', gwei: g.p90 },
      { key: 'max', label: 'Scan max', gwei: g.max },
    ];
  }
  return STATIC_SCENARIOS;
}

function Calculator() {
  const { sequencerCount, values } = useOperatorConfig();
  const configRpc = (values && values.ETH_RPC) || '';

  const [rpcUrl, setRpcUrl] = useState('');
  const [scanState, setScanState] = useState(null);
  const [count, setCount] = useState(sequencerCount || 1);
  const [topup, setTopup] = useState('0.03');
  const [gwei, setGwei] = useState('1');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, label: '' });
  const [statusOverride, setStatusOverride] = useState(null);
  const [liveStatus, setLiveStatus] = useState('');
  const [fetchingLive, setFetchingLive] = useState(false);

  const cancelRef = useRef(false);

  // Seed the RPC field from the operator's pasted ETH_RPC config once, if present.
  useEffect(() => {
    if (configRpc && !rpcUrl) {
      setRpcUrl(configRpc);
      const host = safeHostname(configRpc);
      if (host) setScanState(loadScanState(host));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configRpc]);

  // Keep the sequencer count in sync with the shared config until the user
  // edits it directly here.
  const countTouched = useRef(false);
  useEffect(() => {
    if (!countTouched.current && sequencerCount) setCount(sequencerCount);
  }, [sequencerCount]);

  const onRpcChange = useCallback((e) => {
    const v = e.target.value.trim();
    setRpcUrl(v);
    setStatusOverride(null);
    const host = safeHostname(v);
    setScanState(host ? loadScanState(host) : null);
  }, []);

  const numCount = Math.max(1, parseInt(count, 10) || 1);
  const numTopup = Math.max(0.0001, parseFloat(topup) || 0.01);
  const numGwei = Math.max(0.01, parseFloat(gwei) || 1);

  const hasScan = scanState && scanState.perAttesterPerWeek > 0;
  const liveChips = hasScan && scanState.gwei;
  const gasPerPropose = (scanState && scanState.gasPerPropose) || DEFAULT_GAS_PER_PROPOSE;
  // Per-propose blob fee (ETH) from the scan. Added flat to per-propose cost
  // because blob gas is billed separately from execution gas and its price moves
  // independently of the gwei slider. 0 before a scan (the baseline has no blob
  // data), which matches the pre-blob behavior.
  const blobCostPerPropose = (scanState && scanState.blobCostEthPerPropose) || 0;
  const scenarios = scenariosFor(scanState);
  const hostname = safeHostname(rpcUrl);

  async function runScan() {
    const host = safeHostname(rpcUrl);
    if (!host) return;
    cancelRef.current = false;
    setScanning(true);
    setStatusOverride(null);
    setProgress({ pct: 0, label: '0 / 30 days' });

    try {
      const [latestHex, attesterHex] = await Promise.all([
        rpcCall(rpcUrl, 'eth_blockNumber', [], 8000),
        rpcCall(
          rpcUrl,
          'eth_call',
          [{ to: ROLLUP_ADDRESS, data: ACTIVE_ATTESTER_COUNT_SELECTOR }, 'latest'],
          8000,
        ),
      ]);
      const latest = Number(BigInt(latestHex));
      const attesters = Number(BigInt(attesterHex));
      if (attesters <= 0) throw new Error('getActiveAttesterCount() returned 0');

      const fromBlock = latest - SCAN_TOTAL_BLOCKS;
      const txHashes = new Set();
      let chunksFailed = 0;

      for (let i = 0; i < CHUNK_COUNT; i++) {
        if (cancelRef.current) throw new Error('cancelled by user');
        const chunkFrom = fromBlock + i * SCAN_CHUNK_BLOCKS;
        const chunkTo = Math.min(chunkFrom + SCAN_CHUNK_BLOCKS - 1, latest);
        const params = [
          {
            address: ROLLUP_ADDRESS,
            topics: [PROPOSE_EVENT_TOPIC],
            fromBlock: '0x' + chunkFrom.toString(16),
            toBlock: '0x' + chunkTo.toString(16),
          },
        ];
        let logs;
        try {
          logs = await rpcCall(rpcUrl, 'eth_getLogs', params, 15000);
        } catch (e) {
          try {
            await new Promise((r) => setTimeout(r, 800));
            logs = await rpcCall(rpcUrl, 'eth_getLogs', params, 15000);
          } catch (e2) {
            chunksFailed++;
            console.warn(`chunk ${i + 1}/${CHUNK_COUNT} failed:`, e2.message);
          }
        }
        if (logs) {
          for (const log of logs) txHashes.add(log.transactionHash);
        }

        const pct = ((i + 1) / CHUNK_COUNT) * 100;
        const dayProgress = Math.round(((i + 1) / CHUNK_COUNT) * 30);
        setProgress({
          pct,
          label: `${dayProgress} / 30 days` + (chunksFailed ? ` (${chunksFailed} failed)` : ''),
        });
      }

      const chunksOk = CHUNK_COUNT - chunksFailed;
      if (chunksOk === 0) throw new Error('every chunk failed; check RPC');

      const observedSeconds = chunksOk * SCAN_CHUNK_BLOCKS * 12;
      const observedWeeks = observedSeconds / (7 * 24 * 60 * 60);

      // txHashes was filtered on the propose() event topic during the scan, so
      // its size is the exact propose() count over the observed window: no
      // extrapolation, no non-propose entry points (submitEpochRootProof etc.)
      // mixed in.
      const proposeCount = txHashes.size;
      const perAttesterPerWeek = proposeCount / attesters / observedWeeks;

      setProgress((p) => ({ ...p, label: 'sampling propose() receipts…' }));
      let nextGasPerPropose = null;
      let gasSampleSize = 0;
      let gweiStats = null;
      let blobCostEthPerPropose = null;
      let blobGweiMedian = null;
      if (proposeCount > 0) {
        const drawSize = Math.min(RECEIPT_SAMPLE_SIZE * RECEIPT_OVERSAMPLE_MULT, txHashes.size);
        const candidates = sampleN([...txHashes], drawSize);
        const gasUsedSamples = [];
        const gweiSamples = [];
        // propose() is an EIP-4844 blob tx (1 proposal blob). Blob gas is billed
        // separately from execution gas and is NOT in receipt.gasUsed, so capture
        // blobGasUsed * blobGasPrice here and add it to per-propose cost. Blob
        // price moves independently of execution gwei, so it can't ride the gwei
        // slider; it's a measured ETH term from scan-time blob prices.
        const blobCostEthSamples = [];
        const blobGweiSamples = [];
        for (const txHash of candidates) {
          if (cancelRef.current) break;
          if (gasUsedSamples.length >= RECEIPT_SAMPLE_SIZE) break;
          try {
            const [tx, receipt] = await Promise.all([
              rpcCall(rpcUrl, 'eth_getTransactionByHash', [txHash], 6000),
              rpcCall(rpcUrl, 'eth_getTransactionReceipt', [txHash], 6000),
            ]);
            if (!tx || !receipt) continue;
            // Every candidate is already a propose() (topic-filtered), but the
            // proposer wraps it in Multicall3, so confirm the calldata carries
            // the propose selector before trusting the receipt's gas.
            const input = (tx.input || '').toLowerCase();
            if (!input.startsWith(PROPOSE_SELECTOR) && !input.includes(PROPOSE_SELECTOR.slice(2)))
              continue;
            if (receipt.gasUsed) gasUsedSamples.push(Number(BigInt(receipt.gasUsed)));
            if (receipt.effectiveGasPrice) {
              gweiSamples.push(Number(BigInt(receipt.effectiveGasPrice)) / 1e9);
            }
            if (receipt.blobGasUsed && receipt.blobGasPrice) {
              const blobGas = BigInt(receipt.blobGasUsed);
              const blobPriceWei = BigInt(receipt.blobGasPrice);
              blobCostEthSamples.push(Number(blobGas * blobPriceWei) / 1e18);
              blobGweiSamples.push(Number(blobPriceWei) / 1e9);
            }
          } catch (e) {
            console.warn(`receipt ${txHash.slice(0, 10)} failed:`, e.message);
          }
        }
        if (gasUsedSamples.length > 0) {
          nextGasPerPropose = median(gasUsedSamples);
          gasSampleSize = gasUsedSamples.length;
        }
        if (gweiSamples.length >= 4) {
          const sorted = [...gweiSamples].sort((a, b) => a - b);
          const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
          gweiStats = {
            p50: median(sorted),
            p75: pick(0.75),
            p90: pick(0.9),
            max: sorted[sorted.length - 1],
            n: sorted.length,
          };
        }
        if (blobCostEthSamples.length > 0) {
          blobCostEthPerPropose = median(blobCostEthSamples);
          blobGweiMedian = median(blobGweiSamples);
        }
      }

      const nextState = {
        hostname: host,
        perAttesterPerWeek,
        attesters,
        scannedAt: Date.now(),
        totalProposes: proposeCount,
        chunksFailed,
        gasPerPropose: nextGasPerPropose,
        gasSampleSize,
        gwei: gweiStats,
        blobCostEthPerPropose,
        blobGweiMedian,
      };
      saveScanState(nextState);
      setScanState(nextState);
      if (gweiStats && gweiStats.p50) setGwei(String(gweiStats.p50));
    } catch (e) {
      setStatusOverride(
        e.message === 'cancelled by user' ? 'Scan cancelled.' : `Scan failed: ${e.message}.`,
      );
    } finally {
      setScanning(false);
      setProgress({ pct: 0, label: '' });
    }
  }

  async function fetchLiveGwei() {
    const tryUrls = [];
    if (rpcUrl && safeHostname(rpcUrl)) tryUrls.push(rpcUrl);
    for (const u of PUBLIC_RPCS) tryUrls.push(u);
    for (const url of tryUrls) {
      try {
        const result = await rpcCall(url, 'eth_gasPrice', [], 3500);
        return { gwei: Number(BigInt(result)) / 1e9, source: url };
      } catch (e) {
        console.warn(`gwei via ${url} failed:`, e.message);
      }
    }
    throw new Error('all RPC endpoints failed');
  }

  async function onLiveGwei() {
    setFetchingLive(true);
    setLiveStatus('fetching…');
    try {
      const { gwei: g, source } = await fetchLiveGwei();
      setGwei(g.toFixed(2));
      setLiveStatus(`live: ${g.toFixed(3)} gwei via ${safeHostname(source)}`);
    } catch (e) {
      setLiveStatus(`live fetch failed (${e.message})`);
    } finally {
      setFetchingLive(false);
    }
  }

  // ---- status line ----
  let badgeClass = `${styles.badge} ${styles.defaults}`;
  let badgeText = 'No RPC connected';
  let statusNode = null;
  let scanDisabled = true;
  let scanLabel = 'Scan last 30 days';

  if (statusOverride) {
    statusNode = statusOverride;
  }

  if (!rpcUrl) {
    badgeText = 'No RPC connected';
    if (!statusNode) {
      statusNode =
        "Paste your RPC URL to enable a 30-day scan. The URL is stored only in your browser's localStorage; nothing is sent to the docs site.";
    }
  } else if (!hostname) {
    badgeClass = `${styles.badge} ${styles.stale}`;
    badgeText = 'Invalid URL';
    if (!statusNode) {
      statusNode = "URL doesn't look valid. Expected something like https://your-rpc.example.io/v3/key.";
    }
  } else if (scanState && scanState.hostname === hostname) {
    const days = daysAgo(scanState.scannedAt);
    const stale = days > SCAN_STALE_DAYS;
    badgeClass = `${styles.badge} ${stale ? styles.stale : styles.live}`;
    badgeText = stale
      ? `Scan ${Math.floor(days)}d old (stale)`
      : `Scan from ${days < 1 ? 'today' : Math.floor(days) + 'd ago'}`;
    scanDisabled = false;
    scanLabel = stale ? 'Re-scan (stale)' : 'Scan again';
    const partial =
      scanState.chunksFailed > 0
        ? ` (${scanState.chunksFailed} of ${CHUNK_COUNT} chunks failed, result based on partial data)`
        : '';
    const gasLine = scanState.gasPerPropose
      ? ` Sampled ${scanState.gasSampleSize} receipts: median gas per propose() = ${Math.round(
          scanState.gasPerPropose,
        ).toLocaleString('en-US')}.`
      : ` Receipt sampling failed; gas-per-propose fell back to ${DEFAULT_GAS_PER_PROPOSE.toLocaleString(
          'en-US',
        )}.`;
    const gweiLine = scanState.gwei
      ? ` Effective gas prices paid (gwei): p50 ${fmtGwei(scanState.gwei.p50)} · p75 ${fmtGwei(
          scanState.gwei.p75,
        )} · p90 ${fmtGwei(scanState.gwei.p90)} · max ${fmtGwei(scanState.gwei.max)} (n=${
          scanState.gwei.n
        }).`
      : '';
    const blobLine = scanState.blobCostEthPerPropose
      ? ` Blob fee added per propose: ${fmtEth(
          scanState.blobCostEthPerPropose,
        )} ETH (1 blob at ${fmtGwei(scanState.blobGweiMedian)} gwei blob gas at scan time; blob price moves independently of the gwei slider, so re-scan during a blob-fee spike).`
      : '';
    if (!statusNode) {
      statusNode = `Scanned ${hostname}: ${scanState.totalProposes.toLocaleString(
        'en-US',
      )} propose() calls across ${scanState.attesters.toLocaleString(
        'en-US',
      )} attesters, ${scanState.perAttesterPerWeek.toFixed(
        2,
      )} per attester per week${partial}.${gasLine}${gweiLine}${blobLine}`;
    }
  } else {
    badgeText = 'Ready to scan';
    scanDisabled = false;
    if (!statusNode) {
      statusNode =
        'RPC looks valid. Click Scan last 30 days to count propose() calls and unlock runway estimates. A scan typically takes 20 to 40 seconds depending on your endpoint.';
    }
  }
  if (scanning) scanDisabled = true;

  const gridTitle = hasScan ? 'Runway by scenario' : 'Cost per propose() call by scenario';

  return (
    <div className={styles.calc} aria-label="Publisher gas calculator">
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          L1 RPC <span className={badgeClass}>{badgeText}</span>
        </div>
        <div className={styles.row}>
          <div className={`${styles.field} ${styles.wide}`}>
            <label>L1 RPC URL (the same one your node uses)</label>
            <input
              type="text"
              value={rpcUrl}
              onChange={onRpcChange}
              placeholder="https://your-rpc-endpoint.example.io/v3/your-key"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label>&nbsp;</label>
            <button
              type="button"
              className={`${styles.btn} ${styles.primary}`}
              onClick={runScan}
              disabled={scanDisabled}
            >
              {scanLabel}
            </button>
          </div>
        </div>
        {scanning && (
          <div className={styles.progressWrap}>
            <div className={styles.progress}>
              <div className={styles.progressBar} style={{ width: `${progress.pct.toFixed(1)}%` }} />
            </div>
            <div className={styles.progressLabel}>{progress.label}</div>
            <button
              type="button"
              className={styles.btn}
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              Cancel
            </button>
          </div>
        )}
        <div className={styles.footnote} style={{ marginTop: '0.45rem' }}>
          {statusNode}
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Funding inputs</div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label>Sequencers</label>
            <input
              type="number"
              value={count}
              min="1"
              max="500"
              onChange={(e) => {
                countTouched.current = true;
                setCount(e.target.value);
              }}
            />
          </div>
          <div className={styles.field}>
            <label>Opening top-up (ETH)</label>
            <input
              type="number"
              value={topup}
              min="0.001"
              step="0.001"
              onChange={(e) => setTopup(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>L1 gas price (gwei)</label>
            <input
              type="number"
              value={gwei}
              min="0.05"
              step="0.05"
              onChange={(e) => setGwei(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label>Scenario presets</label>
            <div className={styles.chips}>
              {scenarios.map((sc) => {
                const active = Math.abs(sc.gwei - numGwei) < 1e-4;
                return (
                  <span
                    key={sc.key}
                    className={`${styles.chip} ${active ? styles.active : ''}`}
                    onClick={() => setGwei(String(sc.gwei))}
                  >
                    {liveChips
                      ? `${sc.label} · ${fmtGwei(sc.gwei)}`
                      : `${sc.label} (${fmtGwei(sc.gwei)})`}
                  </span>
                );
              })}
            </div>
          </div>
          <div className={styles.field}>
            <label>&nbsp;</label>
            <button
              type="button"
              className={styles.btn}
              onClick={onLiveGwei}
              disabled={fetchingLive}
            >
              Use live gwei →
            </button>
          </div>
          <div className={styles.field}>
            <label>&nbsp;</label>
            <span className={styles.status}>{liveStatus || ' '}</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{gridTitle}</div>
        <div className={styles.grid}>
          {scenarios.map((sc) => {
            const isCurrent = Math.abs(sc.gwei - numGwei) < 1e-4;
            const scLabel = liveChips
              ? `${sc.label} · ${fmtGwei(sc.gwei)} gwei`
              : `${sc.label} (${fmtGwei(sc.gwei)} gwei)`;
            if (hasScan) {
              const costPerPropose = gasPerPropose * sc.gwei * 1e-9 + blobCostPerPropose;
              const burnPerWeek =
                numCount * scanState.perAttesterPerWeek * costPerPropose;
              const runwayWeeks = burnPerWeek > 0 ? numTopup / burnPerWeek : Infinity;
              const warn = runwayWeeks < 2;
              return (
                <div
                  key={sc.key}
                  className={`${styles.card} ${isCurrent ? styles.highlight : ''}`}
                >
                  <h5>{scLabel}</h5>
                  <div className={`${styles.runway} ${warn ? styles.warn : ''}`}>
                    {fmtWeeks(runwayWeeks)}
                  </div>
                  <div className={styles.meta}>{fmtEth(burnPerWeek)} ETH / week</div>
                </div>
              );
            }
            const costPerCall = gasPerPropose * sc.gwei * 1e-9 + blobCostPerPropose;
            return (
              <div
                key={sc.key}
                className={`${styles.card} ${styles.locked} ${isCurrent ? styles.highlight : ''}`}
              >
                <h5>{scLabel}</h5>
                <div className={`${styles.runway} ${styles.locked}`}>
                  {fmtEth(costPerCall)} ETH
                  <br />
                  per call
                </div>
                <div className={styles.meta}>Scan with RPC to see runway</div>
              </div>
            );
          })}
        </div>
        <div className={styles.summary}>
          {hasScan
            ? (() => {
                const customCostPerPropose = gasPerPropose * numGwei * 1e-9 + blobCostPerPropose;
                const customBurn =
                  numCount * scanState.perAttesterPerWeek * customCostPerPropose;
                const customRunway = customBurn > 0 ? numTopup / customBurn : Infinity;
                return (
                  <>
                    <strong>Top-up</strong>:{' '}
                    <span className={styles.amount}>{fmtEth(numTopup)} ETH</span>
                    {'  ·  '}
                    <strong>At {numGwei} gwei</strong>: runway{' '}
                    <span className={styles.amount}>{fmtWeeks(customRunway)}</span>
                    {'  ·  '}
                    <strong>Weekly burn</strong>:{' '}
                    <span className={styles.amount}>{fmtEth(customBurn)} ETH</span>
                  </>
                );
              })()
            : (() => {
                const costPerCall = gasPerPropose * numGwei * 1e-9;
                return (
                  <>
                    <strong>At {numGwei} gwei</strong>, one propose() call costs roughly{' '}
                    <span className={styles.amount}>{fmtEth(costPerCall)} ETH</span>. A runway
                    estimate requires a 30-day scan via your L1 RPC.
                  </>
                );
              })()}
        </div>
      </div>

      <div className={styles.footnote}>
        Until you scan, runway cannot be computed and the chips show fixed scenarios (0.5 / 1 / 5 /
        20 gwei) against a baked-in 358,650-gas baseline: the median of 100 random propose() receipts
        sampled across the v4 rollup's on-chain history (2026-03-30 to 2026-05-31). After scanning
        your own RPC, the chips switch to percentiles (p50 / p75 / p90 / max) of the effective gas
        prices your scan observed, and gas-per-propose updates to the median of your scanned
        receipts. Both come from real propose() calls including the priority tip publishers paid.
        A scanned estimate also adds the blob fee each propose() pays (one proposal blob, billed
        separately from execution gas): this is a flat ETH term measured at the blob price seen
        during your scan, so re-scan during a blob-fee spike to refresh it.
      </div>
    </div>
  );
}

export default function PublisherFundingCalculator() {
  return <BrowserOnly fallback={null}>{() => <Calculator />}</BrowserOnly>;
}
