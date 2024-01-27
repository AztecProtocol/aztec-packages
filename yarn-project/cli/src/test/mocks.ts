import { ABIParameterVisibility, ContractArtifact, FunctionType } from '@aztec/foundation/abi';

export const mockContractArtifact: ContractArtifact = {
  name: 'MockContract',
  functions: [
    {
      name: 'constructor',
      functionType: FunctionType.SECRET,
      isInternal: false,
      parameters: [
        {
          name: 'constructorParam1',
          type: {
            kind: 'field',
          },
          visibility: ABIParameterVisibility.SECRET,
        },
      ],
      returnTypes: [],
      bytecode: 'constructorBytecode',
      debugSymbols: '',
    },
    {
      name: 'mockFunction',
      functionType: FunctionType.SECRET,
      isInternal: false,
      parameters: [
        {
          name: 'fieldParam',
          type: { kind: 'field' },
          visibility: ABIParameterVisibility.SECRET,
        },
        {
          name: 'boolParam',
          type: { kind: 'boolean' },
          visibility: ABIParameterVisibility.SECRET,
        },
        {
          name: 'integerParam',
          type: { kind: 'integer', sign: 'signed', width: 32 },
          visibility: ABIParameterVisibility.SECRET,
        },
        {
          name: 'arrayParam',
          type: { kind: 'array', length: 3, type: { kind: 'field' } },
          visibility: ABIParameterVisibility.SECRET,
        },
        {
          name: 'structParam',
          type: {
            kind: 'struct',
            path: 'mystruct',
            fields: [
              { name: 'subField1', type: { kind: 'field' } },
              { name: 'subField2', type: { kind: 'boolean' } },
            ],
          },
          visibility: ABIParameterVisibility.SECRET,
        },
      ],
      returnTypes: [{ kind: 'boolean' }],
      bytecode: 'mockBytecode',
      debugSymbols: '',
    },
  ],
  events: [],
  fileMap: {},
};
