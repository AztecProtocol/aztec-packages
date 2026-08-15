import { generateClaimSecret } from '@aztec/aztec.js/ethereum';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { InboxAbi } from '@aztec/l1-artifacts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import { decodeEventLog, getContract } from 'viem';

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
