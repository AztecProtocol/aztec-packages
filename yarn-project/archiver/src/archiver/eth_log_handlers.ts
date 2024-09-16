import { Body, InboxLeaf, L2Block, type ViemSignature } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, Header, Proof } from '@aztec/circuits.js';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { numToUInt32BE } from '@aztec/foundation/serialize';
import { InboxAbi, RollupAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type Log,
  type PublicClient,
  decodeFunctionData,
  getAbiItem,
  getAddress,
  hexToBytes,
} from 'viem';

import { type L1Published, type L1PublishedData } from './structs/published.js';

/**
 * Processes newly received MessageSent (L1 to L2) logs.
 * @param logs - MessageSent logs.
 * @returns Array of all processed MessageSent logs
 */
export function processMessageSentLogs(
  logs: Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[],
): InboxLeaf[] {
  const leaves: InboxLeaf[] = [];
  for (const log of logs) {
    const { l2BlockNumber, index, hash } = log.args;
    leaves.push(new InboxLeaf(l2BlockNumber, index, Fr.fromString(hash)));
  }
  return leaves;
}

/**
 * Processes newly received L2BlockProposed logs.
 * @param rollup - The rollup contract
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param logs - L2BlockProposed logs.
 * @returns - An array blocks.
 */
export async function processL2BlockProposedLogs(
  rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>,
  publicClient: PublicClient,
  logs: Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>[],
): Promise<L1Published<L2Block>[]> {
  const retrievedBlocks: L1Published<L2Block>[] = [];
  for (const log of logs) {
    const blockNum = log.args.blockNumber!;
    const archive = log.args.archive!;
    const archiveFromChain = await rollup.read.archiveAt([blockNum]);

    // The value from the event and contract will match only if the block is in the chain.
    if (archive === archiveFromChain) {
      // TODO: Fetch blocks from calldata in parallel
      const block = await getBlockFromRollupTx(publicClient, log.transactionHash!, blockNum);

      const l1: L1PublishedData = {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        timestamp: await getL1BlockTime(publicClient, log.blockNumber),
      };

      retrievedBlocks.push({ data: block, l1 });
    }
  }

  return retrievedBlocks;
}

export async function getL1BlockTime(publicClient: PublicClient, blockNumber: bigint): Promise<bigint> {
  const block = await publicClient.getBlock({ blockNumber, includeTransactions: false });
  return block.timestamp;
}

/**
 * Gets block from the calldata of an L1 transaction.
 * Assumes that the block was published from an EOA.
 * TODO: Add retries and error management.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param txHash - Hash of the tx that published it.
 * @param l2BlockNum - L2 block number.
 * @returns L2 block from the calldata, deserialized
 */
async function getBlockFromRollupTx(
  publicClient: PublicClient,
  txHash: `0x${string}`,
  l2BlockNum: bigint,
): Promise<L2Block> {
  const { input: data } = await publicClient.getTransaction({ hash: txHash });
  const { functionName, args } = decodeFunctionData({
    abi: RollupAbi,
    data,
  });

  if (!(functionName === 'propose')) {
    throw new Error(`Unexpected method called ${functionName}`);
  }
  const [headerHex, archiveRootHex, , , , bodyHex] = args! as readonly [Hex, Hex, Hex, Hex[], ViemSignature[], Hex];

  const header = Header.fromBuffer(Buffer.from(hexToBytes(headerHex)));
  const blockBody = Body.fromBuffer(Buffer.from(hexToBytes(bodyHex)));

  const blockNumberFromHeader = header.globalVariables.blockNumber.toBigInt();

  if (blockNumberFromHeader !== l2BlockNum) {
    throw new Error(`Block number mismatch: expected ${l2BlockNum} but got ${blockNumberFromHeader}`);
  }

  const archive = AppendOnlyTreeSnapshot.fromBuffer(
    Buffer.concat([
      Buffer.from(hexToBytes(archiveRootHex)), // L2Block.archive.root
      numToUInt32BE(Number(l2BlockNum + 1n)), // L2Block.archive.nextAvailableLeafIndex
    ]),
  );

  return new L2Block(archive, header, blockBody);
}

