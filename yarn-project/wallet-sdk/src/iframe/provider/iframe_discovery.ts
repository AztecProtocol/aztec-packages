/**
 * Web wallet discovery — creates {@link IframeWalletProvider} instances from a list of URLs.
 *
 * For each configured URL we probe the wallet by loading a tiny invisible iframe,
 * waiting for WALLET_READY, then sending a DISCOVERY request. On a successful
 * DISCOVERY_RESPONSE we emit an IframeWalletProvider to the caller.
 *
 * This is intentionally lightweight (no key exchange yet) — key exchange happens
 * later when the user selects the wallet and calls `provider.establishSecureChannel()`.
 */
import type { ChainInfo } from '@aztec/aztec.js/account';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import type { DiscoverySession, WalletProvider } from '../../manager/types.js';
import { type WalletInfo, WalletMessageType } from '../../types.js';
import { IframeWalletProvider } from './iframe_provider.js';

const PROBE_TIMEOUT_MS = 10_000;

/**
 * Probes a list of web wallet URLs and returns a {@link DiscoverySession} compatible
 * with WalletManager's `getAvailableWallets()` interface.
 *
 * Discovered {@link IframeWalletProvider} instances are yielded asynchronously as each
 * wallet responds to the probe.
 *
 * @param walletUrls - URLs of web wallets to probe
 * @param chainInfo - Network information to pass during discovery
 * @returns A cancellable discovery session
 */
export function discoverWebWallets(walletUrls: string[], chainInfo: ChainInfo): DiscoverySession {
  const { promise: donePromise, resolve: resolveDone } = promiseWithResolvers<void>();

  /* eslint-disable jsdoc/require-jsdoc */
  type IteratorState =
    | { status: 'discovering'; resolve: ((result: IteratorResult<WalletProvider>) => void) | null }
    | { status: 'done' };
  /* eslint-enable jsdoc/require-jsdoc */

  let state: IteratorState = { status: 'discovering', resolve: null };
  const pendingProviders: WalletProvider[] = [];

  // eslint-disable-next-line jsdoc/require-jsdoc
  function emit(provider: WalletProvider) {
    if (state.status !== 'discovering') {
      return;
    }
    if (state.resolve) {
      const resolve = state.resolve;
      state.resolve = null;
      resolve({ value: provider, done: false });
    } else {
      pendingProviders.push(provider);
    }
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  function markComplete() {
    if (state.status !== 'discovering') {
      return;
    }
    const pendingResolve = state.resolve;
    state = { status: 'done' };
    resolveDone();
    if (pendingResolve) {
      pendingResolve({ value: undefined as unknown as WalletProvider, done: true });
    }
  }

  // Probe all URLs in parallel
  const probes = walletUrls.map(url =>
    probeWallet(url, chainInfo, PROBE_TIMEOUT_MS).then(
      provider => {
        if (provider) {
          emit(provider);
        }
      },
      () => {
        // ignore probe errors
      },
    ),
  );

  void Promise.all(probes).then(markComplete);

  const wallets: AsyncIterable<WalletProvider> = {
    // eslint-disable-next-line jsdoc/require-jsdoc
    [Symbol.asyncIterator](): AsyncIterator<WalletProvider> {
      return {
        // eslint-disable-next-line jsdoc/require-jsdoc
        next(): Promise<IteratorResult<WalletProvider>> {
          if (pendingProviders.length > 0) {
            return Promise.resolve({ value: pendingProviders.shift()!, done: false });
          }
          if (state.status === 'done') {
            return Promise.resolve({ value: undefined as unknown as WalletProvider, done: true });
          }
          return new Promise(resolve => {
            if (state.status === 'discovering') {
              state.resolve = resolve;
            }
          });
        },
        // eslint-disable-next-line jsdoc/require-jsdoc
        return(): Promise<IteratorResult<WalletProvider>> {
          markComplete();
          return Promise.resolve({ value: undefined as unknown as WalletProvider, done: true });
        },
      };
    },
  };

  return {
    wallets,
    done: donePromise,
    cancel: markComplete,
  };
}

/**
 * Probes a single web wallet URL.
 * Creates a temporary hidden iframe, waits for WALLET_READY, sends DISCOVERY_REQUEST.
 * Returns an IframeWalletProvider on success, null on timeout/failure.
 * @internal
 */
function probeWallet(walletUrl: string, chainInfo: ChainInfo, timeoutMs: number): Promise<IframeWalletProvider | null> {
  const walletOrigin = new URL(walletUrl).origin;
  const iframe = document.createElement('iframe');
  iframe.src = walletUrl;
  iframe.style.cssText = 'display:none;width:0;height:0;border:none;position:absolute;top:-9999px;';
  iframe.allow = 'storage-access; cross-origin-isolated';
  let timer: ReturnType<typeof setTimeout>;

  // Register listener BEFORE appending to DOM to avoid race with WALLET_READY
  const result = new Promise<IframeWalletProvider | null>(resolve => {
    const cleanup = () => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      window.removeEventListener('message', handler);
      clearTimeout(timer);
    };

    timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    let step: 'waiting-ready' | 'waiting-discovery' = 'waiting-ready';
    const requestId = globalThis.crypto.randomUUID();

    // eslint-disable-next-line jsdoc/require-jsdoc
    function handler(event: MessageEvent) {
      if (event.origin !== walletOrigin) {
        return;
      }
      const msg = event.data;
      if (!msg || typeof msg !== 'object') {
        return;
      }

      if (step === 'waiting-ready' && msg.type === WalletMessageType.WALLET_READY) {
        step = 'waiting-discovery';
        iframe.contentWindow?.postMessage(
          { type: WalletMessageType.DISCOVERY, requestId, appId: 'discovery-probe' },
          walletOrigin,
        );
      } else if (
        step === 'waiting-discovery' &&
        msg.type === WalletMessageType.DISCOVERY_RESPONSE &&
        msg.requestId === requestId
      ) {
        const info = msg.walletInfo as WalletInfo;
        cleanup();
        resolve(new IframeWalletProvider(info.id, info.name, info.icon, walletUrl, chainInfo));
      }
    }

    window.addEventListener('message', handler);
  });

  document.body.appendChild(iframe);

  return result;
}
