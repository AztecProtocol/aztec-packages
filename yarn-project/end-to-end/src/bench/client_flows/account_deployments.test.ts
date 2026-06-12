import { EcdsaRAccountContractArtifact } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContractArtifact } from '@aztec/accounts/schnorr';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { publishContractClass } from '@aztec/aztec.js/deployment';
import type { DeployAccountOptions, Wallet } from '@aztec/aztec.js/wallet';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { captureProfile, expectedExecutionSteps } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(300_000);

describe('Deployment benchmark', () => {
  const t = new ClientFlowsBenchmark('deployments');

  let adminWallet: Wallet;
  // The admin that aids in the setup of the test
  let adminAddress: AztecAddress;
  // Sponsored FPC contract
  let sponsoredFPCInstance: ContractInstanceWithAddress;
  // Benchmarking configuration
  const config = t.config.accountDeployments;
  // Benchmarking user's Wallet
  let userWallet: TestWallet;

  beforeAll(async () => {
    await t.setup();
    await t.applyDeploySponsoredFPC();
    ({ adminWallet, adminAddress, userWallet, sponsoredFPCInstance } = t);
    // Ensure both account contract classes are already deployed, to avoid benchmarking an extra call to the ContractClassRegistry
    // The typical interaction would be for a user to deploy an account contract that is already registered in the
    // network.
    const interactions = [
      await publishContractClass(adminWallet, SchnorrAccountContractArtifact),
      await publishContractClass(adminWallet, EcdsaRAccountContractArtifact),
    ];
    for (let interaction of interactions) {
      await interaction.send({ from: adminAddress });
    }
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
          const benchysAccountManager = await t.createBenchmarkingAccountManager(userWallet, accountType);

          if (benchmarkingPaymentMethod === 'sponsored_fpc') {
            await userWallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
          }

          const benchysAddress = benchysAccountManager.address;

          const deploymentInteraction = await benchysAccountManager.getDeployMethod();

          const paymentMethodManager = t.paymentMethods[benchmarkingPaymentMethod];
          const paymentMethod = await paymentMethodManager.forWallet(userWallet, benchysAddress);

          // Publicly deploy the contract, but skip the class registration as that is the
          // "typical" use case
          const options: DeployAccountOptions = {
            from: NO_FROM, // Self deployment
            skipClassPublication: true,
            skipInstancePublication: false,
            skipInitialization: false,
            fee: {
              paymentMethod,
            },
          };

          await captureProfile(
            `deploy_${accountType}+${benchmarkingPaymentMethod}`,
            deploymentInteraction,
            options,
            expectedExecutionSteps(
              1 + // Multicall entrypoint
                1 + // ContractInstanceRegistry publish
                1 + // Account constructor
                1 + // Account entrypoint (wrapped fee payload)
                paymentMethodManager.apps, // Payment method apps
            ),
          );

          if (process.env.SANITY_CHECKS) {
            // Ensure we paid a fee
            const { receipt } = await deploymentInteraction.send({ ...options });
            expect(receipt.transactionFee!).toBeGreaterThan(0n);
          }
        });
      }

      for (const paymentMethod of config.feePaymentMethods) {
        deploymentTest(paymentMethod);
      }
    });
  }
});
