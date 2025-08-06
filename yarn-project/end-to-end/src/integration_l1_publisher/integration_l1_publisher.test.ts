import type { ArchiveSource, L1PublishedData } from '@aztec/archiver';
import { getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, Fr, GlobalVariables, type L2Block, createLogger } from '@aztec/aztec.js';
import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { GENESIS_ARCHIVE_ROOT, MAX_NULLIFIERS_PER_TX, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import {
  type DeployL1ContractsArgs,
  type ExtendedViemWalletClient,
  GovernanceProposerContract,
  type L1ContractAddresses,
  RollupContract,
  SlashingProposerContract,
  createEthereumChain,
  createExtendedL1Client,
} from '@aztec/ethereum';
import { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthCheatCodesWithState, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import { range } from '@aztec/foundation/array';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times, timesParallel } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { SHA256Trunc, Secp256k1Signer, sha256ToField } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { hexToBuffer } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { OutboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { StandardTree } from '@aztec/merkle-tree';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { buildBlockWithCleanDB } from '@aztec/prover-client/block-factory';
import { SequencerPublisher, SignalType } from '@aztec/sequencer-client';
import { type CommitteeAttestation, type L2Tips, PublishedL2Block } from '@aztec/stdlib/block';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { orderAttestations } from '@aztec/stdlib/p2p';
import { fr, makeBloatedProcessedTx, makeBlockAttestationFromBlock } from '@aztec/stdlib/testing';
import type { BlockHeader, ProcessedTx } from '@aztec/stdlib/tx';
import {
  type MerkleTreeAdminDatabase,
  NativeWorldStateService,
  ServerWorldStateSynchronizer,
  type WorldStateConfig,
} from '@aztec/world-state';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Anvil } from '@viem/anvil';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type Address,
  type GetContractReturnType,
  encodeFunctionData,
  getAbiItem,
  getAddress,
  getContract,
  multicall3Abi,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { setupL1Contracts } from '../fixtures/utils.js';
import { writeJson } from './write_json.js';

// To update the test data, run "export AZTEC_GENERATE_TEST_DATA=1" in shell and run the tests again
// If you have issues with RPC_URL, it is likely that you need to set the RPC_URL in the shell as well
// If running ANVIL locally, you can use ETHEREUM_HOSTS="http://0.0.0.0:8545"

// Accounts 4 and 5 of Anvil default startup with mnemonic: 'test test test test test test test test test test test junk'
const sequencerPK = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const deployerPK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

const logger = createLogger('integration_l1_publisher');

const config = getConfigEnvVars();

const numberOfConsecutiveBlocks = 2;

jest.setTimeout(1000000);

describe('L1Publisher integration', () => {
  let l1Client: ExtendedViemWalletClient;
  let l1ContractAddresses: L1ContractAddresses;
  let deployerAccount: PrivateKeyAccount;

  let rollupAddress: Address;
  let outboxAddress: Address;

  let rollup: RollupContract;
  let outbox: GetContractReturnType<typeof OutboxAbi, ExtendedViemWalletClient>;

  let publisher: SequencerPublisher;

  let builderDb: MerkleTreeAdminDatabase;

  // The header of the last block
  let prevHeader: BlockHeader;

  let baseFee: GasFees;

  let blockSource: MockProxy<ArchiveSource>;
  let blocks: L2Block[] = [];

  const chainId = createEthereumChain(config.l1RpcUrls, config.l1ChainId).chainInfo.id;

  let coinbase: EthAddress;
  let feeRecipient: AztecAddress;
  let version: number;
  let validators: Secp256k1Signer[];
  let committee: EthAddress[] | undefined;
  let proposer: EthAddress | undefined;

  let dateProvider: TestDateProvider;
  let ethCheatCodes: EthCheatCodesWithState;
  let rollupCheatCodes: RollupCheatCodes;
  let worldStateSynchronizer: ServerWorldStateSynchronizer;
  let epochCache: EpochCache;

  let rpcUrl: string;
  let anvil: Anvil;

  const progressTimeBySlot = async (slotsToJump = 1n) => {
    const currentTime = (await l1Client.getBlock()).timestamp;
    const currentSlot = await rollup.getSlotNumber();
    const timestamp = await rollup.getTimestampForSlot(currentSlot + slotsToJump);
    if (timestamp > currentTime) {
      await ethCheatCodes.warp(Number(timestamp), { resetBlockInterval: true, updateDateProvider: dateProvider });
    }
  };

  const setup = async (deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {}) => {
    ({ rpcUrl, anvil } = await startAnvil());
    config.l1RpcUrls = [rpcUrl];

    deployerAccount = privateKeyToAccount(deployerPK);
    ({ l1ContractAddresses, l1Client } = await setupL1Contracts(config.l1RpcUrls, deployerAccount, logger, {
      aztecTargetCommitteeSize: 0,
      ...deployL1ContractsArgs,
    }));

    ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls);

    rollupAddress = getAddress(l1ContractAddresses.rollupAddress.toString());
    outboxAddress = getAddress(l1ContractAddresses.outboxAddress.toString());

    rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, l1ContractAddresses);

    // Set up contract instances
    rollup = new RollupContract(l1Client, l1ContractAddresses.rollupAddress);
    outbox = getContract({
      address: outboxAddress,
      abi: OutboxAbi,
      client: l1Client,
    });

    dateProvider = new TestDateProvider();

    builderDb = await NativeWorldStateService.tmp(EthAddress.fromString(rollupAddress));
    blocks = [];
    blockSource = mock<ArchiveSource>({
      getBlocks(from, limit, _proven) {
        return Promise.resolve(blocks.slice(from - 1, from - 1 + limit));
      },
      getPublishedBlocks(from, limit, _proven) {
        return Promise.resolve(
          blocks.slice(from - 1, from - 1 + limit).map(block => ({
            attestations: [],
            block,
            // Use L2 block number and hash for faking the L1 info
            l1: {
              blockNumber: BigInt(block.number),
              blockHash: block.hash.toString(),
              timestamp: BigInt(block.number),
            },
          })),
        );
      },
      getL2Tips(): Promise<L2Tips> {
        const latestBlock = blocks.at(-1);
        const res = latestBlock
          ? { number: latestBlock.number, hash: latestBlock.hash.toString() }
          : { number: 0, hash: undefined };

        return Promise.resolve({
          latest: res,
          proven: res,
          finalized: res,
        } as L2Tips);
      },
    });

    const worldStateConfig: WorldStateConfig = {
      worldStateBlockCheckIntervalMS: 10000,
      worldStateProvenBlocksOnly: false,
      worldStateDbMapSizeKb: 10 * 1024 * 1024,
      worldStateBlockHistory: 0,
    };
    worldStateSynchronizer = new ServerWorldStateSynchronizer(builderDb, blockSource, worldStateConfig);
    await worldStateSynchronizer.start();

    const sequencerL1Client = createExtendedL1Client(config.l1RpcUrls, sequencerPK, foundry);
    const l1TxUtils = new L1TxUtilsWithBlobs(sequencerL1Client, logger, dateProvider, config);
    const rollupContract = new RollupContract(sequencerL1Client, l1ContractAddresses.rollupAddress.toString());
    const slashingProposerAddress = await rollupContract.getSlashingProposerAddress();
    const slashingProposerContract = new SlashingProposerContract(
      sequencerL1Client,
      slashingProposerAddress.toString(),
    );
    const governanceProposerContract = new GovernanceProposerContract(
      sequencerL1Client,
      l1ContractAddresses.governanceProposerAddress.toString(),
    );
    epochCache = await EpochCache.create(l1ContractAddresses.rollupAddress, config, { dateProvider });
    const blobSinkClient = createBlobSinkClient();

    publisher = new SequencerPublisher(
      {
        l1RpcUrls: config.l1RpcUrls,
        l1Contracts: l1ContractAddresses,
        publisherPrivateKey: new SecretValue(sequencerPK),
        l1PublishRetryIntervalMS: 100,
        l1ChainId: chainId,
        viemPollingIntervalMS: 100,
        ethereumSlotDuration: config.ethereumSlotDuration,
        customForwarderContractAddress: EthAddress.ZERO,
      },
      {
        blobSinkClient,
        l1TxUtils,
        rollupContract,
        epochCache,
        governanceProposerContract,
        slashingProposerContract,
        dateProvider,
      },
    );

    coinbase = config.coinbase || EthAddress.random();
    feeRecipient = config.feeRecipient || (await AztecAddress.random());
    version = Number(await rollup.getVersion());

    const fork = await worldStateSynchronizer.fork();

    prevHeader = fork.getInitialHeader();
    await fork.close();

    const ts = (await l1Client.getBlock()).timestamp;
    baseFee = new GasFees(0, await rollup.getManaBaseFeeAt(ts, true));

    // We jump two epochs such that the committee can be setup.
    await rollupCheatCodes.advanceToEpoch(2n, { updateDateProvider: dateProvider });
    await rollupCheatCodes.setupEpoch();

    ({ committee } = await epochCache.getCommittee());
    ({ currentProposer: proposer } = await epochCache.getProposerAttesterAddressInCurrentOrNextSlot());
  };

  afterEach(async () => {
    await anvil.stop();
    await worldStateSynchronizer.stop();
  });

  const makeProcessedTx = (seed = 0x1): Promise<ProcessedTx> =>
    makeBloatedProcessedTx({
      header: prevHeader,
      chainId: fr(chainId),
      version: fr(version),
      vkTreeRoot: getVKTreeRoot(),
      gasSettings: GasSettings.default({ maxFeesPerGas: baseFee }),
      protocolContractTreeRoot,
      seed,
    });

  const sendToL2 = (content: Fr, recipient: AztecAddress): Promise<Fr> =>
    sendL1ToL2Message({ content, secretHash: Fr.ZERO, recipient }, { l1Client, l1ContractAddresses }).then(
      ({ msgHash }) => msgHash,
    );

  const buildBlock = async (globalVariables: GlobalVariables, txs: ProcessedTx[], l1ToL2Messages: Fr[]) => {
    await worldStateSynchronizer.syncImmediate();
    const tempFork = await worldStateSynchronizer.fork(globalVariables.blockNumber - 1);
    const block = await buildBlockWithCleanDB(txs, globalVariables, l1ToL2Messages, tempFork);
    await tempFork.close();
    return block;
  };

  const buildSingleBlock = async (opts: { l1ToL2Messages?: Fr[]; blockNumber?: number } = {}) => {
    const l1ToL2Messages = opts.l1ToL2Messages ?? new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.ZERO);

    const txs = await Promise.all([makeProcessedTx(0x1000), makeProcessedTx(0x2000)]);
    const ts = (await l1Client.getBlock()).timestamp;
    const slot = await rollup.getSlotAt(ts + BigInt(config.ethereumSlotDuration));
    const timestamp = await rollup.getTimestampForSlot(slot);
    const globalVariables = new GlobalVariables(
      new Fr(chainId),
      new Fr(version),
      opts.blockNumber ?? 1,
      new Fr(slot),
      timestamp,
      coinbase,
      feeRecipient,
      new GasFees(0, await rollup.getManaBaseFeeAt(timestamp, true)),
    );
    const block = await buildBlock(globalVariables, txs, l1ToL2Messages);
    blockSource.getL1ToL2Messages.mockResolvedValueOnce(l1ToL2Messages);
    return block;
  };

  describe('block building', () => {
    beforeEach(async () => {
      await setup();
    });

    const buildL2ToL1MsgTreeRoot = (l2ToL1MsgsArray: Fr[]) => {
      const treeHeight = Math.ceil(Math.log2(l2ToL1MsgsArray.length));
      const tree = new StandardTree(
        openTmpStore(true),
        new SHA256Trunc(),
        'temp_outhash_sibling_path',
        treeHeight,
        0n,
        Fr,
      );
      tree.appendLeaves(l2ToL1MsgsArray);
      return new Fr(tree.getRoot(true));
    };

    const buildAndPublishBlock = async (numTxs: number, jsonFileNamePrefix: string) => {
      const archiveInRollup_ = await rollup.archive();
      expect(hexToBuffer(archiveInRollup_.toString())).toEqual(new Fr(GENESIS_ARCHIVE_ROOT).toBuffer());

      const blockNumber = await l1Client.getBlockNumber();

      // random recipient address, just kept consistent for easy testing ts/sol.
      const recipientAddress = AztecAddress.fromString(
        '0x1647b194c649f5dd01d7c832f89b0f496043c9150797923ea89e93d5ac619a93',
      );

      let currentL1ToL2Messages: Fr[] = [];
      let nextL1ToL2Messages: Fr[] = [];
      const allBlobs: Blob[] = [];
      // The below batched blob is used for testing different epochs with 1..numberOfConsecutiveBlocks blocks on L1.
      // For real usage, always collect ALL epoch blobs first then call .batch().
      let currentBatch: BatchedBlob | undefined;

      for (let i = 0; i < numberOfConsecutiveBlocks; i++) {
        const l1ToL2Content = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 128 * i + 1 + 0x400).map(fr);

        for (let j = 0; j < l1ToL2Content.length; j++) {
          nextL1ToL2Messages.push(await sendToL2(l1ToL2Content[j], recipientAddress));
        }

        // Ensure that each transaction has unique (non-intersecting nullifier values)
        const totalNullifiersPerBlock = 4 * MAX_NULLIFIERS_PER_TX;
        const txs = await timesParallel(numTxs, txIndex =>
          makeProcessedTx(totalNullifiersPerBlock * i + MAX_NULLIFIERS_PER_TX * (txIndex + 1)),
        );

        const ts = (await l1Client.getBlock()).timestamp;
        const slot = await rollup.getSlotAt(ts + BigInt(config.ethereumSlotDuration));
        const timestamp = await rollup.getTimestampForSlot(slot);

        const globalVariables = new GlobalVariables(
          new Fr(chainId),
          new Fr(version),
          i + 1, // block number
          new Fr(slot),
          timestamp,
          coinbase,
          feeRecipient,
          new GasFees(0, await rollup.getManaBaseFeeAt(timestamp, true)),
        );

        const block = await buildBlock(globalVariables, txs, currentL1ToL2Messages);
        const totalManaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.totalGas.l2Gas)), Fr.ZERO);
        expect(totalManaUsed.toBigInt()).toEqual(block.header.totalManaUsed.toBigInt());

        prevHeader = block.header;
        blockSource.getL1ToL2Messages.mockResolvedValueOnce(currentL1ToL2Messages);

        const l2ToL1MsgsArray = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);

        const emptyRoot = await outbox.read.getRootData([BigInt(block.header.globalVariables.blockNumber)]);

        // Check that we have not yet written a root to this blocknumber
        expect(BigInt(emptyRoot)).toStrictEqual(0n);

        const blockBlobs = await Blob.getBlobsPerBlock(block.body.toBlobFields());
        expect(block.header.contentCommitment.blobsHash).toEqual(
          sha256ToField(blockBlobs.map(b => b.getEthVersionedBlobHash())),
        );

        let prevBlobAccumulatorHash = hexToBuffer(await rollup.getCurrentBlobCommitmentsHash());

        blocks.push(block);
        allBlobs.push(...blockBlobs);

        // Batch the blobs so far, so they can be used in the L1 unit tests:
        currentBatch = await BatchedBlob.batch(allBlobs);

        await writeJson(
          `${jsonFileNamePrefix}_${block.number}`,
          block,
          l1ToL2Content,
          blockBlobs,
          currentBatch,
          recipientAddress,
          deployerAccount.address,
        );

        await publisher.enqueueProposeL2Block(block);
        await publisher.sendRequests();

        const logs = await l1Client.getLogs({
          address: rollupAddress,
          event: getAbiItem({
            abi: RollupAbi,
            name: 'L2BlockProposed',
          }),
          fromBlock: blockNumber + 1n,
        });
        expect(logs).toHaveLength(i + 1);
        expect(logs[i].args.blockNumber).toEqual(BigInt(i + 1));
        const thisBlockNumber = BigInt(block.header.globalVariables.blockNumber);
        const isFirstBlockOfEpoch =
          thisBlockNumber == 1n ||
          (await rollup.getEpochNumber(thisBlockNumber)) > (await rollup.getEpochNumber(thisBlockNumber - 1n));
        // If we are at the first blob of the epoch, we must initialise the hash:
        prevBlobAccumulatorHash = isFirstBlockOfEpoch ? Buffer.alloc(0) : prevBlobAccumulatorHash;
        const currentBlobAccumulatorHash = hexToBuffer(await rollup.getCurrentBlobCommitmentsHash());
        let expectedBlobAccumulatorHash = prevBlobAccumulatorHash;
        blockBlobs
          .map(b => b.commitment)
          .forEach(c => {
            expectedBlobAccumulatorHash = sha256ToField([expectedBlobAccumulatorHash, c]).toBuffer();
          });
        expect(currentBlobAccumulatorHash).toEqual(expectedBlobAccumulatorHash);

        const ethTx = await l1Client.getTransaction({
          hash: logs[i].transactionHash!,
        });
        const expectedRollupData = encodeFunctionData({
          abi: RollupAbi,
          functionName: 'propose',
          args: [
            {
              header: block.header.toPropose().toViem(),
              archive: `0x${block.archive.root.toBuffer().toString('hex')}`,
              stateReference: block.header.state.toViem(),
              oracleInput: {
                feeAssetPriceModifier: 0n,
              },
            },
            RollupContract.packAttestations([]),
            [],
            Blob.getPrefixedEthBlobCommitments(blockBlobs),
          ],
        });
        const expectedData = encodeFunctionData({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          args: [
            [
              {
                target: rollupAddress,
                callData: expectedRollupData,
                allowFailure: false,
              },
            ],
          ],
        });
        expect(ethTx.input).toEqual(expectedData);

        const expectedRoot = !numTxs ? Fr.ZERO : buildL2ToL1MsgTreeRoot(l2ToL1MsgsArray);
        const returnedRoot = await outbox.read.getRootData([BigInt(block.header.globalVariables.blockNumber)]);

        // check that values are inserted into the outbox
        expect(Fr.ZERO.toString()).toEqual(returnedRoot);

        const actualRoot = await ethCheatCodes.load(
          EthAddress.fromString(outbox.address),
          ethCheatCodes.keccak256(0n, 1n + BigInt(i)),
        );
        expect(expectedRoot).toEqual(new Fr(actualRoot));

        // There is a 1 block lag between before messages get consumed from the inbox
        currentL1ToL2Messages = nextL1ToL2Messages;
        // We wipe the messages from previous iteration
        nextL1ToL2Messages = [];

        // Make sure that time have progressed to the next slot!
        await progressTimeBySlot();
      }
    };

    it.each([
      [0, 'empty_block'],
      [1, 'single_tx_block'],
      [4, 'mixed_block'],
    ])(
      `builds ${numberOfConsecutiveBlocks} blocks of %i bloated txs building on each other`,
      async (numTxs: number, jsonFileNamePrefix: string) => {
        await buildAndPublishBlock(numTxs, jsonFileNamePrefix);
      },
    );
  });

  describe('with attestations', () => {
    beforeEach(async () => {
      validators = [new Secp256k1Signer(Buffer32.fromString(sequencerPK)), ...times(2, Secp256k1Signer.random)];
      await setup({
        aztecTargetCommitteeSize: 3,
        initialValidators: validators
          .map(v => v.address)
          .map(address => ({
            attester: address,
            withdrawer: address,
            bn254SecretKey: Fr.random().toBigInt(),
          })),
      });
    });

    const expectPublishBlock = async (block: L2Block, attestations: CommitteeAttestation[]) => {
      await publisher.enqueueProposeL2Block(block, attestations);
      const result = await publisher.sendRequests();
      expect(result!.successfulActions).toEqual(['propose']);
      expect(result!.failedActions).toEqual([]);
    };

    it('publishes a block with attestations', async () => {
      const block = await buildSingleBlock();

      const blockAttestations = validators.map(v => makeBlockAttestationFromBlock(block, v));
      const attestations = orderAttestations(blockAttestations, committee!);

      const canPropose = await publisher.canProposeAtNextEthBlock(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateBlockHeader(block.header.toPropose());

      await expectPublishBlock(block, attestations);
    });

    it('fails to publish a block without the proposer attestation', async () => {
      const block = await buildSingleBlock();
      const blockAttestations = validators.map(v => makeBlockAttestationFromBlock(block, v));

      // Reverse attestations to break proposer attestation
      const attestations = orderAttestations(blockAttestations, committee!).reverse();

      const canPropose = await publisher.canProposeAtNextEthBlock(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateBlockHeader(block.header.toPropose());

      await expect(publisher.enqueueProposeL2Block(block, attestations)).rejects.toThrow(
        /ValidatorSelection__InvalidCommitteeCommitment/,
      );
    });

    it('publishes a block invalidating the previous one', async () => {
      const badBlock = await buildSingleBlock();

      // Publish the first invalid block
      const badBlockAttestations = validators
        .filter(v => v.address.equals(proposer!))
        .map(v => makeBlockAttestationFromBlock(badBlock, v));
      const badAttestations = orderAttestations(badBlockAttestations, committee!);

      await expectPublishBlock(badBlock, badAttestations);
      await progressTimeBySlot();

      logger.warn(`Published bad block ${badBlock.number} with archive root ${badBlock.archive.root}`);

      // Update the current proposer
      ({ currentProposer: proposer } = await epochCache.getProposerAttesterAddressInCurrentOrNextSlot());

      // Prepare for invalidating the previous one and publish the same block with proper attestations
      const block = await buildSingleBlock({ blockNumber: 1 });
      expect(block.number).toEqual(badBlock.number);
      const blockAttestations = validators.map(v => makeBlockAttestationFromBlock(block, v));
      const attestations = orderAttestations(blockAttestations, committee!);

      // Check we can invalidate the block
      logger.warn('Checking simulate invalidate block');
      const invalidateRequest = await publisher.simulateInvalidateBlock({
        valid: false,
        committee: committee!,
        block: new PublishedL2Block(block, {} as L1PublishedData, badAttestations),
        attestations: badBlockAttestations,
        epoch: 1n,
        seed: 1n,
        reason: 'insufficient-attestations',
      });
      expect(invalidateRequest).toBeDefined();
      const forcePendingBlockNumber = invalidateRequest?.forcePendingBlockNumber;
      expect(forcePendingBlockNumber).toEqual(0);

      // We cannot propose directly, we need to assume the previous block is invalidated
      const genesis = new Fr(GENESIS_ARCHIVE_ROOT);
      logger.warn(`Checking can propose at next eth block on top of genesis ${genesis}`);
      expect(await publisher.canProposeAtNextEthBlock(genesis, proposer!)).toBeUndefined();
      const canPropose = await publisher.canProposeAtNextEthBlock(genesis, proposer!, { forcePendingBlockNumber });
      expect(canPropose?.slot).toEqual(block.header.getSlot());

      // Same for validation
      logger.warn('Checking validate block header');
      await expect(publisher.validateBlockHeader(block.header.toPropose())).rejects.toThrow(/Rollup__InvalidArchive/);
      await publisher.validateBlockHeader(block.header.toPropose(), { forcePendingBlockNumber });

      // Invalidate and propose
      logger.warn('Enqueuing requests to invalidate and propose the block');
      publisher.enqueueInvalidateBlock(invalidateRequest);
      await publisher.enqueueProposeL2Block(block, attestations, undefined, { forcePendingBlockNumber });
      const result = await publisher.sendRequests();
      expect(result!.successfulActions).toEqual(['invalidate-by-insufficient-attestations', 'propose']);
      expect(result!.failedActions).toEqual([]);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await setup();
    });

    it(`succeeds proposing new block when vote fails`, async () => {
      const block = await buildSingleBlock();
      publisher.registerSlashPayloadGetter(() => Promise.resolve(EthAddress.random()));

      await publisher.enqueueProposeL2Block(block);
      await publisher.enqueueCastSignal(
        block.header.getSlot(),
        block.header.globalVariables.timestamp,
        SignalType.SLASHING,
        EthAddress.random(),
        _payload => Promise.resolve(Signature.random().toString()),
      );

      const result = await publisher.sendRequests();

      expect(result!.successfulActions).toEqual(['propose']);
      expect(result!.failedActions).toEqual(['slashing-signal']);
    });

    it(`shows propose custom errors if tx simulation fails`, async () => {
      // Set up different l1-to-l2 messages than the ones on the inbox, so this submission reverts
      // because the INBOX.consume does not match the header.contentCommitment.inHash and we get
      // a Rollup__BlobHash that is not caught by validateHeader before.
      const l1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(1n));
      const block = await buildSingleBlock({ l1ToL2Messages });

      // Expect the simulation to fail
      const loggerErrorSpy = jest.spyOn((publisher as any).log, 'error');
      await expect(publisher.enqueueProposeL2Block(block)).rejects.toThrow(/Rollup__InvalidInHash/);
      expect(loggerErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching('Rollup__InvalidInHash'),
        expect.anything(),
        expect.objectContaining({ blockNumber: 1 }),
      );
    });
  });
});
