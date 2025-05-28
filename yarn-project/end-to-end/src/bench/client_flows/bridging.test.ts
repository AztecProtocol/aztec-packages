import { AccountWallet, type SimulateMethodOptions } from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import type { CrossChainTestHarness } from '../../shared/cross_chain_test_harness.js';
import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(300_000);

describe('Bridging benchmark', () => {
  const t = new ClientFlowsBenchmark('bridging');
  // The admin that aids in the setup of the test
  let adminWallet: AccountWallet;
  // FPC that accepts bananas
  let bananaFPC: FPCContract;
  // BananaCoin Token contract, which we want to use to pay for the bridging
  let bananaCoin: TokenContract;
  // Sponsored FPC contract
  let sponsoredFPC: SponsoredFPCContract;
  // Benchmarking configuration
  const config = t.config.bridging;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    await t.applyDeploySponsoredFPCSnapshot();
    ({ bananaFPC, bananaCoin, adminWallet, sponsoredFPC } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  for (const accountType of config.accounts) {
    bridgingBenchmark(accountType);
  }

  function bridgingBenchmark(accountType: AccountType) {
    return describe(`Bridging benchmark for ${accountType}`, () => {
      // Our benchmarking user
      let benchysWallet: AccountWallet;
      // Helpers for the bridging
      let crossChainTestHarness: CrossChainTestHarness;

      beforeEach(async () => {
        benchysWallet = await t.createAndFundBenchmarkingWallet(accountType);
        // Benchy has FeeJuice now, so it can deploy the Token and bridge. This is required because
        // the brigde has an owner, which is the only one that can claim
        crossChainTestHarness = await t.createCrossChainTestHarness(benchysWallet);
        // Fund benchy with bananas, so they can pay for the bridging using the private FPC
        await t.mintPrivateBananas(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysWallet.getAddress());
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await benchysWallet.registerSender(adminWallet.getAddress());
        // Register both FPC and BananCoin on the user's PXE so we can simulate and prove
        await benchysWallet.registerContract(bananaFPC);
        await benchysWallet.registerContract(bananaCoin);
        // Register the sponsored FPC on the user's PXE so we can simulate and prove
        await benchysWallet.registerContract(sponsoredFPC);
      });

      function privateClaimTest(benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod) {
        return it(`${accountType} contract bridges tokens from L1 claiming privately, pays using ${benchmarkingPaymentMethod}`, async () => {
          // Generate a claim secret using pedersen
          const l1TokenBalance = 1000000n;
          const bridgeAmount = 100n;

          // 1. Mint tokens on L1
          await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

          // 2. Deposit tokens to the TokenPortal
          const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
          await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

          // 3. Consume L1 -> L2 message and mint private tokens on L2
          const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
          const options: SimulateMethodOptions = {
            fee: { paymentMethod: await paymentMethod.forWallet(benchysWallet) },
          };

          const { recipient, claimAmount, claimSecret: secretForL2MessageConsumption, messageLeafIndex } = claim;
          const claimInteraction = crossChainTestHarness.l2Bridge.methods.claim_private(
            recipient,
            claimAmount,
            secretForL2MessageConsumption,
            messageLeafIndex,
          );

          await captureProfile(
            `${accountType}+token_bridge_claim_private+${benchmarkingPaymentMethod}`,
            claimInteraction,
            options,
            1 + // Account entrypoint
              1 + // Kernel init
              paymentMethod.circuits + // Payment method circuits
              2 + // TokenBridge claim_private + kernel inner
              2 + // BridgedAsset mint_to_private + kernel inner
              1 + // Kernel reset
              1, // Kernel tail
          );

          if (process.env.SANITY_CHECKS) {
            // Ensure we paid a fee
            const tx = await claimInteraction.send(options).wait();
            expect(tx.transactionFee!).toBeGreaterThan(0n);

            // 4. Check the balance

            const balance = await crossChainTestHarness.getL2PrivateBalanceOf(benchysWallet.getAddress());
            expect(balance).toBe(bridgeAmount);
          }
        });
      }

      for (const paymentMethod of config.feePaymentMethods) {
        privateClaimTest(paymentMethod);
      }
    });
  }
});
