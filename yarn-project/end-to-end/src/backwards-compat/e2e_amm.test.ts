/**
 * Forward-compatibility variant of the AMM e2e test.
 *
 * Connects to a remote wallet (old release) over JSON-RPC and deploys
 * contracts compiled with the current Noir version. Exercises:
 *   - old loadContractArtifact parsing new JSON
 *   - old class-ID / artifact-hash computation
 *   - old ACIR simulator executing new bytecode
 *   - old entrypoint encoding
 *   - old wallet RPC deserialization
 *
 * Uses only the standard {@link Wallet} interface (no TestWallet).
 * Requires 3 pre-funded accounts from the wallet service.
 */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { createLogger } from '@aztec/aztec.js/log';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { createWalletClient } from '@aztec/aztec.js/wallet';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { deployToken, mintTokensToPrivate } from '../fixtures/token_utils.js';

const TIMEOUT = 300_000;

const { REMOTE_WALLET_URL = 'http://localhost:8081' } = process.env;

describe('backwards-compat: AMM', () => {
  jest.setTimeout(TIMEOUT);

  let logger: Logger;
  let wallet: Wallet;

  // With 3 pre-funded accounts: admin doubles as the first liquidity provider.
  let adminAddress: AztecAddress;
  let otherLiquidityProviderAddress: AztecAddress;
  let swapperAddress: AztecAddress;

  let token0: TokenContract;
  let token1: TokenContract;
  let liquidityToken: TokenContract;

  let amm: AMMContract;

  const INITIAL_AMM_TOTAL_SUPPLY = 100000n;
  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    logger = createLogger('e2e:backwards-compat:amm');

    wallet = createWalletClient(REMOTE_WALLET_URL);

    // The wallet service pre-registers the 3 initial test accounts.
    const accounts = (await wallet.getAccounts()).map(a => a.item);
    expect(accounts.length).toBeGreaterThanOrEqual(3);
    [adminAddress, otherLiquidityProviderAddress, swapperAddress] = accounts;

    logger.info('Deploying tokens and AMM...');

    ({ contract: token0 } = await deployToken(wallet, adminAddress, 0n, logger));
    ({ contract: token1 } = await deployToken(wallet, adminAddress, 0n, logger));
    ({ contract: liquidityToken } = await deployToken(wallet, adminAddress, 0n, logger));

    ({ contract: amm } = await AMMContract.deploy(wallet, token0.address, token1.address, liquidityToken.address).send({
      from: adminAddress,
    }));

    await liquidityToken.methods.set_minter(amm.address, true).send({ from: adminAddress });

    // Mint tokens for admin (who is also LP1), the other LP, and the swapper.
    await mintTokensToPrivate(token0, adminAddress, adminAddress, INITIAL_TOKEN_BALANCE);
    await mintTokensToPrivate(token1, adminAddress, adminAddress, INITIAL_TOKEN_BALANCE);

    await mintTokensToPrivate(token0, adminAddress, otherLiquidityProviderAddress, INITIAL_TOKEN_BALANCE);
    await mintTokensToPrivate(token1, adminAddress, otherLiquidityProviderAddress, INITIAL_TOKEN_BALANCE);

    await mintTokensToPrivate(token0, adminAddress, swapperAddress, INITIAL_TOKEN_BALANCE);
  });

  describe('full flow', () => {
    type Balance = {
      token0: bigint;
      token1: bigint;
    };

    async function getAmmBalances(): Promise<Balance> {
      return {
        token0: (await token0.methods.balance_of_public(amm.address).simulate({ from: adminAddress })).result,
        token1: (await token1.methods.balance_of_public(amm.address).simulate({ from: adminAddress })).result,
      };
    }

    async function getWalletBalances(lp: AztecAddress): Promise<Balance> {
      return {
        token0: (await token0.methods.balance_of_private(lp).simulate({ from: lp })).result,
        token1: (await token1.methods.balance_of_private(lp).simulate({ from: lp })).result,
      };
    }

    function assertBalancesDelta(before: Balance, after: Balance, delta: Balance) {
      expect(after.token0 - before.token0).toEqual(delta.token0);
      expect(after.token1 - before.token1).toEqual(delta.token1);
    }

    it('add initial liquidity', async () => {
      // Admin doubles as the first liquidity provider.
      const ammBalancesBefore = await getAmmBalances();
      const lpBalancesBefore = await getWalletBalances(adminAddress);

      const amount0Max = lpBalancesBefore.token0;
      const amount0Min = lpBalancesBefore.token0 / 2n;
      const amount1Max = lpBalancesBefore.token1;
      const amount1Min = lpBalancesBefore.token1 / 2n;

      const nonceForAuthwits = Fr.random();
      const token0Authwit = await wallet.createAuthWit(adminAddress, {
        caller: amm.address,
        call: await token0.methods
          .transfer_to_public_and_prepare_private_balance_increase(
            adminAddress,
            amm.address,
            amount0Max,
            nonceForAuthwits,
          )
          .getFunctionCall(),
      });
      const token1Authwit = await wallet.createAuthWit(adminAddress, {
        caller: amm.address,
        call: await token1.methods
          .transfer_to_public_and_prepare_private_balance_increase(
            adminAddress,
            amm.address,
            amount1Max,
            nonceForAuthwits,
          )
          .getFunctionCall(),
      });

      const addLiquidityInteraction = amm.methods
        .add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, nonceForAuthwits)
        .with({ authWitnesses: [token0Authwit, token1Authwit] });
      await addLiquidityInteraction.send({ from: adminAddress });

      const ammBalancesAfter = await getAmmBalances();
      const lpBalancesAfter = await getWalletBalances(adminAddress);

      assertBalancesDelta(ammBalancesBefore, ammBalancesAfter, { token0: amount0Max, token1: amount1Max });
      assertBalancesDelta(lpBalancesBefore, lpBalancesAfter, { token0: -amount0Max, token1: -amount1Max });

      const expectedLiquidityTokens = (INITIAL_AMM_TOTAL_SUPPLY * 99n) / 100n;
      expect(
        (await liquidityToken.methods.balance_of_private(adminAddress).simulate({ from: adminAddress })).result,
      ).toEqual(expectedLiquidityTokens);
      expect((await liquidityToken.methods.total_supply().simulate({ from: adminAddress })).result).toEqual(
        INITIAL_AMM_TOTAL_SUPPLY,
      );
    });

    it('add liquidity from another lp', async () => {
      const ammBalancesBefore = await getAmmBalances();
      const lpBalancesBefore = await getWalletBalances(otherLiquidityProviderAddress);

      const liquidityTokenSupplyBefore = (await liquidityToken.methods.total_supply().simulate({ from: adminAddress }))
        .result;

      const amount0Max = (lpBalancesBefore.token0 * 6n) / 10n;
      const amount0Min = (lpBalancesBefore.token0 * 4n) / 10n;
      const amount1Max = (lpBalancesBefore.token1 * 5n) / 10n;
      const amount1Min = (lpBalancesBefore.token1 * 4n) / 10n;

      const expectedAmount0 = amount1Max;
      const expectedAmount1 = amount1Max;

      const nonceForAuthwits = Fr.random();
      const token1Authwit = await wallet.createAuthWit(otherLiquidityProviderAddress, {
        caller: amm.address,
        call: await token0.methods
          .transfer_to_public_and_prepare_private_balance_increase(
            otherLiquidityProviderAddress,
            amm.address,
            amount0Max,
            nonceForAuthwits,
          )
          .getFunctionCall(),
      });
      const token2Authwit = await wallet.createAuthWit(otherLiquidityProviderAddress, {
        caller: amm.address,
        call: await token1.methods
          .transfer_to_public_and_prepare_private_balance_increase(
            otherLiquidityProviderAddress,
            amm.address,
            amount1Max,
            nonceForAuthwits,
          )
          .getFunctionCall(),
      });

      await amm.methods
        .add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, nonceForAuthwits)
        .send({ from: otherLiquidityProviderAddress, authWitnesses: [token1Authwit, token2Authwit] });

      const ammBalancesAfter = await getAmmBalances();
      const lpBalancesAfter = await getWalletBalances(otherLiquidityProviderAddress);

      assertBalancesDelta(ammBalancesBefore, ammBalancesAfter, { token0: expectedAmount0, token1: expectedAmount1 });
      assertBalancesDelta(lpBalancesBefore, lpBalancesAfter, { token0: -expectedAmount0, token1: -expectedAmount1 });

      const expectedTotalSupply =
        (liquidityTokenSupplyBefore * (ammBalancesBefore.token0 + expectedAmount0)) / ammBalancesBefore.token0;
      const expectedLiquidityTokens = expectedTotalSupply - INITIAL_AMM_TOTAL_SUPPLY;

      expect((await liquidityToken.methods.total_supply().simulate({ from: adminAddress })).result).toEqual(
        expectedTotalSupply,
      );
      expect(
        (
          await liquidityToken.methods
            .balance_of_private(otherLiquidityProviderAddress)
            .simulate({ from: otherLiquidityProviderAddress })
        ).result,
      ).toEqual(expectedLiquidityTokens);
    });

    it('swap exact tokens in', async () => {
      const swapperBalancesBefore = await getWalletBalances(swapperAddress);
      const ammBalancesBefore = await getAmmBalances();

      const amountIn = swapperBalancesBefore.token0 / 10n;

      const nonceForAuthwits = Fr.random();
      const swapAuthwit = await wallet.createAuthWit(swapperAddress, {
        caller: amm.address,
        call: await token0.methods
          .transfer_to_public(swapperAddress, amm.address, amountIn, nonceForAuthwits)
          .getFunctionCall(),
      });

      const amountOutMin = (
        await amm.methods
          .get_amount_out_for_exact_in(ammBalancesBefore.token0, ammBalancesBefore.token1, amountIn)
          .simulate({ from: swapperAddress })
      ).result;

      const swapExactTokensInteraction = amm.methods
        .swap_exact_tokens_for_tokens(token0.address, token1.address, amountIn, amountOutMin, nonceForAuthwits)
        .with({ authWitnesses: [swapAuthwit] });
      await swapExactTokensInteraction.send({ from: swapperAddress });

      const swapperBalancesAfter = await getWalletBalances(swapperAddress);
      assertBalancesDelta(swapperBalancesBefore, swapperBalancesAfter, { token0: -amountIn, token1: amountOutMin });
    });

    it('swap exact tokens out', async () => {
      const swapperBalancesBefore = await getWalletBalances(swapperAddress);
      const ammBalancesBefore = await getAmmBalances();

      const amountOut = (
        await amm.methods
          .get_amount_out_for_exact_in(ammBalancesBefore.token1, ammBalancesBefore.token0, swapperBalancesBefore.token1)
          .simulate({ from: swapperAddress })
      ).result;
      const amountInMax = swapperBalancesBefore.token1;

      const nonceForAuthwits = Fr.random();
      const swapAuthwit = await wallet.createAuthWit(swapperAddress, {
        caller: amm.address,
        call: await token1.methods
          .transfer_to_public_and_prepare_private_balance_increase(
            swapperAddress,
            amm.address,
            amountInMax,
            nonceForAuthwits,
          )
          .getFunctionCall(),
      });

      await amm.methods
        .swap_tokens_for_exact_tokens(token1.address, token0.address, amountOut, amountInMax, nonceForAuthwits)
        .send({ from: swapperAddress, authWitnesses: [swapAuthwit] });

      const swapperBalancesAfter = await getWalletBalances(swapperAddress);
      assertBalancesDelta(swapperBalancesBefore, swapperBalancesAfter, { token0: amountOut, token1: -amountInMax });

      expect(swapperBalancesAfter.token0).toBeLessThan(INITIAL_TOKEN_BALANCE);
    });

    it('remove liquidity', async () => {
      const liquidityTokenBalance = (
        await liquidityToken.methods
          .balance_of_private(otherLiquidityProviderAddress)
          .simulate({ from: otherLiquidityProviderAddress })
      ).result;

      const nonceForAuthwits = Fr.random();
      const liquidityAuthwit = await wallet.createAuthWit(otherLiquidityProviderAddress, {
        caller: amm.address,
        call: await liquidityToken.methods
          .transfer_to_public(otherLiquidityProviderAddress, amm.address, liquidityTokenBalance, nonceForAuthwits)
          .getFunctionCall(),
      });

      const amount0Min = 1n;
      const amount1Min = 1n;

      await amm.methods
        .remove_liquidity(liquidityTokenBalance, amount0Min, amount1Min, nonceForAuthwits)
        .send({ from: otherLiquidityProviderAddress, authWitnesses: [liquidityAuthwit] });

      expect(
        (
          await liquidityToken.methods
            .balance_of_private(otherLiquidityProviderAddress)
            .simulate({ from: otherLiquidityProviderAddress })
        ).result,
      ).toEqual(0n);

      const lpBalancesAfter = await getWalletBalances(otherLiquidityProviderAddress);
      expect(lpBalancesAfter.token0).toBeGreaterThan(INITIAL_TOKEN_BALANCE);
      expect(lpBalancesAfter.token1).toEqual(INITIAL_TOKEN_BALANCE);
    });
  });
});
