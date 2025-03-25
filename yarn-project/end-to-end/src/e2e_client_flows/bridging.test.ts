import { AccountWallet, PrivateFeePaymentMethod, type SimulateMethodOptions } from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { capturePrivateExecutionStepsIfEnvSet } from '../shared/capture_private_execution_steps.js';
import type { CrossChainTestHarness } from '../shared/cross_chain_test_harness.js';
import { type AccountType, ClientFlowsTest } from './client_test_flows.js';

jest.setTimeout(300_000);

describe('Client flows benchmarking', () => {
  const t = new ClientFlowsTest('bridging');
  let bananaFPC: FPCContract;
  let bananaCoin: TokenContract;
  let adminWallet: AccountWallet;

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
      let benchysWallet: AccountWallet;
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
        const claimInteraction = await crossChainTestHarness.l2Bridge.methods.claim_private(
          recipient,
          claimAmount,
          secretForL2MessageConsumption,
          messageLeafIndex,
        );

        await capturePrivateExecutionStepsIfEnvSet(
          `${accountType}+token_bridge_claim_private+pay_private_fpc`,
          claimInteraction,
          options,
        );

        const tx = await claimInteraction.send(options).wait();
        expect(tx.transactionFee!).toBeGreaterThan(0n);
      });
    });
  }
});
