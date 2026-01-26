// import { getSchnorrAccount } from '@aztec/accounts/schnorr';
// import { AztecAddress } from '@aztec/aztec.js/addresses';
// import type { InteractionFeeOptions } from '@aztec/entrypoints/interfaces';
// import { asyncPool } from '@aztec/foundation/async-pool';
// import { times } from '@aztec/foundation/collection';
// import { Agent, makeUndiciFetch } from '@aztec/foundation/json-rpc/undici';
// import { createLogger } from '@aztec/foundation/log';
// import { TokenContract } from '@aztec/noir-contracts.js/Token';
// import { createPXE } from '@aztec/pxe/server';
// import {
//   type AztecNode,
//   type AztecNodeAdmin,
//   createAztecNodeAdminClient,
//   createAztecNodeClient,
// } from '@aztec/stdlib/interfaces/client';
// import { deriveSigningKey } from '@aztec/stdlib/keys';
// import { makeTracedFetch } from '@aztec/telemetry-client';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { Tx, TxStatus } from '@aztec/aztec.js/tx';
import { asyncPool } from '@aztec/foundation/async-pool';
import { times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
  deploySponsoredTestAccountsWithTokens,
} from './setup_test_wallets.js';
import {
  ChainHealth,
  type ServiceEndpoint,
  getRPCEndpoint,
  getSequencersConfig,
  setupEnvironment,
  updateSequencersConfig,
} from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:mempool_limiter');

const TX_FLOOD_SIZE = 30;
const TX_MEMPOOL_LIMIT = 25;
const CONCURRENCY = 5;

