import { type AztecAddress, Fr } from '@aztec/circuits.js';
import { type L1ContractAddresses } from '@aztec/ethereum';
import { InboxAbi } from '@aztec/l1-artifacts';

import { expect } from '@jest/globals';
import {
  type Account,
  type Chain,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  decodeEventLog,
  getContract,
} from 'viem';

export async function sendL1ToL2Message(
  message: { recipient: AztecAddress; content: Fr; secretHash: Fr },
  ctx: {
    walletClient: WalletClient<HttpTransport, Chain, Account>;
    publicClient: PublicClient<HttpTransport, Chain>;
    l1ContractAddresses: Pick<L1ContractAddresses, 'inboxAddress'>;
  },
) {
  const inbox = getContract({
    address: ctx.l1ContractAddresses.inboxAddress.toString(),
    abi: InboxAbi,
    client: ctx.walletClient,
  });

  const { recipient, content, secretHash } = message;
  const version = 1;

  // We inject the message to Inbox
  const txHash = await inbox.write.sendL2Message([
    { actor: recipient.toString(), version: BigInt(version) },
    content.toString(),
    secretHash.toString(),
  ]);

  // We check that the message was correctly injected by checking the emitted event
  const txReceipt = await ctx.publicClient.waitForTransactionReceipt({ hash: txHash });

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

  return [Fr.fromString(receivedMsgHash), new Fr(receivedGlobalLeafIndex)];
}
