import { AztecAddress, EthAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { waitForTx } from '@aztec/aztec.js/node';
import { EthCheatCodes } from '@aztec/aztec/testing';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { PublisherManager } from '@aztec/ethereum/publisher-manager';
import type { ViemClient } from '@aztec/ethereum/types';
import { times } from '@aztec/foundation/collection';
import { SecretValue } from '@aztec/foundation/config';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import 'jest-extended';
import { type Hex, type TransactionSerialized, recoverTransactionAddress } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import { MNEMONIC, PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import type { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

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

// Covers the multi-EOA publisher rotation mechanism in the production sequencer. Uses
// PIPELINING_SETUP_OPTS (prod seq, ethereumSlotDuration=4s, aztecSlotDuration=12s, minTxsPerBlock=0)
// with NUM_PUBLISHERS=4 sequencer publisher keys. Tests that when one publisher's L1 tx is
// intercepted (never lands on chain), the sequencer rotates to a different publisher. (v5: the test no
// longer sorts publishers by balance or pins which one is used; it blocks the first publisher attempted
// and asserts a different one takes over. Initializerless accounts deploy nothing at setup, so the
// beforeAll sends a couple of txs to get blocks published across rotated publishers first.)
describe('e2e_multi_eoa', () => {
  jest.setTimeout(5 * 60 * 1000); // 5 minutes

  let aztecNode: AztecNode;
  let logger: Logger;
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNodeAdmin: AztecNodeAdmin;
  let sequencer: TestSequencerClient;
  let publisherManager: PublisherManager;
  let ethCheatCodes: EthCheatCodes;
  let sequencerKeysAndAddresses: { key: SecretValue<`0x${string}`>; address: Hex }[];
  let teardown: () => Promise<void>;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Exercises publisher rotation: mocks sendRawTransaction to block transactions from the first
  // publisher attempted, then verifies a different fallback publisher takes over and the L2 tx is mined.
  describe('multi-txs block', () => {
    beforeAll(async () => {
      let sequencerClient: SequencerClient | undefined;
      let maybeAztecNodeAdmin: AztecNodeAdmin | undefined;
      const allKeysAndAddresses = createPublisherKeysAndAddresses();
      sequencerKeysAndAddresses = allKeysAndAddresses.slice(1);

      ({
        teardown,
        aztecNode,
        logger,
        aztecNodeAdmin: maybeAztecNodeAdmin,
        wallet,
        accounts: [defaultAccountAddress],
        sequencer: sequencerClient,
        ethCheatCodes,
      } = await setup(
        2,
        {
          ...PIPELINING_SETUP_OPTS,
          archiverPollingIntervalMS: 200,
          sequencerPollingIntervalMS: 200,
          worldStateBlockCheckIntervalMS: 200,
          blockCheckIntervalMS: 200,
          sequencerPublisherPrivateKeys: sequencerKeysAndAddresses.map(k => k.key),
          l1PublisherKey: allKeysAndAddresses[0].key,
          maxSpeedUpAttempts: 0, // Disable speed ups, so that cancellation txs never make it through
        },
        // Anchor PXE to the checkpointed chain so that a missed-publish from publisher #1 in slot N
        // (which invalidates the pipelined proposed chain) doesn't drop the wallet's in-flight tx
        // when slot N+1's job rotates to publisher #2.
        { syncChainTip: 'checkpointed' },
      ));
      sequencer = sequencerClient! as TestSequencerClient;
      publisherManager = sequencer.publisherManager;
      aztecNodeAdmin = maybeAztecNodeAdmin!;

      // Initializerless accounts deploy nothing during setup, so the chain sits at the single empty
      // genesis block (one publisher used). Send a couple of txs from the default account so the
      // sequencer publishes more blocks across rotated publishers.
      for (let i = 0; i < 2; i++) {
        await StatefulTestContract.deploy(wallet, defaultAccountAddress, 0, {
          salt: Fr.random(),
          deployer: defaultAccountAddress,
        }).send({ from: defaultAccountAddress });
      }
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
    const testAccountRotation = async () => {
      // the L2 tx we are going to try and execute
      const deployMethod = StatefulTestContract.deploy(wallet, defaultAccountAddress, 0, {
        salt: Fr.random(),
        deployer: defaultAccountAddress,
      });
      const deployMethodTx = await proveInteraction(wallet, deployMethod, { from: defaultAccountAddress });

      const l1Utils: L1TxUtils[] = (publisherManager as any).publishers;

      let blockedSender: EthAddress | undefined;
      const blockedTxs: Hex[] = [];
      const fallbackTxs: { sender: EthAddress; txHash: Hex }[] = [];

      logger.warn('Testing account rotation by blocking the first publisher attempted');

      // Get unique clients - they may or may not be the same object
      const uniqueClients = [...new Set(l1Utils.map(u => u.client))];
      const originalSendRawTransactions = new Map(uniqueClients.map(client => [client, client.sendRawTransaction]));

      const mockSendRawTransaction = async function (this: ViemClient, arg: { serializedTransaction: `0x${string}` }) {
        const signerAddress = EthAddress.fromString(
          await recoverTransactionAddress({
            serializedTransaction: arg.serializedTransaction as TransactionSerialized<'eip1559' | 'eip4844'>,
          }),
        );

        blockedSender ??= signerAddress;
        if (blockedSender.equals(signerAddress)) {
          const txHash = randomEthTxHash(); // block this sender/ Its txs don't actually reach any L1 nodes
          blockedTxs.push(txHash);
          logger.warn(`Blocking tx from sender ${signerAddress.toString()} with hash ${txHash}`);
          return txHash;
        } else {
          const originalFn = originalSendRawTransactions.get(this)!;
          const txHash = await originalFn.call(this, arg);
          logger.warn(`Found fallback tx from signer ${signerAddress.toString()} with hash ${txHash}`);
          fallbackTxs.push({ sender: signerAddress, txHash });
          return txHash;
        }
      };

      // Spy on all unique clients to ensure we intercept all sendRawTransaction calls
      const spies = uniqueClients.map(client =>
        jest.spyOn(client, 'sendRawTransaction').mockImplementation(mockSendRawTransaction),
      );

      const txHash = await deployMethodTx.send({ wait: NO_WAIT });
      logger.warn(`L2 deploy tx sent with hash ${txHash.toString()}`);

      const receipt = await waitForTx(aztecNode, txHash);
      expect(receipt.isMined() && receipt.hasExecutionSucceeded()).toBe(true);

      expect(blockedSender).toBeDefined();
      logger.warn(`Got ${blockedTxs.length} blocked txs for ${blockedSender}`);
      expect(blockedTxs.length).toBeGreaterThan(0);

      logger.warn(`Got ${fallbackTxs.length} fallback txs`);
      expect(fallbackTxs.length).toBeGreaterThan(0);

      const fallbackTx = fallbackTxs.at(-1)!;
      expect(fallbackTx.sender.equals(blockedSender!)).toBeFalse();
      const l1Tx = await ethCheatCodes.publicClient.getTransaction({
        hash: fallbackTx.txHash,
      });
      const senderEthAddress = EthAddress.fromString(l1Tx.from);
      expect(senderEthAddress.equals(fallbackTx.sender)).toBeTrue();

      // Dispose of all spies
      spies.forEach(spy => spy.mockRestore());
    };

    // Identifies the two highest-balance publisher accounts from L1 balances, calls
    // testAccountRotation twice (simulating a first sender being blocked and a second rotation),
    // and asserts that the fallback sender actually submitted the mined L1 block tx.
    it('publishers are rotated by the sequencer', async () => {
      // We should be at L2 block 2 or later (empty pipelined checkpoints can land between setup
      // and the first assertion, so accept >=2 rather than pinning to exactly 2).
      const blockNumber = await aztecNode.getBlockNumber();
      expect(blockNumber).toBeGreaterThanOrEqual(2);

      await testAccountRotation();
      await testAccountRotation();
    });
  });
});

function randomEthTxHash(): Hex {
  return `0x${randomBytes(32).toString('hex')}`;
}
