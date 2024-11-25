import { type AccountWallet, type DebugLogger, Fr } from '@aztec/aztec.js';
import { AMMContract, type TokenContract } from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';
import { describe } from 'node:test';

import { deployToken, mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

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

  afterAll(async () => await teardown());

  describe('full flow', () => {
    // This is an integration test in which we perform an entire run of the happy path. Thorough unit testing is not
    // included.
    it.only('add liquidity', async () => {
      const amount0Max = lpBalance0 / 2n;
      const amount1Max = lpBalance1 / 2n;
      const amount0Min = lpBalance0 / 3n;
      const amount1Min = lpBalance1 / 3n;

      // First we need to add authwits such that the AMM can transfer the tokens from the liquidity provider. These
      // authwits are for the full amount, since the AMM will first transfer that to itself, and later refund any excess
      // during public execution. Note that we need to tell the AMM of the nonce we used in the authwit.
      const nonceForAuthwits = Fr.random();

      await liquidityProvider.createAuthWit({
        caller: amm.address,
        action: token0.methods.transfer_to_public(
          liquidityProvider.getAddress(),
          amm.address,
          amount0Max,
          nonceForAuthwits,
        ),
      });
      await liquidityProvider.createAuthWit({
        caller: amm.address,
        action: token1.methods.transfer_to_public(
          liquidityProvider.getAddress(),
          amm.address,
          amount1Max,
          nonceForAuthwits,
        ),
      });

      await amm
        .withWallet(liquidityProvider)
        .methods.add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, nonceForAuthwits)
        .send()
        .wait();

      // Since the LP was the first one to enter the pool, the maximum amounts of tokens should have been deposited.
      expect(await token0.methods.balance_of_private(amm.address).simulate()).toEqual(
        amount0Max,
      );
      expect(await token0.methods.balance_of_private(liquidityProvider.getAddress()).simulate()).toEqual(
        lpBalance0 - amount0Max,
      );
      expect(await token1.methods.balance_of_private(amm.address).simulate()).toEqual(
        amount1Max,
      );
      expect(await token1.methods.balance_of_private(liquidityProvider.getAddress()).simulate()).toEqual(
        lpBalance1 - amount1Max,
      );

      // Liquidity tokens should also be minted for the liquidity provider, as well as locked at the zero address.
      expect(
        await liquidityToken.methods.balance_of_private(liquidityProvider.getAddress()).simulate(),
      ).toEqual(1000n);
      expect(
        await liquidityToken.methods.total_supply().simulate(),
      ).toEqual(100000n);
    });

    it('the rest', async () => {
      // SWAPPING EXACT TOKENS FOR TOKENS
      // We try swapping half of swapper's token 0 balance for token 1
      const amountIn = swapperBalance0 / 2n;

      // We need to add authwit such that the AMM can transfer the tokens from the swapper
      await swapper.createAuthWit({
        caller: amm.address,
        action: token0.methods.transfer_to_public(swapper.getAddress(), amm.address, amountIn, nonceForAuthwits),
      });

      // We don't care about the minimum amount of token 1 we get in this test as long as it's non-zero.
      const amountOutMin = 1n;
      await amm.methods
        .swap_exact_tokens_for_tokens(token0.address, token1.address, amountIn, amountOutMin, nonceForAuthwits)
        .send()
        .wait();

      // All the amountIn should have been swapped so LP balance0 should be decreased by that amount
      const lpBalance0AfterSwap1 = await token0.methods.balance_of_private(liquidityProvider.getAddress()).simulate();
      expect(lpBalance0AfterSwap1).toEqual(lpBalance0 - amountIn);

      // At this point a user should have a non-zero balance of token 1
      const lpBalance1AfterSwap1 = await token1.methods.balance_of_private(swapper.getAddress()).simulate();
      expect(lpBalance1AfterSwap1).toBeGreaterThan(0n);

      // SWAPPING TOKENS FOR EXACT TOKENS
      const amount0Out = 1000n;
      // We allow the AMM to take all our token1 balance (the difference will be refunded).
      const amount1InMax = lpBalance1AfterSwap1;

      // We need to add authwit such that the AMM can transfer the tokens from the swapper
      await swapper.createAuthWit({
        caller: amm.address,
        action: token1.methods.transfer_to_public(swapper.getAddress(), amm.address, amount1InMax, nonceForAuthwits),
      });

      await amm.methods
        .swap_tokens_for_exact_tokens(token1.address, token0.address, amount0Out, amount1InMax, nonceForAuthwits)
        .send()
        .wait();

      // We should have received the exact amount of token0
      expect(await token0.methods.balance_of_private(swapper.getAddress()).simulate()).toEqual(
        lpBalance0AfterSwap1 + amount0Out,
      );

      // We should have received a refund of token 1 (meaning we should have more than "previous balance - amount1InMax")
      expect(await token1.methods.balance_of_private(swapper.getAddress()).simulate()).toBeGreaterThan(
        lpBalance1AfterSwap1 - amount1InMax,
      );
    });
  });
});
