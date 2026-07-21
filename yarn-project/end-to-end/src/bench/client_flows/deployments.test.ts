import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractInstanceWithAddress, SimulateInteractionOptions } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { PrivateVotingContract } from '@aztec/noir-contracts.js/PrivateVoting';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { captureProfile, expectedExecutionSteps } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(1_600_000);

// Contract deployment round-trip benchmark. Uses ClientFlowsBenchmark with BENCHMARK_CONFIG; profiles
// PrivateVoting contract deployment across account types and fee-payment methods; emits BENCH_OUTPUT JSON.
describe('Deployment benchmark', () => {
  const t = new ClientFlowsBenchmark('deployments');
  let node: AztecNode;

  // The wallet used by the user to interact
  let userWallet: Wallet;
  // Sponsored FPC contract
  let sponsoredFPCInstance: ContractInstanceWithAddress;
  // Benchmarking configuration
  const config = t.config.deployments;

  beforeAll(async () => {
    await t.setup();
    await t.applyDeploySponsoredFPC();

    ({ aztecNode: node, userWallet, sponsoredFPCInstance } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  for (const accountType of config.accounts) {
    deploymentBenchmark(accountType);
  }

  function deploymentBenchmark(accountType: AccountType) {
    return describe(`Deployment benchmark for ${accountType}`, () => {
      // Our benchmarking user
      let benchysAddress: AztecAddress;

      beforeAll(async () => {
        benchysAddress = await t.createAndFundBenchmarkingAccountOnUserWallet(accountType);
        await userWallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
      });

      function deploymentTest(benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod) {
        return describe(`Deploy TokenContract using a ${accountType} account`, () => {
          let isClassRegistered: boolean;

          beforeEach(async () => {
            isClassRegistered = !!(await node.getContractClass(
              (await getContractClassFromArtifact(PrivateVotingContract.artifact)).id,
            ));
          });

          it(`${accountType} contract deploys a TokenContract, pays using ${benchmarkingPaymentMethod}`, async () => {
            const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
            const options: SimulateInteractionOptions = {
              from: benchysAddress,
              fee: { paymentMethod: await paymentMethod.forWallet(userWallet, benchysAddress) },
            };

            const deploymentInteraction = PrivateVotingContract.deploy(userWallet, benchysAddress);

            await captureProfile(
              `${accountType}+deploy_tokenContract_${
                isClassRegistered ? 'no_registration' : 'with_registration'
              }+${benchmarkingPaymentMethod}`,
              deploymentInteraction,
              options,
              expectedExecutionSteps(
                1 + // Account entrypoint
                  paymentMethod.apps + // Payment method apps
                  (isClassRegistered ? 0 : 1) + // ContractClassRegistry register_contract_class
                  1, // ContractInstanceRegistry publish
              ),
            );

            if (process.env.SANITY_CHECKS) {
              // Ensure we paid a fee
              const { receipt } = await deploymentInteraction.send({ ...options });
              expect(receipt.transactionFee!).toBeGreaterThan(0n);
            }
          });
        });
      }

      for (const paymentMethod of config.feePaymentMethods) {
        deploymentTest(paymentMethod);
      }
    });
  }
});
