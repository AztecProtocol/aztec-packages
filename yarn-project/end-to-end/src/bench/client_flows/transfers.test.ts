import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractInstanceWithAddress, SimulateInteractionOptions } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TestTokenContract } from '@aztec/noir-test-contracts.js/TestToken';

import { jest } from '@jest/globals';

import { mintNotes } from '../../fixtures/token_utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { captureProfile, expectedExecutionSteps } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(1_600_000);

const AMOUNT_PER_NOTE = 1_000_000;

const MINIMUM_NOTES_FOR_RECURSION_LEVEL = [0, 2, 10];

// Token transfer round-trip benchmark. Uses ClientFlowsBenchmark with BENCHMARK_CONFIG; profiles private
// token transfer flows at varying note-recursion depths for multiple account/fee-method combinations.
describe('Transfer benchmark', () => {
  const t = new ClientFlowsBenchmark('transfers');
  // The wallet used by the admin to interact
  let adminWallet: Wallet;
  // The wallet used by the user to interact
  let userWallet: TestWallet;
  // The admin that aids in the setup of the test
  let adminAddress: AztecAddress;
  // FPC that accepts bananas
  let bananaFPCInstance: ContractInstanceWithAddress;
  // BananaCoin Token contract, just used to pay fees in this scenario
  let bananaCoinInstance: ContractInstanceWithAddress;
  // CandyBarCoin Token contract, which we want to transfer
  let candyBarCoin: TestTokenContract;
  let candyBarCoinInstance: ContractInstanceWithAddress;
  // Sponsored FPC contract
  let sponsoredFPCInstance: ContractInstanceWithAddress;
  // Aztec node
  let node: AztecNode;
  // Benchmarking configuration
  const config = t.config.transfers;

  beforeAll(async () => {
    await t.setup();
    await t.applyDeployBananaToken();
    await t.applyFPCSetup();
    await t.applyDeployCandyBarToken();
    await t.applyDeploySponsoredFPC();

    ({
      adminWallet,
      userWallet,
      adminAddress,
      aztecNode: node,
      bananaFPCInstance,
      bananaCoinInstance,
      candyBarCoin,
      candyBarCoinInstance,
      sponsoredFPCInstance,
    } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  for (const accountType of config.accounts) {
    transferBenchmark(accountType);
  }

  function transferBenchmark(accountType: AccountType) {
    return describe(`Transfer benchmark for ${accountType}`, () => {
      // Our benchmarking user
      let benchysAddress: AztecAddress;

      beforeAll(async () => {
        benchysAddress = await t.createAndFundBenchmarkingAccountOnUserWallet(accountType);
        // Fund benchy with bananas, so they can pay for the transfers using the private FPC
        await t.mintPrivateBananas(1000n * 10n ** 18n, benchysAddress);
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await userWallet.registerSender(adminAddress);
        // Register both FPC and BananCoin on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(bananaFPCInstance, FPCContract.artifact);
        await userWallet.registerContract(bananaCoinInstance, TestTokenContract.artifact);
        // Register the CandyBarCoin on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(candyBarCoinInstance);
        // Register the sponsored FPC on the user's PXE so we can simulate and prove
        await userWallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
      });

      function recursionTest(
        recursions: number,
        notesToCreate: number,
        benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod,
      ) {
        return describe(`Mint ${notesToCreate} notes and transfer using a ${accountType} account`, () => {
          // Total amount of coins minted across all notes
          let totalAmount: bigint;
          // Expected change after each test
          let expectedChange: bigint;

          beforeEach(async () => {
            // Mint some CandyBarCoins for the user, separated in different notes
            totalAmount = await mintNotes(
              adminWallet,
              adminAddress,
              benchysAddress,
              candyBarCoin,
              Array(notesToCreate).fill(BigInt(AMOUNT_PER_NOTE)),
            );
          });

          afterEach(async () => {
            // Send back the change to restart the test without redeploying the accounts
            const asset = TestTokenContract.at(candyBarCoin.address, userWallet);
            await asset.methods
              .transfer(adminAddress, expectedChange)
              .send({ from: benchysAddress, wait: { timeout: 120 } });
          });

          // Ensure we create a change note, by sending an amount that is not a multiple of the note amount
          const amountToSend = MINIMUM_NOTES_FOR_RECURSION_LEVEL[recursions] * AMOUNT_PER_NOTE + 1;

          it(`${accountType} contract transfers ${amountToSend} tokens using ${recursions} recursions, pays using ${benchmarkingPaymentMethod}`, async () => {
            const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
            const options: SimulateInteractionOptions = {
              from: benchysAddress,
              fee: { paymentMethod: await paymentMethod.forWallet(userWallet, benchysAddress) },
            };

            const asset = TestTokenContract.at(t.candyBarCoin.address, userWallet);

            const transferInteraction = asset.methods.transfer(adminAddress, amountToSend);

            expectedChange = totalAmount - BigInt(amountToSend);

            await captureProfile(
              `${accountType}+transfer_${recursions}_recursions+${benchmarkingPaymentMethod}`,
              transferInteraction,
              options,
              expectedExecutionSteps(
                1 + // Account entrypoint
                  paymentMethod.apps + // Payment method apps
                  1 + // CandyBarCoin transfer
                  recursions, // CandyBarCoin _recurse_subtract_balance per recursion
              ),
            );

            if (process.env.SANITY_CHECKS) {
              // Ensure we paid a fee
              const { receipt: tx } = await transferInteraction.send(options);
              expect(tx.transactionFee!).toBeGreaterThan(0n);

              // Sanity checks

              const txEffects = await node.getTxEffect(tx.txHash);

              /*
               * We should have created the following nullifiers:
               * - One per minted note
               * - One for the private event commitment (note transfer for the recipient)
               *  - Private FPC: One for the fee note, another one for the partial note validity commitment and an
               *   extra for the authwit invalidation
               *  - Any other payment method: kernel-injected non revertible nullifier due to abscence of nullifiers
               *   during the setup phase of the tx
               */
              expect(txEffects!.data.nullifiers.length).toBe(
                notesToCreate + 1 + (benchmarkingPaymentMethod === 'private_fpc' ? 3 : 1),
              );
              /**
               * We should have created 4 new notes,
               * - One for the recipient
               * - One for the sender (with the change)
               * - One for the fee if we're using a private fpc
               * - One for the fee refund if we're using a private fpc
               */
              expect(txEffects!.data.noteHashes.length).toBe(2 + (benchmarkingPaymentMethod === 'private_fpc' ? 2 : 0));

              const { result: senderBalance } = await asset.methods
                .balance_of_private(benchysAddress)
                .simulate({ from: benchysAddress });
              expect(senderBalance).toEqual(expectedChange);
            }
          });
        });
      }

      for (const paymentMethod of config.feePaymentMethods) {
        for (const recursions of config.recursions ?? []) {
          recursionTest(recursions, MINIMUM_NOTES_FOR_RECURSION_LEVEL[recursions] + 1, paymentMethod);
        }
      }
    });
  }
});
