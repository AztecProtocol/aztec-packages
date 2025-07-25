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
 * Returns the corresponding typescript type for a given Noir type.
 * @param type - The input Noir type.
 * @returns An equivalent typescript type.
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
 * Generates the typescript code to represent a Noir parameter.
 * @param param - A Noir parameter with name and type.
 * @returns The corresponding ts code.
 */
function generateParameter(param: ABIParameter) {
  return `${param.name}: ${abiTypeToTypescript(param.type)}`;
}

/**
 * Generates the typescript code to represent a Noir function as a type.
 * @param param - A Noir function.
 * @returns The corresponding ts code.
 */
function generateMethod(entry: FunctionAbi) {
  const args = entry.parameters.map(generateParameter).join(', ');
  return `
    /** ${entry.name}(${entry.parameters.map(p => `${p.name}: ${p.type.kind}`).join(', ')}) */
    ${entry.name}: ((${args}) => ContractFunctionInteraction) & Pick<ContractMethod, 'selector'>;`;
}

/**
 * Generates a deploy method for this contract.
 * @param input - Build artifact of the contract.
 * @returns A type-safe deploy method in ts.
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
 * Generates the constructor by supplying the ABI to the parent class so the user doesn't have to.
 * @param name - Name of the contract to derive the ABI name from.
 * @returns A constructor method.
 * @remarks The constructor is private because we want to force the user to use the create method.
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
 * Generates the at method for this contract.
 * @param name - Name of the contract to derive the ABI name from.
 * @returns An at method.
 * @remarks We don't use constructor directly because of the async `wallet.getContractData` call.
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
 * Generates static getters for the contract's artifact.
 * @param name - Name of the contract used to derive name of the artifact import.
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
 * Generates statements for importing the artifact from json and re-exporting it.
 * @param name - Name of the contract.
 * @param artifactImportPath - Path to load the ABI from.
 * @returns Code.
 */
function generateAbiStatement(name: string, artifactImportPath: string) {
  const stmts = [
    `import ${name}ContractArtifactJson from '${artifactImportPath}' with { type: 'json' };`,
    `export const ${name}ContractArtifact = loadContractArtifact(${name}ContractArtifactJson as NoirCompiledContract);`,
  ];
  return stmts.join('\n');
}

/**
 * Generates a getter for the contract's storage layout.
 * @param input - The contract artifact.
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

// events is of type AbiType
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
 * Generates the typescript code to represent a contract.
 * @param input - The compiled Noir artifact.
 * @param artifactImportPath - Optional path to import the artifact (if not set, will be required in the constructor).
 * @returns The corresponding ts code.
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
