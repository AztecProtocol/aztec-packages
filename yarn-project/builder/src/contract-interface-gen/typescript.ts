import {
  type ABIParameter,
  type ABIVariable,
  type ContractArtifact,
  EventSelector,
  type FunctionAbi,
  decodeFunctionSignature,
  getAllFunctionAbis,
  getDefaultInitializer,
  isAztecAddressStruct,
  isBoundedVecStruct,
  isEthAddressStruct,
  isFunctionSelectorStruct,
  isWrappedFieldStruct,
} from '@aztec/stdlib/abi';

/**
 * Converts a Noir ABI type to its corresponding TypeScript type representation.
 *
 * @remarks
 * This function maps Noir's type system to TypeScript types that are compatible with
 * Aztec's contract interaction layer. The conversion handles:
 * - Primitive types (field, boolean, integer, string)
 * - Arrays and nested arrays
 * - Structs, including special Aztec types (addresses, function selectors)
 * - BoundedVec (converted to simple arrays for easier TypeScript usage)
 *
 * Special struct types recognized:
 * - `EthAddress` → `EthAddressLike`
 * - `AztecAddress` → `AztecAddressLike`
 * - `FunctionSelector` → `FunctionSelectorLike`
 * - `WrappedField` → `WrappedFieldLike`
 * - `BoundedVec<T>` → `T[]` (simplified for TypeScript)
 *
 * @param type - The Noir ABI parameter type to convert
 * @returns A TypeScript type string that can be used in generated code
 *
 * @example
 * ```typescript
 * // Noir field type becomes FieldLike
 * abiTypeToTypescript({ kind: 'field' }) // Returns: 'FieldLike'
 *
 * // Noir array becomes TypeScript array
 * abiTypeToTypescript({
 *   kind: 'array',
 *   type: { kind: 'integer' }
 * }) // Returns: '(bigint | number)[]'
 * ```
 */
function abiTypeToTypescript(type: ABIParameter['type']): string {
  switch (type.kind) {
    case 'field':
      return 'FieldLike';
    case 'boolean':
      return 'boolean';
    case 'integer':
      return '(bigint | number)';
    case 'string':
      return 'string';
    case 'array':
      return `${abiTypeToTypescript(type.type)}[]`;
    case 'struct':
      if (isEthAddressStruct(type)) {
        return 'EthAddressLike';
      }
      if (isAztecAddressStruct(type)) {
        return 'AztecAddressLike';
      }
      if (isFunctionSelectorStruct(type)) {
        return 'FunctionSelectorLike';
      }
      if (isWrappedFieldStruct(type)) {
        return 'WrappedFieldLike';
      }
      if (isBoundedVecStruct(type)) {
        // To make BoundedVec easier to work with, we expect a simple array on the input and then we encode it
        // as a BoundedVec in the ArgumentsEncoder.
        return `${abiTypeToTypescript(type.fields[0].type)}`;
      }
      return `{ ${type.fields.map(f => `${f.name}: ${abiTypeToTypescript(f.type)}`).join(', ')} }`;
    default:
      throw new Error(`Unknown type ${type.kind}`);
  }
}

/**
 * Generates TypeScript parameter declaration from a Noir ABI parameter.
 *
 * @remarks
 * Creates a typed parameter string suitable for use in function signatures.
 * The parameter name and type are both derived from the Noir ABI.
 *
 * @param param - A Noir ABI parameter with name and type information
 * @returns TypeScript parameter declaration (e.g., "amount: FieldLike")
 */
function generateParameter(param: ABIParameter) {
  return `${param.name}: ${abiTypeToTypescript(param.type)}`;
}

/**
 * Generates a TypeScript method signature for a contract function.
 *
 * @remarks
 * Creates a method signature with:
 * - JSDoc comment describing the function and its parameters
 * - Typed parameters matching the Noir function signature
 * - Return type of `ContractFunctionInteraction` for transaction building
 * - Access to the function's selector via `Pick<ContractMethod, 'selector'>`
 *
 * The generated methods are used to create type-safe contract interactions,
 * allowing developers to call contract functions with full TypeScript support.
 *
 * @param entry - The Noir function ABI information
 * @returns TypeScript method signature as a string
 */
