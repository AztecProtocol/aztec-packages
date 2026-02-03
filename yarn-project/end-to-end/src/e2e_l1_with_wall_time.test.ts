import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
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
  let aztecNode: AztecNode;
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
      aztecNode,
      accounts: [defaultAccountAddress],
    } = await setup(1, {
      initialValidators,
      ethereumSlotDuration,
    }));
  });

  afterEach(() => teardown());

  it('should produce blocks with a bunch of transactions', async () => {
    for (let i = 0; i < numberOfBlocks; i++) {
      const txHashes = await submitTxsTo(wallet, defaultAccountAddress, deploymentsPerBlock, logger);
      await Promise.all(
        txHashes.map((hash, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${hash.toString()} to be mined`);
          return waitForTx(aztecNode, hash);
        }),
      );
    }
  });
});