/**
 * Gets relevant `L2BlockProposed` logs from chain.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param rollupAddress - The address of the rollup contract.
 * @param fromBlock - First block to get logs from (inclusive).
 * @param toBlock - Last block to get logs from (inclusive).
 * @returns An array of `L2BlockProposed` logs.
 */
export function getL2BlockProposedLogs(
  publicClient: PublicClient,
  rollupAddress: EthAddress,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log<bigint, number, false, undefined, true, typeof RollupAbi, 'L2BlockProposed'>[]> {
  return publicClient.getLogs({
    address: getAddress(rollupAddress.toString()),
    event: getAbiItem({
      abi: RollupAbi,
      name: 'L2BlockProposed',
    }),
    fromBlock,
    toBlock: toBlock + 1n, // the toBlock argument in getLogs is exclusive
  });
}

/**
 * Get relevant `MessageSent` logs emitted by Inbox on chain.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param inboxAddress - The address of the inbox contract.
 * @param fromBlock - First block to get logs from (inclusive).
 * @param toBlock - Last block to get logs from (inclusive).
 * @returns An array of `MessageSent` logs.
 */
export function getMessageSentLogs(
  publicClient: PublicClient,
  inboxAddress: EthAddress,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<Log<bigint, number, false, undefined, true, typeof InboxAbi, 'MessageSent'>[]> {
  return publicClient.getLogs({
    address: getAddress(inboxAddress.toString()),
    event: getAbiItem({
      abi: InboxAbi,
      name: 'MessageSent',
    }),
    fromBlock,
    toBlock: toBlock + 1n, // the toBlock argument in getLogs is exclusive
  });
}

export type SubmitBlockProof = {
  header: Header;
  archiveRoot: Fr;
  proverId: Fr;
  aggregationObject: Buffer;
  proof: Proof;
};

/**
 * Gets block metadata (header and archive snapshot) from the calldata of an L1 transaction.
 * Assumes that the block was published from an EOA.
 * TODO: Add retries and error management.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param txHash - Hash of the tx that published it.
 * @param l2BlockNum - L2 block number.
 * @returns L2 block metadata (header and archive) from the calldata, deserialized
 */
export async function getBlockProofFromSubmitProofTx(
  publicClient: PublicClient,
  txHash: `0x${string}`,
  l2BlockNum: bigint,
  expectedProverId: Fr,
): Promise<SubmitBlockProof> {
  const { input: data } = await publicClient.getTransaction({ hash: txHash });
  const { functionName, args } = decodeFunctionData({
    abi: RollupAbi,
    data,
  });

  if (!(functionName === 'submitBlockRootProof')) {
    throw new Error(`Unexpected method called ${functionName}`);
  }
  const [headerHex, archiveHex, proverIdHex, aggregationObjectHex, proofHex] = args!;

  const header = Header.fromBuffer(Buffer.from(hexToBytes(headerHex)));
  const proverId = Fr.fromString(proverIdHex);

  const blockNumberFromHeader = header.globalVariables.blockNumber.toBigInt();
  if (blockNumberFromHeader !== l2BlockNum) {
    throw new Error(`Block number mismatch: expected ${l2BlockNum} but got ${blockNumberFromHeader}`);
  }
  if (!proverId.equals(expectedProverId)) {
    throw new Error(`Prover ID mismatch: expected ${expectedProverId} but got ${proverId}`);
  }

  return {
    header,
    proverId,
    aggregationObject: Buffer.from(hexToBytes(aggregationObjectHex)),
    archiveRoot: Fr.fromString(archiveHex),
    proof: Proof.fromBuffer(Buffer.from(hexToBytes(proofHex))),
  };
}
