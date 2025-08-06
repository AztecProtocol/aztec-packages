import type { AztecNodeService } from '@aztec/aztec-node';
import { createLogger, retryUntil } from '@aztec/aztec.js';
import { type ExtendedViemWalletClient, L1Deployer, RollupContract, SlasherArtifact } from '@aztec/ethereum';
import { GSEAbi } from '@aztec/l1-artifacts/GSEAbi';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { SlasherAbi } from '@aztec/l1-artifacts/SlasherAbi';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';

const debugLogger = createLogger('e2e:spartan-test:slash-veto-demo');

const NUM_NODES = 4;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BOOT_NODE_UDP_PORT = 4500;
const EPOCH_DURATION = 4;
const SLASHING_QUORUM = 3;
const SLASHING_ROUND_SIZE = 5;
const AZTEC_SLOT_DURATION = 12;
const ETHEREUM_SLOT_DURATION = 6;
const LIFETIME_IN_ROUNDS = 2;
const EXECUTION_DELAY_IN_ROUNDS = 1;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-veto-demo-'));

// const config = setupEnvironment(process.env) as K8sGCloudConfig;

describe('veto slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let slashingAmount: bigint;
  let additionalNode: AztecNodeService | undefined;
  let rollup: RollupContract;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_slash_veto_demo',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      startProverNode: true,
      initialConfig: {
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        listenAddress: '127.0.0.1',
        minTxsPerBlock: 0,
        aztecEpochDuration: EPOCH_DURATION,
        validatorReexecute: false,
        sentinelEnabled: true,
        slashingQuorum: SLASHING_QUORUM,
        slashingRoundSize: SLASHING_ROUND_SIZE,
        slashInactivityCreateTargetPercentage: 0.5,
        slashInactivitySignalTargetPercentage: 0.1,
        slashProposerRoundPollingIntervalSeconds: 1,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();

    ({ rollup } = await t.getContracts());
    // slash amount is just below the ejection threshold
    slashingAmount = (await rollup.getActivationThreshold()) - (await rollup.getEjectionThreshold()) - 1n;

    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES, // Note we do not create the last validator yet, so it shows as offline
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,

      DATA_DIR,
    );
    for (const node of nodes) {
      await node.setConfig({
        slashInactivityEnabled: true,
        slashInactivityCreatePenalty: slashingAmount,
        slashInactivityMaxPenalty: slashingAmount,
      });
    }
    await t.removeInitialNode();

    t.logger.info(`Setup complete`, { validators: t.validators });
  });

  afterEach(async () => {
    await t.stopNodes(nodes);
    if (additionalNode !== undefined) {
      await t.stopNodes([additionalNode]);
    }
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  async function deployNewSlasher(deployerClient: ExtendedViemWalletClient) {
    const deployer = new L1Deployer(deployerClient, 42, undefined, false, undefined, undefined);
    const args = [
      rollup.address,
      SLASHING_QUORUM,
      SLASHING_ROUND_SIZE,
      LIFETIME_IN_ROUNDS, // lifetime in rounds
      EXECUTION_DELAY_IN_ROUNDS, // execution delay in rounds
      deployerClient.account.address, // vetoer
    ] as const;
    debugLogger.info(`\n\ndeploying slasher with args: ${JSON.stringify(args)}\n\n`);
    const slashFactoryAddress = await deployer.deploy(SlasherArtifact, args);
    await deployer.waitForDeployments();
    return slashFactoryAddress;
  }

  it.each([true, false])(
    'sets the new slasher and shouldVeto=%s',
    async (shouldVeto: boolean) => {
      const l1Client = t.ctx.deployL1ContractsValues.l1Client;
      const newSlasherAddress = await deployNewSlasher(l1Client);
      debugLogger.info(`\n\nnewSlasherAddress: ${newSlasherAddress}\n\n`);
      const rollupRaw = getContract({
        address: rollup.address,
        abi: RollupAbi,
        client: l1Client,
      });
      const tx = await rollupRaw.write.setSlasher([newSlasherAddress.toString()]);
      const receipt = await l1Client.waitForTransactionReceipt({ hash: tx });
      expect(receipt.status).toEqual('success');
      const slasherAddress = await rollup.getSlasher();
      expect(slasherAddress.toLowerCase()).toEqual(newSlasherAddress.toString().toLowerCase());
      debugLogger.info(`\n\nnew slasher address: ${slasherAddress}\n\n`);
      const slasher = getContract({
        address: slasherAddress,
        abi: SlasherAbi,
        client: t.ctx.deployL1ContractsValues.l1Client,
      });
      const slasherVetoer = await slasher.read.VETOER();
      debugLogger.info(`\n\nnew slasher vetoer: ${slasherVetoer}\n\n`);
      expect(slasherVetoer).toEqual(l1Client.account.address);

      const slashingProposer = await rollup.getSlashingProposer();

      const awaitSubmittableRound = new Promise<{ payload: `0x${string}`; round: bigint }>(resolve => {
        slashingProposer.listenToSubmittablePayloads(args => {
          resolve(args);
        });
      });

      // Add diagnostic logging while waiting
      const startTime = Date.now();
      debugLogger.info('Waiting for submittable round...');

      const diagnosticInterval = setInterval(() => {
        void (async () => {
          try {
            const currentRound = await slashingProposer.getCurrentRound();
            const roundInfo = await slashingProposer.getRoundInfo(rollup.address, currentRound);
            debugLogger.info(`\n\ncurrentRound: ${currentRound}\n\n`);
            debugLogger.info(`\n\npayloadWithMostSignals: ${roundInfo.payloadWithMostSignals}\n\n`);

            const signals = await slashingProposer.getPayloadSignals(
              rollup.address,
              currentRound,
              roundInfo.payloadWithMostSignals,
            );
            debugLogger.info(`\n\nsignals: ${signals}\n\n`);
          } catch (error) {
            debugLogger.error(`Error getting diagnostic info: ${error}`);
          }
        })();
      }, AZTEC_SLOT_DURATION * 1000); // Log every slot

      const submittableRound = await awaitSubmittableRound;
      clearInterval(diagnosticInterval);

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      debugLogger.info(`✅ Received submittable round after ${totalTime}s`);
      debugLogger.info(`\n\nsubmittableRound: ${submittableRound.round}\n\n`);
      debugLogger.info(`\n\nsubmittablePayload: ${submittableRound.payload}\n\n`);

      await retryUntil(async () => {
        const currentRound = await slashingProposer.getCurrentRound();
        return currentRound > submittableRound.round;
      });

      const attesterPrivateKey = t.attesterPrivateKeys[t.attesterPrivateKeys.length - 1];
      const attester = privateKeyToAccount(attesterPrivateKey);
      const gseAddress = await rollup.getGSE();
      const gse = getContract({
        address: gseAddress,
        abi: GSEAbi,
        client: t.ctx.deployL1ContractsValues.l1Client,
      });
      const badAttesterInitialBalance = await gse.read.effectiveBalanceOf([rollup.address, attester.address]);
      debugLogger.info(`\n\nbadAttesterInitialBalance: ${badAttesterInitialBalance}\n\n`);

      const gseOwnerAddress = await gse.read.owner();
      debugLogger.info(`\n\ngseOwnerAddress: ${gseOwnerAddress}\n\n`);

      if (shouldVeto) {
        const slasher = getContract({
          address: await rollup.getSlasher(),
          abi: SlasherAbi,
          client: t.ctx.deployL1ContractsValues.l1Client,
        });
        const tx = await slasher.write.vetoPayload([submittableRound.payload]);
        const receipt = await t.ctx.deployL1ContractsValues.l1Client.waitForTransactionReceipt({ hash: tx });
        debugLogger.info(`\n\nvetoPayload tx receipt: ${receipt.status}\n\n`);
      }

      const awaitPayloadSubmitted = new Promise<{ round: bigint; payload: `0x${string}` }>(resolve => {
        slashingProposer.listenToPayloadSubmitted(args => {
          resolve(args);
        });
      });
      const awaitPayloadExpiredPromise = retryUntil(async () => {
        const currentRound = await slashingProposer.getCurrentRound();
        return currentRound > submittableRound.round + BigInt(LIFETIME_IN_ROUNDS);
      });

      const payloadExecutedOrExpired = await Promise.race([awaitPayloadSubmitted, awaitPayloadExpiredPromise]);
      const badAttesterFinalBalance = await gse.read.effectiveBalanceOf([rollup.address, attester.address]);
      if (shouldVeto) {
        expect(payloadExecutedOrExpired).toBe(true);
        expect(badAttesterFinalBalance).toBe(badAttesterInitialBalance);
      } else {
        expect((payloadExecutedOrExpired as { round: bigint; payload: `0x${string}` }).round).toBe(
          submittableRound.round,
        );
        expect(badAttesterFinalBalance).toBe(badAttesterInitialBalance - slashingAmount);
      }
    },
    1000 * 60 * 10,
  );
});
