import { AccountWallet, type PXE, PrivateFeePaymentMethod, type SimulateMethodOptions } from '@aztec/aztec.js';
import { FEE_FUNDING_FOR_TESTER_ACCOUNT } from '@aztec/constants';
import type { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { mintNotes } from '../fixtures/token_utils.js';
import { capturePrivateExecutionStepsIfEnvSet } from '../shared/capture_private_execution_steps.js';
import { type AccountType, ClientFlowsTest } from './client_test_flows.js';

jest.setTimeout(900_000);

const AMOUNT_PER_NOTE = 10;
// Actual quantities are 2, 10, 18, but as long as we
// surpass the last threshold we are forcing recursion
// without incurring in extra overhead when creating the notes
// This is due to the fact that we can only create 4 notes at a time
// using batchcall, so these quantities result in 1, 2, and 3 batches respectively
const TRANSFER_QUANTITIES = [2, 4, 12];

describe('Client flows benchmarking', () => {
  const t = new ClientFlowsTest('transfers');
  let adminWallet: AccountWallet;
  let bananaFPC: FPCContract;
  let bananaCoin: TokenContract;
  let candyBarCoin: TokenContract;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyDeployBananaTokenSnapshot();
    await t.applyFPCSetupSnapshot();
    await t.applyDeployCandyBarTokenSnapshot();
    ({ adminWallet, bananaFPC, bananaCoin, candyBarCoin } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  transferBenchmark('ecdsar1');
  transferBenchmark('schnorr');

  function transferBenchmark(accountType: AccountType) {
    return describe(`Transfer benchmark for ${accountType}`, () => {
      let benchysWallet: AccountWallet;
      let totalAmount: bigint;

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
      });

      for (let i = 0; i < TRANSFER_QUANTITIES.length; i++) {
        beforeEach(async () => {
          // Mint some CandyBarCoins for the user, separated in different notes
          totalAmount = await mintNotes(
            adminWallet,
            benchysWallet.getAddress(),
            candyBarCoin,
            Array(TRANSFER_QUANTITIES[i]).fill(BigInt(AMOUNT_PER_NOTE)),
          );
        });

        it(`${accountType} contract transfers tokens using ${i} recursions`, async () => {
          const paymentMethod = new PrivateFeePaymentMethod(bananaFPC.address, benchysWallet);
          const options: SimulateMethodOptions = { fee: { paymentMethod } };
          const amountToSend = Math.max(AMOUNT_PER_NOTE * TRANSFER_QUANTITIES[i], Number(totalAmount));

          const asset = await TokenContract.at(candyBarCoin.address, benchysWallet);

          const transferInteraction = asset.methods.transfer(adminWallet.getAddress(), amountToSend);

          await capturePrivateExecutionStepsIfEnvSet(
            `${accountType}+transfer_${i}_recursions+pay_private_fpc`,
            transferInteraction,
            options,
            1 + // Account entrypoint
              1 + // Kernel init
              2 + // FPC entrypoint + kernel inner
              2 + // BananaCoin transfer_to_public + kernel inner
              2 + // Account verify_private_authwit + kernel inner
              2 + // BananaCoin prepare_private_balance_increase + kernel inner
              2 + // CandyBarCoin transfer + kernel inner
              i * 2 + // (CandyBarCoin _recurse_subtract_balance + kernel inner) * recursions
              1 + // Kernel reset
              1, // Kernel tail
          );

          const tx = await transferInteraction.send(options).wait();
          expect(tx.transactionFee!).toBeGreaterThan(0n);
        });
      }
    });
  }
});
