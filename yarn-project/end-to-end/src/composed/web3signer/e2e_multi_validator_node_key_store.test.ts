import type { AztecNodeConfig } from '@aztec/aztec-node';
import {
  AztecAddress,
  type AztecNode,
  ContractDeployer,
  EthAddress,
  Fr,
  type Wallet,
  retryUntil,
  waitForProven,
} from '@aztec/aztec.js';
import {
  type DeployL1ContractsReturnType,
  RollupContract,
  getAddressFromPrivateKey,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import { type EthPrivateKey, KeystoreManager, loadKeystores, mergeKeystores } from '@aztec/node-keystore';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { Sequencer, SequencerClient, SequencerPublisherFactory } from '@aztec/sequencer-client';
import type { TestSequencer, TestSequencerClient } from '@aztec/sequencer-client/test';
import type { BlockProposalOptions } from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { StateReference, Tx } from '@aztec/stdlib/tx';
import { NodeKeystoreAdapter, ValidatorClient } from '@aztec/validator-client';

import { jest } from '@jest/globals';
import { mkdtemp, rmdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { privateKeyToAccount } from 'viem/accounts';

import {
  addressForPrivateKey,
  createKeyFile1,
  createKeyFile2,
  createKeyFile3,
  createKeyFile4,
  createKeyFile5,
  createKeyFile6,
} from '../../e2e_multi_validator/utils.js';
import { MNEMONIC } from '../../fixtures/fixtures.js';
import { getPrivateKeyFromIndex, setup } from '../../fixtures/utils.js';
import {
  createWeb3SignerKeystore,
  getWeb3SignerTestKeystoreDir,
  getWeb3SignerUrl,
  refreshWeb3Signer,
} from '../../fixtures/web3signer.js';

const VALIDATOR_COUNT = 7;
const COMMITTEE_SIZE = VALIDATOR_COUNT;
const PUBLISHER_COUNT = 7;
const VALIDATOR_KEY_START_INDEX = 0;
const PUBLISHER_KEY_START_INDEX = VALIDATOR_COUNT + VALIDATOR_KEY_START_INDEX;
const PROVER_PUBLISHER_INDEX = PUBLISHER_KEY_START_INDEX + PUBLISHER_COUNT;
const BLOCK_COUNT = 20;

const publishers = Array.from({ length: PUBLISHER_COUNT }, (_, i) => ({
  index: i + PUBLISHER_KEY_START_INDEX,
  key: `0x${getPrivateKeyFromIndex(i + PUBLISHER_KEY_START_INDEX)!.toString('hex')}` as EthPrivateKey,
}));

const validators = Array.from(
  { length: VALIDATOR_COUNT },
  (_, i) => `0x${getPrivateKeyFromIndex(i + VALIDATOR_KEY_START_INDEX)!.toString('hex')}` as EthPrivateKey,
);

async function createKeyFiles() {
  const directory = await mkdtemp(join(tmpdir(), 'foo-'));
  const web3signerDir = getWeb3SignerTestKeystoreDir();
  const web3signerUrl = getWeb3SignerUrl();
  const file1 = join(directory, 'keyfile1.json');
  const file2 = join(directory, 'keyfile2.json');
  const file3 = join(directory, 'keyfile3.json');
  const file4 = join(directory, 'keyfile4.json');
  const file5 = join(directory, 'keyfile5.json');
  const file6 = join(directory, 'keyfile6.json');

  const proverPrivateKey = `0x${getPrivateKeyFromIndex(PROVER_PUBLISHER_INDEX)!.toString('hex')}` as EthPrivateKey;

  const coinbaseAddresses = Array.from({ length: VALIDATOR_COUNT }, (_, i) => {
    return EthAddress.fromNumber(i + 1);
  });

  const feeRecipientAddresses = Array.from({ length: VALIDATOR_COUNT }, (_, i) => {
    return AztecAddress.fromNumber(i + 1);
  });

  await createKeyFile1(
    file1,
    MNEMONIC,
    VALIDATOR_KEY_START_INDEX,
    publishers[0].key,
    publishers[1].key,
    coinbaseAddresses[0],
    feeRecipientAddresses[0],
  );
  await createKeyFile2(
    file2,
    validators[1],
    MNEMONIC,
    PUBLISHER_KEY_START_INDEX,
    coinbaseAddresses[1],
    feeRecipientAddresses[1],
  );
  await createKeyFile3(
    file3,
    addressForPrivateKey(validators[2]),
    publishers[2].key,
    publishers[3].key,
    coinbaseAddresses[1],
    getWeb3SignerUrl(),
    feeRecipientAddresses[2],
  );
  await createWeb3SignerKeystore(web3signerDir, validators[2]);

  await createKeyFile4(
    file4,
    addressForPrivateKey(validators[3]),
    addressForPrivateKey(validators[4]),
    publishers[4].index,
    publishers[5].key,
    MNEMONIC,
    publishers[6].key,
    coinbaseAddresses[3],
    coinbaseAddresses[4],
    web3signerUrl,
    feeRecipientAddresses[3],
    feeRecipientAddresses[4],
  );
  await createWeb3SignerKeystore(web3signerDir, validators[3], validators[4]);

  await createKeyFile5(file5, addressForPrivateKey(proverPrivateKey), web3signerUrl);
  await createWeb3SignerKeystore(web3signerDir, proverPrivateKey);

  await createKeyFile6(file6, MNEMONIC, 5, coinbaseAddresses[5], feeRecipientAddresses[5]);

  await refreshWeb3Signer(
    web3signerUrl,
    ...[proverPrivateKey, ...validators.slice(2, 5)].map(sk => addressForPrivateKey(sk).toString()),
  );

  return directory;
}

function verifyKeyStore(directory: string) {
  const keyStores = loadKeystores(directory);
  const keyStore = mergeKeystores(keyStores);
  expect(keyStore.validators).toBeDefined();

  // This is the count of validator blocks. There is one validator block consisting of multiple keys so we expect 1 less
  expect(keyStore.validators!.length).toBeGreaterThanOrEqual(VALIDATOR_COUNT - 1);

  const keyStoreManager = new KeystoreManager(keyStore);
  const validatorAdapter = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);

  expect(validatorAdapter.getAttesterAddresses()).toHaveLength(VALIDATOR_COUNT);
}

describe('e2e_multi_validator_node', () => {
  let initialValidatorPrivateKeys: `0x${string}`[];
  let validatorAddresses: `0x${string}`[];
  let teardown: () => Promise<void>;
  let wallet: Wallet;
  let ownerAddress: AztecAddress;
  let config: AztecNodeConfig;
  let deployL1ContractsValues: DeployL1ContractsReturnType;
  let rollup: RollupContract;
  let keyStoreDirectory: string;
  let aztecNode: AztecNode;
  let sequencer: Sequencer | undefined;
  let sequencerClient: SequencerClient | undefined;
  let publisherFactory: SequencerPublisherFactory;
  let validatorClient: ValidatorClient;
  const artifact = StatefulTestContractArtifact;
  const addressToPrivateKey = new Map<string, EthPrivateKey>();
  const expectedCoinbaseAddresses = new Map<string, string>();
  const expectedFeeRecipientAddresses = new Map<string, string>();
  const expectedPublishers = new Map<string, string[]>();

  beforeEach(async () => {
    initialValidatorPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i + VALIDATOR_KEY_START_INDEX)!.toString('hex')}` as `0x${string}`,
    );
    validatorAddresses = initialValidatorPrivateKeys.map(pk => {
      const account = privateKeyToAccount(pk);
      return EthAddress.fromString(account.address).toString();
    });
    const initialValidators = initialValidatorPrivateKeys.map(pk => {
      const account = privateKeyToAccount(pk);
      return {
        attester: EthAddress.fromString(account.address),
        withdrawer: EthAddress.fromString(account.address),
        privateKey: pk,
        bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
      };
    });

    // Setup expected coinbase and fee recipient values per validator
    validatorAddresses.forEach((validatorAddress, i) => {
      const coinbase = EthAddress.fromNumber(i + 1)
        .toString()
        .toLowerCase();
      expectedCoinbaseAddresses.set(validatorAddress.toLowerCase(), coinbase);
      const feeRecipient = AztecAddress.fromNumber(i + 1)
        .toString()
        .toLowerCase();
      expectedFeeRecipientAddresses.set(validatorAddress.toLowerCase(), feeRecipient);
    });

    // We need to modify the expected coinbase addresses. Some validators use the same
    expectedCoinbaseAddresses.set(
      validatorAddresses[2].toLowerCase(),
      expectedCoinbaseAddresses.get(validatorAddresses[1].toLowerCase())!,
    );
    expectedCoinbaseAddresses.set(
      validatorAddresses[6].toLowerCase(),
      expectedCoinbaseAddresses.get(validatorAddresses[5].toLowerCase())!,
    );

    // We need to do similar to fee recipients
    expectedFeeRecipientAddresses.set(
      validatorAddresses[6].toLowerCase(),
      expectedFeeRecipientAddresses.get(validatorAddresses[5].toLowerCase())!,
    );

    // Now collect the sets of expected publishers
    const publisherAddresses = publishers.map(x => getAddressFromPrivateKey(x.key));

    expectedPublishers.set(validatorAddresses[0].toLowerCase(), [
      publisherAddresses[0].toLowerCase(),
      publisherAddresses[1].toLowerCase(),
    ]);

    // Validator 2 uses the same publishers as 1
    expectedPublishers.set(validatorAddresses[1].toLowerCase(), [
      publisherAddresses[0].toLowerCase(),
      publisherAddresses[1].toLowerCase(),
    ]);

    expectedPublishers.set(validatorAddresses[2].toLowerCase(), [
      publisherAddresses[2].toLowerCase(),
      publisherAddresses[3].toLowerCase(),
    ]);

    expectedPublishers.set(validatorAddresses[3].toLowerCase(), [
      publisherAddresses[4].toLowerCase(),
      publisherAddresses[5].toLowerCase(),
    ]);

    expectedPublishers.set(validatorAddresses[4].toLowerCase(), [
      publisherAddresses[5].toLowerCase(),
      publisherAddresses[6].toLowerCase(),
    ]);

    // Validators 6 and 7 use their own and each other's addresses
    expectedPublishers.set(validatorAddresses[5].toLowerCase(), [
      validatorAddresses[5].toLowerCase(),
      validatorAddresses[6].toLowerCase(),
    ]);

    expectedPublishers.set(validatorAddresses[6].toLowerCase(), [
      validatorAddresses[5].toLowerCase(),
      validatorAddresses[6].toLowerCase(),
    ]);

    keyStoreDirectory = await createKeyFiles();
    verifyKeyStore(keyStoreDirectory);

    // Create keys and wallets for signing using our remote signer
    for (let i = 0; i < VALIDATOR_COUNT + PUBLISHER_COUNT + 1; i++) {
      const pk = `0x${getPrivateKeyFromIndex(i + VALIDATOR_KEY_START_INDEX)!.toString('hex')}` as EthPrivateKey;
      const account = getAddressFromPrivateKey(pk);
      addressToPrivateKey.set(account.toLowerCase(), pk);
    }

    const { aztecSlotDuration: _aztecSlotDuration } = getL1ContractsConfigEnvVars();

    ({
      teardown,
      wallet,
      accounts: [ownerAddress],
      config,
      deployL1ContractsValues,
      aztecNode,
      sequencer: sequencerClient,
    } = await setup(1, {
      initialValidators,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      keyStoreDirectory,
      minTxsPerBlock: 1,
      maxTxsPerBlock: 1,
      archiverPollingIntervalMS: 200,
      transactionPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      startProverNode: true,
    }));

    sequencer = (sequencerClient! as TestSequencerClient).getSequencer();
    publisherFactory = (sequencer as TestSequencer).publisherFactory;
    validatorClient = (sequencer as TestSequencer).validatorClient;

    rollup = new RollupContract(
      deployL1ContractsValues.l1Client,
      deployL1ContractsValues.l1ContractAddresses.rollupAddress.toString(),
    );

    // We jump to the next epoch such that the committee can be setup.
    await retryUntil(
      async () => {
        const view = await rollup.getAttesterView(validatorAddresses[0]);
        return view.effectiveBalance > 0;
      },
      'attester is attesting',
      config.ethereumSlotDuration * 3,
      1,
    );
  });

  afterEach(async () => {
    await teardown();
    await rmdir(keyStoreDirectory, { recursive: true });
  });

  const sendTx = async (sender: AztecAddress, contractAddressSalt: Fr) => {
    const deployer = new ContractDeployer(artifact, wallet);
    const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
      from: ownerAddress,
      contractAddressSalt,
      skipClassPublication: true,
      skipInstancePublication: true,
    });
    return provenTx.send();
  };

  it('should build blocks & attest with multiple validator keys', async () => {
    const requestedCoinbaseAddresses = new Map<string, string>();
    const requestedFeeRecipientAddresses = new Map<string, string>();

    type PublisherRequest = {
      proposer: EthAddress;
      publisher: EthAddress;
    };
    const publisherRequests: PublisherRequest[] = [];

    // We substitute 2 critical functions within the sequencer.
    // We don't modify the behavior, merely capture the arguments for assertion later.
    // The first is the request for a publisher. This tells us which publisher has been selected for the proposer.
    // The second is the request to create a block proposal, this tells us the selected values for coinbase and fee recipient.

    const originalCreate = publisherFactory.create.bind(publisherFactory);
    const createPublisher = async (proposer?: EthAddress) => {
      const received = await originalCreate(proposer);
      const request: PublisherRequest = {
        proposer: received.attestorAddress,
        publisher: received.publisher.getSenderAddress(),
      };
      publisherRequests.push(request);
      return received;
    };
    publisherFactory.create = jest.fn(createPublisher);

    const originalCreateProposal = validatorClient.createBlockProposal.bind(validatorClient);
    const createBlockProposal = (
      blockNumber: number,
      header: CheckpointHeader,
      archive: Fr,
      stateReference: StateReference,
      txs: Tx[],
      proposerAddress: EthAddress | undefined,
      options: BlockProposalOptions,
    ) => {
      if (proposerAddress) {
        requestedCoinbaseAddresses.set(
          proposerAddress.toString().toLowerCase(),
          header.coinbase.toString().toLowerCase(),
        );
        requestedFeeRecipientAddresses.set(
          proposerAddress.toString().toLowerCase(),
          header.feeRecipient.toString().toLowerCase(),
        );
      }

      return originalCreateProposal(blockNumber, header, archive, stateReference, txs, proposerAddress, options);
    };
    validatorClient.createBlockProposal = jest.fn(createBlockProposal);

    // Now we just submit some transactions to create some blocks. 1 tx per block.
    // Then we check the results captured above
    const sentTransactionPromises = Array.from({ length: BLOCK_COUNT }, (_, i) => {
      const contractAddressSalt = new Fr(i + 1);
      return sendTx(ownerAddress, contractAddressSalt);
    });

    const settledTransactions = await Promise.all(sentTransactionPromises.map(async tx => (await tx).wait()));

    await Promise.all(
      settledTransactions.map(tx => {
        return waitForProven(aztecNode, tx, {
          provenTimeout: (config.aztecProofSubmissionEpochs + 1) * config.aztecEpochDuration * config.aztecSlotDuration,
        });
      }),
    );

    for (const [proposer, coinbase] of requestedCoinbaseAddresses) {
      const expectedCoinbase = expectedCoinbaseAddresses.get(proposer);
      expect(expectedCoinbase).toBeDefined();
      expect(coinbase).toEqual(expectedCoinbase);
    }

    for (const [proposer, feeRecipient] of requestedFeeRecipientAddresses) {
      const expectedFeeRecipient = expectedFeeRecipientAddresses.get(proposer);
      expect(expectedFeeRecipient).toBeDefined();
      expect(feeRecipient).toEqual(expectedFeeRecipient);
    }

    // Now verify all of the publisher requests
    for (const publisherRequest of publisherRequests) {
      const proposer = publisherRequest.proposer.toString().toLowerCase();
      const receivedPublisher = publisherRequest.publisher.toString().toLowerCase();
      const expectedPublisher = expectedPublishers.get(proposer);
      expect(expectedPublisher).toBeDefined();
      const found = expectedPublisher!.includes(receivedPublisher);
      expect(found).toBeTrue();
    }
  });
});
