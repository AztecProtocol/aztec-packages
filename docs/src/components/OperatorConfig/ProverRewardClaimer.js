import React, { useState, useEffect, useCallback } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import { useOperatorConfig } from './context';
import styles from './fundingCalculator.module.css';
import track from './trackpicker.module.css';

// Current canonical rollups (getCanonicalRollup() on each network's Registry,
// verified live). A testnet relaunch deploys a new rollup, so the testnet
// default can go stale; the page lists both and points at the Registry.
const ROLLUPS = {
  mainnet: '0xae2001f7e21d5ecabf6234e9fdd1e76f50f74962',
  testnet: '0xe4394f118b115de2bdad88ee1abd599cf5d25c70',
};

const MAX_EPOCHS_SCANNED = 256; // bound the scan; ~ recent history, keeps it fast

const fmtAztec = (wei) => {
  const v = Number(wei) / 1e18;
  if (v === 0) return '0';
  if (v >= 1) return v.toFixed(2).replace(/\.?0+$/, '');
  return v.toExponential(2);
};
const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(s);
const safeHostname = (url) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
};

// Minimal ABI-encoders for the two read calls (no ethers/web3 dependency).
const padAddr = (a) => a.toLowerCase().replace('0x', '').padStart(64, '0');
const padUint = (n) => BigInt(n).toString(16).padStart(64, '0');
// getSpecificProverRewardsForEpoch(uint256 epoch, address prover) -> 0x68faa778
const encRewards = (epoch, prover) => '0x68faa778' + padUint(epoch) + padAddr(prover);

async function ethCall(rpcUrl, to, data, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
        id: 1,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || 'rpc error');
    return json.result;
  } finally {
    clearTimeout(t);
  }
}

// Precomputed 4-byte selectors for the no-arg getters used here (verified
// against l1-contracts v4.3.1 via cast sig).
const SEL = {
  getCurrentEpoch: '0xb97dd9e2',
  getProofSubmissionEpochs: '0x25b22366',
  isRewardsClaimable: '0xfcb3f6ba',
};

