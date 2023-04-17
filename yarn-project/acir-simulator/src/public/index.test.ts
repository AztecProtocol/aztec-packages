import { Grumpkin } from '@aztec/barretenberg.js/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg.js/wasm';
import { CallContext, FunctionData } from '@aztec/circuits.js';
import { AztecAddress, EthAddress, Fr } from '@aztec/foundation';
import { FunctionAbi } from '@aztec/noir-contracts';
import { PublicTokenContractAbi } from '@aztec/noir-contracts/examples';
import { MockProxy, mock } from 'jest-mock-extended';
import { default as memdown, type MemDown } from 'memdown';
import { encodeArguments } from '../arguments_encoder/index.js';
import { NoirPoint, computeSlot, toPublicKey } from '../utils.js';
import { PublicDB } from './db.js';
import { PublicExecution } from './execution.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

describe('ACIR public execution simulator', () => {
  let bbWasm: BarretenbergWasm;
  let oracle: MockProxy<PublicDB>;

  beforeAll(async () => {
    bbWasm = await BarretenbergWasm.get();
  });

  beforeEach(() => {
    oracle = mock<PublicDB>();
  });

  describe('PublicToken contract', () => {
    let ownerPk: Buffer;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let owner: NoirPoint;
    let recipientPk: Buffer;
    let recipient: NoirPoint;

    beforeAll(() => {
      ownerPk = Buffer.from('5e30a2f886b4b6a11aea03bf4910fbd5b24e61aa27ea4d05c393b3ab592a8d33', 'hex');
      recipientPk = Buffer.from('0c9ed344548e8f9ba8aa3c9f8651eaa2853130f6c1e9c050ccf198f7ea18a7ec', 'hex');

      const grumpkin = new Grumpkin(bbWasm);
      owner = toPublicKey(ownerPk, grumpkin);
      recipient = toPublicKey(recipientPk, grumpkin);
    });

    it('should run the mint function', async () => {
      const contractAddress = AztecAddress.random();
      const abi = PublicTokenContractAbi.functions.find(f => f.name === 'mint') as FunctionAbi;
      const functionData = new FunctionData(Buffer.alloc(4), false, false);
      const args = encodeArguments(abi, [140, recipient], false);

      const callContext = CallContext.from({
        msgSender: AztecAddress.random(),
        storageContractAddress: contractAddress,
        portalContractAddress: EthAddress.random(),
        isContractDeployment: false,
        isDelegateCall: false,
        isStaticCall: false,
      });

      // Mock the old value for the recipient balance to be 20
      const previousBalance = new Fr(20n);
      oracle.storageWrite.mockResolvedValue(previousBalance);
      oracle.storageRead.mockResolvedValue(previousBalance);

      const execution = new PublicExecution(oracle, abi, contractAddress, functionData, args, callContext);
      const result = await execution.run();

      const expectedBalance = new Fr(160n);
      expect(result.returnValues).toEqual([expectedBalance]);

      const storageSlot = computeSlot(new Fr(1n), recipient, bbWasm);
      expect(oracle.storageRead).toHaveBeenCalledWith(contractAddress, storageSlot);
      expect(oracle.storageWrite).toHaveBeenCalledWith(contractAddress, storageSlot, expectedBalance);

      expect(result.stateReads).toEqual([{ storageSlot: storageSlot, value: previousBalance }]);
      expect(result.stateTransitions).toEqual([{ storageSlot, oldValue: previousBalance, newValue: expectedBalance }]);
    });
  });
});
