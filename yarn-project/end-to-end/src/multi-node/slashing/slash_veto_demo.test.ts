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
import { encodeFunctionData, getContract } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex } from '../../fixtures/utils.js';
import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';
import { SENTINEL_TIMING } from './setup.js';

const debugLogger = createLogger('e2e:multi-node:slash-veto-demo');

const VETOER_PRIVATE_KEY_INDEX = 18; // This should be after all keys used by validators
const NUM_NODES = 3;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
// how many l2 slots make up a slashing round
const SLASHING_ROUND_SIZE = 4;
// how many block builders must signal for a single payload in a single round for it to be executable
const SLASHING_QUORUM = 3;
// an attester must not attest to 50% of proven blocks over an epoch to warrant a slash payload being created
const SLASH_INACTIVITY_TARGET_PERCENTAGE = 0.5;
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

// Tests the slasher veto mechanism. Uses MultiNodeTestContext on the mock-gossip bus: 3 running nodes
// + 1 registered-but-offline validator, fake prover. ethSlot=4s, aztecSlot=8s, epoch=2,
// proofSubEpochs=1024, minTxsPerBlock=0, inboxLag=2, sentinelEnabled, slashSelfAllowed,
// slashingVetoer=VETOER_ADDRESS (derived deterministically). Tests vetoPayload on the Slasher contract.
describe('veto slash', () => {
  let test: MultiNodeTestContext;
  let nodes: AztecNodeService[];
  let slashingAmount: bigint;
  let additionalNode: AztecNodeService | undefined;
  let rollup: RollupContract;
  let vetoerL1TxUtils: L1TxUtils;
  let vetoerL1Client: ExtendedViemWalletClient;

  beforeEach(async () => {
    test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      ...SENTINEL_TIMING,
      blockDurationMs: 2000,
      aztecProofSubmissionEpochs: 1024, // effectively do not reorg
      minTxsPerBlock: 0,
      inboxLag: 2,
      aztecTargetCommitteeSize: NUM_VALIDATORS,
      slashSelfAllowed: true,
      slashingOffsetInRounds: SLASH_OFFSET_IN_ROUNDS,
      slashAmountSmall: SLASHING_UNIT,
      slashAmountMedium: SLASHING_UNIT * 2n,
      slashAmountLarge: SLASHING_UNIT * 3n,
      slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE / SENTINEL_TIMING.aztecEpochDuration,
      slashingQuorum: SLASHING_QUORUM,
      slashingLifetimeInRounds: LIFETIME_IN_ROUNDS,
      slashingExecutionDelayInRounds: EXECUTION_DELAY_IN_ROUNDS,
      slashingDisableDuration: SLASHING_DISABLE_DURATION_SECONDS,
      slashingVetoer: VETOER_ADDRESS,
      slashInactivityTargetPercentage: SLASH_INACTIVITY_TARGET_PERCENTAGE,
      proverBrokerMaxEpochsToKeepResultsFor: 20,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });

    // Create only the first NUM_NODES validators' nodes; the last validator shows as offline.
    nodes = await Promise.all(Array.from({ length: NUM_NODES }, (_, i) => test.createValidatorNodeAt(i)));

    vetoerL1Client = createExtendedL1Client(
      test.context.config.l1RpcUrls,
      bufferToHex(getPrivateKeyFromIndex(VETOER_PRIVATE_KEY_INDEX)!),
    );
    vetoerL1TxUtils = createL1TxUtils(vetoerL1Client, {
      logger: test.logger,
      dateProvider: test.context.dateProvider,
    });

    ({ rollup } = await test.getSlashingContracts());

    const [activationThreshold, ejectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
    ]);

    // Slashing amount should be enough to kick validators out
    slashingAmount = SLASHING_UNIT * 3n;
    expect(activationThreshold - slashingAmount).toBeLessThan(ejectionThreshold);

    for (const node of nodes) {
      await node.setConfig({ slashInactivityPenalty: slashingAmount });
    }

    test.logger.info(`Setup complete`, { validators: test.validators });
  });

  afterEach(async () => {
    if (additionalNode !== undefined) {
      await additionalNode.stop();
    }
    await test.teardown();
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
  // calls vetoPayload on the Slasher contract. Asserts the vetoed payload never executes — its lifetime
  // expires or a later (non-vetoed) round executes instead.
  it(
    'vetoes a slashing payload',
    async () => {
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
        client: test.context.deployL1ContractsValues.l1Client,
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

      const attesterPrivateKey = test.privateKeyAt(NUM_VALIDATORS - 1);
      const attester = privateKeyToAccount(attesterPrivateKey);
      const gseAddress = await rollup.getGSE();
      const gse = getContract({
        address: gseAddress.toString() as `0x${string}`,
        abi: GSEAbi,
        client: test.context.deployL1ContractsValues.l1Client,
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

      const { receipt } = await vetoerL1TxUtils.sendAndMonitorTransaction({
        to: slasherAddress.toString() as `0x${string}`,
        data: encodeFunctionData({
          abi: SlasherAbi,
          functionName: 'vetoPayload',
          args: [submittableRound.payload],
        }),
      });
      debugLogger.info(`\n\nvetoPayload tx receipt: ${receipt.status}\n\n`);

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
      // The vetoed payload must never execute: either its lifetime expired, or a later (non-vetoed)
      // round executed instead.
      if (typeof payloadExecutedOrExpired === 'boolean') {
        expect(payloadExecutedOrExpired).toBe(true);
      } else {
        expect(payloadExecutedOrExpired.round).toBeGreaterThan(submittableRound.round);
      }
    },
    1000 * 60 * 10,
  );
});
