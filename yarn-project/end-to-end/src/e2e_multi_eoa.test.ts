import { ContractDeployer, EthAddress, Fr, type Logger, TxStatus, type Wallet } from '@aztec/aztec.js';
import { EthCheatCodes } from '@aztec/aztec/testing';
import type { GasPrice, L1BlobInputs, L1GasConfig, L1TxRequest, PublisherManager, TxUtilsState } from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import type { AztecNodeAdmin, PXE } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import 'jest-extended';
import type { Hex } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const NUM_PUBLISHERS = 4;

// In this test, we set the publisher keys to be the first NUM_PUBLISHER keys starting at index 1
// We use index 0 for publishing L1 contracts
const createPublisherKeysAndAddresses = () => {
  return times(NUM_PUBLISHERS + 1, i => {
    const account = mnemonicToAccount(MNEMONIC, { addressIndex: i });
    const key = account.getHdKey().privateKey;
    const publisherPrivKey = key === null ? null : Buffer.from(key);
    if (publisherPrivKey === null) {
      throw new Error('Failed to create private key');
    }
    return { key: new SecretValue(`0x${publisherPrivKey!.toString('hex')}` as const), address: account.address as Hex };
  });
};

describe('e2e_multi_eoa', () => {
  jest.setTimeout(5 * 60 * 1000); // 5 minutes

  let pxe: PXE;
  let logger: Logger;
  let owner: Wallet;
  let aztecNodeAdmin: AztecNodeAdmin;
  let sequencer: TestSequencerClient;
  let publisherManager: PublisherManager;
  let ethCheatCodes: EthCheatCodes;
  let sequencerKeysAndAddresses: { key: SecretValue<`0x${string}`>; address: Hex }[];
  let teardown: () => Promise<void>;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('multi-txs block', () => {
    const artifact = StatefulTestContractArtifact;

    beforeAll(async () => {
      let sequencerClient: SequencerClient | undefined;
      let maybeAztecNodeAdmin: AztecNodeAdmin | undefined;
      const allKeysAndAddresses = createPublisherKeysAndAddresses();
      sequencerKeysAndAddresses = allKeysAndAddresses.slice(1);

      ({
        teardown,
        pxe,
        logger,
        aztecNodeAdmin: maybeAztecNodeAdmin,
        wallets: [owner],
        sequencer: sequencerClient,
        ethCheatCodes,
      } = await setup(2, {
        archiverPollingIntervalMS: 200,
        transactionPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
        publisherPrivateKeys: sequencerKeysAndAddresses.map(k => k.key),
        l1PublisherKey: allKeysAndAddresses[0].key,
      }));
      sequencer = sequencerClient! as TestSequencerClient;
      publisherManager = sequencer.publisherManager;
      aztecNodeAdmin = maybeAztecNodeAdmin!;
    });

    beforeEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    });

    afterEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
      // Clean up any mocks
      jest.restoreAllMocks();
    });

    afterAll(() => teardown());

    const disableMining = async () => {
      await ethCheatCodes.setAutomine(false);
      await ethCheatCodes.setIntervalMining(0);
      logger.info('Disabled Mining');
    };

    // Helper to re-enable Anvil mining
    const enableMining = async () => {
      await ethCheatCodes.setAutomine(true);
      await ethCheatCodes.evmMine();
      logger.info('Enabled Mining');
    };

    // This executes a test of publisher account rotation.
    // We try and publish a block with the expected publisher account.
    // We intercept the transaction and delete it from Anvil.
    // We also do the same for any cancel transactions.
    // We should then see that another block is published but this time with a different expected account
    const testAccountRotation = async (expectedFirstSender: number, expectedSecondSender: number) => {
      // the L2 tx we are going to try and execute
      const deployer = new ContractDeployer(artifact, owner);
      const ownerAddress = owner.getCompleteAddress().address;
      const deployMethodTx = await deployer.deploy(ownerAddress, 0).prove({
        from: ownerAddress,
        contractAddressSalt: Fr.random(),
        skipClassPublication: true,
        skipInstancePublication: true,
      });

      const l1Utils: L1TxUtilsWithBlobs[] = (publisherManager as any).publishers;

      // Intercept the required transactions
      let transactionHashToDrop: Hex | undefined;
      let transactionHashToKeep: Hex | undefined;
      let cancelTransactionHashToDrop: Hex | undefined;

      const originalSendFunctions = l1Utils.map(l1Util => l1Util.sendTransaction.bind(l1Util));
      const originalCancelFunctions = l1Utils.map(l1Util => l1Util.attemptTxCancellation.bind(l1Util));

      // For the expected 'first' publisher, swap out the send function with one that gets the tx hash and drops it in anvil
      const sendTxThatWeWillDrop = async (
        request: L1TxRequest,
        _gasConfig?: L1GasConfig,
        blobInputs?: L1BlobInputs,
        stateChange?: TxUtilsState,
      ) => {
        await disableMining();
        const received = await originalSendFunctions[expectedFirstSender](request, _gasConfig, blobInputs, stateChange);
        transactionHashToDrop = received.txHash;
        logger.info(`Dropping tx: ${transactionHashToDrop} from Anvil`);
        await ethCheatCodes.dropTransaction(transactionHashToDrop);

        try {
          await ethCheatCodes.publicClient.getTransaction({
            hash: transactionHashToDrop!,
          });
          logger.error(`Failed to drop transaction ${transactionHashToDrop} from Anvil!!`);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
          // Should always get here
        }

        await enableMining();
        return received;
      };
      l1Utils[expectedFirstSender].sendTransaction = jest.fn(sendTxThatWeWillDrop);

      // Also for the expected 'first' sender, drop any cancellations that may be sent
      const sendCancelTxThatWeWillDrop = async (
        currentTxHash: Hex,
        nonce: number,
        isBlobTx: boolean,
        previousGasPrice?: GasPrice,
        attempts?: number,
      ) => {
        await disableMining();
        const received = await originalCancelFunctions[expectedFirstSender](
          currentTxHash,
          nonce,
          isBlobTx,
          previousGasPrice,
          attempts,
        );
        cancelTransactionHashToDrop = received;
        logger.info(`Dropping cancel tx: ${cancelTransactionHashToDrop} from Anvil`);
        await ethCheatCodes.dropTransaction(cancelTransactionHashToDrop);

        try {
          await ethCheatCodes.publicClient.getTransaction({
            hash: transactionHashToDrop!,
          });
          logger.error(`Failed to drop transaction ${cancelTransactionHashToDrop} from Anvil!!`);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_) {
          // Should always get here
        }

        await enableMining();
        return received;
      };
      l1Utils[expectedFirstSender].attemptTxCancellation = jest.fn(sendCancelTxThatWeWillDrop);

      // The 'second' sender should send the next block, we want this to succeed and we will verify against L1 later that
      // the expected publisher was used
      const sendTxSuccessfully = async (
        request: L1TxRequest,
        _gasConfig?: L1GasConfig,
        blobInputs?: L1BlobInputs,
        stateChange?: TxUtilsState,
      ) => {
        const received = await originalSendFunctions[expectedSecondSender](
          request,
          _gasConfig,
          blobInputs,
          stateChange,
        );
        transactionHashToKeep = received.txHash;
        logger.info(`Tx that we expect to mine: ${transactionHashToKeep}`);
        return received;
      };
      l1Utils[expectedSecondSender].sendTransaction = jest.fn(sendTxSuccessfully);

      const tx = deployMethodTx.send();
      logger.info(`L2 Tx sent with hash: ${(await tx.getTxHash()).toString()} `);

      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.SUCCESS);

      logger.info(`Checking sender of transaction with hash ${transactionHashToKeep}`);

      const l1Tx = await ethCheatCodes.publicClient.getTransaction({
        hash: transactionHashToKeep!,
      });
      const senderEthAddress = EthAddress.fromString(l1Tx.from);
      const expectedSenderEthAddress = EthAddress.fromString(sequencerKeysAndAddresses[expectedSecondSender].address);
      const areSame = senderEthAddress.equals(expectedSenderEthAddress);
      expect(areSame).toBeTrue();

      // Re-instate all modified functions
      for (let i = 0; i < l1Utils.length; i++) {
        l1Utils[i].sendTransaction = originalSendFunctions[i];
        l1Utils[i].attemptTxCancellation = originalCancelFunctions[i];
      }

      // Ensure mining is switched on
      await enableMining();
    };

    it('publishers are rotated by the sequencer', async () => {
      // Helpers to identify which accounts are expected to be used
      const getSortedAddressesByBalance = async (addressAndKeys: { address: `0x${string}` }[]) => {
        const addressesWithBalance = await Promise.all(
          addressAndKeys.map(async ka => {
            return {
              balance: await ethCheatCodes.publicClient.getBalance({ address: ka.address }),
              address: ka.address,
            };
          }),
        );

        const sortedAddresses = addressesWithBalance.sort((a, b) => Number(b.balance - a.balance));
        return sortedAddresses;
      };

      const getAddressIndex = (address: `0x${string}`) => {
        return sequencerKeysAndAddresses.findIndex(ka => ka.address === address);
      };

      // We should be at L2 block 2
      const blockNumber = await pxe.getBlockNumber();
      expect(blockNumber).toBe(2);

      // This means that 2 of our accounts have been used to send blocks to L1.
      // We want to figure out which ones these are, they will be in the 'MINED' state within the sequencer
      const sortedAddresses = await getSortedAddressesByBalance(sequencerKeysAndAddresses);

      // We expect the highest balance account to be used first, then the second highest balance account
      await testAccountRotation(
        getAddressIndex(sortedAddresses[0].address),
        getAddressIndex(sortedAddresses[1].address),
      );

      // The first sender used above will now be out of action as it is unable to get anything MINED.
      const validAddresses = sortedAddresses.slice(1);
      const sortedValidAddresses = await getSortedAddressesByBalance(validAddresses);

      // All of our valid addresses have published transactions so will be in MINED state
      // the sequencer should select the 2 highest balance accounts in this next test
      await testAccountRotation(
        getAddressIndex(sortedValidAddresses[0].address),
        getAddressIndex(sortedValidAddresses[1].address),
      );
    });
  });
});
