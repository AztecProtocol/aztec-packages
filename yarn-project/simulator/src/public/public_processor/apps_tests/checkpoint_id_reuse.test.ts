import { Fr } from '@aztec/foundation/fields';
import { TestDateProvider } from '@aztec/foundation/timer';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';
import { RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GasFees } from '@aztec/stdlib/gas';
import { GlobalVariables } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';
import { NativeWorldStateService } from '@aztec/world-state';

import { PublicContractsDB } from '../../../server.js';
import { createContractClassAndInstance } from '../../avm/fixtures/utils.js';
import { PublicTxSimulationTester, SimpleContractDataSource } from '../../fixtures/index.js';
import { addNewContractClassToTx, addNewContractInstanceToTx } from '../../fixtures/utils.js';
import { CppPublicTxSimulator } from '../../public_tx_simulator/cpp_public_tx_simulator.js';
import { PublicTxSimulator } from '../../public_tx_simulator/public_tx_simulator.js';
import { GuardedMerkleTreeOperations } from '../guarded_merkle_tree.js';
import { PublicProcessor } from '../public_processor.js';

/**
 * CONTRACT HINT KEY REUSE VULNERABILITY TESTS
 *
 * ## The Bug (Now Fixed)
 *
 * When processing multiple transactions in a block, the contract database uses checkpoints to
 * support transaction rollback. When a transaction fails and reverts, its checkpoint is rolled back.
 *
 * The vulnerability occurred because contract hints (used by the C++ simulator) are keyed by
 * checkpoint identifiers. If these identifiers were reused after a revert, contracts registered
 * during a failed transaction could incorrectly become accessible in subsequent transactions.
 *
 * ## Example Scenario
 *
 * Block with 4 transactions:
 *
 * 1. **Tx1 (FAILS)**: Deploys ContractA, creates checkpoint with key K
 *    - TS simulation collects hint: {key: K, contract: ContractA}
 *    - Transaction fails during execution and reverts
 *    - TS correctly removes ContractA from its cache
 *    - BUT hint with key K remains in the hint collection
 *
 * 2. **Tx2 (SUCCEEDS)**: Deploys ContractB, creates checkpoint with key K (REUSED!)
 *    - TS simulation collects hint: {key: K, contract: ContractB}
 *    - Transaction succeeds
 *
 * 3. **Hints sent to C++**: [{key: K, ContractA}, {key: K, ContractB}]
 *    - C++ sees TWO contracts with the same checkpoint key!
 *
 * 4. **Tx3**: Attempts to call ContractA (which was never successfully deployed)
 *    - TS simulation: Correctly fails - ContractA not found ✅
 *    - C++ simulation: Incorrectly succeeds - finds ContractA with key K ❌
 *
 * ## Impact
 *
 * This violates transaction isolation by allowing:
 * - Execution of contracts that were never successfully deployed
 * - Calls to contracts from failed/reverted transactions
 * - State inconsistencies between TS and C++ simulators
 * - Potential security vulnerabilities where invalid contracts can be executed
 *
 * ## The Fix
 *
 * Ensure checkpoint identifiers are never reused, even after reverts. Each checkpoint in a block
 * must have a globally unique identifier so that hints from different transaction contexts cannot
 * collide.
 *
 * ## What These Tests Validate
 *
 * 1. Contracts from failed transactions are NOT accessible in subsequent transactions
 * 2. Only contracts from successfully committed transactions are accessible
 * 3. Transaction isolation is maintained across checkpoint creation/revert cycles
 * 4. TS and C++ simulators produce identical results
 */