describe('mempool limiter test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes
  let node: ReturnType<typeof createAztecNodeClient>;
  let sampleTx: Tx;
  let testAccounts: TestAccounts;
  const cleanups: Array<() => Promise<void>> = [];
  let rpcUrl: string;
  let originalMinTxsPerBlock: number | undefined;
  let originalMaxPendingTxCount: number | undefined;
  let baselineMaxPendingTxCount = 1_000;
  let walletPool: {
    wallet: Awaited<ReturnType<typeof createWalletAndAztecNodeClient>>['wallet'];
    from: AztecAddress;
  }[] = [];

  const endpoints: ServiceEndpoint[] = [];
  const health = new ChainHealth(config.NAMESPACE, debugLogger);

  beforeAll(async () => {
    await health.setup();
    const rpcEndpoint = await getRPCEndpoint(config.NAMESPACE);
    rpcUrl = rpcEndpoint.url;
    endpoints.push(rpcEndpoint);
    node = createAztecNodeClient(rpcUrl);
    const initialBlock = await node.getBlockNumber().catch(() => 0n);
    debugLogger.info(`Connected to RPC at ${rpcUrl}; initial L2 block: ${initialBlock}`);
    await retryUntil(async () => await node.isReady(), 'node ready', 60, 1);
  });

  beforeAll(async () => {
    debugLogger.debug(`Preparing account and token contract`);
    // Preserve existing pool settings while we allow blocks with few txs during setup.
    const configs = await getSequencersConfig(config);
    originalMinTxsPerBlock = configs[0]?.minTxsPerBlock;
    originalMaxPendingTxCount = configs[0]?.maxPendingTxCount;
    baselineMaxPendingTxCount = originalMaxPendingTxCount ?? 1_000;

    await updateSequencersConfig(config, { maxPendingTxCount: baselineMaxPendingTxCount, minTxsPerBlock: 0 });
    await retryUntil(
      async () => {
        const applied = await getSequencersConfig(config);
        return applied.every(c => c.minTxsPerBlock === 0 && c.maxPendingTxCount === baselineMaxPendingTxCount);
      },
      'admin config propagate',
      60,
      1,
    );

    const {
      wallet,
      aztecNode,
      cleanup: _cleanup,
    } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, debugLogger);
    cleanups.push(_cleanup);
    // Ensure blocks are advancing before we start waiting on tx inclusion
    const startBlock = await node.getBlockNumber();
    try {
      await retryUntil(async () => (await node.getBlockNumber()) > startBlock, 'block advance', 120, 1);
    } catch {
      debugLogger.warn(`No block advance observed yet; continuing`);
    }
    testAccounts = await deploySponsoredTestAccountsWithTokens(
      wallet,
      aztecNode,
      BigInt(TX_FLOOD_SIZE + 5),
      debugLogger,
    );
    walletPool = [{ wallet: testAccounts.wallet, from: testAccounts.accounts[0] }];

    // spread proving across multiple PXEs
    if (config.REAL_VERIFIER) {
      const NUM_WALLETS = Math.min(4, CONCURRENCY, TX_FLOOD_SIZE);
      const mintAmountPerWallet = BigInt(TX_FLOOD_SIZE + 5);
      const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());

      for (let i = 1; i < NUM_WALLETS; i++) {
        const { wallet: extraWallet, cleanup: extraCleanup } = await createWalletAndAztecNodeClient(
          rpcUrl,
          config.REAL_VERIFIER,
          debugLogger,
        );
        cleanups.push(extraCleanup);

        const extraAccounts = await deploySponsoredTestAccounts(extraWallet, aztecNode, debugLogger, 1);
        const from = extraAccounts.accounts[0];

        await testAccounts.tokenContract.methods
          .mint_to_public(from, mintAmountPerWallet)
          .send({ from: testAccounts.tokenAdminAddress, fee: { paymentMethod: sponsor }, wait: { timeout: 600 } });

        walletPool.push({ wallet: extraWallet, from });
      }
    }

    debugLogger.debug(`Calculating mempool limits`);

    const sender = testAccounts.accounts[0];

    const baseTx = await proveInteraction(
      wallet,
      testAccounts.tokenContract.methods.transfer_in_public(sender, await AztecAddress.random(), 1n, 0),
      {
        from: sender,
        fee: {
          paymentMethod: new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()),
        },
      },
    );
    sampleTx = Tx.clone(baseTx);
    const maxPendingTxCount = TX_MEMPOOL_LIMIT;

    // Only apply the mempool limit here for the unproven path.
    if (!config.REAL_VERIFIER) {
      await updateSequencersConfig(config, { maxPendingTxCount });
      await retryUntil(
        async () => {
          const applied = await getSequencersConfig(config);
          return applied.every(c => c.maxPendingTxCount === maxPendingTxCount);
        },
        'admin config propagate (mempool limit)',
        60,
        1,
      );
    }

    debugLogger.info(`Mempool limited to: ${maxPendingTxCount} txs`);
  });

  afterAll(async () => {
    await health.teardown();
    if (originalMinTxsPerBlock !== undefined) {
      await updateSequencersConfig(config, {
        maxPendingTxCount: baselineMaxPendingTxCount,
        minTxsPerBlock: originalMinTxsPerBlock,
      });
    } else {
      await updateSequencersConfig(config, { maxPendingTxCount: baselineMaxPendingTxCount });
    }
    for (const cleanup of cleanups) {
      await cleanup();
    }
    endpoints.forEach(e => e.process?.kill());
  });

  it('evicts txs to keep mempool under specified limit', async () => {
    if (!config.REAL_VERIFIER) {
      const txs = times(TX_FLOOD_SIZE, () => {
        const tx = Tx.fromBuffer(sampleTx.toBuffer());
        // this only works on unproven networks, otherwise this will fail verification
        tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] = Fr.random();
        tx.txHash;
        return tx;
      });

      await asyncPool(CONCURRENCY, txs, tx => node.sendTx(tx));
      const receipts = await asyncPool(CONCURRENCY, txs, async tx => await node.getTxReceipt(tx.txHash));
      const pending = receipts.reduce((count, receipt) => (receipt.status === TxStatus.PENDING ? count + 1 : count), 0);
      expect(pending).toBeLessThanOrEqual(TX_MEMPOOL_LIMIT);
      return;
    }

    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const walletCount = Math.max(1, walletPool.length);

    const walletQueues: Promise<void>[] = Array(walletCount).fill(Promise.resolve());
    const enqueue = <T>(walletIdx: number, fn: () => Promise<T>): Promise<T> => {
      const prev = walletQueues[walletIdx];
      const next = prev.then(fn);
      walletQueues[walletIdx] = next.then(
        () => void 0,
        () => void 0,
      );
      return next;
    };

    const provePromises = times(TX_FLOOD_SIZE, i => i).map(i => {
      const walletIdx = i % walletCount;
      const { wallet, from } = walletPool[walletIdx];
      return enqueue(walletIdx, async () => {
        const dest = await AztecAddress.random();
        const token = TokenContract.at(testAccounts.tokenAddress, wallet);
        return proveInteraction(wallet, token.methods.transfer_in_public(from, dest, 1n, 0), {
          from,
          fee: { paymentMethod: sponsor },
        });
      });
    });

    // Ensure all per-wallet queues flush
    const provenTxs = await Promise.all(provePromises);

    // Tighten the pool size for the flood test
    const maxPendingTxCount = TX_MEMPOOL_LIMIT;
    await updateSequencersConfig(config, { maxPendingTxCount });
    await retryUntil(
      async () => {
        const applied = await getSequencersConfig(config);
        return applied.every(c => c.maxPendingTxCount === maxPendingTxCount);
      },
      'admin config propagate (mempool limit)',
      60,
      1,
    );

    await asyncPool(CONCURRENCY, provenTxs, tx => node.sendTx(tx));
    const txHashes = provenTxs.map(tx => tx.txHash);

    // Eviction can be async relative to the RPC send, so poll until the pool is under the cap
    await retryUntil(
      async () => {
        const receipts = await asyncPool(
          CONCURRENCY,
          txHashes,
          async txHash => await node.getTxReceipt(txHash).catch(() => undefined),
        );
        const pending = receipts.reduce(
          (count, receipt) => (receipt?.status === TxStatus.PENDING ? count + 1 : count),
          0,
        );
        return pending <= TX_MEMPOOL_LIMIT;
      },
      'mempool eviction',
      90,
      1,
    );

    const receipts = await asyncPool(
      CONCURRENCY,
      txHashes,
      async txHash => await node.getTxReceipt(txHash).catch(() => undefined),
    );
    const pending = receipts.reduce((count, receipt) => (receipt?.status === TxStatus.PENDING ? count + 1 : count), 0);
    expect(pending).toBeLessThanOrEqual(TX_MEMPOOL_LIMIT);
  }, 2_400_000);
});
