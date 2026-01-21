import type { ArchiverDataSource } from '@aztec/archiver';
import { type AztecNodeConfig, getConfigEnvVars } from '@aztec/aztec-node';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { GlobalVariables } from '@aztec/aztec.js/tx';
import { createBlobClient } from '@aztec/blob-client/client';
import {
  BatchedBlob,
  BatchedBlobAccumulator,
  getBlobsPerL1Block,
  getPrefixedEthBlobCommitments,
} from '@aztec/blob-lib';
import {
  GENESIS_ARCHIVE_ROOT,
  GENESIS_BLOCK_HEADER_HASH,
  MAX_NULLIFIERS_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import { createEthereumChain } from '@aztec/ethereum/chain';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { GovernanceProposerContract, RollupContract } from '@aztec/ethereum/contracts';
import { type DeployAztecL1ContractsArgs, deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import { TxUtilsState } from '@aztec/ethereum/l1-tx-utils';
import { createL1TxUtilsWithBlobsFromViemWallet } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { EthCheatCodesWithState, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { range } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times, timesParallel } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { Secp256k1Signer, flipSignature } from '@aztec/foundation/crypto/secp256k1-signer';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { EthAddress } from '@aztec/foundation/eth-address';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { hexToBuffer } from '@aztec/foundation/string';
import { TestDateProvider } from '@aztec/foundation/timer';
import { RollupAbi } from '@aztec/l1-artifacts';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractsList, protocolContractsHash } from '@aztec/protocol-contracts';
import { LightweightCheckpointBuilder } from '@aztec/prover-client/light';
import { SequencerPublisher, SequencerPublisherMetrics } from '@aztec/sequencer-client';
import {
  CheckpointedL2Block,
  type CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2Block,
  type L2Tips,
  Signature,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { type L1RollupConstants, getSlotStartBuildTimestamp } from '@aztec/stdlib/epoch-helpers';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import { SlashFactoryContract } from '@aztec/stdlib/l1-contracts';
import { orderAttestations } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  fr,
  makeAndSignCommitteeAttestationsAndSigners,
  makeCheckpointAttestationFromCheckpoint,
  mockProcessedTx,
} from '@aztec/stdlib/testing';
import type { BlockHeader, CheckpointGlobalVariables, ProcessedTx } from '@aztec/stdlib/tx';
import {
  type MerkleTreeAdminDatabase,
  NativeWorldStateService,
  ServerWorldStateSynchronizer,
  type WorldStateConfig,
} from '@aztec/world-state';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Anvil } from '@viem/anvil';
import { type MockProxy, mock } from 'jest-mock-extended';
import { type Address, encodeFunctionData, getAbiItem, getAddress, multicall3Abi } from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { writeJson } from './write_json.js';

// To update the test data, run "export AZTEC_GENERATE_TEST_DATA=1" in shell and run the tests again
// If you have issues with RPC_URL, it is likely that you need to set the RPC_URL in the shell as well
// If running ANVIL locally, you can use ETHEREUM_HOSTS="http://0.0.0.0:8545"

// Accounts 4 and 5 of Anvil default startup with mnemonic: 'test test test test test test test test test test test junk'
const sequencerPK = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const deployerPK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

const logger = createLogger('integration_l1_publisher');

const config: AztecNodeConfig = { ...getConfigEnvVars(), checkIntervalMs: 100, stallTimeMs: 6_000 };

const numberOfConsecutiveBlocks = 2;

jest.setTimeout(1000000);

