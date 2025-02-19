import {
  AztecAddress,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  FunctionSelector,
} from '@aztec/circuits.js';
import { makeContractClassPublic, makeContractInstanceFromClassId } from '@aztec/circuits.js/testing';
import { PUBLIC_DISPATCH_SELECTOR } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js/AvmTest';
import { type ProtocolContract } from '@aztec/protocol-contracts';
import { FeeJuiceArtifact, getCanonicalFeeJuice } from '@aztec/protocol-contracts/fee-juice';
import { getAvmTestContractBytecode } from '@aztec/simulator/public/fixtures';

import { AvmProvingTester } from './avm_proving_tester.js';

const TIMEOUT = 300_000;
const DISPATCH_FN_NAME = 'public_dispatch';
const DISPATCH_SELECTOR = new FunctionSelector(PUBLIC_DISPATCH_SELECTOR);

describe('AVM WitGen & Circuit – public fee payment', () => {
  const sender = AztecAddress.fromNumber(42);
  const feePayer = sender;

  const initialFeeJuiceBalance = new Fr(20000);
  let feeJuice: ProtocolContract;
  let feeJuiceContractClassPublic: ContractClassPublic;

  const avmTestContractClassSeed = 0;
  const avmTestContractBytecode = getAvmTestContractBytecode(DISPATCH_FN_NAME);
  let avmTestContractClass: ContractClassPublic;
  let avmTestContractInstance: ContractInstanceWithAddress;
  let tester: AvmProvingTester;

  beforeEach(async () => {
    feeJuice = await getCanonicalFeeJuice();
    feeJuiceContractClassPublic = {
      ...feeJuice.contractClass,
      privateFunctions: [],
      unconstrainedFunctions: [],
    };
    avmTestContractClass = await makeContractClassPublic(
      /*seed=*/ avmTestContractClassSeed,
      /*publicDispatchFunction=*/ { bytecode: avmTestContractBytecode, selector: DISPATCH_SELECTOR },
    );
    avmTestContractInstance = await makeContractInstanceFromClassId(
      avmTestContractClass.id,
      /*seed=*/ avmTestContractClassSeed,
    );
    tester = await AvmProvingTester.create(/*checkCircuitOnly*/ true);
    await tester.addContractClass(feeJuiceContractClassPublic, FeeJuiceArtifact);
    await tester.addContractInstance(feeJuice.instance);
    await tester.addContractClass(avmTestContractClass, AvmTestContractArtifact);
    await tester.addContractInstance(avmTestContractInstance);
    await tester.setFeePayerBalance(feePayer, initialFeeJuiceBalance);
  });
  it(
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
