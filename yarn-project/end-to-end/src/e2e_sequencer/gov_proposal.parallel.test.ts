import type { AztecNodeService } from '@aztec/aztec-node';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { waitForTx } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { CheatCodes } from '@aztec/aztec/testing';
import { HttpBlobClient } from '@aztec/blob-client/client';
import { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import type { DeployAztecL1ContractsReturnType } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { deployL1Contract } from '@aztec/ethereum/deploy-l1-contract';
import { ChainMonitor } from '@aztec/ethereum/test';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times, timesAsync } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
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

import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
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
  let deployL1ContractsValues: DeployAztecL1ContractsReturnType;
  let cheatCodes: CheatCodes;
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
      ...PIPELINING_SETUP_OPTS,
      anvilAccounts: 100,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      initialValidators: validators.map(v => ({ ...v, bn254SecretKey: new SecretValue(Fr.random().toBigInt()) })),
      validatorPrivateKeys: new SecretValue(validators.map(v => v.privateKey)), // sequencer runs with all validator keys
      governanceProposerRoundSize: ROUND_SIZE,
      governanceProposerQuorum: QUORUM_SIZE,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      aztecProofSubmissionEpochs: 128, // no pruning
      minTxsPerBlock: TXS_PER_BLOCK,
      enforceTimeTable: true,
      automineL1Setup: true, // speed up setup
      // Force the L1 sync to fetch blobs rather than promote the locally-proposed checkpoint.
      // The "should vote even when unable to build blocks" test relies on the blob client being the
      // only source of truth for block sync: disabling the blob client should make the tx un-syncable.
      // Under pipelining the proposer also enters its proposed checkpoint into the local store
      // (proposal_handler.ts § setProposedCheckpointFromBlocks), and the L1 synchronizer would then
      // promote that proposed checkpoint into a published one without going through the blob client
      // (l1_synchronizer.ts § tryBuildPublishedCheckpointFromProposed). Forcing the blob path here
      // restores the legacy assumption for both tests in this describe block.
      skipPromoteProposedCheckpointDuringL1Sync: true,
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
    ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
    logger.warn(`Deployed test contract at ${testContract.address}`);

    await cheatCodes.rollup.advanceToEpoch(EpochNumber(4));
  });

  afterEach(() => teardown());

  /** Sets up voting for the next round by warping to the beginning of the round */
  const setupVotingRound = async () => {
    const roundDuration = await governanceProposer.getRoundSize();
    expect(roundDuration).toEqual(BigInt(ROUND_SIZE));

    const slot = await rollup.getSlotNumber();
    const round = await governanceProposer.computeRound(slot);
    const nextRoundBeginsAtSlot = SlotNumber(Number((BigInt(slot) / roundDuration) * roundDuration + roundDuration));
    const nextRoundBeginsAtTimestamp = await rollup.getTimestampForSlot(nextRoundBeginsAtSlot);

    logger.warn(`Warping to round ${round + 1n} at slot ${nextRoundBeginsAtSlot}`, {
      nextRoundBeginsAtSlot,
      nextRoundBeginsAtTimestamp,
      roundDuration,
      slot,
      round,
    });

    // Under proposer pipelining the sequencer for slot N builds during slot N-1 and the L1 propose mines in slot N.
    // So to land a vote in the very first slot of the round we need to be in the build slot for it, which is one
    // L2 slot (not one L1 slot) earlier. Warping just one L1 slot before the round start puts the sequencer in the
    // build slot for round_start+1, costing us the first vote of the round. Warp one full L2 slot earlier instead
    // so the build slot for round_start fires while we are inside the round.
    await cheatCodes.eth.warp(Number(nextRoundBeginsAtTimestamp) - AZTEC_SLOT_DURATION - ETHEREUM_SLOT_DURATION, {
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
    //
    // Under proposer pipelining, the proposer for slot N builds in slot N-1 and the L1 propose tx mines during
    // slot N. After the L1-time warp in setupVotingRound, the first post-warp checkpoint takes at least two slots
    // to land (one to detect the new wall-clock slot and start a pipelined build, one for the propose to mine).
    // Allow up to 3 slots per tx to absorb that warp catch-up and pipelining lag.
    const waitForTxTimeout = AZTEC_SLOT_DURATION * 3 + 10;
    for (let i = 0; i < roundDuration; i++) {
      const txHashes = await timesAsync(TXS_PER_BLOCK, async () => {
        const { txHash } = await testContract.methods
          .create_l2_to_l1_message_arbitrary_recipient_private(Fr.random(), EthAddress.random())
          .send({ from: defaultAccountAddress, wait: NO_WAIT });
        return txHash;
      });
      await Promise.all(
        txHashes.map((hash, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${hash} to be mined`);
          return waitForTx(aztecNode!, hash, { timeout: waitForTxTimeout });
        }),
      );
    }

    logger.warn(`All transactions submitted and mined`);
    await verifyVotes(round, roundDuration);
  });

  it('should vote even when unable to build blocks', async () => {
    const monitor = new ChainMonitor(rollup, dateProvider).start();

    // Disable the in-process proposer→archiver block shortcut (validator-client and
    // checkpoint_proposal_job both push the just-built block into the local archiver) and then
    // disable the blob client. The archiver-side `skipPromoteProposedCheckpointDuringL1Sync`
    // shortcut is disabled at setup() — without it the L1 synchronizer would promote the locally
    // proposed checkpoint into a published one without going through the blob client, and the
    // tx would still be observed as `checkpointed` regardless of the disabled blob client. With
    // all three shortcuts off the node has no choice but to rely on the blob client for sync.
    await aztecNodeAdmin!.setConfig({ skipPushProposedBlocksToArchiver: true });
    ((aztecNodeAdmin as AztecNodeService).getBlobClient() as HttpBlobClient).setDisabled(true);
    await sleep(1000);
    const lastBlockSynced = await aztecNode!.getBlockNumber();
    logger.warn(`blob client is disabled (last block synced is ${lastBlockSynced})`);

    // And send a tx which shouldnt be syncable but does move the block forward.
    // Under proposer pipelining the proposer builds in slot N-1 and the L1 propose mines in slot N, so a single
    // slot is not enough to observe the L1 checkpoint advance. Wait at least two slots before declaring the tx
    // un-syncable and before checking that L1 has progressed.
    await expect(() =>
      testContract.methods
        .create_l2_to_l1_message_arbitrary_recipient_private(Fr.random(), EthAddress.random())
        .send({ from: defaultAccountAddress, wait: { timeout: AZTEC_SLOT_DURATION * 2 + 2 } }),
    ).rejects.toThrow(TimeoutError);
    logger.warn(`Test tx timed out as expected`);

    // Check that the block number has indeed increased on L1 so sequencers cant pass the sync check.
    // Allow another slot for any in-flight L1 propose to mine, since the work loop above hits its wait timeout the
    // moment the tx misses L2 sync, not the moment the L1 tx lands.
    await retryUntil(
      async () => (await monitor.run().then(b => b.checkpointNumber)) > lastBlockSynced,
      'L1 checkpoint to advance after disabling blob client',
      AZTEC_SLOT_DURATION + 5,
      1,
    );
    expect(await monitor.run().then(b => b.checkpointNumber)).toBeGreaterThan(lastBlockSynced);
    logger.warn(`L2 block number has increased on L1`);

    // Start voting!
    await aztecNodeAdmin!.setConfig({ governanceProposerPayload: newGovernanceProposerAddress });
    const { round, roundDuration, nextRoundBeginsAtSlot } = await setupVotingRound();

    // And wait until the round is over. Add one extra slot to absorb pipelining catch-up after the L1 warp in
    // setupVotingRound — the proposer for round_start builds during the slot before it, so the L1 chain takes
    // an extra slot to advance past nextRoundEndsAtSlot.
    const nextRoundEndsAtSlot = SlotNumber(nextRoundBeginsAtSlot + Number(roundDuration));
    const timeout = AZTEC_SLOT_DURATION * Number(roundDuration + 2n) + 20;
    logger.warn(`Waiting until slot ${nextRoundEndsAtSlot} for round to end (timeout ${timeout}s)`);
    await retryUntil(() => rollup.getSlotNumber().then(s => s > nextRoundEndsAtSlot), 'round end', timeout, 1);

    // We should have voted despite being unable to build blocks
    await verifyVotes(round, roundDuration);
  });
});
