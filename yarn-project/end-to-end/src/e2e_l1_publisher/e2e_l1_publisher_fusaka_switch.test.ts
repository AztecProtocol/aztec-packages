import type { ArchiveSource } from '@aztec/archiver';
import { type AztecNodeConfig, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { L2Block } from '@aztec/aztec.js/block';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { GlobalVariables } from '@aztec/aztec.js/tx';
import { getBlobsPerL1Block } from '@aztec/blob-lib';
import { createBlobSinkClient } from '@aztec/blob-sink/client';
import { MAX_NULLIFIERS_PER_TX, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP } from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import {
  type DeployL1ContractsArgs,
  type ExtendedViemWalletClient,
  GovernanceProposerContract,
  type L1ContractAddresses,
  RollupContract,
  type ViemClient,
  createEthereumChain,
  createExtendedL1Client,
} from '@aztec/ethereum';
import { L1TxUtilsWithBlobs, createL1TxUtilsWithBlobsFromViemWallet } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthCheatCodesWithState, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import { range } from '@aztec/foundation/array';
import { timesParallel } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { sha256ToField } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { TestDateProvider } from '@aztec/foundation/timer';
import { OutboxAbi } from '@aztec/l1-artifacts';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList } from '@aztec/protocol-contracts';
import { buildBlockWithCleanDB } from '@aztec/prover-client/block-factory';
import { SequencerPublisher, SequencerPublisherMetrics } from '@aztec/sequencer-client';
import { CommitteeAttestationsAndSigners, type L2Tips, PublishedL2Block, Signature } from '@aztec/stdlib/block';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import { fr, mockProcessedTx } from '@aztec/stdlib/testing';
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
  type Hex,
  type TransactionSerializableEIP4844,
  type TransactionSerialized,
  getAddress,
  getContract,
  parseTransaction,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { mainnet } from 'viem/chains';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { setupL1Contracts } from '../fixtures/utils.js';

const chain = mainnet;
export const FUSAKA_ACTIVATION_MAINNET_TIMESTAMP = 1764798551;

// This is a temporary test, largely copied from e2e_l1_publisher.test.ts to verify that we send the correct blob transactions
// before and after the fusaka activation time.
const sequencerPK = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const deployerPK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

const logger = createLogger('integration_l1_publisher');

const config: AztecNodeConfig = { ...getConfigEnvVars(), checkIntervalMs: 100, stallTimeMs: 6_000 };

beforeAll(() => {
  jest.setTimeout(1000000);
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'setInterval'] });
});

afterAll(() => {
  jest.useRealTimers();
});

