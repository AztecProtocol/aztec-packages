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
import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { FunctionAbi } from '@aztec/noir-contracts';
import { TestContractAbi, ZkTokenContractAbi } from '@aztec/noir-contracts/examples';
import { DBOracle } from './db_oracle.js';
import { AcirSimulator } from './simulator.js';
import { jest } from '@jest/globals';
import { randomBytes, toBigIntBE } from '@aztec/foundation';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';

type NoirPoint = {
  x: bigint;
  y: bigint;
};

describe('ACIR simulator', () => {
  let bbWasm: BarretenbergWasm;

  const oracle = {
    getNotes: jest.fn(),
    getSecretKey: jest.fn(),
    getBytecode: jest.fn(),
    getPortalContractAddress: jest.fn(),
  };
  const acirSimulator = new AcirSimulator(oracle as unknown as DBOracle);

  const oldRoots = new OldTreeRoots(new Fr(0n), new Fr(0n), new Fr(0n), new Fr(0n));

  beforeAll(async () => {
    bbWasm = await BarretenbergWasm.new();
  });

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
    let currentNonce = 0n;
    const SIBLING_PATH_SIZE = 5;

    function buildNote(amount: bigint, owner: NoirPoint, isDummy = false) {
      return [
        new Fr(amount),
        new Fr(owner.x),
        new Fr(owner.y),
        new Fr(4n),
        new Fr(currentNonce++),
        new Fr(isDummy ? 1n : 0n),
      ];
    }

    function toPublicKey(privateKey: Buffer, grumpkin: Grumpkin): NoirPoint {
      const publicKey = grumpkin.mul(Grumpkin.generator, privateKey);
      return {
        x: toBigIntBE(publicKey.slice(0, 32)),
        y: toBigIntBE(publicKey.slice(32, 64)),
      };
    }

    const contractDeploymentData = new ContractDeploymentData(Fr.ZERO, Fr.ZERO, Fr.ZERO, EthAddress.ZERO);
    const txContext = new TxContext(false, false, false, contractDeploymentData);

    it.only('should run the transfer function', async () => {
      const grumpkin = new Grumpkin(bbWasm);

      const amountToTransfer = 100n;
      const ownerPk = randomBytes(32);
      const recipientPk = randomBytes(32);

      const owner = toPublicKey(ownerPk, grumpkin);
      const recipient = toPublicKey(recipientPk, grumpkin);

      oracle.getNotes.mockReturnValue(
        Promise.resolve([
          {
            note: buildNote(60n, owner),
            siblingPath: new Array(SIBLING_PATH_SIZE).fill(new Fr(3n)),
            index: 42,
          },
          {
            note: buildNote(60n, owner),
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
        [amountToTransfer, owner, recipient],
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
