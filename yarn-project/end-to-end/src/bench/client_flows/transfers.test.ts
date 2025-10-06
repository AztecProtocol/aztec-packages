import { AztecAddress, type AztecNode, Fr, type SimulateInteractionOptions, type Wallet } from '@aztec/aztec.js';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import type { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { mintNotes } from '../../fixtures/token_utils.js';
import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(1_600_000);

const AMOUNT_PER_NOTE = 1_000_000;

const MINIMUM_NOTES_FOR_RECURSION_LEVEL = [0, 2, 10];

describe('Transfer benchmark', () => {
  const t = new ClientFlowsBenchmark('transfers');
  // The wallet used by the admin to interact
  let adminWallet: Wallet;
  // The wallet used by the user to interact
  let userWallet: TestWallet;
  // The admin that aids in the setup of the test
  let adminAddress: AztecAddress;
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

    ({
      adminWallet,
      userWallet,
      adminAddress,
      bananaFPC,
      bananaCoin,
      candyBarCoin,
      sponsoredFPC,
      aztecNode: node,
    } = await t.setup());
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
        await userWallet.registerContract(bananaFPC);
        await userWallet.registerContract(bananaCoin);
        // Register the CandyBarCoin on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(candyBarCoin);
        // Register the sponsored FPC on the user's PXE so we can simulate and prove
        await userWallet.registerContract(sponsoredFPC);
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
            // We can do this because adminPXE has the private key for the user
            // Since the admin's PXE never generates proofs, this upkeep is better done by them
            const interaction = candyBarCoin.methods.transfer_in_private(
              benchysAddress,
              adminAddress,
              expectedChange,
              Fr.random(),
            );
            const witness = await userWallet.createAuthWit(benchysAddress, {
              caller: adminAddress,
              action: interaction,
            });
            await interaction.send({ from: adminAddress, authWitnesses: [witness] }).wait({ timeout: 120 });
          });

          // Ensure we create a change note, by sending an amount that is not a multiple of the note amount
          const amountToSend = MINIMUM_NOTES_FOR_RECURSION_LEVEL[recursions] * AMOUNT_PER_NOTE + 1;

          it(`${accountType} contract transfers ${amountToSend} tokens using ${recursions} recursions, pays using ${benchmarkingPaymentMethod}`, async () => {
            const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
            const options: SimulateInteractionOptions = {
              from: benchysAddress,
              fee: { paymentMethod: await paymentMethod.forWallet(userWallet, benchysAddress) },
            };

            const asset = await TokenContract.at(candyBarCoin.address, userWallet);

            const transferInteraction = asset.methods.transfer(adminAddress, amountToSend);

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
                1 + // Kernel tail
                1, // Kernel hiding
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

              const senderBalance = await asset.methods
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
