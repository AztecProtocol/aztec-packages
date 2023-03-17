import { ContractAbi } from '../../contract_abi.js';

const contractABI: ContractAbi = {
  functions: [
    {
      name: 'foo',
      isConstructor: false,
      isSecret: false,
      parameters: [
        {
          name: 'a',
          unpacked: false,
          type: {
            kind: 'field',
          },
        },
      ],
      returnTypes: [],
      bytecode: '0123',
      verificationKey: '1111',
    },
    {
      name: 'bar',
      isConstructor: false,
      isSecret: true,
      parameters: [],
      returnTypes: [],
      bytecode: '1234',
      verificationKey: '2222',
    },
    {
      name: 'baz',
      isConstructor: true,
      isSecret: false,
      parameters: [],
      returnTypes: [{ kind: 'field' }],
      bytecode: '2345',
      verificationKey: '3333',
    },
  ],
};

export default contractABI;
