import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { TestTokenContract } from '@aztec/noir-test-contracts.js/TestToken';

import { jest } from '@jest/globals';

import { deployTestToken, mintTokensToPrivate } from '../../fixtures/token_utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';

const TIMEOUT = 900_000;

// End-to-end test for the AMM contract: liquidity provisioning, swaps, and removal.
// Uses setup(4, AUTOMINE_E2E_OPTS, {syncChainTip:'checkpointed'}) providing one node with automine
// sequencer, four funded accounts (admin, two LPs, swapper), and three deployed Token contracts.
// TODO(F-560): Consider whether it makes sense to drop this
// https://linear.app/aztec-labs/issue/F-560/add-more-tests-to-forward-compatibility-testing
describe('automine/token/amm', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let logger: Logger;

  let wallet: TestWallet;

  let adminAddress: AztecAddress;
  let liquidityProviderAddress: AztecAddress;
  let otherLiquidityProviderAddress: AztecAddress;
  let swapperAddress: AztecAddress;

  let token0: TestTokenContract;
  let token1: TestTokenContract;
  let liquidityToken: TestTokenContract;

  let amm: AMMContract;

  const INITIAL_AMM_TOTAL_SUPPLY = 100000n;

  // We need a large token amount so that the swap fee (0.3%) is observable.
  const INITIAL_TOKEN_BALANCE = 1_000_000_000n;

  beforeAll(async () => {
    // Anchor the PXE to the checkpointed tip rather than the proposed tip. Under pipelining the
    // proposed tip can be pruned when a slot ends without a checkpoint landing on L1 (e.g. when a
    // time warp races `Sequencer.work`'s two epoch-cache reads and the wait-for-parent gate ends up
    // pointing at the wrong slot). The checkpointed tip is L1-confirmed and cannot be pruned, so
    // inflight setup txs survive the race.
    ({
      teardown,
      wallet,
      accounts: [adminAddress, liquidityProviderAddress, otherLiquidityProviderAddress, swapperAddress],
      logger,
    } = (await AutomineTestContext.setup({ numberOfAccounts: 4, pxeOpts: { syncChainTip: 'checkpointed' } })).context);

    ({ contract: token0 } = await deployTestToken(wallet, adminAddress, 0n, logger));
    ({ contract: token1 } = await deployTestToken(wallet, adminAddress, 0n, logger));
    ({ contract: liquidityToken } = await deployTestToken(wallet, adminAddress, 0n, logger));

    ({ contract: amm } = await AMMContract.deploy(wallet, token0.address, token1.address, liquidityToken.address).send({
      from: adminAddress,
    }));

    // TODO(#9480): consider deploying the token by some factory when the AMM is deployed, and making the AMM be the
    // minter there.
    await liquidityToken.methods.set_minter(amm.address, true).send({ from: adminAddress });

    // We mint the tokens to both liquidity providers and the swapper
    await mintTokensToPrivate(token0, adminAddress, liquidityProviderAddress, INITIAL_TOKEN_BALANCE);
    await mintTokensToPrivate(token1, adminAddress, liquidityProviderAddress, INITIAL_TOKEN_BALANCE);

    await mintTokensToPrivate(token0, adminAddress, otherLiquidityProviderAddress, INITIAL_TOKEN_BALANCE);
    await mintTokensToPrivate(token1, adminAddress, otherLiquidityProviderAddress, INITIAL_TOKEN_BALANCE);

    // Note that the swapper only holds token0, not token1
    await mintTokensToPrivate(token0, adminAddress, swapperAddress, INITIAL_TOKEN_BALANCE);
  });

  afterAll(() => teardown());

  // Happy-path integration covering all AMM operations in sequence: initial liquidity,
  // second LP entering, exact-in swap, exact-out swap, and LP withdrawal. Tests are ordered
  // and share state; they must run sequentially in this describe block.
  describe('full flow', () => {
    // This is an integration test in which we perform an entire run of the happy path. Thorough unit testing is not
    // included.

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

    // First LP deposits maximum token0 and token1, receiving (99/100)*TOTAL_SUPPLY liquidity tokens.
    // Verifies AMM and LP balances shift by the full deposited amounts.
    it('add initial liquidity', async () => {
      const ammBalancesBefore = await getAmmBalances();
      const lpBalancesBefore = await getWalletBalances(liquidityProviderAddress);

      const amount0Max = lpBalancesBefore.token0;
      const amount0Min = lpBalancesBefore.token0 / 2n;
      const amount1Max = lpBalancesBefore.token1;
      const amount1Min = lpBalancesBefore.token1 / 2n;

      // First we need to add authwits such that the AMM can transfer the tokens from the liquidity provider. These
      // authwits are for the full amount, since the AMM will first transfer that to itself, and later refund any
      // excess during public execution.
      const nonceForAuthwits = Fr.random();
      const token0Authwit = await wallet.createAuthWit(liquidityProviderAddress, {
        caller: amm.address,
        action: token0.methods.transfer_to_public_and_prepare_private_balance_increase(
          liquidityProviderAddress,
          amm.address,
          amount0Max,
          nonceForAuthwits,
        ),
      });
      const token1Authwit = await wallet.createAuthWit(liquidityProviderAddress, {
        caller: amm.address,
        action: token1.methods.transfer_to_public_and_prepare_private_balance_increase(
          liquidityProviderAddress,
          amm.address,
          amount1Max,
          nonceForAuthwits,
        ),
      });

      const addLiquidityInteraction = amm.methods
        .add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, nonceForAuthwits)
        .with({ authWitnesses: [token0Authwit, token1Authwit] });
      await addLiquidityInteraction.send({ from: liquidityProviderAddress });

      const ammBalancesAfter = await getAmmBalances();
      const lpBalancesAfter = await getWalletBalances(liquidityProviderAddress);

      // Since the LP was the first one to enter the pool, the maximum amounts of tokens should have been deposited as
      // there is no prior token ratio to follow.
      assertBalancesDelta(ammBalancesBefore, ammBalancesAfter, { token0: amount0Max, token1: amount1Max });
      assertBalancesDelta(lpBalancesBefore, lpBalancesAfter, { token0: -amount0Max, token1: -amount1Max });

      // Liquidity tokens should also be minted for the liquidity provider, as well as locked at the zero address.
      const expectedLiquidityTokens = (INITIAL_AMM_TOTAL_SUPPLY * 99n) / 100n;
      expect(
        (
          await liquidityToken.methods
            .balance_of_private(liquidityProviderAddress)
            .simulate({ from: liquidityProviderAddress })
        ).result,
      ).toEqual(expectedLiquidityTokens);
      expect((await liquidityToken.methods.total_supply().simulate({ from: adminAddress })).result).toEqual(
        INITIAL_AMM_TOTAL_SUPPLY,
      );
    });

    // Second LP enters with a mismatched max ratio (6:5). The AMM uses the 1:1 pool ratio,
    // refunds excess token0, and mints proportional liquidity tokens.
    it('add liquidity from another lp', async () => {
      // This is the same as when we add liquidity for the first time, but we'll be going through a different code path
      // since total supply for the liquidity token is non-zero

      const ammBalancesBefore = await getAmmBalances();
      const lpBalancesBefore = await getWalletBalances(otherLiquidityProviderAddress);

      const liquidityTokenSupplyBefore = (await liquidityToken.methods.total_supply().simulate({ from: adminAddress }))
        .result;

      // The pool currently has the same number of tokens for token0 and token1, since that is the ratio the first
      // liquidity provider used. Our maximum values have a different ratio (6:5 instead of 1:1), so we will end up
      // adding the maximum amount that does result in the correct ratio (i.e. using amount1Max and a 1:1 ratio).
      const amount0Max = (lpBalancesBefore.token0 * 6n) / 10n;
      const amount0Min = (lpBalancesBefore.token0 * 4n) / 10n;
      const amount1Max = (lpBalancesBefore.token1 * 5n) / 10n;
      const amount1Min = (lpBalancesBefore.token1 * 4n) / 10n;

      const expectedAmount0 = amount1Max;
      const expectedAmount1 = amount1Max;

      // We again add authwits such that the AMM can transfer the tokens from the liquidity provider. These authwits are
      // for the full amount, since the AMM will first transfer that to itself, and later refund any excess during
      // public execution. We expect for there to be excess since our maximum amounts do not have the same balance ratio
      // as the pool currently holds.
      const nonceForAuthwits = Fr.random();
      const token1Authwit = await wallet.createAuthWit(otherLiquidityProviderAddress, {
        caller: amm.address,
        action: token0.methods.transfer_to_public_and_prepare_private_balance_increase(
          otherLiquidityProviderAddress,
          amm.address,
          amount0Max,
          nonceForAuthwits,
        ),
      });
      const token2Authwit = await wallet.createAuthWit(otherLiquidityProviderAddress, {
        caller: amm.address,
        action: token1.methods.transfer_to_public_and_prepare_private_balance_increase(
          otherLiquidityProviderAddress,
          amm.address,
          amount1Max,
          nonceForAuthwits,
        ),
      });

      await amm.methods
        .add_liquidity(amount0Max, amount1Max, amount0Min, amount1Min, nonceForAuthwits)
        .send({ from: otherLiquidityProviderAddress, authWitnesses: [token1Authwit, token2Authwit] });

      const ammBalancesAfter = await getAmmBalances();
      const lpBalancesAfter = await getWalletBalances(otherLiquidityProviderAddress);

      assertBalancesDelta(ammBalancesBefore, ammBalancesAfter, { token0: expectedAmount0, token1: expectedAmount1 });
      assertBalancesDelta(lpBalancesBefore, lpBalancesAfter, { token0: -expectedAmount0, token1: -expectedAmount1 });

      // The liquidity token supply should have grown with the same proportion as the pool balances
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

    // Swapper sends 10% of token0 balance as exact-in and receives the contract-quoted amount of
    // token1 as exact-out minimum. Verifies swapper and AMM balance deltas match the quote.
    it('swap exact tokens in', async () => {
      const swapperBalancesBefore = await getWalletBalances(swapperAddress);
      const ammBalancesBefore = await getAmmBalances();

      // The token in will be token0
      const amountIn = swapperBalancesBefore.token0 / 10n;

      // Swaps also transfer tokens into the AMM, so we provide an authwit for the full amount in.
      const nonceForAuthwits = Fr.random();
      const swapAuthwit = await wallet.createAuthWit(swapperAddress, {
        caller: amm.address,
        action: token0.methods.transfer_to_public(swapperAddress, amm.address, amountIn, nonceForAuthwits),
      });

      // We compute the expected amount out and set it as the minimum. In a real-life scenario we'd choose a slightly
      // lower value to account for slippage, but since we're the only actor interacting with the AMM we can afford to
      // just pass the exact value. Of course any lower value would also suffice.
      const amountOutMin = (
        await amm.methods
          .get_amount_out_for_exact_in(ammBalancesBefore.token0, ammBalancesBefore.token1, amountIn)
          .simulate({ from: swapperAddress })
      ).result;

      const swapExactTokensInteraction = amm.methods
        .swap_exact_tokens_for_tokens(token0.address, token1.address, amountIn, amountOutMin, nonceForAuthwits)
        .with({ authWitnesses: [swapAuthwit] });
      await swapExactTokensInteraction.send({ from: swapperAddress });

      // We know exactly how many tokens we're supposed to get because we know nobody else interacted with the AMM
      // before we did.
      const swapperBalancesAfter = await getWalletBalances(swapperAddress);
      assertBalancesDelta(swapperBalancesBefore, swapperBalancesAfter, { token0: -amountIn, token1: amountOutMin });
    });

    // Undoes the previous swap: requests exact-out equal to the token0 the contract would return
    // for the swapper's full token1 balance. Verifies the swapper ends with less token0 than initially
    // (fees consumed), and confirms balance deltas match the quote.
    it('swap exact tokens out', async () => {
      const swapperBalancesBefore = await getWalletBalances(swapperAddress);
      const ammBalancesBefore = await getAmmBalances();

      // We want to undo the previous swap (except for the fees, which we can't recover), so we try to send the full
      // token1 balance (since the swapper held no token1 tokens prior to the swap). However, we're using the method
      // that receives an exact amount of tokens *out*, not in, so we can't quite specify this. What we do instead is
      // query the contract for how much token0 we'd get if we sent our entire token1 balance, and then request exactly
      // that amount. This would fail in a real-life scenario since we'd need to account for slippage, but we can do it
      // in this test environment since there's nobody else interacting with the AMM.
      const amountOut = (
        await amm.methods
          .get_amount_out_for_exact_in(ammBalancesBefore.token1, ammBalancesBefore.token0, swapperBalancesBefore.token1)
          .simulate({ from: swapperAddress })
      ).result;
      const amountInMax = swapperBalancesBefore.token1;

      // Swaps also transfer tokens into the AMM, so we provide an authwit for the full amount in (any change will be
      // later returned, though in this case there won't be any).
      const nonceForAuthwits = Fr.random();
      const swapAuthwit = await wallet.createAuthWit(swapperAddress, {
        caller: amm.address,
        action: token1.methods.transfer_to_public_and_prepare_private_balance_increase(
          swapperAddress,
          amm.address,
          amountInMax,
          nonceForAuthwits,
        ),
      });

      await amm.methods
        .swap_tokens_for_exact_tokens(token1.address, token0.address, amountOut, amountInMax, nonceForAuthwits)
        .send({ from: swapperAddress, authWitnesses: [swapAuthwit] });

      // Because nobody else interacted with the AMM, we know the amount in will be the maximum (i.e. the value the
      // contract returned as what we'd need to send in order to get the amount out we requested).
      const swapperBalancesAfter = await getWalletBalances(swapperAddress);
      assertBalancesDelta(swapperBalancesBefore, swapperBalancesAfter, { token0: amountOut, token1: -amountInMax });

      // We can also check that the swapper ends up with fewer tokens than they started with, since they had to pay
      // swap fees during both swaps.
      expect(swapperBalancesAfter.token0).toBeLessThan(INITIAL_TOKEN_BALANCE);
    });

    // Second LP burns their entire liquidity-token balance via the AMM. Verifies they receive
    // more token0 than their original deposit (swap fees accrued) and exactly their token1 back.
    it('remove liquidity', async () => {
      // We now withdraw all of the tokens of one of the liquidity providers by burning their entire liquidity token
      // balance.
      const liquidityTokenBalance = (
        await liquidityToken.methods
          .balance_of_private(otherLiquidityProviderAddress)
          .simulate({ from: otherLiquidityProviderAddress })
      ).result;

      // Because private burning requires first transferring the tokens into the AMM, we again need to provide an
      // authwit.
      const nonceForAuthwits = Fr.random();
      const liquidityAuthwit = await wallet.createAuthWit(otherLiquidityProviderAddress, {
        caller: amm.address,
        action: liquidityToken.methods.transfer_to_public(
          otherLiquidityProviderAddress,
          amm.address,
          liquidityTokenBalance,
          nonceForAuthwits,
        ),
      });

      // We don't bother setting the minimum amounts, since we know nobody else is interacting with the AMM. In a
      // real-life scenario we'd need to choose sensible amounts to avoid losing value due to slippage.
      const amount0Min = 1n;
      const amount1Min = 1n;

      await amm.methods
        .remove_liquidity(liquidityTokenBalance, amount0Min, amount1Min, nonceForAuthwits)
        .send({ from: otherLiquidityProviderAddress, authWitnesses: [liquidityAuthwit] });

      // The liquidity provider should have no remaining liquidity tokens, and should have recovered the value they
      // originally deposited.
      expect(
        (
          await liquidityToken.methods
            .balance_of_private(otherLiquidityProviderAddress)
            .simulate({ from: otherLiquidityProviderAddress })
        ).result,
      ).toEqual(0n);

      // We now assert that the liquidity provider ended up with more tokens than they began with. These extra tokens
      // come from the swap fees paid during each of the swaps. While swap fees are always collected on the token in,
      // the net fees will all be accrued on token0 due to how the swaps were orchestrated. This can be intuited by the
      // fact that the swapper held no token1 initially, so it'd be impossible for them to cause an increase in the
      // AMM's token1 balance.
      // We perform this test using the second liquidity provider, since the first one did lose some percentage of the
      // value of their deposit during setup when liquidity was locked by minting tokens for the zero address.
      const lpBalancesAfter = await getWalletBalances(otherLiquidityProviderAddress);
      expect(lpBalancesAfter.token0).toBeGreaterThan(INITIAL_TOKEN_BALANCE);
      expect(lpBalancesAfter.token1).toEqual(INITIAL_TOKEN_BALANCE);
    });
  });
});
