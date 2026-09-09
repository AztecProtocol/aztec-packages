import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import { MULTI_CALL_3_ADDRESS } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { InboxAbi } from '@aztec/l1-artifacts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { type Hex, decodeEventLog, encodeFunctionData, getContract, multicall3Abi, parseEventLogs } from 'viem';

import type { BotStore, PendingL1ToL2Message } from './store/index.js';

/** Sends an L1→L2 message via the Inbox contract and stores it. */
export async function seedL1ToL2Message(
  l1Client: ExtendedViemWalletClient,
  inboxAddress: EthAddress,
  l2Recipient: AztecAddress,
  rollupVersion: bigint,
  store: BotStore,
  log: Logger,
): Promise<PendingL1ToL2Message> {
  log.info('Seeding L1→L2 message');
  const [secret, secretHash] = await generateClaimSecret(log);
  const content = Fr.random();

  const inbox = getContract({
    address: inboxAddress.toString(),
    abi: InboxAbi,
    client: l1Client,
  });

  const txHash = await inbox.write.sendL2Message(
    [{ actor: l2Recipient.toString(), version: rollupVersion }, content.toString(), secretHash.toString()],
    { gas: 1_000_000n },
  );
  log.info(`L1→L2 message sent in tx ${txHash}`);

  const txReceipt = await l1Client.waitForTransactionReceipt({ hash: txHash });
  if (txReceipt.status !== 'success') {
    throw new Error(`L1→L2 message tx failed: ${txHash}`);
  }

  // Extract MessageSent event
  const messageSentLogs = compactArray(
    txReceipt.logs
      .filter(l => l.address.toLowerCase() === inboxAddress.toString().toLowerCase())
      .map(l => {
        try {
          return decodeEventLog({ abi: InboxAbi, eventName: 'MessageSent', data: l.data, topics: l.topics });
        } catch {
          return undefined;
        }
      }),
  );

  if (messageSentLogs.length !== 1) {
    throw new Error(`Expected 1 MessageSent event, got ${messageSentLogs.length}`);
  }

  const event = messageSentLogs[0];

  const msgHash = event.args.hash;
  const globalLeafIndex = event.args.message.index;

  const msg: PendingL1ToL2Message = {
    content: content.toString(),
    secret: secret.toString(),
    secretHash: secretHash.toString(),
    msgHash,
    sender: l1Client.account!.address,
    globalLeafIndex: globalLeafIndex.toString(),
    timestamp: Date.now(),
  };

  await store.savePendingL1ToL2Message(msg);
  log.info(`Seeded L1→L2 message msgHash=${msg.msgHash}`);
  return msg;
}

/** Content and claim secret of a message the bot is about to send. */
export interface L1ToL2MessageIntent {
  content: Fr;
  secret: Fr;
  secretHash: Fr;
}

/** One `MessageSent` event decoded from a batched Inbox send. */
export interface SentInboxMessage {
  msgHash: string;
  /** Global leaf index of the message in the L1→L2 message tree. */
  globalLeafIndex: bigint;
  /** Inbox bucket the message was absorbed into. */
  bucketSeq: bigint;
  content: string;
  secretHash: string;
  /** L1 address the Inbox recorded as the sender. For a batched send this is the Multicall3 contract. */
  sender: string;
  recipient: string;
  version: bigint;
}

/** Outcome of a batched Inbox send, once its L1 transaction is mined. */
export interface L1ToL2MessageBatchReceipt {
  txHash: string;
  l1BlockNumber: bigint;
  l1BlockHash: string;
  /** L1 block timestamp in seconds. */
  l1BlockTimestamp: bigint;
  gasUsed: bigint;
  status: 'success' | 'reverted';
  messages: SentInboxMessage[];
}

/** A way in which a mined batch failed to match the intent that was persisted before broadcasting it. */
export interface L1ToL2MessageBatchMismatch {
  kind: 'count' | 'indices' | 'recipient' | 'version' | 'sender' | 'content' | 'secret_hash';
  detail: string;
}

/**
 * Headroom over the gas estimate. An Inbox insert that completes a subtree of the frontier tree cascades through
 * cold slots and costs up to ~40k gas more than a cheap one, and where those boundaries fall depends on the global
 * message index the batch actually mines at, not the one it was estimated at. The flat floor covers a handful of
 * such crossings on a small batch, where a percentage alone would not.
 */
const BATCH_GAS_MARGIN_PERCENT = 20n;
const BATCH_GAS_MARGIN_FLOOR = 200_000n;

