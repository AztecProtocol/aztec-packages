import { type Logger, type PXE } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/circuits.js';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { type PXEService } from '@aztec/pxe';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';
import { submitTxsTo } from './shared/submit-transactions.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_l1_with_wall_time', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let pxe: PXE;

  beforeEach(async () => {
    const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`);
    const initialValidators = [EthAddress.fromString(account.address)];
    const { ethereumSlotDuration } = getL1ContractsConfigEnvVars();

    ({ teardown, logger, pxe } = await setup(0, {
      initialValidators,
      ethereumSlotDuration,
      salt: 420,
    }));
  });

  afterEach(() => teardown());

  it('should produce blocks with a bunch of transactions', async () => {
    for (let i = 0; i < 4; i++) {
      const txs = await submitTxsTo(pxe as PXEService, 8, logger);
      await Promise.all(
        txs.map(async (tx, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait();
        }),
      );
    }
  });
});
