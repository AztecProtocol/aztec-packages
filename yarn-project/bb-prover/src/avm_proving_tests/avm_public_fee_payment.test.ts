import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-test-contracts.js/AvmTest';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;

describe('AVM WitGen & Circuit – public fee payment', () => {
  const sender = AztecAddress.fromNumber(42);
  const feePayer = sender;

  const initialFeeJuiceBalance = new Fr(20000);
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    tester = await AvmProvingTester.new(/*checkCircuitOnly*/ true);

    await tester.registerFeeJuiceContract();
    await tester.setFeePayerBalance(feePayer, initialFeeJuiceBalance);

    avmTestContractInstance = await tester.registerAndDeployContract(
      /*constructorArgs=*/ [],
      /*deployer=*/ AztecAddress.fromNumber(420),
      AvmTestContractArtifact,
    );
  });
  it.skip(
    'fee payment',
    async () => {
      await tester.simProveVerify(
        sender,
        /*setupCalls=*/ [],
        /*appCalls=*/ [
          { address: avmTestContractInstance.address, fnName: 'add_args_return', args: [new Fr(1), new Fr(2)] },
        ],
        /*teardownCall=*/ undefined,
        /*expectRevert=*/ false,
        feePayer,
      );
    },
    TIMEOUT,
  );
});
