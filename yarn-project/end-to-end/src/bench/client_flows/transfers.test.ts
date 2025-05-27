import { AccountWallet, type AztecNode, Fr, type SimulateMethodOptions } from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { mintNotes } from '../../fixtures/token_utils.js';
import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(1_600_000);

const AMOUNT_PER_NOTE = 1_000_000;

const MINIMUM_NOTES_FOR_RECURSION_LEVEL = [0, 2, 10];

describe('Transfer benchmark', () => {
  const t = new ClientFlowsBenchmark('transfers');
  // The admin that aids in the setup of the test
  let adminWallet: AccountWallet;
  // FPC that accepts bananas
  let bananaFPC: FPCContract;
  // BananaCoin Token contract, just used to pay fees in this scenario
  let bananaCoin: TokenContract;
  // CandyBarCoin Token contract, which we want to transfer
  let candyBarCoin: TokenContract;
  // Sponsored FPC contract
  let sponsoredFPC: SponsoredFPCContract;
  // Aztec node
  let node: AztecNode;
  // Benchmarking configuration
  const config = t.config.transfers;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    await t.applyDeployCandyBarTokenSnapshot();
    await t.applyDeploySponsoredFPCSnapshot();

    ({ adminWallet, bananaFPC, bananaCoin, candyBarCoin, sponsoredFPC, aztecNode: node } = await t.setup());
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
      let benchysWallet: AccountWallet;

      beforeAll(async () => {
        benchysWallet = await t.createAndFundBenchmarkingWallet(accountType);
        // Fund benchy with bananas, so they can pay for the transfers using the private FPC
        await t.mintPrivateBananas(FEE_FUNDING_FOR_TESTER_ACCOUNT, benchysWallet.getAddress());
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await benchysWallet.registerSender(adminWallet.getAddress());
        // Register both FPC and BananCoin on the user's Wallet so we can simulate and prove
        await benchysWallet.registerContract(bananaFPC);
        await benchysWallet.registerContract(bananaCoin);
        // Register the CandyBarCoin on the user's Wallet so we can simulate and prove
        await benchysWallet.registerContract(candyBarCoin);
        // Register the sponsored FPC on the user's PXE so we can simulate and prove
        await benchysWallet.registerContract(sponsoredFPC);
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
              benchysWallet.getAddress(),
              candyBarCoin,
              Array(notesToCreate).fill(BigInt(AMOUNT_PER_NOTE)),
            );
          });

          afterEach(async () => {
            // Send back the change to restart the test without redeploying the accounts
            // We can do this because adminPXE has the private key for the user
            // Since the admin's PXE never generates proofs, this upkeep is better done by them
            const interaction = candyBarCoin.methods.transfer_in_private(
              benchysWallet.getAddress(),
              adminWallet.getAddress(),
              expectedChange,
              Fr.random(),
            );
            const witness = await benchysWallet.createAuthWit({
              caller: adminWallet.getAddress(),
              action: interaction,
            });
            await interaction.send({ authWitnesses: [witness] }).wait({ timeout: 120 });
          });

          // Ensure we create a change note, by sending an amount that is not a multiple of the note amount
          const amountToSend = MINIMUM_NOTES_FOR_RECURSION_LEVEL[recursions] * AMOUNT_PER_NOTE + 1;

          it(`${accountType} contract transfers ${amountToSend} tokens using ${recursions} recursions, pays using ${benchmarkingPaymentMethod}`, async () => {
            const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
            const options: SimulateMethodOptions = {
              fee: { paymentMethod: await paymentMethod.forWallet(benchysWallet) },
            };

            const asset = await TokenContract.at(candyBarCoin.address, benchysWallet);

            const transferInteraction = asset.methods.transfer(adminWallet.getAddress(), amountToSend);

            await captureProfile(
              `${accountType}+transfer_${recursions}_recursions+${benchmarkingPaymentMethod}`,
              transferInteraction,
              options,
              1 + // Account entrypoint
                1 + // Kernel init
                paymentMethod.circuits + // Payment method circuits
                2 + // CandyBarCoin transfer + kernel inner
                recursions * 2 + // (CandyBarCoin _recurse_subtract_balance + kernel inner) * recursions
                1 + // Kernel reset
                1, // Kernel tail
            );

            expectedChange = totalAmount - BigInt(amountToSend);

            if (process.env.SANITY_CHECKS) {
              // Ensure we paid a fee
              const tx = await transferInteraction.send(options).wait();
              expect(tx.transactionFee!).toBeGreaterThan(0n);

              // Sanity checks

              const txEffects = await node.getTxEffect(tx.txHash);

              /*
               * We should have created the following nullifiers:
               * - One per created note
               * - One for the transaction
               * - One for the fee note and one for the partial note validity commitment if we're using private fpc
               */
              expect(txEffects!.data.nullifiers.length).toBe(
                notesToCreate + 1 + (benchmarkingPaymentMethod === 'private_fpc' ? 2 : 0),
              );
              /** We should have created 4 new notes,
               *  - One for the recipient
               *  - One for the sender (with the change)
               *  - One for the fee if we're using private fpc
               *  - One for the fee refund if we're using private fpc
               */
              expect(txEffects!.data.noteHashes.length).toBe(2 + (benchmarkingPaymentMethod === 'private_fpc' ? 2 : 0));

              const senderBalance = await asset.methods.balance_of_private(benchysWallet.getAddress()).simulate();
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