function generateMethod(entry: FunctionAbi) {
  const args = entry.parameters.map(generateParameter).join(', ');
  return `
    /** ${entry.name}(${entry.parameters.map(p => `${p.name}: ${p.type.kind}`).join(', ')}) */
    ${entry.name}: ((${args}) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;`;
}

/**
 * Generates deployment methods for a contract class.
 *
 * @remarks
 * Creates three static deployment methods:
 * 1. `deploy(wallet, ...args)` - Standard deployment with default public keys
 * 2. `deployWithPublicKeys(publicKeys, wallet, ...args)` - Deploy with custom public keys for address derivation
 * 3. `deployWithOpts(opts, ...args)` - Advanced deployment with method selection and custom keys
 *
 * All deployment methods:
 * - Accept the contract's constructor arguments
 * - Return a `DeployMethod` that can be sent, simulated, or proved
 * - Automatically handle contract class and instance publication
 * - Support both private and public constructors
 *
 * The contract address is deterministically derived from the public keys, contract class,
 * constructor arguments, and deployment salt.
 *
 * @param input - The contract artifact containing constructor information
 * @returns TypeScript code for the three deployment methods
 *
 * @example
 * Generated code allows usage like:
 * ```typescript
 * // Standard deployment
 * const contract = await TokenContract.deploy(wallet, name, symbol, decimals)
 *   .send()
 *   .deployed();
 *
 * // Deployment with custom public keys
 * const contract = await TokenContract.deployWithPublicKeys(publicKeys, wallet, name, symbol, decimals)
 *   .send()
 *   .deployed();
 *
 * // Deployment with custom constructor method
 * const contract = await TokenContract.deployWithOpts(
 *   { wallet, method: 'public_constructor', publicKeys },
 *   ...args
 * ).send().deployed();
 * ```
 */
function generateDeploy(input: ContractArtifact) {
  const ctor = getDefaultInitializer(input);
  const args = (ctor?.parameters ?? []).map(generateParameter).join(', ');
  const contractName = `${input.name}Contract`;
  const artifactName = `${contractName}Artifact`;

  return `
  /**
   * Creates a tx to deploy a new instance of this contract.
   */
  public static deploy(wallet: Wallet, ${args}) {
    return new DeployMethod<${contractName}>(PublicKeys.default(), wallet, ${artifactName}, ${contractName}.at, Array.from(arguments).slice(1));
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified public keys hash to derive the address.
   */
  public static deployWithPublicKeys(publicKeys: PublicKeys, wallet: Wallet, ${args}) {
    return new DeployMethod<${contractName}>(publicKeys, wallet, ${artifactName}, ${contractName}.at, Array.from(arguments).slice(2));
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  public static deployWithOpts<M extends keyof ${contractName}['methods']>(
    opts: { publicKeys?: PublicKeys; method?: M; wallet: Wallet },
    ...args: Parameters<${contractName}['methods'][M]>
  ) {
    return new DeployMethod<${contractName}>(
      opts.publicKeys ?? PublicKeys.default(),
      opts.wallet,
      ${artifactName},
      ${contractName}.at,
      Array.from(arguments).slice(1),
      opts.method ?? 'constructor',
    );
  }
  `;
}

/**
 * Generates a private constructor for the contract class.
 *
 * @remarks
 * The constructor is private to enforce the factory pattern - users must use:
 * - `ContractName.at()` to connect to existing deployed contracts
 * - `ContractName.deploy()` to deploy new contracts
 *
 * This ensures contracts are always properly registered with the wallet's PXE
 * before use. The constructor automatically passes the contract artifact to
 * the base class, so users don't need to provide it.
 *
 * @param name - Name of the contract to derive artifact variable names
 * @returns TypeScript constructor code
 */
