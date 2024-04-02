import { AztecAddress, type Wallet } from '@aztec/aztec.js';
import { AvmTestContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 100_000;

describe('e2e_avm_simulator', () => {
  jest.setTimeout(TIMEOUT);

  let wallet: Wallet;
  let avmContact: AvmTestContract;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    ({ teardown, wallet } = await setup());
  }, 100_000);

  afterAll(() => teardown());

  beforeEach(async () => {
    avmContact = await AvmTestContract.deploy(wallet).send().deployed();
  }, 50_000);

  describe('Storage', () => {
    // FIX: Enable once the contract function works.
    // it('Read immutable (initialized) storage (Field)', async () => {
    //   expect(await avmContact.methods.view_storage_immutable().view()).toEqual(42n);
    // });

    it('Modifies storage (Field)', async () => {
      await avmContact.methods.set_storage_single(20n).send().wait();
      expect(await avmContact.methods.view_storage_single().view()).toEqual(20n);
    });

    it('Modifies storage (Map)', async () => {
      const address = AztecAddress.fromBigInt(9090n);
      await avmContact.methods.set_storage_map(address, 100).send().wait();
      await avmContact.methods.add_storage_map(address, 100).send().wait();
      expect(await avmContact.methods.view_storage_map(address).view()).toEqual(200n);
    });
  });

  describe('Nullifiers', () => {
    it('Emit and check', async () => {
      await avmContact.methods.emit_nullifier_and_check(123456).send().wait();
      // TODO: check NOT reverted
    });
  });
});