describe('L1Publisher integration', () => {
  let l1Client: ExtendedViemWalletClient;
  let l1ContractAddresses: L1ContractAddresses;
  let deployerAccount: PrivateKeyAccount;
  let l1Constants: L1RollupConstants;

  let governanceProposerContract: GovernanceProposerContract;

  let rollupAddress: Address;

  let rollup: RollupContract;

  let publisher: SequencerPublisher;

  let builderDb: MerkleTreeAdminDatabase;

  // The header of the last block
  let prevHeader: BlockHeader;

  let minFee: GasFees;

  let blockSource: MockProxy<ArchiverDataSource>;
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

  const progressTimeBySlot = async (slotsToJump = 1) => {
    const currentTime = (await l1Client.getBlock()).timestamp;
    const currentSlot = await rollup.getSlotNumber();
    const targetSlot = SlotNumber(currentSlot + slotsToJump);
    const timestamp = await rollup.getTimestampForSlot(targetSlot);
    if (timestamp > currentTime) {
      await ethCheatCodes.warp(Number(timestamp), { resetBlockInterval: true });
    }
  };

  let port = 8545; // We increase the port for each test to avoid anvil conflicts
  const setup = async (deployL1ContractsArgs: Partial<DeployAztecL1ContractsArgs> = {}) => {
    ({ rpcUrl, anvil } = await startAnvil({ port: port++ }));
    config.l1RpcUrls = [rpcUrl];

    deployerAccount = privateKeyToAccount(deployerPK);
    ({ l1ContractAddresses, l1Client } = await deployAztecL1Contracts(rpcUrl, deployerPK, foundry.id, {
      ...getL1ContractsConfigEnvVars(),
      vkTreeRoot: getVKTreeRoot(),
      protocolContractsHash,
      genesisArchiveRoot: deployL1ContractsArgs.genesisArchiveRoot ?? new Fr(GENESIS_ARCHIVE_ROOT),
      aztecTargetCommitteeSize: 0,
      slasherFlavor: 'none',
      ...deployL1ContractsArgs,
    }));

    dateProvider = new TestDateProvider();
    ethCheatCodes = new EthCheatCodesWithState(config.l1RpcUrls, dateProvider);

    rollupAddress = getAddress(l1ContractAddresses.rollupAddress.toString());

    rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, l1ContractAddresses);

    // Set up contract instances
    rollup = new RollupContract(l1Client, l1ContractAddresses.rollupAddress);

    l1Constants = {
      ...(await rollup.getRollupConstants()),
      ethereumSlotDuration: config.ethereumSlotDuration,
    };

    builderDb = await NativeWorldStateService.tmp(EthAddress.fromString(rollupAddress));
    blocks = [];
    blockSource = mock<ArchiverDataSource>({
      getBlocks(from, limit) {
        return Promise.resolve(blocks.slice(from - 1, from - 1 + limit));
      },
      // Methods needed by L2BlockStream for world state sync
      getCheckpointedBlocks(from, limit) {
        const slicedBlocks = blocks.slice(from - 1, from - 1 + limit);
        return Promise.all(
          slicedBlocks.map(
            async block =>
              new CheckpointedL2Block(
                CheckpointNumber(block.number),
                block,
                new L1PublishedData(BigInt(block.number), BigInt(block.number), (await block.hash()).toString()),
                [],
              ),
          ),
        );
      },
      async getCheckpoints(checkpointNumber, _limit) {
        const block = blocks.find(b => Number(b.number) === Number(checkpointNumber));
        if (!block) {
          return Promise.resolve([]);
        }
        const checkpoint = new Checkpoint(
          block.archive,
          CheckpointHeader.random({ lastArchiveRoot: block.header.lastArchive.root }),
          [block],
          CheckpointNumber(block.number),
        );
        return [
          new PublishedCheckpoint(
            checkpoint,
            new L1PublishedData(BigInt(block.number), BigInt(block.number), (await block.hash()).toString()),
            [],
          ),
        ];
      },
      async getL2Tips(): Promise<L2Tips> {
        const latestBlock = blocks.at(-1);
        const blockId = latestBlock
          ? { number: latestBlock.number, hash: (await latestBlock.hash()).toString() }
          : { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() };
        const tipId = {
          block: blockId,
          checkpoint: { number: CheckpointNumber(blockId.number), hash: blockId.hash },
        };

        return { proposed: blockId, checkpointed: tipId, proven: tipId, finalized: tipId };
      },
      getBlockNumber(): Promise<BlockNumber> {
        return Promise.resolve(BlockNumber(blocks.at(-1)?.number ?? BlockNumber.ZERO));
      },
      getProvenBlockNumber(): Promise<BlockNumber> {
        return Promise.resolve(BlockNumber(blocks.at(-1)?.number ?? BlockNumber.ZERO));
      },
    });

    const worldStateConfig: WorldStateConfig = {
      worldStateBlockCheckIntervalMS: 10000,
      worldStateDbMapSizeKb: 10 * 1024 * 1024,
      worldStateBlockHistory: 0,
    };
    worldStateSynchronizer = new ServerWorldStateSynchronizer(builderDb, blockSource, worldStateConfig);
    await worldStateSynchronizer.start();

    const sequencerL1Client = createExtendedL1Client(config.l1RpcUrls, sequencerPK, foundry);
    const l1TxUtils = createL1TxUtilsWithBlobsFromViemWallet(sequencerL1Client, { logger, dateProvider }, config);
    const rollupContract = new RollupContract(sequencerL1Client, l1ContractAddresses.rollupAddress.toString());
    const slashingProposerContract = await rollupContract.getSlashingProposer();
    governanceProposerContract = new GovernanceProposerContract(
      sequencerL1Client,
      l1ContractAddresses.governanceProposerAddress.toString(),
    );
    epochCache = await EpochCache.create(l1ContractAddresses.rollupAddress, config, { dateProvider });
    const blobClient = createBlobClient();
    const sequencerPublisherMetrics: MockProxy<SequencerPublisherMetrics> = mock<SequencerPublisherMetrics>();

    publisher = new SequencerPublisher(
      {
        l1RpcUrls: config.l1RpcUrls,
        l1DebugRpcUrls: [],
        l1Contracts: l1ContractAddresses,
        publisherPrivateKeys: [new SecretValue(sequencerPK)],
        l1ChainId: chainId,
        viemPollingIntervalMS: 100,
        ethereumSlotDuration: config.ethereumSlotDuration,
      },
      {
        blobClient,
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
    minFee = new GasFees(0, await rollup.getManaMinFeeAt(ts, true));

    // We jump two epochs such that the committee can be setup.
    await rollupCheatCodes.advanceToEpoch(EpochNumber(config.lagInEpochsForValidatorSet + 1));
    await rollupCheatCodes.setupEpoch();

    ({ committee } = await epochCache.getCommittee());
    const { currentSlot } = epochCache.getCurrentAndNextSlot();
    proposer = await epochCache.getProposerAttesterAddressInSlot(currentSlot);
    logger.warn(`Current epoch committee and proposer`, { committee, proposer });
  };

  afterEach(async () => {
    await tryStop(anvil);
    await tryStop(worldStateSynchronizer);
  });

  const makeProcessedTx = (seed = 0x1): Promise<ProcessedTx> =>
    mockProcessedTx({
      anchorBlockHeader: prevHeader,
      chainId: fr(chainId),
      version: fr(version),
      vkTreeRoot: getVKTreeRoot(),
      gasSettings: GasSettings.default({ maxFeesPerGas: minFee }),
      protocolContracts: ProtocolContractsList,
      seed,
    });

  const sendToL2 = (content: Fr, recipient: AztecAddress): Promise<Fr> =>
    sendL1ToL2Message({ content, secretHash: Fr.ZERO, recipient }, { l1Client, l1ContractAddresses }).then(
      ({ msgHash }) => msgHash,
    );

  /**
   * Build a checkpoint with a single block using the LightweightCheckpointBuilder.
   * This properly computes all checkpoint header fields (blobsHash, blockHeadersHash, inHash, epochOutHash, etc.)
   */
  const buildCheckpoint = async (
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    l1ToL2Messages: Fr[],
    previousCheckpointOutHashes: Fr[] = [],
  ): Promise<Checkpoint> => {
    await worldStateSynchronizer.syncImmediate();
    const tempFork = await worldStateSynchronizer.fork(BlockNumber(globalVariables.blockNumber - 1));

    const checkpointConstants: CheckpointGlobalVariables = {
      chainId: globalVariables.chainId,
      version: globalVariables.version,
      slotNumber: globalVariables.slotNumber,
      coinbase: globalVariables.coinbase,
      feeRecipient: globalVariables.feeRecipient,
      gasFees: globalVariables.gasFees,
    };

    const checkpointNumber = CheckpointNumber.fromBlockNumber(globalVariables.blockNumber);
    const builder = await LightweightCheckpointBuilder.startNewCheckpoint(
      checkpointNumber,
      checkpointConstants,
      l1ToL2Messages,
      previousCheckpointOutHashes,
      tempFork,
    );

    await builder.addBlock(globalVariables, txs, { insertTxsEffects: true });
    const checkpoint = await builder.completeCheckpoint();

    await tempFork.close();
    return checkpoint;
  };

  const buildSingleCheckpoint = async (opts: { l1ToL2Messages?: Fr[]; blockNumber?: BlockNumber } = {}) => {
    const l1ToL2Messages = opts.l1ToL2Messages ?? new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(Fr.ZERO);

    const txs = await Promise.all([makeProcessedTx(0x1000), makeProcessedTx(0x2000)]);
    const ts = (await l1Client.getBlock()).timestamp;
    const slot = await rollup.getSlotAt(ts + BigInt(config.ethereumSlotDuration));
    const timestamp = await rollup.getTimestampForSlot(slot);
    const globalVariables = new GlobalVariables(
      new Fr(chainId),
      new Fr(version),
      opts.blockNumber ?? BlockNumber(1),
      slot,
      timestamp,
      coinbase,
      feeRecipient,
      new GasFees(0, await rollup.getManaMinFeeAt(timestamp, true)),
    );
    const checkpoint = await buildCheckpoint(globalVariables, txs, l1ToL2Messages);
    blockSource.getL1ToL2Messages.mockResolvedValueOnce(l1ToL2Messages);
    return { checkpoint, l1ToL2Messages };
  };

  describe('block building', () => {
    beforeEach(async () => {
      await setup();
    });

    const buildAndPublishBlock = async (numTxs: number, jsonFileNamePrefix: string) => {
      const archiveInRollup_ = await rollup.archive();
      expect(hexToBuffer(archiveInRollup_.toString())).toEqual(new Fr(GENESIS_ARCHIVE_ROOT).toBuffer());

      const l1BlockNumber = await l1Client.getBlockNumber();

      // random recipient address, just kept consistent for easy testing ts/sol.
      const recipientAddress = AztecAddress.fromString(
        '0x1647b194c649f5dd01d7c832f89b0f496043c9150797923ea89e93d5ac619a93',
      );

      let currentL1ToL2Messages: Fr[] = [];
      let nextL1ToL2Messages: Fr[] = [];
      const blobFieldsPerCheckpoint: Fr[][] = [];
      // The below batched blob is used for testing different epochs with 1..numberOfConsecutiveBlocks blocks on L1.
      // For real usage, always collect ALL epoch blobs first then call .batch().
      let currentBatch: BatchedBlob | undefined;

      for (let i = 0; i < numberOfConsecutiveBlocks; i++) {
        // With just one l1 client (serial sending) this takes too much time to send NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP
        // and causes a chain prune
        const l1ToL2Content = range(Math.min(16, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP), 128 * i + 1 + 0x400).map(fr);

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
          BlockNumber(i + 1), // block number
          slot,
          timestamp,
          coinbase,
          feeRecipient,
          new GasFees(0, await rollup.getManaMinFeeAt(timestamp, true)),
        );

        const checkpoint = await buildCheckpoint(globalVariables, txs, currentL1ToL2Messages);
        const block = checkpoint.blocks[0];

        const totalManaUsed = txs.reduce((acc, tx) => acc.add(new Fr(tx.gasUsed.totalGas.l2Gas)), Fr.ZERO);
        expect(totalManaUsed.toBigInt()).toEqual(block.header.totalManaUsed.toBigInt());

        prevHeader = block.header;
        blockSource.getL1ToL2Messages.mockResolvedValueOnce(currentL1ToL2Messages);

        const checkpointBlobFields = checkpoint.toBlobFields();
        const blockBlobs = getBlobsPerL1Block(checkpointBlobFields);

        let prevBlobAccumulatorHash = (await rollup.getCurrentBlobCommitmentsHash()).toBuffer();

        blocks.push(block);
        blobFieldsPerCheckpoint.push(checkpointBlobFields);

        // Batch the blobs so far, so they can be used in the L1 unit tests:
        currentBatch = await BatchedBlobAccumulator.batch(blobFieldsPerCheckpoint);

        await writeJson(
          `${jsonFileNamePrefix}_${block.number}`,
          block,
          l1ToL2Content,
          blockBlobs,
          currentBatch,
          recipientAddress,
          deployerAccount.address,
        );

        await publisher.enqueueProposeCheckpoint(
          checkpoint,
          CommitteeAttestationsAndSigners.empty(),
          Signature.empty(),
        );
        await publisher.sendRequests();

        const logs = await l1Client.getLogs({
          address: rollupAddress,
          event: getAbiItem({
            abi: RollupAbi,
            name: 'CheckpointProposed',
          }),
          fromBlock: l1BlockNumber + 1n,
        });
        expect(logs).toHaveLength(i + 1);
        expect(logs[i].args.checkpointNumber).toEqual(BigInt(i + 1));
        const thisCheckpointNumber = CheckpointNumber.fromBlockNumber(block.header.globalVariables.blockNumber);
        const prevCheckpointNumber = CheckpointNumber(thisCheckpointNumber - 1);
        const isFirstCheckpointOfEpoch =
          thisCheckpointNumber == CheckpointNumber(1) ||
          (await rollup.getEpochNumberForCheckpoint(thisCheckpointNumber)) >
            (await rollup.getEpochNumberForCheckpoint(prevCheckpointNumber));
        // If we are at the first blob of the epoch, we must initialize the hash:
        prevBlobAccumulatorHash = isFirstCheckpointOfEpoch ? Buffer.alloc(0) : prevBlobAccumulatorHash;
        const currentBlobAccumulatorHash = (await rollup.getCurrentBlobCommitmentsHash()).toBuffer();
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
              header: checkpoint.header.toViem(),
              archive: `0x${block.archive.root.toBuffer().toString('hex')}`,
              oracleInput: {
                feeAssetPriceModifier: 0n,
              },
            },
            CommitteeAttestationsAndSigners.empty().getPackedAttestations(),
            [],
            Signature.empty().toViemSignature(),
            getPrefixedEthBlobCommitments(blockBlobs),
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
                allowFailure: true,
              },
            ],
          ],
        });
        expect(ethTx.input).toEqual(expectedData);

        // There is a 1 block lag between before messages get consumed from the inbox
        currentL1ToL2Messages = nextL1ToL2Messages;
        // We wipe the messages from previous iteration
        nextL1ToL2Messages = [];

        // Make sure that time have progressed to the next slot!
        await progressTimeBySlot();
      }
    };

    it.each([
      [0, 'empty_checkpoint'],
      [1, 'single_tx_checkpoint'],
      [4, 'mixed_checkpoint'],
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
            bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
          })),
      });
    });

    const expectPublishCheckpoint = async (
      checkpoint: Checkpoint,
      attestations: CommitteeAttestation[],
      signature: Signature,
    ) => {
      await publisher.enqueueProposeCheckpoint(
        checkpoint,
        new CommitteeAttestationsAndSigners(attestations),
        signature,
      );
      const result = await publisher.sendRequests();
      expect(result!.successfulActions).toEqual(['propose']);
      expect(result!.failedActions).toEqual([]);
    };

    it('publishes a block with attestations', async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      const block = checkpoint.blocks[0];

      const checkpointAttestations = validators.map(v => makeCheckpointAttestationFromCheckpoint(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      const canPropose = await publisher.canProposeAtNextEthBlock(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateBlockHeader(checkpoint.header);

      const proposerSigner = validators.find(v => v.address.equals(proposer!));

      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations);
      const attestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
        attestationsAndSigners,
        proposerSigner!,
      );

      await expectPublishCheckpoint(checkpoint, attestations, attestationsAndSignersSignature);
    });

    it('fails to publish a block without the proposer attestation', async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      const block = checkpoint.blocks[0];
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationFromCheckpoint(checkpoint, v));

      // Reverse attestations to break proposer attestation
      const attestations = orderAttestations(checkpointAttestations, committee!).reverse();
      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations);

      const canPropose = await publisher.canProposeAtNextEthBlock(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateBlockHeader(checkpoint.header);

      await expect(
        publisher.enqueueProposeCheckpoint(checkpoint, attestationsAndSigners, Signature.empty()),
      ).rejects.toThrow(/ValidatorSelection__InvalidCommitteeCommitment/);
    });

    it('rejects flipped proposer signature', async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      const block = checkpoint.blocks[0];
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationFromCheckpoint(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      const canPropose = await publisher.canProposeAtNextEthBlock(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateBlockHeader(checkpoint.header);

      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations);
      const attestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
        attestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      await expect(
        publisher.enqueueProposeCheckpoint(
          checkpoint,
          attestationsAndSigners,
          flipSignature(attestationsAndSignersSignature),
        ),
      ).rejects.toThrow(/ECDSAInvalidSignatureS/);
    });

    it('rejects signature with invalid recovery value', async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      const block = checkpoint.blocks[0];
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationFromCheckpoint(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      const canPropose = await publisher.canProposeAtNextEthBlock(new Fr(GENESIS_ARCHIVE_ROOT), proposer!);
      expect(canPropose?.slot).toEqual(block.header.getSlot());
      await publisher.validateBlockHeader(checkpoint.header);

      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations);
      const attestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
        attestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      logger.warn(`Original v value: ${attestationsAndSignersSignature.v}`);

      // Move v-value from 27-28 to 0-1
      const wrongV = attestationsAndSignersSignature.v - 27;
      const wrongSig = new Signature(attestationsAndSignersSignature.r, attestationsAndSignersSignature.s, wrongV);

      await expect(publisher.enqueueProposeCheckpoint(checkpoint, attestationsAndSigners, wrongSig)).rejects.toThrow(
        /ECDSAInvalidSignature/,
      );
    });

    it('publishes a block invalidating the previous one', async () => {
      const { checkpoint: badCheckpoint } = await buildSingleCheckpoint();
      const badBlock = badCheckpoint.blocks[0];

      // Publish the first invalid block
      const badCheckpointAttestations = validators
        .filter(v => v.address.equals(proposer!))
        .map(v => makeCheckpointAttestationFromCheckpoint(badCheckpoint, v));
      const badAttestations = orderAttestations(badCheckpointAttestations, committee!);

      const badAttestationsAndSigners = new CommitteeAttestationsAndSigners(badAttestations);
      const badAttestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
        badAttestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      await expectPublishCheckpoint(badCheckpoint, badAttestations, badAttestationsAndSignersSignature);
      await progressTimeBySlot();

      logger.warn(`Published bad block ${badBlock.number} with archive root ${badBlock.archive.root}`);

      // Update the current proposer
      const { currentSlot } = epochCache.getCurrentAndNextSlot();
      proposer = await epochCache.getProposerAttesterAddressInSlot(currentSlot);

      // Prepare for invalidating the previous one and publish the same block with proper attestations
      const { checkpoint } = await buildSingleCheckpoint({ blockNumber: BlockNumber(1) });
      const block = checkpoint.blocks[0];
      expect(block.number).toEqual(badBlock.number);
      const checkpointAttestations = validators.map(v => makeCheckpointAttestationFromCheckpoint(checkpoint, v));
      const attestations = orderAttestations(checkpointAttestations, committee!);

      // Check we can invalidate the checkpoint
      logger.warn('Checking simulate invalidate checkpoint');
      const invalidateRequest = await publisher.simulateInvalidateCheckpoint({
        valid: false,
        committee: committee!,
        checkpoint: checkpoint.toCheckpointInfo(),
        attestors: [],
        attestations: badAttestations,
        epoch: EpochNumber(1),
        seed: 1n,
        reason: 'insufficient-attestations',
      });
      expect(invalidateRequest).toBeDefined();
      const forcePendingCheckpointNumber = invalidateRequest?.forcePendingCheckpointNumber;
      expect(forcePendingCheckpointNumber).toEqual(0);

      // We cannot propose directly, we need to assume the previous checkpoint is invalidated
      const genesis = new Fr(GENESIS_ARCHIVE_ROOT);
      logger.warn(`Checking can propose at next eth block on top of genesis ${genesis}`);
      expect(await publisher.canProposeAtNextEthBlock(genesis, proposer!)).toBeUndefined();
      const canPropose = await publisher.canProposeAtNextEthBlock(genesis, proposer!, { forcePendingCheckpointNumber });
      expect(canPropose?.slot).toEqual(block.header.getSlot());

      // Same for validation
      logger.warn('Checking validate block header');
      await expect(publisher.validateBlockHeader(checkpoint.header)).rejects.toThrow(/Rollup__InvalidArchive/);
      await publisher.validateBlockHeader(checkpoint.header, {
        forcePendingCheckpointNumber: forcePendingCheckpointNumber ?? CheckpointNumber.ZERO,
      });

      // At this point I'm gonna need to propose the correct signature ye? So confused actually here.
      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations);
      const attestationsAndSignersSignature = makeAndSignCommitteeAttestationsAndSigners(
        attestationsAndSigners,
        validators.find(v => v.address.equals(proposer!))!,
      );

      // Invalidate and propose
      logger.warn('Enqueuing requests to invalidate and propose the checkpoint');
      publisher.enqueueInvalidateCheckpoint(invalidateRequest);
      await publisher.enqueueProposeCheckpoint(checkpoint, attestationsAndSigners, attestationsAndSignersSignature, {
        forcePendingCheckpointNumber: forcePendingCheckpointNumber ?? CheckpointNumber.ZERO,
      });
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
      const { checkpoint } = await buildSingleCheckpoint();
      const block = checkpoint.blocks[0];

      await publisher.enqueueProposeCheckpoint(checkpoint, CommitteeAttestationsAndSigners.empty(), Signature.empty());
      await publisher.enqueueGovernanceCastSignal(
        l1ContractAddresses.rollupAddress,
        block.slot,
        block.timestamp,
        EthAddress.random(),
        (_payload: any) => Promise.resolve(Signature.random().toString()),
      );

      const result = await publisher.sendRequests();

      expect(result!.successfulActions).toEqual(['propose']);
      expect(result!.failedActions).toEqual(['governance-signal']);
    });

    it(`shows propose custom errors if tx simulation fails`, async () => {
      // Set up different l1-to-l2 messages than the ones on the inbox, so this submission reverts because the
      // INBOX.consume does not match the header.inHash and we get a Rollup__BlobHash that is not caught by
      // validateHeader before.
      const l1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(1n));
      const { checkpoint } = await buildSingleCheckpoint({ l1ToL2Messages });

      // Expect the simulation to fail
      const loggerErrorSpy = jest.spyOn((publisher as any).log, 'error');
      await expect(
        publisher.enqueueProposeCheckpoint(checkpoint, CommitteeAttestationsAndSigners.empty(), Signature.empty()),
      ).rejects.toThrow(/Rollup__InvalidInHash/);
      expect(loggerErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringMatching('Rollup__InvalidInHash'),
        expect.anything(),
        expect.objectContaining({ checkpointNumber: 1 }),
      );
    });
  });

  describe('timeouts', () => {
    let initialL2Slot: bigint;
    let sendRequestsResult: Awaited<ReturnType<SequencerPublisher['sendRequests']>> | null;

    beforeEach(async () => {
      sendRequestsResult = null;

      await setup({ aztecSlotDuration: 48 });

      await ethCheatCodes.setAutomine(false);
      await ethCheatCodes.setBlockInterval(config.ethereumSlotDuration);
      initialL2Slot = BigInt(await rollup.getSlotNumber());
    });

    const getProposeTxTimeoutAt = (checkpoint: Checkpoint) => {
      const { slotDuration: aztecSlotDuration } = l1Constants;
      const txTimeoutAt = new Date(
        (Number(getSlotStartBuildTimestamp(checkpoint.slot, l1Constants)) + Number(aztecSlotDuration)) * 1000,
      );
      logger.warn(`Setting tx timeout at ${txTimeoutAt.toISOString()} (${txTimeoutAt.getTime()})`);
      return txTimeoutAt;
    };

    const sendRequests = async () => {
      void publisher
        .sendRequests()
        .then(r => (sendRequestsResult = r ?? null))
        .catch(err => {
          sendRequestsResult = null;
          return err;
        });

      // Wait until the publish tx is sent
      await retryUntil(() => ethCheatCodes.getTxPoolStatus().then(s => s.pending > 0), 'tx sent', 20, 0.1);
    };

    const enqueueProposeL2Checkpoint = async (checkpoint: Checkpoint) => {
      await publisher.enqueueProposeCheckpoint(checkpoint, CommitteeAttestationsAndSigners.empty(), Signature.empty(), {
        txTimeoutAt: getProposeTxTimeoutAt(checkpoint),
      });
    };

    it(`cancels block proposal when the L2 slot ends`, async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      await enqueueProposeL2Checkpoint(checkpoint);
      await sendRequests();

      // Advance one L1 block at a time without mining the publish tx.
      // While we are on the same L2 slot, sendRequests should not resolve.
      while (true) {
        await ethCheatCodes.mineEmptyBlock();
        await ethCheatCodes.syncDateProvider();
        const currentL2Slot = await rollup.getSlotNumber();
        const { slot: nextL2Slot } = epochCache.getEpochAndSlotInNextL1Slot();
        logger.warn(`L2 slot in next L1 slot is ${nextL2Slot}`, { nextL2Slot, currentL2Slot, initialL2Slot });

        // Make sure we give enough time to the l1 tx utils to process
        await sleep(1000);

        if (nextL2Slot > initialL2Slot) {
          expect(sendRequestsResult).toBeNull();
          break;
        }
      }

      // The publisher should now be in cancelled state
      expect(publisher.l1TxUtils.state).toEqual(TxUtilsState.CANCELLED);

      // Now allow the cancellation to be mined, check that we transition to MINED, and the last tx was indeed a cancellation.
      await ethCheatCodes.mine();
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.MINED, 'state is mined', 2, 0.1);
      const lastBlock = await l1Client.getBlock({ includeTransactions: true });
      const cancelTx = lastBlock.transactions.at(-1);
      expect(cancelTx).toBeDefined();
      expect(cancelTx?.input).toEqual('0x');
      expect(cancelTx?.value).toEqual(0n);
      const cancelTxReceipt = await l1Client.getTransactionReceipt({ hash: cancelTx!.hash });
      expect(cancelTxReceipt.status).toEqual('success');
    });

    it(`speeds up block proposal if not mined`, async () => {
      const { checkpoint } = await buildSingleCheckpoint();
      const block = checkpoint.blocks[0];
      await enqueueProposeL2Checkpoint(checkpoint);
      await sendRequests();

      const [initialTx] = await ethCheatCodes.getTxPoolContents();
      expect(initialTx).toBeDefined();

      // After N L1 blocks, the publisher should have bumped the gas and resent the tx
      const l1SlotsUntilSpeedUp = 1;
      for (let i = 0; i < l1SlotsUntilSpeedUp; i++) {
        await ethCheatCodes.mineEmptyBlock();
        await ethCheatCodes.syncDateProvider();
      }

      // We should now be in speed-up state
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.SPEED_UP, 'speed up', 2, 0.1);
      const [speedUpTx] = await ethCheatCodes.getTxPoolContents();
      expect(speedUpTx).toBeDefined();
      expect(speedUpTx!.hash).not.toEqual(initialTx!.hash);
      expect(BigInt(speedUpTx!.maxFeePerGas!)).toBeGreaterThan(BigInt(initialTx!.maxFeePerGas!));
      expect(BigInt(speedUpTx!.maxPriorityFeePerGas!)).toBeGreaterThan(BigInt(initialTx!.maxPriorityFeePerGas!));

      // Now mine an L1 block with txs, and see that we transition to MINED state
      await ethCheatCodes.mine();
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.MINED, 'state is mined', 2, 0.1);
      const lastBlock = await l1Client.getBlock({ includeTransactions: true });
      const minedTx = lastBlock.transactions.find(t => t.hash === speedUpTx!.hash);
      expect(minedTx).toBeDefined();
      const minedTxReceipt = await l1Client.getTransactionReceipt({ hash: minedTx!.hash });
      expect(minedTxReceipt.status).toEqual('success');
      expect(await rollup.getCheckpointNumber()).toEqual(CheckpointNumber.fromBlockNumber(block.number));
    });

    it(`can send two consecutive proposals if the first one times out`, async () => {
      const { checkpoint: checkpoint1 } = await buildSingleCheckpoint();
      await enqueueProposeL2Checkpoint(checkpoint1);
      await sendRequests();

      const [initialTx] = await ethCheatCodes.getTxPoolContents();
      expect(initialTx).toBeDefined();

      // Let the proposal timeout by mining empty blocks until we're past the L2 slot
      while (true) {
        await ethCheatCodes.mineEmptyBlock();
        await ethCheatCodes.syncDateProvider();
        const { slot: nextL2Slot } = epochCache.getEpochAndSlotInNextL1Slot();

        // Wait for state to transition and give the publisher time to process
        await sleep(1000);

        // The publisher should now be in cancelled state
        if (nextL2Slot > initialL2Slot) {
          expect(publisher.l1TxUtils.state).toEqual(TxUtilsState.CANCELLED);
          expect(sendRequestsResult).toBeNull();
          break;
        }
      }

      // The cancellation should still be on the pool
      expect(await ethCheatCodes.getTxPoolStatus()).toEqual({ pending: 1, queued: 0 });

      // Now we should be able to send a second proposal
      const { checkpoint: checkpoint2 } = await buildSingleCheckpoint({ blockNumber: BlockNumber(1) });
      const block2 = checkpoint2.blocks[0];
      expect(BigInt(block2.slot)).toEqual(initialL2Slot + 1n);
      sendRequestsResult = undefined;
      await enqueueProposeL2Checkpoint(checkpoint2);
      await sendRequests();

      // Wait for the new proposal to be sent to the pool
      await retryUntil(() => ethCheatCodes.getTxPoolStatus().then(s => s.queued + s.pending > 1), 'tx queued', 20, 0.1);

      // Mine a block
      await ethCheatCodes.mine();

      // Wait for completion
      await retryUntil(() => !!sendRequestsResult, 'request resolved', 5, 0.1);
      await retryUntil(() => publisher.l1TxUtils.state === TxUtilsState.MINED, 'mined', 10, 0.1);

      // The second proposal should succeed
      expect(sendRequestsResult).not.toBeNull();
      expect(sendRequestsResult!.successfulActions).toEqual(['propose']);
      expect(sendRequestsResult!.failedActions).toEqual([]);
      expect(await rollup.getCheckpointNumber()).toEqual(CheckpointNumber.fromBlockNumber(block2.number));
      const rollupBlock = await rollup.getCheckpoint(CheckpointNumber.fromBlockNumber(block2.number));
      expect(rollupBlock.slotNumber).toEqual(block2.slot);
    });
  });
});
