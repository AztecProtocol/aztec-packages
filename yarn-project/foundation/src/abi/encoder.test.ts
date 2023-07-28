import { ABIParameterVisibility, FunctionAbi, FunctionType } from './abi.js';
import { encodeArguments } from './encoder.js';

describe('abi/encoder', () => {
  it('throws when passing string argument as field', async () => {
    const testFunctionAbi: FunctionAbi = {
      name: 'constructor',
      functionType: FunctionType.SECRET,
      isInternal: false,
      parameters: [
        {
          name: 'owner',
          type: {
            kind: 'field',
          },
          visibility: ABIParameterVisibility.SECRET,
        },
      ],
      returnTypes: [],
      bytecode: '',
      verificationKey: '',
    };
    const args = ['garbage'];

    expect(() => encodeArguments(testFunctionAbi, args)).toThrowError('Invalid argument "garbage" of type field');
  });
});