describe('L1Publisher integration', () => {
  let l1Client: ExtendedViemWalletClient;
  let l1ContractAddresses: L1ContractAddresses;
  let deployerAccount: PrivateKeyAccount;

  let governanceProposerContract: GovernanceProposerContract;

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
  let committee: EthAddress[] | undefined;
  let proposer: EthAddress | undefined;

  let dateProvider: TestDateProvider;
  let ethCheatCodes: EthCheatCodesWithState;
  let rollupCheatCodes: RollupCheatCodes;
  let worldStateSynchronizer: ServerWorldStateSynchronizer;
  let epochCache: EpochCache;

  let rpcUrl: string;
  let anvil: Anvil;
  let l1TxUtils: L1TxUtilsWithBlobs;

  const setup = async (deployL1ContractsArgs: Partial<DeployL1ContractsArgs> = {}) => {
    ({ rpcUrl, anvil } = await startAnvil({ chainId: chain.id }));
    config.l1RpcUrls = [rpcUrl];

    deployerAccount = privateKeyToAccount(deployerPK);
    ({ l1ContractAddresses, l1Client } = await setupL1Contracts(
      config.l1RpcUrls,
      deployerAccount,
      logger,
      {
        aztecTargetCommitteeSize: 0,
        slasherFlavor: 'none',
        ...deployL1ContractsArgs,
      },
      chain,
    ));

    dateProvider = new TestDateProvider();
    ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls, dateProvider, logger, chain);

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

    builderDb = await NativeWorldStateService.tmp(EthAddress.fromString(rollupAddress));
    blocks = [];
    blockSource = mock<ArchiveSource>({
      getBlocks(from, limit, _proven) {
        return Promise.resolve(blocks.slice(from - 1, from - 1 + limit));
      },
      getPublishedBlocks(from, limit, _proven) {
        return Promise.resolve(
          blocks.slice(from - 1, from - 1 + limit).map(block =>
            PublishedL2Block.fromFields({
              attestations: [],
              block,
              // Use L2 block number and hash for faking the L1 info
              l1: {
                blockNumber: BigInt(block.number),
                blockHash: block.hash.toString(),
                timestamp: BigInt(block.number),
              },
            }),
          ),
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

    const sequencerL1Client = createExtendedL1Client(config.l1RpcUrls, sequencerPK, chain);
    l1TxUtils = createL1TxUtilsWithBlobsFromViemWallet(sequencerL1Client, { logger, dateProvider }, config);
    const rollupContract = new RollupContract(sequencerL1Client, l1ContractAddresses.rollupAddress.toString());
    const slashingProposerContract = await rollupContract.getSlashingProposer();
    governanceProposerContract = new GovernanceProposerContract(
      sequencerL1Client,
      l1ContractAddresses.governanceProposerAddress.toString(),
    );
    epochCache = await EpochCache.create(l1ContractAddresses.rollupAddress, config, { dateProvider });
    const blobSinkClient = createBlobSinkClient();
    const sequencerPublisherMetrics: MockProxy<SequencerPublisherMetrics> = mock<SequencerPublisherMetrics>();

    publisher = new SequencerPublisher(
      {
        l1RpcUrls: config.l1RpcUrls,
        l1Contracts: l1ContractAddresses,
        publisherPrivateKeys: [new SecretValue(sequencerPK)],
        l1ChainId: chainId,
        viemPollingIntervalMS: 100,
        ethereumSlotDuration: config.ethereumSlotDuration,
      },
      {
        blobSinkClient,
        l1TxUtils,
        rollupContract,
        epochCache,
        governanceProposerContract,
        slashingProposerContract,
        slashFactoryContract: undefined as unknown as SlashFactoryContract,
        dateProvider,
        metrics: sequencerPublisherMetrics,
        lastActions: {},
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
    await rollupCheatCodes.advanceToEpoch(BigInt(config.lagInEpochsForValidatorSet + 1));
    await rollupCheatCodes.setupEpoch();

    ({ committee } = await epochCache.getCommittee());
    ({ currentProposer: proposer } = await epochCache.getProposerAttesterAddressInCurrentOrNextSlot());
    logger.warn(`Current epoch committee and proposer`, { committee, proposer });
  };

  afterEach(async () => {
    await anvil.stop();
    await worldStateSynchronizer.stop();
    await builderDb.close();
    publisher.interrupt();
    // Clean up any mocks
    jest.restoreAllMocks();
  });

  const makeProcessedTx = (seed = 0x1): Promise<ProcessedTx> =>
    mockProcessedTx({
      anchorBlockHeader: prevHeader,
      chainId: fr(chainId),
      version: fr(version),
      vkTreeRoot: getVKTreeRoot(),
      gasSettings: GasSettings.default({ maxFeesPerGas: baseFee }),
      protocolContracts: ProtocolContractsList,
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

  describe('block building', () => {
    beforeEach(async () => {
      await setup();
    });

    const buildAndPublishBlock = async (numTxs: number, l2BlockNumber: number, warpToTime?: bigint) => {
      // random recipient address, just kept consistent for easy testing ts/sol.
      const recipientAddress = AztecAddress.fromString(
        '0x1647b194c649f5dd01d7c832f89b0f496043c9150797923ea89e93d5ac619a93',
      );

      const currentL1ToL2Messages: Fr[] = [];
      const nextL1ToL2Messages: Fr[] = [];
      const blobFieldsPerCheckpoint: Fr[][] = [];

      // With just one l1 client (serial sending) this takes too much time to send NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP
      // and causes a chain prune
      const l1ToL2Content = range(Math.min(16, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP), 1 + 0x400).map(fr);

      for (let j = 0; j < l1ToL2Content.length; j++) {
        nextL1ToL2Messages.push(await sendToL2(l1ToL2Content[j], recipientAddress));
      }

      // Ensure that each transaction has unique (non-intersecting nullifier values)
      const txs = await timesParallel(numTxs, txIndex => makeProcessedTx(MAX_NULLIFIERS_PER_TX * (txIndex + 1)));

      if (warpToTime !== undefined) {
        logger.info(`Warping to time ${warpToTime} before building block`);
        await ethCheatCodes.warp(warpToTime, { resetBlockInterval: true });
      }

      const ts = (await l1Client.getBlock()).timestamp;
      const slot = await rollup.getSlotAt(ts + BigInt(config.ethereumSlotDuration));
      const timestamp = await rollup.getTimestampForSlot(slot);

      const globalVariables = new GlobalVariables(
        new Fr(chainId),
        new Fr(version),
        l2BlockNumber, // block number
        new Fr(slot),
        timestamp,
        coinbase,
        feeRecipient,
        new GasFees(0, await rollup.getManaBaseFeeAt(timestamp, true)),
      );

      const block = await buildBlock(globalVariables, txs, currentL1ToL2Messages);
      const totalManaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.totalGas.l2Gas)), Fr.ZERO);
      expect(totalManaUsed.toBigInt()).toEqual(block.header.totalManaUsed.toBigInt());

      prevHeader = block.getBlockHeader();
      blockSource.getL1ToL2Messages.mockResolvedValueOnce(currentL1ToL2Messages);

      const emptyRoot = await outbox.read.getRootData([BigInt(block.header.globalVariables.blockNumber)]);

      // Check that we have not yet written a root to this blocknumber
      expect(BigInt(emptyRoot)).toStrictEqual(0n);

      const checkpointBlobFields = block.getCheckpointBlobFields();
      const blockBlobs = getBlobsPerL1Block(checkpointBlobFields);
      expect(block.header.contentCommitment.blobsHash).toEqual(
        sha256ToField(blockBlobs.map(b => b.getEthVersionedBlobHash())),
      );

      blocks.push(block);
      blobFieldsPerCheckpoint.push(checkpointBlobFields);

      await publisher.enqueueProposeL2Block(block, CommitteeAttestationsAndSigners.empty(), Signature.empty());
      await publisher.sendRequests();
    };

    const isFusakaTransaction = (tx: TransactionSerializableEIP4844) => {
      if (tx.blobVersion === '4844') {
        return false;
      } else if (tx.blobVersion === '7594') {
        return true;
      }
      const sidecars = tx.sidecars;
      if (sidecars === undefined || sidecars === false || sidecars.length === 0) {
        return false;
      }
      // break open the first blob
      const firstBlob = sidecars[0];
      const proof = firstBlob.proof;
      // Must be an array if after fusaka
      return Array.isArray(proof);
    };

    it('builds the correct block before fusaka', async () => {
      let isFusakaBlobTransaction: boolean | undefined = undefined;

      // NOTE: we only need to spy on a single client because all l1Utils use the same ViemClient instance
      const originalSendRawTransaction = l1TxUtils.client.sendRawTransaction;

      // auto-dispose of this spy at the end of this function
      using _ = jest.spyOn(l1TxUtils.client, 'sendRawTransaction').mockImplementation(async function (
        this: ViemClient,
        arg,
      ) {
        const serialisedTransaction = arg.serializedTransaction as TransactionSerialized<'eip1559' | 'eip4844'>;
        const transaction = parseTransaction(serialisedTransaction);

        isFusakaBlobTransaction = isFusakaTransaction(transaction as TransactionSerializableEIP4844);
        const txHash = await originalSendRawTransaction.call(this, arg);
        return txHash;
      });

      using _1 = jest.spyOn(l1TxUtils, 'simulate').mockImplementation(() => {
        return Promise.resolve({ gasUsed: 10_000_000n, result: '0x' as Hex });
      });

      const timestamp = FUSAKA_ACTIVATION_MAINNET_TIMESTAMP - config.aztecSlotDuration * 1.5;
      const fakeTime = BigInt(timestamp) * 1000n;
      jest.setSystemTime(Number(fakeTime));

      await buildAndPublishBlock(0, 1, BigInt(timestamp));
      expect(isFusakaBlobTransaction).toBeDefined();
      expect(isFusakaBlobTransaction).toBe(false);
    });

    it('builds the correct block after fusaka', async () => {
      let isFusakaBlobTransaction: boolean | undefined = undefined;

      // NOTE: we only need to spy on a single client because all l1Utils use the same ViemClient instance
      const originalSendRawTransaction = l1TxUtils.client.sendRawTransaction;

      // auto-dispose of this spy at the end of this function
      using _ = jest.spyOn(l1TxUtils.client, 'sendRawTransaction').mockImplementation(async function (
        this: ViemClient,
        arg,
      ) {
        const serialisedTransaction = arg.serializedTransaction as TransactionSerialized<'eip1559' | 'eip4844'>;
        const transaction = parseTransaction(serialisedTransaction);

        isFusakaBlobTransaction = isFusakaTransaction(transaction as TransactionSerializableEIP4844);
        const txHash = await originalSendRawTransaction.call(this, arg);
        return txHash;
      });

      using _1 = jest.spyOn(l1TxUtils, 'simulate').mockImplementation(() => {
        return Promise.resolve({ gasUsed: 10_000_000n, result: '0x' as Hex });
      });

      const timestamp = FUSAKA_ACTIVATION_MAINNET_TIMESTAMP + config.aztecSlotDuration;

      const fakeTime = BigInt(timestamp) * 1000n;
      jest.setSystemTime(Number(fakeTime));
      await buildAndPublishBlock(0, 1, BigInt(timestamp));
      expect(isFusakaBlobTransaction).toBeDefined();
      expect(isFusakaBlobTransaction).toBe(true);
    });
  });
});
