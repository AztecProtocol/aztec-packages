import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { EthCheatCodes } from '@aztec/aztec/testing';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { PublisherManager } from '@aztec/ethereum/publisher-manager';
import { SecretValue } from '@aztec/foundation/config';
import { retryUntil } from '@aztec/foundation/retry';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';

import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import 'jest-extended';
import { tmpdir } from 'os';
import { join } from 'path';
import { type Hex, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

// Key indices from the test MNEMONIC (all pre-funded by Anvil):
// 0 = L1 contract deployer (not in keystore)
// 1 = validator attester + publisher EOA
// 2 = funding account
const DEPLOYER_KEY_INDEX = 0;
const PUBLISHER_KEY_INDEX = 1;
const FUNDER_KEY_INDEX = 2;

const toPrivateKeyHex = (index: number): Hex => {
  const buf = getPrivateKeyFromIndex(index);
  if (!buf) {
    throw new Error(`Failed to derive private key for index ${index}`);
  }
  return `0x${buf.toString('hex')}`;
};

const FUNDING_THRESHOLD = parseEther('0.5');
// Small enough that publishing a few blocks will drain it below threshold again, triggering re-funding.
const FUNDING_AMOUNT = parseEther('0.1');

describe('e2e_publisher_funding', () => {
  jest.setTimeout(5 * 60 * 1000);

  let logger: Logger;
  let publisherManager: PublisherManager;
  let ethCheatCodes: EthCheatCodes;
  let teardown: () => Promise<void>;
  let keyStoreDirectory: string;

  beforeAll(async () => {
    const attesterKey = toPrivateKeyHex(PUBLISHER_KEY_INDEX);
    const publisherKey = attesterKey;
    const funderKey = toPrivateKeyHex(FUNDER_KEY_INDEX);
    const attesterAddress = privateKeyToAccount(attesterKey).address;

    // Write keystore JSON with fundingAccount
    keyStoreDirectory = await mkdtemp(join(tmpdir(), 'publisher-funding-'));
    const keystore = {
      schemaVersion: 1,
      validators: [
        {
          attester: attesterKey,
          publisher: [publisherKey],
          coinbase: EthAddress.fromNumber(42).toChecksumString(),
          feeRecipient: AztecAddress.fromNumber(42).toString(),
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

  it('funds publisher when balance drops below threshold', async () => {
    const publishers: L1TxUtils[] = (publisherManager as any).publishers;
    const funder: L1TxUtils | undefined = (publisherManager as any).funder;

    expect(publishers.length).toBe(1);
    expect(funder).toBeDefined();

    const publisherAddress = publishers[0].getSenderAddress();
    const funderAddress = funder!.getSenderAddress();
    logger.info(`Publisher: ${publisherAddress}, Funder: ${funderAddress}`);

    // Set publisher balance below threshold
    const LOW_BALANCE = parseEther('0.1');
    await ethCheatCodes.setBalance(publisherAddress, LOW_BALANCE);
    // Give funder plenty of ETH
    await ethCheatCodes.setBalance(funderAddress, parseEther('100'));

    const funderBalanceBefore = await ethCheatCodes.getBalance(funderAddress);

    // The sequencer periodically calls getAvailablePublisher(), which triggers funding
    // when it sees the publisher balance is below threshold. Wait for funding to land.
    await retryUntil(
      async () => {
        const balance = await ethCheatCodes.getBalance(publisherAddress);
        return balance > LOW_BALANCE ? true : undefined;
      },
      'waiting for publisher to be funded',
      60,
      1,
    );

    const publisherBalanceAfter = await ethCheatCodes.getBalance(publisherAddress);
    const funderBalanceAfter = await ethCheatCodes.getBalance(funderAddress);
    const funderSpent = funderBalanceBefore - funderBalanceAfter;

    logger.info(`Publisher balance after: ${publisherBalanceAfter} (was ${LOW_BALANCE})`);
    logger.info(`Funder spent: ${funderSpent} (expected ~${FUNDING_AMOUNT})`);

    expect(publisherBalanceAfter).toBeGreaterThan(LOW_BALANCE);
    // Funder should have sent exactly FUNDING_AMOUNT plus gas costs
    expect(funderSpent).toBeGreaterThanOrEqual(FUNDING_AMOUNT);

    // Second round: the publisher will spend gas publishing blocks, eventually dropping
    // below threshold again. The funder should automatically top it up a second time.
    const funderBalanceBefore2 = await ethCheatCodes.getBalance(funderAddress);
    logger.info(`Waiting for publisher to drain and get re-funded`);

    await retryUntil(
      async () => {
        const spent = funderBalanceBefore2 - (await ethCheatCodes.getBalance(funderAddress));
        return spent >= FUNDING_AMOUNT ? true : undefined;
      },
      'waiting for second funding round',
      120,
      1,
    );

    const funderSpent2 = funderBalanceBefore2 - (await ethCheatCodes.getBalance(funderAddress));
    logger.info(`Second funding round: funder spent ${funderSpent2}`);
    expect(funderSpent2).toBeGreaterThanOrEqual(FUNDING_AMOUNT);
  });
});