function generateConstructor(name: string) {
  return `
  private constructor(
    instance: ContractInstanceWithAddress,
    wallet: Wallet,
  ) {
    super(instance, ${name}ContractArtifact, wallet);
  }
  `;
}

/**
 * Generates the static `at()` factory method for connecting to deployed contracts.
 *
 * @remarks
 * The `at()` method is the standard way to create a contract instance for an already-deployed
 * contract. It performs the following:
 * 1. Registers the contract with the wallet's PXE (if not already registered)
 * 2. Retrieves contract instance data from the network
 * 3. Creates a typed contract wrapper ready for method calls
 *
 * This is an async method (unlike the constructor) because it needs to fetch contract
 * data from the network and register it with the PXE.
 *
 * @param name - Name of the contract to derive type and artifact names
 * @returns TypeScript code for the `at()` method
 *
 * @example
 * Generated code allows usage like:
 * ```typescript
 * const contract = await TokenContract.at(
 *   AztecAddress.fromString('0x123...'),
 *   wallet
 * );
 * ```
 */
function generateAt(name: string) {
  return `
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A promise that resolves to a new Contract instance.
   */
  public static async at(
    address: AztecAddress,
    wallet: Wallet,
  ) {
    return Contract.at(address, ${name}Contract.artifact, wallet) as Promise<${name}Contract>;
  }`;
}

/**
 * Generates static artifact getter methods.
 *
 * @remarks
 * Creates two static getters:
 * 1. `artifact` - Returns the full contract artifact with private bytecode
 * 2. `artifactForPublic` - Returns the artifact with only public bytecode (for public-only deployments)
 *
 * The artifact contains:
 * - Contract ABI (function signatures, parameter types)
 * - Compiled bytecode (for private and public functions)
 * - Contract metadata (name, version, events)
 * - Storage layout information
 *
 * These getters allow access to the artifact without instantiating the contract,
 * useful for tools and utilities that need to inspect contract metadata.
 *
 * @param name - Name of the contract used to derive artifact variable names
 * @returns TypeScript code for the artifact getter methods
 */
function generateArtifactGetters(name: string) {
  const artifactName = `${name}ContractArtifact`;
  return `
  /**
   * Returns this contract's artifact.
   */
  public static get artifact(): ContractArtifact {
    return ${artifactName};
  }

  /**
   * Returns this contract's artifact with public bytecode.
   */
  public static get artifactForPublic(): ContractArtifact {
    return loadContractArtifactForPublic(${artifactName}Json as NoirCompiledContract);
  }
  `;
}

/**
 * Generates import and export statements for the contract artifact.
 *
 * @remarks
 * Creates two statements:
 * 1. Imports the JSON artifact from the compiled contract file
 * 2. Exports a processed artifact loaded via `loadContractArtifact()`
 *
 * The `loadContractArtifact()` function validates and transforms the raw Noir
 * compilation output into Aztec's ContractArtifact format, which includes
 * additional metadata and standardized structures.
 *
 * @param name - Name of the contract (used to generate variable names)
 * @param artifactImportPath - Relative path to the JSON artifact file
 * @returns TypeScript import and export statements
 */
function generateAbiStatement(name: string, artifactImportPath: string) {
  const stmts = [
    `import ${name}ContractArtifactJson from '${artifactImportPath}' with { type: 'json' };`,
    `export const ${name}ContractArtifact = loadContractArtifact(${name}ContractArtifactJson as NoirCompiledContract);`,
  ];
  return stmts.join('\n');
}

