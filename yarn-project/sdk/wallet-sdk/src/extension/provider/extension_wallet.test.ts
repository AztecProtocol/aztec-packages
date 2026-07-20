import type { ChainInfo } from '@aztec/aztec.js/account';
import { Fr } from '@aztec/foundation/curves/bn254';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';

import {
  type EncryptedPayload,
  decrypt,
  deriveSessionKeys,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
} from '../../crypto.js';
import { type WalletMessage, WalletMessageType, type WalletResponse } from '../../types.js';
import { ExtensionWallet } from './extension_wallet.js';

async function makeSharedKeys(): Promise<{ appKey: CryptoKey; walletKey: CryptoKey }> {
  const appPair = await generateKeyPair();
  const walletPair = await generateKeyPair();

  const appPub = await exportPublicKey(appPair.publicKey);
  const walletPub = await exportPublicKey(walletPair.publicKey);

  const appSession = await deriveSessionKeys(appPair, await importPublicKey(walletPub), true);
  const walletSession = await deriveSessionKeys(walletPair, await importPublicKey(appPub), false);

  return { appKey: appSession.encryptionKey, walletKey: walletSession.encryptionKey };
}

const chainInfo: ChainInfo = { chainId: new Fr(1), version: new Fr(1) };

// Tight heartbeat tuning so tests run quickly. Real defaults (5s/300s) would take
// a minute per test.
const FAST_HEARTBEAT = { intervalMs: 50, deadAfterMs: 250 };

describe('ExtensionWallet heartbeat', () => {
  it('treats PONG as proof of liveness — no false disconnect on slow but alive peer', async () => {
    const { appKey, walletKey } = await makeSharedKeys();
    const channel = new MessageChannel();
    const walletId = 'test-wallet';

    const requestArrived = promiseWithResolvers<WalletMessage>();
    let pongs = 0;

    channel.port2.onmessage = async (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === WalletMessageType.PING) {
        pongs++;
        channel.port2.postMessage({ type: WalletMessageType.PONG });
        return;
      }
      const decoded = await decrypt<WalletMessage>(walletKey, data as EncryptedPayload);
      requestArrived.resolve(decoded);
    };
    channel.port2.start();

    const extWallet = ExtensionWallet.create(
      walletId,
      channel.port1,
      appKey,
      chainInfo,
      'test-app',
      undefined,
      FAST_HEARTBEAT,
    );
    const wallet = extWallet.asWallet();

    const pending = wallet.getChainInfo();
    pending.catch(() => {});
    const message = await requestArrived.promise;

    // Let several heartbeat ticks fire while the peer responds with PONGs only —
    // no real response yet. This is the slow-but-alive-wallet scenario. Wait
    // ~3× the dead-after window to prove that PONGs alone keep the channel alive.
    await sleep(FAST_HEARTBEAT.deadAfterMs * 3);

    expect(pongs).toBeGreaterThan(0);
    expect(extWallet.isDisconnected()).toBe(false);

    // Now have the wallet respond. The dApp must settle the promise — the channel
    // is alive. We send an error to avoid having to construct a schema-valid
    // result object; what matters here is that the in-flight promise *settles*
    // rather than hanging forever after the heartbeat-eligible window passes.
    const response: WalletResponse = {
      messageId: message.messageId,
      error: 'simulated wallet response',
      walletId,
    };
    const encrypted = await encrypt(walletKey, jsonStringify(response));
    // Wallet side posts on port2 so the dApp receives on port1.
    channel.port2.postMessage(encrypted);

    await expect(pending).rejects.toThrow(/simulated/);

    channel.port1.close();
    channel.port2.close();
  });

  it('declares disconnect when the channel is fully silent past the dead window', async () => {
    const { appKey } = await makeSharedKeys();
    const channel = new MessageChannel();
    // Deliberately do NOT wire up port2 — peer is fully unresponsive.
    channel.port2.start();

    const extWallet = ExtensionWallet.create(
      'dead-wallet',
      channel.port1,
      appKey,
      chainInfo,
      'test-app',
      undefined,
      FAST_HEARTBEAT,
    );
    const wallet = extWallet.asWallet();

    let disconnected = false;
    extWallet.onDisconnect(() => {
      disconnected = true;
    });

    const pending = wallet.getChainInfo();

    await expect(pending).rejects.toThrow(/disconnected/i);
    expect(disconnected).toBe(true);
    expect(extWallet.isDisconnected()).toBe(true);

    channel.port2.close();
  });

  it('does not start a heartbeat when there are no in-flight requests', async () => {
    const { appKey } = await makeSharedKeys();
    const channel = new MessageChannel();

    let pings = 0;
    channel.port2.onmessage = (event: MessageEvent) => {
      if (event.data?.type === WalletMessageType.PING) {
        pings++;
      }
    };
    channel.port2.start();

    ExtensionWallet.create('idle-wallet', channel.port1, appKey, chainInfo, 'test-app', undefined, FAST_HEARTBEAT);

    await sleep(150);

    expect(pings).toBe(0);

    channel.port1.close();
    channel.port2.close();
  });
});
