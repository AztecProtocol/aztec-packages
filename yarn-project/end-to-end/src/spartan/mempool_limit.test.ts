// import { getSchnorrAccount } from '@aztec/accounts/schnorr';
// import { AztecAddress, Fr, SponsoredFeePaymentMethod, Tx, TxStatus, type Wallet } from '@aztec/aztec.js';
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
import {
  AztecAddress,
  Fr,
  SponsoredFeePaymentMethod,
  Tx,
  TxStatus,
  createAztecNodeClient,
  retryUntil,
} from '@aztec/aztec.js';
import { asyncPool } from '@aztec/foundation/async-pool';
import { times } from '@aztec/foundation/collection';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
} from './setup_test_wallets.js';
import { getSequencersConfig, setupEnvironment, startPortForwardForRPC, updateSequencersConfig } from './utils.js';

const config = setupEnvironment(process.env);

const debugLogger = createLogger('e2e:spartan-test:mempool_limiter');

const TX_FLOOD_SIZE = 30;
const TX_MEMPOOL_LIMIT = 25;
const CONCURRENCY = 25;

describe('mempool limiter test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes
  let node: ReturnType<typeof createAztecNodeClient>;
  let sampleTx: Tx;
  let testAccounts: TestAccounts;
  let cleanup: undefined | (() => Promise<void>);
  let rpcUrl: string;
  let originalMinTxsPerBlock: number | undefined;

  const forwardProcesses: ChildProcess[] = [];

  beforeAll(async () => {
    const { process, port } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(process);
    rpcUrl = `http://127.0.0.1:${port}`;
    node = createAztecNodeClient(rpcUrl);
    const initialBlock = await node.getBlockNumber().catch(() => 0n);
    debugLogger.info(`Connected to RPC at ${rpcUrl}; initial L2 block: ${initialBlock}`);
    await retryUntil(async () => await node.isReady(), 'node ready', 60, 1);
  });

  beforeAll(async () => {
    debugLogger.debug(`Preparing account and token contract`);
    // set a large pool size so that deploy txs fit and allow blocks with few txs
    const configs = await getSequencersConfig(config);
    originalMinTxsPerBlock = configs[0]?.minTxsPerBlock;
    await updateSequencersConfig(config, { maxTxPoolSize: 1e9, minTxsPerBlock: 0 });
    await retryUntil(
      async () => {
        const applied = await getSequencersConfig(config);
        return applied.every(c => c.minTxsPerBlock === 0 && c.maxTxPoolSize === 1e9);
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
    cleanup = _cleanup;
    // Ensure blocks are advancing before we start waiting on tx inclusion
    const startBlock = await node.getBlockNumber();
    try {
      await retryUntil(async () => (await node.getBlockNumber()) > startBlock, 'block advance', 120, 1);
    } catch {
      debugLogger.warn(`No block advance observed yet; continuing`);
    }
    testAccounts = await deploySponsoredTestAccounts(wallet, aztecNode, 1n, debugLogger);

    debugLogger.debug(`Calculating mempool limits`);

    const sender = testAccounts.accounts[0];
    const baseTx = await testAccounts.tokenContract.methods
      .transfer_in_public(sender, await AztecAddress.random(), 1n, 0)
      .prove({
        from: sender,
        fee: { paymentMethod: new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()) },
      });
    sampleTx = Tx.clone(baseTx);
    const sampleTxSize = sampleTx.getSize();
    const maxTxPoolSize = TX_MEMPOOL_LIMIT * sampleTxSize;

    await updateSequencersConfig(config, { maxTxPoolSize });

    debugLogger.info(`Sample tx size: ${sampleTxSize} bytes`);
    debugLogger.info(`Mempool limited to: ${maxTxPoolSize} bytes`);
  });

  afterAll(async () => {
    if (originalMinTxsPerBlock !== undefined) {
      await updateSequencersConfig(config, { maxTxPoolSize: 1e9, minTxsPerBlock: originalMinTxsPerBlock });
    } else {
      await updateSequencersConfig(config, { maxTxPoolSize: 1e9 });
    }
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  it('evicts txs to keep mempool under specified limit', async () => {
    const txs = times(TX_FLOOD_SIZE, () => {
      const tx = Tx.fromBuffer(sampleTx.toBuffer());
      // this only works on unproven networks, otherwise this will fail verification
      tx.data.forPublic!.nonRevertibleAccumulatedData.nullifiers[0] = Fr.random();
      tx.getTxHash();
      return tx;
    });

    await asyncPool(CONCURRENCY, txs, tx => node.sendTx(tx));
    const receipts = await asyncPool(CONCURRENCY, txs, async tx => await node.getTxReceipt(tx.getTxHash()));
    const pending = receipts.reduce((count, receipt) => (receipt.status === TxStatus.PENDING ? count + 1 : count), 0);
    expect(pending).toBeLessThanOrEqual(TX_MEMPOOL_LIMIT);
  }, 600_000);
});
