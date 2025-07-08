import { EcdsaRAccountContractArtifact } from '@aztec/accounts/ecdsa';
import { AccountWallet, type DeployOptions, Fr, type PXE, publishContractClass } from '@aztec/aztec.js';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';

import { jest } from '@jest/globals';

import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(300_000);

describe('Deployment benchmark', () => {
  const t = new ClientFlowsBenchmark('deployments');
  // The admin that aids in the setup of the test
  let adminWallet: AccountWallet;
  // Sponsored FPC contract
  let sponsoredFPC: SponsoredFPCContract;
  // Benchmarking configuration
  const config = t.config.accountDeployments;
  // Benchmarking user's PXE
  let userPXE: PXE;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeploySponsoredFPCSnapshot();
    ({ adminWallet, sponsoredFPC, userPXE } = await t.setup());
    // Ensure the ECDSAR1 contract is already registered, to avoid benchmarking an extra call to the ContractClassRegistry
    // The typical interaction would be for a user to deploy an account contract that is already registered in the
    // network.
    const publishContractClassInteraction = await publishContractClass(adminWallet, EcdsaRAccountContractArtifact);
    await publishContractClassInteraction.send().wait();
  });

  afterAll(async () => {
    await t.teardown();
  });

  for (const accountType of config.accounts) {
    deploymentBenchmark(accountType);
  }

  function deploymentBenchmark(accountType: AccountType) {
    return describe(`Deployment benchmark for ${accountType}`, () => {
      function deploymentTest(benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod) {
        return it(`Deploys a ${accountType} account contract, pays using ${benchmarkingPaymentMethod}`, async () => {
          const benchysAccountManager = await t.createBenchmarkingAccountManager(userPXE, accountType);
          const benchysWallet = await benchysAccountManager.getWallet();

          if (benchmarkingPaymentMethod === 'sponsored_fpc') {
            await benchysWallet.registerContract(sponsoredFPC);
          }

          const deploymentInteraction = await benchysAccountManager.getDeployMethod();

          const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
          const wrappedPaymentMethod = await benchysAccountManager.getSelfPaymentMethod(
            await paymentMethod.forWallet(benchysWallet),
          );
          const fee = { paymentMethod: wrappedPaymentMethod };
          // Publicly deploy the contract, but skip the class registration as that is the
          // "typical" use case
          const options: DeployOptions = {
            fee,
            universalDeploy: true,
            skipClassPublication: true,
            skipInstancePublication: false,
            skipInitialization: false,
            contractAddressSalt: new Fr(benchysAccountManager.salt),
          };

          await captureProfile(
            `deploy_${accountType}+${benchmarkingPaymentMethod}`,
            deploymentInteraction,
            options,
            1 + // Multicall entrypoint
              1 + // Kernel init
              2 + // ContractInstanceRegistry publish + kernel inner
              2 + // ContractClassRegistry assert_class_id_is_published + kernel inner
              2 + // Account constructor + kernel inner
              2 + // Account entrypoint (wrapped fee payload) + kernel inner
              paymentMethod.circuits + // Payment method circuits
              1 + // Kernel reset
              1, // Kernel tail
          );

          if (process.env.SANITY_CHECKS) {
            // Ensure we paid a fee
            const tx = await deploymentInteraction.send(options).wait();
            expect(tx.transactionFee!).toBeGreaterThan(0n);
          }
        });
      }

      for (const paymentMethod of config.feePaymentMethods) {
        deploymentTest(paymentMethod);
      }
    });
  }
});
