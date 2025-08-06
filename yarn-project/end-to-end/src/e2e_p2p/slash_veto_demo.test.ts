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
const ETHEREUM_SLOT_DURATION = 6;
const AZTEC_SLOT_DURATION = 12;
const EPOCH_DURATION = 4;
// how many l2 slots make up a slashing round
const SLASHING_ROUND_SIZE = 5;
// how many block builders must signal for a single payload in a single round for it to be executable
const SLASHING_QUORUM = 3;
// an attester must not attest to 50% of proven blocks over an epoch to warrant a slash payload being created
const SLASH_INACTIVITY_CREATE_TARGET_PERCENTAGE = 0.5;
// an attester must not attest to 10% of proven blocks over an epoch to agree with a slash
const SLASH_INACTIVITY_SIGNAL_TARGET_PERCENTAGE = 0.1;
// round N must be submitted in/before round N + LIFETIME_IN_ROUNDS
const LIFETIME_IN_ROUNDS = 2;
// round N must be submitted after round N + EXECUTION_DELAY_IN_ROUNDS
const EXECUTION_DELAY_IN_ROUNDS = 1;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-veto-demo-'));

describe('veto slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let slashingAmount: bigint;
  let additionalNode: AztecNodeService | undefined;
  let rollup: RollupContract;

  beforeAll(async () => {
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
        slashingRoundSize: SLASHING_ROUND_SIZE,
        slashingQuorum: SLASHING_QUORUM,
        slashInactivityCreateTargetPercentage: SLASH_INACTIVITY_CREATE_TARGET_PERCENTAGE,
        slashInactivitySignalTargetPercentage: SLASH_INACTIVITY_SIGNAL_TARGET_PERCENTAGE,
        slashProposerRoundPollingIntervalSeconds: 1,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();

    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES, // Note we do not create the last validator yet, so it shows as offline
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,

      DATA_DIR,
    );

    ({ rollup } = await t.getContracts());
    // slash amount is just below the ejection threshold
    slashingAmount = (await rollup.getActivationThreshold()) - (await rollup.getEjectionThreshold()) - 1n;
    t.ctx.aztecNodeConfig.slashInactivityEnabled = true;
    t.ctx.aztecNodeConfig.slashInactivityCreatePenalty = slashingAmount;
    t.ctx.aztecNodeConfig.slashInactivityMaxPenalty = slashingAmount;
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

  afterAll(async () => {
    await t.stopNodes(nodes);
    if (additionalNode !== undefined) {
      await t.stopNodes([additionalNode]);
    }
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  /**
   * Deploys a new slasher contract on L1.
   *
   * @param deployerClient - The client to use to deploy the slasher contract. Also serves as the VETOER.
   * @returns The address of the deployed slasher contract.
   */
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

  it.each([false, true])(
    'sets the new slasher and shouldVeto=%s',
    async (shouldVeto: boolean) => {
      //################################//
      //                                //
      // Create new Slasher with Vetoer //
      //                                //
      //################################//

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

      //#######################################//
      //                                       //
      // Wait for quorum on inactive validator //
      //                                       //
      //#######################################//

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

      //##############################//
      //                              //
      // Wait until the round is over //
      //                              //
      //##############################//

      await retryUntil(async () => {
        const currentRound = await slashingProposer.getCurrentRound();
        return currentRound > submittableRound.round;
      });

      //###########################################//
      //                                           //
      // Get initial balance of inactive validator //
      //                                           //
      //###########################################//

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

      //##############################//
      //                              //
      // Veto the slash if configured //
      //                              //
      //##############################//

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

      //###################################//
      //                                   //
      // Await payload expired or executed //
      //                                   //
      //###################################//

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
        // If we vetoed, the attester should have their balance unchanged.
        expect(payloadExecutedOrExpired).toBe(true);
        expect(badAttesterFinalBalance).toBe(badAttesterInitialBalance);
      } else {
        // If we didn't veto, the attester should have their balance decreased by the slashing amount.
        expect((payloadExecutedOrExpired as { round: bigint; payload: `0x${string}` }).round).toBe(
          submittableRound.round,
        );
        expect(badAttesterFinalBalance).toBe(badAttesterInitialBalance - slashingAmount);
      }
    },
    1000 * 60 * 10,
  );
});
