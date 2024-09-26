import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import {
  type AccountWalletWithSecretKey,
  type DebugLogger,
  type EpochProofQuote,
  EthCheatCodes,
  createDebugLogger,
  mockEpochProofQuote,
} from '@aztec/aztec.js';
import { AZTEC_EPOCH_DURATION, AZTEC_SLOT_DURATION, type AztecAddress, EthAddress } from '@aztec/circuits.js';
import { times } from '@aztec/foundation/collection';
import { RollupAbi } from '@aztec/l1-artifacts';
import { StatefulTestContract } from '@aztec/noir-contracts.js';

import { beforeAll } from '@jest/globals';
import { type PublicClient, getAddress, getContract } from 'viem';

import {
  type ISnapshotManager,
  type SubsystemsContext,
  addAccounts,
  createSnapshotManager,
} from '../fixtures/snapshot_manager.js';

// Tests simple block building with a sequencer that does not upload proofs to L1,
// and then follows with a prover node run (with real proofs disabled, but
// still simulating all circuits via a prover-client), in order to test
// the coordination through L1 between the sequencer and the prover node.
describe('e2e_prover_node', () => {
  let ctx: SubsystemsContext;
  let wallet: AccountWalletWithSecretKey;
  let recipient: AztecAddress;
  let contract: StatefulTestContract;
  let rollupContract: any;
  let publicClient: PublicClient;
  let cc: EthCheatCodes;
  let publisherAddress: EthAddress;

  let logger: DebugLogger;
  let snapshotManager: ISnapshotManager;

  beforeAll(async () => {
    logger = createDebugLogger('aztec:prover_coordination:e2e_json_coordination');
    snapshotManager = createSnapshotManager(`prover_coordination/e2e_json_coordination`, process.env.E2E_DATA_PATH);

    await snapshotManager.snapshot('setup', addAccounts(2, logger), async ({ accountKeys }, ctx) => {
      const accountManagers = accountKeys.map(ak => getSchnorrAccount(ctx.pxe, ak[0], ak[1], 1));
      await Promise.all(accountManagers.map(a => a.register()));
      const wallets = await Promise.all(accountManagers.map(a => a.getWallet()));
      wallets.forEach((w, i) => logger.verbose(`Wallet ${i} address: ${w.getAddress()}`));
      wallet = wallets[0];
      recipient = wallets[1].getAddress();
    });

    await snapshotManager.snapshot(
      'deploy-test-contract',
      async () => {
        const owner = wallet.getAddress();
        const contract = await StatefulTestContract.deploy(wallet, owner, owner, 42).send().deployed();
        return { contractAddress: contract.address };
      },
      async ({ contractAddress }) => {
        contract = await StatefulTestContract.at(contractAddress, wallet);
      },
    );

    ctx = await snapshotManager.setup();

    await ctx.proverNode.stop();

    cc = new EthCheatCodes(ctx.aztecNodeConfig.l1RpcUrl);

    publicClient = ctx.deployL1ContractsValues.publicClient;
    publisherAddress = EthAddress.fromString(ctx.deployL1ContractsValues.walletClient.account.address);
    rollupContract = getContract({
      address: getAddress(ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString()),
      abi: RollupAbi,
      client: ctx.deployL1ContractsValues.walletClient,
    });
  });

  const expectProofClaimOnL1 = async (quote: EpochProofQuote, proposerAddress: EthAddress) => {
    const claimFromContract = await rollupContract.read.proofClaim();
    expect(claimFromContract[0]).toEqual(quote.payload.epochToProve);
    expect(claimFromContract[1]).toEqual(BigInt(quote.payload.basisPointFee));
    expect(claimFromContract[2]).toEqual(quote.payload.bondAmount);
    expect(claimFromContract[4]).toEqual(proposerAddress.toChecksumString());
  };

  const getL1Timestamp = async () => {
    return BigInt((await publicClient.getBlock()).timestamp);
  };

  const getSlot = async () => {
    const ts = await getL1Timestamp();
    return await rollupContract.read.getSlotAt([ts]);
  };

  const getEpoch = async () => {
    const slotNumber = await getSlot();
    return await rollupContract.read.getEpochAtSlot([slotNumber]);
  };

  const getPendingBlockNumber = async () => {
    return await rollupContract.read.getPendingBlockNumber();
  };

  const getProvenBlockNumber = async () => {
    return await rollupContract.read.getProvenBlockNumber();
  };

  const getEpochToProve = async () => {
    return await rollupContract.read.getEpochToProve();
  };

  const logState = async () => {
    logger.info(`Pending block: ${await getPendingBlockNumber()}`);
    logger.info(`Proven block: ${await getProvenBlockNumber()}`);
    logger.info(`Slot number: ${await getSlot()}`);
    logger.info(`Epoch number: ${await getEpoch()}`);
    logger.info(`Epoch to prove ${await getEpochToProve()}`);
  };

  const advanceToNextEpoch = async () => {
    const slot = await getSlot();
    const slotsUntilNextEpoch = BigInt(AZTEC_EPOCH_DURATION) - (slot % BigInt(AZTEC_EPOCH_DURATION)) + 1n;
    const timeToNextEpoch = slotsUntilNextEpoch * BigInt(AZTEC_SLOT_DURATION);
    const l1Timestamp = await getL1Timestamp();
    await cc.warp(Number(l1Timestamp + timeToNextEpoch));
    await logState();
  };

  it('Sequencer selects best valid proving quote for each block', async () => {
    // We want to create a set of proving quotes, some valid and some invalid
    // The sequencer should select the cheapest valid quote when it proposes the block

    // Here we are creating a proof quote for epoch 0, this will NOT get used yet
    const quoteForEpoch0 = mockEpochProofQuote(
      0n, // epoch 0
      BigInt(AZTEC_EPOCH_DURATION + 10), // valid until slot 10 into epoch 1
      10000n,
      EthAddress.random(),
      1,
    );

    // Send in the quote
    await ctx.proverNode.sendEpochProofQuote(quoteForEpoch0);

    // Build a block, this should NOT use the above quote as it is for the current epoch (0)
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    await logState();

    const epoch0BlockNumber = await getPendingBlockNumber();

    // Verify that the claim state on L1 is unitialised
    const uninitialisedProofClaim = mockEpochProofQuote(
      0n, // epoch 0
      BigInt(0),
      0n,
      EthAddress.random(),
      0,
    );

    // The rollup contract should have an uninitialised proof claim struct
    await expectProofClaimOnL1(uninitialisedProofClaim, EthAddress.ZERO);

    // Now go to epoch 1
    await advanceToNextEpoch();

    await logState();

    // Build a block in epoch 1, we should see the quote for epoch 0 submitted earlier published to L1
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    const epoch1BlockNumber = await getPendingBlockNumber();

    // Check it was published
    await expectProofClaimOnL1(quoteForEpoch0, publisherAddress);

    // now 'prove' epoch 0
    await rollupContract.write.setAssumeProvenThroughBlockNumber([BigInt(epoch0BlockNumber)]);

    await logState();

    // Now go to epoch 2
    await advanceToNextEpoch();

    const currentSlot = await getSlot();

    // Now create a number of quotes, some valid some invalid for epoch 1, the lowest priced valid quote should be chosen
    const validQuotes = times(3, (i: number) =>
      mockEpochProofQuote(1n, currentSlot + 2n, 10000n, EthAddress.random(), 10 + i),
    );

    const proofQuoteInvalidSlot = mockEpochProofQuote(1n, 3n, 10000n, EthAddress.random(), 1);

    const proofQuoteInvalidEpoch = mockEpochProofQuote(2n, currentSlot + 4n, 10000n, EthAddress.random(), 2);

    const proofQuoteInsufficientBond = mockEpochProofQuote(1n, currentSlot + 4n, 0n, EthAddress.random(), 3);

    const allQuotes = [proofQuoteInvalidSlot, proofQuoteInvalidEpoch, ...validQuotes, proofQuoteInsufficientBond];

    await Promise.all(allQuotes.map(x => ctx.proverNode.sendEpochProofQuote(x)));

    // now build another block and we should see the best valid quote being published
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    const expectedQuote = validQuotes[0];

    await expectProofClaimOnL1(expectedQuote, publisherAddress);

    // building another block should succeed, we should not try and submit another quote
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    await expectProofClaimOnL1(expectedQuote, publisherAddress);

    // now 'prove' epoch 1
    await rollupContract.write.setAssumeProvenThroughBlockNumber([BigInt(epoch1BlockNumber)]);

    // Now go to epoch 3
    await advanceToNextEpoch();

    // now build another block and we should see that no claim is published as nothing is valid
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    // The quote state on L1 is the same as before
    await expectProofClaimOnL1(expectedQuote, publisherAddress);
  });
});
