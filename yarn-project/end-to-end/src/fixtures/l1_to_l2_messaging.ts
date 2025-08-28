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
  const txHash = await inbox.write.sendL2Message(
    [{ actor: recipient.toString(), version: BigInt(version) }, content.toString(), secretHash.toString()],
    {
      gas: 1_000_000n,
    },
  );
  logger.info(`L1 to L2 message sent in tx ${txHash}`);

  // We check that the message was correctly injected by checking the emitted event
  const txReceipt = await ctx.l1Client.waitForTransactionReceipt({ hash: txHash });

  if (txReceipt.status !== 'success') {
    throw new Error(`L1 to L2 message failed to be sent in tx ${txHash}. Status: ${txReceipt.status}`);
  }

  logger.info(`L1 to L2 message receipt retrieved for tx ${txReceipt.transactionHash}`, txReceipt);

  if (txReceipt.transactionHash !== txHash) {
    throw new Error(`Receipt transaction hash mismatch: ${txReceipt.transactionHash} !== ${txHash}`);
  }

  // Filter for MessageSent events from the Inbox contract by trying to decode each log
  const messageSentLogs = txReceipt.logs
    .filter(log => log.address.toLowerCase() === ctx.l1ContractAddresses.inboxAddress.toString().toLowerCase())
    .map(log => {
      try {
        const decoded = decodeEventLog({
          abi: InboxAbi,
          data: log.data,
          topics: log.topics,
        });
        return { log, decoded };
      } catch {
        return null; // Not a decodable event from this ABI
      }
    })
    .filter((item): item is { log: any; decoded: any } => item !== null && item.decoded.eventName === 'MessageSent');

  if (messageSentLogs.length !== 1) {
    throw new Error(
      `Wrong number of MessageSent logs found in ${txHash} transaction (got ${messageSentLogs.length} expected 1)\n${tryJsonStringify(messageSentLogs.map(item => item.log))}`,
    );
  }

  // We already have the decoded event
  const topics = messageSentLogs[0].decoded;
  const receivedMsgHash = topics.args.hash;
  const receivedGlobalLeafIndex = topics.args.index;

  return { msgHash: Fr.fromHexString(receivedMsgHash), globalLeafIndex: new Fr(receivedGlobalLeafIndex), txReceipt };
}
