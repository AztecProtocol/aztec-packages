import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import {
  AztecAddress,
  Fr,
  type Logger,
  ProvenTx,
  type SentTx,
  TxStatus,
  getContractInstanceFromInstantiationParams,
  retryUntil,
} from '@aztec/aztec.js';
import type { RollupCheatCodes } from '@aztec/aztec/testing';
import type { EmpireSlashingProposerContract, RollupContract, TallySlashingProposerContract } from '@aztec/ethereum';
import { timesAsync, unique } from '@aztec/foundation/collection';
import { pluralize } from '@aztec/foundation/string';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { getPXEConfig, getPXEConfig as getRpcConfig } from '@aztec/pxe/server';
import { getRoundForOffense } from '@aztec/slasher';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import { TestWallet } from '@aztec/test-wallet/server';

import { submitTxsTo } from '../shared/submit-transactions.js';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitComplexTxsTo = async (
  logger: Logger,
  from: AztecAddress,
  spamContract: SpamContract,
  numTxs: number,
  opts: { callPublic?: boolean } = {},
) => {
  const txs: SentTx[] = [];

  const seed = 1234n;
  const spamCount = 15;
  for (let i = 0; i < numTxs; i++) {
    const tx = spamContract.methods.spam(seed + BigInt(i * spamCount), spamCount, !!opts.callPublic).send({ from });
    const txHash = await tx.getTxHash();

    logger.info(`Tx sent with hash ${txHash.toString()}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger.info(`Receipt received for ${txHash.toString()}`);
    txs.push(tx);
  }
  return txs;
};

// creates a wallet and submit a given number of transactions through it.
export const submitTransactions = async (
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<SentTx[]> => {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;
  const wallet = await TestWallet.create(node, { ...getPXEConfig(), proverEnabled: false }, { useLogSuffix: true });
  const fundedAccountManager = await wallet.createSchnorrAccount(fundedAccount.secret, fundedAccount.salt);
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

  const wallet = await TestWallet.create(node, { ...getPXEConfig(), proverEnabled: false }, { useLogSuffix: true });
  const fundedAccountManager = await wallet.createSchnorrAccount(fundedAccount.secret, fundedAccount.salt);

  const testContractInstance = await getContractInstanceFromInstantiationParams(TestContractArtifact, {
    salt: Fr.random(),
  });
  await wallet.registerContract(testContractInstance, TestContractArtifact);
  const contract = await TestContract.at(testContractInstance.address, wallet);

  return timesAsync(numTxs, async () => {
    const tx = await contract.methods.emit_nullifier(Fr.random()).prove({ from: fundedAccountManager.address });
    const txHash = tx.getTxHash();
    logger.info(`Tx prepared with hash ${txHash}`);
    return tx;
  });
}

export function awaitProposalExecution(
  slashingProposer: EmpireSlashingProposerContract | TallySlashingProposerContract,
  timeoutSeconds: number,
  logger: Logger,
): Promise<bigint> {
  return new Promise<bigint>((resolve, reject) => {
    const timeout = setTimeout(() => {
      logger.warn(`Timed out waiting for proposal execution`);
      reject(new Error(`Timeout waiting for proposal execution after ${timeoutSeconds}s`));
    }, timeoutSeconds * 1000);

    if (slashingProposer.type === 'empire') {
      const unwatch = slashingProposer.listenToPayloadSubmitted(args => {
        logger.warn(`Proposal ${args.payload} from round ${args.round} executed`);
        clearTimeout(timeout);
        unwatch();
        resolve(args.round);
      });
    } else if (slashingProposer.type === 'tally') {
      const unwatch = slashingProposer.listenToRoundExecuted(args => {
        logger.warn(`Slash from round ${args.round} executed`);
        clearTimeout(timeout);
        unwatch();
        resolve(args.round);
      });
    } else {
      clearTimeout(timeout);
      reject(new Error(`Unknown slashing proposer type: ${(slashingProposer as any).type}`));
    }
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
  let committee: readonly `0x${string}`[] | undefined;
  await retryUntil(
    async () => {
      committee = await rollup.getCurrentEpochCommittee();
      return committee && committee.length > 0;
    },
    'non-empty committee',
    60,
  );
  return committee!;
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
  slashFactory,
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
  slashFactory: SlashFactoryContract;
  slashingProposer: EmpireSlashingProposerContract | TallySlashingProposerContract | undefined;
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

  if (slashingProposer.type === 'empire') {
    // Await for the slash payload to be created if empire (no payload is created on tally until execution time)
    const targetEpoch = (await cheatCodes.getEpoch()) + (await rollup.getLagInEpochs()) + 1n;
    logger.info(`Advancing to epoch ${targetEpoch} so we start slashing`);
    await cheatCodes.advanceToEpoch(targetEpoch);

    const slashPayloadEvents = await retryUntil(
      async () => {
        const events = await slashFactory.getSlashPayloadCreatedEvents();
        return events.length > 0 ? events : undefined;
      },
      'slash payload created',
      120,
      1,
    );
    expect(slashPayloadEvents.length).toBe(1);
    // The uniqueness check is needed since a validator may be slashed more than once on the same round (eg because they let two epochs be pruned)
    expect(unique(slashPayloadEvents[0].slashes.map(slash => slash.validator.toString()))).toHaveLength(
      committee.length,
    );
  } else {
    // Use the slash offset to ensure we are in the right epoch for tally
    const slashOffsetInRounds = await slashingProposer.getSlashOffsetInRounds();
    const slashingRoundSizeInEpochs = slashingRoundSize / aztecEpochDuration;
    const slashingOffsetInEpochs = Number(slashOffsetInRounds) * slashingRoundSizeInEpochs;
    const firstEpochInOffenseRound = offenseEpoch - (offenseEpoch % slashingRoundSizeInEpochs);
    const targetEpoch = firstEpochInOffenseRound + slashingOffsetInEpochs;
    logger.info(`Advancing to epoch ${targetEpoch} so we start slashing`);
    await cheatCodes.advanceToEpoch(targetEpoch, { offset: -aztecSlotDuration / 2 });
  }

  const attestersPre = await rollup.getAttesters();
  expect(attestersPre.length).toBe(committee.length);

  for (const attester of attestersPre) {
    const attesterInfo = await rollup.getAttesterView(attester);
    expect(attesterInfo.status).toEqual(1); // Validating
  }

  const timeout = slashingRoundSize * 2 * aztecSlotDuration + 30;
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
  await cheatCodes.advanceToEpoch((await cheatCodes.getEpoch()) + (await rollup.getLagInEpochs()) + 1n);
  await cheatCodes.debugRollup();

  const committeeNextEpoch = await rollup.getCurrentEpochCommittee();
  // The committee should be undefined, since the validator set is empty
  // and the tests currently using this helper always set a target committee size.
  expect(committeeNextEpoch).toBeUndefined();

  const attestersNextEpoch = await rollup.getAttesters();
  expect(attestersNextEpoch.length).toBe(0);
}
