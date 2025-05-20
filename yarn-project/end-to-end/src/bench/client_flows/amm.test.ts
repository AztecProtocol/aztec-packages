import { AccountWallet, Fr, type SimulateMethodOptions } from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import type { AMMContract } from '@aztec/noir-contracts.js/AMM';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { mintNotes } from '../../fixtures/token_utils.js';
import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(900_000);

const AMOUNT_PER_NOTE = 1_000_000;

const MINIMUM_NOTES_FOR_RECURSION_LEVEL = [0, 2, 10];

describe('AMM benchmark', () => {
  const t = new ClientFlowsBenchmark('amm');
  // The admin that aids in the setup of the test
  let adminWallet: AccountWallet;
  // FPC that accepts bananas
  let bananaFPC: FPCContract;
  // BananaCoin Token contract, just used to pay fees in this scenario
  let bananaCoin: TokenContract;
  // CandyBarCoin Token contract, which we want to amm
  let candyBarCoin: TokenContract;
  // AMM contract
  let amm: AMMContract;
  // Liquidity contract for the AMM
  let liquidityToken: TokenContract;
  // Sponsored FPC contract
  let sponsoredFPC: SponsoredFPCContract;
  // Benchmarking configuration
  const config = t.config.amm;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    await t.applyDeployCandyBarTokenSnapshot();
    await t.applyDeployAmmSnapshot();
    await t.applyDeploySponsoredFPCSnapshot();
    ({ adminWallet, bananaFPC, bananaCoin, candyBarCoin, amm, liquidityToken, sponsoredFPC } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  for (const accountType of config.accounts) {
    ammBenchmark(accountType);
  }

  function ammBenchmark(accountType: AccountType) {
    return describe(`AMM benchmark for ${accountType}`, () => {
      // Our benchmarking user
      let benchysWallet: AccountWallet;
      // Number of notes to create
      const notesToCreate = MINIMUM_NOTES_FOR_RECURSION_LEVEL[1] + 1; // 1 recursion level

      beforeAll(async () => {
        benchysWallet = await t.createAndFundBenchmarkingWallet(accountType);
        // Fund benchy with bananas, so they can pay for the amms using the private FPC
        await t.mintPrivateBananas(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysWallet.getAddress());
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await benchysWallet.registerSender(adminWallet.getAddress());
        // Register both FPC and BananCoin on the user's Wallet so we can simulate and prove
        await benchysWallet.registerContract(bananaFPC);
        await benchysWallet.registerContract(bananaCoin);
        // Register the CandyBarCoin on the user's Wallet so we can simulate and prove
        await benchysWallet.registerContract(candyBarCoin);
        // Register the AMM and liquidity token on the user's Wallet so we can simulate and prove
        await benchysWallet.registerContract(amm);
        await benchysWallet.registerContract(liquidityToken);
        // Register the sponsored FPC on the user's PXE so we can simulate and prove
        await benchysWallet.registerContract(sponsoredFPC);
      });

      function addLiquidityTest(benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod) {
        return describe(`Add liquidity with ${notesToCreate} notes in both tokens using a ${accountType} account`, () => {
          beforeEach(async () => {
            // Mint some CandyBarCoins for the user, separated in different notes
            await mintNotes(
              adminWallet,
              benchysWallet.getAddress(),
              candyBarCoin,
              Array(notesToCreate).fill(BigInt(AMOUNT_PER_NOTE)),
            );
            // Mint some BananaCoins for the user, separated in different notes
            await mintNotes(
              adminWallet,
              benchysWallet.getAddress(),
              bananaCoin,
              Array(notesToCreate).fill(BigInt(AMOUNT_PER_NOTE)),
            );
          });

          // Ensure we create a change note, by sending an amount that is not a multiple of the note amount
          const amountToSend = MINIMUM_NOTES_FOR_RECURSION_LEVEL[1] * AMOUNT_PER_NOTE + 1;

          it(`${accountType} contract adds liquidity to the AMM sending ${amountToSend} tokens using 1 recursions in both and pays using ${benchmarkingPaymentMethod}`, async () => {
            const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
            const options: SimulateMethodOptions = {
              fee: { paymentMethod: await paymentMethod.forWallet(benchysWallet) },
            };

            const nonceForAuthwits = Fr.random();
            const token0Authwit = await benchysWallet.createAuthWit({
              caller: amm.address,
              action: bananaCoin.methods.transfer_to_public_and_prepare_private_balance_increase(
                benchysWallet.getAddress(),
                amm.address,
                amountToSend,
                nonceForAuthwits,
              ),
            });
            const token1Authwit = await benchysWallet.createAuthWit({
              caller: amm.address,
              action: candyBarCoin.methods.transfer_to_public_and_prepare_private_balance_increase(
                benchysWallet.getAddress(),
                amm.address,
                amountToSend,
                nonceForAuthwits,
              ),
            });

            const addLiquidityInteraction = amm
              .withWallet(benchysWallet)
              .methods.add_liquidity(amountToSend, amountToSend, amountToSend, amountToSend, nonceForAuthwits)
              .with({ authWitnesses: [token0Authwit, token1Authwit] });

            await captureProfile(
              `${accountType}+amm_add_liquidity_1_recursions+${benchmarkingPaymentMethod}`,
              addLiquidityInteraction,
              options,
              1 + // Account entrypoint
                1 + // Kernel init
                paymentMethod.circuits + // Payment method circuits
                2 + // AMM add_liquidity + kernel inner
                2 + // Token transfer_to_public_and_prepare_private_balance_increase + kernel inner (token0)
                2 + // Account verify_private_authwit + kernel inner
                2 + // Token transfer_to_public_and_prepare_private_balance_increase + kernel inner (token1)
                2 + // Account verify_private_authwit + kernel inner
                2 + // Token prepare_private_balance_increase + kernel inner (liquidity token mint)
                1 + // Kernel reset
                1, // Kernel tail
            );

            if (process.env.SANITY_CHECKS) {
              const tx = await addLiquidityInteraction.send().wait();
              expect(tx.transactionFee!).toBeGreaterThan(0n);
            }
          });
        });
      }

      for (const paymentMethod of config.feePaymentMethods) {
        addLiquidityTest(paymentMethod);
      }
    });
  }
});
