import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT, getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { TxHash } from '@aztec/aztec.js/tx';
import type { RollupCheatCodes } from '@aztec/aztec/testing';
import type { EpochCacheInterface } from '@aztec/epoch-cache';
import type { RollupContract, SlashingProposerContract } from '@aztec/ethereum/contracts';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync, unique } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { pluralize } from '@aztec/foundation/string';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { getPXEConfig, getPXEConfig as getRpcConfig } from '@aztec/pxe/server';
import { getRoundForOffense } from '@aztec/slasher';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { SchnorrHardcodedKeyAccountContract } from '../fixtures/schnorr_hardcoded_account_contract.js';
import { submitTxsTo } from '../shared/submit-transactions.js';
import { TestWallet } from '../test-wallet/test_wallet.js';
import { type ProvenTx, proveInteraction } from '../test-wallet/utils.js';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitComplexTxsTo = async (
  logger: Logger,
  from: AztecAddress,
  spamContract: SpamContract,
  numTxs: number,
  opts: { callPublic?: boolean } = {},
) => {
  const txs: TxHash[] = [];

  const seed = 1234n;
  const spamCount = 15;
  for (let i = 0; i < numTxs; i++) {
    const method = spamContract.methods.spam(seed + BigInt(i * spamCount), spamCount, !!opts.callPublic);
    const { txHash } = await method.send({ from, wait: NO_WAIT });
    logger.info(`Tx sent with hash ${txHash.toString()}`);
    txs.push(txHash);
  }
  return txs;
};