function Claimer() {
  const { values } = useOperatorConfig();
  const configRpc = (values && values.ETH_RPC) || '';

  const [network, setNetwork] = useState('mainnet');
  const [rpcUrl, setRpcUrl] = useState('');
  const [rollup, setRollup] = useState(ROLLUPS.mainnet);
  const [prover, setProver] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, label: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (configRpc && !rpcUrl) setRpcUrl(configRpc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configRpc]);

  const onNetwork = useCallback((n) => {
    setNetwork(n);
    setRollup(ROLLUPS[n] || '');
    setResult(null);
    setError(null);
  }, []);

  const rpcOk = !!safeHostname(rpcUrl);
  const rollupOk = isAddress(rollup);
  const proverOk = isAddress(prover);
  const canScan = rpcOk && rollupOk && proverOk && !scanning;

  async function scan() {
    setScanning(true);
    setError(null);
    setResult(null);
    setProgress({ pct: 0, label: 'reading current epoch…' });
    try {
      const [curHex, subHex, claimableHex] = await Promise.all([
        ethCall(rpcUrl, rollup, SEL.getCurrentEpoch),
        ethCall(rpcUrl, rollup, SEL.getProofSubmissionEpochs).catch(() => '0x1'),
        ethCall(rpcUrl, rollup, SEL.isRewardsClaimable).catch(() => null),
      ]);
      const currentEpoch = Number(BigInt(curHex));
      const proofSubEpochs = Number(BigInt(subHex || '0x1'));
      const claimable =
        claimableHex == null ? null : BigInt(claimableHex) !== 0n;
      // An epoch is past its proof deadline (claimable) once
      // currentEpoch >= epoch + proofSubmissionEpochs + 1.
      const newestClaimable = currentEpoch - (proofSubEpochs + 1);
      const oldest = Math.max(0, newestClaimable - MAX_EPOCHS_SCANNED + 1);

      const found = [];
      let total = 0n;
      const span = newestClaimable - oldest + 1;
      for (let epoch = newestClaimable; epoch >= oldest; epoch--) {
        const data = encRewards(epoch, prover);
        let rewHex;
        try {
          rewHex = await ethCall(rpcUrl, rollup, data, 8000);
        } catch (e) {
          continue;
        }
        const rew = BigInt(rewHex || '0x0');
        if (rew > 0n) {
          found.push({ epoch, reward: rew });
          total += rew;
        }
        const done = newestClaimable - epoch + 1;
        setProgress({
          pct: (done / span) * 100,
          label: `scanning epoch ${epoch} (${found.length} with rewards)`,
        });
      }
      found.reverse(); // ascending epoch order
      setResult({
        currentEpoch,
        proofSubEpochs,
        newestClaimable,
        oldest,
        claimable,
        epochs: found,
        total,
      });
    } catch (e) {
      setError(e.message || 'scan failed');
    } finally {
      setScanning(false);
      setProgress({ pct: 0, label: '' });
    }
  }

  const epochListArg = result && result.epochs.length
    ? `[${result.epochs.map((e) => e.epoch).join(',')}]`
    : '[EPOCH_1,EPOCH_2]';

  const claimCmd =
    `cast send ${rollupOk ? rollup : '$ROLLUP'} \\\n` +
    `  "claimProverRewards(address,uint256[])" \\\n` +
    `  ${proverOk ? prover : '$PROVER_ID'} \\\n` +
    `  "${epochListArg}" \\\n` +
    `  --rpc-url ${rpcOk ? rpcUrl : '$RPC_URL'} \\\n` +
    `  --private-key [GAS_PAYER_PRIVATE_KEY]`;

  return (
    <div className={styles.calc} aria-label="Prover reward claim helper">
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Your details</div>
        <div className={styles.row}>
          <div className={track.group}>
            <span className={track.groupLabel}>Network</span>
            <div className={track.groupBtns} role="radiogroup" aria-label="Network">
              {[
                { value: 'testnet', label: 'Testnet (Sepolia)' },
                { value: 'mainnet', label: 'Mainnet (alpha)' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={network === opt.value}
                  className={track.btn}
                  data-active={network === opt.value}
                  onClick={() => onNetwork(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className={`${styles.field} ${styles.wide}`}>
            <label>L1 RPC URL (the same one your prover uses)</label>
            <input
              type="text"
              value={rpcUrl}
              onChange={(e) => setRpcUrl(e.target.value.trim())}
              placeholder="https://your-rpc-endpoint.example.io/v3/your-key"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={`${styles.field} ${styles.wide}`}>
            <label>Rollup contract address</label>
            <input
              type="text"
              value={rollup}
              onChange={(e) => setRollup(e.target.value.trim())}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className={`${styles.field} ${styles.wide}`}>
            <label>Your PROVER_ID address</label>
            <input
              type="text"
              value={prover}
              onChange={(e) => setProver(e.target.value.trim())}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label>&nbsp;</label>
            <button
              type="button"
              className={`${styles.btn} ${styles.primary}`}
              onClick={scan}
              disabled={!canScan}
            >
              {scanning ? 'Scanning…' : 'Find claimable epochs'}
            </button>
          </div>
        </div>
        {scanning && (
          <div className={styles.progressWrap}>
            <div className={styles.progress}>
              <div className={styles.progressBar} style={{ width: `${progress.pct.toFixed(1)}%` }} />
            </div>
            <div className={styles.progressLabel}>{progress.label}</div>
          </div>
        )}
        <div className={styles.footnote} style={{ marginTop: '0.45rem' }}>
          {error
            ? `Scan failed: ${error}.`
            : `Read-only: this queries pending rewards over your recent epochs. No keys are entered here and nothing is sent to the docs site. The scan covers the most recent ${MAX_EPOCHS_SCANNED} claimable epochs.${
                network === 'testnet'
                  ? ' Prover reward claiming is currently disabled on testnet.'
                  : ''
              }`}
        </div>
      </div>

      {result && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>
            Claimable epochs
            {result.claimable === false && (
              <span className={`${styles.badge} ${styles.stale}`}>rewards locked on this network</span>
            )}
          </div>
          {result.epochs.length === 0 ? (
            <div className={styles.footnote}>
              No unclaimed rewards found for {prover.slice(0, 8)}…{prover.slice(-6)} in the last{' '}
              {MAX_EPOCHS_SCANNED} claimable epochs (current epoch {result.currentEpoch}). If you
              proved older epochs, widen the range with the manual query below.
            </div>
          ) : (
            <>
              <div className={styles.summary}>
                <strong>{result.epochs.length}</strong> epoch
                {result.epochs.length === 1 ? '' : 's'} with unclaimed rewards, total{' '}
                <span className={styles.amount}>{fmtAztec(result.total)} AZTEC</span> (epochs{' '}
                {result.oldest} to {result.newestClaimable} scanned).
              </div>
              <pre className={styles.cmd}>{claimCmd}</pre>
              {result.claimable === false && (
                <div className={styles.footnote}>
                  Claiming is currently disabled on this network (`isRewardsClaimable()` is false), so
                  the command above would revert until it is enabled. Your rewards keep accruing in the
                  meantime.
                </div>
              )}
              <div className={styles.footnote}>
                The address that runs this command only pays gas. The rewards are paid to the
                PROVER_ID you entered, regardless of which key signs, so you can submit from any funded
                wallet.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProverRewardClaimer() {
  return <BrowserOnly fallback={null}>{() => <Claimer />}</BrowserOnly>;
}
