import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { ContractInstanceWithAddress, SimulateInteractionOptions } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { AMMContract } from '@aztec/noir-contracts.js/AMM';
import { FPCContract } from '@aztec/noir-contracts.js/FPC';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import type { RoundTripStats } from '@aztec/stdlib/tx';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { mintNotes } from '../../fixtures/token_utils.js';
import { captureProfile } from './benchmark.js';
import { type AccountType, type BenchmarkingFeePaymentMethod, ClientFlowsBenchmark } from './client_flows_benchmark.js';

jest.setTimeout(900_000);

const AMOUNT_PER_NOTE = 1_000_000;

const MINIMUM_NOTES_FOR_RECURSION_LEVEL = [0, 2, 10];

// Set to true to print out the round trip information to the console.
const DEBUG_ROUND_TRIPS = false;

// Expected number of node round trips per account contract and payment method.
const EXPECTED_ROUND_TRIPS: Record<string, number> = {
  'ecdsar1+private_fpc': 118,
  'ecdsar1+sponsored_fpc': 80,
  'schnorr+private_fpc': 118,
  'schnorr+sponsored_fpc': 82,
};

interface RoundTripData {
  accountType: AccountType;
  paymentMethod: BenchmarkingFeePaymentMethod;
  roundTrips: RoundTripStats;
}

