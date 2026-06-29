import { AztecAddress, CompleteAddress } from '@aztec/aztec.js/addresses';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { TokenContract, type Transfer } from '@aztec/noir-contracts.js/Token';

import { TokenContractTest } from './token_contract_test.js';

// Covers the top-level transfer() entry point on Token contract (private-to-private), including transfer to
// non-deployed accounts and private Transfer event emission. Note: the describe title collides with
// transfer_in_private.test.ts — the tested contract methods differ (transfer vs transfer_in_private).
// Setup: single node with AutomineSequencer, 3 accounts, Token deployed with initial mint.
describe('automine/token/transfer', () => {
  const t = new TokenContractTest('transfer_private');
  let { asset, adminAddress, wallet, account1Address, tokenSim } = t;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    t.applyMintSnapshot();
    await t.setup();
    ({ asset, adminAddress, wallet, account1Address, tokenSim } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Transfers half of admin's private balance to account1, verifies via TokenSimulator, and asserts that
  // the private Transfer event is emitted and readable in the recipient's scope.
  it('transfer less than balance', async () => {
    const { result: balance0 } = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    const { receipt: txReceipt } = await asset.methods.transfer(account1Address, amount).send({ from: adminAddress });
    tokenSim.transferPrivate(adminAddress, account1Address, amount);

    const events = await wallet.getPrivateEvents<Transfer>(TokenContract.events.Transfer, {
      contractAddress: asset.address,
      fromBlock: txReceipt.blockNumber!,
      toBlock: BlockNumber(txReceipt.blockNumber! + 1),
      scopes: [account1Address],
    });

    expect(events[0]).toEqual({
      event: {
        from: adminAddress,
        to: account1Address,
        amount: amount,
      },
      metadata: {
        l2BlockNumber: txReceipt.blockNumber,
        l2BlockHash: txReceipt.blockHash,
        txHash: txReceipt.txHash,
      },
    });
  });

  // Transfers to a randomly generated non-deployed address. Because the recipient's keys aren't in the PXE,
  // the note can't be decrypted; TokenSimulator models this as a transfer to AztecAddress.ZERO.
  // TODO(F-741): the unconstrained delivery now establishes a non-interactive handshake, and checking the
  // non-deployed recipient's private balance throws "No public key registered". Handshake discovery
  // (get_shared_secrets) needs the scope's keys, which this PXE lacks for a foreign account.
  it.skip('transfer less than balance to non-deployed account', async () => {
    const { result: balance0 } = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);

    const nonDeployed = await CompleteAddress.random();

    await asset.methods.transfer(nonDeployed.address, amount).send({ from: adminAddress });

    // Add the account as balance we should change, but since we don't have the key,
    // we cannot decrypt, and instead we simulate a transfer to address(0)
    tokenSim.addAccount(nonDeployed.address);
    tokenSim.transferPrivate(adminAddress, AztecAddress.ZERO, amount);
  });

  // Transfers half of admin's balance to themselves and verifies the balance is unchanged.
  it('transfer to self', async () => {
    const { result: balance0 } = await asset.methods.balance_of_private(adminAddress).simulate({ from: adminAddress });
    const amount = balance0 / 2n;
    expect(amount).toBeGreaterThan(0n);
    await asset.methods.transfer(adminAddress, amount).send({ from: adminAddress });
    tokenSim.transferPrivate(adminAddress, adminAddress, amount);
  });

  // Error paths for transfer().
  describe('failure cases', () => {
    // Attempts to transfer more than private balance; expects 'Balance too low'.
    it('transfer more than balance', async () => {
      const { result: balance0 } = await asset.methods
        .balance_of_private(adminAddress)
        .simulate({ from: adminAddress });
      const amount = balance0 + 1n;
      expect(amount).toBeGreaterThan(0n);
      await expect(asset.methods.transfer(account1Address, amount).simulate({ from: adminAddress })).rejects.toThrow(
        'Assertion failed: Balance too low',
      );
    });

    it.skip('transfer into account to overflow', () => {
      // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
      // a way to get funds enough to overflow.
      // Require direct storage manipulation for us to perform a nice explicit case though.
      // See https://github.com/AztecProtocol/aztec-packages/issues/1259
    });
  });
});
