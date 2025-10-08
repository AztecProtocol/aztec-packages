import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress, type Logger, createLogger, retryUntil } from '@aztec/aztec.js';
import {
  EmpireSlashingProposerArtifact,
  EmpireSlashingProposerContract,
  type ExtendedViemWalletClient,
  L1Deployer,
  L1TxUtils,
  RollupContract,
  SlasherArtifact,
  TallySlashingProposerArtifact,
  TallySlashingProposerContract,
  createExtendedL1Client,
  createL1TxUtilsFromViemWallet,
} from '@aztec/ethereum';
import { tryJsonStringify } from '@aztec/foundation/json-rpc';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { bufferToHex } from '@aztec/foundation/string';
import { GSEAbi } from '@aztec/l1-artifacts/GSEAbi';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';
import { SlasherAbi } from '@aztec/l1-artifacts/SlasherAbi';

import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { encodeFunctionData, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { createNodes } from '../fixtures/setup_p2p_test.js';
import { getPrivateKeyFromIndex } from '../fixtures/utils.js';
import { P2PNetworkTest } from './p2p_network.js';

const debugLogger = createLogger('e2e:spartan-test:slash-veto-demo');

const VETOER_PRIVATE_KEY_INDEX = 18; // This should be after all keys used by validators
const NUM_NODES = 3;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BOOT_NODE_UDP_PORT = 4500;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 8;
const EPOCH_DURATION = 2;
// how many l2 slots make up a slashing round
const SLASHING_ROUND_SIZE = 4;
// how many block builders must signal for a single payload in a single round for it to be executable
const SLASHING_QUORUM = 3;
// an attester must not attest to 50% of proven blocks over an epoch to warrant a slash payload being created
const SLASH_INACTIVITY_TARGET_PERCENTAGE = 0.5;
// an attester must not attest to 10% of proven blocks over an epoch to agree with a slash
// round N must be submitted in/before round N + LIFETIME_IN_ROUNDS
const LIFETIME_IN_ROUNDS = 2;
// round N must be submitted after round N + EXECUTION_DELAY_IN_ROUNDS
const EXECUTION_DELAY_IN_ROUNDS = 1;
// unit of slashing
const SLASHING_UNIT = BigInt(20e18);
// offset for slashing rounds
const SLASH_OFFSET_IN_ROUNDS = 2;
const COMMITEE_SIZE = NUM_VALIDATORS;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-veto-demo-'));

describe('veto slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let slashingAmount: bigint;
  let additionalNode: AztecNodeService | undefined;
  let rollup: RollupContract;
  let vetoerL1TxUtils: L1TxUtils;
  let vetoerL1Client: ExtendedViemWalletClient;

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
        slashSelfAllowed: true,
        slashingOffsetInRounds: SLASH_OFFSET_IN_ROUNDS,
        slashAmountSmall: SLASHING_UNIT,
        slashAmountMedium: SLASHING_UNIT * 2n,
        slashAmountLarge: SLASHING_UNIT * 3n,
        slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE / EPOCH_DURATION,
        slashingQuorum: SLASHING_QUORUM,
        slashInactivityTargetPercentage: SLASH_INACTIVITY_TARGET_PERCENTAGE,
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

    vetoerL1Client = createExtendedL1Client(
      t.ctx.aztecNodeConfig.l1RpcUrls,
      bufferToHex(getPrivateKeyFromIndex(VETOER_PRIVATE_KEY_INDEX)!),
    );
    vetoerL1TxUtils = createL1TxUtilsFromViemWallet(vetoerL1Client, {
      logger: t.logger,
      dateProvider: t.ctx.dateProvider,
    });

    ({ rollup } = await t.getContracts());

    const [activationThreshold, ejectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
    ]);

    // Slashing amount should be enough to kick validators out
    slashingAmount = SLASHING_UNIT * 3n;
    expect(activationThreshold - slashingAmount).toBeLessThan(ejectionThreshold);

    t.ctx.aztecNodeConfig.slashInactivityPenalty = slashingAmount;
    for (const node of nodes) {
      await node.setConfig({ slashInactivityPenalty: slashingAmount });
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

  /**
   * Deploys a new slasher contract on L1.
   *
   * @param deployerClient - The client to use to deploy the slasher contract. Also serves as the VETOER.
   * @returns The address of the deployed slasher contract.
   */
  async function deployNewSlasher(deployerClient: ExtendedViemWalletClient, slasherType: 'empire' | 'tally') {
    const deployer = new L1Deployer(deployerClient, 42, undefined, false, undefined, undefined);

    const vetoer = deployerClient.account.address;
    const governance = EthAddress.random().toString(); // We don't need a real governance address for this test
    debugLogger.info(`\n\ndeploying slasher with vetoer: ${vetoer}\n\n`);
    const slasher = (await deployer.deploy(SlasherArtifact, [vetoer, governance, 3600n])).address;
    await deployer.waitForDeployments();

    let proposer: EthAddress;
    if (slasherType === 'empire') {
      const proposerArgs = [
        rollup.address, // instance
        slasher.toString(), // slasher
        BigInt(SLASHING_QUORUM),
        BigInt(SLASHING_ROUND_SIZE),
        BigInt(LIFETIME_IN_ROUNDS),
        BigInt(EXECUTION_DELAY_IN_ROUNDS),
      ] as const;
      debugLogger.info(`\n\ndeploying empire slasher proposer with args: ${tryJsonStringify(proposerArgs)}\n\n`);
      proposer = (await deployer.deploy(EmpireSlashingProposerArtifact, proposerArgs)).address;
    } else if (slasherType === 'tally') {
      const proposerArgs = [
        rollup.address, // instance
        slasher.toString(), // slasher
        BigInt(SLASHING_QUORUM),
        BigInt(SLASHING_ROUND_SIZE),
        BigInt(LIFETIME_IN_ROUNDS),
        BigInt(EXECUTION_DELAY_IN_ROUNDS),
        [SLASHING_UNIT, SLASHING_UNIT * 2n, SLASHING_UNIT * 3n],
        BigInt(COMMITEE_SIZE),
        BigInt(EPOCH_DURATION),
        BigInt(SLASH_OFFSET_IN_ROUNDS),
      ] as const;
      debugLogger.info(`\n\ndeploying tally slasher proposer with args: ${tryJsonStringify(proposerArgs)}\n\n`);
      proposer = (await deployer.deploy(TallySlashingProposerArtifact, proposerArgs)).address;
    } else {
      throw new Error(`Unknown slasher type: ${slasherType}`);
    }

    debugLogger.info(`\n\ninitializing slasher with proposer: ${proposer}\n\n`);
    const txUtils = createL1TxUtilsFromViemWallet(deployerClient, {
      logger: t.logger,
      dateProvider: t.ctx.dateProvider,
    });
    await txUtils.sendAndMonitorTransaction({
      to: slasher.toString(),
      data: encodeFunctionData({
        abi: SlasherAbi,
        functionName: 'initializeProposer',
        args: [proposer.toString()],
      }),
    });

    return slasher;
  }

  /** Waits for a round to be executable */
  async function waitForSubmittableRound(
    proposer: EmpireSlashingProposerContract | TallySlashingProposerContract,
    rollup: RollupContract,
    debugLogger: Logger,
  ): Promise<{ round: bigint; payload: `0x${string}` }> {
    if (proposer.type === 'empire') {
      const awaitSubmittableRound = promiseWithResolvers<{ payload: `0x${string}`; round: bigint }>();
      proposer.listenToSubmittablePayloads(args => awaitSubmittableRound.resolve(args));

      const diagnosticInterval = setInterval(() => {
        void (async () => {
          try {
            const currentRound = await proposer.getCurrentRound();
            const roundInfo = await proposer.getRoundInfo(rollup.address, currentRound);
            debugLogger.info(`\n\ncurrentRound: ${currentRound}\n\n`);
            debugLogger.info(`\n\npayloadWithMostSignals: ${roundInfo.payloadWithMostSignals}\n\n`);

            const signals = await proposer.getPayloadSignals(
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
      const submittableRound = await awaitSubmittableRound.promise;
      clearInterval(diagnosticInterval);
      return submittableRound;
    } else if (proposer.type === 'tally') {
      return retryUntil(async () => {
        const currentRound = await proposer.getCurrentRound();
        const roundInfo = await proposer.getRound(currentRound - 1n);
        debugLogger.warn(`Current round is ${currentRound}. Previous round got ${roundInfo.voteCount} votes.`);
        if (roundInfo.voteCount >= SLASHING_QUORUM) {
          const { address: payload } = await proposer.getPayload(currentRound - 1n);
          return { round: currentRound - 1n, payload: payload.toString() };
        }
      });
    } else {
      throw new Error(`Unknown proposer type`);
    }
  }

  it.each([[true, 'tally']] as const)(
    'vetoes %s and sets the new %s slasher',
    async (shouldVeto: boolean, slasherType: 'empire' | 'tally') => {
      //################################//
      //                                //
      // Create new Slasher with Vetoer //
      //                                //
      //################################//

      const newSlasherAddress = await deployNewSlasher(vetoerL1Client, slasherType);
      debugLogger.info(`\n\nnewSlasherAddress: ${newSlasherAddress}\n\n`);

      // Need to impersonate governance to set the new slasher
      await t.ctx.cheatCodes.eth.startImpersonating(
        t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceAddress,
      );

      const setSlasherTx = await t.ctx.deployL1ContractsValues.l1Client.writeContract({
        address: rollup.address,
        abi: RollupAbi,
        functionName: 'setSlasher',
        args: [newSlasherAddress.toString()],
        account: t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceAddress.toString(),
      });
      const receipt = await t.ctx.deployL1ContractsValues.l1Client.waitForTransactionReceipt({
        hash: setSlasherTx,
      });
      expect(receipt.status).toEqual('success');

      await t.ctx.cheatCodes.eth.stopImpersonating(t.ctx.deployL1ContractsValues.l1ContractAddresses.governanceAddress);

      const slasherAddress = await rollup.getSlasherAddress();
      expect(slasherAddress.toLowerCase()).toEqual(newSlasherAddress.toString().toLowerCase());
      debugLogger.info(`\n\nnew slasher address: ${slasherAddress}\n\n`);
      const slasher = getContract({
        address: slasherAddress,
        abi: SlasherAbi,
        client: t.ctx.deployL1ContractsValues.l1Client,
      });
      const slasherVetoer = await slasher.read.VETOER();
      debugLogger.info(`\n\nnew slasher vetoer: ${slasherVetoer}\n\n`);
      expect(slasherVetoer).toEqual(vetoerL1Client.account.address);

      const slashingProposer = await rollup.getSlashingProposer();
      assert(slashingProposer !== undefined);

      //#######################################//
      //                                       //
      // Wait for quorum on inactive validator //
      //                                       //
      //#######################################//

      const startTime = Date.now();
      debugLogger.info('Waiting for submittable round...');
      const submittableRound = await waitForSubmittableRound(slashingProposer, rollup, debugLogger);

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
        const currentRound = await slashingProposer!.getCurrentRound();
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
        const slasherAddress = await rollup.getSlasherAddress();
        const { receipt } = await vetoerL1TxUtils.sendAndMonitorTransaction({
          to: slasherAddress,
          data: encodeFunctionData({
            abi: SlasherAbi,
            functionName: 'vetoPayload',
            args: [submittableRound.payload],
          }),
        });
        debugLogger.info(`\n\nvetoPayload tx receipt: ${receipt.status}\n\n`);
      }

      //###################################//
      //                                   //
      // Await payload expired or executed //
      //                                   //
      //###################################//

      const awaitPayloadSubmitted = promiseWithResolvers<{ round: bigint }>();
      if (slashingProposer.type === 'empire') {
        slashingProposer.listenToPayloadSubmitted(args => {
          debugLogger.warn(`Payload ${args.payload} for round ${args.round} has been submitted`);
          awaitPayloadSubmitted.resolve(args);
        });
      } else if (slashingProposer.type === 'tally') {
        slashingProposer.listenToRoundExecuted(args => {
          debugLogger.warn(`Round ${args.round} has been executed`);
          awaitPayloadSubmitted.resolve(args);
        });
      }

      const awaitPayloadExpiredPromise = retryUntil(async () => {
        const currentRound = await slashingProposer.getCurrentRound();
        if (currentRound > submittableRound.round + BigInt(LIFETIME_IN_ROUNDS)) {
          debugLogger.warn(
            `Lifetime for payload ${submittableRound.payload} from round ${submittableRound.round} has expired`,
          );
          return true;
        }
      });

      const payloadExecutedOrExpired = await Promise.race([awaitPayloadSubmitted.promise, awaitPayloadExpiredPromise]);
      const badAttesterFinalBalance = await gse.read.effectiveBalanceOf([rollup.address, attester.address]);
      if (shouldVeto) {
        // If we vetoed, then either the payload expired, or another more recent payload was executed
        if (typeof payloadExecutedOrExpired === 'boolean') {
          expect(payloadExecutedOrExpired).toBe(true);
        } else {
          expect(payloadExecutedOrExpired.round).toBeGreaterThan(submittableRound.round);
        }
      } else {
        // If we didn't veto, the attester should have their balance decreased by the slashing amount.
        expect((payloadExecutedOrExpired as { round: bigint }).round).toBe(submittableRound.round);
        expect(badAttesterFinalBalance).toBe(badAttesterInitialBalance - slashingAmount);
      }
    },
    1000 * 60 * 10,
  );
});