/** Generates `count` message intents with real claim secrets, so the messages can actually be consumed later. */
export async function generateL1ToL2MessageIntents(count: number, log: Logger): Promise<L1ToL2MessageIntent[]> {
  const intents: L1ToL2MessageIntent[] = [];
  for (let i = 0; i < count; i++) {
    const [secret, secretHash] = await generateClaimSecret(log);
    intents.push({ content: Fr.random(), secret, secretHash });
  }
  return intents;
}

/**
 * Throws unless Multicall3 is deployed at its canonical address on the target L1. Without the check an empty
 * `aggregate3` call to a bare address would succeed and silently send no messages at all.
 */
export async function assertMulticall3Deployed(l1Client: ExtendedViemWalletClient): Promise<void> {
  const code = await l1Client.getCode({ address: MULTI_CALL_3_ADDRESS });
  if (!code || code === '0x') {
    throw new Error(`Multicall3 is not deployed at ${MULTI_CALL_3_ADDRESS} on the target L1`);
  }
}

/** Encodes the `aggregate3` calldata that sends every intent through the Inbox in one atomic transaction. */
export function encodeL1ToL2MessageBatch(args: {
  inboxAddress: EthAddress;
  recipient: AztecAddress;
  rollupVersion: bigint;
  intents: readonly L1ToL2MessageIntent[];
}): Hex {
  const calls = args.intents.map(intent => ({
    target: args.inboxAddress.toString(),
    allowFailure: false,
    callData: encodeFunctionData({
      abi: InboxAbi,
      functionName: 'sendL2Message',
      args: [
        { actor: args.recipient.toString(), version: args.rollupVersion },
        intent.content.toString(),
        intent.secretHash.toString(),
      ],
    }),
  }));
  return encodeFunctionData({ abi: multicall3Abi, functionName: 'aggregate3', args: [calls] });
}

/**
 * Estimates the gas the batch needs and claims the next pending nonce for it. Both are resolved before the
 * transaction is broadcast so the caller can persist the nonce and reconcile an uncertain submission later.
 */
export async function prepareL1ToL2MessageBatch(args: {
  l1Client: ExtendedViemWalletClient;
  data: Hex;
}): Promise<{ gas: bigint; nonce: number }> {
  const account = args.l1Client.account;
  if (!account) {
    throw new Error(`L1 client has no account to send an Inbox batch from`);
  }
  const [estimate, nonce] = await Promise.all([
    args.l1Client.estimateGas({ account, to: MULTI_CALL_3_ADDRESS, data: args.data }),
    args.l1Client.getTransactionCount({ address: account.address, blockTag: 'pending' }),
  ]);
  const margin = (estimate * BATCH_GAS_MARGIN_PERCENT) / 100n;
  return { gas: estimate + (margin > BATCH_GAS_MARGIN_FLOOR ? margin : BATCH_GAS_MARGIN_FLOOR), nonce };
}

/** Waits for a batch transaction and decodes the `MessageSent` events the Inbox emitted for it. */
export async function awaitL1ToL2MessageBatch(args: {
  l1Client: ExtendedViemWalletClient;
  inboxAddress: EthAddress;
  txHash: Hex;
}): Promise<L1ToL2MessageBatchReceipt> {
  const inboxAddress = args.inboxAddress.toString().toLowerCase();
  const receipt = await args.l1Client.waitForTransactionReceipt({ hash: args.txHash });
  const block = await args.l1Client.getBlock({ blockNumber: receipt.blockNumber });
  const messages = parseEventLogs({
    abi: InboxAbi,
    eventName: 'MessageSent',
    logs: receipt.logs.filter(entry => entry.address.toLowerCase() === inboxAddress),
  }).map(entry => ({
    msgHash: entry.args.hash,
    globalLeafIndex: entry.args.message.index,
    bucketSeq: entry.args.bucketSeq,
    content: entry.args.message.content,
    secretHash: entry.args.message.secretHash,
    sender: entry.args.message.sender.actor,
    recipient: entry.args.message.recipient.actor,
    version: entry.args.message.recipient.version,
  }));

  return {
    txHash: receipt.transactionHash,
    l1BlockNumber: receipt.blockNumber,
    l1BlockHash: receipt.blockHash,
    l1BlockTimestamp: block.timestamp,
    gasUsed: receipt.gasUsed,
    status: receipt.status === 'success' ? 'success' : 'reverted',
    messages,
  };
}