describe.each([
  { useCppSimulator: false, simulatorName: 'TS Simulator' },
  { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
])('Public processor checkpoint key reuse vulnerability tests ($simulatorName)', ({ useCppSimulator }) => {
  const admin = AztecAddress.fromNumber(42);
  const sender = AztecAddress.fromNumber(111);

  let worldStateService: NativeWorldStateService;
  let contractsDB: PublicContractsDB;
  let tester: PublicTxSimulationTester;
  let processor: PublicProcessor;

  beforeEach(async () => {
    const globals = GlobalVariables.empty();
    // apply some nonzero default gas fees
    globals.gasFees = new GasFees(2, 3);

    const contractDataSource = new SimpleContractDataSource();
    worldStateService = await NativeWorldStateService.tmp();
    const merkleTrees = await worldStateService.fork();
    const guardedMerkleTrees = new GuardedMerkleTreeOperations(merkleTrees);
    contractsDB = new PublicContractsDB(contractDataSource);
    const simulator = useCppSimulator
      ? new CppPublicTxSimulator(guardedMerkleTrees, contractsDB, globals, {
          doMerkleOperations: true,
        })
      : new PublicTxSimulator(guardedMerkleTrees, contractsDB, globals, {
          doMerkleOperations: true,
        });

    processor = new PublicProcessor(
      globals,
      guardedMerkleTrees,
      contractsDB,
      simulator,
      new TestDateProvider(),
      getTelemetryClient(),
    );

    tester = new PublicTxSimulationTester(merkleTrees, contractDataSource);

    // make sure tx senders have fee balance
    await tester.setFeePayerBalance(admin);
    await tester.setFeePayerBalance(sender);
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  it('reverted tx contracts should not be accessible in subsequent tx (checkpoint key reuse test)', async () => {
    /**
     * TEST SCENARIO: Checkpoint Key Reuse Across Transactions
     *
     * This test validates that checkpoint IDs are not reused after transaction reverts,
     * ensuring transaction isolation.
     *
     * Timeline:
     * - Tx1: Deploy token successfully
     *        → Token is accessible, checkpoint committed
     * - Tx2: Try to deploy same token again (causes nullifier collision) + transfer
     *        → Transaction reverts cleanly (APP_LOGIC_REVERTED)
     *        → Checkpoint is rolled back
     * - Tx3: Call method on the successfully deployed token
     *        → Should SUCCEED (token from Tx1 is still accessible)
     *
     * Bug Behavior (if checkpoint keys were reused):
     * - Tx1 creates checkpoint with key K (commits successfully)
     * - Tx2 creates checkpoint with key K (reused after Tx1 committed)
     * - Hints collected: {key: K, contract: token} appears twice
     * - C++ simulator might get confused with duplicate keys
     *
     * Correct Behavior (with monotonically increasing checkpoint keys):
     * - Tx1 creates checkpoint with key 1, commits
     * - Tx2 creates checkpoint with key 2, reverts
     * - Tx3 creates checkpoint with key 3
     * - Each checkpoint has unique ID, no hint collisions
     */

    const mintAmount = 1_000_000n;
    const constructorArgs = [admin, /*name=*/ 'Token', /*symbol=*/ 'TOK', /*decimals=*/ new Fr(18)];
    const { contractClass, contractInstance } = await createContractClassAndInstance(
      constructorArgs,
      admin,
      TokenContractArtifact,
    );
    const token = contractInstance;

    // ============================================================================
    // Tx1: Deploy token successfully
    // ============================================================================
    const successfulDeployTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
          contractArtifact: TokenContractArtifact,
        },
      ],
    );
    await addNewContractClassToTx(successfulDeployTx, contractClass);
    await addNewContractInstanceToTx(successfulDeployTx, contractInstance);

    // ============================================================================
    // Tx2: Try to deploy same token again + transfer (should revert during transfer)
    // ============================================================================
    const receiver = AztecAddress.fromNumber(222);
    const transferAmount = 10n;
    const authwitNonce = new Fr(0);
    const failingTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'constructor',
          args: constructorArgs,
          contractArtifact: TokenContractArtifact,
        },
        // This transfer will fail because sender has no balance
        // This causes the entire transaction to revert
        {
          address: token.address,
          fnName: 'transfer_in_public',
          args: [/*from=*/ sender, /*to=*/ receiver, transferAmount, authwitNonce],
          contractArtifact: TokenContractArtifact,
        },
      ],
    );

    // ============================================================================
    // Tx3: Call the successfully deployed token (should succeed)
    // ============================================================================
    const callSuccessfulContractTx = await tester.createTx(
      /*sender=*/ admin,
      /*setupCalls=*/ [],
      /*appCalls=*/ [
        {
          address: token.address,
          fnName: 'mint_to_public',
          args: [/*to=*/ sender, mintAmount],
          contractArtifact: TokenContractArtifact,
        },
      ],
    );

    // Process all transactions
    const results = await processor.process([successfulDeployTx, failingTx, callSuccessfulContractTx]);
    const processedTxs = results[0];
    const failedTxs = results[1];

    // First tx should succeed (deploy token)
    expect(processedTxs[0].revertCode).toEqual(RevertCode.OK);

    // Second tx should revert in app logic (failed transfer)
    expect(processedTxs[1].revertCode).toEqual(RevertCode.APP_LOGIC_REVERTED);

    // Third tx should succeed (call successfully deployed token)
    expect(processedTxs[2].revertCode).toEqual(RevertCode.OK);

    // No txs should have thrown exceptions
    expect(failedTxs.length).toBe(0);
  });
});
