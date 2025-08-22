import type { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, ContractDeployer, EthAddress, Fr, type Wallet, retryUntil } from '@aztec/aztec.js';
import {
  type DeployL1ContractsReturnType,
  RollupContract,
  createExtendedL1Client,
  getAddressFromPrivateKey,
  getL1ContractsConfigEnvVars,
} from '@aztec/ethereum';
import { SecretValue } from '@aztec/foundation/config';
import { type EthPrivateKey, KeystoreManager, loadKeystores, mergeKeystores } from '@aztec/node-keystore';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { NodeKeystoreAdapter } from '@aztec/validator-client';

import { mkdtemp, rmdir } from 'fs/promises';
import { createServer } from 'http';
import { tmpdir } from 'os';
import { join } from 'path';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC } from '../fixtures/fixtures.js';
import { getPrivateKeyFromIndex, setup } from '../fixtures/utils.js';
import {
  type KeyAndWallet,
  addressForPrivateKey,
  createJSONRPCSigner,
  createKeyFile1,
  createKeyFile2,
  createKeyFile3,
  createKeyFile4,
  createKeyFile5,
} from './utils.js';

// Import KZG from viem

const VALIDATOR_COUNT = 5;
const COMMITTEE_SIZE = VALIDATOR_COUNT;
const PUBLISHER_COUNT = 7;
const VALIDATOR_KEY_START_INDEX = 0;
const PUBLISHER_KEY_START_INDEX = VALIDATOR_COUNT + VALIDATOR_KEY_START_INDEX;
const SIGNER_URL = 'http://localhost:15000';
const PROVER_PUBLISHER_INDEX = PUBLISHER_KEY_START_INDEX + PUBLISHER_COUNT;

async function createKeyFiles() {
  const directory = await mkdtemp(join(tmpdir(), 'foo-'));
  const file1 = join(directory, 'keyfile1.json');
  const file2 = join(directory, 'keyfile2.json');
  const file3 = join(directory, 'keyfile3.json');
  const file4 = join(directory, 'keyfile4.json');
  const file5 = join(directory, 'keyfile5.json');

  const publishers = Array.from({ length: PUBLISHER_COUNT }, (_, i) => ({
    index: i + PUBLISHER_KEY_START_INDEX,
    key: `0x${getPrivateKeyFromIndex(i + PUBLISHER_KEY_START_INDEX)!.toString('hex')}` as EthPrivateKey,
  }));

  const validators = Array.from(
    { length: VALIDATOR_COUNT },
    (_, i) => `0x${getPrivateKeyFromIndex(i + VALIDATOR_KEY_START_INDEX)!.toString('hex')}` as EthPrivateKey,
  );

  const proverPrivateKey = `0x${getPrivateKeyFromIndex(PROVER_PUBLISHER_INDEX)!.toString('hex')}` as EthPrivateKey;

  const coinbaseAddresses = Array.from({ length: VALIDATOR_COUNT }, (_, i) => {
    return EthAddress.fromNumber(i + 1);
  });

  await createKeyFile1(
    file1,
    MNEMONIC,
    VALIDATOR_KEY_START_INDEX,
    publishers[0].key,
    publishers[1].key,
    coinbaseAddresses[0],
  );
  await createKeyFile2(file2, validators[1], publishers[0].key, publishers[1].key, coinbaseAddresses[1]);
  await createKeyFile3(
    file3,
    addressForPrivateKey(validators[2]),
    publishers[2].key,
    publishers[3].key,
    coinbaseAddresses[1],
    SIGNER_URL,
  );
  await createKeyFile4(
    file4,
    addressForPrivateKey(validators[3]),
    addressForPrivateKey(validators[4]),
    publishers[4].index,
    publishers[5].key,
    MNEMONIC,
    publishers[6].key,
    coinbaseAddresses[2],
    coinbaseAddresses[3],
    SIGNER_URL,
  );
  await createKeyFile5(file5, addressForPrivateKey(proverPrivateKey), SIGNER_URL);
  return directory;
}

function verifyKeyStore(directory: string) {
  const keyStores = loadKeystores(directory);
  const keyStore = mergeKeystores(keyStores);
  expect(keyStore.validators).toBeDefined();
  expect(keyStore.validators!.length).toBeGreaterThanOrEqual(VALIDATOR_COUNT);

  const keyStoreManager = new KeystoreManager(keyStore);
  const validatorAdapter = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);

  expect(validatorAdapter.getAttesterAddresses()).toHaveLength(VALIDATOR_COUNT);
}

describe('e2e_multi_validator_node', () => {
  let initialValidatorPrivateKeys: `0x${string}`[];
  let validatorAddresses: `0x${string}`[];
  let teardown: () => Promise<void>;
  let owner: Wallet;
  let ownerAddress: AztecAddress;
  let config: AztecNodeConfig;
  let deployL1ContractsValues: DeployL1ContractsReturnType;
  let rollup: RollupContract;
  let keyStoreDirectory: string;
  let jsonRpcServer: ReturnType<typeof createServer> | null = null;
  const artifact = StatefulTestContractArtifact;
  const addressToPrivateKey = new Map<string, KeyAndWallet>();

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

    keyStoreDirectory = await createKeyFiles();
    verifyKeyStore(keyStoreDirectory);

    for (let i = 0; i < VALIDATOR_COUNT + PUBLISHER_COUNT + 1; i++) {
      const pk = `0x${getPrivateKeyFromIndex(i + VALIDATOR_KEY_START_INDEX)!.toString('hex')}` as `0x${string}`;
      const account = getAddressFromPrivateKey(pk);
      const wallet = createExtendedL1Client(['http://127.0.0.1:8545'], pk, foundry);
      addressToPrivateKey.set(account.toLowerCase(), { key: pk as EthPrivateKey, wallet });
    }

    // Create JSON RPC server for signing transactions
    jsonRpcServer = createJSONRPCSigner(addressToPrivateKey);
    // Start server on port 15000 (SIGNER_URL port)
    await new Promise<void>(resolve => {
      jsonRpcServer!.listen(15000, resolve);
    });

    const { aztecSlotDuration: _aztecSlotDuration } = getL1ContractsConfigEnvVars();

    ({
      teardown,
      wallets: [owner],
      accounts: [ownerAddress],
      config,
      deployL1ContractsValues,
    } = await setup(1, {
      initialValidators,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      keyStoreDirectory,
      minTxsPerBlock: 1,
      archiverPollingIntervalMS: 200,
      transactionPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      startProverNode: true,
      maxTxsPerBlock: 1,
    }));

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

    // Close JSON RPC server
    if (jsonRpcServer) {
      await new Promise<void>(resolve => {
        jsonRpcServer!.close(() => resolve());
      });
      jsonRpcServer = null;
    }
  });

  const sendTx = async (sender: AztecAddress, contractAddressSalt: Fr) => {
    const deployer = new ContractDeployer(artifact, owner);
    const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
      from: ownerAddress,
      contractAddressSalt,
      skipClassPublication: true,
      skipInstancePublication: true,
    });
    return provenTx.send();
  };

  it('should build blocks & attest with multiple validator keys', async () => {
    const sentTransactionPromises = Array.from({ length: 10 }, (_, i) => {
      const contractAddressSalt = new Fr(i + 1);
      return sendTx(ownerAddress, contractAddressSalt);
    });

    const sentTransactions = await Promise.all(sentTransactionPromises);

    await Promise.all(sentTransactions.map(tx => tx.wait()));
  });
});
