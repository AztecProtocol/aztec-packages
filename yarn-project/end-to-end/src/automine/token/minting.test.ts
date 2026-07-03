import type { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractFunctionInteraction } from '@aztec/aztec.js/contracts';

import { U128_OVERFLOW_ERROR } from '../../fixtures/fixtures.js';
import { TokenContractTest } from './token_contract_test.js';
import { type BalanceKind, balanceOf } from './token_test_helpers.js';

/** A mint path (public or private) with the differing method, balance kind, and simulator hooks. */
interface MintPath {
  name: string;
  balanceKind: BalanceKind;
  mint(recipient: AztecAddress, amount: bigint): ContractFunctionInteraction;
  updateSim(recipient: AztecAddress, amount: bigint): void;
  simBalance(account: AztecAddress): bigint;
}

// Covers public and private minting on Token, mirrored via describe.each: minter-role enforcement and u128
// overflow guards (recipient balance and total supply). The private-only ABI-encoding overflow case is kept
// explicit since it has no public mirror. Setup: single node with AutomineSequencer, 3 accounts, Token
// deployed (no initial mint).
describe('automine/token/minting', () => {
  const t = new TokenContractTest('minting');

  beforeAll(async () => {
    t.applyBaseSnapshots();
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  const paths: MintPath[] = [
    {
      name: 'Public',
      balanceKind: 'public',
      mint: (recipient, amount) => t.asset.methods.mint_to_public(recipient, amount),
      updateSim: (recipient, amount) => t.tokenSim.mintPublic(recipient, amount),
      simBalance: account => t.tokenSim.balanceOfPublic(account),
    },
    {
      name: 'Private',
      balanceKind: 'private',
      mint: (recipient, amount) => t.asset.methods.mint_to_private(recipient, amount),
      updateSim: (recipient, amount) => t.tokenSim.mintPrivate(recipient, amount),
      simBalance: account => t.tokenSim.balanceOfPrivate(account),
    },
  ];

  describe.each(paths)('$name', p => {
    // Mints 10000 tokens as the admin-minter and verifies balance and total supply via TokenSimulator.
    it('as minter', async () => {
      const amount = 10000n;
      await p.mint(t.adminAddress, amount).send({ from: t.adminAddress });

      p.updateSim(t.adminAddress, amount);
      expect(await balanceOf(t.asset, p.balanceKind, t.adminAddress)).toEqual(p.simBalance(t.adminAddress));
      expect((await t.asset.methods.total_supply().simulate({ from: t.adminAddress })).result).toEqual(
        t.tokenSim.totalSupply,
      );
    });

    describe('failure cases', () => {
      // Attempts to mint from account1 (not a minter); expects 'caller is not minter'.
      it('as non-minter', async () => {
        await expect(p.mint(t.adminAddress, 10000n).simulate({ from: t.account1Address })).rejects.toThrow(
          'Assertion failed: caller is not minter',
        );
      });

      // Mints an amount that would overflow the recipient's u128 balance; expects U128_OVERFLOW_ERROR.
      it('mint <u128 but recipient balance >u128', async () => {
        const amount = 2n ** 128n - p.simBalance(t.adminAddress);
        await expect(p.mint(t.adminAddress, amount).simulate({ from: t.adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });

      // Mints an amount that would overflow total supply across accounts; expects U128_OVERFLOW_ERROR.
      it('mint <u128 but such that total supply >u128', async () => {
        const amount = 2n ** 128n - p.simBalance(t.adminAddress);
        await expect(p.mint(t.account1Address, amount).simulate({ from: t.adminAddress })).rejects.toThrow(
          U128_OVERFLOW_ERROR,
        );
      });
    });
  });

  // Private-only: passing an overflowed u128 to mint_to_private fails at ABI encoding, not contract logic.
  // Kept as the only e2e test with overflowed inputs (no public mirror).
  it('mint >u128 tokens to overflow (private)', async () => {
    const overflowAmount = 2n ** 128n;
    await expect(
      t.asset.methods.mint_to_private(t.adminAddress, overflowAmount).simulate({ from: t.adminAddress }),
    ).rejects.toThrow('does not fit in u128');
  });
});
