import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { SimulateInteractionOptions } from '@aztec/aztec.js/contracts';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import type { CrossChainTestHarness } from '../../shared/cross_chain_test_harness.js';
import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(300_000);

describe('Bridging benchmark', () => {
  const t = new ClientFlowsBenchmark('bridging');
  // The wallet used by the user to interact
  let userWallet: Wallet;
  // The admin that aids in the setup of the test
  let adminAddress: AztecAddress;
  // Benchmarking configuration
  const config = t.config.bridging;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    await t.applyDeploySponsoredFPCSnapshot();
    ({ userWallet, adminAddress } = await t.setup());
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
      let benchysAddress: AztecAddress;
      // Helpers for the bridging
      let crossChainTestHarness: CrossChainTestHarness;

      beforeEach(async () => {
        const { bananaFPCInstance, bananaCoinInstance, sponsoredFPCInstance } = t;
        benchysAddress = await t.createAndFundBenchmarkingAccountOnUserWallet(accountType);
        // Benchy has FeeJuice now, so it can deploy the Token and bridge. This is required because
        // the brigde has an owner, which is the only one that can claim
        crossChainTestHarness = await t.createCrossChainTestHarness(benchysAddress);
        // Fund benchy with bananas, so they can pay for the bridging using the private FPC
        await t.mintPrivateBananas(1000n * 10n ** 18n, benchysAddress);
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await userWallet.registerSender(adminAddress);
        // Register both FPC and BananCoin on the user's PXE so we can simulate and prove
        await userWallet.registerContract(bananaFPCInstance, FPCContract.artifact);
        await userWallet.registerContract(bananaCoinInstance, TokenContract.artifact);
        // Register the sponsored FPC on the user's PXE so we can simulate and prove
        await userWallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
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
          const options: SimulateInteractionOptions = {
            from: benchysAddress,
            fee: { paymentMethod: await paymentMethod.forWallet(userWallet, benchysAddress) },
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
              1 + // Kernel tail
              1, // Kernel hiding
          );

          if (process.env.SANITY_CHECKS) {
            // Ensure we paid a fee
            const tx = await claimInteraction.send(options).wait();
            expect(tx.transactionFee!).toBeGreaterThan(0n);

            // 4. Check the balance

            const balance = await crossChainTestHarness.getL2PrivateBalanceOf(benchysAddress);
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
