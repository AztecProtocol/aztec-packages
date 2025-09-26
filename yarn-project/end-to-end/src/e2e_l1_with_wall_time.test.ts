import { AztecAddress, EthAddress, Fr, type Logger } from '@aztec/aztec.js';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';
import { submitTxsTo } from './shared/submit-transactions.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_l1_with_wall_time', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;

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
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      },
    ];
    const { ethereumSlotDuration } = getL1ContractsConfigEnvVars();

    ({
      teardown,
      logger,
      wallet,
      accounts: [defaultAccountAddress],
    } = await setup(1, {
      initialValidators,
      ethereumSlotDuration,
      salt: 420,
    }));
  });

  afterEach(() => teardown());

  it('should produce blocks with a bunch of transactions', async () => {
    for (let i = 0; i < numberOfBlocks; i++) {
      const txs = await submitTxsTo(wallet, defaultAccountAddress, deploymentsPerBlock, logger);
      await Promise.all(
        txs.map(async (tx, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${(await tx.getTxHash()).toString()} to be mined`);
          return tx.wait();
        }),
      );
    }
  });
});
