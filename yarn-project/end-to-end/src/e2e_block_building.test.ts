import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, ContractFunctionInteraction, type DeployOptions, NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { TxStatus } from '@aztec/aztec.js/tx';
import { ContractInitializationStatus } from '@aztec/aztec.js/wallet';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec/testing';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { times, unique } from '@aztec/foundation/collection';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import { getAllFunctionAbis } from '@aztec/stdlib/abi';
import { getProofSubmissionDeadlineEpoch } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import { computeSiloedPrivateLogFirstField } from '@aztec/stdlib/hash';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import 'jest-extended';

import { DUPLICATE_NULLIFIER_ERROR, PIPELINING_SETUP_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';
import { TestWallet } from './test-wallet/test_wallet.js';
import { proveInteraction } from './test-wallet/utils.js';

describe('e2e_block_building', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let logger: Logger;
  let wallet: TestWallet;

  let ownerAddress: AztecAddress;
  let minterAddress: AztecAddress;

  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let _sequencer: TestSequencerClient;
  let watcher: AnvilTestWatcher;
  let teardown: () => Promise<void>;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('multi-txs block', () => {
    beforeAll(async () => {
      let sequencerClient: SequencerClient | undefined;
      ({
        teardown,
        logger,
        aztecNode,
        aztecNodeAdmin,
        wallet,
        accounts: [ownerAddress, minterAddress],
        sequencer: sequencerClient,
      } = await setup(2, {
        defaultWaitStatus: TxStatus.CHECKPOINTED,
        ...PIPELINING_SETUP_OPTS,
        archiverPollingIntervalMS: 200,
        sequencerPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
      }));
      _sequencer = sequencerClient! as TestSequencerClient;
    });

    beforeEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    });

    afterEach(async () => {
      await aztecNodeAdmin.setConfig({
        fakeProcessingDelayPerTxMs: 0,
        minTxsPerBlock: 1,
        maxTxsPerBlock: undefined, // reset to default
        enforceTimeTable: false, // reset to false (as it is in setup())
        blockDurationMs: undefined, // reset to single-block-per-slot mode
      });
      // Clean up any mocks
      jest.restoreAllMocks();
    });

    afterAll(() => teardown());

    // Under pipelining, the proposer divides each slot into fixed sub-slots of length `blockDurationMs`.
    // Each sub-slot owns the budget for exactly one L2 block; the block builder enforces the sub-slot
    // deadline as a hard cap on tx execution. The invariant this test protects: if there are far more txs
    // than fit in one sub-slot, the proposer must cut the block off at the deadline and roll the excess
    // txs into the next sub-slot (and the next checkpoint when the slot ends). It must NOT pack everything
    // into a single block and burn the whole slot on it.
    it('processes txs until hitting timetable', async () => {
      // Fixture defaults under pipelining: aztecSlotDuration=12s, ethereumSlotDuration=4s. With
      // ethereumSlotDuration<8 the timing model uses checkpointInitializationTime=0.5s,
      // checkpointAssembleTime=0.5s, p2pPropagationTime=0, minExecutionTime=1s. Picking a 2s sub-slot
      // gives floor((12 - 0.5 - (0.5 + 2)) / 2) = 4 sub-slots per slot.
      const BLOCK_DURATION_MS = 2000;
      // Fake delay per tx, sized so ~3 txs fit in a 2s sub-slot before the builder cuts at the deadline.
      const FAKE_DELAY_PER_TX_MS = 500;
      // Send substantially more than fits in one sub-slot so the proposer must span multiple blocks.
      const TX_COUNT = 10;

      logger.info(`multi-block timetable test parameters:`, {
        blockDurationMs: BLOCK_DURATION_MS,
        fakeDelayPerTxMs: FAKE_DELAY_PER_TX_MS,
        txCount: TX_COUNT,
      });

      const { contract } = await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress });
      logger.info(`Deployed stateful test contract at ${contract.address}`);

      // Configure sequencer for multi-block-per-slot mode with a per-tx delay long enough that the
      // builder must cut blocks off at each sub-slot deadline.
      await aztecNodeAdmin.setConfig({
        fakeProcessingDelayPerTxMs: FAKE_DELAY_PER_TX_MS,
        minTxsPerBlock: 1,
        maxTxsPerBlock: TX_COUNT, // intentionally large; we want to flex the sub-slot deadline, not this cap
        enforceTimeTable: true,
        blockDurationMs: BLOCK_DURATION_MS,
      });

      // Flood the mempool with TX_COUNT simultaneous txs
      const methods = times(TX_COUNT, i => contract.methods.increment_public_value(ownerAddress, i));
      const provenTxs = await asyncMap(methods, method => proveInteraction(wallet, method, { from: ownerAddress }));
      logger.info(`Sending ${TX_COUNT} txs to the node`);
      const txHashes = await Promise.all(provenTxs.map(tx => tx.send({ wait: NO_WAIT })));
      logger.info(`All ${TX_COUNT} txs have been sent`, {
        txs: txHashes.map(h => h.toString()),
      });

      // Await txs to be mined and assert they are mined across multiple different blocks.
      const receipts = await Promise.all(txHashes.map(txHash => waitForTx(aztecNode, txHash)));
      const blockNumbers = receipts.map(r => r.blockNumber!).sort((a, b) => a - b);
      logger.info(`Txs mined on blocks: ${unique(blockNumbers)}`);
      // Spread must be at least 1 — i.e. txs are split across at least 2 distinct blocks. This fails
      // (and the test catches a regression) if the proposer reverts to single-block-per-slot behavior
      // or if sub-slot deadlines stop being enforced.
      expect(blockNumbers.at(-1)! - blockNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(unique(blockNumbers).length).toBeGreaterThanOrEqual(2);
    });

    it('assembles a block with multiple txs', async () => {
      // Assemble N contract deployment txs
      // We need to create them sequentially since we cannot have parallel calls to a circuit
      const TX_COUNT = 8;

      // Publish the contract class up front so that the N deploys below do not each include a
      // ContractClassRegistry.publish call. Without this, every parallel deploy shares the same
      // class-publication nullifier and only the first one is admitted to the mempool.
      await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress });

      await aztecNodeAdmin.setConfig({ minTxsPerBlock: TX_COUNT });

      // Need to have value > 0, so adding + 1
      // We need to do so, because noir currently will fail if the multiscalarmul is in an `if`
      // that we DO NOT enter. This should be fixed by https://github.com/noir-lang/noir/issues/5045.
      const methods = times(TX_COUNT, i =>
        StatefulTestContract.deploy(wallet, ownerAddress, i + 1, {
          salt: new Fr(BigInt(i + 1)),
          deployer: ownerAddress,
        }),
      );
      const provenTxs = [];
      const addresses = [];
      for (let i = 0; i < TX_COUNT; i++) {
        const options: DeployOptions = { from: ownerAddress, skipClassPublication: true };
        const instance = await methods[i].getInstance();
        addresses.push(instance.address);
        provenTxs.push(await proveInteraction(wallet, methods[i], options));
      }

      // Send them simultaneously to be picked up by the sequencer
      const txHashes = await Promise.all(provenTxs.map(tx => tx.send({ wait: NO_WAIT })));
      logger.info(`Txs sent with hashes: `);
      for (const hash of txHashes) {
        logger.info(` ${hash.toString()}`);
      }

      // Await txs to be mined and assert they are all mined on the same block
      const receipts = await Promise.all(txHashes.map(txHash => waitForTx(aztecNode, txHash)));
      expect(receipts.map(r => r.blockNumber)).toEqual(times(TX_COUNT, () => receipts[0].blockNumber));

      // Assert all contracts got initialized
      const areInitialized = await Promise.all(
        addresses.map(async a => (await wallet.getContractMetadata(a)).initializationStatus),
      );
      expect(areInitialized).toEqual(times(TX_COUNT, () => ContractInitializationStatus.INITIALIZED));
    });

    it('assembles a block with multiple txs with public fns', async () => {
      // First deploy the contract
      const { contract } = await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress });

      // Assemble N contract deployment txs
      // We need to create them sequentially since we cannot have parallel calls to a circuit
      const TX_COUNT = 4;
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: TX_COUNT });

      const methods = times(TX_COUNT, i => contract.methods.increment_public_value(ownerAddress, i));
      const provenTxs = [];
      for (let i = 0; i < TX_COUNT; i++) {
        provenTxs.push(await proveInteraction(wallet, methods[i], { from: ownerAddress }));
      }

      // Send them simultaneously to be picked up by the sequencer
      const txHashes = await Promise.all(provenTxs.map(tx => tx.send({ wait: NO_WAIT })));
      logger.info(`Txs sent with hashes: `);
      for (const hash of txHashes) {
        logger.info(` ${hash.toString()}`);
      }

      // Await txs to be mined and assert they are all mined on the same block
      const receipts = await Promise.all(txHashes.map(txHash => waitForTx(aztecNode, txHash)));
      expect(receipts.map(r => r.blockNumber)).toEqual(times(TX_COUNT, () => receipts[0].blockNumber));
    });

    // Tests that public function simulation time is not affected by the size of the nullifier tree.
    // Skipped since we only use it to manually test number of invocations to world-state.
    it.skip('builds blocks with multiple public fns after multiple nullifier insertions', async () => {
      // First deploy the contracts
      const { contract } = await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress });
      const { contract: another } = await TestContract.deploy(wallet).send({ from: ownerAddress });

      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 16, maxTxsPerBlock: 16 });

      // Flood nullifiers to grow the size of the nullifier tree.
      // Can probably do this more efficiently by batching multiple emit_nullifier calls
      // per tx using batch calls.
      const NULLIFIER_COUNT = 128;
      const sentNullifierTxs = [];
      for (let i = 0; i < NULLIFIER_COUNT; i++) {
        sentNullifierTxs.push(another.methods.emit_nullifier(Fr.random()).send({ from: ownerAddress, wait: NO_WAIT }));
      }
      await Promise.all(sentNullifierTxs);
      logger.info(`Nullifier txs sent`);

      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 4, maxTxsPerBlock: 4 });

      // Now send public functions
      const TX_COUNT = 128;
      const sentTxs = [];
      for (let i = 0; i < TX_COUNT; i++) {
        sentTxs.push(
          contract.methods.increment_public_value(ownerAddress, i).send({ from: ownerAddress, wait: NO_WAIT }),
        );
      }

      await Promise.all(sentTxs);
      logger.info(`Txs sent`);
    });

    // Uses priority fees to guarantee the deploy tx is ordered before the call tx within the same block.
    it('can call public function from different tx in same block as deployed', async () => {
      // Ensure both txs will land on the same block
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 2 });

      // Deploy a contract in the first transaction
      // In the same block, call a public method on the contract
      const deployMethod = TokenContract.deploy(wallet, ownerAddress, 'TokenName', 'TokenSymbol', 18, {
        deployer: ownerAddress,
      });

      // We can't use `TokenContract.at` to call a function because it checks the contract is deployed
      // but we are in the same block as the deployment transaction
      const deployerInstance = await deployMethod.getInstance();
      const callInteraction = new ContractFunctionInteraction(
        wallet,
        deployerInstance.address,
        getAllFunctionAbis(TokenContract.artifact).find(x => x.name === 'set_minter')!,
        [minterAddress, true],
      );

      // Use priority fees to guarantee ordering: deploy tx gets higher priority so the
      // sequencer places it before the call tx in the block.
      const highPriority = new GasFees(100, 100);
      const lowPriority = new GasFees(1, 1);

      const [deployResult, callResult] = await Promise.all([
        deployMethod.send({
          from: ownerAddress,
          fee: { gasSettings: { maxPriorityFeesPerGas: highPriority } },
        }),
        callInteraction.send({
          from: ownerAddress,
          fee: { gasSettings: { maxPriorityFeesPerGas: lowPriority } },
        }),
      ]);

      expect(deployResult.receipt.blockNumber).toEqual(callResult.receipt.blockNumber);
    });
  });

  describe('double-spends', () => {
    let contract: TestContract;
    let teardown: () => Promise<void>;

    beforeAll(async () => {
      ({
        teardown,
        logger,
        wallet,
        accounts: [ownerAddress],
      } = await setup(1, { defaultWaitStatus: TxStatus.CHECKPOINTED, ...PIPELINING_SETUP_OPTS }));
      ({ contract } = await TestContract.deploy(wallet).send({ from: ownerAddress }));
      logger.info(`Test contract deployed at ${contract.address}`);
    });

    afterAll(() => teardown());

    // Regressions for https://github.com/AztecProtocol/aztec-packages/issues/2502
    // Note that the order in which the TX are processed is not guaranteed.
    describe('in the same block, different tx', () => {
      it('private <-> private', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait(
          [contract.methods.emit_nullifier(nullifier), contract.methods.emit_nullifier(nullifier)],
          ownerAddress,
        );

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });

      it('public -> public', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait(
          [contract.methods.emit_nullifier_public(nullifier), contract.methods.emit_nullifier_public(nullifier)],
          ownerAddress,
        );

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });

      it('private -> public', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait(
          [contract.methods.emit_nullifier(nullifier), contract.methods.emit_nullifier_public(nullifier)],
          ownerAddress,
        );

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });

      it('public -> private', async () => {
        const nullifier = Fr.random();
        const txs = await sendAndWait(
          [contract.methods.emit_nullifier_public(nullifier), contract.methods.emit_nullifier(nullifier)],
          ownerAddress,
        );

        // One transaction should succeed, the other should fail, but in any order.
        expect(txs).toIncludeSameMembers([
          { status: 'fulfilled', value: expect.anything() },
          {
            status: 'rejected',
            reason: expect.objectContaining({ message: expect.stringMatching(DUPLICATE_NULLIFIER_ERROR) }),
          },
        ]);
      });
    });

    describe('across blocks', () => {
      it('private -> private', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          TX_ERROR_EXISTING_NULLIFIER,
        );
      });

      it('public -> public', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          DUPLICATE_NULLIFIER_ERROR,
        );
      });

      it('private -> public', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          DUPLICATE_NULLIFIER_ERROR,
        );
      });

      it('public -> private', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          TX_ERROR_EXISTING_NULLIFIER,
        );
      });
    });
  });

  describe('logs in nested calls are ordered as expected', () => {
    // This test was originally written for e2e_nested, but it was refactored
    // to not use TestContract.
    let testContract: TestContract;
    let ownerAddress: AztecAddress;

    beforeAll(async () => {
      ({
        teardown,
        logger,
        wallet,
        accounts: [ownerAddress],
      } = await setup(1, { defaultWaitStatus: TxStatus.CHECKPOINTED, ...PIPELINING_SETUP_OPTS }));

      logger.info(`Deploying test contract`);
      ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: ownerAddress }));
    }, 300_000);

    afterAll(() => teardown());

    it('calls a method with nested encrypted logs', async () => {
      const values = {
        value0: 5n,
        value1: 4n,
        value2: 3n,
        value3: 2n,
        value4: 1n,
      };
      const nestedValues = {
        value0: 0n,
        value1: 0n,
        value2: 0n,
        value3: 0n,
        value4: 0n,
      };

      // call test contract
      const valuesAsArray = Object.values(values);

      const tag = 42n;
      const action = testContract.methods.emit_array_as_encrypted_log(tag, valuesAsArray, ownerAddress, true);
      const tx = await proveInteraction(wallet, action, { from: ownerAddress });
      const rct = await tx.send();

      // compare logs
      expect(rct.hasExecutionSucceeded()).toBe(true);
      const privateLogs = tx.data.getNonEmptyPrivateLogs();
      expect(privateLogs.length).toBe(3);

      // The first two logs are encrypted.
      const events = await wallet.getPrivateEvents(TestContract.events.ExampleEvent, {
        contractAddress: testContract.address,
        fromBlock: BlockNumber(rct.blockNumber!),
        toBlock: BlockNumber(rct.blockNumber! + 1),
        scopes: [ownerAddress],
      });

      expect(events[0].event).toEqual(values);
      expect(events[1].event).toEqual(nestedValues);

      // The last log is not encrypted.
      // fields[0] is the tag, siloed with the contract address by the kernel circuit.
      // The payload starts at fields[1].
      const expectedSiloedTag = await computeSiloedPrivateLogFirstField(testContract.address, new Fr(tag));
      expect(privateLogs[2].fields.slice(0, 6).map((f: Fr) => f.toBigInt())).toEqual([
        expectedSiloedTag.toBigInt(),
        ...valuesAsArray,
      ]);
    }, 60_000);
  });

  describe('regressions', () => {
    afterEach(async () => {
      if (teardown) {
        await teardown();
      }
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7918
    it('publishes two empty blocks', async () => {
      ({ teardown, wallet, logger, aztecNode } = await setup(0, {
        defaultWaitStatus: TxStatus.CHECKPOINTED,
        ...PIPELINING_SETUP_OPTS,
        minTxsPerBlock: 0,
        buildCheckpointIfEmpty: true,
      }));

      // Under pipelining, with `aztecSlotDuration=12s`, each empty checkpoint contains one empty
      // block and lands roughly every 12s. Allow up to 60s for three empty blocks to appear.
      await retryUntil(async () => (await aztecNode.getBlockNumber()) >= 3, 'wait-block', 60, 1);
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7537
    it('sends a tx on the first block', async () => {
      const context = await setup(0, {
        defaultWaitStatus: TxStatus.CHECKPOINTED,
        ...PIPELINING_SETUP_OPTS,
        minTxsPerBlock: 0,
        numberOfInitialFundedAccounts: 1,
      });
      ({ teardown, logger, aztecNode, wallet } = context);
      await sleep(1000);

      const [accountData] = context.initialFundedAccounts;

      const accountManager = await (wallet as TestWallet).createSchnorrAccount(accountData.secret, accountData.salt);
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({
        from: NO_FROM,
      });
    });

    it('can simulate public txs while building a block', async () => {
      ({
        teardown,
        logger,
        aztecNode,
        wallet,
        aztecNodeAdmin,
        accounts: [ownerAddress],
      } = await setup(1, { defaultWaitStatus: TxStatus.CHECKPOINTED, ...PIPELINING_SETUP_OPTS, minTxsPerBlock: 1 }));

      logger.info('Deploying token contract');
      const { contract: token } = await TokenContract.deploy(wallet, ownerAddress, 'TokenName', 'TokenSymbol', 18).send(
        {
          from: ownerAddress,
        },
      );

      logger.info('Updating txs per block to 4');
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 4, maxTxsPerBlock: 4 });

      logger.info('Spamming the network with public txs');
      const txs = [];
      for (let i = 0; i < 24; i++) {
        const tx = token.methods.mint_to_public(ownerAddress, 10n);
        txs.push(tx.send({ from: ownerAddress }));
      }

      logger.info('Waiting for txs to be mined');
      await Promise.all(txs);
    });

    // Regression for ReexStateMismatch happening on testnet when AVM processing throws an unexpected error.
    // The culprit is a nullifier not being cleared up from world state during block building if a tx fails processing,
    // which translates in an incorrect end state for world state. We can easily detect this by checking whether the nullifier
    // tree next available leaf index is a multiple of 64.
    it('clears up all nullifiers if tx processing fails', async () => {
      const context = await setup(1, {
        defaultWaitStatus: TxStatus.CHECKPOINTED,
        ...PIPELINING_SETUP_OPTS,
        minTxsPerBlock: 1,
        numberOfInitialFundedAccounts: 1,
      });
      ({
        teardown,
        logger,
        aztecNode,
        wallet,
        accounts: [ownerAddress],
      } = context);

      const { contract: testContract } = await TestContract.deploy(wallet).send({ from: ownerAddress });
      logger.warn(`Test contract deployed at ${testContract.address}`);

      // We want the sequencer to wait until both txs have arrived (so minTxsPerBlock=2), but agree to build
      // a block with 1 tx only. We also want to simulate an AVM failure in tx processing for only one of the txs.
      context.sequencer?.updateConfig({
        minTxsPerBlock: 2,
        minValidTxsPerBlock: 1,
        fakeThrowAfterProcessingTxCount: 2,
      });

      // Send two txs that emit two nullifiers each, one from private and one from public.
      const makeBatch = () =>
        new BatchCall(wallet, [
          testContract.methods.emit_nullifier(Fr.random()),
          testContract.methods.emit_nullifier_public(Fr.random()),
        ]);
      const batches = times(2, makeBatch);

      const txHashResults = await Promise.all(batches.map(batch => batch.send({ from: ownerAddress, wait: NO_WAIT })));
      const txHashes = txHashResults.map(({ txHash }) => txHash);
      logger.warn(`Sent two txs to test contract`, { txs: txHashes.map(hash => hash.toString()) });
      // Use Promise.any (not Promise.race): exactly one of the two txs will be dropped (the one that hits
      // the fake AVM error in tx processing), so the dropped-tx rejection would settle Promise.race first.
      // We want the first *successful* mine.
      const minedTxHash = await Promise.any(
        txHashes.map(async txHash => {
          await waitForTx(aztecNode, txHash, { timeout: 60 });
          return txHash;
        }),
      );

      logger.warn(`At least one tx has been mined`, { minedTxHash: minedTxHash.toString() });
      const minedReceipt = await aztecNode.getTxReceipt(minedTxHash);
      const block = await context.aztecNode.getBlock(minedReceipt.blockNumber!);
      expect(block).toBeDefined();

      logger.warn(`Mined block is ${block!.header.getBlockNumber()}`, { state: block!.header.state.partial });
      const nextNullifierIndex = block!.header.state.partial.nullifierTree.nextAvailableLeafIndex;
      expect(nextNullifierIndex % 64).toEqual(0);
    });
  });

  describe('reorgs', () => {
    let contract: StatefulTestContract;
    let cheatCodes: CheatCodes;
    let ownerAddress: AztecAddress;
    let initialBlockNumber: BlockNumber;
    let teardown: () => Promise<void>;

    beforeEach(async () => {
      ({
        teardown,
        aztecNode,
        logger,
        wallet,
        cheatCodes,
        watcher,
        accounts: [ownerAddress],
      } = await setup(1, { defaultWaitStatus: TxStatus.CHECKPOINTED, ...PIPELINING_SETUP_OPTS, minTxsPerBlock: 1 }));

      ({ contract } = await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress }));
      initialBlockNumber = await aztecNode.getBlockNumber();
      logger.info(`Stateful test contract deployed at ${contract.address}`);

      await cheatCodes.rollup.advanceToNextEpoch();

      // Mark all blocks up to the current pending tip as proven so the contract-deployment block
      // is anchored against a proven checkpoint. The e2e fixture's AnvilTestWatcher does NOT
      // auto-prove under interval mining (only under automining), so we must drive proven manually.
      await cheatCodes.rollup.markAsProven();
      const bn = await aztecNode.getBlockNumber();
      await retryUntil(async () => (await aztecNode.getBlockNumber('proven')) >= bn, 'wait-proven', 60, 1);

      watcher.setIsMarkingAsProven(false);
    });

    afterEach(() => teardown());

    it('detects an upcoming reorg and builds a block for the correct slot', async () => {
      // Advance to a fresh epoch and mark the current one as proven
      await cheatCodes.rollup.advanceToNextEpoch();
      await cheatCodes.rollup.markAsProven();

      // Send a tx to the contract that creates a note. This tx will be reorgd but re-included,
      // since it is being built against a proven block number.
      logger.info('Sending initial tx');
      const { receipt: tx1 } = await contract.methods.create_note(ownerAddress, 20).send({ from: ownerAddress });
      expect(tx1.blockNumber).toEqual(initialBlockNumber + 1);
      expect((await contract.methods.summed_values(ownerAddress).simulate({ from: ownerAddress })).result).toEqual(21n);

      // And send a second one, which won't be re-included.
      logger.info('Sending second tx');
      const { receipt: tx2 } = await contract.methods.create_note(ownerAddress, 30).send({ from: ownerAddress });
      expect(tx2.blockNumber).toEqual(initialBlockNumber + 2);
      expect((await contract.methods.summed_values(ownerAddress).simulate({ from: ownerAddress })).result).toEqual(51n);

      logger.info('Advancing past the proof submission window');

      await cheatCodes.rollup.advanceToEpoch(
        getProofSubmissionDeadlineEpoch(EpochNumber(2), { proofSubmissionEpochs: 1 }),
      );

      // Wait until the sequencer kicks out tx1
      logger.info(`Waiting for node to prune tx1`);
      await retryUntil(
        async () => (await aztecNode.getTxReceipt(tx1.txHash)).status === TxStatus.PENDING,
        'wait for pruning',
        15,
        0.11,
      );

      // And wait until it is brought back tx1
      logger.info(`Waiting for node to re-include tx1`);
      await retryUntil(
        async () => {
          const receipt = await aztecNode.getTxReceipt(tx1.txHash);
          return receipt.isMined() && receipt.hasExecutionSucceeded();
        },
        'wait for re-inclusion',
        15,
        1,
      );

      // Tx1 should have been mined in a block with the same number but different hash now
      const newTx1Receipt = await aztecNode.getTxReceipt(tx1.txHash);
      expect(newTx1Receipt.blockNumber).toEqual(tx1.blockNumber);
      expect(newTx1Receipt.blockHash).not.toEqual(tx1.blockHash);

      // PXE should have cleared out the 30-note from tx2, but reapplied the 20-note from tx1
      expect((await contract.methods.summed_values(ownerAddress).simulate({ from: ownerAddress })).result).toEqual(21n);

      // And we should be able to send a new tx on the new chain
      logger.info('Sending new tx on reorgd chain');
      const { receipt: tx3 } = await contract.methods.create_note(ownerAddress, 10).send({ from: ownerAddress });
      expect((await contract.methods.summed_values(ownerAddress).simulate({ from: ownerAddress })).result).toEqual(31n);
      expect(tx3.blockNumber).toBeGreaterThanOrEqual(newTx1Receipt.blockNumber! + 1);
    });
  });
});

function sendAndWait(calls: ContractFunctionInteraction[], from: AztecAddress) {
  return Promise.allSettled(calls.map(call => call.send({ from })));
}
