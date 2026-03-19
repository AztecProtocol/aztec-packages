import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { ContractDeployer } from '@aztec/aztec.js/deployment';
import { Fr } from '@aztec/aztec.js/fields';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import type { EthPrivateKey } from '@aztec/node-keystore';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencer, TestSequencerClient } from '@aztec/sequencer-client/test';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import type { ValidatorClient } from '@aztec/validator-client';

import { jest } from '@jest/globals';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';

const VALIDATOR_KEY_INDICES = [0, 2, 4, 5];
const PUBLISHER_KEY_INDEX = 3;

// 4 validators staked on L1, committee size 4.
// All 4 are in the initial keystore so the sequencer can always propose regardless of proposer selection.
// After reload, a 5th non-staked validator is added to test dynamic keystore expansion.
const VALIDATOR_COUNT = 4;
const COMMITTEE_SIZE = VALIDATOR_COUNT;

describe('e2e_reload_keystore', () => {
  jest.setTimeout(540_000);

  let teardown: () => Promise<void>;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin | undefined;
  let wallet: Wallet;
  let ownerAddress: AztecAddress;
  let keyStoreDirectory: string;
  let sequencerClient: SequencerClient | undefined;

  const validatorKeys: EthPrivateKey[] = [];
  const validatorAddresses: string[] = [];
  let publisherKey: EthPrivateKey;

  // A 5th validator key that is NOT staked on L1 — used to test adding a new validator via reload.
  let phantomValidatorKey: EthPrivateKey;
  let phantomValidatorAddress: string;

  const initialCoinbase = EthAddress.fromNumber(42);
  const initialFeeRecipient = AztecAddress.fromNumber(42);

  const artifact = StatefulTestContractArtifact;

  beforeAll(async () => {
    // Derive keys from the test mnemonic (these accounts are funded in Anvil)
    for (const idx of VALIDATOR_KEY_INDICES) {
      const key = `0x${getPrivateKeyFromIndex(idx)!.toString('hex')}` as EthPrivateKey;
      validatorKeys.push(key);
      validatorAddresses.push(privateKeyToAccount(key).address);
    }
    publisherKey = `0x${getPrivateKeyFromIndex(PUBLISHER_KEY_INDEX)!.toString('hex')}` as EthPrivateKey;

    // Generate a phantom validator key (not staked on L1, but will be added to keystore on reload)
    phantomValidatorKey = generatePrivateKey() as EthPrivateKey;
    phantomValidatorAddress = privateKeyToAccount(phantomValidatorKey).address;

    // Create temp directory for keystore files
    keyStoreDirectory = await mkdtemp(join(tmpdir(), 'reload-keystore-'));

    // Write initial keystore: ALL 4 staked validators.
    // All share the same coinbase so we can detect a change after reload.
    const initialKeystore = {
      schemaVersion: 1,
      validators: validatorKeys.map(key => ({
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
      wallet,
      accounts: [ownerAddress],
      sequencer: sequencerClient,
    } = await setup(1, {
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

  it('should reload keystore, add a new validator, and use updated coinbase in blocks', async () => {
    // Access the sequencer's validator client to inspect keystore state
    const sequencer = (sequencerClient! as TestSequencerClient).getSequencer();
    const validatorClient: ValidatorClient = (sequencer as TestSequencer).validatorClient;

    // Verify initial keystore state: all 4 staked validators loaded with initial coinbase
    const initialAddrs = validatorClient.getValidatorAddresses();
    expect(initialAddrs).toHaveLength(VALIDATOR_COUNT);
    for (let i = 0; i < VALIDATOR_COUNT; i++) {
      const attestor = EthAddress.fromString(validatorAddresses[i]);
      expect(validatorClient.getCoinbaseForAttestor(attestor)).toEqual(initialCoinbase);
      expect(validatorClient.getFeeRecipientForAttestor(attestor)).toEqual(initialFeeRecipient);
    }

    // Phantom validator should NOT be in the keystore yet
    const phantomAddrLower = phantomValidatorAddress.toLowerCase();
    expect(initialAddrs.map(a => a.toString().toLowerCase())).not.toContain(phantomAddrLower);

    // Send a tx and verify the block uses the initial coinbase
    const deployer = new ContractDeployer(artifact, wallet);
    const { txHash: sentTx1 } = await deployer.deploy(ownerAddress, ownerAddress, 1).send({
      from: ownerAddress,
      contractAddressSalt: new Fr(1),
      wait: NO_WAIT,
    });
    const receipt1 = await waitForTx(aztecNode, sentTx1);

    const block1 = await aztecNode.getBlock(BlockNumber(receipt1.blockNumber!));
    expect(block1).toBeDefined();
    expect(block1!.header.globalVariables.coinbase.toString().toLowerCase()).toEqual(
      initialCoinbase.toString().toLowerCase(),
    );

    // Write updated keystore and reload
    // Each staked validator gets its own new coinbase so we can verify per-validator updates.
    // The phantom validator is added with its own coinbase.
    const newCoinbases = VALIDATOR_KEY_INDICES.map((_, i) => EthAddress.fromNumber(100 + i));
    const newFeeRecipients = VALIDATOR_KEY_INDICES.map((_, i) => AztecAddress.fromNumber(100 + i));
    const phantomCoinbase = EthAddress.fromNumber(200);
    const phantomFeeRecipient = AztecAddress.fromNumber(200);

    // Build updated keystore: all 4 staked validators + the phantom validator
    const updatedKeystore = {
      schemaVersion: 1,
      validators: [
        ...validatorKeys.map((key, i) => ({
          attester: key,
          coinbase: newCoinbases[i].toChecksumString(),
          publisher: [publisherKey],
          feeRecipient: newFeeRecipients[i].toString(),
        })),
        {
          attester: phantomValidatorKey,
          coinbase: phantomCoinbase.toChecksumString(),
          publisher: [publisherKey],
          feeRecipient: phantomFeeRecipient.toString(),
        },
      ],
    };
    await writeFile(join(keyStoreDirectory, 'keystore.json'), JSON.stringify(updatedKeystore, null, 2));

    // Reload keystore via the admin API
    await aztecNodeAdmin!.reloadKeystore();

    // Verify the reload took effect
    // All 4 staked validators + the phantom validator should now be loaded
    const updatedAddrs = validatorClient.getValidatorAddresses();
    expect(updatedAddrs).toHaveLength(VALIDATOR_COUNT + 1);

    for (let i = 0; i < VALIDATOR_COUNT; i++) {
      const attestor = EthAddress.fromString(validatorAddresses[i]);
      expect(validatorClient.getCoinbaseForAttestor(attestor)).toEqual(newCoinbases[i]);
      expect(validatorClient.getFeeRecipientForAttestor(attestor)).toEqual(newFeeRecipients[i]);
    }

    // Specifically confirm the phantom validator is now present with correct config
    expect(updatedAddrs.map(a => a.toString().toLowerCase())).toContain(phantomAddrLower);
    const phantomAttestor = EthAddress.fromString(phantomValidatorAddress);
    expect(validatorClient.getCoinbaseForAttestor(phantomAttestor)).toEqual(phantomCoinbase);
    expect(validatorClient.getFeeRecipientForAttestor(phantomAttestor)).toEqual(phantomFeeRecipient);

    // Deterministically prove the phantom validator CAN publish blocks.
    // Directly ask the publisher factory to create a publisher for the phantom validator.
    // This exercises the full chain: keystore lookup → publisher filter → L1 signer match.
    // If the publisher key weren't in the L1TxUtils pool, this would throw.
    const publisherFactory = (sequencer as TestSequencer).publisherFactory;
    const { attestorAddress: returnedAttestor, publisher: phantomPublisher } =
      await publisherFactory.create(phantomAttestor);

    expect(returnedAttestor.equals(phantomAttestor)).toBe(true);
    expect(phantomPublisher).toBeDefined();
    expect(phantomPublisher.getSenderAddress()).toBeDefined();

    // Verify block production uses new coinbases (not old)
    // Send a tx and confirm the block uses one of the new per-validator coinbases.
    // Whichever staked validator is the proposer, its coinbase must be from the reloaded keystore.
    const allNewCoinbasesLower = newCoinbases.map(c => c.toString().toLowerCase());

    const { txHash: sentTx2 } = await deployer.deploy(ownerAddress, ownerAddress, 2).send({
      from: ownerAddress,
      contractAddressSalt: new Fr(2),
      wait: NO_WAIT,
    });
    const receipt2 = await waitForTx(aztecNode, sentTx2);

    const block2 = await aztecNode.getBlock(BlockNumber(receipt2.blockNumber!));
    expect(block2).toBeDefined();

    const actualCoinbase = block2!.header.globalVariables.coinbase.toString().toLowerCase();
    expect(allNewCoinbasesLower).toContain(actualCoinbase);
    expect(actualCoinbase).not.toEqual(initialCoinbase.toString().toLowerCase());
  });
});
