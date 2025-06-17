import type { ArchiveSource } from '@aztec/archiver';
import { getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress, Fr, GlobalVariables, type L2Block, createLogger } from '@aztec/aztec.js';
import { BatchedBlob, Blob } from '@aztec/blob-lib';
import { GENESIS_ARCHIVE_ROOT, MAX_NULLIFIERS_PER_TX, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import {
  type ExtendedViemWalletClient,
  GovernanceProposerContract,
  type L1ContractAddresses,
  RollupContract,
  SlashingProposerContract,
  createEthereumChain,
  createExtendedL1Client,
} from '@aztec/ethereum';
import { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { range } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { SHA256Trunc, sha256ToField } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestDateProvider } from '@aztec/foundation/timer';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { ForwarderAbi, OutboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { StandardTree } from '@aztec/merkle-tree';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { buildBlockWithCleanDB } from '@aztec/prover-client/block-factory';
import { SequencerPublisher } from '@aztec/sequencer-client';
import type { L2Tips } from '@aztec/stdlib/block';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { fr, makeBloatedProcessedTx } from '@aztec/stdlib/testing';
import type { BlockHeader, ProcessedTx } from '@aztec/stdlib/tx';
import {
  type MerkleTreeAdminDatabase,
  NativeWorldStateService,
  ServerWorldStateSynchronizer,
  type WorldStateConfig,
} from '@aztec/world-state';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { writeFile } from 'fs/promises';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type Address,
  type GetContractReturnType,
  encodeFunctionData,
  getAbiItem,
  getAddress,
  getContract,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { createForwarderContract, setupL1Contracts } from '../fixtures/utils.js';

// Accounts 4 and 5 of Anvil default startup with mnemonic: 'test test test test test test test test test test test junk'
const sequencerPK = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const deployerPK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

const logger = createLogger('integration_l1_publisher');

const config = getConfigEnvVars();
config.l1RpcUrls = config.l1RpcUrls || ['http://127.0.0.1:8545'];

const numberOfConsecutiveBlocks = 2;

const BLOB_SINK_PORT = 5052;
const BLOB_SINK_URL = `http://localhost:${BLOB_SINK_PORT}`;

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

  let ethCheatCodes: EthCheatCodesWithState;
  let worldStateSynchronizer: ServerWorldStateSynchronizer;

  // To update the test data, run "export AZTEC_GENERATE_TEST_DATA=1" in shell and run the tests again
  // If you have issues with RPC_URL, it is likely that you need to set the RPC_URL in the shell as well
  // If running ANVIL locally, you can use ETHEREUM_HOSTS="http://0.0.0.0:8545"
  const AZTEC_GENERATE_TEST_DATA = !!process.env.AZTEC_GENERATE_TEST_DATA;

  const progressTimeBySlot = async (slotsToJump = 1n) => {
    const currentTime = (await l1Client.getBlock()).timestamp;
    const currentSlot = await rollup.getSlotNumber();
    const timestamp = await rollup.getTimestampForSlot(currentSlot + slotsToJump);
    if (timestamp > currentTime) {
      await ethCheatCodes.warp(Number(timestamp));
    }
  };

  beforeEach(async () => {
    deployerAccount = privateKeyToAccount(deployerPK);
    ({ l1ContractAddresses, l1Client } = await setupL1Contracts(config.l1RpcUrls, deployerAccount, logger, {
      aztecTargetCommitteeSize: 0,
    }));

    ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls);

    rollupAddress = getAddress(l1ContractAddresses.rollupAddress.toString());
    outboxAddress = getAddress(l1ContractAddresses.outboxAddress.toString());

    // Set up contract instances
    rollup = new RollupContract(l1Client, l1ContractAddresses.rollupAddress);
    outbox = getContract({
      address: outboxAddress,
      abi: OutboxAbi,
      client: l1Client,
    });

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
    const l1TxUtils = new L1TxUtilsWithBlobs(sequencerL1Client, logger, config);
    const rollupContract = new RollupContract(sequencerL1Client, l1ContractAddresses.rollupAddress.toString());
    const forwarderContract = await createForwarderContract(
      config,
      sequencerPK,
      l1ContractAddresses.rollupAddress.toString(),
    );
    const slashingProposerAddress = await rollupContract.getSlashingProposerAddress();
    const slashingProposerContract = new SlashingProposerContract(
      sequencerL1Client,
      slashingProposerAddress.toString(),
    );
    const governanceProposerContract = new GovernanceProposerContract(
      sequencerL1Client,
      l1ContractAddresses.governanceProposerAddress.toString(),
    );
    const epochCache = await EpochCache.create(l1ContractAddresses.rollupAddress, config, {
      dateProvider: new TestDateProvider(),
    });
    publisher = new SequencerPublisher(
      {
        l1RpcUrls: config.l1RpcUrls,
        l1Contracts: l1ContractAddresses,
        publisherPrivateKey: new SecretValue(sequencerPK),
        l1PublishRetryIntervalMS: 100,
        l1ChainId: 31337,
        viemPollingIntervalMS: 100,
        ethereumSlotDuration: config.ethereumSlotDuration,
        blobSinkUrl: BLOB_SINK_URL,
        customForwarderContractAddress: EthAddress.ZERO,
      },
      {
        l1TxUtils,
        rollupContract,
        forwarderContract,
        epochCache,
        governanceProposerContract,
        slashingProposerContract,
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
    const timeToJump = (await rollup.getEpochDuration()) * 2n;
    await progressTimeBySlot(timeToJump);
  });

  afterEach(async () => {
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

  /**
   * Creates a json object that can be used to test the solidity contract.
   * The json object must be put into
   */
  const writeJson = async (
    fileName: string,
    block: L2Block,
    l1ToL2Content: Fr[],
    blobs: Blob[],
    batchedBlob: BatchedBlob,
    recipientAddress: AztecAddress,
    deployerAddress: `0x${string}`,
  ): Promise<void> => {
    if (!AZTEC_GENERATE_TEST_DATA) {
      return;
    }
    // Path relative to the package.json in the end-to-end folder
    const path = `../../l1-contracts/test/fixtures/${fileName}.json`;

    const asHex = (value: Fr | Buffer | EthAddress | AztecAddress, size = 64) => {
      const buffer = Buffer.isBuffer(value) ? value : value.toBuffer();
      return `0x${buffer.toString('hex').padStart(size, '0')}`;
    };

    const jsonObject = {
      populate: {
        l1ToL2Content: l1ToL2Content.map(asHex),
        recipient: asHex(recipientAddress.toField()),
        sender: deployerAddress,
      },
      messages: {
        l2ToL1Messages: block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs).map(asHex),
      },
      block: {
        // The json formatting in forge is a bit brittle, so we convert Fr to a number in the few values below.
        // This should not be a problem for testing as long as the values are not larger than u32.
        archive: asHex(block.archive.root),
        blobCommitments: Blob.getPrefixedEthBlobCommitments(blobs),
        batchedBlobInputs: batchedBlob.getEthBlobEvaluationInputs(),
        blockNumber: block.number,
        body: `0x${block.body.toBuffer().toString('hex')}`,
        header: {
          lastArchiveRoot: asHex(block.header.lastArchive.root),
          contentCommitment: {
            blobsHash: asHex(block.header.contentCommitment.blobsHash),
            inHash: asHex(block.header.contentCommitment.inHash),
            outHash: asHex(block.header.contentCommitment.outHash),
          },
          slotNumber: Number(block.header.globalVariables.slotNumber),
          timestamp: Number(block.header.globalVariables.timestamp),
          coinbase: asHex(block.header.globalVariables.coinbase, 40),
          feeRecipient: asHex(block.header.globalVariables.feeRecipient),
          gasFees: {
            feePerDaGas: Number(block.header.globalVariables.gasFees.feePerDaGas),
            feePerL2Gas: Number(block.header.globalVariables.gasFees.feePerL2Gas),
          },
          totalManaUsed: block.header.totalManaUsed.toNumber(),
        },
        headerHash: asHex(block.header.toPropose().hash()),
        numTxs: block.body.txEffects.length,
      },
    };

    const output = JSON.stringify(jsonObject, null, 2);
    await writeFile(path, output, 'utf8');
  };

  const buildBlock = async (globalVariables: GlobalVariables, txs: ProcessedTx[], l1ToL2Messages: Fr[]) => {
    await worldStateSynchronizer.syncImmediate();
    const tempFork = await worldStateSynchronizer.fork();
    const block = await buildBlockWithCleanDB(txs, globalVariables, l1ToL2Messages, tempFork);
    await tempFork.close();
    return block;
  };

  describe('block building', () => {
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
      expect(hexStringToBuffer(archiveInRollup_.toString())).toEqual(new Fr(GENESIS_ARCHIVE_ROOT).toBuffer());

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

        let prevBlobAccumulatorHash = hexStringToBuffer(await rollup.getCurrentBlobCommitmentsHash());

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
        const currentBlobAccumulatorHash = hexStringToBuffer(await rollup.getCurrentBlobCommitmentsHash());
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
              txHashes: [],
            },
            [],
            Blob.getPrefixedEthBlobCommitments(blockBlobs),
          ],
        });
        const expectedData = encodeFunctionData({
          abi: ForwarderAbi,
          functionName: 'forward',
          args: [[rollupAddress], [expectedRollupData]],
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

  describe('error handling', () => {
    let loggerErrorSpy: ReturnType<(typeof jest)['spyOn']>;

    it.skip(`shows propose custom errors if tx reverts`, async () => {
      // REFACTOR: code below is duplicated from "builds blocks of 2 empty txs building on each other"
      const archiveInRollup_ = await rollup.archive();
      expect(hexStringToBuffer(archiveInRollup_.toString())).toEqual(new Fr(GENESIS_ARCHIVE_ROOT).toBuffer());

      // Set up different l1-to-l2 messages than the ones on the inbox, so this submission reverts
      // because the INBOX.consume does not match the header.contentCommitment.inHash and we get
      // a Rollup__BlobHash that is not caught by validateHeader before.
      const l1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(1n));

      const txs = await Promise.all([makeProcessedTx(0x1000), makeProcessedTx(0x2000)]);
      const ts = (await l1Client.getBlock()).timestamp;
      const slot = await rollup.getSlotAt(ts + BigInt(config.ethereumSlotDuration));
      const timestamp = await rollup.getTimestampForSlot(slot);
      const globalVariables = new GlobalVariables(
        new Fr(chainId),
        new Fr(version),
        1, // block number
        new Fr(slot),
        timestamp,
        coinbase,
        feeRecipient,
        new GasFees(0, await rollup.getManaBaseFeeAt(timestamp, true)),
      );
      const block = await buildBlock(globalVariables, txs, l1ToL2Messages);
      prevHeader = block.header;
      blockSource.getL1ToL2Messages.mockResolvedValueOnce(l1ToL2Messages);

      // Inspect logger
      loggerErrorSpy = jest.spyOn((publisher as any).log, 'error');

      // Expect the tx to revert
      expect(await publisher.enqueueProposeL2Block(block)).toEqual(true);

      await expect(publisher.sendRequests()).resolves.toMatchObject({
        errorMsg: expect.stringContaining('Rollup__InvalidInHash'),
      });

      // Test for both calls
      // NOTE: First error is from the simulate fn, which isn't supported by anvil
      expect(loggerErrorSpy).toHaveBeenCalledTimes(3);

      expect(loggerErrorSpy).toHaveBeenNthCalledWith(
        1,
        'Forwarder transaction failed',
        undefined,
        expect.objectContaining({
          receipt: expect.objectContaining({
            type: 'eip4844',
            blockHash: expect.any(String),
            blockNumber: expect.any(BigInt),
            transactionHash: expect.any(String),
          }),
        }),
      );
      expect(loggerErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('Bundled [propose] transaction [failed]'),
      );

      expect(loggerErrorSpy).toHaveBeenNthCalledWith(
        3,
        expect.stringMatching(
          /^Rollup process tx reverted\. The contract function "forward" reverted\. Error: Rollup__InvalidInHash/i,
        ),
        undefined,
        expect.objectContaining({
          blockNumber: expect.any(Number),
          slotNumber: expect.any(BigInt),
          txHash: expect.any(String),
          txCount: expect.any(Number),
          blockTimestamp: expect.any(Number),
        }),
      );
    });
  });
});

/**
 * Converts a hex string into a buffer. String may be 0x-prefixed or not.
 */
function hexStringToBuffer(hex: string): Buffer {
  if (!/^(0x)?[a-fA-F0-9]+$/.test(hex)) {
    throw new Error(`Invalid format for hex string: "${hex}"`);
  }
  if (hex.length % 2 === 1) {
    throw new Error(`Invalid length for hex string: "${hex}"`);
  }
  return Buffer.from(hex.replace(/^0x/, ''), 'hex');
}
