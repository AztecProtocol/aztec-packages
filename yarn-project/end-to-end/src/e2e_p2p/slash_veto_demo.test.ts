import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { type Logger, createLogger } from '@aztec/aztec.js/log';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { RollupContract, SlashingProposerContract } from '@aztec/ethereum/contracts';
import { L1TxUtils, createL1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import { GSEAbi } from '@aztec/l1-artifacts/GSEAbi';
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
const BLOCK_DURATION_MS = 2000;
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
// how long slashing stays disabled after the vetoer disables it (1 hour)
const SLASHING_DISABLE_DURATION_SECONDS = 3600;

// Vetoer address is derived deterministically from the test mnemonic so the slasher
// can be deployed with the correct vetoer from the start -- no mid-test setSlasher swap needed.
const VETOER_ADDRESS = EthAddress.fromString(
  privateKeyToAccount(bufferToHex(getPrivateKeyFromIndex(VETOER_PRIVATE_KEY_INDEX)!)).address,
);
// offset for slashing rounds
const SLASH_OFFSET_IN_ROUNDS = 2;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'slash-veto-demo-'));

// Tests the slasher veto mechanism. Uses P2PNetworkTest real libp2p: 3 running nodes + 1
// registered-but-offline validator, fake prover. ethSlot=4s, aztecSlot=8s, epoch=2,
// proofSubEpochs=1024, minTxsPerBlock=0, inboxLag=2, sentinelEnabled, slashSelfAllowed,
// slashingVetoer=VETOER_ADDRESS (derived deterministically). Tests vetoPayload on the Slasher contract.
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
        anvilSlotsInAnEpoch: 4,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        blockDurationMs: BLOCK_DURATION_MS,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        listenAddress: '127.0.0.1',
        minTxsPerBlock: 0,
        inboxLag: 2,
        aztecEpochDuration: EPOCH_DURATION,
        sentinelEnabled: true,
        slashSelfAllowed: true,
        slashingOffsetInRounds: SLASH_OFFSET_IN_ROUNDS,
        slashAmountSmall: SLASHING_UNIT,
        slashAmountMedium: SLASHING_UNIT * 2n,
        slashAmountLarge: SLASHING_UNIT * 3n,
        slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE / EPOCH_DURATION,
        slashingQuorum: SLASHING_QUORUM,
        slashingLifetimeInRounds: LIFETIME_IN_ROUNDS,
        slashingExecutionDelayInRounds: EXECUTION_DELAY_IN_ROUNDS,
        slashingDisableDuration: SLASHING_DISABLE_DURATION_SECONDS,
        slashingVetoer: VETOER_ADDRESS,
        slashInactivityTargetPercentage: SLASH_INACTIVITY_TARGET_PERCENTAGE,
        proverBrokerMaxEpochsToKeepResultsFor: 20,
      },
    });

    await t.setup();
    await t.applyBaseSetup();

    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES, // Note we do not create the last validator yet, so it shows as offline
      BOOT_NODE_UDP_PORT,
      t.genesis,

      DATA_DIR,
    );

    vetoerL1Client = createExtendedL1Client(
      t.ctx.aztecNodeConfig.l1RpcUrls,
      bufferToHex(getPrivateKeyFromIndex(VETOER_PRIVATE_KEY_INDEX)!),
    );
    vetoerL1TxUtils = createL1TxUtils(vetoerL1Client, {
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

  /** Waits for a round to be executable */
  async function waitForSubmittableRound(
    proposer: SlashingProposerContract,
    rollup: RollupContract,
    debugLogger: Logger,
  ): Promise<{ round: bigint; payload: `0x${string}` }> {
    return await retryUntil(async () => {
      const currentRound = await proposer.getCurrentRound();
      const roundInfo = await proposer.getRound(currentRound - 1n);
      debugLogger.warn(`Current round is ${currentRound}. Previous round got ${roundInfo.voteCount} votes.`);
      if (roundInfo.voteCount >= SLASHING_QUORUM) {
        const { address: payload } = await proposer.getPayload(currentRound - 1n);
        return { round: currentRound - 1n, payload: payload.toString() };
      }
    });
  }

  // Waits for the inactive validator to accumulate inactivity offenses reaching quorum, then the vetoer
  // calls vetoPayload on the Slasher contract. Asserts the payload either expires (lifetime exceeded)
  // or a later round is executed, and that the inactive validator's GSE balance is unchanged.
  // Currently parameterised as shouldVeto=true only (the non-veto branch is present but not exercised).
  it.each([[true]] as const)(
    'vetoes %s a slashing payload',
    async (shouldVeto: boolean) => {
      //#####################################//
      //                                     //
      // Verify the initial slasher's vetoer //
      //                                     //
      //#####################################//

      const slasherAddress = await rollup.getSlasherAddress();
      debugLogger.info(`\n\nslasher address: ${slasherAddress}\n\n`);
      const slasher = getContract({
        address: slasherAddress.toString() as `0x${string}`,
        abi: SlasherAbi,
        client: t.ctx.deployL1ContractsValues.l1Client,
      });
      const slasherVetoer = await slasher.read.VETOER();
      debugLogger.info(`\n\nslasher vetoer: ${slasherVetoer}\n\n`);
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
        address: gseAddress.toString() as `0x${string}`,
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
          to: slasherAddress.toString() as `0x${string}`,
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
      slashingProposer.listenToRoundExecuted(args => {
        debugLogger.warn(`Round ${args.round} has been executed`);
        awaitPayloadSubmitted.resolve(args);
      });

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
