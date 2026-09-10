import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { TransactionReceiptNotFoundError } from 'viem';

import { ViemInboxL1Producer } from './inbox_l1_producer.js';

describe('ViemInboxL1Producer', () => {
  const txHash = '0xcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd';

  /** Looking up a batch outcome only reads a receipt, so a stub of that one action is enough. */
  const producerWhose = async (getTransactionReceipt: () => Promise<unknown>) =>
    new ViemInboxL1Producer(
      { getTransactionReceipt } as unknown as ExtendedViemWalletClient,
      EthAddress.random(),
      await AztecAddress.random(),
      1n,
      createLogger('bot:inbox:l1:test'),
    );

  describe('getBatchOutcome', () => {
    it('reports a transaction the node has no receipt for as still pending', async () => {
      const producer = await producerWhose(() => Promise.reject(new TransactionReceiptNotFoundError({ hash: txHash })));

      await expect(producer.getBatchOutcome(txHash)).resolves.toBeUndefined();
    });

    it('propagates a transport failure rather than reporting the batch as pending', async () => {
      const producer = await producerWhose(() => Promise.reject(new Error('socket hang up')));

      await expect(producer.getBatchOutcome(txHash)).rejects.toThrow('socket hang up');
    });
  });
});
