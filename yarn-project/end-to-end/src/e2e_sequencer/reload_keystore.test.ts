import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import type { CheatCodes } from '@aztec/aztec/testing';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import type { EthPrivateKey } from '@aztec/node-keystore';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { type SequencerClient, type SequencerEvents, SequencerState } from '@aztec/sequencer-client';
import type { TestSequencer, TestSequencerClient } from '@aztec/sequencer-client/test';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { ValidatorClient } from '@aztec/validator-client';

import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { privateKeyToAccount } from 'viem/accounts';

import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';

const VALIDATOR_KEY_INDICES = [0, 2, 4, 5];
const PUBLISHER_KEY_INDEX = 3;

// 4 validators staked on L1, committee size 4 → quorum = floor(4*2/3)+1 = 3.
// Only 3 validators are in the initial keystore (enough for quorum).
// After reload, the 4th validator is added.
const VALIDATOR_COUNT = 4;
const COMMITTEE_SIZE = VALIDATOR_COUNT;
const INITIAL_KEYSTORE_COUNT = 3;

// REFACTOR: hand-rolled state-changed on/off subscription with a manual timeout that runs an action and
// waits for the sequencer to return to IDLE — a waitForSequencerState(IDLE, { after }) DSL helper should
// replace it (also duplicated as waitForSequencerIdle in e2e_multiple_blobs / e2e_fees / l2_to_l1).
async function waitForSequencerIdleAfter(
  sequencer: TestSequencer,
  action: () => Promise<unknown>,
  timeout = 30_000,
): Promise<void> {
  let settled = false;
  let resolveIdle!: () => void;
  let rejectIdle!: (err: Error) => void;
  const idlePromise = new Promise<void>((resolve, reject) => {
    resolveIdle = resolve;
    rejectIdle = reject;
  });

  let cleanup = () => {};
  const finish = (complete: () => void) => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    complete();
  };

  const handler = (args: Parameters<SequencerEvents['state-changed']>[0]) => {
    if (args.newState === SequencerState.IDLE) {
      finish(resolveIdle);
    }
  };

  const timer = setTimeout(
    () => finish(() => rejectIdle(new Error('Timeout waiting for sequencer IDLE state'))),
    timeout,
  );
  cleanup = () => {
    clearTimeout(timer);
    sequencer.off('state-changed', handler);
  };

  sequencer.on('state-changed', handler);
  try {
    await action();
    if (sequencer.status().state === SequencerState.IDLE) {
      finish(resolveIdle);
    }
    await idlePromise;
  } catch (err) {
    finish(() => {});
    throw err;
  }
}

