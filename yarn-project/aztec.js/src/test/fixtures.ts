import { MEGA_VK_LENGTH_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { DEV_VERSION } from '@aztec/foundation/version';
import { type ContractArtifact, FunctionType } from '@aztec/stdlib/abi';

/**
 * A minimal but representative `ContractArtifact` shared by unit tests in this package. Covers
 * every function shape the tests exercise: a private initializer (`constructor`), the standard
 * `public_dispatch` entry, a private function with mixed-visibility params (`bar`), a utility
 * function (`qux`), and two functions exercising Noir `Option<Field>` parameters (`optionEcho`,
 * `mixedParams`).
 *
 * We deliberately do not depend on `@aztec/noir-test-contracts.js` here: that package depends on
 * `@aztec/aztec.js`, so importing from it would create a workspace cycle.
 */
export const testContractArtifact: ContractArtifact = {
  name: 'TestContract',
  aztecVersion: DEV_VERSION,
  functions: [
    {
      name: 'constructor',
      isInitializer: true,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      debugSymbols: '',
      parameters: [],
      returnTypes: [],
      errorTypes: {},
      bytecode: Buffer.alloc(8, 0xfa),
      verificationKey: Buffer.alloc(MEGA_VK_LENGTH_IN_FIELDS * Fr.SIZE_IN_BYTES).toString('base64'),
    },
    {
      name: 'public_dispatch',
      isInitializer: false,
      isStatic: false,
      functionType: FunctionType.PUBLIC,
      isOnlySelf: false,
      parameters: [{ name: 'selector', type: { kind: 'field' }, visibility: 'public' }],
      returnTypes: [],
      errorTypes: {},
      bytecode: Buffer.alloc(8, 0xfb),
      debugSymbols: '',
    },
    {
      name: 'bar',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      debugSymbols: '',
      parameters: [
        { name: 'value', type: { kind: 'field' }, visibility: 'public' },
        { name: 'value', type: { kind: 'field' }, visibility: 'private' },
      ],
      returnTypes: [],
      errorTypes: {},
      bytecode: Buffer.alloc(8, 0xfa),
      verificationKey: Buffer.alloc(MEGA_VK_LENGTH_IN_FIELDS * Fr.SIZE_IN_BYTES).toString('base64'),
    },
    {
      name: 'qux',
      isInitializer: false,
      isStatic: false,
      functionType: FunctionType.UTILITY,
      isOnlySelf: false,
      parameters: [{ name: 'value', type: { kind: 'field' }, visibility: 'public' }],
      returnTypes: [{ kind: 'integer', sign: 'unsigned', width: 32 }],
      bytecode: Buffer.alloc(8, 0xfc),
      debugSymbols: '',
      errorTypes: {},
    },
    {
      name: 'optionEcho',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'value',
          type: {
            kind: 'struct',
            path: 'std::option::Option',
            fields: [
              { name: '_is_some', type: { kind: 'boolean' } },
              { name: '_value', type: { kind: 'field' } },
            ],
          },
          visibility: 'private',
        },
      ],
      returnTypes: [],
      errorTypes: {},
      bytecode: Buffer.alloc(8, 0xfd),
      verificationKey: Buffer.alloc(MEGA_VK_LENGTH_IN_FIELDS * Fr.SIZE_IN_BYTES).toString('base64'),
      debugSymbols: '',
    },
    {
      name: 'mixedParams',
      isInitializer: false,
      functionType: FunctionType.PRIVATE,
      isOnlySelf: false,
      isStatic: false,
      parameters: [
        {
          name: 'optValue',
          type: {
            kind: 'struct',
            path: 'std::option::Option',
            fields: [
              { name: '_is_some', type: { kind: 'boolean' } },
              { name: '_value', type: { kind: 'field' } },
            ],
          },
          visibility: 'private',
        },
        { name: 'aField', type: { kind: 'field' }, visibility: 'private' },
      ],
      returnTypes: [],
      errorTypes: {},
      bytecode: Buffer.alloc(8, 0xfe),
      verificationKey: Buffer.alloc(MEGA_VK_LENGTH_IN_FIELDS * Fr.SIZE_IN_BYTES).toString('base64'),
      debugSymbols: '',
    },
  ],
  nonDispatchPublicFunctions: [],
  outputs: { structs: {}, globals: {} },
  fileMap: {},
  storageLayout: {},
};
