// docs:start:wallet-connect
import React, { useState, useEffect } from 'react';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { WalletProvider } from '@aztec/wallet-sdk/manager';
import type { NetworkType } from '../config';
import { EmbeddedWallet } from '../embedded-wallet';
import { discoverWallets, connectToProvider } from '../wallet-connection';
import { getNodeUrl } from '../config';

interface WalletConnectProps {
  network: NetworkType;
  onWalletConnected: (wallet: Wallet | EmbeddedWallet) => void;
}

// docs:start:wallet-connect-component
export function WalletConnect({ network, onWalletConnected }: WalletConnectProps) {
  const [status, setStatus] = useState<string>('');
  const [providers, setProviders] = useState<WalletProvider[]>([]);
  const [verificationEmojis, setVerificationEmojis] = useState<string | null>(null);
  const [confirmFn, setConfirmFn] = useState<(() => Promise<Wallet>) | null>(null);
  const [testAccountIndex, setTestAccountIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  // docs:start:local-connect
  /** Connect using the embedded wallet with a pre-deployed test account */
  async function connectLocal() {
    setLoading(true);
    setStatus('Initializing PXE (this may take a moment)...');
    try {
      const nodeUrl = getNodeUrl('local');
      const wallet = await EmbeddedWallet.initialize(nodeUrl);

      setStatus('Connecting test account...');
      await wallet.connectTestAccount(testAccountIndex);

      setStatus('Connected!');
      onWalletConnected(wallet);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }
  // docs:end:local-connect

  // docs:start:devnet-connect
  /** Discover and connect to a browser extension wallet */
  useEffect(() => {
    if (network !== 'devnet') return;

    setStatus('Discovering wallet extensions...');
    const { cancel } = discoverWallets(31337, 'pod-racing', (found) => {
      setProviders(found);
      setStatus(`Found ${found.length} wallet(s)`);
    });

    return () => cancel();
  }, [network]);

  async function connectExtension(provider: WalletProvider) {
    setLoading(true);
    setStatus('Establishing secure channel...');
    try {
      const { emojis, confirm, cancel } = await connectToProvider(
        provider,
        'pod-racing'
      );

      // Show emojis for user verification
      setVerificationEmojis(emojis);
      setConfirmFn(() => confirm);
      setStatus('Verify the emojis match your wallet, then confirm.');
      setLoading(false);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
      setLoading(false);
    }
  }

  async function handleConfirmVerification() {
    if (!confirmFn) return;
    setStatus('Confirming connection...');
    try {
      const wallet = await confirmFn();
      setVerificationEmojis(null);
      setConfirmFn(null);
      setStatus('Connected!');
      onWalletConnected(wallet);
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }
  // docs:end:devnet-connect

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

      {network === 'devnet' && !verificationEmojis && (
        <div className="extension-list">
          {providers.length === 0 && <p>Looking for wallet extensions...</p>}
          {providers.map((provider, i) => (
            <button
              key={i}
              onClick={() => connectExtension(provider)}
              disabled={loading}
            >
              Connect to {provider.name}
            </button>
          ))}
        </div>
      )}

      {verificationEmojis && (
        <div className="emoji-verification">
          <h3>Verify Connection</h3>
          <p>Confirm these emojis match what your wallet shows:</p>
          <div className="emoji-grid">{verificationEmojis}</div>
          <button onClick={handleConfirmVerification} disabled={loading}>
            Emojis Match — Confirm
          </button>
        </div>
      )}
    </div>
  );
}
// docs:end:wallet-connect-component
// docs:end:wallet-connect
