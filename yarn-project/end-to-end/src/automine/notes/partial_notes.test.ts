import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { TestTokenContract } from '@aztec/noir-test-contracts.js/TestToken';

import { jest } from '@jest/globals';

import { deployTestToken, mintTokensToPrivate } from '../../fixtures/token_utils.js';
import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 300_000;

// Smoke test for the partial-note pattern: minting tokens into a private note via the
// Token contract's mint_to_private path. Single node with AutomineSequencer.
describe('automine/notes/partial_notes', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let logger: Logger;

  let wallet: Wallet;

  let adminAddress: AztecAddress;
  let liquidityProviderAddress: AztecAddress;

  let token0: TestTokenContract;

  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    ({
      teardown,
      wallet,
      accounts: [adminAddress, liquidityProviderAddress],
      logger,
    } = (await AutomineTestContext.setup({ numberOfAccounts: 2 })).context);

    const { contract } = await deployTestToken(wallet, adminAddress, 0n, logger);
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
