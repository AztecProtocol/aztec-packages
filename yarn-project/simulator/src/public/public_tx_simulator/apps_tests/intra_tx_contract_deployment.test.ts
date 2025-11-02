import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { createContractClassAndInstance } from '../../avm/fixtures/utils.js';
import { PublicTxSimulationTester, type TestEnqueuedCall } from '../../fixtures/public_tx_simulation_tester.js';
import { SimpleContractDataSource } from '../../fixtures/simple_contract_data_source.js';
import { PublicContractsDB } from '../../public_db_sources.js';

/**
 * Tests for the addContracts functionality that allows contracts to be
 * dynamically added to the contract DB during transaction execution.
 *
 * This is critical for supporting contracts that are deployed and called
 * within the same transaction.
 */
describe.each([
  { useCppSimulator: false, simulatorName: 'TS Simulator' },
  { useCppSimulator: true, simulatorName: 'Cpp Simulator' },
])('Contract DB addContracts Tests ($simulatorName)', ({ useCppSimulator }) => {
  const logger = createLogger('contracts-db-tests');

  let worldStateService: NativeWorldStateService;
  let simTester: PublicTxSimulationTester;
  let deployer: AztecAddress;
  let contractDataSource: SimpleContractDataSource;
  let contractsDB: PublicContractsDB;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    simTester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined,
      /*metrics=*/ undefined,
      useCppSimulator,
    );
    deployer = await AztecAddress.random();

    // Get access to the contract data source and DB for direct testing
    contractDataSource = simTester.contractDataSource as SimpleContractDataSource;
    contractsDB = new PublicContractsDB(contractDataSource);
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  /**
   * Test 1: Add contract via addContracts and verify it can be retrieved
   */
  it('should add contract class and instance via addContracts', async () => {
    logger.info('Test: Add contracts via addContracts()');

    const { contractClass, contractInstance } = await createContractClassAndInstance(
      [], // constructor args
      deployer,
      AvmTestContractArtifact,
      /*seed=*/ 1,
      /*contractClassSeed=*/ 1,
    );

    // Add contracts using the addContracts method
    await contractsDB.addContracts([contractClass], [contractInstance]);

    // Verify the contract class can be retrieved
    const retrievedClass = await contractsDB.getContractClass(contractClass.id);
    expect(retrievedClass).toBeDefined();
    expect(retrievedClass!.id.equals(contractClass.id)).toBe(true);

    // Verify the contract instance can be retrieved
    const retrievedInstance = await contractsDB.getContractInstance(contractInstance.address, Fr.ZERO);
    expect(retrievedInstance).toBeDefined();
    expect(retrievedInstance!.address.equals(contractInstance.address)).toBe(true);

    logger.info('✓ Successfully added and retrieved contracts');
  });

  /**
   * Test 2: Add contract and immediately call it in a transaction
   */
  it('should add contract and call it immediately', async () => {
    logger.info('Test: Add contract and call it immediately');

    const { contractClass, contractInstance } = await createContractClassAndInstance(
      [],
      deployer,
      AvmTestContractArtifact,
      /*seed=*/ 2,
      /*contractClassSeed=*/ 2,
    );

    // Add the contract to make it available
    await contractsDB.addContracts([contractClass], [contractInstance]);

    // Also add to the contract data source so the artifact is available for execution
    await contractDataSource.addNewContract(AvmTestContractArtifact, contractClass, contractInstance);

    // Register the contract instance in the world state (simulate deployment nullifier)
    await simTester.insertContractAddressNullifier(contractInstance.address);

    // Create a call to the newly added contract
    const appCalls: TestEnqueuedCall[] = [
      {
        address: contractInstance.address,
        fnName: 'add_args_return',
        args: [new Fr(10), new Fr(20)],
        contractArtifact: AvmTestContractArtifact,
      },
    ];

    const result = await simTester.simulateTx(
      deployer,
      /*setupCalls=*/ [],
      appCalls,
      /*teardownCall=*/ undefined,
      deployer,
      /*privateInsertions=*/ undefined,
      'add-and-call',
    );

    expect(result.revertCode.isOK()).toBe(true);
    logger.info('✓ Successfully added and called contract');
  });

  /**
   * Test 3: Test checkpoint functionality with addContracts
   */
  it('should handle checkpoints with addContracts', async () => {
    logger.info('Test: Checkpoint flow with addContracts');

    const { contractClass: class1, contractInstance: instance1 } = await createContractClassAndInstance(
      [],
      deployer,
      AvmTestContractArtifact,
      /*seed=*/ 3,
      /*contractClassSeed=*/ 3,
    );

    const { contractClass: class2, contractInstance: instance2 } = await createContractClassAndInstance(
      [],
      deployer,
      AvmTestContractArtifact,
      /*seed=*/ 4,
      /*contractClassSeed=*/ 4,
    );

    // Add first contract (block-level)
    await contractsDB.addContracts([class1], [instance1]);

    // Verify first contract is available
    let retrieved = await contractsDB.getContractClass(class1.id);
    expect(retrieved).toBeDefined();

    // Create checkpoint
    contractsDB.createCheckpoint();

    // Add second contract (checkpoint-level)
    await contractsDB.addContracts([class2], [instance2]);

    // Verify both contracts are available
    retrieved = await contractsDB.getContractClass(class1.id);
    expect(retrieved).toBeDefined();
    retrieved = await contractsDB.getContractClass(class2.id);
    expect(retrieved).toBeDefined();

    // Revert checkpoint
    contractsDB.revertCheckpoint();

    // Verify first contract is still available
    retrieved = await contractsDB.getContractClass(class1.id);
    expect(retrieved).toBeDefined();

    // Verify second contract is no longer available
    retrieved = await contractsDB.getContractClass(class2.id);
    expect(retrieved).toBeUndefined();

    logger.info('✓ Checkpoint flow worked correctly');
  });

  /**
   * Test 4: Test commit checkpoint with addContracts
   */
  it('should commit checkpoint with addContracts', async () => {
    logger.info('Test: Commit checkpoint with addContracts');

    const { contractClass: class1, contractInstance: instance1 } = await createContractClassAndInstance(
      [],
      deployer,
      AvmTestContractArtifact,
      /*seed=*/ 5,
      /*contractClassSeed=*/ 5,
    );

    const { contractClass: class2, contractInstance: instance2 } = await createContractClassAndInstance(
      [],
      deployer,
      AvmTestContractArtifact,
      /*seed=*/ 6,
      /*contractClassSeed=*/ 6,
    );

    // Add first contract
    await contractsDB.addContracts([class1], [instance1]);

    // Create checkpoint
    contractsDB.createCheckpoint();

    // Add second contract in checkpoint
    await contractsDB.addContracts([class2], [instance2]);

    // Commit checkpoint
    contractsDB.commitCheckpoint();

    // Verify both contracts are still available after commit
    let retrieved = await contractsDB.getContractClass(class1.id);
    expect(retrieved).toBeDefined();
    retrieved = await contractsDB.getContractClass(class2.id);
    expect(retrieved).toBeDefined();

    logger.info('✓ Checkpoint commit worked correctly');
  });

  /**
   * Test 5: Add multiple contracts at once
   */
  it('should add multiple contracts at once', async () => {
    logger.info('Test: Add multiple contracts at once');

    const contracts = await Promise.all([
      createContractClassAndInstance([], deployer, AvmTestContractArtifact, 7, 7),
      createContractClassAndInstance([], deployer, AvmTestContractArtifact, 8, 8),
      createContractClassAndInstance([], deployer, AvmTestContractArtifact, 9, 9),
    ]);

    const classes = contracts.map(c => c.contractClass);
    const instances = contracts.map(c => c.contractInstance);

    // Add all contracts at once
    await contractsDB.addContracts(classes, instances);

    // Verify all contracts are available
    for (const contract of contracts) {
      const retrievedClass = await contractsDB.getContractClass(contract.contractClass.id);
      expect(retrievedClass).toBeDefined();
      expect(retrievedClass!.id.equals(contract.contractClass.id)).toBe(true);

      const retrievedInstance = await contractsDB.getContractInstance(contract.contractInstance.address, Fr.ZERO);
      expect(retrievedInstance).toBeDefined();
      expect(retrievedInstance!.address.equals(contract.contractInstance.address)).toBe(true);
    }

    logger.info('✓ Successfully added multiple contracts');
  });
});
