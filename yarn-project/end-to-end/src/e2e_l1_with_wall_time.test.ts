import { EthAddress, type Logger, type PXE, type Wallet } from '@aztec/aztec.js';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import type { PXEService } from '@aztec/pxe/server';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';
import { submitTxsTo } from './shared/submit-transactions.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_l1_with_wall_time', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let pxe: PXE;

  const deploymentsPerBlock = 8;
  const numberOfBlocks = 4;

  beforeEach(async () => {
    const privateKey = `0x${getPrivateKeyFromIndex(0)!.toString('hex')}` as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    const initialValidators = [
      {
        attester: EthAddress.fromString(account.address),
        withdrawer: EthAddress.fromString(account.address),
        privateKey,
      },
    ];
    const { ethereumSlotDuration } = getL1ContractsConfigEnvVars();

    ({ teardown, logger, wallet, pxe } = await setup(1, {
      initialValidators,
      ethereumSlotDuration,
      salt: 420,
    }));
  });

  afterEach(() => teardown());

  it('should produce blocks with a bunch of transactions', async () => {
    for (let i = 0; i < numberOfBlocks; i++) {
      const txs = await submitTxsTo(pxe as PXEService, deploymentsPerBlock, wallet, logger);
      await Promise.all(
        txs.map(async (tx, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait();
        }),
      );
    }
  });
});
