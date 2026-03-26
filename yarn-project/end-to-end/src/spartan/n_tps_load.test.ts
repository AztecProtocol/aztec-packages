import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getGasLimits, toSendOptions, toSimulateOptions } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { type AztecNode, createAztecNodeClient } from '@aztec/aztec.js/node';
import { getFeeJuiceBalance } from '@aztec/aztec.js/utils';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { AvmGadgetsTestContract } from '@aztec/noir-test-contracts.js/AvmGadgetsTest';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { getSponsoredFPCInstance } from '../fixtures/utils.js';
import type { WorkerWallet } from '../test-wallet/worker_wallet.js';
import { type WorkerWalletWrapper, createWorkerWalletClient } from './setup_test_wallets.js';
import { getExternalIP, setupEnvironment } from './utils.js';

const config = { ...setupEnvironment(process.env) };

const TARGET_TPS = parseFloat(process.env.TPS ?? '1');
if (!Number.isFinite(TARGET_TPS)) {
  throw new Error('Invalid TPS: ' + process.env.TPS);
}

const NUM_WALLETS = parseInt(process.env.NUM_WALLETS ?? String(config.REAL_VERIFIER ? Math.ceil(TARGET_TPS * 11) : 1));

const epochDurationSlots = config.AZTEC_EPOCH_DURATION;
const slotDurationSeconds = config.AZTEC_SLOT_DURATION;
const epochDurationSeconds = epochDurationSlots * slotDurationSeconds;
const DURATION_SECONDS = parseInt(process.env.DURATION_SECONDS ?? String(epochDurationSeconds));
const FPC_SALT = process.env.FPC_SALT;

/** A wallet that produces transactions in the background. */
type WalletTxProducer = {
  wallet: WorkerWallet;
  accountAddress: AztecAddress;
  prototypeTx: Tx | undefined; // Each wallet's own prototype (for fake proving)
  readyTx: Tx | null;
};