/**
 * Sends every intent through the Inbox in a single atomic Multicall3 transaction and returns the mined receipt
 * with the decoded `MessageSent` events.
 *
 * The hooks let the caller make the submission durable at the two points where it becomes uncertain: the nonce is
 * claimed before broadcasting, and the transaction hash is known before the receipt arrives.
 */
export async function sendL1ToL2MessageBatch(args: {
  l1Client: ExtendedViemWalletClient;
  inboxAddress: EthAddress;
  recipient: AztecAddress;
  rollupVersion: bigint;
  intents: readonly L1ToL2MessageIntent[];
  log: Logger;
  onNonceClaimed?: (nonce: number) => Promise<void>;
  onBroadcast?: (txHash: Hex) => Promise<void>;
}): Promise<L1ToL2MessageBatchReceipt> {
  if (args.intents.length === 0) {
    throw new Error(`Cannot send an empty Inbox batch`);
  }
  const data = encodeL1ToL2MessageBatch(args);
  const { gas, nonce } = await prepareL1ToL2MessageBatch({ l1Client: args.l1Client, data });
  await args.onNonceClaimed?.(nonce);

  const txHash = await args.l1Client.sendTransaction({ to: MULTI_CALL_3_ADDRESS, data, gas, nonce });
  await args.onBroadcast?.(txHash);
  args.log.verbose(`Broadcast Inbox batch`, { txHash, nonce, gas, messageCount: args.intents.length });

  return await awaitL1ToL2MessageBatch({ l1Client: args.l1Client, inboxAddress: args.inboxAddress, txHash });
}

/**
 * Returns whether the given L1 block is still the canonical block at its height. A re-mined batch can land at a
 * different index, so any membership or index derived from a receipt is only valid while this holds.
 */
export async function isL1BlockCanonical(
  l1Client: ExtendedViemWalletClient,
  blockNumber: bigint,
  blockHash: string,
): Promise<boolean> {
  const block = await l1Client.getBlock({ blockNumber }).catch(() => undefined);
  return block?.hash?.toLowerCase() === blockHash.toLowerCase();
}

/**
 * Compares a mined batch against the intent that was persisted before it was broadcast. An empty result means the
 * receipt is trustworthy; anything else means the events do not describe the messages the bot meant to send, and
 * nothing derived from them may be used.
 */
export function validateL1ToL2MessageBatch(args: {
  intents: readonly L1ToL2MessageIntent[];
  messages: readonly SentInboxMessage[];
  recipient: AztecAddress;
  rollupVersion: bigint;
  expectedSender: string;
}): L1ToL2MessageBatchMismatch[] {
  const { intents, messages, recipient, rollupVersion, expectedSender } = args;
  const mismatches: L1ToL2MessageBatchMismatch[] = [];

  if (messages.length !== intents.length) {
    mismatches.push({
      kind: 'count',
      detail: `expected ${intents.length} MessageSent events, got ${messages.length}`,
    });
    return mismatches;
  }

  for (let i = 1; i < messages.length; i++) {
    if (messages[i].globalLeafIndex !== messages[i - 1].globalLeafIndex + 1n) {
      mismatches.push({
        kind: 'indices',
        detail: `index ${messages[i].globalLeafIndex} at position ${i} does not follow ${messages[i - 1].globalLeafIndex}`,
      });
      break;
    }
  }

  const expectedRecipient = recipient.toString().toLowerCase();
  for (const [i, message] of messages.entries()) {
    if (message.recipient.toLowerCase() !== expectedRecipient) {
      mismatches.push({ kind: 'recipient', detail: `position ${i} was sent to ${message.recipient}` });
    }
    if (message.version !== rollupVersion) {
      mismatches.push({ kind: 'version', detail: `position ${i} carries rollup version ${message.version}` });
    }
    if (message.sender.toLowerCase() !== expectedSender.toLowerCase()) {
      mismatches.push({ kind: 'sender', detail: `position ${i} was sent by ${message.sender}` });
    }
    if (message.content.toLowerCase() !== intents[i].content.toString().toLowerCase()) {
      mismatches.push({ kind: 'content', detail: `position ${i} carries unexpected content` });
    }
    if (message.secretHash.toLowerCase() !== intents[i].secretHash.toString().toLowerCase()) {
      mismatches.push({ kind: 'secret_hash', detail: `position ${i} carries an unexpected secret hash` });
    }
  }

  return mismatches;
}
