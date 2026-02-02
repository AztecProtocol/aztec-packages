// docs:start:wallet-connection
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { WalletManager, type WalletProvider } from '@aztec/wallet-sdk/manager';
import { hashToEmoji } from '@aztec/wallet-sdk/crypto';

// docs:start:wallet-sdk-types
export interface WalletDiscoveryState {
  providers: WalletProvider[];
  selectedProvider: WalletProvider | null;
  verificationEmojis: string | null;
  wallet: Wallet | null;
  status: 'idle' | 'discovering' | 'verifying' | 'connected' | 'error';
  error: string | null;
}

export const initialWalletState: WalletDiscoveryState = {
  providers: [],
  selectedProvider: null,
  verificationEmojis: null,
  wallet: null,
  status: 'idle',
  error: null,
};
// docs:end:wallet-sdk-types

// docs:start:discover-wallets
/**
 * Starts discovering available wallet extensions.
 * Wallet extensions broadcast their availability via window.postMessage.
 * Returns a cancel function and calls onUpdate with each discovered wallet.
 */
export function discoverWallets(
  chainId: number,
  appId: string,
  onUpdate: (providers: WalletProvider[]) => void
): { cancel: () => void } {
  const manager = WalletManager.configure({
    extensions: { enabled: true },
  });

  const providers: WalletProvider[] = [];

  const discovery = manager.getAvailableWallets({
    chainInfo: {
      chainId: new Fr(chainId),
      version: new Fr(1),
    },
    appId,
    onWalletDiscovered: (provider) => {
      providers.push(provider);
      onUpdate([...providers]);
    },
  });

  return {
    cancel: () => discovery.cancel(),
  };
}
// docs:end:discover-wallets

// docs:start:connect-wallet
/**
 * Connects to a discovered wallet provider.
 * This establishes a secure encrypted channel using ECDH key exchange.
 * The returned emojis should be shown to the user for verification.
 */
export async function connectToProvider(
  provider: WalletProvider,
  appId: string
): Promise<{
  emojis: string;
  confirm: () => Promise<Wallet>;
  cancel: () => void;
}> {
  const pending = await provider.establishSecureChannel(appId);
  const emojis = hashToEmoji(pending.verificationHash);

  return {
    emojis,
    confirm: () => pending.confirm(),
    cancel: () => pending.cancel(),
  };
}
// docs:end:connect-wallet
// docs:end:wallet-connection
