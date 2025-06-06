import { type ExtendedViemWalletClient, type L1ContractAddresses, RollupContract } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { tryJsonStringify } from '@aztec/foundation/json-rpc';
import { InboxAbi } from '@aztec/l1-artifacts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { decodeEventLog, getContract } from 'viem';

import { getLogger } from './utils.js';

export async function sendL1ToL2Message(
  message: { recipient: AztecAddress; content: Fr; secretHash: Fr },
  ctx: {
    l1Client: ExtendedViemWalletClient;
    l1ContractAddresses: Pick<L1ContractAddresses, 'inboxAddress' | 'rollupAddress'>;
  },
) {
  const logger = getLogger();
  const inbox = getContract({
    address: ctx.l1ContractAddresses.inboxAddress.toString(),
    abi: InboxAbi,
    client: ctx.l1Client,
  });

  const { recipient, content, secretHash } = message;

  const version = await new RollupContract(ctx.l1Client, ctx.l1ContractAddresses.rollupAddress.toString()).getVersion();

  // We inject the message to Inbox
  const txHash = await inbox.write.sendL2Message([
    { actor: recipient.toString(), version: BigInt(version) },
    content.toString(),
    secretHash.toString(),
  ]);
  logger.info(`L1 to L2 message sent in tx ${txHash}`);

  // We check that the message was correctly injected by checking the emitted event
  const txReceipt = await ctx.l1Client.waitForTransactionReceipt({ hash: txHash });

  logger.info(`L1 to L2 message receipt retrieved for tx ${txReceipt.transactionHash}`);

  if (txReceipt.transactionHash !== txHash) {
    throw new Error(`Receipt transaction hash mismatch: ${txReceipt.transactionHash} !== ${txHash}`);
  }

  // Exactly 1 event should be emitted in the transaction
  if (txReceipt.logs.length !== 1) {
    throw new Error(
      `Wrong number of logs found in ${txHash} transaction (got ${txReceipt.logs.length} expected 1)\n${tryJsonStringify(txReceipt.logs)}`,
    );
  }

  // We decode the event and get leaf out of it
  const messageSentLog = txReceipt.logs[0];
  const topics = decodeEventLog({
    abi: InboxAbi,
    data: messageSentLog.data,
    topics: messageSentLog.topics,
  });
  const receivedMsgHash = topics.args.hash;
  const receivedGlobalLeafIndex = topics.args.index;

  return { msgHash: Fr.fromHexString(receivedMsgHash), globalLeafIndex: new Fr(receivedGlobalLeafIndex), txReceipt };
}
