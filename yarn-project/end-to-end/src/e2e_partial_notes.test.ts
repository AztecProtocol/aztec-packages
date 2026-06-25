import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

// Smoke test for the partial-note pattern: minting tokens into a private note via the
// Token contract's mint_to_private path. Single node with AutomineSequencer.
describe('partial notes', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let logger: Logger;

  let wallet: Wallet;

  let adminAddress: AztecAddress;
  let liquidityProviderAddress: AztecAddress;

  let token0: TokenContract;

  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [adminAddress, liquidityProviderAddress],
      logger,
    } = await setup(2, { ...AUTOMINE_E2E_OPTS }));

    const { contract } = await deployToken(wallet, adminAddress, 0n, logger);
    token0 = contract;
  });

  afterAll(() => teardown());

  // Calls mintTokensToPrivate to mint INITIAL_TOKEN_BALANCE tokens to the liquidity provider's
  // private balance via the partial-note flow, then asserts the private balance equals the mint amount.
  it('mint to private', async () => {
    await mintTokensToPrivate(token0, adminAddress, liquidityProviderAddress, INITIAL_TOKEN_BALANCE);
    expect(
      (await token0.methods.balance_of_private(liquidityProviderAddress).simulate({ from: liquidityProviderAddress }))
        .result,
    ).toEqual(INITIAL_TOKEN_BALANCE);
  });
});
