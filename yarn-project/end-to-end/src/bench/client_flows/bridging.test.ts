import { AccountWallet, PrivateFeePaymentMethod, type SimulateMethodOptions } from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { capturePrivateExecutionStepsIfEnvSet } from '../../shared/capture_private_execution_steps.js';
import type { CrossChainTestHarness } from '../../shared/cross_chain_test_harness.js';
import { type AccountType, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(300_000);

describe('Client flows benchmarking', () => {
  const t = new ClientFlowsBenchmark('bridging');
  // The admin that aids in the setup of the test
  let adminWallet: AccountWallet;
  // FPC that accepts bananas
  let bananaFPC: FPCContract;
  // BananaCoin Token contract, which we want to use to pay for the bridging
  let bananaCoin: TokenContract;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    ({ bananaFPC, bananaCoin, adminWallet } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  bridgingBenchmark('ecdsar1');
  bridgingBenchmark('schnorr');

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
      });

      it(`${accountType} contract bridges tokens from L1 claiming privately, pays using private FPC`, async () => {
        // Generate a claim secret using pedersen
        const l1TokenBalance = 1000000n;
        const bridgeAmount = 100n;

        // 1. Mint tokens on L1
        await crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

        // 2. Deposit tokens to the TokenPortal
        const claim = await crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
        await crossChainTestHarness.makeMessageConsumable(claim.messageHash);

        // 3. Consume L1 -> L2 message and mint private tokens on L2, paying via FPC
        const paymentMethod = new PrivateFeePaymentMethod(bananaFPC.address, benchysWallet);
        const options: SimulateMethodOptions = { fee: { paymentMethod } };

        const { recipient, claimAmount, claimSecret: secretForL2MessageConsumption, messageLeafIndex } = claim;
        const claimInteraction = crossChainTestHarness.l2Bridge.methods.claim_private(
          recipient,
          claimAmount,
          secretForL2MessageConsumption,
          messageLeafIndex,
        );

        await capturePrivateExecutionStepsIfEnvSet(
          `${accountType}+token_bridge_claim_private+pay_private_fpc`,
          claimInteraction,
          options,
          1 + // Account entrypoint
            1 + // Kernel init
            2 + // FPC entrypoint + kernel inner
            2 + // BananaCoin transfer_to_public + kernel inner
            2 + // Account verify_private_authwit + kernel inner
            2 + // BananaCoin prepare_private_balance_increase + kernel inner
            2 + // CandyBarCoin transfer + kernel inner
            2 + // TokenBridge claim_private + kernel inner
            2 + // BridgedAsset mint_to_private + kernel inner
            1 + // Kernel reset
            1, // Kernel tail
        );

        // Ensure we paid a fee
        const tx = await claimInteraction.send(options).wait();
        expect(tx.transactionFee!).toBeGreaterThan(0n);

        // 4. Check the balance

        const balance = await crossChainTestHarness.getL2PrivateBalanceOf(benchysWallet.getAddress());
        expect(balance).toBe(bridgeAmount);
      });
    });
  }
});
