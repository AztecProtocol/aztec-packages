import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractInstanceWithAddress, SimulateInteractionOptions } from '@aztec/aztec.js/contracts';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { StorageProofTestContract } from '@aztec/noir-test-contracts.js/StorageProofTest';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import {
  buildStorageProofCapsules,
  loadStorageProofArgs,
} from '../../e2e_storage_proof/fixtures/storage_proof_fixture.js';
import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(300_000);

describe('Storage proof benchmark', () => {
  const t = new ClientFlowsBenchmark('storage_proof');
  let userWallet: TestWallet;
  let adminAddress: AztecAddress;
  let bananaFPCInstance: ContractInstanceWithAddress;
  let bananaCoinInstance: ContractInstanceWithAddress;
  let sponsoredFPCInstance: ContractInstanceWithAddress;
  let storageProofContract: StorageProofTestContract;
  let storageProofInstance: ContractInstanceWithAddress;
  const config = t.config.storageProof;

  beforeAll(async () => {
    await t.setup();
    await t.applyDeployBananaToken();
    await t.applyFPCSetup();
    await t.applyDeploySponsoredFPC();

    const deployed = await StorageProofTestContract.deploy(t.adminWallet).send({
      from: t.adminAddress,
      wait: { returnReceipt: true },
    });
    storageProofContract = deployed.contract;
    storageProofInstance = deployed.instance;

    ({ userWallet, adminAddress, bananaFPCInstance, bananaCoinInstance, sponsoredFPCInstance } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  for (const accountType of config.accounts) {
    storageProofBenchmark(accountType);
  }

  function storageProofBenchmark(accountType: AccountType) {
    return describe(`Storage proof benchmark for ${accountType}`, () => {
      let benchysAddress: AztecAddress;

      beforeAll(async () => {
        benchysAddress = await t.createAndFundBenchmarkingAccountOnUserWallet(accountType);
        // Fund benchy with bananas, so they can pay using the private FPC
        await t.mintPrivateBananas(1000n * 10n ** 18n, benchysAddress);
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await userWallet.registerSender(adminAddress);
        // Register FPC and BananaCoin on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(bananaFPCInstance, FPCContract.artifact);
        await userWallet.registerContract(bananaCoinInstance, TokenContract.artifact);
        // Register the sponsored FPC on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
        // Register the StorageProofTestContract on the user's Wallet
        await userWallet.registerContract(storageProofInstance, StorageProofTestContract.artifact);
      });

      for (const paymentMethod of config.feePaymentMethods) {
        storageProofTest(paymentMethod);
      }

      function storageProofTest(benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod) {
        return it(`${accountType} storage proof pays using ${benchmarkingPaymentMethod}`, async () => {
          const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
          const { ethAddress, slotKey, slotContents, root } = loadStorageProofArgs();
          const contract = StorageProofTestContract.at(storageProofContract.address, userWallet);
          const capsules = await buildStorageProofCapsules(contract.address);

          const interaction = contract.methods
            .storage_proof(ethAddress, slotKey, slotContents, root)
            .with({ capsules });

          const options: SimulateInteractionOptions = {
            from: benchysAddress,
            fee: { paymentMethod: await paymentMethod.forWallet(userWallet, benchysAddress) },
          };

          await captureProfile(
            `${accountType}+storage_proof_7_layers+${benchmarkingPaymentMethod}`,
            interaction,
            options,
            1 + // Account entrypoint
              1 + // Kernel init
              paymentMethod.circuits + // Payment method circuits
              2 + // Storage proof entry + kernel inner
              3 * 2 + // Recurse into path section + kernel inner 3 times
              1 + // Kernel reset
              1 + // Kernel tail
              1, // Kernel hiding
          );

          if (process.env.SANITY_CHECKS) {
            const tx = await interaction.send(options);
            expect(tx.transactionFee!).toBeGreaterThan(0n);
            expect(tx.hasExecutionSucceeded()).toBe(true);
          }
        });
      }
    });
  }
});
