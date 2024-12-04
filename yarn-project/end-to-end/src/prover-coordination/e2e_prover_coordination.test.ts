import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { createAccount } from '@aztec/accounts/testing';
import {
  type AccountWalletWithSecretKey,
  EpochProofQuote,
  EpochProofQuotePayload,
  type Logger,
  TxStatus,
  createLogger,
  retryUntil,
  sleep,
} from '@aztec/aztec.js';
import { type AztecAddress, EthAddress } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer, keccak256, randomBigInt, randomInt } from '@aztec/foundation/crypto';
import { ProofCommitmentEscrowAbi, RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { StatefulTestContract, StatefulTestContractArtifact } from '@aztec/noir-contracts.js';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe';

import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  createWalletClient,
  getAddress,
  getContract,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import {
  type ISnapshotManager,
  type SubsystemsContext,
  addAccounts,
  createSnapshotManager,
} from '../fixtures/snapshot_manager.js';

describe('e2e_prover_coordination', () => {
  let ctx: SubsystemsContext;
  let wallet: AccountWalletWithSecretKey;
  let recipient: AztecAddress;
  let contract: StatefulTestContract;
  let rollupContract: GetContractReturnType<typeof RollupAbi, WalletClient<HttpTransport, Chain, Account>>;
  let publicClient: PublicClient;
  let publisherAddress: EthAddress;
  let feeJuiceContract: GetContractReturnType<typeof TestERC20Abi, WalletClient<HttpTransport, Chain, Account>>;
  let escrowContract: GetContractReturnType<
    typeof ProofCommitmentEscrowAbi,
    WalletClient<HttpTransport, Chain, Account>
  >;

  let proverSigner: Secp256k1Signer;
  let proverWallet: WalletClient<HttpTransport, Chain, Account>;

  let logger: Logger;
  let snapshotManager: ISnapshotManager;

  beforeEach(async () => {
    logger = createLogger('prover_coordination:e2e_json_coordination');
    snapshotManager = createSnapshotManager(
      `prover_coordination/e2e_json_coordination`,
      process.env.E2E_DATA_PATH,
      { startProverNode: true },
      { assumeProvenThrough: undefined },
    );

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

    // Don't run the prover node work loop - we manually control within this test
    await ctx.proverNode!.stop();

    publicClient = ctx.deployL1ContractsValues.publicClient;
    publisherAddress = EthAddress.fromString(ctx.deployL1ContractsValues.walletClient.account.address);
    rollupContract = getContract({
      address: getAddress(ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString()),
      abi: RollupAbi,
      client: ctx.deployL1ContractsValues.walletClient,
    });
    feeJuiceContract = getContract({
      address: getAddress(ctx.deployL1ContractsValues.l1ContractAddresses.feeJuiceAddress.toString()),
      abi: TestERC20Abi,
      client: ctx.deployL1ContractsValues.walletClient,
    });

    // Create a prover wallet
    const proverKey = Buffer32.random();
    proverSigner = new Secp256k1Signer(proverKey);
    proverWallet = createWalletClient({
      account: privateKeyToAccount(proverKey.toString()),
      chain: foundry,
      transport: http(ctx.aztecNodeConfig.l1RpcUrl),
    });

    const escrowAddress = await rollupContract.read.PROOF_COMMITMENT_ESCROW();
    escrowContract = getContract({
      address: getAddress(escrowAddress.toString()),
      abi: ProofCommitmentEscrowAbi,
      client: ctx.deployL1ContractsValues.walletClient,
    });

    // Ensure the prover has enough funds to put in escrow
    await performEscrow(10000000n);
  });

  afterEach(async () => {
    await snapshotManager.teardown();
  });

  const expectProofClaimOnL1 = async (expected: {
    epochToProve: bigint;
    basisPointFee: number;
    bondAmount: bigint;
    proposer: EthAddress;
    prover: EthAddress;
  }) => {
    const { epochToProve, basisPointFee, bondAmount, bondProvider, proposerClaimant } =
      await rollupContract.read.getProofClaim();
    expect(epochToProve).toEqual(expected.epochToProve);
    expect(basisPointFee).toEqual(BigInt(expected.basisPointFee));
    expect(bondAmount).toEqual(expected.bondAmount);
    expect(bondProvider).toEqual(expected.prover.toChecksumString());
    expect(proposerClaimant).toEqual(expected.proposer.toChecksumString());
  };

  const performEscrow = async (amount: bigint) => {
    // Fund with ether
    await ctx.cheatCodes.eth.setBalance(proverSigner.address, 10_000n * 10n ** 18n);
    // Fund with fee juice
    await feeJuiceContract.write.mint([proverWallet.account.address, amount]);

    // Approve the escrow contract to spend our funds
    await feeJuiceContract.write.approve([escrowContract.address, amount], {
      account: proverWallet.account,
    });

    // Deposit the funds into the escrow contract
    await escrowContract.write.deposit([amount], {
      account: proverWallet.account,
    });
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
    return await rollupContract.read.getEpochToProve().catch(e => {
      if (e instanceof Error && e.message.includes('NoEpochToProve')) {
        return undefined;
      }
    });
  };

  const expectTips = async (expected: { pending: bigint; proven: bigint }) => {
    const tips = await ctx.cheatCodes.rollup.getTips();
    expect(tips.pending).toEqual(expected.pending);
    expect(tips.proven).toEqual(expected.proven);
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
    const slotsUntilNextEpoch =
      BigInt(ctx.aztecNodeConfig.aztecEpochDuration) - (slot % BigInt(ctx.aztecNodeConfig.aztecEpochDuration)) + 1n;
    const timeToNextEpoch = slotsUntilNextEpoch * BigInt(ctx.aztecNodeConfig.aztecSlotDuration);
    const l1Timestamp = await getL1Timestamp();
    await ctx.cheatCodes.eth.warp(Number(l1Timestamp + timeToNextEpoch));
    await logState();
  };

  const makeEpochProofQuote = async ({
    epochToProve,
    validUntilSlot,
    bondAmount,
    basisPointFee,
    signer,
  }: {
    epochToProve: bigint;
    validUntilSlot?: bigint;
    bondAmount?: bigint;
    basisPointFee?: number;
    signer?: Secp256k1Signer;
  }) => {
    signer ??= new Secp256k1Signer(Buffer32.fromBuffer(keccak256(Buffer.from('cow'))));
    const quotePayload: EpochProofQuotePayload = new EpochProofQuotePayload(
      epochToProve,
      validUntilSlot ?? randomBigInt(10000n),
      bondAmount ?? randomBigInt(10000n) + 1000n,
      signer.address,
      basisPointFee ?? randomInt(100),
    );
    const digest = await rollupContract.read.quoteToDigest([quotePayload.toViemArgs()]);

    return EpochProofQuote.new(Buffer32.fromString(digest), quotePayload, signer);
  };

  it('Sequencer selects best valid proving quote for each block', async () => {
    // We want to create a set of proving quotes, some valid and some invalid
    // The sequencer should select the cheapest valid quote when it proposes the block

    // Ensure the prover has enough funds to in escrow
    await performEscrow(10000000n);

    // Here we are creating a proof quote for epoch 0
    const quoteForEpoch0 = await makeEpochProofQuote({
      epochToProve: 0n,
      validUntilSlot: BigInt(ctx.aztecNodeConfig.aztecEpochDuration + 10),
      bondAmount: 10000n,
      basisPointFee: 1,
      signer: proverSigner,
    });

    // Send in the quote
    await ctx.proverNode!.sendEpochProofQuote(quoteForEpoch0);

    // Build a block, this should NOT use the above quote as it is for the current epoch (0)
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    await logState();

    const epoch0BlockNumber = await getPendingBlockNumber();

    // Verify that we can claim the current epoch
    await expectProofClaimOnL1({ ...quoteForEpoch0.payload, proposer: publisherAddress });

    // Now go to epoch 1
    await advanceToNextEpoch();

    await logState();

    // Build a block in epoch 1, we should see the quote for epoch 0 submitted earlier published to L1
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    const epoch1BlockNumber = await getPendingBlockNumber();

    // Check it was published
    await expectProofClaimOnL1({ ...quoteForEpoch0.payload, proposer: publisherAddress });

    // now 'prove' epoch 0
    await rollupContract.write.setAssumeProvenThroughBlockNumber([BigInt(epoch0BlockNumber)]);

    await logState();

    // Now go to epoch 2
    await advanceToNextEpoch();

    const currentSlot = await getSlot();

    // Now create a number of quotes, some valid some invalid for epoch 1, the lowest priced valid quote should be chosen
    const validQuotes = await Promise.all(
      times(3, (i: number) =>
        makeEpochProofQuote({
          epochToProve: 1n,
          validUntilSlot: currentSlot + 2n,
          bondAmount: 10000n,
          basisPointFee: 10 + i,
          signer: proverSigner,
        }),
      ),
    );

    const proofQuoteInvalidSlot = await makeEpochProofQuote({
      epochToProve: 1n,
      validUntilSlot: 3n,
      bondAmount: 10000n,
      basisPointFee: 1,
      signer: proverSigner,
    });

    const proofQuoteInvalidEpoch = await makeEpochProofQuote({
      epochToProve: 4n,
      validUntilSlot: currentSlot + 4n,
      bondAmount: 10000n,
      basisPointFee: 2,
      signer: proverSigner,
    });

    const proofQuoteInsufficientBond = await makeEpochProofQuote({
      epochToProve: 1n,
      validUntilSlot: currentSlot + 4n,
      bondAmount: 0n,
      basisPointFee: 3,
      signer: proverSigner,
    });

    const allQuotes = [proofQuoteInvalidSlot, proofQuoteInvalidEpoch, ...validQuotes, proofQuoteInsufficientBond];

    await Promise.all(allQuotes.map(x => ctx.proverNode!.sendEpochProofQuote(x)));

    // now build another block and we should see the best valid quote being published
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    const expectedQuote = validQuotes[0];

    await expectProofClaimOnL1({ ...expectedQuote.payload, proposer: publisherAddress });

    // building another block should succeed, we should not try and submit another quote
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    await expectProofClaimOnL1({ ...expectedQuote.payload, proposer: publisherAddress });

    // now 'prove' epoch 1
    await rollupContract.write.setAssumeProvenThroughBlockNumber([BigInt(epoch1BlockNumber)]);

    // Now go to epoch 3
    await advanceToNextEpoch();

    // now build another block and we should see that no claim is published as nothing is valid
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    // The quote state on L1 is the same as before
    await expectProofClaimOnL1({ ...expectedQuote.payload, proposer: publisherAddress });
  });

  it('Can claim proving rights after a prune', async () => {
    await logState();

    const tips = await ctx.cheatCodes.rollup.getTips();

    let currentPending = tips.pending;
    let currentProven = tips.proven;
    // Here we are creating a proof quote for epoch 0
    const quoteForEpoch0 = await makeEpochProofQuote({
      epochToProve: 0n,
      validUntilSlot: BigInt(ctx.aztecNodeConfig.aztecEpochDuration + 10),
      bondAmount: 10000n,
      basisPointFee: 1,
      signer: proverSigner,
    });

    await ctx.proverNode!.sendEpochProofQuote(quoteForEpoch0);

    // Build a block in epoch 1, we should see the quote for epoch 0 submitted earlier published to L1
    await contract.methods.create_note(recipient, recipient, 10).send().wait();

    currentPending++;

    // Verify that we can claim the current epoch
    await expectProofClaimOnL1({ ...quoteForEpoch0.payload, proposer: publisherAddress });
    await expectTips({ pending: currentPending, proven: currentProven });

    // Now go to epoch 1
    await advanceToNextEpoch();

    // now 'prove' epoch 0
    const epoch0BlockNumber = await getPendingBlockNumber();
    await rollupContract.write.setAssumeProvenThroughBlockNumber([BigInt(epoch0BlockNumber)]);

    currentProven = epoch0BlockNumber;

    // Go to epoch 2
    await advanceToNextEpoch();

    // Progress epochs with a block in each until we hit a reorg
    // Note tips are block numbers, not slots
    await expectTips({ pending: currentPending, proven: currentProven });
    const tx2BeforeReorg = await contract.methods.create_note(recipient, recipient, 10).send().wait();
    currentPending++;
    await expectTips({ pending: currentPending, proven: currentProven });

    // Go to epoch 3
    await advanceToNextEpoch();
    const tx3BeforeReorg = await contract.methods.create_note(recipient, recipient, 10).send().wait();
    currentPending++;
    await expectTips({ pending: currentPending, proven: currentProven });

    // Go to epoch 4 !!! REORG !!! ay caramba !!!
    await advanceToNextEpoch();

    // Wait a bit for the sequencer / node to notice a re-org
    await sleep(2000);
    await retryUntil(
      async () => (await ctx.aztecNode.getTxReceipt(tx2BeforeReorg.txHash)).status === TxStatus.SUCCESS,
      'wait for re-inclusion',
      60,
      1,
    );

    // the sequencer will add valid txs again but in a new block
    const tx2AfterReorg = await ctx.aztecNode.getTxReceipt(tx2BeforeReorg.txHash);
    const tx3AfterReorg = await ctx.aztecNode.getTxReceipt(tx3BeforeReorg.txHash);

    // the tx from epoch 2 is still valid since it references a proven block
    // this will be added back onto the chain
    expect(tx2AfterReorg.status).toEqual(TxStatus.SUCCESS);
    expect(tx2AfterReorg.blockNumber).toEqual(tx2BeforeReorg.blockNumber);
    expect(tx2AfterReorg.blockHash).not.toEqual(tx2BeforeReorg.blockHash);

    // the tx from epoch 3 is not valid anymore, since it was built against a reorged block
    // should be dropped
    expect(tx3AfterReorg.status).toEqual(TxStatus.DROPPED);

    // new pxe, as it does not support reorgs
    const pxeServiceConfig = { ...getPXEServiceConfig() };
    const newPxe = await createPXEService(ctx.aztecNode, pxeServiceConfig);
    const newWallet = await createAccount(newPxe);
    const newWalletAddress = newWallet.getAddress();

    // after the re-org the pending chain has moved on by 2 blocks
    currentPending = currentProven + 2n;

    // The chain will prune back to the proven block number
    // then include the txs from the pruned epochs that are still valid
    // bringing us back to block proven + 1 (same number, different hash)
    // creating a new account will produce another block
    // so we expect proven + 2 blocks in the pending chain here!
    await expectTips({ pending: currentPending, proven: currentProven });

    // Submit proof claim for the new epoch
    const quoteForEpoch4 = await makeEpochProofQuote({
      epochToProve: 4n,
      validUntilSlot: BigInt(ctx.aztecNodeConfig.aztecEpochDuration * 4 + 10),
      bondAmount: 10000n,
      basisPointFee: 1,
      signer: proverSigner,
    });
    await ctx.proverNode!.sendEpochProofQuote(quoteForEpoch4);

    logger.info(`Registering contract at ${contract.address} in new pxe`);
    await newPxe.registerContract({ instance: contract.instance, artifact: StatefulTestContractArtifact });
    const contractFromNewPxe = await StatefulTestContract.at(contract.address, newWallet);

    logger.info('Sending new tx on reorged chain');
    await contractFromNewPxe.methods.create_note(newWalletAddress, newWalletAddress, 10).send().wait();
    currentPending++;
    await expectTips({ pending: currentPending, proven: currentProven });

    // Expect the proof claim to be accepted for the chain after the reorg
    await expectProofClaimOnL1({ ...quoteForEpoch4.payload, proposer: publisherAddress });
  });
});
