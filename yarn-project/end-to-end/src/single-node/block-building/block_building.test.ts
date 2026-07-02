import { generateSchnorrAccounts } from '@aztec/accounts/testing';
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, ContractFunctionInteraction, type DeployOptions, NO_WAIT } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { TxStatus } from '@aztec/aztec.js/tx';
import { ContractInitializationStatus } from '@aztec/aztec.js/wallet';
import { CheatCodes } from '@aztec/aztec/testing';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { times, unique } from '@aztec/foundation/collection';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { StatefulTestContract } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import { getAllFunctionAbis } from '@aztec/stdlib/abi';
import { getProofSubmissionDeadlineEpoch } from '@aztec/stdlib/epoch-helpers';
import { GasFees } from '@aztec/stdlib/gas';
import { computeSiloedPrivateLogFirstField } from '@aztec/stdlib/hash';
import type { AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';
import { TX_ERROR_EXISTING_NULLIFIER } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import 'jest-extended';

import { DUPLICATE_NULLIFIER_ERROR, PIPELINING_SETUP_OPTS } from '../../fixtures/fixtures.js';
import {
  waitForBlockNumber,
  waitForProvenBlock,
  waitForTxReceipt,
  waitForTxStatus,
  waitForTxs,
} from '../../fixtures/wait_helpers.js';
import { TestWallet } from '../../test-wallet/test_wallet.js';
import { proveInteraction } from '../../test-wallet/utils.js';
import { setupBlockProducer } from '../setup.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';

// Tests block building mechanics under the production sequencer with pipelining:
// multi-tx blocks, double-spend rejection, log ordering, regressions, and L1 reorgs.
// Uses setupBlockProducer (no prover node) with PIPELINING_SETUP_OPTS (ethereumSlotDuration=4s,
// aztecSlotDuration=12s, minTxsPerBlock=0). The factory pins aztecProofSubmissionEpochs=1024 so
// unproven blocks survive; the `reorgs` describe overrides it to 1 to exercise pruning.
// The `reorgs` describe uses RollupCheatCodes (advanceToNextEpoch, markAsProven, advanceToEpoch)
// — other-active L1, not cross-chain bridging. CI job has TIMEOUT=25m.
describe('single-node/block-building/block_building', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  let logger: Logger;
  let wallet: TestWallet;

  let ownerAddress: AztecAddress;
  let minterAddress: AztecAddress;

  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let _sequencer: TestSequencerClient;
  let test: SingleNodeTestContext;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Tests assembling blocks with multiple simultaneous transactions under pipelining.
  // setupBlockProducer with PIPELINING_SETUP_OPTS and fast polling intervals; minTxsPerBlock set per test.
  describe('multi-txs block', () => {
    beforeAll(async () => {
      test = await setupBlockProducer({
        ...PIPELINING_SETUP_OPTS,
        numberOfAccounts: 2,
        archiverPollingIntervalMS: 200,
        sequencerPollingIntervalMS: 200,
        worldStateBlockCheckIntervalMS: 200,
        blockCheckIntervalMS: 200,
      });
      ({
        logger,
        aztecNode,
        aztecNodeAdmin,
        wallet,
        accounts: [ownerAddress, minterAddress],
      } = test.context);
      _sequencer = test.context.sequencer! as TestSequencerClient;
    });

    beforeEach(async () => {
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    });

    afterEach(async () => {
      await aztecNodeAdmin.setConfig({
        fakeProcessingDelayPerTxMs: 0,
        minTxsPerBlock: 1,
        maxTxsPerBlock: undefined, // reset to default
        blockDurationMs: 3000, // reset to the PIPELINING_SETUP_OPTS fixture default (2 blocks/slot)
      });
      // Clean up any mocks
      jest.restoreAllMocks();
    });

    afterAll(() => test.teardown());

    // Under pipelining, the proposer divides each slot into fixed sub-slots of length `blockDurationMs`.
    // Each sub-slot owns the budget for exactly one L2 block; the block builder enforces the sub-slot
    // deadline as a hard cap on tx execution. The invariant this test protects: if there are far more txs
    // than fit in one sub-slot, the proposer must cut the block off at the deadline and roll the excess
    // txs into the next sub-slot (and the next checkpoint when the slot ends). It must NOT pack everything
    // into a single block and burn the whole slot on it.
    // Configures BLOCK_DURATION_MS=2s and FAKE_DELAY_PER_TX=500ms, floods 10 txs, asserts they span
    // at least 2 distinct blocks (sub-slot deadline enforced).
    it('processes txs until hitting timetable', async () => {
      // The timetable is always enforced. Fixture defaults under pipelining: aztecSlotDuration=12s,
      // ethereumSlotDuration=4s. With ethereumSlotDuration<8 the timing model normalizes to
      // checkpointInitializationTime=0.5s, checkpointAssembleTime=0.5s, p2pPropagationTime=0,
      // minExecutionTime=1s. We override blockDurationMs to a 2s sub-slot for this test, giving
      // maxBlocks = floor((12 - 0.5 - (0.5 + 0 + 2)) / 2) = floor(9/2) = 4 sub-slots per slot — more
      // sub-slots than the fixture default (3s -> 2 blocks/slot) so the cut-across-blocks invariant
      // is easier to assert. Sub-slot build deadlines fall at 0.5 + k*2s into the slot.
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
      const receipts = await waitForTxs(aztecNode, txHashes);
      const blockNumbers = receipts.map(r => r.blockNumber!).sort((a, b) => a - b);
      logger.info(`Txs mined on blocks: ${unique(blockNumbers)}`);
      // Spread must be at least 1 — i.e. txs are split across at least 2 distinct blocks. This fails
      // (and the test catches a regression) if the proposer reverts to single-block-per-slot behavior
      // or if sub-slot deadlines stop being enforced.
      expect(blockNumbers.at(-1)! - blockNumbers[0]).toBeGreaterThanOrEqual(1);
      expect(unique(blockNumbers).length).toBeGreaterThanOrEqual(2);
    });

    // Sends 8 StatefulTestContract deploys simultaneously, waits for all to mine, and asserts
    // all land in the same block with INITIALIZED status.
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
      const receipts = await waitForTxs(aztecNode, txHashes);
      expect(receipts.map(r => r.blockNumber)).toEqual(times(TX_COUNT, () => receipts[0].blockNumber));

      // Assert all contracts got initialized
      const areInitialized = await Promise.all(
        addresses.map(async a => (await wallet.getContractMetadata(a)).initializationStatus),
      );
      expect(areInitialized).toEqual(times(TX_COUNT, () => ContractInitializationStatus.INITIALIZED));
    });

    // Sends 4 public increment_public_value calls simultaneously, waits for all to mine,
    // and asserts all land in the same block.
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
      const receipts = await waitForTxs(aztecNode, txHashes);
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
    // Sends two txs with different priority fees, asserts they both land in the same block.
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

  // Tests that duplicate nullifiers are rejected, both within the same block and across blocks.
  // setupBlockProducer with PIPELINING_SETUP_OPTS, one node, production sequencer.
  describe('double-spends', () => {
    let contract: TestContract;

    beforeAll(async () => {
      test = await setupBlockProducer({ ...PIPELINING_SETUP_OPTS, numberOfAccounts: 1 });
      ({
        logger,
        wallet,
        accounts: [ownerAddress],
      } = test.context);
      ({ contract } = await TestContract.deploy(wallet).send({ from: ownerAddress }));
      logger.info(`Test contract deployed at ${contract.address}`);
    });

    afterAll(() => test.teardown());

    // Regressions for https://github.com/AztecProtocol/aztec-packages/issues/2502
    // Note that the order in which the TX are processed is not guaranteed.
    // Both txs race to the same block; exactly one succeeds and the other fails.
    describe('in the same block, different tx', () => {
      // Sends two private emit_nullifier txs with the same nullifier simultaneously;
      // asserts one succeeds and one rejects with DUPLICATE_NULLIFIER_ERROR.
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

      // Same as private<->private but both txs use public nullifier emission.
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

      // One private and one public tx emit the same nullifier simultaneously; one must fail.
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

      // One public and one private tx emit the same nullifier simultaneously; one must fail.
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

    // Double-spend rejection when the second tx arrives in a later block (nullifier already in the tree).
    describe('across blocks', () => {
      // Emits a private nullifier, then tries to emit the same in a subsequent tx and expects rejection.
      it('private -> private', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          TX_ERROR_EXISTING_NULLIFIER,
        );
      });

      // Emits a public nullifier, then tries again in a subsequent tx and expects rejection.
      it('public -> public', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          DUPLICATE_NULLIFIER_ERROR,
        );
      });

      // Emits via private then tries public with the same nullifier in a later block; expects rejection.
      it('private -> public', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          DUPLICATE_NULLIFIER_ERROR,
        );
      });

      // Emits via public then tries private with the same nullifier in a later block; expects rejection.
      it('public -> private', async () => {
        const nullifier = Fr.random();
        await contract.methods.emit_nullifier_public(nullifier).send({ from: ownerAddress });
        await expect(contract.methods.emit_nullifier(nullifier).send({ from: ownerAddress })).rejects.toThrow(
          TX_ERROR_EXISTING_NULLIFIER,
        );
      });
    });
  });

  // Verifies that private encrypted logs and unencrypted logs emitted from nested calls are ordered
  // correctly in the block. setupBlockProducer with PIPELINING_SETUP_OPTS.
  describe('logs in nested calls are ordered as expected', () => {
    // This test was originally written for e2e_nested, but it was refactored
    // to not use TestContract.
    let testContract: TestContract;
    let ownerAddress: AztecAddress;

    beforeAll(async () => {
      test = await setupBlockProducer({ ...PIPELINING_SETUP_OPTS, numberOfAccounts: 1 });
      ({
        logger,
        wallet,
        accounts: [ownerAddress],
      } = test.context);

      logger.info(`Deploying test contract`);
      ({ contract: testContract } = await TestContract.deploy(wallet).send({ from: ownerAddress }));
    }, 300_000);

    afterAll(() => test.teardown());

    // Sends emit_array_as_encrypted_log, retrieves ExampleEvent private logs and a raw siloed log,
    // and asserts ordering and field values are correct.
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

  // Regression tests for specific sequencer bugs; each creates its own context via setupBlockProducer.
  describe('regressions', () => {
    afterEach(async () => {
      if (test) {
        await test.teardown();
      }
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7918
    // Waits for block number >= 3 with buildCheckpointIfEmpty=true to confirm empty checkpoints are built.
    it('publishes two empty blocks', async () => {
      test = await setupBlockProducer({
        ...PIPELINING_SETUP_OPTS,
        minTxsPerBlock: 0,
        buildCheckpointIfEmpty: true,
      });
      ({ wallet, logger, aztecNode } = test.context);

      // Under pipelining, with `aztecSlotDuration=12s`, each empty checkpoint contains one empty
      // block and lands roughly every 12s. Allow up to 60s for three empty blocks to appear.
      await waitForBlockNumber(aztecNode, 3);
    });

    // Regression for https://github.com/AztecProtocol/aztec-packages/issues/7537
    // Deploys an account on block 1 with minTxsPerBlock=0 to verify the first block can accept txs.
    it('sends a tx on the first block', async () => {
      test = await setupBlockProducer({
        ...PIPELINING_SETUP_OPTS,
        minTxsPerBlock: 0,
        additionallyFundedAccounts: await generateSchnorrAccounts(1, 'schnorr'),
      });
      ({ logger, aztecNode, wallet } = test.context);
      await waitForBlockNumber(aztecNode, 1);

      const [accountData] = test.context.additionallyFundedAccounts;

      const accountManager = await (wallet as TestWallet).createSchnorrAccount(
        accountData.secret,
        accountData.salt,
        accountData.signingKey,
      );
      const deployMethod = await accountManager.getDeployMethod();
      await deployMethod.send({
        from: NO_FROM,
      });
    });

    // Floods 24 Token.mint_to_public txs while the sequencer is building blocks and asserts all land.
    it('can simulate public txs while building a block', async () => {
      test = await setupBlockProducer({ ...PIPELINING_SETUP_OPTS, numberOfAccounts: 1, minTxsPerBlock: 1 });
      ({
        logger,
        aztecNode,
        wallet,
        aztecNodeAdmin,
        accounts: [ownerAddress],
      } = test.context);

      logger.info('Deploying token contract');
      const { contract: token } = await TokenContract.deploy(wallet, ownerAddress, 'TokenName', 'TokenSymbol', 18).send(
        {
          from: ownerAddress,
        },
      );

      // Cap blocks at 4 txs so building spans several blocks while the 24 sends below simulate concurrently.
      // minTxsPerBlock must stay at 1: with the timetable always enforced, a leftover batch smaller than
      // minTxsPerBlock can never form a block (the sub-slot deadline cuts and discards it every slot), so a
      // higher minimum livelocks the test if the tx count doesn't divide evenly into blocks.
      logger.info('Updating max txs per block to 4');
      await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1, maxTxsPerBlock: 4 });

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
    // Injects a fakeThrowAfterProcessingTxCount=2 to force AVM failure, verifies nullifier tree alignment.
    it('clears up all nullifiers if tx processing fails', async () => {
      test = await setupBlockProducer({ ...PIPELINING_SETUP_OPTS, numberOfAccounts: 1, minTxsPerBlock: 1 });
      ({
        logger,
        aztecNode,
        wallet,
        accounts: [ownerAddress],
      } = test.context);

      const { contract: testContract } = await TestContract.deploy(wallet).send({ from: ownerAddress });
      logger.warn(`Test contract deployed at ${testContract.address}`);

      // We want the sequencer to wait until both txs have arrived (so minTxsPerBlock=2), but agree to build
      // a block with 1 tx only. We also want to simulate an AVM failure in tx processing for only one of the txs.
      test.context.sequencer?.updateConfig({
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
      const block = await test.context.aztecNode.getBlock(minedReceipt.blockNumber!);
      expect(block).toBeDefined();

      logger.warn(`Mined block is ${block!.header.getBlockNumber()}`, { state: block!.header.state.partial });
      const nextNullifierIndex = block!.header.state.partial.nullifierTree.nextAvailableLeafIndex;
      expect(nextNullifierIndex % 64).toEqual(0);
    });
  });

  // Tests that the sequencer handles L2 reorgs correctly: detects stale proofs, prunes affected txs,
  // and re-includes those that were built against a proven block.
  // Uses cheatCodes.rollup.advanceToNextEpoch, markAsProven, advanceToEpoch, and tx-status wait helpers.
  describe('reorgs', () => {
    let contract: StatefulTestContract;
    let cheatCodes: CheatCodes;
    let ownerAddress: AztecAddress;
    let initialBlockNumber: BlockNumber;

    beforeEach(async () => {
      // Keep aztecProofSubmissionEpochs at 1 (rather than setupBlockProducer's high default) so the
      // reorg test's advance past getProofSubmissionDeadlineEpoch(epoch 2, { proofSubmissionEpochs: 1 })
      // actually crosses the on-chain submission window and triggers the prune-and-reinclude reorg.
      test = await setupBlockProducer({
        ...PIPELINING_SETUP_OPTS,
        numberOfAccounts: 1,
        minTxsPerBlock: 1,
        aztecProofSubmissionEpochs: 1,
      });
      ({
        aztecNode,
        logger,
        wallet,
        cheatCodes,
        accounts: [ownerAddress],
      } = test.context);

      ({ contract } = await StatefulTestContract.deploy(wallet, ownerAddress, 1).send({ from: ownerAddress }));
      initialBlockNumber = await aztecNode.getBlockNumber();
      logger.info(`Stateful test contract deployed at ${contract.address}`);

      await cheatCodes.rollup.advanceToNextEpoch();

      // Mark all blocks up to the current pending tip as proven so the contract-deployment block
      // is anchored against a proven checkpoint. Nothing auto-proves under the e2e fixture's L1
      // interval mining, so we drive proven manually here (and again inside each test).
      await cheatCodes.rollup.markAsProven();
      const bn = await aztecNode.getBlockNumber();
      await waitForProvenBlock(aztecNode, bn);
    });

    afterEach(() => test.teardown());

    // Advances epoch, marks proven, sends two txs, then advances past the proof-submission window
    // causing a reorg. Waits for tx1 to be pruned then re-included at the same block number.
    // Asserts tx2 is dropped, tx1 is re-included, and a subsequent tx lands cleanly.
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
      await waitForTxStatus(aztecNode, tx1.txHash, TxStatus.PENDING, { timeout: 15, interval: 0.11 });

      // And wait until it is brought back tx1
      logger.info(`Waiting for node to re-include tx1`);
      await waitForTxReceipt(aztecNode, tx1.txHash, receipt => receipt.isMined() && receipt.hasExecutionSucceeded(), {
        timeout: 15,
        interval: 1,
      });

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
