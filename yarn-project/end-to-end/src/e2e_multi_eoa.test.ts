import { ContractDeployer, EthAddress, Fr, type Logger, TxStatus, type Wallet } from '@aztec/aztec.js';
import { EthCheatCodes } from '@aztec/aztec/testing';
import type { PublisherManager, ViemClient } from '@aztec/ethereum';
import type { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import type { AztecNodeAdmin, PXE } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import 'jest-extended';
import { type Hex, type TransactionSerialized, recoverTransactionAddress } from 'viem';
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

      const blockedSender = l1Utils[expectedFirstSender].getSenderAddress();
      const blockedTxs: Hex[] = [];
      const fallbackSender = l1Utils[expectedSecondSender].getSenderAddress();
      const fallbackTxs: Hex[] = [];

      // NOTE: we only need to spy on a single client because all l1Utils use the same ViemClient instance
      const originalSendRawTransaction = l1Utils[expectedFirstSender].client.sendRawTransaction;

      // auto-dispose of this spy at the end of this function
      using _ = jest
        .spyOn(l1Utils[expectedFirstSender].client, 'sendRawTransaction')
        .mockImplementation(async function (this: ViemClient, arg) {
          const signerAddress = EthAddress.fromString(
            await recoverTransactionAddress({
              serializedTransaction: arg.serializedTransaction as TransactionSerialized<'eip1559' | 'eip4844'>,
            }),
          );

          if (blockedSender.equals(signerAddress)) {
            const txHash = randomEthTxHash(); // block this sender/ Its txs don't actually reach any L1 nodes
            blockedTxs.push(txHash);
            return txHash;
          } else {
            const txHash = await originalSendRawTransaction.call(this, arg);
            if (fallbackSender.equals(signerAddress)) {
              fallbackTxs.push(txHash);
            }
            return txHash;
          }
        });

      const tx = deployMethodTx.send();
      logger.info(`L2 Tx sent with hash: ${(await tx.getTxHash()).toString()} `);

      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.SUCCESS);

      expect(blockedTxs.length).toBeGreaterThan(0);
      expect(fallbackTxs.length).toBeGreaterThan(0);

      const transactionHashToKeep = fallbackTxs.at(-1)!;
      const l1Tx = await ethCheatCodes.publicClient.getTransaction({
        hash: transactionHashToKeep,
      });
      const senderEthAddress = EthAddress.fromString(l1Tx.from);
      const expectedSenderEthAddress = EthAddress.fromString(sequencerKeysAndAddresses[expectedSecondSender].address);
      const areSame = senderEthAddress.equals(expectedSenderEthAddress);
      expect(areSame).toBeTrue();
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

function randomEthTxHash(): Hex {
  return `0x${randomBytes(32).toString('hex')}`;
}
