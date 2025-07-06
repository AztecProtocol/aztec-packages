import { AccountWallet, type AztecNode, type SimulateMethodOptions } from '@aztec/aztec.js';
import { EasyPrivateVotingContract } from '@aztec/noir-contracts.js/EasyPrivateVoting';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(1_600_000);

describe('Deployment benchmark', () => {
  const t = new ClientFlowsBenchmark('deployments');
  let node: AztecNode;
  // Sponsored FPC contract
  let sponsoredFPC: SponsoredFPCContract;
  // Benchmarking configuration
  const config = t.config.deployments;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeploySponsoredFPCSnapshot();

    ({ aztecNode: node, sponsoredFPC } = await t.setup());
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
      let benchysWallet: AccountWallet;

      beforeAll(async () => {
        benchysWallet = await t.createAndFundBenchmarkingWallet(accountType);
        await benchysWallet.registerContract(sponsoredFPC);
      });

      function deploymentTest(benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod) {
        return describe(`Deploy TokenContract using a ${accountType} account`, () => {
          let isClassRegistered: boolean;

          beforeEach(async () => {
            isClassRegistered = !!(await node.getContractClass(
              (await getContractClassFromArtifact(EasyPrivateVotingContract.artifact)).id,
            ));
          });

          it(`${accountType} contract deploys a TokenContract, pays using ${benchmarkingPaymentMethod}`, async () => {
            const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
            const options: SimulateMethodOptions = {
              fee: { paymentMethod: await paymentMethod.forWallet(benchysWallet) },
            };

            const deploymentInteraction = EasyPrivateVotingContract.deploy(benchysWallet, benchysWallet.getAddress());

            await captureProfile(
              `${accountType}+deploy_tokenContract_${
                isClassRegistered ? 'no_registration' : 'with_registration'
              }+${benchmarkingPaymentMethod}`,
              deploymentInteraction,
              options,
              1 + // Account entrypoint
                1 + // Kernel init
                paymentMethod.circuits + // Payment method circuits
                (isClassRegistered ? 0 : 2) + // ContractClassRegistry register_contract_class + kernel inner
                2 + // ContractClassRegistry assert_class_id_is_published + kernel inner
                2 + // ContractInstanceRegistry deploy + kernel inner
                1 + // Kernel reset
                1, // Kernel tail
            );

            if (process.env.SANITY_CHECKS) {
              // Ensure we paid a fee
              const tx = await deploymentInteraction.send(options).wait();
              expect(tx.transactionFee!).toBeGreaterThan(0n);
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