describe(`load ${TARGET_TPS}TPS test`, () => {
  jest.setTimeout((DURATION_SECONDS + epochDurationSeconds) * 1000);

  const logger = createLogger(`e2e:spartan-test:load-${TARGET_TPS}tps`);

  let testWallets: WorkerWalletWrapper[];
  let wallets: WorkerWallet[];
  let accountAddresses: AztecAddress[];
  let producers: WalletTxProducer[];

  let producerAbortController: AbortController;
  let producerPromises: Promise<void>[];

  let aztecNode: AztecNode;
  let benchmarkContract: AvmGadgetsTestContract;

  afterAll(async () => {
    if (testWallets) {
      for (const tw of testWallets) {
        await tw.cleanup();
      }
    }
  });

  beforeAll(async () => {
    logger.info(`Starting test setup...`);

    const rpcUrl =
      process.env.AZTEC_NODE_URL ?? `http://${await getExternalIP(config.NAMESPACE, 'rpc-aztec-node')}:8080`;
    logger.info(`Using RPC URL: ${rpcUrl}`);
    aztecNode = createAztecNodeClient(rpcUrl);

    // Start wallet creation in the background (only needs rpcUrl)
    logger.info(`Creating ${NUM_WALLETS} wallet(s) in parallel with block wait...`);
    const walletCreationPromise = timesParallel(NUM_WALLETS, i => {
      logger.info(`Creating wallet ${i + 1}/${NUM_WALLETS}`);
      return createWorkerWalletClient(rpcUrl, config.REAL_VERIFIER, logger);
    });

    // Wait for at least one block to be mined
    logger.info('Waiting for first block...');
    await retryUntil(
      async () => {
        const blockNumber = await aztecNode.getBlockNumber();
        if (blockNumber > INITIAL_L2_BLOCK_NUM) {
          return true;
        }
        logger.info(`Waiting for the first block to mine (current block: ${blockNumber})...`);
        return false;
      },
      'get block number',
      2 * 60 * 60,
      12,
    );

    logger.info(`First block produced. Deploying account contracts`);

    testWallets = await walletCreationPromise;
    wallets = testWallets.map(tw => tw.wallet);

    // Build the FPC instance from artifact + salt, then derive the address
    const fpcInstance = FPC_SALT
      ? await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
          salt: new Fr(BigInt(FPC_SALT)),
        })
      : await getSponsoredFPCInstance();
    const fpcAddress = fpcInstance.address;
    const sponsor = new SponsoredFeePaymentMethod(fpcAddress);

    const fpcBalance = await getFeeJuiceBalance(fpcAddress, aztecNode);
    logger.info(`SponsoredFPC address: ${fpcAddress}, balance: ${fpcBalance}`);
    if (fpcBalance === 0n) {
      throw new Error(`SponsoredFPC at ${fpcAddress} is not funded. Fund it and re-run.`);
    }

    logger.info(`Deploying ${wallets.length} account contracts...`);
    accountAddresses = await Promise.all(
      wallets.map(async (wallet, i) => {
        const secret = Fr.random();
        const salt = Fr.random();
        const address = await wallet.registerAccount(secret, salt);
        await wallet.registerContract(fpcInstance, SponsoredFPCContract.artifact);
        logger.info(`Deploying account ${i + 1}/${wallets.length} at ${address}...`);
        const manager = await AccountManager.create(
          wallet,
          secret,
          new SchnorrAccountContract(deriveSigningKey(secret)),
          salt,
        );
        const deployMethod = await manager.getDeployMethod();
        await deployMethod.send({
          from: AztecAddress.ZERO,
          fee: { paymentMethod: sponsor },
          wait: { timeout: 2400 },
        });
        logger.info(`Account ${i + 1}/${wallets.length} deployed at ${address}`);
        return address;
      }),
    );

    logger.info('Deploying benchmark contract...');
    ({ contract: benchmarkContract } = await AvmGadgetsTestContract.deploy(wallets[0]).send({
      from: accountAddresses[0],
      fee: { paymentMethod: sponsor },
    }));

    logger.info('Test setup complete');
  });

  beforeEach(async () => {
    logger.info(`Creating ${wallets.length} tx producers`);
    producers = await Promise.all(
      wallets.map(async (wallet, i) => {
        const accountAddress = accountAddresses[i];
        const proto = config.REAL_VERIFIER
          ? undefined
          : await createTx(wallet, accountAddress, benchmarkContract, logger);
        return { wallet, accountAddress, prototypeTx: proto, readyTx: null };
      }),
    );

    // we have a bunch of wallets, each continously producing txs
    // we start them immediately because they will produce txs and cache them until we are ready to send
    producerAbortController = new AbortController();
    producerPromises = producers.map(producer =>
      startProducing(producer, benchmarkContract, aztecNode, producerAbortController.signal, logger),
    );

    logger.info(`Created and started ${wallets.length} tx producers`);
  });

  afterEach(async () => {
    if (!producerAbortController.signal.aborted) {
      producerAbortController.abort();
    }

    await Promise.allSettled(producerPromises);
  });

  it(`sends ${TARGET_TPS} TPS for ${DURATION_SECONDS}s`, async () => {
    logger.info(`Starting load test`);

    const msPerTx = 1000 / TARGET_TPS;
    const sendDurationMs = DURATION_SECONDS * 1000;
    logger.info(`Will send transactions at ${TARGET_TPS} TPS for ${DURATION_SECONDS}s`);

    const sentTxs: TxHash[] = [];
    const sendStartTime = performance.now();
    const sendDeadline = sendStartTime + sendDurationMs;
    let i = 0;
    let totalEstimatedCost = 0n;
    let minTxCost = BigInt(Number.MAX_SAFE_INTEGER);
    let maxTxCost = 0n;
    let sendFailures = 0;

    while (performance.now() < sendDeadline) {
      const loopStart = performance.now();

      // look for a wallet with an available tx
      let producer: WalletTxProducer | undefined;
      do {
        if (performance.now() >= sendDeadline) {
          break;
        }
        producer = producers.find(p => p.readyTx !== null);
        if (!producer?.readyTx) {
          await sleep(50);
        }
      } while (!producer?.readyTx);

      if (!producer?.readyTx) {
        break;
      }

      // consume tx
      const tx = producer.readyTx;
      producer.readyTx = null;
      try {
        // Estimate cost based on current base fee and tx gas limits
        const currentFees = await aztecNode.getCurrentMinFees();
        const feePerL2Gas = BigInt(currentFees.feePerL2Gas.toString());
        const feePerDaGas = BigInt(currentFees.feePerDaGas.toString());
        const gasSettings = tx.data.constants.txContext.gasSettings;
        const l2Gas =
          BigInt(gasSettings.gasLimits.l2Gas.toString()) + BigInt(gasSettings.teardownGasLimits.l2Gas.toString());
        const daGas =
          BigInt(gasSettings.gasLimits.daGas.toString()) + BigInt(gasSettings.teardownGasLimits.daGas.toString());
        const totalMana = l2Gas + daGas;
        const estimatedCost = feePerL2Gas * l2Gas + feePerDaGas * daGas;
        totalEstimatedCost += estimatedCost;
        if (estimatedCost < minTxCost) {
          minTxCost = estimatedCost;
        }
        if (estimatedCost > maxTxCost) {
          maxTxCost = estimatedCost;
        }

        await aztecNode.sendTx(tx);
        sentTxs.push(tx.getTxHash());
        const costFJ = Number(estimatedCost / 10n ** 15n) / 1000;
        logger.info(`Sent tx ${i + 1} (${totalMana} mana, ~${costFJ.toFixed(2)} FJ)`);
      } catch (err) {
        logger.warn(`Failed to send tx ${i + 1}: ${err}`);
        sendFailures++;
      }
      i++;

      // sleep to maintain target TPS
      const elapsed = performance.now() - loopStart;
      if (elapsed < msPerTx) {
        await sleep(msPerTx - elapsed);
      }
    }

    // stop wallets
    producerAbortController.abort();

    const sendEndTime = performance.now();
    const totalSent = sentTxs.length;
    const minCostFJ = Number(minTxCost / 10n ** 15n) / 1000;
    const maxCostFJ = Number(maxTxCost / 10n ** 15n) / 1000;
    const totalCostFJ = Number(totalEstimatedCost / 10n ** 15n) / 1000;
    logger.info(
      `Finished sending ${totalSent} txs (${sendFailures} failures) in ${(sendEndTime - sendStartTime) / 1000}s`,
    );
    logger.info(
      `Estimated costs — min: ${minCostFJ.toFixed(2)} FJ, max: ${maxCostFJ.toFixed(2)} FJ, total: ${totalCostFJ.toFixed(2)} FJ`,
    );

    // Quick summary: check receipts for all sent txs
    logger.info(`Checking receipts for ${totalSent} sent transactions...`);
    let successCount = 0;
    let failureCount = 0;
    let pendingCount = 0;
    const batchSize = 10;
    for (let j = 0; j < sentTxs.length; j += batchSize) {
      const batch = sentTxs.slice(j, j + batchSize);
      try {
        const receipts = await Promise.all(batch.map(txHash => aztecNode.getTxReceipt(txHash)));
        for (const receipt of receipts) {
          if (receipt.isMined()) {
            successCount++;
          } else if (receipt.isDropped()) {
            failureCount++;
          } else {
            pendingCount++;
          }
        }
      } catch (err) {
        logger.warn(`Error fetching receipts for batch at offset ${j}: ${err}`);
        pendingCount += batch.length;
      }
    }

    logger.info(
      `Load test complete: ${totalSent} sent, ${successCount} mined, ${failureCount} dropped, ${pendingCount} pending/unknown`,
    );
  });
});

