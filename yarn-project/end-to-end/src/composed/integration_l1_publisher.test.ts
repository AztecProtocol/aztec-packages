import { type ArchiveSource } from '@aztec/archiver';
import { getConfigEnvVars } from '@aztec/aztec-node';
import {
  AztecAddress,
  Body,
  EthCheatCodes,
  Fr,
  GlobalVariables,
  type L2Block,
  createDebugLogger,
  mockTx,
} from '@aztec/aztec.js';
// eslint-disable-next-line no-restricted-imports
import {
  type BlockProver,
  PROVING_STATUS,
  type ProcessedTx,
  makeEmptyProcessedTx as makeEmptyProcessedTxFromHistoricalTreeRoots,
  makeProcessedTx,
} from '@aztec/circuit-types';
import {
  ETHEREUM_SLOT_DURATION,
  EthAddress,
  GasFees,
  type Header,
  KernelCircuitPublicInputs,
  LogHash,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PublicDataUpdateRequest,
  ScopedLogHash,
} from '@aztec/circuits.js';
import { fr, makeScopedL2ToL1Message } from '@aztec/circuits.js/testing';
import { type L1ContractAddresses, createEthereumChain } from '@aztec/ethereum';
import { makeTuple, range } from '@aztec/foundation/array';
import { openTmpStore } from '@aztec/kv-store/utils';
import { AvailabilityOracleAbi, OutboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { SHA256Trunc, StandardTree } from '@aztec/merkle-tree';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import { TxProver } from '@aztec/prover-client';
import { L1Publisher } from '@aztec/sequencer-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { MerkleTrees, ServerWorldStateSynchronizer, type WorldStateConfig } from '@aztec/world-state';

import { beforeEach, describe, expect, it } from '@jest/globals';
import * as fs from 'fs';
import { type MockProxy, mock } from 'jest-mock-extended';
import {
  type Account,
  type Address,
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
  encodeFunctionData,
  getAbiItem,
  getAddress,
  getContract,
} from 'viem';
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';

import { sendL1ToL2Message } from '../fixtures/l1_to_l2_messaging.js';
import { setupL1Contracts } from '../fixtures/utils.js';

// Accounts 4 and 5 of Anvil default startup with mnemonic: 'test test test test test test test test test test test junk'
const sequencerPK = '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a';
const deployerPK = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba';

const logger = createDebugLogger('aztec:integration_l1_publisher');

const config = getConfigEnvVars();

const numberOfConsecutiveBlocks = 2;

describe('L1Publisher integration', () => {
  let publicClient: PublicClient<HttpTransport, Chain>;
  let walletClient: WalletClient<HttpTransport, Chain, Account>;
  let l1ContractAddresses: L1ContractAddresses;
  let deployerAccount: PrivateKeyAccount;

  let rollupAddress: Address;
  let outboxAddress: Address;

  let rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;
  let outbox: GetContractReturnType<typeof OutboxAbi, PublicClient<HttpTransport, Chain>>;

  let publisher: L1Publisher;

  let builder: TxProver;
  let builderDb: MerkleTrees;
  let prover: BlockProver;

  // The header of the last block
  let prevHeader: Header;

  let blockSource: MockProxy<ArchiveSource>;

  const chainId = createEthereumChain(config.l1RpcUrl, config.l1ChainId).chainInfo.id;

  let coinbase: EthAddress;
  let feeRecipient: AztecAddress;

  let ethCheatCodes: EthCheatCodes;
  let worldStateSynchronizer: ServerWorldStateSynchronizer;

  // To update the test data, run "export AZTEC_GENERATE_TEST_DATA=1" in shell and run the tests again
  // If you have issues with RPC_URL, it is likely that you need to set the RPC_URL in the shell as well
  // If running ANVIL locally, you can use ETHEREUM_HOST="http://0.0.0.0:8545"
  const AZTEC_GENERATE_TEST_DATA = !!process.env.AZTEC_GENERATE_TEST_DATA;

  const setTimeToNextSlot = async () => {
    const currentTime = (await publicClient.getBlock()).timestamp;
    const currentSlot = await rollup.read.getCurrentSlot();
    const timestamp = (await rollup.read.getTimestampForSlot([currentSlot + 1n])) - BigInt(ETHEREUM_SLOT_DURATION);
    if (timestamp > currentTime) {
      await ethCheatCodes.warp(Number(timestamp));
    }
  };

  beforeEach(async () => {
    deployerAccount = privateKeyToAccount(deployerPK);
    ({ l1ContractAddresses, publicClient, walletClient } = await setupL1Contracts(
      config.l1RpcUrl,
      deployerAccount,
      logger,
    ));

    ethCheatCodes = new EthCheatCodes(config.l1RpcUrl);

    rollupAddress = getAddress(l1ContractAddresses.rollupAddress.toString());
    outboxAddress = getAddress(l1ContractAddresses.outboxAddress.toString());

    // Set up contract instances
    rollup = getContract({
      address: rollupAddress,
      abi: RollupAbi,
      client: publicClient,
    });
    outbox = getContract({
      address: outboxAddress,
      abi: OutboxAbi,
      client: publicClient,
    });

    const tmpStore = openTmpStore();
    builderDb = await MerkleTrees.new(tmpStore);
    blockSource = mock<ArchiveSource>();
    blockSource.getBlocks.mockResolvedValue([]);
    const worldStateConfig: WorldStateConfig = {
      worldStateBlockCheckIntervalMS: 10000,
      l2QueueSize: 10,
      worldStateProvenBlocksOnly: false,
    };
    worldStateSynchronizer = new ServerWorldStateSynchronizer(tmpStore, builderDb, blockSource, worldStateConfig);
    await worldStateSynchronizer.start();
    builder = await TxProver.new(config, new NoopTelemetryClient());
    prover = builder.createBlockProver(builderDb.asLatest());

    publisher = new L1Publisher(
      {
        l1RpcUrl: config.l1RpcUrl,
        requiredConfirmations: 1,
        l1Contracts: l1ContractAddresses,
        publisherPrivateKey: sequencerPK,
        l1PublishRetryIntervalMS: 100,
        l1ChainId: 31337,
      },
      new NoopTelemetryClient(),
    );

    coinbase = config.coinbase || EthAddress.random();
    feeRecipient = config.feeRecipient || AztecAddress.random();

    prevHeader = builderDb.getInitialHeader();

    await setTimeToNextSlot();
  });

  const makeEmptyProcessedTx = () =>
    makeEmptyProcessedTxFromHistoricalTreeRoots(prevHeader, new Fr(chainId), new Fr(config.version), getVKTreeRoot());

  const makeBloatedProcessedTx = (seed = 0x1): ProcessedTx => {
    const tx = mockTx(seed);
    const kernelOutput = KernelCircuitPublicInputs.empty();
    kernelOutput.constants.txContext.chainId = fr(chainId);
    kernelOutput.constants.txContext.version = fr(config.version);
    kernelOutput.constants.vkTreeRoot = getVKTreeRoot();
    kernelOutput.constants.historicalHeader = prevHeader;
    kernelOutput.end.publicDataUpdateRequests = makeTuple(
      MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      i => new PublicDataUpdateRequest(fr(i), fr(i + 10), i + 20),
      seed + 0x500,
    );

    const processedTx = makeProcessedTx(tx, kernelOutput, []);

    processedTx.data.end.noteHashes = makeTuple(MAX_NOTE_HASHES_PER_TX, fr, seed + 0x100);
    processedTx.data.end.nullifiers = makeTuple(MAX_NULLIFIERS_PER_TX, fr, seed + 0x200);
    processedTx.data.end.nullifiers[processedTx.data.end.nullifiers.length - 1] = Fr.ZERO;
    processedTx.data.end.l2ToL1Msgs = makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, makeScopedL2ToL1Message, seed + 0x300);
    processedTx.encryptedLogs.unrollLogs().forEach((log, i) => {
      processedTx.data.end.encryptedLogsHashes[i] = new ScopedLogHash(
        new LogHash(Fr.fromBuffer(log.hash()), 0, new Fr(log.length)),
        log.maskedContractAddress,
      );
    });

    return processedTx;
  };

  const sendToL2 = (content: Fr, recipient: AztecAddress): Promise<Fr> => {
    return sendL1ToL2Message(
      { content, secretHash: Fr.ZERO, recipient },
      { publicClient, walletClient, l1ContractAddresses },
    );
  };

  /**
   * Creates a json object that can be used to test the solidity contract.
   * The json object must be put into
   */
  const writeJson = (
    fileName: string,
    block: L2Block,
    l1ToL2Content: Fr[],
    recipientAddress: AztecAddress,
    deployerAddress: `0x${string}`,
  ): void => {
    if (!AZTEC_GENERATE_TEST_DATA) {
      return;
    }
    // Path relative to the package.json in the end-to-end folder
    const path = `../../l1-contracts/test/fixtures/${fileName}.json`;

    const jsonObject = {
      populate: {
        l1ToL2Content: l1ToL2Content.map(c => `0x${c.toBuffer().toString('hex').padStart(64, '0')}`),
        recipient: `0x${recipientAddress.toBuffer().toString('hex').padStart(64, '0')}`,
        sender: deployerAddress,
      },
      messages: {
        l2ToL1Messages: block.body.txEffects
          .flatMap(txEffect => txEffect.l2ToL1Msgs)
          .map(m => `0x${m.toBuffer().toString('hex').padStart(64, '0')}`),
      },
      block: {
        // The json formatting in forge is a bit brittle, so we convert Fr to a number in the few values below.
        // This should not be a problem for testing as long as the values are not larger than u32.
        archive: `0x${block.archive.root.toBuffer().toString('hex').padStart(64, '0')}`,
        body: `0x${block.body.toBuffer().toString('hex')}`,
        txsEffectsHash: `0x${block.body.getTxsEffectsHash().toString('hex').padStart(64, '0')}`,
        decodedHeader: {
          contentCommitment: {
            inHash: `0x${block.header.contentCommitment.inHash.toString('hex').padStart(64, '0')}`,
            outHash: `0x${block.header.contentCommitment.outHash.toString('hex').padStart(64, '0')}`,
            numTxs: Number(block.header.contentCommitment.numTxs),
            txsEffectsHash: `0x${block.header.contentCommitment.txsEffectsHash.toString('hex').padStart(64, '0')}`,
          },
          globalVariables: {
            blockNumber: block.number,
            slotNumber: `0x${block.header.globalVariables.slotNumber.toBuffer().toString('hex').padStart(64, '0')}`,
            chainId: Number(block.header.globalVariables.chainId.toBigInt()),
            timestamp: Number(block.header.globalVariables.timestamp.toBigInt()),
            version: Number(block.header.globalVariables.version.toBigInt()),
            coinbase: `0x${block.header.globalVariables.coinbase.toBuffer().toString('hex').padStart(40, '0')}`,
            feeRecipient: `0x${block.header.globalVariables.feeRecipient.toBuffer().toString('hex').padStart(64, '0')}`,
            gasFees: {
              feePerDaGas: block.header.globalVariables.gasFees.feePerDaGas.toNumber(),
              feePerL2Gas: block.header.globalVariables.gasFees.feePerL2Gas.toNumber(),
            },
          },
          lastArchive: {
            nextAvailableLeafIndex: block.header.lastArchive.nextAvailableLeafIndex,
            root: `0x${block.header.lastArchive.root.toBuffer().toString('hex').padStart(64, '0')}`,
          },
          stateReference: {
            l1ToL2MessageTree: {
              nextAvailableLeafIndex: block.header.state.l1ToL2MessageTree.nextAvailableLeafIndex,
              root: `0x${block.header.state.l1ToL2MessageTree.root.toBuffer().toString('hex').padStart(64, '0')}`,
            },
            partialStateReference: {
              noteHashTree: {
                nextAvailableLeafIndex: block.header.state.partial.noteHashTree.nextAvailableLeafIndex,
                root: `0x${block.header.state.partial.noteHashTree.root.toBuffer().toString('hex').padStart(64, '0')}`,
              },
              nullifierTree: {
                nextAvailableLeafIndex: block.header.state.partial.nullifierTree.nextAvailableLeafIndex,
                root: `0x${block.header.state.partial.nullifierTree.root.toBuffer().toString('hex').padStart(64, '0')}`,
              },
              publicDataTree: {
                nextAvailableLeafIndex: block.header.state.partial.publicDataTree.nextAvailableLeafIndex,
                root: `0x${block.header.state.partial.publicDataTree.root
                  .toBuffer()
                  .toString('hex')
                  .padStart(64, '0')}`,
              },
            },
          },
        },
        header: `0x${block.header.toBuffer().toString('hex')}`,
        publicInputsHash: `0x${block.getPublicInputsHash().toBuffer().toString('hex').padStart(64, '0')}`,
        numTxs: block.body.txEffects.length,
      },
    };

    const output = JSON.stringify(jsonObject, null, 2);
    fs.writeFileSync(path, output, 'utf8');
  };

  const buildBlock = async (globalVariables: GlobalVariables, txs: ProcessedTx[], l1ToL2Messages: Fr[]) => {
    const blockTicket = await prover.startNewBlock(txs.length, globalVariables, l1ToL2Messages);
    for (const tx of txs) {
      await prover.addNewTx(tx);
    }
    return blockTicket;
  };

  it('Block body is correctly published to AvailabilityOracle', async () => {
    const body = Body.random();
    // `sendPublishTx` function is private so I am hacking around TS here. I think it's ok for test purposes.
    const txHash = await (publisher as any).sendPublishTx(body.toBuffer());
    const txReceipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    });

    // Exactly 1 event should be emitted in the transaction
    expect(txReceipt.logs.length).toBe(1);

    // We decode the event log before checking it
    const txLog = txReceipt.logs[0];
    const topics = decodeEventLog({
      abi: AvailabilityOracleAbi,
      data: txLog.data,
      topics: txLog.topics,
    });
    // Sol gives bytes32 txsHash, so we pad the ts bytes31 version
    // We check that the txsHash in the TxsPublished event is as expected
    expect(topics.args.txsEffectsHash).toEqual(`0x${body.getTxsEffectsHash().toString('hex').padStart(64, '0')}`);
  });

  it(`Build ${numberOfConsecutiveBlocks} blocks of 4 bloated txs building on each other`, async () => {
    const archiveInRollup_ = await rollup.read.archive();
    expect(hexStringToBuffer(archiveInRollup_.toString())).toEqual(Buffer.alloc(32, 0));

    const blockNumber = await publicClient.getBlockNumber();
    // random recipient address, just kept consistent for easy testing ts/sol.
    const recipientAddress = AztecAddress.fromString(
      '0x1647b194c649f5dd01d7c832f89b0f496043c9150797923ea89e93d5ac619a93',
    );

    let currentL1ToL2Messages: Fr[] = [];
    let nextL1ToL2Messages: Fr[] = [];

    for (let i = 0; i < numberOfConsecutiveBlocks; i++) {
      // @note  Make sure that the state is up to date before we start building.
      await worldStateSynchronizer.syncImmediate();

      const l1ToL2Content = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 128 * i + 1 + 0x400).map(fr);

      for (let j = 0; j < l1ToL2Content.length; j++) {
        nextL1ToL2Messages.push(await sendToL2(l1ToL2Content[j], recipientAddress));
      }

      // Ensure that each transaction has unique (non-intersecting nullifier values)
      const totalNullifiersPerBlock = 4 * MAX_NULLIFIERS_PER_TX;
      const txs = [
        makeBloatedProcessedTx(totalNullifiersPerBlock * i + 1 * MAX_NULLIFIERS_PER_TX),
        makeBloatedProcessedTx(totalNullifiersPerBlock * i + 2 * MAX_NULLIFIERS_PER_TX),
        makeBloatedProcessedTx(totalNullifiersPerBlock * i + 3 * MAX_NULLIFIERS_PER_TX),
        makeBloatedProcessedTx(totalNullifiersPerBlock * i + 4 * MAX_NULLIFIERS_PER_TX),
      ];

      const ts = (await publicClient.getBlock()).timestamp;
      const slot = await rollup.read.getSlotAt([ts + BigInt(ETHEREUM_SLOT_DURATION)]);
      const globalVariables = new GlobalVariables(
        new Fr(chainId),
        new Fr(config.version),
        new Fr(1 + i),
        new Fr(slot),
        new Fr(await rollup.read.getTimestampForSlot([slot])),
        coinbase,
        feeRecipient,
        GasFees.empty(),
      );
      const ticket = await buildBlock(globalVariables, txs, currentL1ToL2Messages);
      const result = await ticket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const blockResult = await prover.finaliseBlock();
      const block = blockResult.block;
      prevHeader = block.header;
      blockSource.getL1ToL2Messages.mockResolvedValueOnce(currentL1ToL2Messages);
      blockSource.getBlocks.mockResolvedValueOnce([block]);

      const l2ToL1MsgsArray = block.body.txEffects.flatMap(txEffect => txEffect.l2ToL1Msgs);

      const [emptyRoot] = await outbox.read.getRootData([block.header.globalVariables.blockNumber.toBigInt()]);

      // Check that we have not yet written a root to this blocknumber
      expect(BigInt(emptyRoot)).toStrictEqual(0n);

      writeJson(`mixed_block_${block.number}`, block, l1ToL2Content, recipientAddress, deployerAccount.address);

      await publisher.processL2Block(block);

      const logs = await publicClient.getLogs({
        address: rollupAddress,
        event: getAbiItem({
          abi: RollupAbi,
          name: 'L2BlockProcessed',
        }),
        fromBlock: blockNumber + 1n,
      });
      expect(logs).toHaveLength(i + 1);
      expect(logs[i].args.blockNumber).toEqual(BigInt(i + 1));

      const ethTx = await publicClient.getTransaction({
        hash: logs[i].transactionHash!,
      });

      const expectedData = encodeFunctionData({
        abi: RollupAbi,
        functionName: 'publishAndProcess',
        args: [
          `0x${block.header.toBuffer().toString('hex')}`,
          `0x${block.archive.root.toBuffer().toString('hex')}`,
          `0x${block.body.toBuffer().toString('hex')}`,
        ],
      });
      expect(ethTx.input).toEqual(expectedData);

      const treeHeight = Math.ceil(Math.log2(l2ToL1MsgsArray.length));

      const tree = new StandardTree(
        openTmpStore(true),
        new SHA256Trunc(),
        'temp_outhash_sibling_path',
        treeHeight,
        0n,
        Fr,
      );
      await tree.appendLeaves(l2ToL1MsgsArray);

      const expectedRoot = tree.getRoot(true);
      const [returnedRoot] = await outbox.read.getRootData([block.header.globalVariables.blockNumber.toBigInt()]);

      // check that values are inserted into the outbox
      expect(Fr.ZERO.toString()).toEqual(returnedRoot);

      const actualRoot = await ethCheatCodes.load(
        EthAddress.fromString(outbox.address),
        ethCheatCodes.keccak256(0n, 1n + BigInt(i)),
      );
      expect(`0x${expectedRoot.toString('hex')}`).toEqual(new Fr(actualRoot).toString());

      // There is a 1 block lag between before messages get consumed from the inbox
      currentL1ToL2Messages = nextL1ToL2Messages;
      // We wipe the messages from previous iteration
      nextL1ToL2Messages = [];

      // @todo @LHerskind need to make sure that time have progressed to the next slot!
      await setTimeToNextSlot();
    }
  });

  it(`Build ${numberOfConsecutiveBlocks} blocks of 2 empty txs building on each other`, async () => {
    const archiveInRollup_ = await rollup.read.archive();
    expect(hexStringToBuffer(archiveInRollup_.toString())).toEqual(Buffer.alloc(32, 0));

    const blockNumber = await publicClient.getBlockNumber();

    for (let i = 0; i < numberOfConsecutiveBlocks; i++) {
      // @note  Make sure that the state is up to date before we start building.
      await worldStateSynchronizer.syncImmediate();

      const l1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n));
      const txs = [makeEmptyProcessedTx(), makeEmptyProcessedTx()];

      const ts = (await publicClient.getBlock()).timestamp;
      const slot = await rollup.read.getSlotAt([ts + BigInt(ETHEREUM_SLOT_DURATION)]);
      const globalVariables = new GlobalVariables(
        new Fr(chainId),
        new Fr(config.version),
        new Fr(1 + i),
        new Fr(slot),
        new Fr(await rollup.read.getTimestampForSlot([slot])),
        coinbase,
        feeRecipient,
        GasFees.empty(),
      );
      const blockTicket = await buildBlock(globalVariables, txs, l1ToL2Messages);
      await prover.setBlockCompleted();
      const result = await blockTicket.provingPromise;
      expect(result.status).toBe(PROVING_STATUS.SUCCESS);
      const blockResult = await prover.finaliseBlock();
      const block = blockResult.block;
      prevHeader = block.header;
      blockSource.getL1ToL2Messages.mockResolvedValueOnce(l1ToL2Messages);
      blockSource.getBlocks.mockResolvedValueOnce([block]);

      writeJson(`empty_block_${block.number}`, block, [], AztecAddress.ZERO, deployerAccount.address);

      await publisher.processL2Block(block);

      const logs = await publicClient.getLogs({
        address: rollupAddress,
        event: getAbiItem({
          abi: RollupAbi,
          name: 'L2BlockProcessed',
        }),
        fromBlock: blockNumber + 1n,
      });
      expect(logs).toHaveLength(i + 1);
      expect(logs[i].args.blockNumber).toEqual(BigInt(i + 1));

      const ethTx = await publicClient.getTransaction({
        hash: logs[i].transactionHash!,
      });

      const expectedData =
        i == 0
          ? encodeFunctionData({
              abi: RollupAbi,
              functionName: 'publishAndProcess',
              args: [
                `0x${block.header.toBuffer().toString('hex')}`,
                `0x${block.archive.root.toBuffer().toString('hex')}`,
                `0x${block.body.toBuffer().toString('hex')}`,
              ],
            })
          : encodeFunctionData({
              abi: RollupAbi,
              functionName: 'process',
              args: [
                `0x${block.header.toBuffer().toString('hex')}`,
                `0x${block.archive.root.toBuffer().toString('hex')}`,
              ],
            });
      expect(ethTx.input).toEqual(expectedData);

      await setTimeToNextSlot();
    }
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
