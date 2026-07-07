import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { NativeWorldStateService } from '@aztec/world-state/native';

import { PublicTxSimulationTester } from '../../fixtures/public_tx_simulation_tester.js';

describe('AVM Error Propagation during Public Tx Simulation', () => {
  const sender = AztecAddress.fromNumber(42);
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: PublicTxSimulationTester;
  let worldStateService: NativeWorldStateService;

  beforeEach(async () => {
    worldStateService = await NativeWorldStateService.tmp();
    tester = await PublicTxSimulationTester.create(worldStateService, /*globals=*/ undefined, /*metrics=*/ undefined);
    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });

  afterEach(async () => {
    await tester.close();
    await worldStateService.close();
  });

  /**
   * Call assertion_failure function during setup. The AVM should detect the assertion
   * failure, revert the setup phase, and propagate the error back through IPC.
   */
  it('assertion failure during setup propagates as simulation error', async () => {
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
    ).rejects.toThrow(/simulation failed|AVM error|assertion/i);
  }, 30_000);
});
