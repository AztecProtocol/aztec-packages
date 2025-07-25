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

  const events = txReceipt.logs
    .filter(log => log.address === ctx.l1ContractAddresses.inboxAddress.toString())
    .map(log =>
      decodeEventLog({
        abi: InboxAbi,
        data: log.data,
        topics: log.topics,
      }),
    )
    .filter(event => event.eventName === 'MessageSent');

  // Exactly 1 `MessageSent` event should be emitted in the transaction
  if (events.length !== 1) {
    throw new Error(
      `Wrong number of 'MessageSent' logs found in ${txHash} transaction (got ${events.length} expected 1)\n${tryJsonStringify(events)}`,
    );
  }

  // Woah woah woah, this is not necessarily looking for the real thing! We need to match some of that first.
  // Need to look for events first, and find the one that actually matches.

  const messageSentLog = txReceipt.logs
    .filter(log => log.address === ctx.l1ContractAddresses.inboxAddress.toString())
    .map(log =>
      decodeEventLog({
        abi: InboxAbi,
        data: log.data,
        topics: log.topics,
      }),
    )
    .find(event => event.eventName === 'MessageSent');

  if (!messageSentLog) {
    throw new Error(`No MessageSent event found in ${txHash} transaction`);
  }

  const receivedMsgHash = messageSentLog.args.hash;
  const receivedGlobalLeafIndex = messageSentLog.args.index;

  return { msgHash: Fr.fromHexString(receivedMsgHash), globalLeafIndex: new Fr(receivedGlobalLeafIndex), txReceipt };
}
