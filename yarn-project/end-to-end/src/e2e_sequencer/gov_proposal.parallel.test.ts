import type { Wallet } from '@aztec/aztec.js/wallet';
import { CheatCodes } from '@aztec/aztec/testing';
import type { BlobSinkServer } from '@aztec/blob-sink/server';
import {
  type DeployL1ContractsReturnType,
  GovernanceProposerContract,
  RollupContract,
  deployL1Contract,
} from '@aztec/ethereum';
import { ChainMonitor } from '@aztec/ethereum/test';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { bufferToHex } from '@aztec/foundation/string';
import type { TestDateProvider } from '@aztec/foundation/timer';
import { NewGovernanceProposerPayloadAbi } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadAbi';
import { NewGovernanceProposerPayloadBytecode } from '@aztec/l1-artifacts/NewGovernanceProposerPayloadBytecode';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';

const ETHEREUM_SLOT_DURATION = 8;
const AZTEC_SLOT_DURATION = 16;
const TXS_PER_BLOCK = 1;
const ROUND_SIZE = 2;
const QUORUM_SIZE = 2;
// Can't use 48 without chunking the addValidators call.
const COMMITTEE_SIZE = 16;

jest.setTimeout(1000 * 60 * 5);

describe('e2e_gov_proposal', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode | undefined;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let deployL1ContractsValues: DeployL1ContractsReturnType;
  let cheatCodes: CheatCodes;
  let blobSink: BlobSinkServer | undefined;
  let dateProvider: TestDateProvider | undefined;
  let rollup: RollupContract;
  let governanceProposer: GovernanceProposerContract;
  let newGovernanceProposerAddress: EthAddress;
  let testContract: TestContract;

  beforeEach(async () => {
    const validatorOffset = 10;
    const validators = times(COMMITTEE_SIZE, i => {
      const privateKey = bufferToHex(getPrivateKeyFromIndex(i + validatorOffset)!);
      const account = privateKeyToAccount(privateKey);
      const address = EthAddress.fromString(account.address);
      return { attester: address, withdrawer: address, privateKey };
    });

    let accounts: AztecAddress[] = [];
    const context = await setup(1, {
      anvilAccounts: 100,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      initialValidators: validators.map(v => ({ ...v, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) })),
      validatorPrivateKeys: new SecretValue(validators.map(v => v.privateKey)), // sequencer runs with all validator keys
      governanceProposerRoundSize: ROUND_SIZE,
      governanceProposerQuorum: QUORUM_SIZE,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      aztecProofSubmissionEpochs: 128, // no pruning
      salt: 420,
      minTxsPerBlock: TXS_PER_BLOCK,
      enforceTimeTable: true,
      automineL1Setup: true, // speed up setup
    });

    ({
      teardown,
      logger,
      wallet,
      aztecNode,
      aztecNodeAdmin,
      deployL1ContractsValues,
      cheatCodes,
      dateProvider,
      accounts,
      blobSink,
    } = context);
    defaultAccountAddress = accounts[0];

    // Get contract wrappers
    const { l1Client, l1ContractAddresses } = deployL1ContractsValues;
    const { registryAddress, gseAddress, governanceProposerAddress } = l1ContractAddresses;
    rollup = RollupContract.getFromL1ContractsValues(deployL1ContractsValues);
    governanceProposer = new GovernanceProposerContract(l1Client, governanceProposerAddress.toString());

    // Deploy new governance proposer payload
    const deployment = await deployL1Contract(
      l1Client,
      NewGovernanceProposerPayloadAbi,
      NewGovernanceProposerPayloadBytecode,
      [registryAddress.toString(), gseAddress!.toString()],
      { salt: '0x2a' },
    );
    newGovernanceProposerAddress = deployment.address;
    logger.warn(`Deployed new governance proposer at ${newGovernanceProposerAddress}`);

    // Deploy a test contract to send msgs via the outbox, since this increases
    // gas cost of a proposal, which has triggered oog errors in the past.
    testContract = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }).deployed();
    logger.warn(`Deployed test contract at ${testContract.address}`);

    await cheatCodes.rollup.advanceToEpoch(2n);
  });

  afterEach(() => teardown());

  /** Sets up voting for the next round by warping to the beginning of the round */
  const setupVotingRound = async () => {
    const roundDuration = await governanceProposer.getRoundSize();
    expect(roundDuration).toEqual(BigInt(ROUND_SIZE));

    const slot = await rollup.getSlotNumber();
    const round = await governanceProposer.computeRound(slot);
    const nextRoundBeginsAtSlot = (slot / roundDuration) * roundDuration + roundDuration;
    const nextRoundBeginsAtTimestamp = await rollup.getTimestampForSlot(nextRoundBeginsAtSlot);

    logger.warn(`Warping to round ${round + 1n} at slot ${nextRoundBeginsAtSlot}`, {
      nextRoundBeginsAtSlot,
      nextRoundBeginsAtTimestamp,
      roundDuration,
      slot,
      round,
    });

    // We warp to one L1 slot before the start of the slot, since that's when we start building the L2 block
    await cheatCodes.eth.warp(Number(nextRoundBeginsAtTimestamp) - ETHEREUM_SLOT_DURATION, {
      resetBlockInterval: true,
    });

    return { round, roundDuration, nextRoundBeginsAtSlot };
  };

  /** Verifies that the expected number of votes were cast for the governance proposal */
  const verifyVotes = async (round: bigint, expectedMinVotes: bigint) => {
    const signals = await governanceProposer.getPayloadSignals(
      rollup.address,
      round + 1n,
      newGovernanceProposerAddress.toString(),
    );
    expect(signals).toBeGreaterThanOrEqual(expectedMinVotes);
  };

  it('should propose blocks while voting', async () => {
    await aztecNodeAdmin!.setConfig({
      governanceProposerPayload: newGovernanceProposerAddress,
      maxTxsPerBlock: TXS_PER_BLOCK,
    });

    const { round, roundDuration } = await setupVotingRound();

    // Now we submit a bunch of transactions to the PXE.
    // We know that this will last at least as long as the round duration,
    // since we wait for the txs to be mined, and do so `roundDuration` times.
    // Simultaneously, we should be voting for the proposal in every slot.
    for (let i = 0; i < roundDuration; i++) {
      const txs = times(TXS_PER_BLOCK, () =>
        testContract.methods
          .create_l2_to_l1_message_arbitrary_recipient_private(Fr.random(), EthAddress.random())
          .send({ from: defaultAccountAddress }),
      );
      await Promise.all(
        txs.map(async (tx, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait({ timeout: 2 * AZTEC_SLOT_DURATION + 2 });
        }),
      );
    }

    logger.warn(`All transactions submitted and mined`);
    await verifyVotes(round, roundDuration);
  });

  it('should vote even when unable to build blocks', async () => {
    const monitor = new ChainMonitor(rollup, dateProvider).start();

    // Break the blob sink so no new blocks are synced
    blobSink!.setDisableBlobStorage(true);
    await sleep(1000);
    const lastBlockSynced = await aztecNode!.getBlockNumber();
    logger.warn(`Blob sink is disabled (last block synced is ${lastBlockSynced})`);

    // And send a tx which shouldnt be syncable but does move the block forward
    await expect(() =>
      testContract.methods
        .create_l2_to_l1_message_arbitrary_recipient_private(Fr.random(), EthAddress.random())
        .send({ from: defaultAccountAddress })
        .wait({ timeout: AZTEC_SLOT_DURATION + 2 }),
    ).rejects.toThrow(TimeoutError);
    logger.warn(`Test tx timed out as expected`);

    // Check that the block number has indeed increased on L1 so sequencers cant pass the sync check
    expect(await monitor.run().then(b => b.l2BlockNumber)).toBeGreaterThan(lastBlockSynced);
    logger.warn(`L2 block number has increased on L1`);

    // Start voting!
    await aztecNodeAdmin!.setConfig({ governanceProposerPayload: newGovernanceProposerAddress });
    const { round, roundDuration, nextRoundBeginsAtSlot } = await setupVotingRound();

    // And wait until the round is over
    const nextRoundEndsAtSlot = nextRoundBeginsAtSlot + roundDuration;
    const timeout = AZTEC_SLOT_DURATION * Number(roundDuration + 1n) + 20;
    logger.warn(`Waiting until slot ${nextRoundEndsAtSlot} for round to end (timeout ${timeout}s)`);
    await retryUntil(() => rollup.getSlotNumber().then(s => s > nextRoundEndsAtSlot), 'round end', timeout, 1);

    // We should have voted despite being unable to build blocks
    await verifyVotes(round, roundDuration);
  });
});
