import { EcdsaRAccountContractArtifact, getEcdsaRAccount } from '@aztec/accounts/ecdsa';
import {
  AccountWallet,
  AccountWalletWithSecretKey,
  Contract,
  type DeployOptions,
  FeeJuicePaymentMethodWithClaim,
  Fr,
  type PXE,
  PrivateFeePaymentMethod,
  registerContractClass,
} from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { capturePrivateExecutionStepsIfEnvSet } from '../shared/capture_private_execution_steps.js';
import { type AccountType, ClientFlowsTest } from './client_test_flows.js';

jest.setTimeout(300_000);

describe('Client flows benchmarking', () => {
  const t = new ClientFlowsTest();
  let adminWallet: AccountWallet;
  let adminPXE: PXE;
  let bananaFPC: FPCContract;
  let bananaCoin: Contract;
  let userPXE: PXE;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    ({ adminWallet, bananaFPC, bananaCoin, pxe: adminPXE, userPXE } = await t.setup());
    // Schnorr should already be registered by setup
    const registerContractClassInteraction = await registerContractClass(adminWallet, EcdsaRAccountContractArtifact);
    await registerContractClassInteraction.send().wait();
  });

  afterAll(async () => {
    await t.teardown();
  });

  bridgingBenchmark('ecdsar1');
  bridgingBenchmark('schnorr');

  function bridgingBenchmark(accountType: AccountType) {
    return describe(`Bridging benchmark for ${accountType}`, () => {
      let benchysWallet: AccountWalletWithSecretKey;

      beforeEach(async () => {
        const benchysAccountManager = await t.createBenchmarkingAccountManager(accountType);
        benchysWallet = await benchysAccountManager.getWallet();
        const benchysAddress = benchysAccountManager.getAddress();
        const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(
          FEE_FUNDING_FOR_TESTER_ACCOUNT,
          benchysAddress,
        );
        const paymentMethod = new FeeJuicePaymentMethodWithClaim(benchysWallet, claim);
        await benchysAccountManager.deploy({ fee: { paymentMethod } }).wait();
        // Benchy has FeeJuice now, so it can deploy the Token and bridge. This is required because
        // the brigde has an owner, which is the only one that can claim
        await t.applyCrossChainHarnessSnapshot(benchysWallet);
        // Register benchy on admin's PXE so we can check its balances
        await adminPXE.registerAccount(benchysWallet.getSecretKey(), benchysWallet.getCompleteAddress().partialAddress);
        // Fund benchy with bananas, so they can pay for the bridging using the private FPC
        await t.mintPrivateBananas(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysAddress);
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await benchysWallet.registerSender(adminWallet.getAddress());
        // Register both FPC and BananCoin on the user's PXE so we can simulate and prove
        await userPXE.registerContract({ instance: bananaFPC.instance, artifact: bananaFPC.artifact });
        await userPXE.registerContract({ instance: bananaCoin.instance, artifact: bananaCoin.artifact });
      });

      it(`${accountType} contract bridges tokens from L1 claiming privately, pays using private FPC`, async () => {
        // Generate a claim secret using pedersen
        const l1TokenBalance = 1000000n;
        const bridgeAmount = 100n;

        // 1. Mint tokens on L1
        await t.crossChainTestHarness.mintTokensOnL1(l1TokenBalance);

        // 2. Deposit tokens to the TokenPortal
        const claim = await t.crossChainTestHarness.sendTokensToPortalPrivate(bridgeAmount);
        await t.crossChainTestHarness.makeMessageConsumable(claim.messageHash);

        const bananaBalance = await (await TokenContract.at(bananaCoin.address, benchysWallet)).methods
          .balance_of_private(benchysWallet.getAddress())
          .simulate();

        console.log(bananaBalance);

        // 3. Consume L1 -> L2 message and mint private tokens on L2, paying via FPC
        const paymentMethod = new PrivateFeePaymentMethod(bananaFPC.address, benchysWallet);
        const { recipient, claimAmount, claimSecret: secretForL2MessageConsumption, messageLeafIndex } = claim;
        await t.crossChainTestHarness.l2Bridge.methods
          .claim_private(recipient, claimAmount, secretForL2MessageConsumption, messageLeafIndex)
          .send({ fee: { paymentMethod } })
          .wait();
      });
    });
  }
});