describe('AMM benchmark', () => {
  const roundTripData: RoundTripData[] = [];
  const t = new ClientFlowsBenchmark('amm');
  // The wallet used by the admin to interact
  let adminWallet: Wallet;
  // The wallet used by the user to interact
  let userWallet: TestWallet;
  // The admin that aids in the setup of the test
  let adminAddress: AztecAddress;
  // FPC that accepts bananas
  let bananaFPCInstance: ContractInstanceWithAddress;
  // BananaCoin Token contract, just used to pay fees in this scenario
  let bananaCoin: TokenContract;
  let bananaCoinInstance: ContractInstanceWithAddress;
  // CandyBarCoin Token contract, which we want to amm
  let candyBarCoin: TokenContract;
  let candyBarCoinInstance: ContractInstanceWithAddress;
  // AMM contract
  let amm: AMMContract;
  let ammInstance: ContractInstanceWithAddress;
  // Liquidity contract for the AMM
  let liquidityTokenInstance: ContractInstanceWithAddress;
  // Sponsored FPC contract
  let sponsoredFPCInstance: ContractInstanceWithAddress;
  // Benchmarking configuration
  const config = t.config.amm;

  beforeAll(async () => {
    await t.setup();
    await t.applyDeployBananaToken();
    await t.applyFPCSetup();
    await t.applyDeployCandyBarToken();
    await t.applyDeployAmm();
    await t.applyDeploySponsoredFPC();
    ({
      adminWallet,
      userWallet,
      adminAddress,
      amm,
      bananaFPCInstance,
      bananaCoin,
      bananaCoinInstance,
      candyBarCoin,
      candyBarCoinInstance,
      ammInstance,
      liquidityTokenInstance,
      sponsoredFPCInstance,
    } = t);
  });

  afterAll(async () => {
    if (DEBUG_ROUND_TRIPS) {
      printRoundTripDebuggingInfo(roundTripData);
    }
    await t.teardown();
  });

  for (const accountType of config.accounts) {
    ammBenchmark(accountType);
  }

  function ammBenchmark(accountType: AccountType) {
    return describe(`AMM benchmark for ${accountType}`, () => {
      // Our benchmarking user
      let benchysAddress: AztecAddress;
      // Number of notes to create
      const notesToCreate = MINIMUM_NOTES_FOR_RECURSION_LEVEL[1] + 1; // 1 recursion level

      beforeAll(async () => {
        benchysAddress = await t.createAndFundBenchmarkingAccountOnUserWallet(accountType);
        // Fund benchy with bananas, so they can pay for the amms using the private FPC
        await t.mintPrivateBananas(1000n * 10n ** 18n, benchysAddress);
        // Register admin as sender in benchy's wallet, since we need it to discover the minted bananas
        await userWallet.registerSender(adminAddress);
        // Register both FPC and BananCoin on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(bananaFPCInstance, FPCContract.artifact);
        await userWallet.registerContract(bananaCoinInstance, TokenContract.artifact);
        // Register the CandyBarCoin on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(candyBarCoinInstance);
        // Register the AMM and liquidity token on the user's Wallet so we can simulate and prove
        await userWallet.registerContract(ammInstance, AMMContract.artifact);
        await userWallet.registerContract(liquidityTokenInstance);
        // Register the sponsored FPC on the user's PXE so we can simulate and prove
        await userWallet.registerContract(sponsoredFPCInstance, SponsoredFPCContract.artifact);
      });

      function addLiquidityTest(benchmarkingPaymentMethod: BenchmarkingFeePaymentMethod) {
        return describe(`Add liquidity with ${notesToCreate} notes in both tokens using a ${accountType} account`, () => {
          beforeEach(async () => {
            // Mint some CandyBarCoins for the user, separated in different notes
            await mintNotes(
              adminWallet,
              adminAddress,
              benchysAddress,
              candyBarCoin,
              Array(notesToCreate).fill(BigInt(AMOUNT_PER_NOTE)),
            );
            // Mint some BananaCoins for the user, separated in different notes
            await mintNotes(
              adminWallet,
              adminAddress,
              benchysAddress,
              bananaCoin,
              Array(notesToCreate).fill(BigInt(AMOUNT_PER_NOTE)),
            );
          });

          // Ensure we create a change note, by sending an amount that is not a multiple of the note amount
          const amountToSend = MINIMUM_NOTES_FOR_RECURSION_LEVEL[1] * AMOUNT_PER_NOTE + 1;

          it(`${accountType} contract adds liquidity to the AMM sending ${amountToSend} tokens using 1 recursions in both and pays using ${benchmarkingPaymentMethod}`, async () => {
            const paymentMethod = t.paymentMethods[benchmarkingPaymentMethod];
            const options: SimulateInteractionOptions = {
              from: benchysAddress,
              fee: { paymentMethod: await paymentMethod.forWallet(userWallet, benchysAddress) },
            };

            const nonceForAuthwits = Fr.random();
            const token0Authwit = await userWallet.createAuthWit(benchysAddress, {
              caller: amm.address,
              action: bananaCoin.methods.transfer_to_public_and_prepare_private_balance_increase(
                benchysAddress,
                amm.address,
                amountToSend,
                nonceForAuthwits,
              ),
            });
            const token1Authwit = await userWallet.createAuthWit(benchysAddress, {
              caller: amm.address,
              action: candyBarCoin.methods.transfer_to_public_and_prepare_private_balance_increase(
                benchysAddress,
                amm.address,
                amountToSend,
                nonceForAuthwits,
              ),
            });

            const addLiquidityInteraction = amm
              .withWallet(userWallet)
              .methods.add_liquidity(amountToSend, amountToSend, amountToSend, amountToSend, nonceForAuthwits)
              .with({ authWitnesses: [token0Authwit, token1Authwit] });

            // Get node stats from the benchmarked node to track RPC calls
            const nodeStats = t.benchmarkedNode.getStats();

            await captureProfile(
              `${accountType}+amm_add_liquidity_1_recursions+${benchmarkingPaymentMethod}`,
              addLiquidityInteraction,
              options,
              1 + // Account entrypoint
                1 + // Kernel init
                paymentMethod.circuits + // Payment method circuits
                2 + // AMM add_liquidity + kernel inner
                2 + // Token transfer_to_public_and_prepare_private_balance_increase + kernel inner (token0)
                2 + // Account verify_private_authwit + kernel inner
                2 + // Token transfer_to_public_and_prepare_private_balance_increase + kernel inner (token1)
                2 + // Account verify_private_authwit + kernel inner
                2 + // Token prepare_private_balance_increase + kernel inner (liquidity token mint)
                1 + // Kernel reset
                1 + // Kernel tail
                1, // Kernel hiding
              nodeStats,
            );

            if (process.env.SANITY_CHECKS) {
              const tx = await addLiquidityInteraction.send({ from: benchysAddress }).wait();
              expect(tx.transactionFee!).toBeGreaterThan(0n);
            }

            if (DEBUG_ROUND_TRIPS) {
              roundTripData.push({
                accountType,
                paymentMethod: benchmarkingPaymentMethod,
                roundTrips: nodeStats.roundTrips,
              });
            } else {
              const roundTripsKey = `${accountType}+${benchmarkingPaymentMethod}`;
              const actualRoundTrips = nodeStats.roundTrips.roundTrips;
              const expectedRoundTrips = EXPECTED_ROUND_TRIPS[roundTripsKey];
              if (expectedRoundTrips === undefined) {
                throw new Error(
                  `Missing expected round trips for ${roundTripsKey}. ` +
                    `Add '${roundTripsKey}': ${actualRoundTrips} to EXPECTED_ROUND_TRIPS.`,
                );
              }

              // The following check serves as a regression test. If you get a failure and it is expected, just update
              // the EXPECTED_ROUND_TRIPS constants. If the failure is unexpected, it needs to be investigated. To
              // investigate, set the DEBUG_ROUND_TRIPS environment variable to true on both the `next` branch and
              // here, then compare the outputs (look for any newly appearing or missing round trips). To compare the
              // outputs I recommend using a diff checker like https://www.diffchecker.com/.
              //
              // Note that the round trip values depend on this test suite being run in its entirety and in the correct
              // order.
              //
              // If you encounter this failure in CI and are unsure of the cause, contact @benesjan.
              expect(actualRoundTrips).toBe(expectedRoundTrips);
            }
          });
        });
      }

      for (const paymentMethod of config.feePaymentMethods) {
        addLiquidityTest(paymentMethod);
      }
    });
  }

  /**
   * Prints out the round trip information that can be used to debug unexpected round trip changes.
   */
  function printRoundTripDebuggingInfo(data: RoundTripData[]) {
    const width = 120; // Fixed standard width
    const title = '  ROUND TRIP DEBUGGING INFORMATION';

    // Helper function to wrap long lines, breaking at commas when possible
    function wrapLine(content: string, maxContentWidth: number): string[] {
      if (content.length <= maxContentWidth) {
        return [content];
      }

      const lines: string[] = [];
      let remaining = content;

      while (remaining.length > 0) {
        if (remaining.length <= maxContentWidth) {
          lines.push(remaining);
          break;
        }

        // Try to find a good break point (comma followed by space)
        let breakPoint = maxContentWidth;
        const commaIndex = remaining.lastIndexOf(', ', maxContentWidth);
        if (commaIndex > maxContentWidth * 0.4) {
          // Use comma break if it's not too early (at least 40% into the line)
          breakPoint = commaIndex + 2; // Include the comma and space
        }

        const line = remaining.substring(0, breakPoint);
        lines.push(line);
        remaining = remaining.substring(breakPoint).trim();
      }

      return lines;
    }

    // Group by account type for better organization
    const groupedByAccount = data.reduce(
      (acc, item) => {
        if (!acc[item.accountType]) {
          acc[item.accountType] = [];
        }
        acc[item.accountType].push(item);
        return acc;
      },
      {} as Record<AccountType, RoundTripData[]>,
    );

    const accountEntries = Object.entries(groupedByAccount) as [AccountType, RoundTripData[]][];
    const topBorder = '╔' + '═'.repeat(width - 2) + '╗';
    const bottomBorder = '╚' + '═'.repeat(width - 2) + '╝';
    const sectionTop = '╠' + '═'.repeat(width - 2) + '╣';
    const sectionDivider = '╠' + '─'.repeat(width - 2) + '╣';
    const sectionBottom = '╠' + '─'.repeat(width - 2) + '╣';
    const leftBorder = '║';
    const rightBorder = '║';

    let output = '\n' + topBorder + '\n';
    output += leftBorder + title.padEnd(width - 2) + rightBorder + '\n';
    output += sectionTop + '\n';

    for (let accountIdx = 0; accountIdx < accountEntries.length; accountIdx++) {
      const [accountType, items] = accountEntries[accountIdx];

      if (accountIdx > 0) {
        output += sectionDivider + '\n';
      }

      output += leftBorder + `  Account Type: ${accountType.toUpperCase()}`.padEnd(width - 2) + rightBorder + '\n';
      output += sectionDivider + '\n';

      for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
        const item = items[itemIdx];
        const roundTrips = item.roundTrips;

        if (itemIdx > 0) {
          output += leftBorder + ' '.repeat(width - 2) + rightBorder + '\n';
        }

        const key = `${item.accountType}+${item.paymentMethod}`;
        output += leftBorder + `  Configuration: ${key}`.padEnd(width - 2) + rightBorder + '\n';
        output += leftBorder + `  Total Round Trips: ${roundTrips.roundTrips}`.padEnd(width - 2) + rightBorder + '\n';
        output += leftBorder + `  Payment Method: ${item.paymentMethod}`.padEnd(width - 2) + rightBorder + '\n';
        output += leftBorder + ' '.repeat(width - 2) + rightBorder + '\n';
        output += leftBorder + '  Per Round Trip:'.padEnd(width - 2) + rightBorder + '\n';

        for (let i = 0; i < roundTrips.roundTripMethods.length; i++) {
          const methods = roundTrips.roundTripMethods[i];
          const methodsStr = methods.length > 0 ? methods.join(', ') : '(empty)';
          const rtNum = String(i + 1).padStart(3, ' ');
          const prefix = `    RT ${rtNum}: `;
          const content = `[${methodsStr}]`;

          // Calculate available width for content (account for borders and prefix)
          // width - 2 for borders, then subtract prefix length
          const maxContentWidth = width - 2 - prefix.length;
          const wrappedLines = wrapLine(content, maxContentWidth);

          for (let lineIdx = 0; lineIdx < wrappedLines.length; lineIdx++) {
            const lineContent = lineIdx === 0 ? prefix + wrappedLines[lineIdx] : '        ' + wrappedLines[lineIdx]; // Continuation line with extra indentation
            output += leftBorder + lineContent.padEnd(width - 2) + rightBorder + '\n';
          }
        }
      }
    }

    output += sectionBottom + '\n';
    output += leftBorder + `  Total Test Runs: ${data.length}`.padEnd(width - 2) + rightBorder + '\n';
    output += bottomBorder + '\n';

    // eslint-disable-next-line no-console
    console.log(output);
  }
});
