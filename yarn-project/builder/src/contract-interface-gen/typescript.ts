import {
  type ABIParameter,
  type ABIVariable,
  type AbiValue,
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
  isOptionStruct,
  isPublicKeysStruct,
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
      if (isPublicKeysStruct(type)) {
        // PublicKeys are special cased due to them being part of the preimage of contract addresses.
        // The proper type is expected by the TS code that deals with the ContractInstanceRegistry protocol contract.
        return 'PublicKeys';
      }
      if (isBoundedVecStruct(type)) {
        // To make BoundedVec easier to work with, we expect a simple array on the input and then we encode it
        // as a BoundedVec in the ArgumentsEncoder.
        return `${abiTypeToTypescript(type.fields[0].type)}`;
      }
      if (isOptionStruct(type)) {
        return `OptionLike<${abiTypeToTypescript(type.fields[1].type)}>`;
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
  const ctorParams = ctor?.parameters ?? [];
  const args = ctorParams.map(generateParameter).join(', ');
  const argNames = ctorParams.map(p => p.name).join(', ');
  const argsForwarding = argNames ? `[${argNames}]` : '[]';
  const contractName = `${input.name}Contract`;
  const artifactName = `${contractName}Artifact`;

  return `
  /**
   * Creates a tx to deploy a new instance of this contract.
   * @param instantiation - Optional address-affecting parameters (salt, deployer / universalDeploy, publicKeys).
   *                       Salt defaults to a random value; the deployer is locked lazily from the first send-time \`from\`.
   */
  public static deploy(wallet: Wallet, ${args ? `${args}, ` : ''}instantiation?: DeployInstantiationOptions) {
    return DeployMethod.create<${contractName}>(
      wallet,
      {
        artifact: ${artifactName},
        postDeployCtor: (instance, wallet) => ${contractName}.at(instance.address, wallet),
        args: ${argsForwarding},
      },
      instantiation,
    );
  }

  /**
   * Creates a tx to deploy a new instance of this contract using the specified constructor method.
   */
  public static deployWithOpts<M extends keyof ${contractName}['methods']>(
    opts: { method?: M; wallet: Wallet; instantiation?: DeployInstantiationOptions },
    ...args: Parameters<${contractName}['methods'][M]>
  ) {
    return DeployMethod.create<${contractName}>(
      opts.wallet,
      {
        artifact: ${artifactName},
        postDeployCtor: (instance, wallet) => ${contractName}.at(instance.address, wallet),
        args,
        constructorNameOrArtifact: opts.method ?? 'constructor',
      },
      opts.instantiation,
    );
  }
  `;
}

/**
 * Generates the constructor by supplying the ABI to the parent class so the user doesn't have to.
 * @param name - Name of the contract to derive the ABI name from.
 * @returns A constructor method.
 * @remarks The constructor is private because we want to force the user to use the at method.
 */
function generateConstructor(name: string) {
  return `
  private constructor(
    address: AztecAddress,
    wallet: Wallet,
  ) {
    super(address, ${name}ContractArtifact, wallet);
  }
  `;
}

/**
 * Generates the at method for this contract.
 * @param name - Name of the contract to derive the ABI name from.
 * @returns An at method.
 */
function generateAt(name: string) {
  return `
  /**
   * Creates a contract instance.
   * @param address - The deployed contract's address.
   * @param wallet - The wallet to use when interacting with the contract.
   * @returns A new Contract instance.
   */
  public static at(
    address: AztecAddress,
    wallet: Wallet,
  ): ${name}Contract {
    return Contract.at(address, ${name}Contract.artifact, wallet) as ${name}Contract;
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

/**
 * Renders a global's name as an object literal property key.
 */
function globalPropertyKey(name: string): string {
  // A literal `__proto__` key (quoted or not) sets the object's prototype instead of defining a
  // property; the computed form defines a regular own property.
  if (name === '__proto__') {
    return `['__proto__']`;
  }
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

/**
 * Renders an AbiValue as a typescript literal: integers as bigints, strings/booleans as-is,
 * arrays/tuples as array literals, and structs as object literals.
 */
function abiValueToTsLiteral(value: AbiValue): string {
  switch (value.kind) {
    case 'boolean':
      return value.value.toString();
    case 'string':
      return JSON.stringify(value.value);
    case 'integer': {
      const magnitude = BigInt(`0x${value.value}`);
      return `${value.sign ? -magnitude : magnitude}n`;
    }
    case 'array':
      return `[${value.value.map(abiValueToTsLiteral).join(', ')}]`;
    case 'tuple':
      return `[${value.fields.map(abiValueToTsLiteral).join(', ')}]`;
    case 'struct':
      return `{ ${value.fields.map(f => `${globalPropertyKey(f.name)}: ${abiValueToTsLiteral(f.value)}`).join(', ')} }`;
  }
}

/**
 * Generates a getter exposing the globals exported with `#[abi(tag)]` as decoded values, grouped by tag.
 * @param input - The contract artifact.
 */
function generateGlobalsGetter(input: ContractArtifact) {
  // The `storage` tag is reserved by the aztec-nr macros for the storage layout, which is already
  // exposed decoded through the `storage` getter.
  const tags = Object.entries(input.outputs.globals)
    .filter(([tag]) => tag !== 'storage')
    .sort(([a], [b]) => a.localeCompare(b));

  if (tags.length === 0) {
    return '';
  }

  const groups = tags.map(([tag, entries]) => {
    const names = new Set<string>();
    const fields = entries.map(({ name, value }) => {
      if (names.has(name)) {
        throw new Error(`Duplicate global '${name}' exported under #[abi(${tag})] in contract ${input.name}`);
      }
      names.add(name);
      return `${globalPropertyKey(name)}: ${abiValueToTsLiteral(value)},`;
    });
    return `${globalPropertyKey(tag)}: {
        ${fields.join('\n        ')}
      },`;
  });

  return `/** Decoded values of the globals exported with \`#[abi(tag)]\`, grouped by tag. */
  public static get globals() {
    return {
      ${groups.join('\n      ')}
    } as const;
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
    .filter(f => !f.isOnlySelf)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(generateMethod);
  const deploy = artifactImportPath && generateDeploy(input);
  const ctor = artifactImportPath && generateConstructor(input.name);
  const at = artifactImportPath && generateAt(input.name);
  const artifactStatement = artifactImportPath && generateAbiStatement(input.name, artifactImportPath);
  const artifactGetter = artifactImportPath && generateArtifactGetters(input.name);
  const storageLayoutGetter = artifactImportPath && generateStorageLayoutGetter(input);
  const globalsGetter = artifactImportPath && generateGlobalsGetter(input);
  const { eventDefs, events } = await generateEvents(input.outputs.structs?.events);

  return `
/* Autogenerated file, do not edit! */

/* eslint-disable */
import { AztecAddress, CompleteAddress } from '@aztec/aztec.js/addresses';
import { type AbiType, type AztecAddressLike, type ContractArtifact, EventSelector, type EthAddressLike, type FieldLike, type FunctionSelectorLike, loadContractArtifact, loadContractArtifactForPublic, type NoirCompiledContract, type OptionLike, type U128Like, type WrappedFieldLike } from '@aztec/aztec.js/abi';
import { Contract, ContractBase, ContractFunctionInteraction, type ContractMethod, type ContractStorageLayout, type DeployInstantiationOptions, DeployMethod } from '@aztec/aztec.js/contracts';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr, Point } from '@aztec/aztec.js/fields';
import { type PublicKey, PublicKeys } from '@aztec/aztec.js/keys';
import type { Wallet } from '@aztec/aztec.js/wallet';
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

  ${globalsGetter}

  /** Type-safe wrappers for the public methods exposed by the contract. */
  public declare methods: {
    ${methods.join('\n')}
  };

  ${events}
}
`;
}