// creates a wallet and submit a given number of transactions through it.
export const submitTransactions = async (
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<TxHash[]> => {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;
  const wallet = await TestWallet.create(
    node,
    // Use checkpointed chain tip to avoid anchoring on provisional blocks that the archiver can prune
    // when their slot ends without a checkpoint landing on L1.
    { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
    { loggerActorLabel: 'pxe-tx' },
  );
  const contract = new SchnorrHardcodedKeyAccountContract();
  const fundedAccountManager = await wallet.createAccount({
    secret: fundedAccount.secret,
    salt: fundedAccount.salt,
    contract,
  });
  return submitTxsTo(wallet, fundedAccountManager.address, numTxs, logger);
};

export async function prepareTransactions(
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<ProvenTx[]> {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;

  const wallet = await TestWallet.create(
    node,
    { ...getPXEConfig(), proverEnabled: false, syncChainTip: 'checkpointed' },
    { loggerActorLabel: 'pxe-tx' },
  );
  const accountContract = new SchnorrHardcodedKeyAccountContract();
  const fundedAccountManager = await wallet.createAccount({
    secret: fundedAccount.secret,
    salt: fundedAccount.salt,
    contract: accountContract,
  });

  const testContractInstance = await getContractInstanceFromInstantiationParams(TestContractArtifact, {
    salt: Fr.random(),
  });
  await wallet.registerContract(testContractInstance, TestContractArtifact);
  const contract = TestContract.at(testContractInstance.address, wallet);

  return timesAsync(numTxs, async () => {
    const tx = await proveInteraction(wallet, contract.methods.emit_nullifier(Fr.random()), {
      from: fundedAccountManager.address,
    });
    logger.info(`Tx prepared with hash ${tx.getTxHash()}`);
    return tx;
  });
}

export function awaitProposalExecution(
  slashingProposer: SlashingProposerContract,
  timeoutSeconds: number,
  logger: Logger,
): Promise<bigint> {
  return new Promise<bigint>((resolve, reject) => {
    const timeout = setTimeout(() => {
      logger.warn(`Timed out waiting for proposal execution`);
      reject(new Error(`Timeout waiting for proposal execution after ${timeoutSeconds}s`));
    }, timeoutSeconds * 1000);

    const unwatch = slashingProposer.listenToRoundExecuted(args => {
      logger.warn(`Slash from round ${args.round} executed`);
      clearTimeout(timeout);
      unwatch();
      resolve(args.round);
    });
  });
}

export async function awaitCommitteeExists({
  rollup,
  logger,
}: {
  rollup: RollupContract;
  logger: Logger;
}): Promise<readonly `0x${string}`[]> {
  logger.info(`Waiting for committee to be set`);
  let committee: EthAddress[] | undefined;
  await retryUntil(
    async () => {
      committee = await rollup.getCurrentEpochCommittee();
      return committee && committee.length > 0;
    },
    'non-empty committee',
    60,
  );
  logger.warn(`Committee has been formed`, { committee: committee!.map(c => c.toString()) });
  return committee!.map(c => c.toString() as `0x${string}`);
}

/**
 * Scans L2 slots forward from `minLeadSlots` ahead of the current slot, returning the first slot in
 * which `targetProposer` is the proposer.
 *
 * Scanning starts at `currentSlot + minLeadSlots` and only ever moves forward, so every returned slot
 * is at least `minLeadSlots` ahead — a caller can safely warp to `targetSlot - minLeadSlots` for a
 * settle buffer without risking a backwards warp. Stepping by a single slot examines both epoch
 * parities, which matters because the per-slot proposer is a different RANDAO-shuffled committee
 * member: searching only a fixed offset within each epoch can leave a 1-of-N target unexamined when
 * the epoch is short. A candidate in an epoch whose committee isn't sampled yet makes the proposer
 * lookup revert with EpochNotStable; this warps one epoch forward and continues, keeping the
 * candidate at least `minLeadSlots` ahead of the new current slot. Throws after `maxSlotsToScan`.
 *
 * Unlike {@link advanceToEpochBeforeProposer}, this does not stop an epoch early — callers that want
 * to warp close to the target (rather than stage sequencers an epoch ahead) use this and warp the
 * final `minLeadSlots` in themselves.
 */
export async function findUpcomingProposerSlot({
  epochCache,
  cheatCodes,
  targetProposer,
  logger,
  minLeadSlots,
  maxSlotsToScan = 100,
}: {
  epochCache: EpochCacheInterface;
  cheatCodes: RollupCheatCodes;
  targetProposer: EthAddress;
  logger: Logger;
  minLeadSlots: number;
  maxSlotsToScan?: number;
}): Promise<SlotNumber> {
  let candidate = Number(await cheatCodes.getSlot()) + minLeadSlots;

  for (let scanned = 0; scanned < maxSlotsToScan; scanned++) {
    let proposer: EthAddress | undefined;
    try {
      proposer = await epochCache.getProposerAttesterAddressInSlot(SlotNumber(candidate));
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('EpochNotStable')) {
        throw err;
      }
      await cheatCodes.advanceToNextEpoch();
      const newCurrentSlot = Number(await cheatCodes.getSlot());
      // Keep the lead after the warp: never return a slot we could no longer warp ahead of.
      candidate = Math.max(candidate, newCurrentSlot + minLeadSlots);
      continue;
    }

    if (proposer && proposer.equals(targetProposer)) {
      logger.warn(`Found target proposer ${targetProposer} at slot ${candidate}`);
      return SlotNumber(candidate);
    }
    candidate++;
  }

  throw new Error(`Target proposer ${targetProposer} not found within ${maxSlotsToScan} slots`);
}

/**
 * Advance epochs until we find one where the target proposer is selected for a slot at least
 * `warmupSlots` into the epoch, then stop one epoch before it. This leaves time for the caller to
 * start sequencers before warping to the target epoch, avoiding the race where the target epoch
 * passes before sequencers are ready.
 *
 * The first `warmupSlots` slots of the epoch are skipped on purpose. Callers warp to one slot
 * before the target epoch and, under proposer pipelining, the proposer begins building one slot
 * before its proposal slot. If the proposer were in the first slot of the epoch, that build would
 * begin at the exact instant of the warp, leaving the freshly-started sequencer no warm-up margin;
 * it then serializes its (often AVM-heavy) proposal past the slot boundary and honest receivers
 * reject it as late. Picking a slot at least `warmupSlots` into the epoch guarantees that many full
 * slots of wall-clock between the warp and the start of the proposer's build.
 *
 * Returns the target epoch and the concrete target slot so the caller can warp to it after starting
 * sequencers.
 */
export async function advanceToEpochBeforeProposer({
  epochCache,
  cheatCodes,
  targetProposer,
  logger,
  maxAttempts = 20,
  warmupSlots = 1,
}: {
  epochCache: EpochCacheInterface;
  cheatCodes: RollupCheatCodes;
  targetProposer: EthAddress;
  logger: Logger;
  maxAttempts?: number;
  warmupSlots?: number;
}): Promise<{ targetEpoch: EpochNumber; targetSlot: SlotNumber }> {
  const { epochDuration } = await cheatCodes.getConfig();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const currentEpoch = await cheatCodes.getEpoch();
    // Check the NEXT epoch's slots so we stay one epoch before the target,
    // giving the caller time to start sequencers before the target epoch arrives.
    const nextEpoch = Number(currentEpoch) + 1;
    const epochStartSlot = nextEpoch * Number(epochDuration);
    // Skip the first `warmupSlots` slots so the caller keeps a warm-up margin after warping to one
    // slot before the epoch (see the doc comment above).
    const startSlot = epochStartSlot + warmupSlots;
    const endSlot = epochStartSlot + Number(epochDuration);

    logger.info(
      `Checking next epoch ${nextEpoch} (slots ${startSlot}-${endSlot - 1}) for proposer ${targetProposer} (current epoch: ${currentEpoch})`,
    );

    for (let s = startSlot; s < endSlot; s++) {
      const proposer = await epochCache.getProposerAttesterAddressInSlot(SlotNumber(s));
      if (proposer && proposer.equals(targetProposer)) {
        logger.warn(
          `Found target proposer ${targetProposer} in slot ${s} of epoch ${nextEpoch}. Staying at epoch ${currentEpoch} to allow sequencer startup.`,
        );
        return { targetEpoch: EpochNumber(nextEpoch), targetSlot: SlotNumber(s) };
      }
    }

    logger.info(`Target proposer not found in epoch ${nextEpoch}, advancing to next epoch`);
    await cheatCodes.advanceToNextEpoch();
  }

  throw new Error(`Target proposer ${targetProposer} not found in any slot after ${maxAttempts} epoch attempts`);
}

export async function awaitOffenseDetected({
  logger,
  nodeAdmin,
  slashingRoundSize,
  epochDuration,
  waitUntilOffenseCount,
  timeoutSeconds = 120,
}: {
  nodeAdmin: AztecNodeAdmin;
  logger: Logger;
  slashingRoundSize: number;
  epochDuration: number;
  waitUntilOffenseCount?: number;
  timeoutSeconds?: number;
}) {
  const targetOffenseCount = waitUntilOffenseCount ?? 1;
  logger.warn(`Waiting for ${pluralize('offense', targetOffenseCount)} to be detected`);
  const offenses = await retryUntil(
    async () => {
      const offenses = await nodeAdmin.getSlashOffenses('all');
      if (offenses.length >= targetOffenseCount) {
        return offenses;
      }
    },
    'non-empty offenses',
    timeoutSeconds,
  );
  logger.info(
    `Hit ${offenses.length} offenses on rounds ${unique(offenses.map(o => getRoundForOffense(o, { slashingRoundSize, epochDuration })))}`,
    { offenses },
  );
  return offenses;
}

/**
 * Await the committee to be slashed out of the validator set.
 * Currently assumes that the committee is the same size as the validator set.
 */
export async function awaitCommitteeKicked({
  rollup,
  cheatCodes,
  committee,
  slashingProposer,
  slashingRoundSize,
  aztecSlotDuration,
  aztecEpochDuration,
  logger,
  offenseEpoch,
}: {
  rollup: RollupContract;
  cheatCodes: RollupCheatCodes;
  committee: readonly `0x${string}`[];
  slashingProposer: SlashingProposerContract | undefined;
  slashingRoundSize: number;
  aztecSlotDuration: number;
  aztecEpochDuration: number;
  logger: Logger;
  offenseEpoch: number;
}) {
  if (!slashingProposer) {
    throw new Error('No slashing proposer configured. Cannot test slashing.');
  }

  await cheatCodes.debugRollup();

  // Use the slash offset to ensure we are in the right epoch for tally
  const slashOffsetInRounds = await slashingProposer.getSlashOffsetInRounds();
  const slashingRoundSizeInEpochs = slashingRoundSize / aztecEpochDuration;
  const slashingOffsetInEpochs = Number(slashOffsetInRounds) * slashingRoundSizeInEpochs;
  const firstEpochInOffenseRound = offenseEpoch - (offenseEpoch % slashingRoundSizeInEpochs);
  const targetEpoch = firstEpochInOffenseRound + slashingOffsetInEpochs;
  logger.info(`Advancing to epoch ${targetEpoch} so we start slashing`);
  await cheatCodes.advanceToEpoch(EpochNumber(targetEpoch), { offset: -aztecSlotDuration / 2 });

  const attestersPre = await rollup.getAttesters();
  expect(attestersPre.length).toBe(committee.length);

  for (const attester of attestersPre) {
    const attesterInfo = await rollup.getAttesterView(attester);
    expect(attesterInfo.status).toEqual(1); // Validating
  }

  // Allow up to four round-lengths so that under proposer pipelining, where individual rounds
  // sometimes fail to gather quorum because parts of the committee miss votes due to chain-state
  // races, we still see a later round execute the slash.
  const timeout = slashingRoundSize * 4 * aztecSlotDuration + 30;
  logger.info(`Waiting for slash to be executed (timeout ${timeout}s)`);
  await awaitProposalExecution(slashingProposer, timeout, logger);

  // The attesters should still form the committee but they should be reduced to the "living" status
  await cheatCodes.debugRollup();
  const committeePostSlashing = await rollup.getCurrentEpochCommittee();
  expect(committeePostSlashing?.length).toBe(attestersPre.length);

  const attestersPostSlashing = await rollup.getAttesters();
  expect(attestersPostSlashing.length).toBe(0);

  for (const attester of attestersPre) {
    const attesterInfo = await rollup.getAttesterView(attester);
    expect(attesterInfo.status).toEqual(2); // Living
  }

  logger.info(`Advancing to check current committee`);
  await cheatCodes.debugRollup();
  await cheatCodes.advanceToEpoch(
    EpochNumber((await cheatCodes.getEpoch()) + (await rollup.getLagInEpochsForValidatorSet()) + 1),
  );
  await cheatCodes.debugRollup();

  const committeeNextEpoch = await rollup.getCurrentEpochCommittee();
  // The committee should be undefined, since the validator set is empty
  // and the tests currently using this helper always set a target committee size.
  expect(committeeNextEpoch).toBeUndefined();

  const attestersNextEpoch = await rollup.getAttesters();
  expect(attestersNextEpoch.length).toBe(0);
}
