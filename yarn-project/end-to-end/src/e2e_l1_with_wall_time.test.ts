import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { type InitialAccountData } from '@aztec/accounts/testing';
import { FeeJuicePaymentMethod, type Logger, type PXE, TxStatus } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/circuits.js';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { type PXEService } from '@aztec/pxe';

import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

describe('e2e_l1_with_wall_time', () => {
  let logger: Logger;
  let teardown: () => Promise<void>;
  let pxe: PXE;
  let initialFundedAccounts: InitialAccountData[];

  const deploymentsPerBlock = 8;
  const numberOfBlocks = 4;

  beforeEach(async () => {
    const account = privateKeyToAccount(`0x${getPrivateKeyFromIndex(0)!.toString('hex')}`);
    const initialValidators = [EthAddress.fromString(account.address)];
    const { ethereumSlotDuration } = getL1ContractsConfigEnvVars();

    ({ teardown, logger, pxe, initialFundedAccounts } = await setup(0, {
      initialValidators,
      ethereumSlotDuration,
      salt: 420,
      numberOfInitialFundedAccounts: deploymentsPerBlock * numberOfBlocks,
    }));
  });

  afterEach(() => teardown());

  it('should produce blocks with a bunch of transactions', async () => {
    for (let i = 0; i < numberOfBlocks; i++) {
      const txs = await submitTxsTo(
        pxe as PXEService,
        initialFundedAccounts.slice(i * deploymentsPerBlock, (i + 1) * deploymentsPerBlock),
      );
      await Promise.all(
        txs.map(async (tx, j) => {
          logger.info(`Waiting for tx ${i}-${j}: ${await tx.getTxHash()} to be mined`);
          return tx.wait();
        }),
      );
    }
  });

  // submits a set of transactions to the provided Private eXecution Environment (PXE)
  const submitTxsTo = async (pxe: PXEService, accounts: InitialAccountData[]) => {
    return await Promise.all(
      accounts.map(async account => {
        const accountManager = await getSchnorrAccount(pxe, account.secret, account.signingKey, account.salt);
        const paymentMethod = new FeeJuicePaymentMethod(account.address);
        const tx = accountManager.deploy({ fee: { paymentMethod } });
        const txHash = await tx.getTxHash();
        logger.info(`Tx sent with hash ${txHash}`);

        const receipt = await tx.getReceipt();
        expect(receipt).toEqual(
          expect.objectContaining({
            status: TxStatus.PENDING,
            error: '',
          }),
        );
        logger.info(`Receipt received for ${txHash}`);

        return tx;
      }),
    );
  };
});
