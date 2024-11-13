import { type AccountWallet, type DebugLogger, Fr } from '@aztec/aztec.js';
import { AMMContract, type TokenContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// This is a very simple test checking only the happy path. More complete tests might be done in an unimaginably far
// future (and hence irrelevant) once I return from Patagonia.
describe('AMM', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let logger: DebugLogger;

  let adminWallet: AccountWallet;
  let liquidityProvider: AccountWallet;
  let swapper: AccountWallet;

  let token0: TokenContract;
  let token1: TokenContract;
  let liquidityToken: TokenContract;

  let amm: AMMContract;

  const lpBalance0 = 20000n;
  const lpBalance1 = 10000n;
  const swapperBalance0 = 5000n;

  beforeAll(async () => {
    let wallets: AccountWallet[];
    ({ teardown, wallets, logger } = await setup(3));
    [adminWallet, liquidityProvider, swapper] = wallets;

    token0 = await deployToken(adminWallet, 0n, logger);
    token1 = await deployToken(adminWallet, 0n, logger);
    liquidityToken = await deployToken(adminWallet, 0n, logger);

    amm = await AMMContract.deploy(adminWallet, token0.address, token1.address, liquidityToken.address)
      .send()
      .deployed();

    // We mint the tokens to lp and swapper
    await mintTokensToPrivate(token0, adminWallet, liquidityProvider.getAddress(), lpBalance0);
    await mintTokensToPrivate(token1, adminWallet, liquidityProvider.getAddress(), lpBalance1);
    await mintTokensToPrivate(token0, adminWallet, swapper.getAddress(), swapperBalance0);
  });

  afterAll(() => teardown());

  it('full flow', async () => {
    // ADDING LIQUIDITY
    // Ideally we would like to deposit all the tokens from the liquidity provider
    const amount0Desired = lpBalance0;
    const amount1Desired = lpBalance1;
    const amount0Min = lpBalance0 / 2n;
    const amount1Min = lpBalance1 / 2n;

    // First we need to add authwits such that the AMM can transfer the tokens from the liquidity provider
    // The only purpose of this nonce is to make the authwit unique (function args are part of authwit hash preimage)
    const nonceForAuthwits = Fr.random();

    await liquidityProvider.createAuthWit({
      caller: amm.address,
      action: token0.methods.transfer_to_public(
        liquidityProvider.getAddress(),
        amm.address,
        amount0Desired,
        nonceForAuthwits,
      ),
    });
    await liquidityProvider.createAuthWit({
      caller: amm.address,
      action: token1.methods.transfer_to_public(
        liquidityProvider.getAddress(),
        amm.address,
        amount1Desired,
        nonceForAuthwits,
      ),
    });

    await amm
      .withWallet(liquidityProvider)
      .methods.add_liquidity(amount0Desired, amount1Desired, amount0Min, amount1Min, nonceForAuthwits)
      .send()
      .wait();
  });
});
