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
import type { TestDateProvider } from '@aztec/foundation/timer';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { PXEService, createPXEService, getPXEServiceConfig as getRpcConfig } from '@aztec/pxe/server';
import { getRoundForOffense } from '@aztec/slasher';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import { TestWallet } from '@aztec/test-wallet';

import type { NodeContext } from '../fixtures/setup_p2p_test.js';
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

// creates an instance of the PXE and submit a given number of transactions to it.
export const createPXEServiceAndSubmitTransactions = async (
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<NodeContext> => {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;
  const pxeService = await createPXEService(node, rpcConfig, { useLogSuffix: true });
  const wallet = new TestWallet(pxeService);
  const fundedAccountManager = await wallet.createSchnorrAccount(fundedAccount.secret, fundedAccount.salt);
  const txs = await submitTxsTo(wallet, fundedAccountManager.getAddress(), numTxs, logger);
  return { txs, pxeService, node };
};

export async function createPXEServiceAndPrepareTransactions(
  logger: Logger,
  node: AztecNodeService,
  numTxs: number,
  fundedAccount: InitialAccountData,
): Promise<{ pxeService: PXEService; txs: ProvenTx[]; node: AztecNodeService }> {
  const rpcConfig = getRpcConfig();
  rpcConfig.proverEnabled = false;
  const pxe = await createPXEService(node, rpcConfig, { useLogSuffix: true });

  const wallet = new TestWallet(pxe);
  const fundedAccountManager = await wallet.createSchnorrAccount(fundedAccount.secret, fundedAccount.salt);

  const testContractInstance = await getContractInstanceFromInstantiationParams(TestContractArtifact, {});
  await wallet.registerContract({ instance: testContractInstance, artifact: TestContractArtifact });
  const contract = await TestContract.at(testContractInstance.address, wallet);

  const txs = await timesAsync(numTxs, async () => {
    const tx = await contract.methods.emit_nullifier(Fr.random()).prove({ from: fundedAccountManager.getAddress() });
    const txHash = tx.getTxHash();
    logger.info(`Tx prepared with hash ${txHash}`);
    return tx;
  });

  return { txs, pxeService: pxe, node };
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
}: {
  nodeAdmin: AztecNodeAdmin;
  logger: Logger;
  slashingRoundSize: number;
  epochDuration: number;
}) {
  logger.info(`Waiting for an offense to be detected`);
  const offenses = await retryUntil(
    async () => {
      const offenses = await nodeAdmin.getSlashOffenses('all');
      if (offenses.length > 0) {
        return offenses;
      }
    },
    'non-empty offenses',
    60,
  );
  logger.info(
    `Hit ${offenses.length} offenses on rounds ${unique(offenses.map(o => getRoundForOffense(o, { slashingRoundSize, epochDuration })))}`,
    offenses,
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
  logger,
  dateProvider,
}: {
  rollup: RollupContract;
  cheatCodes: RollupCheatCodes;
  committee: readonly `0x${string}`[];
  slashFactory: SlashFactoryContract;
  slashingProposer: EmpireSlashingProposerContract | TallySlashingProposerContract | undefined;
  slashingRoundSize: number;
  aztecSlotDuration: number;
  dateProvider: TestDateProvider;
  logger: Logger;
}) {
  if (!slashingProposer) {
    throw new Error('No slashing proposer configured. Cannot test slashing.');
  }

  logger.info(`Advancing epochs so we start slashing`);
  await cheatCodes.debugRollup();
  await cheatCodes.advanceToEpoch((await cheatCodes.getEpoch()) + (await rollup.getLagInEpochs()) + 1n, {
    updateDateProvider: dateProvider,
  });

  // Await for the slash payload to be created if empire (no payload is created on tally until execution time)
  if (slashingProposer.type === 'empire') {
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
  }

  const attestersPre = await rollup.getAttesters();
  expect(attestersPre.length).toBe(committee.length);

  for (const attester of attestersPre) {
    const attesterInfo = await rollup.getAttesterView(attester);
    expect(attesterInfo.status).toEqual(1); // Validating
  }

  const timeout = slashingRoundSize * 2 * aztecSlotDuration;
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
  await cheatCodes.advanceToEpoch((await cheatCodes.getEpoch()) + (await rollup.getLagInEpochs()) + 1n, {
    updateDateProvider: dateProvider,
  });
  await cheatCodes.debugRollup();

  const committeeNextEpoch = await rollup.getCurrentEpochCommittee();
  // The committee should be undefined, since the validator set is empty
  // and the tests currently using this helper always set a target committee size.
  expect(committeeNextEpoch).toBeUndefined();

  const attestersNextEpoch = await rollup.getAttesters();
  expect(attestersNextEpoch.length).toBe(0);
}
