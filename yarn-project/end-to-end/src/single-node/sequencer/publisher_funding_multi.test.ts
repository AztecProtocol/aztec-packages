import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { EthCheatCodes } from '@aztec/aztec/testing';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import { PublisherManager } from '@aztec/ethereum/publisher-manager';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import type { RunningPromise } from '@aztec/foundation/running-promise';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';

import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { join } from 'path';
import { type Hex, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import { getPrivateKeyFromIndex, setup } from '../../fixtures/utils.js';

// Key indices from the test MNEMONIC (all pre-funded by Anvil):
// 0 = L1 contract deployer (not in keystore)
// 1 = validator attester + publisher 1 EOA
// 2 = funding account
// 3 = publisher 2 EOA
const DEPLOYER_KEY_INDEX = 0;
const PUBLISHER1_KEY_INDEX = 1;
const FUNDER_KEY_INDEX = 2;
const PUBLISHER2_KEY_INDEX = 3;

const toPrivateKeyHex = (index: number): Hex => {
  const buf = getPrivateKeyFromIndex(index);
  if (!buf) {
    throw new Error(`Failed to derive private key for index ${index}`);
  }
  return `0x${buf.toString('hex')}`;
};

const FUNDING_THRESHOLD = parseEther('2');
const FUNDING_AMOUNT = parseEther('2.1');

/**
 * Exposes the {@link PublisherManager} internals this suite asserts on without `as any` casts. The
 * fields are re-declared `public` (they are `protected` on the base) so an `as` cast of the real
 * instance can read them. Re-exposed as fields rather than methods: the instance is a base
 * PublisherManager, so subclass methods would not exist on it at runtime — only its fields do.
 */
class TestPublisherManager extends PublisherManager {
  declare public publishers: L1TxUtils[];
  declare public funder?: L1TxUtils;
  declare public fundingPromise?: RunningPromise;
}

// Tests the PublisherManager's automatic L1 ETH top-up logic when a keystore carries two publishers and a
// dedicated funding account. Uses PIPELINING_SETUP_OPTS (prod sequencer, ethSlot=4s, aztecSlot=12s) with
// a pre-written keystore JSON and ethCheatCodes to drain and monitor publisher balances.
describe('single-node/sequencer/publisher_funding_multi', () => {
  jest.setTimeout(5 * 60 * 1000);

  let logger: Logger;
  let publisherManager: PublisherManager;
  let ethCheatCodes: EthCheatCodes;
  let teardown: () => Promise<void>;
  let keyStoreDirectory: string;

  beforeAll(async () => {
    const attesterKey = toPrivateKeyHex(PUBLISHER1_KEY_INDEX);
    const publisherKey1 = attesterKey;
    const publisherKey2 = toPrivateKeyHex(PUBLISHER2_KEY_INDEX);
    const funderKey = toPrivateKeyHex(FUNDER_KEY_INDEX);
    const attesterAddress = privateKeyToAccount(attesterKey).address;

    // Write keystore JSON with two publishers and a fundingAccount
    keyStoreDirectory = await mkdtemp(join(tmpdir(), 'publisher-funding-multi-'));
    const keystore = {
      schemaVersion: 1,
      validators: [
        {
          attester: attesterKey,
          publisher: [publisherKey1, publisherKey2],
          coinbase: EthAddress.fromNumber(42).toChecksumString(),
          feeRecipient: AztecAddress.fromNumberUnsafe(42).toString(),
        },
      ],
      fundingAccount: funderKey,
    };
    await writeFile(join(keyStoreDirectory, 'keystore.json'), JSON.stringify(keystore, null, 2));

    // Stake the validator on L1 so the sequencer can propose blocks
    const initialValidators = [
      {
        attester: EthAddress.fromString(attesterAddress),
        withdrawer: EthAddress.fromString(attesterAddress),
        privateKey: attesterKey as Hex,
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      },
    ];

    let sequencerClient: SequencerClient | undefined;
    ({
      teardown,
      logger,
      sequencer: sequencerClient,
      ethCheatCodes,
    } = await setup(0, {
      ...PIPELINING_SETUP_OPTS,
      initialValidators,
      keyStoreDirectory,
      publisherFundingThreshold: FUNDING_THRESHOLD,
      publisherFundingAmount: FUNDING_AMOUNT,
      minTxsPerBlock: 0,
      l1PublisherKey: new SecretValue(toPrivateKeyHex(DEPLOYER_KEY_INDEX)),
    }));

    publisherManager = (sequencerClient! as TestSequencerClient).publisherManager;
  });

  afterAll(async () => {
    await teardown();
    await rm(keyStoreDirectory, { recursive: true, force: true });
  });

  // Sets both publisher L1 balances below the funding threshold via ethCheatCodes, drives the
  // PublisherManager's funding loop to top them both up (round 1), then drains one publisher again
  // and drives a second funding round to confirm the loop is still healthy.
  it('funds both publishers when balances drop below threshold', async () => {
    const publishers: L1TxUtils[] = (publisherManager as TestPublisherManager).publishers;
    const funder: L1TxUtils | undefined = (publisherManager as TestPublisherManager).funder;
    // The PublisherManager runs triggerFundingIfNeeded on a 2-minute RunningPromise. Driving that
    // RunningPromise directly via trigger() forces an immediate funding cycle, so the test does not
    // pay the (up to) 2-minute polling interval per round.
    const fundingPromise: RunningPromise | undefined = (publisherManager as TestPublisherManager).fundingPromise;

    expect(publishers.length).toBe(2);
    expect(funder).toBeDefined();
    expect(fundingPromise).toBeDefined();

    const publisher1Address = publishers[0].getSenderAddress();
    const publisher2Address = publishers[1].getSenderAddress();
    const funderAddress = funder!.getSenderAddress();
    logger.info(`Publisher1: ${publisher1Address}, Publisher2: ${publisher2Address}, Funder: ${funderAddress}`);

    // Set both publisher balances below threshold
    const LOW_BALANCE = parseEther('0.1');
    await ethCheatCodes.setBalance(publisher1Address, LOW_BALANCE);
    await ethCheatCodes.setBalance(publisher2Address, LOW_BALANCE);
    // Give funder plenty of ETH
    await ethCheatCodes.setBalance(funderAddress, parseEther('100'));

    const funderBalanceBefore = await ethCheatCodes.getBalance(funderAddress);

    // Force the funding cycle now rather than waiting for the next 2-minute poll, then confirm both
    // publishers were topped up.
    await fundingPromise!.trigger();

    // REFACTOR: hand-rolled poll waiting for PublisherManager funding cycle; a helper like
    // waitForPublisherBalancesAbove(publisherManager, threshold) should replace this retryUntil.
    await retryUntil(
      async () => {
        const balance1 = await ethCheatCodes.getBalance(publisher1Address);
        const balance2 = await ethCheatCodes.getBalance(publisher2Address);
        return balance1 > LOW_BALANCE && balance2 > LOW_BALANCE ? true : undefined;
      },
      'waiting for both publishers to be funded',
      180,
      1,
    );

    const publisher1BalanceAfter = await ethCheatCodes.getBalance(publisher1Address);
    const publisher2BalanceAfter = await ethCheatCodes.getBalance(publisher2Address);
    const funderBalanceAfter = await ethCheatCodes.getBalance(funderAddress);
    const funderSpent = funderBalanceBefore - funderBalanceAfter;

    logger.info(`Publisher1 balance after: ${publisher1BalanceAfter} (was ${LOW_BALANCE})`);
    logger.info(`Publisher2 balance after: ${publisher2BalanceAfter} (was ${LOW_BALANCE})`);
    logger.info(`Funder spent: ${funderSpent} (expected ~${2n * FUNDING_AMOUNT})`);

    expect(publisher1BalanceAfter).toBeGreaterThan(LOW_BALANCE);
    expect(publisher2BalanceAfter).toBeGreaterThan(LOW_BALANCE);
    // Both publishers should now be above the funding threshold
    expect(publisher1BalanceAfter).toBeGreaterThanOrEqual(FUNDING_THRESHOLD);
    expect(publisher2BalanceAfter).toBeGreaterThanOrEqual(FUNDING_THRESHOLD);
    // Funder should have sent 2 * FUNDING_AMOUNT plus gas costs (single multicall)
    expect(funderSpent).toBeGreaterThanOrEqual(2n * FUNDING_AMOUNT);

    // Second round: deterministically drop one publisher below threshold after the first refill.
    // Waiting for organic gas depletion is brittle under pipelined publisher rotation: the exact
    // publisher cadence and L1 gas burn vary enough that the balance may not cross the threshold
    // before the test timeout, even though the periodic funding loop is healthy.
    await ethCheatCodes.setBalance(publisher1Address, LOW_BALANCE);
    const funderBalanceBefore2 = await ethCheatCodes.getBalance(funderAddress);
    logger.info(`Waiting for second funding round`);

    // Force a second funding cycle rather than waiting for the next 2-minute poll.
    await fundingPromise!.trigger();

    // REFACTOR: hand-rolled poll waiting for a second PublisherManager funding cycle; same helper
    // as above should cover this site.
    await retryUntil(
      async () => {
        const spent = funderBalanceBefore2 - (await ethCheatCodes.getBalance(funderAddress));
        return spent >= FUNDING_AMOUNT ? true : undefined;
      },
      'waiting for second funding round',
      180,
      1,
    );

    const funderSpent2 = funderBalanceBefore2 - (await ethCheatCodes.getBalance(funderAddress));
    logger.info(`Second funding round: funder spent ${funderSpent2} (expected ~${FUNDING_AMOUNT})`);
    expect(funderSpent2).toBeGreaterThanOrEqual(FUNDING_AMOUNT);
  });
});
