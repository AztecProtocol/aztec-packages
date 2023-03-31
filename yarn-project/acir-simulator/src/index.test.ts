import {
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
import { TestContractAbi, ZkTokenContractAbi } from '@aztec/noir-contracts/examples';
import { DBOracle } from './db_oracle.js';
import { AcirSimulator } from './simulator.js';
import { jest } from '@jest/globals';

describe('ACIR simulator', () => {
  const oracle = {
    getNotes: jest.fn(),
    getSecretKey: jest.fn(),
    getBytecode: jest.fn(),
    getPortalContractAddress: jest.fn(),
  };
  const acirSimulator = new AcirSimulator(oracle as unknown as DBOracle);

  const oldRoots = new OldTreeRoots(new Fr(0n), new Fr(0n), new Fr(0n), new Fr(0n));

  describe('constructors', () => {
    const contractDeploymentData = new ContractDeploymentData(Fr.random(), Fr.random(), Fr.random(), EthAddress.ZERO);
    const txContext = new TxContext(false, false, true, contractDeploymentData);

    it('should run the empty constructor', async () => {
      const txRequest = new TxRequest(
        AztecAddress.random(),
        AztecAddress.ZERO,
        new FunctionData(Buffer.alloc(4), true, true),
        [],
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

    it('should a constructor with arguments that creates notes', async () => {
      const txRequest = new TxRequest(
        AztecAddress.random(),
        AztecAddress.ZERO,
        new FunctionData(Buffer.alloc(4), true, true),
        [
          27n,
          {
            x: 42n,
            y: 28n,
          },
        ],
        Fr.random(),
        txContext,
        new Fr(0n),
      );
      const result = await acirSimulator.run(
        txRequest,
        ZkTokenContractAbi.functions[0] as unknown as FunctionAbi,
        AztecAddress.ZERO,
        EthAddress.ZERO,
        oldRoots,
      );

      expect(result.preimages.newNotes).toHaveLength(1);
      expect(result.callStackItem.publicInputs.newCommitments.filter(field => !field.equals(Fr.ZERO))).toHaveLength(1);
    });
  });

  describe('transfer', () => {
    const SIBLING_PATH_SIZE = 5;
    const PREIMAGE_FIELD_COUNT = 6;
    const contractDeploymentData = new ContractDeploymentData(Fr.ZERO, Fr.ZERO, Fr.ZERO, EthAddress.ZERO);
    const txContext = new TxContext(false, false, false, contractDeploymentData);

    it.skip('should run the transfer function', async () => {
      oracle.getNotes.mockReturnValue(
        Promise.resolve([
          {
            note: new Array(PREIMAGE_FIELD_COUNT).fill(new Fr(0n)),
            siblingPath: new Array(SIBLING_PATH_SIZE).fill(new Fr(1n)),
            index: 27,
          },
          {
            note: new Array(PREIMAGE_FIELD_COUNT).fill(new Fr(2n)),
            siblingPath: new Array(SIBLING_PATH_SIZE).fill(new Fr(3n)),
            index: 42,
          },
        ]),
      );

      oracle.getSecretKey.mockReturnValue(Promise.resolve(Buffer.alloc(32)));

      const txRequest = new TxRequest(
        AztecAddress.random(),
        AztecAddress.random(),
        new FunctionData(Buffer.alloc(4), true, true),
        [
          27n,
          {
            x: 42n,
            y: 28n,
          },
        ],
        Fr.random(),
        txContext,
        new Fr(0n),
      );

      const result = await acirSimulator.run(
        txRequest,
        ZkTokenContractAbi.functions.find(f => f.name === 'transfer') as unknown as FunctionAbi,
        AztecAddress.random(),
        EthAddress.ZERO,
        oldRoots,
      );

      console.log(result);
    });
  });
});
