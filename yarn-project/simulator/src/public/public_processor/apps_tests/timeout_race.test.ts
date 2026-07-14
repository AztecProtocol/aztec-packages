/**
 * Test to reproduce the C++ simulation timeout race condition.
 *
 * Root Cause: When a timeout fires during C++ AVM simulation:
 * 1. The C++ simulation continues running on a libuv worker thread
 * 2. It directly accesses WorldState via the native handle
 * 3. TypeScript calls checkpoint revert operations
 * 4. Both paths operate on the same WorldState concurrently
 *
 * The key issues were:
 * - GuardedMerkleTreeOperations does not guard C++ access
 * - Nothing stops C++ simulation on PublicProcessor deadline
 */
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { MerkleTreeId, merkleTreeIds } from '@aztec/stdlib/trees';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { ForkCheckpoint, NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';

import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { PublicContractsDB } from '../../public_db_sources.js';
import { PublicTxSimulator } from '../../public_tx_simulator/public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

// AvmTest's `n_storage_writes_to_same_slot` writes the same public-data slot in a loop. Same-slot
// writes are squashed so they never hit the per-tx public-data-write limit: the call keeps writing
// to PUBLIC_DATA_TREE continuously (no gaps) until it runs out of gas, which is exactly what we
// need to reliably catch the C++ simulation mid-write. The count is far larger than any tx can
// afford, so the call always runs to out-of-gas.
const STORAGE_WRITE_SPAM_FN = 'n_storage_writes_to_same_slot';
const STORAGE_WRITE_SPAM_COUNT = 1_000_000_000;

jest.setTimeout(120_000);

describe('PublicProcessor C++ Timeout Race Condition', () => {
  // BUG PROOF tests - this is the race condition and is flaky so we run more iterations
  const MAX_BUG_PROOF_ITERATIONS = 10;
  // FIX PROOF tests - just confirm that the fix always works
  const FIX_PROOF_ITERATIONS = 5;

  const logger = createLogger('public-processor-timeout-race');

  const admin = AztecAddress.fromNumberUnsafe(42);

  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  /**
   * Helper function to run the race condition test at the PublicTxSimulator level.
   * Both BUG PROOF and FIX PROOF use IDENTICAL code - the ONLY difference is
   * whether cancellation is signaled and waited for.
   *
   * Uses same-slot storage spamming to keep C++ constantly writing to PUBLIC_DATA_TREE without gaps.
   *
   * For the BUG proof: Don't call cancel() → C++ continues during reverts → corruption
   * For the FIX proof: Call cancel(100) → wait for C++ to stop → then revert → no corruption
   *
   * @param useCancellation - Whether to call cancel() before reverts
   * @param numIterations - Number of iterations to run
   */
  async function runRaceConditionTest(useCancellation: boolean, numIterations: number): Promise<number> {
    let raceObservedCount = 0;

    const globals = GlobalVariables.empty();
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await worldStateService.fork();
    const contractsDB = new PublicContractsDB(contractDataSource);

    const simulator = new PublicTxSimulator(merkleTrees, contractsDB, globals);

    const tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, globals);
    await tester.setFeePayerBalance(admin);

    // Deploy the AvmTest contract; its `n_storage_writes_to_same_slot` loops storage writes until OOG.
    const contract = await tester.registerAndDeployContract(/*constructorArgs=*/ [], admin, AvmTestContractArtifact);
    const contractAddress = contract.address;

    for (let iteration = 0; iteration < numIterations; iteration++) {
      // Ensure any previous simulation is fully stopped before starting a new one
      await simulator.cancel(1000);

      // Get initial state for trees we need to check
      const initialTreeInfo = new Map<MerkleTreeId, { size: bigint; root: Buffer }>();
      for (const treeId of merkleTreeIds()) {
        const info = await merkleTrees.getTreeInfo(treeId);
        initialTreeInfo.set(treeId, { size: info.size, root: info.root });
      }

      // Create checkpoint BEFORE simulation (like PublicProcessor does)
      const forkCheckpoint = await ForkCheckpoint.new(merkleTrees);

      // Create transaction that calls the spammer contract
      const tx = await tester.createTx(
        admin,
        [],
        [{ address: contractAddress, fnName: STORAGE_WRITE_SPAM_FN, args: [STORAGE_WRITE_SPAM_COUNT] }],
      );

      // Start C++ simulation (not awaiting - like production timeout behavior!)
      const simulationPromise = simulator.simulate(tx);
      // Eagerly add catch to prevent unhandled promise rejection warnings
      simulationPromise.catch(() => {});

      // No delay - immediately try to catch C++ mid-write
      // This maximizes the chance of hitting the race condition

      // THE ONLY DIFFERENCE: signal cancellation AND WAIT, or not
      if (useCancellation) {
        // FIX - Signal cancellation and WAIT for C++ to actually stop (up to 100ms)
        // This ensures C++ has finished before we proceed with reverts.
        await simulator.cancel(100);
      }
      // BUG - No cancel, C++ continues running during reverts below

      // Clean up - revert all changes
      await forkCheckpoint.revertToCheckpoint();

      // Wait for simulation promise for cleanup
      await Promise.race([simulationPromise.catch(() => {}), sleep(100)]);

      // Check state after everything is cleaned up
      let anyTreeCorrupted = false;
      for (const treeId of merkleTreeIds()) {
        const finalInfo = await merkleTrees.getTreeInfo(treeId);
        const initialInfo = initialTreeInfo.get(treeId)!;
        const changed = finalInfo.size !== initialInfo.size || !finalInfo.root.equals(initialInfo.root);
        if (changed) {
          anyTreeCorrupted = true;
          break;
        }
      }

      if (anyTreeCorrupted) {
        raceObservedCount++;
        // Early exit - bug exists, no need to continue
        // Always cancel simulation for clean test shutdown (prevent crash during afterEach)
        await simulator.cancel(1000);
        logger.verbose(`Early exit`);
        return raceObservedCount;
      }
    }

    // Always cancel simulation for clean test shutdown (prevent crash during afterEach)
    await simulator.cancel(1000);
    return raceObservedCount;
  }

  /**
   * PublicTxSimulation BUG - Demonstrate the race condition WITHOUT cancellation.
   *
   * This test proves the bug exists by showing that without cancellation:
   * - C++ simulation continues running after we call revertCheckpoint
   * - C++ makes writes AFTER the revert, corrupting state
   *
   * The race is non-deterministic, so we run multiple iterations.
   * This test PASSES if we observe corruption (proving the bug exists).
   */
  it('PublicTxSimulator BUG PROOF: race condition exists WITHOUT cancellation', async () => {
    const raceObservedCount = await runRaceConditionTest(false, MAX_BUG_PROOF_ITERATIONS);
    logger.info(`Race condition observed in >0/${MAX_BUG_PROOF_ITERATIONS} iterations (expected: >0)`);
    expect(raceObservedCount).toBeGreaterThan(0);
  });

  /**
   * PublicTxSimulation FIX - Demonstrate the fix WITH cancellation.
   *
   * This test proves the fix works by showing that with cancellation:
   * - We signal C++ to stop before it makes more writes
   * - C++ checks the token before each write and stops
   * - No corruption occurs even though we revert while C++ is "running"
   *
   * This test PASSES if we observe NO corruption (proving the fix works).
   */
  it('PublicTxSimulator FIX PROOF: no race condition WITH cancellation', async () => {
    const raceObservedCount = await runRaceConditionTest(true, FIX_PROOF_ITERATIONS);
    logger.info(`Race condition observed in ${raceObservedCount}/${FIX_PROOF_ITERATIONS} iterations (expected: 0)`);
    expect(raceObservedCount).toBe(0);
  });

  /**
   * Helper to run PublicProcessor timeout test (Level 3).
   * Both BUG and FIX tests use IDENTICAL code - the ONLY difference is whether
   * cancel() method exists on the simulator.
   *
   * Uses same-slot storage spamming to keep C++ constantly writing to PUBLIC_DATA_TREE without gaps.
   *
   * For the BUG proof: cancel is undefined → PublicProcessor can't wait for C++ → corruption
   * For the FIX proof: cancel exists → PublicProcessor awaits cancel(100) → C++ stops → no corruption
   *
   * Returns the number of times state corruption was observed.
   *
   * @param useCancellation - Whether to provide cancel() method to PublicProcessor
   * @param numIterations - Number of iterations to run
   */
  async function runPublicProcessorTimeoutTest(useCancellation: boolean, numIterations: number): Promise<number> {
    let corruptionCount = 0;

    const globals = GlobalVariables.empty();
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await worldStateService.fork();
    const contractsDB = new PublicContractsDB(contractDataSource);

    // Set up contracts and balances using a tester on the unguarded fork
    const tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, globals);
    await tester.setFeePayerBalance(admin);

    // Deploy the AvmTest contract; its `n_storage_writes_to_same_slot` loops storage writes until OOG.
    const contract = await tester.registerAndDeployContract(/*constructorArgs=*/ [], admin, AvmTestContractArtifact);
    const contractAddress = contract.address;

    for (let iteration = 0; iteration < numIterations; iteration++) {
      // Create fresh guarded tree and processor for each iteration because
      // GuardedMerkleTreeOperations.stop() is called on timeout and can't be reused.
      const guardedMerkleTrees = new GuardedMerkleTreeOperations(merkleTrees);

      // Create the real C++ simulator
      const realSimulator = new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals);

      // Track the simulation promise so we can await it for cleanup.
      // Use an object wrapper to avoid TypeScript control flow analysis issues.
      const simState = { promise: null as Promise<any> | null };

      // Both tests use IDENTICAL code - the ONLY difference is whether cancel() exists.
      // PublicProcessor now calls: await this.publicTxSimulator.cancel?.(100)
      // - FIX - cancel exists, waits for C++ to stop before reverts
      // - BUG - cancel is undefined, reverts proceed while C++ is still running
      const simulator = {
        simulate: (tx: any) => {
          simState.promise = realSimulator.simulate(tx);
          return simState.promise;
        },
        cancel: useCancellation ? (waitTimeoutMs?: number) => realSimulator.cancel(waitTimeoutMs) : undefined, // No cancel method - PublicProcessor can't wait for C++ to stop
      };

      // Use TestDateProvider to control time
      const dateProvider = new TestDateProvider();

      // Create PublicProcessor with the simulator
      const processor = new PublicProcessor(
        globals,
        guardedMerkleTrees,
        contractsDB,
        simulator,
        dateProvider,
        getTelemetryClient(),
        createLogger('simulator:public-processor'),
      );

      // Get initial state for trees we need to check
      const initialTreeInfo = new Map<MerkleTreeId, { size: bigint; root: Buffer }>();
      for (const treeId of merkleTreeIds()) {
        const info = await merkleTrees.getTreeInfo(treeId);
        initialTreeInfo.set(treeId, { size: info.size, root: info.root });
      }

      // Create transaction that calls the spammer contract
      const tx = await tester.createTx(
        admin,
        [],
        [{ address: contractAddress, fnName: STORAGE_WRITE_SPAM_FN, args: [STORAGE_WRITE_SPAM_COUNT] }],
      );

      // Calculate deadline RIGHT BEFORE process() to ensure we get the full timeout.
      // Use a 20ms deadline - enough for C++ to start but short enough to timeout mid-simulation.
      const deadline = new Date(dateProvider.now() + 20);

      // Process the transaction with the short deadline
      // PublicProcessor flow on timeout:
      // 1. await this.publicTxSimulator.cancel?.(100)
      //    - FIX - waits up to 100ms for C++ to stop
      //    - BUG - cancel is undefined, immediately proceeds
      // 2. reverts run, then checkWorldStateUnchanged()
      // 3. process() returns
      let checkWorldStateUnchangedCaughtIt = false;
      try {
        await processor.process([tx], { deadline });
      } catch (err: any) {
        // checkWorldStateUnchanged() throws if it detects corruption
        if (err.message?.includes('state reference changed')) {
          checkWorldStateUnchangedCaughtIt = true;
        }
        // Continue - we'll check state ourselves too
      }

      // Give C++ time to make corrupting writes, but don't wait for full completion (OOG).
      // In BUG case: C++ continues running, we wait 100ms for it to corrupt state.
      // In FIX case: C++ already stopped, this is just a short sleep.
      await Promise.race([
        simState.promise?.catch(() => {}),
        sleep(100), // Enough time for corruption, but don't wait for full OOG
      ]);

      // Check state after everything is cleaned up
      let anyTreeCorrupted = false;
      for (const treeId of merkleTreeIds()) {
        const finalInfo = await merkleTrees.getTreeInfo(treeId);
        const initialInfo = initialTreeInfo.get(treeId)!;
        const changed = finalInfo.size !== initialInfo.size || !finalInfo.root.equals(initialInfo.root);
        if (changed) {
          anyTreeCorrupted = true;
          break;
        }
      }

      // Log the comparison: did checkWorldStateUnchanged catch it vs. our check after C++ finished
      if (checkWorldStateUnchangedCaughtIt || anyTreeCorrupted) {
        const caughtBy = checkWorldStateUnchangedCaughtIt
          ? anyTreeCorrupted
            ? 'BOTH'
            : 'checkWorldStateUnchanged only'
          : 'our check only (C++ corrupted AFTER checkWorldStateUnchanged)';
        logger.verbose(`Iteration ${iteration}: corruption detected by ${caughtBy}`);
      }

      if (anyTreeCorrupted) {
        corruptionCount++;
        // Early exit - bug exists, no need to continue
        // Always cancel simulation for clean test shutdown (prevent crash during afterEach)
        await realSimulator.cancel(1000);
        logger.verbose(
          `Early exit: checkWorldStateUnchanged caught=${checkWorldStateUnchangedCaughtIt}, our check caught=true`,
        );
        return corruptionCount;
      }

      // Cancel simulation before next iteration or function end
      await realSimulator.cancel(1000);
    }

    return corruptionCount;
  }

  /**
   * PublicProcessor BUG - state corruption without cancellation.
   *
   * This demonstrates that without cancellation, C++ continues making writes after
   * PublicProcessor's timeout handling completes, corrupting state. This is the root
   * cause of CI failures like "Fork state reference changed by tx after error".
   */
  it('PublicProcessor BUG PROOF: state corruption occurs WITHOUT cancellation', async () => {
    const corruptionCount = await runPublicProcessorTimeoutTest(false, MAX_BUG_PROOF_ITERATIONS);
    logger.info(`State corruption detected in >0/${MAX_BUG_PROOF_ITERATIONS} iterations (expected: >0)`);
    // BUG - Without cancellation, C++ corrupts state after process() completes
    expect(corruptionCount).toBeGreaterThan(0);
  });

  /**
   * PublicProcessor FIX - no state corruption with cancellation.
   *
   * With cancellation, C++ stops before making corrupting writes.
   * State remains unchanged after process() returns.
   */
  it('PublicProcessor FIX PROOF: no state corruption WITH cancellation', async () => {
    const corruptionCount = await runPublicProcessorTimeoutTest(true, FIX_PROOF_ITERATIONS);
    logger.info(`State corruption detected in ${corruptionCount}/${FIX_PROOF_ITERATIONS} iterations (expected: 0)`);
    // FIX - With cancellation, state should remain unchanged
    expect(corruptionCount).toBe(0);
  });
});