/**
 * Generates a static getter for the contract's storage layout.
 *
 * @remarks
 * Creates a typed getter that exposes the storage slots used by the contract's state variables.
 * The storage layout maps variable names to their storage slot information, which is needed for:
 * - Direct storage reads via the PXE or node
 * - Storage proofs and verification
 * - Debugging and state inspection
 * - Advanced contract interactions
 *
 * Each storage entry contains the slot number as a `Fr` (field element), which is the
 * actual storage location on the Aztec network.
 *
 * Returns an empty string if the contract has no storage variables.
 *
 * @param input - The contract artifact containing storage layout information
 * @returns TypeScript code for the storage layout getter, or empty string if no storage
 */
function generateStorageLayoutGetter(input: ContractArtifact) {
  const entries = Object.entries(input.storageLayout);

  if (entries.length === 0) {
    return '';
  }

  const storageFieldsUnionType = entries.map(([name]) => `'${name}'`).join(' | ');
  const layout = entries
    .map(
      ([name, { slot }]) =>
        `${name}: {
      slot: new Fr(${slot.toBigInt()}n),
    }`,
    )
    .join(',\n');

  return `public static get storage(): ContractStorageLayout<${storageFieldsUnionType}> {
      return {
        ${layout}
      } as ContractStorageLayout<${storageFieldsUnionType}>;
    }
    `;
}

/**
 * Generates event type definitions and a static events getter.
 *
 * @remarks
 * Processes contract events and generates:
 * 1. TypeScript type definitions for each event (with typed fields)
 * 2. A static `events` getter that provides:
 *    - Event ABI types for decoding
 *    - Event selectors for filtering logs
 *    - Field names for event data access
 *
 * The generated event metadata is used by the Aztec SDK to:
 * - Decode event data from transaction receipts
 * - Filter events by selector when querying logs
 * - Provide type-safe access to event fields
 *
 * @param events - Array of event definitions from the contract artifact, or undefined if no events
 * @returns Object containing event type definitions and the events getter code
 */
async function generateEvents(events: any[] | undefined) {
  if (events === undefined) {
    return { events: '', eventDefs: '' };
  }

  const eventsMetadata = await Promise.all(
    events.map(async event => {
      const eventName = event.path.split('::').at(-1);

      const eventDefProps = event.fields.map(
        (field: ABIVariable) => `${field.name}: ${abiTypeToTypescript(field.type)}`,
      );
      const eventDef = `
      export type ${eventName} = {
        ${eventDefProps.join('\n')}
      }
    `;

      const fieldNames = event.fields.map((field: any) => `"${field.name}"`);
      const eventType = `${eventName}: {abiType: AbiType, eventSelector: EventSelector, fieldNames: string[] }`;
      // Reusing the decodeFunctionSignature
      const eventSignature = decodeFunctionSignature(eventName, event.fields);
      const eventSelector = await EventSelector.fromSignature(eventSignature);
      const eventImpl = `${eventName}: {
        abiType: ${JSON.stringify(event, null, 4)},
        eventSelector: EventSelector.fromString("${eventSelector}"),
        fieldNames: [${fieldNames}],
      }`;

      return {
        eventDef,
        eventType,
        eventImpl,
      };
    }),
  );

  return {
    eventDefs: eventsMetadata.map(({ eventDef }) => eventDef).join('\n'),
    events: `
    public static get events(): { ${eventsMetadata.map(({ eventType }) => eventType).join(', ')} } {
    return {
      ${eventsMetadata.map(({ eventImpl }) => eventImpl).join(',\n')}
    };
  }
  `,
  };
}

