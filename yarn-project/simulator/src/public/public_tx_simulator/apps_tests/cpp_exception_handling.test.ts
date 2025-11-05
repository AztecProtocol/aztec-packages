import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('C++ Exception Handling during Public Tx Simulation', () => {
  const sender = AztecAddress.fromNumber(42);
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: PublicTxSimulationTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(
      worldStateService,
      /*globals=*/ undefined,
      /*metrics=*/ undefined,
      /*useCppSimulator=*/ true, // Use C++ simulator
    );
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

  afterEach(async () => {
    await worldStateService.close();
  });

  /**
   * Call assertion_failure function during setup, and expect C++ simulator to throw.
   */
  it('assertion failure during setup - C++ simulator should throw and TS should handle gracefully', async () => {
    // expect reject with SimulationError
    await expect(
      tester.simulateTx(
        sender,
        /*setupCalls=*/ [
          {
            address: avmTestContractInstance.address,
            fnName: 'assertion_failure',
            args: [],
          },
        ],
        /*appCalls=*/ [],
      ),
    ).rejects.toThrow(/C\+\+ simulation failed.*SETUP/);
  }, 30_000);
});
