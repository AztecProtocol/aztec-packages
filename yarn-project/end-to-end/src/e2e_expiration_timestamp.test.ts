import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { AztecNode } from '@aztec/aztec.js/node';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum/config';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TX_ERROR_INVALID_EXPIRATION_TIMESTAMP } from '@aztec/stdlib/tx';

import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

describe('e2e_expiration_timestamp', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;
  let teardown: () => Promise<void>;

  let contract: TestContract;

  const aztecSlotDuration = BigInt(getL1ContractsConfigEnvVars().aztecSlotDuration);

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      aztecNode,
      accounts: [defaultAccountAddress],
    } = await setup());
    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
  });

  afterAll(() => teardown());

  describe('when requesting expiration timestamp higher than the one of a mined block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = await aztecNode.getBlockHeader('latest');
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // The timestamp of the next slot.
      expirationTimestamp = header.globalVariables.timestamp + aztecSlotDuration;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets the expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
        // Note: If the expected value doesn't match, it might be because the expirationTimestamp is rounded down.
        // See compute_tx_expiration_timestamp.ts for the rounding logic.
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods
          .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
          .send({ from: defaultAccountAddress });
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      it('does not invalidate the transaction', async () => {
        await contract.methods
          .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
          .send({ from: defaultAccountAddress });
      });
    });
  });

  describe('when requesting expiration timestamp lower than the next block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = await aztecNode.getBlockHeader('latest');
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // 1n lower than the next slot.
      expirationTimestamp = header.globalVariables.timestamp + aztecSlotDuration - 1n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods
            .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
            .send({ from: defaultAccountAddress }),
        ).rejects.toThrow(TX_ERROR_INVALID_EXPIRATION_TIMESTAMP);
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('sets expiration timestamp', async () => {
        const tx = await proveInteraction(
          wallet,
          contract.methods.set_expiration_timestamp(expirationTimestamp, enqueuePublicCall),
          { from: defaultAccountAddress },
        );
        expect(tx.data.expirationTimestamp).toEqual(expirationTimestamp);
      });

      it('invalidates the transaction', async () => {
        await expect(
          contract.methods
            .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
            .send({ from: defaultAccountAddress }),
        ).rejects.toThrow(TX_ERROR_INVALID_EXPIRATION_TIMESTAMP);
      });
    });
  });

  describe('when requesting expiration timestamp lower than the one of a mined block', () => {
    let expirationTimestamp: bigint;

    beforeEach(async () => {
      const header = await aztecNode.getBlockHeader('latest');
      if (!header) {
        throw new Error('Block header not found in the setup of e2e_expiration_timestamp.test.ts');
      }
      // 1n lower than the mined block.
      expirationTimestamp = header.globalVariables.timestamp - 1n;
    });

    describe('with no enqueued public calls', () => {
      const enqueuePublicCall = false;

      it('fails to prove the tx', async () => {
        await expect(
          contract.methods
            .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
            .send({ from: defaultAccountAddress }),
        ).rejects.toThrow();
      });
    });

    describe('with an enqueued public call', () => {
      const enqueuePublicCall = true;

      it('fails to prove the tx', async () => {
        await expect(
          contract.methods
            .set_expiration_timestamp(expirationTimestamp, enqueuePublicCall)
            .send({ from: defaultAccountAddress }),
        ).rejects.toThrow();
      });
    });
  });
});