async function createTx(
  wallet: WorkerWallet,
  accountAddress: AztecAddress,
  benchmarkContract: AvmGadgetsTestContract,
  logger: Logger,
): Promise<Tx> {
  const fpcInstance = FPC_SALT
    ? await getContractInstanceFromInstantiationParams(SponsoredFPCContract.artifact, {
        salt: new Fr(BigInt(FPC_SALT)),
      })
    : await getSponsoredFPCInstance();
  const sponsor = new SponsoredFeePaymentMethod(fpcInstance.address);
  const options = {
    from: accountAddress,
    fee: { paymentMethod: sponsor, estimateGas: true, gasSettings: { maxPriorityFeesPerGas: GasFees.empty() } },
  };
  const interaction = benchmarkContract.methods.sha256_hash_512(Array(512).fill(42));
  const execPayload = await interaction.request(options);

  // Simulate to estimate gas, then prove with the estimated limits
  const simulatedTx = await wallet.simulateTx(execPayload, toSimulateOptions(options));
  const { gasLimits, teardownGasLimits } = getGasLimits(simulatedTx);

  const sendOptions = toSendOptions({
    ...options,
    fee: {
      ...options.fee,
      gasSettings: { ...options.fee.gasSettings, gasLimits, teardownGasLimits },
    },
  });
  const tx = await wallet.proveTx(execPayload, sendOptions);
  logger.debug(
    `Tx created: gas limits DA=${gasLimits.daGas} L2=${gasLimits.l2Gas} teardownDA=${teardownGasLimits.daGas} teardownL2=${teardownGasLimits.l2Gas}`,
  );
  return tx;
}

async function cloneTx(tx: Tx, aztecNode: AztecNode): Promise<Tx> {
  const clonedTx = Tx.clone(tx, false);

  // Fetch current minimum fees and apply 50% buffer for safety
  const currentFees = await aztecNode.getCurrentMinFees();
  const paddedFees = currentFees.mul(1.5);

  // Update gas settings with current fees
  (clonedTx.data.constants.txContext.gasSettings as any).maxFeesPerGas = paddedFees;

  // Randomize nullifiers to avoid conflicts
  if (clonedTx.data.forRollup) {
    for (let i = 0; i < clonedTx.data.forRollup.end.nullifiers.length; i++) {
      if (clonedTx.data.forRollup.end.nullifiers[i].isZero()) {
        continue;
      }
      clonedTx.data.forRollup.end.nullifiers[i] = Fr.random();
    }
  } else if (clonedTx.data.forPublic) {
    for (let i = 0; i < clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers.length; i++) {
      if (clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i].isZero()) {
        continue;
      }
      clonedTx.data.forPublic.nonRevertibleAccumulatedData.nullifiers[i] = Fr.random();
    }
  }

  await clonedTx.recomputeHash();
  return clonedTx;
}

async function startProducing(
  producer: WalletTxProducer,
  benchmarkContract: AvmGadgetsTestContract,
  aztecNode: AztecNode,
  signal: AbortSignal,
  logger: Logger,
): Promise<void> {
  while (!signal.aborted) {
    // Wait if buffer is full
    if (producer.readyTx !== null) {
      await sleep(50);
      continue;
    }

    try {
      const tx = config.REAL_VERIFIER
        ? await createTx(producer.wallet, producer.accountAddress, benchmarkContract, logger)
        : await cloneTx(producer.prototypeTx!, aztecNode);

      producer.readyTx = tx;
    } catch (err) {
      if (!signal.aborted) {
        logger.error(`Error producing tx: ${err}`);
      }
    }
  }
}
