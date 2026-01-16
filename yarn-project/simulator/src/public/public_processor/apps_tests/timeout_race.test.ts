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
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { TestDateProvider } from '@aztec/foundation/timer';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { MerkleTreeId, merkleTreeIds } from '@aztec/stdlib/trees';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';

import { Opcode } from '../../avm/serialization/instruction_serialization.js';
import { deployCustomBytecode } from '../../fixtures/custom_bytecode_tester.js';
import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { SPAM_CONFIGS, type SpamConfig, createOpcodeSpamBytecode } from '../../fixtures/opcode_spammer.js';
import { PublicContractsDB } from '../../public_db_sources.js';
import { CppPublicTxSimulator } from '../../public_tx_simulator/cpp_public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

/**
 * SSTORE spammer - writes to PUBLIC_DATA_TREE.
 * Uses single contract with infinite loop (no per-TX limit when writing same slot).
 * Provides continuous writes with NO gaps - ideal for race condition detection.
 */
const SSTORE_SPAMMER = SPAM_CONFIGS[Opcode.SSTORE]![0]; // "Same slot (no limit)" variant

jest.setTimeout(120_000);

describe('PublicProcessor C++ Timeout Race Condition', () => {
  // BUG PROOF tests - this is the race condition and is flaky so we run more iterations
  const MAX_BUG_PROOF_ITERATIONS = 10;
  // FIX PROOF tests - just confirm that the fix always works
  const FIX_PROOF_ITERATIONS = 5;

  const logger = createLogger('public-processor-timeout-race');

  const admin = AztecAddress.fromNumber(42);

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
   * Uses SSTORE spamming to keep C++ constantly writing to PUBLIC_DATA_TREE.
   * SSTORE "Same slot" has NO per-TX limit, so it writes continuously without gaps.
   *
   * For the BUG proof: Don't call cancel() → C++ continues during reverts → corruption
   * For the FIX proof: Call cancel(100) → wait for C++ to stop → then revert → no corruption
   *
   * @param useCancellation - Whether to call cancel() before reverts
   * @param numIterations - Number of iterations to run
   * @param spammer - Which spammer config to use (defaults to SSTORE for continuous writes)
   */
  async function runRaceConditionTest(
    useCancellation: boolean,
    numIterations: number,
    spamConfig: SpamConfig = SSTORE_SPAMMER, // Default to SSTORE for continuous writes
  ): Promise<number> {
    let raceObservedCount = 0;

    const globals = GlobalVariables.empty();
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await worldStateService.fork();
    const contractsDB = new PublicContractsDB(contractDataSource);

    const simulator = new CppPublicTxSimulator(merkleTrees, contractsDB, globals);

    const tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, globals);
    await tester.setFeePayerBalance(admin);

    // Deploy spammer contract(s) based on configuration
    // Single contract: infinite loop of the target opcode until out of gas
    const bytecode = createOpcodeSpamBytecode(spamConfig);
    const contract = await deployCustomBytecode(bytecode, tester, `${spamConfig.label!}_Spammer`);
    const contractAddress = contract.address;
    const callArgs: Fr[] = [];

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
      await merkleTrees.createCheckpoint();

      // Create transaction that calls the spammer contract
      const tx = await tester.createTx(admin, [], [{ address: contractAddress, args: callArgs }]);

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

      // Revert checkpoint
      await merkleTrees.revertCheckpoint();

      // Clean up
      await merkleTrees.revertAllCheckpoints();

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
  it('CppPublicTxSimulator BUG PROOF: race condition exists WITHOUT cancellation', async () => {
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
  it('CppPublicTxSimulator FIX PROOF: no race condition WITH cancellation', async () => {
    const raceObservedCount = await runRaceConditionTest(true, FIX_PROOF_ITERATIONS);
    logger.info(`Race condition observed in ${raceObservedCount}/${FIX_PROOF_ITERATIONS} iterations (expected: 0)`);
    expect(raceObservedCount).toBe(0);
  });

  /**
   * Helper to run PublicProcessor timeout test (Level 3).
   * Both BUG and FIX tests use IDENTICAL code - the ONLY difference is whether
   * cancel() method exists on the simulator.
   *
   * Uses SSTORE spamming to keep C++ constantly writing to PUBLIC_DATA_TREE.
   * SSTORE "Same slot" has NO per-TX limit, so it writes continuously without gaps.
   * This is more reliable than EMITNULLIFIER which has a cyclic 63-emit-then-REVERT pattern.
   *
   * For the BUG proof: cancel is undefined → PublicProcessor can't wait for C++ → corruption
   * For the FIX proof: cancel exists → PublicProcessor awaits cancel(100) → C++ stops → no corruption
   *
   * Returns the number of times state corruption was observed.
   *
   * @param useCancellation - Whether to provide cancel() method to PublicProcessor
   * @param numIterations - Number of iterations to run
   * @param spammer - Which spammer config to use (defaults to SSTORE for continuous writes)
   */
  async function runPublicProcessorTimeoutTest(
    useCancellation: boolean,
    numIterations: number,
    spamConfig: SpamConfig = SSTORE_SPAMMER, // Default to SSTORE for continuous writes
  ): Promise<number> {
    let corruptionCount = 0;

    const globals = GlobalVariables.empty();
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    const merkleTrees = await worldStateService.fork();
    const contractsDB = new PublicContractsDB(contractDataSource);

    // Set up contracts and balances using a tester on the unguarded fork
    const tester = new PublicTxSimulationTester(merkleTrees, contractDataSource, globals);
    await tester.setFeePayerBalance(admin);

    // Deploy spammer contract(s) based on configuration
    // Single contract: infinite loop of the target opcode until out of gas
    const bytecode = createOpcodeSpamBytecode(spamConfig);
    const contract = await deployCustomBytecode(bytecode, tester, `${spamConfig.label!}_Spammer`);
    const contractAddress = contract.address;
    const callArgs: Fr[] = [];

    for (let iteration = 0; iteration < numIterations; iteration++) {
      // Create fresh guarded tree and processor for each iteration because
      // GuardedMerkleTreeOperations.stop() is called on timeout and can't be reused.
      const guardedMerkleTrees = new GuardedMerkleTreeOperations(merkleTrees);

      // Create the real C++ simulator
      const realSimulator = new CppPublicTxSimulator(guardedMerkleTrees, contractsDB, globals);

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
      );

      // Get initial state for trees we need to check
      const initialTreeInfo = new Map<MerkleTreeId, { size: bigint; root: Buffer }>();
      for (const treeId of merkleTreeIds()) {
        const info = await merkleTrees.getTreeInfo(treeId);
        initialTreeInfo.set(treeId, { size: info.size, root: info.root });
      }

      // Create transaction that calls the spammer contract
      const tx = await tester.createTx(admin, [], [{ address: contractAddress, args: callArgs }]);

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
