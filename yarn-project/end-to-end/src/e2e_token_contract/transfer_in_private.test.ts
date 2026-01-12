import { computeAuthWitMessageHash, computeInnerAuthWitHashFromAction } from '@aztec/aztec.js/authorization';
import { Fr } from '@aztec/aztec.js/fields';

import { DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract transfer private', () => {
  const t = new TokenContractTest('transfer_private');
  let { asset, tokenSim, wallet, adminAddress, account1Address, account2Address, badAccount } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ asset, tokenSim, wallet, adminAddress, account1Address, account2Address, badAccount } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('transfer on behalf of other', async () => {
    const balance0 = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    const authwitNonce = Fr.random();
    expect(amount).toBeGreaterThan(0n);

    // We need to compute the message we want to sign and add it to the wallet as approved
    const action = asset.methods.transfer_in_private(adminAddress, account1Address, amount, authwitNonce);

    const witness = await wallet.createAuthWit(adminAddress, { caller: account1Address, action });

    // Perform the transfer
    await action.send({ from: account1Address, authWitnesses: [witness] }).wait();
    tokenSim.transferPrivate(adminAddress, account1Address, amount);

    // Perform the transfer again, should fail
    const txReplay = asset.methods
      .transfer_in_private(adminAddress, account1Address, amount, authwitNonce)
      .send({ from: account1Address, authWitnesses: [witness] });
    await expect(txReplay.wait()).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });
});
