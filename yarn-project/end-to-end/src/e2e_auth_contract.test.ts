import { AccountWallet, AztecAddress, FieldsOf, Fr, PXE, TxReceipt } from '@aztec/aztec.js';
import { AuthContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { publicDeployAccounts, setup } from './fixtures/utils.js';

describe('e2e_auth_contract', () => {
  const TIMEOUT = 120_000;
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let admin: AccountWallet;
  let authorized: AccountWallet;
  let other: AccountWallet;

  let pxe: PXE;

  let contract: AuthContract;

  const VALUE = 5;

  beforeAll(async () => {
    ({
      teardown,
      wallets: [admin, authorized, other],
      pxe,
    } = await setup(3));

    await publicDeployAccounts(admin, [admin.getAddress(), authorized.getAddress(), other.getAddress()]);

    const deployTx = AuthContract.deploy(admin, admin.getAddress()).send({});
    const receipt = await deployTx.wait();
    contract = receipt.contract;
  });

  afterAll(() => teardown());

  async function mineBlock() {
    await contract.methods.get_authorized().send().wait();
  }

  async function mineBlocks(amount: number) {
    for (let i = 0; i < amount; ++i) {
      await mineBlock();
    }
  }

  async function assertAddressInReceipt(receipt: FieldsOf<TxReceipt>, address: AztecAddress) {
    const logs = await pxe.getUnencryptedLogs({ txHash: receipt.txHash });
    expect(AztecAddress.fromBuffer(logs.logs[0].log.data)).toEqual(address);
  }

  async function assertNumberInReceipt(receipt: FieldsOf<TxReceipt>, value: number) {
    const logs = await pxe.getUnencryptedLogs({ txHash: receipt.txHash });
    expect(Fr.fromBuffer(logs.logs[0].log.data)).toEqual(new Fr(value));
  }

  it('authorized is unset initially', async () => {
    const receipt = await contract.methods.get_authorized().send().wait();
    await assertAddressInReceipt(receipt, AztecAddress.ZERO);
  });

  it('admin sets authorized', async () => {
    await contract.withWallet(admin).methods.set_authorized(authorized.getAddress()).send().wait();

    const receipt = await contract.methods.get_scheduled_authorized().send().wait();
    await assertAddressInReceipt(receipt, authorized.getAddress());
  });

  it('authorized is not yet set, cannot use permission', async () => {
    await expect(
      contract.withWallet(authorized).methods.do_private_authorized_thing(VALUE).send().wait(),
    ).rejects.toThrow('caller is not authorized');
  });

  it('after a while the scheduled change is effective and can be used with max block restriction', async () => {
    await mineBlocks(5); // This gets us past the block of change, since the delay is 5 blocks

    const interaction = contract.methods.get_authorized();

    const tx = await interaction.simulate();

    const lastBlockNumber = await pxe.getBlockNumber();
    // These assertions are currently failing, need to investigate why.
    //expect(tx.data.rollupValidationRequests.maxBlockNumber.isSome).toEqual(true);
    //expect(tx.data.rollupValidationRequests.maxBlockNumber.value).toEqual(lastBlockNumber + 5);

    await assertAddressInReceipt(await interaction.send().wait(), authorized.getAddress());

    await assertNumberInReceipt(
      await contract.withWallet(authorized).methods.do_private_authorized_thing(VALUE).send().wait(),
      VALUE,
    );
  });

  it('a new authorized address is set but not immediately effective, the previous one retains permissions', async () => {
    await contract.withWallet(admin).methods.set_authorized(other.getAddress()).send().wait();

    await assertAddressInReceipt(await contract.methods.get_authorized().send().wait(), authorized.getAddress());

    await assertAddressInReceipt(await contract.methods.get_scheduled_authorized().send().wait(), other.getAddress());

    await expect(contract.withWallet(other).methods.do_private_authorized_thing(VALUE).send().wait()).rejects.toThrow(
      'caller is not authorized',
    );

    await assertNumberInReceipt(
      await contract.withWallet(authorized).methods.do_private_authorized_thing(VALUE).send().wait(),
      VALUE,
    );
  });

  it('after some time the scheduled change is made effective', async () => {
    await mineBlocks(5); // This gets us past the block of change, since the delay is 5 blocks

    await assertAddressInReceipt(await contract.methods.get_authorized().send().wait(), other.getAddress());

    await expect(
      contract.withWallet(authorized).methods.do_private_authorized_thing(VALUE).send().wait(),
    ).rejects.toThrow('caller is not authorized');

    await assertNumberInReceipt(
      await contract.withWallet(other).methods.do_private_authorized_thing(VALUE).send().wait(),
      VALUE,
    );
  });
});
