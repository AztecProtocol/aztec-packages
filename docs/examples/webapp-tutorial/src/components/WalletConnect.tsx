// docs:start:wallet-connect-imports
import React, { useState, useEffect } from 'react';
import type { Wallet, GrantedAccountsCapability } from '@aztec/aztec.js/wallet';
import type { WalletProvider } from '@aztec/wallet-sdk/manager';
import type { NetworkType } from '../config';
import { EmbeddedWallet } from '../embedded-wallet';
import { discoverWallets, connectToProvider, getAppCapabilities } from '../wallet-connection';
import { getNodeUrl } from '../config';
import { useTransactionLog } from './TransactionLog';

interface WalletConnectProps {
  network: NetworkType;
  onWalletConnected: (wallet: Wallet | EmbeddedWallet) => void;
}
// docs:end:wallet-connect-imports

// docs:start:wallet-connect-component
export function WalletConnect({ network, onWalletConnected }: WalletConnectProps) {
  const [status, setStatus] = useState<string>('');
  const [providers, setProviders] = useState<WalletProvider[]>([]);
  const [verificationEmojis, setVerificationEmojis] = useState<string | null>(null);
  const [testAccountIndex, setTestAccountIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [discoveryDone, setDiscoveryDone] = useState(false);
  const { addLog } = useTransactionLog();

  /** Connect using the embedded wallet with a pre-deployed test account */
  async function connectLocal() {
    setLoading(true);
    setStatus('Initializing PXE (this may take a moment)...');
    addLog('Initializing local PXE client...', 'pending');
    try {
      const nodeUrl = getNodeUrl('local');
      addLog(`Connecting to node at ${nodeUrl}`, 'info');
      const wallet = await EmbeddedWallet.initialize(nodeUrl);
      addLog('PXE initialized successfully', 'success');

      setStatus('Connecting test account...');
      addLog(`Connecting test account #${testAccountIndex + 1}...`, 'pending');
      await wallet.connectTestAccount(testAccountIndex);
      addLog(`Test account #${testAccountIndex + 1} connected`, 'success');

      setStatus('Connected!');
      onWalletConnected(wallet);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Connection error: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  // docs:start:remote-connect
  /** Discover and connect to a browser extension wallet */
  useEffect(() => {
    if (network !== 'remote') return;

    setStatus('Discovering wallet extensions...');
    setDiscoveryDone(false);
    const { cancel, done } = discoverWallets(31337, 'pod-racing', (found) => {
      setProviders(found);
      setStatus(`Found ${found.length} wallet(s)`);
    });

    let isMounted = true;
    done.then(() => {
      if (isMounted) setDiscoveryDone(true);
    }).catch((err) => {
      if (isMounted) setStatus(`Discovery error: ${err.message}`);
    });

    return () => {
      isMounted = false;
      cancel();
    };
  }, [network]);

  async function connectExtension(provider: WalletProvider) {
    setLoading(true);
    setStatus('Establishing secure channel...');
    try {
      const { emojis, confirm } = await connectToProvider(
        provider,
        'pod-racing'
      );

      // Show emojis for reference — the wallet extension is the authority
      // that verifies the emojis match. confirm() is a local operation
      // that creates the ExtensionWallet proxy (no message sent to extension).
      setVerificationEmojis(emojis);
      setStatus('Verify these emojis match in the wallet extension, then approve there.');

      const wallet = await confirm();

      // Request capabilities — the dApp declares all permissions it needs upfront.
      // The extension shows an approval dialog; this call blocks until the user approves.
      setStatus('Requesting permissions from wallet extension...');
      const manifest = getAppCapabilities();

      const capabilities = await wallet.requestCapabilities(manifest);
      setVerificationEmojis(null);
      console.log('[WalletConnect] Granted capabilities:', capabilities);

      // Check if accounts were granted
      const accountsCap = capabilities.granted.find(
        (c): c is GrantedAccountsCapability => c.type === 'accounts'
      );

      if (!accountsCap?.accounts?.length) {
        setStatus('No accounts granted. Please approve the capabilities request in the wallet extension.');
        setLoading(false);
        return;
      }

      setConnected(true);
      setStatus('Connected!');
      addLog('Connected to extension wallet', 'success');
      onWalletConnected(wallet);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg}`);
      addLog(`Connection error: ${msg}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  // docs:end:remote-connect

  return (
    <div className="wallet-connect">
      <h2>Connect Wallet</h2>
      {status && <p className="status">{status}</p>}

      {network === 'local' && (
        <div className="local-connect">
          <label>
            Test Account:
            <select
              value={testAccountIndex}
              onChange={(e) => setTestAccountIndex(Number(e.target.value))}
              disabled={loading}
            >
              {[0, 1, 2].map((i) => (
                <option key={i} value={i}>Account {i + 1}</option>
              ))}
            </select>
          </label>
          <button onClick={connectLocal} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect Test Account'}
          </button>
        </div>
      )}

      {network === 'remote' && !verificationEmojis && !connected && (
        <div className="extension-list">
          {providers.length === 0 && (
            discoveryDone
              ? <p>No wallet extensions found. Install an Aztec wallet extension.</p>
              : <p>Looking for wallet extensions...</p>
          )}
          {providers.map((provider, i) => (
            <button
              key={i}
              onClick={() => connectExtension(provider)}
              disabled={loading}
              className="provider-button"
            >
              {provider.icon && (
                <img src={provider.icon} alt="" className="provider-icon" />
              )}
              <span>
                Connect to {provider.name}
                {provider.metadata?.version != null && (
                  <small style={{ opacity: 0.7, marginLeft: '4px' }}>
                    v{String(provider.metadata.version)}
                  </small>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {verificationEmojis && (
        <div className="emoji-verification">
          <h3>Verify Connection</h3>
          <p>Check that these emojis match what your wallet extension shows, then approve there:</p>
          <div className="emoji-grid">{verificationEmojis}</div>
        </div>
      )}

    </div>
  );
}
// docs:end:wallet-connect-component
