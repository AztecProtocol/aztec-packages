import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import {
  Fr,
  type Logger,
  ProvenTx,
  type SentTx,
  TxStatus,
  getContractInstanceFromDeployParams,
  retryUntil,
} from '@aztec/aztec.js';
import type { RollupCheatCodes } from '@aztec/aztec.js/testing';
import type { RollupContract, ViemClient } from '@aztec/ethereum';
import { timesAsync } from '@aztec/foundation/collection';
import type { SlashFactoryAbi } from '@aztec/l1-artifacts/SlashFactoryAbi';
import type { SlashingProposerAbi } from '@aztec/l1-artifacts/SlashingProposerAbi';
import type { SpamContract } from '@aztec/noir-test-contracts.js/Spam';
import { TestContract, TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { PXEService, createPXEService, getPXEServiceConfig as getRpcConfig } from '@aztec/pxe/server';
import { Offense, OffenseToBigInt } from '@aztec/slasher';

import type { GetContractReturnType } from 'viem';

import type { NodeContext } from '../fixtures/setup_p2p_test.js';
import { submitTxsTo } from '../shared/submit-transactions.js';

// submits a set of transactions to the provided Private eXecution Environment (PXE)
export const submitComplexTxsTo = async (
  logger: Logger,
  spamContract: SpamContract,
  numTxs: number,
  opts: { callPublic?: boolean } = {},
) => {
  const txs: SentTx[] = [];

  const seed = 1234n;
  const spamCount = 15;
  for (let i = 0; i < numTxs; i++) {
    const tx = spamContract.methods.spam(seed + BigInt(i * spamCount), spamCount, !!opts.callPublic).send();
    const txHash = await tx.getTxHash();

    logger.info(`Tx sent with hash ${txHash}`);
    const receipt = await tx.getReceipt();
    expect(receipt).toEqual(
      expect.objectContaining({
        status: TxStatus.PENDING,
        error: '',
      }),
    );
    logger.info(`Receipt received for ${txHash}`);
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

  const account = await getSchnorrAccount(
    pxeService,
    fundedAccount.secret,
    fundedAccount.signingKey,
    fundedAccount.salt,
  );
  await account.register();
  const wallet = await account.getWallet();

  const txs = await submitTxsTo(pxeService, numTxs, wallet, logger);
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

  const account = await getSchnorrAccount(pxe, fundedAccount.secret, fundedAccount.signingKey, fundedAccount.salt);
  await account.register();
  const wallet = await account.getWallet();

  const testContractInstance = await getContractInstanceFromDeployParams(TestContractArtifact, {});
  await wallet.registerContract({ instance: testContractInstance, artifact: TestContractArtifact });
  const contract = await TestContract.at(testContractInstance.address, wallet);

  const txs = await timesAsync(numTxs, async () => {
    const tx = await contract.methods.emit_nullifier(Fr.random()).prove();
    const txHash = await tx.getTxHash();
    logger.info(`Tx prepared with hash ${txHash}`);
    return tx;
  });

  return { txs, pxeService: pxe, node };
}

export async function awaitProposalExecution(
  slashingProposer: GetContractReturnType<typeof SlashingProposerAbi, ViemClient>,
  timeoutSeconds: number,
) {
  await retryUntil(
    async () => {
      const events = await slashingProposer.getEvents.ProposalExecuted();
      if (events.length === 0) {
        return false;
      }
      const event = events[0];
      const roundNumber = event.args.round;
      const proposal = event.args.proposal;
      return roundNumber && proposal;
    },
    'proposal executed',
    timeoutSeconds,
    1,
  );
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

/**
 * Await the committee to be slashed out of the validator set.
 * Currently assumes that the committee is the same size as the validator set.
 */
export async function awaitCommitteeKicked({
  offense,
  rollup,
  cheatCodes,
  committee,
  slashingAmount,
  slashFactory,
  slashingProposer,
  slashingRoundSize,
  aztecSlotDuration,
  logger,
  sendDummyTx,
}: {
  offense: Offense;
  rollup: RollupContract;
  cheatCodes: RollupCheatCodes;
  committee: readonly `0x${string}`[];
  slashingAmount: bigint;
  slashFactory: GetContractReturnType<typeof SlashFactoryAbi, ViemClient>;
  slashingProposer: GetContractReturnType<typeof SlashingProposerAbi, ViemClient>;
  slashingRoundSize: number;
  aztecSlotDuration: number;
  logger: Logger;
  sendDummyTx: () => Promise<void>;
}) {
  logger.info(`Waiting for slash payload to be deployed`);
  const expectedSlashes = Array.from({ length: committee.length }, () => slashingAmount);
  const sortedCommittee = [...committee].sort((a, b) => a.localeCompare(b));
  await retryUntil(
    async () => {
      const [address, _, isDeployed] = await slashFactory.read.getAddressAndIsDeployed([
        sortedCommittee,
        expectedSlashes,
      ]);
      return address && isDeployed;
    },
    'slash payload deployed',
    60,
    1,
  );

  const slashPayloadEvents = await slashFactory.getEvents.SlashPayloadCreated();
  expect(slashPayloadEvents.length).toBe(1);
  expect(slashPayloadEvents[0].args.offenses).toEqual(
    Array.from({ length: committee.length }, () => OffenseToBigInt[offense]),
  );

  const attestersPre = await rollup.getAttesters();
  expect(attestersPre.length).toBe(committee.length);

  for (const attester of attestersPre) {
    const attesterInfo = await rollup.getAttesterView(attester);
    // Check that status isValidating
    expect(attesterInfo.status).toEqual(1);
  }

  logger.info(`Waiting for slash proposal to be executed`);
  await awaitProposalExecution(slashingProposer, slashingRoundSize * 2 * aztecSlotDuration);

  // The attesters should still form the committee
  // but they should be reduced to the "living" status
  await cheatCodes.debugRollup();
  const committeePostSlashing = await rollup.getCurrentEpochCommittee();
  expect(committeePostSlashing?.length).toBe(attestersPre.length);

  const attestersPostSlashing = await rollup.getAttesters();
  expect(attestersPostSlashing.length).toBe(0);

  for (const attester of attestersPre) {
    const attesterInfo = await rollup.getAttesterView(attester);
    // Check that status is Living
    expect(attesterInfo.status).toEqual(2);
  }

  await cheatCodes.debugRollup();
  await cheatCodes.advanceToNextEpoch();
  await sendDummyTx();
  await cheatCodes.advanceToNextEpoch();
  await sendDummyTx();
  await cheatCodes.debugRollup();

  const committeeNextEpoch = await rollup.getCurrentEpochCommittee();
  // The committee should be undefined, since the validator set is empty
  // and the tests currently using this helper always set a target committee size.
  expect(committeeNextEpoch).toBeUndefined();

  const attestersNextEpoch = await rollup.getAttesters();
  expect(attestersNextEpoch.length).toBe(0);
}
