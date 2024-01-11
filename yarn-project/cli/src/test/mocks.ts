import { ABIParameterVisibility, ContractArtifact, FunctionType } from '@aztec/foundation/abi';


export const mockContractArtifact: ContractArtifact = {
  name: 'MockContract',
  functions: [
    {
      name: 'constructor',
      functionType: 'secret',
      isInternal: false,
      parameters: [
        {
          name: 'constructorParam1',
          type: {
            kind: 'field',
          },
          visibility: 'secret',
        },
      ],
      returnTypes: [],
      bytecode: 'constructorBytecode',
    },
    {
      name: 'mockFunction',
      functionType: 'secret',
      isInternal: false,
      parameters: [
        {
          name: 'fieldParam',
          type: { kind: 'field' },
          visibility: 'secret',
        },
        {
          name: 'boolParam',
          type: { kind: 'boolean' },
          visibility: 'secret',
        },
        {
          name: 'integerParam',
          type: { kind: 'integer', sign: 'signed', width: 32 },
          visibility: 'secret',
        },
        {
          name: 'arrayParam',
          type: { kind: 'array', length: 3, type: { kind: 'field' } },
          visibility: 'secret',
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
          visibility: 'secret',
        },
      ],
      returnTypes: [{ kind: 'boolean' }],
      bytecode: 'mockBytecode',
    },
  ],
  events: [],
};