/**
 * Generates a complete TypeScript contract class from a Noir contract artifact.
 *
 * @remarks
 * This is the main code generation function that produces a full TypeScript contract wrapper.
 * The generated class extends `ContractBase` and provides:
 *
 * **Static Methods:**
 * - `deploy()` - Deploy new contract instance with default keys
 * - `deployWithPublicKeys()` - Deploy with custom public keys
 * - `deployWithOpts()` - Advanced deployment with method selection
 * - `at()` - Connect to existing deployed contract
 * - `artifact` getter - Access contract artifact
 * - `storage` getter - Access storage layout (if contract has storage)
 * - `events` getter - Access event metadata (if contract has events)
 *
 * **Instance Properties:**
 * - `methods` - Type-safe wrappers for all contract functions
 *
 * **Type Safety:**
 * All generated methods have full TypeScript type information, including:
 * - Parameter types (mapped from Noir types to TypeScript)
 * - Return types (ContractFunctionInteraction for transaction building)
 * - Event types (typed fields for event data)
 *
 * **Usage Patterns:**
 * The generated contracts follow Aztec's standard patterns:
 * - Use `.send()` to send transactions
 * - Use `.simulate()` to simulate execution without sending
 * - Use `.prove()` to generate proofs without sending
 * - Chain `.wait()` or `.deployed()` to wait for confirmation
 *
 * @param input - The Aztec contract artifact (transformed from Noir compilation output)
 * @param artifactImportPath - Optional relative path to import the JSON artifact.
 *                              If provided, generates a complete standalone contract class.
 *                              If omitted, generates only the interface (artifact must be provided externally).
 * @returns TypeScript code as a string, ready to be written to a .ts file
 *
 * @example
 * ```typescript
 * const artifact = loadContractArtifact(compiledContract);
 * const tsCode = await generateTypescriptContractInterface(
 *   artifact,
 *   '../artifacts/Token.json'
 * );
 * await writeFile('Token.ts', tsCode);
 * ```
 *
 * @example
 * Generated code enables usage like:
 * ```typescript
 * // Deploy a new contract
 * const token = await TokenContract.deploy(wallet, 'My Token', 'MTK', 18)
 *   .send()
 *   .deployed();
 *
 * // Connect to existing contract
 * const existing = await TokenContract.at(address, wallet);
 *
 * // Call contract methods
 * const balance = await token.methods.balance_of(owner).simulate();
 * await token.methods.transfer(recipient, amount).send().wait();
 *
 * // Access metadata
 * const artifact = TokenContract.artifact;
 * const events = TokenContract.events;
 * ```
 */
export async function generateTypescriptContractInterface(input: ContractArtifact, artifactImportPath?: string) {
  const methods = getAllFunctionAbis(input)
    .filter(f => !f.isInternal)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(generateMethod);
  const deploy = artifactImportPath && generateDeploy(input);
  const ctor = artifactImportPath && generateConstructor(input.name);
  const at = artifactImportPath && generateAt(input.name);
  const artifactStatement = artifactImportPath && generateAbiStatement(input.name, artifactImportPath);
  const artifactGetter = artifactImportPath && generateArtifactGetters(input.name);
  const storageLayoutGetter = artifactImportPath && generateStorageLayoutGetter(input);
  const { eventDefs, events } = await generateEvents(input.outputs.structs?.events);

  return `
/* Autogenerated file, do not edit! */

/* eslint-disable */
import {
  type AbiType,
  AztecAddress,
  type AztecAddressLike,
  CompleteAddress,
  Contract,
  type ContractArtifact,
  ContractBase,
  ContractFunctionInteraction,
  type ContractInstanceWithAddress,
  type ContractMethod,
  type ContractStorageLayout,
  decodeFromAbi,
  DeployMethod,
  EthAddress,
  type EthAddressLike,
  EventSelector,
  type FieldLike,
  Fr,
  type FunctionSelectorLike,
  loadContractArtifact,
  loadContractArtifactForPublic,
  type NoirCompiledContract,
  Point,
  type PublicKey,
  PublicKeys,
  type Wallet,
  type U128Like,
  type WrappedFieldLike,
} from '@aztec/aztec.js';
${artifactStatement}

${eventDefs}

/**
 * Type-safe interface for contract ${input.name};
 */
export class ${input.name}Contract extends ContractBase {
  ${ctor}

  ${at}

  ${deploy}

  ${artifactGetter}

  ${storageLayoutGetter}

  /** Type-safe wrappers for the public methods exposed by the contract. */
  public declare methods: {
    ${methods.join('\n')}
  };

  ${events}
}
`;
}
