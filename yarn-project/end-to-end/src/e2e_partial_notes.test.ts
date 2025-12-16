import type { AccountWallet, AztecAddress, Logger } from '@aztec/aztec.js';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

describe('partial notes', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let logger: Logger;

  let adminWallet: AccountWallet;

  let adminAddress: AztecAddress;
  let liquidityProviderAddress: AztecAddress;

  let token0: TokenContract;

  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    ({
      teardown,
      wallets: [adminWallet],
      accounts: [adminAddress, liquidityProviderAddress],
      logger,
    } = await setup(2));

    token0 = await deployToken(adminWallet, adminAddress, 0n, logger);
  });

  afterAll(() => teardown());

  it('mint to private', async () => {
    await mintTokensToPrivate(token0, adminAddress, adminWallet, liquidityProviderAddress, INITIAL_TOKEN_BALANCE);
    expect(
      await token0.methods.balance_of_private(liquidityProviderAddress).simulate({ from: liquidityProviderAddress }),
    ).toEqual(INITIAL_TOKEN_BALANCE);
  });
});
