import {
  ARGS_LENGTH,
  AztecAddress,
  ContractDeploymentData,
  EthAddress,
  Fr,
  FunctionData,
  NEW_COMMITMENTS_LENGTH,
  OldTreeRoots,
  TxContext,
  TxRequest,
} from '@aztec/circuits.js';
import { FunctionAbi } from '@aztec/noir-contracts';
import { TestContractAbi } from '@aztec/noir-contracts/examples';
import { DBOracle } from './db_oracle.js';
import { AcirSimulator } from './simulator.js';

describe('ACIR simulator', () => {
  describe('constructors', () => {
    const contractDeploymentData = new ContractDeploymentData(Fr.random(), Fr.random(), Fr.random(), EthAddress.ZERO);
    const txContext = new TxContext(false, false, true, contractDeploymentData);
    const oldRoots = new OldTreeRoots(new Fr(0n), new Fr(0n), new Fr(0n), new Fr(0n));

    it('should run the empty constructor', async () => {
      const acirSimulator = new AcirSimulator({} as DBOracle);

      const txRequest = new TxRequest(
        AztecAddress.random(),
        AztecAddress.ZERO,
        new FunctionData(0, true, true),
        new Array(ARGS_LENGTH).fill(new Fr(0n)),
        Fr.random(),
        txContext,
        new Fr(0n),
      );
      const result = await acirSimulator.run(
        txRequest,
        TestContractAbi.functions[0] as FunctionAbi,
        AztecAddress.ZERO,
        EthAddress.ZERO,
        oldRoots,
      );

      expect(result.callStackItem.publicInputs.newCommitments).toEqual(
        new Array(NEW_COMMITMENTS_LENGTH).fill(new Fr(0n)),
      );
    });
  });
});
