import { type ExtendedViemWalletClient, type L1ContractAddresses, RollupContract } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { InboxAbi } from '@aztec/l1-artifacts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { expect } from '@jest/globals';
import { decodeEventLog, getContract } from 'viem';

export async function sendL1ToL2Message(
  message: { recipient: AztecAddress; content: Fr; secretHash: Fr },
  ctx: {
    l1Client: ExtendedViemWalletClient;
    l1ContractAddresses: Pick<L1ContractAddresses, 'inboxAddress' | 'rollupAddress'>;
  },
) {
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

  // We check that the message was correctly injected by checking the emitted event
  const txReceipt = await ctx.l1Client.waitForTransactionReceipt({ hash: txHash });

  // Exactly 1 event should be emitted in the transaction
  expect(txReceipt.logs.length).toBe(1);

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