// Tests that the sequencer node's keystore can be hot-reloaded at runtime via the admin API.
// One node with 4 validators staked, committee size 4. Initially only 3 validators are in the
// keystore; after reload all 4 are active with new coinbases. Uses PIPELINING_SETUP_OPTS
// (ethSlot=4s, aztecSlot=12s) with minTxsPerBlock=1, maxTxsPerBlock=1.
describe('e2e_reload_keystore', () => {
  jest.setTimeout(540_000);

  let teardown: () => Promise<void>;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let cheatCodes: CheatCodes;
  let wallet: Wallet;
  let ownerAddress: AztecAddress;
  let keyStoreDirectory: string;
  let sequencerClient: SequencerClient | undefined;

  const validatorKeys: EthPrivateKey[] = [];
  const validatorAddresses: string[] = [];
  let publisherKey: EthPrivateKey;

  const initialCoinbase = EthAddress.fromNumber(42);
  const initialFeeRecipient = AztecAddress.fromNumberUnsafe(42);

  const artifact = StatefulTestContractArtifact;

  beforeAll(async () => {
    // Derive keys from the test mnemonic (these accounts are funded in Anvil)
    for (const idx of VALIDATOR_KEY_INDICES) {
      const key = `0x${getPrivateKeyFromIndex(idx)!.toString('hex')}` as EthPrivateKey;
      validatorKeys.push(key);
      validatorAddresses.push(privateKeyToAccount(key).address);
    }
    publisherKey = `0x${getPrivateKeyFromIndex(PUBLISHER_KEY_INDEX)!.toString('hex')}` as EthPrivateKey;

    // Create temp directory for keystore files
    keyStoreDirectory = await mkdtemp(join(tmpdir(), 'reload-keystore-'));

    // Write initial keystore: first 3 validators only (validator 4 is deliberately excluded).
    // All share the same coinbase X so we can detect a change after reload.
    const initialKeystore = {
      schemaVersion: 1,
      validators: validatorKeys.slice(0, INITIAL_KEYSTORE_COUNT).map(key => ({
        attester: key,
        coinbase: initialCoinbase.toChecksumString(),
        publisher: [publisherKey],
        feeRecipient: initialFeeRecipient.toString(),
      })),
    };
    await writeFile(join(keyStoreDirectory, 'keystore.json'), JSON.stringify(initialKeystore, null, 2));

    // Stake ALL 4 validators on L1 so they are part of the committee
    const initialValidators = validatorKeys.map((key, i) => ({
      attester: EthAddress.fromString(validatorAddresses[i]),
      withdrawer: EthAddress.fromString(validatorAddresses[i]),
      privateKey: key,
      bn254SecretKey: new SecretValue(new Fr(i + 1).toBigInt()),
    }));

    ({
      teardown,
      aztecNode,
      aztecNodeAdmin,
      cheatCodes,
      wallet,
      accounts: [ownerAddress],
      sequencer: sequencerClient,
    } = await setup(1, {
      ...PIPELINING_SETUP_OPTS,
      initialValidators,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      keyStoreDirectory,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
    }));

    if (!aztecNodeAdmin) {
      throw new Error('Aztec node admin API must be available for this test');
    }
  });

  afterAll(async () => {
    await teardown?.();
    await rm(keyStoreDirectory, { recursive: true, force: true });
  });

  // Verifies that after writing an updated keystore file and calling reloadKeystore(), the validator
  // client exposes all 4 validators with new coinbases, and blocks subsequently mined carry one of
  // the new per-validator coinbases rather than the old shared one.
  it('should reload keystore, add a new validator, and use updated coinbase in blocks', async () => {
    // Access the sequencer's validator client to inspect keystore state
    const sequencer = (sequencerClient! as TestSequencerClient).getSequencer() as TestSequencer;
    const validatorClient: ValidatorClient = sequencer.validatorClient;

    // Verify initial keystore state and block production
    // Only the first 3 validators should be loaded
    const initialAddrs = validatorClient.getValidatorAddresses();
    expect(initialAddrs).toHaveLength(INITIAL_KEYSTORE_COUNT);
    for (let i = 0; i < INITIAL_KEYSTORE_COUNT; i++) {
      const attestor = EthAddress.fromString(validatorAddresses[i]);
      expect(validatorClient.getCoinbaseForAttestor(attestor)).toEqual(initialCoinbase);
      expect(validatorClient.getFeeRecipientForAttestor(attestor)).toEqual(initialFeeRecipient);
    }

    // Validator 4 should NOT be in the keystore yet
    const addr4Lower = validatorAddresses[3].toLowerCase();
    expect(initialAddrs.map(a => a.toString().toLowerCase())).not.toContain(addr4Lower);

    // Send a tx and verify the block uses the initial coinbase
    const deployer = new ContractDeployer(artifact, wallet);
    const { txHash: sentTx1 } = await deployer
      .deploy([ownerAddress, 1], { salt: new Fr(1) })
      .send({ from: ownerAddress, wait: NO_WAIT });
    const receipt1 = await waitForTx(aztecNode, sentTx1);

    const block1 = await aztecNode.getBlock(BlockNumber(receipt1.blockNumber!));
    expect(block1).toBeDefined();
    expect(block1!.header.globalVariables.coinbase.toString().toLowerCase()).toEqual(
      initialCoinbase.toString().toLowerCase(),
    );

    // Write updated keystore and reload
    // Each validator gets its own new coinbase so we can verify per-validator updates.
    const newCoinbases = VALIDATOR_KEY_INDICES.map((_, i) => EthAddress.fromNumber(100 + i));
    const newFeeRecipients = VALIDATOR_KEY_INDICES.map((_, i) => AztecAddress.fromNumberUnsafe(100 + i));

    // Build updated keystore: all 4 validators (including the previously-excluded validator 4)
    const updatedKeystore = {
      schemaVersion: 1,
      validators: validatorKeys.map((key, i) => ({
        attester: key,
        coinbase: newCoinbases[i].toChecksumString(),
        publisher: [publisherKey],
        feeRecipient: newFeeRecipients[i].toString(),
      })),
    };
    await writeFile(join(keyStoreDirectory, 'keystore.json'), JSON.stringify(updatedKeystore, null, 2));

    // Reload keystore via the admin API
    await aztecNodeAdmin!.reloadKeystore();

    // Verify the reload took effect
    // All 4 validators should now be loaded
    const updatedAddrs = validatorClient.getValidatorAddresses();
    expect(updatedAddrs).toHaveLength(VALIDATOR_COUNT);

    for (let i = 0; i < VALIDATOR_COUNT; i++) {
      const attestor = EthAddress.fromString(validatorAddresses[i]);
      expect(validatorClient.getCoinbaseForAttestor(attestor)).toEqual(newCoinbases[i]);
      expect(validatorClient.getFeeRecipientForAttestor(attestor)).toEqual(newFeeRecipients[i]);
    }

    // Specifically confirm validator 4 is now present
    expect(updatedAddrs.map(a => a.toString().toLowerCase())).toContain(addr4Lower);

    // Deterministically prove validator 4 CAN publish blocks
    // Directly ask the publisher factory to create a publisher for validator 4.
    // This exercises the full chain: keystore lookup → publisher filter → L1 signer match.
    // If the publisher key weren't in the L1TxUtils pool, this would throw.
    const publisherFactory = sequencer.publisherFactory;
    const validator4Attestor = EthAddress.fromString(validatorAddresses[3]);
    const { attestorAddress: returnedAttestor, publisher: validator4Publisher } =
      await publisherFactory.create(validator4Attestor);

    expect(returnedAttestor.equals(validator4Attestor)).toBe(true);
    expect(validator4Publisher).toBeDefined();
    expect(validator4Publisher.getSenderAddress()).toBeDefined();

    // Verify block production uses new coinbases (not old)
    // Send a tx and confirm the block uses one of the new per-validator coinbases.
    // Whichever validator is the proposer, its coinbase must be from the reloaded keystore.
    // A checkpoint job may already be waiting for txs with the old coinbase, so let it expire before sending.
    await waitForSequencerIdleAfter(sequencer, () => cheatCodes.rollup.advanceToNextSlot());

    const allNewCoinbasesLower = newCoinbases.map(c => c.toString().toLowerCase());

    const { txHash: sentTx2 } = await deployer
      .deploy([ownerAddress, 2], { salt: new Fr(2) })
      .send({ from: ownerAddress, wait: NO_WAIT });
    const receipt2 = await waitForTx(aztecNode, sentTx2);

    const block2 = await aztecNode.getBlock(BlockNumber(receipt2.blockNumber!));
    expect(block2).toBeDefined();

    const actualCoinbase = block2!.header.globalVariables.coinbase.toString().toLowerCase();
    expect(allNewCoinbasesLower).toContain(actualCoinbase);
    expect(actualCoinbase).not.toEqual(initialCoinbase.toString().toLowerCase());
  });
});
