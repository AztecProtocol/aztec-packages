/**
 * Capitalize the first character of a given string.
 * This function takes a string input and returns a new string
 * with the first character converted to uppercase, while keeping
 * the rest of the characters unchanged.
 *
 * @param s - The input string to be capitalized.
 * @returns A new string with the first character capitalized.
 */
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.substring(1);
}

function camelCase(s: string) {
  return s
    .split('_')
    .map((part, index) => (index === 0 ? part.charAt(0).toLowerCase() + part.substring(1) : capitalize(part)))
    .join('');
}

/**
 * Represents an object schema where keys are mapped to their corresponding type schemas, defining a structured data model.
 */
type ObjectSchema = { [key: string]: Schema };

/**
 * Represents the various data structures and types used to model schema definitions.
 * The Schema type supports primitive types, object schemas, tuples, maps, optional values,
 * fixed-size arrays, shared pointers, and custom type aliases (defined in schema_map_impl.hpp).
 */
type Schema =
  | string
  | ObjectSchema
  | ['tuple', Schema[]]
  | ['map', [Schema, Schema]]
  | ['optional', [Schema]]
  | ['vector', [Schema]]
  | ['variant', Schema[]]
  | ['named_union', Array<[string, Schema]>]
  | ['shared_ptr', [Schema]]
  | ['array', [Schema, number]]
  | ['alias', [string, string]];

/**
 * Represents a detailed description of a schema's type information.
 * Provides metadata and conversion methods related to the TypeScript and Msgpack type names,
 * as well as any required dependencies or custom behavior for specific schemas.
 */
export interface TypeInfo {
  /**
   * High-level typescript type name.
   */
  typeName: string;
  /**
   * Msgpack type name. The actual type returned by raw C-binds.
   * Only given if different.
   */
  msgpackTypeName?: string;
  /**
   * Indicates if the schema requires an interface.
   */
  needsInterface?: boolean;
  /**
   * Indicates if the schema refers to an imported type.
   */
  isImport?: boolean;
  /**
   * Indicates if the type is an alias of another type.
   */
  isAlias?: boolean;
  /**
   * Indicates if the schema represents a tuple type.
   */
  isTuple?: boolean;
  /**
   * Indicates if the schema represents an array.
   * If so, stores the array's subtype elements.
   */
  arraySubtype?: TypeInfo;
  /**
   * Indicates if the schema represents a variant.
   * If so, stores the variant's subtype elements.
   */
  variantSubtypes?: TypeInfo[];
  /**
   * Key-value pair of types that represent the keys and values in a map schema.
   */
  mapSubtypes?: [TypeInfo, TypeInfo];
  /**
   * Represents the TypeScript interface declaration for a specific schema type.
   */
  declaration?: string;
  /**
   * Conversion method to transform Msgpack data into a class instance.
   */
  toClassMethod?: string;
  /**
   * Converts a class instance to its Msgpack representation.
   */
  fromClassMethod?: string;
  /**
   * Represents the conversion method from class to Msgpack format.
   */
  toMsgpackMethod?: string;
  /**
   * The original object schema (if applicable).
   */
  objectSchema?: ObjectSchema;
}

/**
 * Generate a JavaScript expression to convert a given value from its Msgpack type representation to its
 * corresponding TypeScript type representation using the provided TypeInfo.
 *
 * @param typeInfo - Metadata and conversion methods related to the TypeScript and Msgpack type names.
 * @param value - The value to be converted in the generated expression.
 * @returns A JavaScript expression that converts the input value based on the provided TypeInfo.
 */
function msgpackConverterExpr(typeInfo: TypeInfo, value: string): string {
  const { typeName } = typeInfo;
  if (typeInfo.isAlias) {
    if (typeInfo.msgpackTypeName === 'number') {
      return `${value} as ${typeName}`;
    }
    return value; // Fr is just Buffer, no conversion needed
  } else if (typeInfo.arraySubtype) {
    const { typeName, msgpackTypeName } = typeInfo.arraySubtype;
    const convFn = `(v: ${msgpackTypeName || typeName}) => ${msgpackConverterExpr(typeInfo.arraySubtype, 'v')}`;
    if (typeInfo.isTuple) {
      return `mapTuple(${value}, ${convFn})`;
    } else {
      return `${value}.map(${convFn})`;
    }
  } else if (typeInfo.variantSubtypes) {
    const { variantSubtypes } = typeInfo;
    // Handle the last variant type: we assume it is this type after checking everything else
    let expr = msgpackConverterExpr(
      variantSubtypes[variantSubtypes.length - 1],
      'v[1] as ' + variantSubtypes[variantSubtypes.length - 1].msgpackTypeName,
    );
    for (let i = 0; i < variantSubtypes.length - 1; i++) {
      // make the expr a compound expression with a discriminator
      expr = `(v[0] == ${i} ? ${msgpackConverterExpr(
        variantSubtypes[i],
        'v[1] as ' + variantSubtypes[i].msgpackTypeName,
      )} : ${expr})`;
    }
    return `((v: ${typeInfo.msgpackTypeName}) => ${expr})(${value})`;
  } else if (typeInfo.mapSubtypes) {
    const valueTypeInfo = typeInfo.mapSubtypes[1];
    const valueConverter = msgpackConverterExpr(valueTypeInfo, 'v');
    if (valueConverter === 'v') {
      // No conversion needed
      return value;
    }
    return `Object.fromEntries(Object.entries(${value}).map(([k, v]) => [k, ${valueConverter}]))`;
  } else if (typeInfo.isImport && !typeInfo.isAlias) {
    return `to${typeName}(${value})`;
  } else {
    return value;
  }
}

/**
 * Generate a JavaScript expression to convert a given value from its TypeScript class representation to its
 * corresponding Msgpack type representation using the provided TypeInfo.
 *
 * @param typeInfo - Metadata and conversion methods related to the TypeScript and Msgpack type names.
 * @param value - The value to be converted in the generated expression.
 * @returns A JavaScript expression that converts the input value based on the provided TypeInfo.
 */
function classConverterExpr(typeInfo: TypeInfo, value: string): string {
  const { typeName } = typeInfo;
  if (typeInfo.isAlias) {
    if (typeInfo.msgpackTypeName === 'number') {
      return `${value}`; // Should be a branded number alias
    }
    return value; // Fr is just Buffer
  } else if (typeInfo.arraySubtype) {
    const { typeName } = typeInfo.arraySubtype;
    const convFn = `(v: ${typeName}) => ${classConverterExpr(typeInfo.arraySubtype, 'v')}`;
    if (typeInfo.isTuple) {
      return `mapTuple(${value}, ${convFn})`;
    } else {
      return `${value}.map(${convFn})`;
    }
  } else if (typeInfo.variantSubtypes) {
    throw new Error('TODO(AD) - variant parameters to C++ not yet supported.');
  } else if (typeInfo.mapSubtypes) {
    const valueTypeInfo = typeInfo.mapSubtypes[1];
    const valueConverter = classConverterExpr(valueTypeInfo, 'v');
    if (valueConverter === 'v') {
      // No conversion needed
      return value;
    }
    return `Object.fromEntries(Object.entries(${value}).map(([k, v]) => [k, ${valueConverter}]))`;
  } else if (typeInfo.isImport && !typeInfo.isAlias) {
    return `from${typeName}(${value})`;
  } else {
    return value;
  }
}
/**
 * Converts a spec emitted from the WASM.
 * Creates typescript code.
 */
export class MsgpackSchemaCompiler {
  // Function and declaration output fragments
  protected typeInfos: Record<string, TypeInfo> = {};
  // cbind outputs, put at end
  protected funcDecls: string[] = [];
  protected mode: 'sync' | 'async' = 'sync';
  // Store function metadata for wrapper generation
  protected functionMetadata: Array<{name: string, commandType: string, responseType: string}> = [];

  constructor(mode: 'sync' | 'async' = 'sync') {
    this.mode = mode;
  }

  /**
   * Retrieve the TypeScript type name for a given schema.
   * This function utilizes the TypeInfo cache to obtain the appropriate type name
   * and handles any necessary type compilation along the way.
   *
   * @param type - The input schema for which to retrieve the TypeScript type name.
   * @returns The corresponding TypeScript type name as a string.
   */
  protected getTypeName(type: Schema): string {
    return this.getTypeInfo(type).typeName;
  }
  /**
   * Derive the TypeScript type name of a schema, compiling anything needed along the way.
   * @param type - A schema.
   * @returns The type name.
   */
  protected getTypeInfo(type: Schema): TypeInfo {
    if (Array.isArray(type)) {
      if (type[0] === 'array') {
        // fixed-size array case
        const [_array, [subtype, size]] = type;
        const typeName = `Tuple<${this.getTypeName(subtype)}, ${size}>`;
        const msgpackTypeName = `Tuple<${this.getMsgpackTypename(subtype)}, ${size}>`;
        return {
          typeName,
          msgpackTypeName,
          isTuple: true,
          arraySubtype: this.getTypeInfo(subtype),
        };
      } else if (type[0] === 'variant') {
        // fixed-size array case
        const [_array, variantSchemas] = type;
        // TODO(AD): This could be a discriminated union if we also allow writing C++ variants.
        const typeName = variantSchemas.map(vs => this.getTypeName(vs)).join(' | ');
        const msgpackUnion = variantSchemas.map(vs => this.getMsgpackTypename(vs)).join(' | ');
        const msgpackTypeName = `[number, ${msgpackUnion}]`;
        return {
          typeName,
          msgpackTypeName,
          variantSubtypes: variantSchemas.map(vs => this.getTypeInfo(vs)),
        };
      } else if (type[0] === 'named_union') {
        // named_union represents a union of tuples [string, object] where string is the discriminator
        const [_namedUnion, namedTypes] = type;
        const names: string[] = [];
        const tupleTypes: string[] = [];
        const tupleTypeInfos: TypeInfo[] = [];

        // Extract tuples from the named union format
        // Each element in namedTypes is a [name, schema] pair
        for (const namedType of namedTypes) {
          if (!Array.isArray(namedType) || namedType.length !== 2) {
            throw new Error('Invalid named_union format: expected [name, schema] pairs');
          }

          const [name, schemaOrName] = namedType;

          names.push(name);

          // Handle case where schema is just a string reference to the type name
          let objTypeInfo: TypeInfo;
          if (typeof schemaOrName === 'string') {
            // For string references, ensure the empty type is created
            const typeName = capitalize(camelCase(schemaOrName));
            if (!this.typeInfos[typeName]) {
              // Create an empty type
              this.typeInfos[typeName] = {
                typeName,
                msgpackTypeName: 'Msgpack' + typeName,
                isImport: true,
                declaration: `export interface ${typeName} {}\n\ninterface Msgpack${typeName} {}`,
                objectSchema: { __typename: schemaOrName.toLowerCase() },
                toClassMethod: `function to${typeName}(o: Msgpack${typeName}): ${typeName} {
  return {};
}`,
                fromClassMethod: `function from${typeName}(o: ${typeName}): Msgpack${typeName} {
  return {};
}`,
              };
            }
            objTypeInfo = this.typeInfos[typeName];
          } else {
            objTypeInfo = this.getTypeInfo(schemaOrName);
          }

          tupleTypeInfos.push(objTypeInfo);

          // Create tuple type [name, ObjectType]
          const tupleType = `["${name}", ${objTypeInfo.typeName}]`;
          tupleTypes.push(tupleType);
        }

        // The TypeScript type is a union of all possible tuples
        const typeName = tupleTypes.join(' | ');

        // For msgpack, it's similar but with msgpack types
        const msgpackTupleTypes = tupleTypeInfos.map((typeInfo, i) => {
          return `["${names[i]}", ${typeInfo.msgpackTypeName || typeInfo.typeName}]`;
        });
        const msgpackTypeName = msgpackTupleTypes.join(' | ');

        return {
          typeName,
          msgpackTypeName,
          variantSubtypes: tupleTypeInfos,
        };
      } else if (type[0] === 'vector') {
        // vector case
        const [_vector, [subtype]] = type;
        if (subtype == 'unsigned char') {
          // buffer special case
          return { typeName: 'Buffer' };
        }
        const subtypeInfo = this.getTypeInfo(subtype);
        return {
          typeName: `${subtypeInfo.typeName}[]`,
          msgpackTypeName: `${this.getMsgpackTypename(subtype)}[]`,
          arraySubtype: subtypeInfo,
        };
      } else if (type[0] === 'alias') {
        // alias case
        const [_alias, [rawTypeName, msgpackName]] = type;
        let msgpackTypeName: string;
        if (msgpackName.startsWith('bin')) {
          msgpackTypeName = 'Buffer';
        } else if (msgpackName === 'int' || msgpackName === 'unsigned int' || msgpackName === 'unsigned short') {
          msgpackTypeName = 'number';
        } else {
          throw new Error('Unsupported alias type ' + msgpackName);
        }
        const typeName = capitalize(camelCase(rawTypeName));
        this.typeInfos[typeName] = {
          typeName,
          isImport: true,
          isAlias: true,
          msgpackTypeName,
        };
        return this.typeInfos[typeName];
      } else if (type[0] === 'shared_ptr') {
        // shared_ptr case
        const [_sharedPtr, [subtype]] = type;
        return this.getTypeInfo(subtype);
      } else if (type[0] === 'map') {
        // map case
        const [_map, [keyType, valueType]] = type;
        return {
          typeName: `Record<${this.getTypeName(keyType)}, ${this.getTypeName(valueType)}>`,
          msgpackTypeName: `Record<${this.getMsgpackTypename(keyType)}, ${this.getMsgpackTypename(valueType)}>`,
          mapSubtypes: [this.getTypeInfo(keyType), this.getTypeInfo(valueType)],
        };
      }
    } else if (typeof type === 'string') {
      switch (type) {
        case 'bool':
          return { typeName: 'boolean' };
        case 'int':
        case 'unsigned int':
        case 'unsigned short':
        case 'unsigned long':
        case 'double':
          return { typeName: 'number' };
        case 'string':
          return { typeName: 'string' };
        case 'bin32':
          return { typeName: 'Buffer' };
      }
      const typeName = capitalize(camelCase(type));
      if (!this.typeInfos[typeName]) {
        // For forward references, create a placeholder type that will be resolved later
        this.typeInfos[typeName] = {
          typeName,
          isImport: true,
        };
      }
      return this.typeInfos[typeName];
    } else if (typeof type === 'object') {
      const typeName = capitalize(camelCase(type.__typename as string));
      // Set our typeInfos object to either what it already was, or, if not yet defined
      // the resolved type info (which will generate interfaces and helper methods)
      return (this.typeInfos[typeName] = this.typeInfos[typeName] || {
        typeName,
        msgpackTypeName: 'Msgpack' + typeName,
        isImport: true,
        declaration: this.generateNonMsgpackInterface(typeName, type) + '\n\n' + this.generateInterface(typeName, type),
        toClassMethod: this.generateMsgpackConverter(typeName, type),
        fromClassMethod: this.generateClassConverter(typeName, type),
        objectSchema: type, // Store the schema for later use
      });
    }

    throw new Error(`Unsupported type: ${type}`);
  }

  /**
   * Retrieve the Msgpack type name for a given schema.
   * This function returns the MsgpackTypeName if available, or the default TypeName otherwise.
   * It is useful for handling cases where the Msgpack type representation differs from the TypeScript type,
   * ensuring proper serialization and deserialization between the two formats.
   *
   * @param schema - The schema for which the Msgpack type name is required.
   * @returns The Msgpack type name corresponding to the input schema.
   */
  protected getMsgpackTypename(schema: Schema): string {
    const { msgpackTypeName, typeName } = this.getTypeInfo(schema);
    return msgpackTypeName || typeName;
  }
  /**
   * Generate an interface with the name 'name'.
   * @param name - The interface name.
   * @param type - The object schema with properties of the interface.
   * @returns the interface body.
   */
  protected generateInterface(name: string, type: ObjectSchema) {
    // Raw object, used as return value of fromType() generated functions.
    // Not exported - internal use only
    let result = `interface Msgpack${name} {\n`;
    for (const [key, value] of Object.entries(type)) {
      if (key === '__typename') {
        continue;
      }
      result += `  ${key}: ${this.getMsgpackTypename(value)};\n`;
    }
    result += '}';
    return result;
  }

  /**
   * Generate the non-msgpack interface (with camelCase properties).
   * @param name - The interface name.
   * @param type - The object schema with properties of the interface.
   * @returns the interface body.
   */
  protected generateNonMsgpackInterface(name: string, type: ObjectSchema) {
    let result = `export interface ${name} {\n`;
    for (const [key, value] of Object.entries(type)) {
      if (key === '__typename') {
        continue;
      }
      const camelKey = camelCase(key);
      result += `  ${camelKey}: ${this.getTypeName(value)};\n`;
    }
    result += '}';
    return result;
  }

  /**
   * Generate conversion method 'toName' for a specific type 'name'.
   * @param name - The class name.
   * @param type - The object schema with properties of the interface.
   * @returns The toName method.
   */
  protected generateMsgpackConverter(name: string, type: ObjectSchema): string {
    const typename = capitalize(camelCase(type.__typename as string));

    // Check if this is an empty object (only has __typename)
    const isEmptyObject = Object.keys(type).filter(key => key !== '__typename').length === 0;

    if (isEmptyObject) {
      return `function to${name}(o: Msgpack${name}): ${name} {
  return {};
}`;
    }

    const checkerSyntax = () => {
      const statements: string[] = [];
      for (const [key] of Object.entries(type)) {
        if (key === '__typename') {
          continue;
        }
        statements.push(
          `  if (o.${key} === undefined) { throw new Error("Expected ${key} in ${typename} deserialization"); }`,
        );
      }
      return statements.join('\n');
    };

    const objectBodySyntax = () => {
      const statements: string[] = [];
      for (const [key, value] of Object.entries(type)) {
        if (key === '__typename') {
          continue;
        }
        const camelKey = camelCase(key);
        statements.push(`    ${camelKey}: ${msgpackConverterExpr(this.getTypeInfo(value), `o.${key}`)},`);
      }
      return statements.join('\n');
    };

    return `function to${name}(o: Msgpack${name}): ${name} {
${checkerSyntax()};
  return {
${objectBodySyntax()}
  };
}`;
  }

  /**
   * Generate conversion method 'fromName' for a specific type 'name'.
   * @param name - The class name.
   * @param type - The object schema with properties of the interface.
   * @returns the fromName method string.
   */
  protected generateClassConverter(name: string, type: ObjectSchema): string {
    const typename = capitalize(camelCase(type.__typename as string));

    // Check if this is an empty object (only has __typename)
    const isEmptyObject = Object.keys(type).filter(key => key !== '__typename').length === 0;

    if (isEmptyObject) {
      return `function from${name}(o: ${name}): Msgpack${name} {
  return {};
}`;
    }

    const checkerSyntax = () => {
      const statements: string[] = [];
      for (const [key] of Object.entries(type)) {
        if (key === '__typename') {
          continue;
        }
        statements.push(
          `  if (o.${camelCase(key)} === undefined) { throw new Error("Expected ${camelCase(
            key,
          )} in ${typename} serialization"); }`,
        );
      }
      return statements.join('\n');
    };
    const bodySyntax = () => {
      const statements: string[] = [];
      for (const [key, value] of Object.entries(type)) {
        if (key === '__typename') {
          continue;
        }
        statements.push(`  ${key}: ${classConverterExpr(this.getTypeInfo(value), `o.${camelCase(key)}`)},`);
      }
      return statements.join('\n');
    };

    const callSyntax = () => {
      return `{\n${bodySyntax()}}`;
    };

    return `function from${name}(o: ${name}): Msgpack${name} {
${checkerSyntax()};
  return ${callSyntax.call(this)};
}`;
  }
  /**
   * Process a cbind schema.
   * @param name - The cbind name.
   * @param cbind - The cbind schema.
   * @returns The compiled schema.
   */
  processCbind(
    name: string,
    cbind: {
      /**
       * An array of Schema representing the argument types for a cbind function.
       */
      args: ['tuple', Schema[]];
      /**
       * The returned value's schema after processing the cbind.
       */
      ret: Schema;
    },
  ) {
    const [_tuple, args] = cbind.args;
    const typeInfos = args.map(arg => this.getTypeInfo(arg));
    const argStrings = typeInfos.map((typeInfo, i) => `arg${i}: ${typeInfo.typeName}`);
    const callStrings = typeInfos.map((typeInfo, i) => `${classConverterExpr(typeInfo, `arg${i}`)}`);
    const retType = this.getTypeInfo(cbind.ret);
    const wasmType = this.mode === 'sync' ? 'BarretenbergWasmMain' : 'BarretenbergWasmMainWorker';
    const asyncKeyword = this.mode === 'async' ? 'async ' : '';
    const awaitKeyword = this.mode === 'async' ? 'await ' : '';
    const returnType = this.mode === 'async' ? `Promise<${retType.typeName}>` : retType.typeName;
    const innerCall = `${awaitKeyword}wasm.msgpackCall('${name}', [${callStrings.join(', ')}])`;

    this.funcDecls.push(`export ${asyncKeyword}function ${camelCase(name)}(wasm: ${wasmType}, ${argStrings.join(', ')}): ${returnType} {
  return ${msgpackConverterExpr(retType, innerCall)};
}`);
  }

  /**
   * Process API schema containing command and response NamedUnion types.
   * Generates individual functions for each command type.
   * @param commandsSchema - The NamedUnion schema for commands
   * @param responsesSchema - The NamedUnion schema for responses
   */
  processApiSchema(commandsSchema: Schema, responsesSchema: Schema) {
    // Process the command and response schemas to get type information
    const commandTypeInfo = this.getTypeInfo(commandsSchema);
    const responseTypeInfo = this.getTypeInfo(responsesSchema);

    // Extract the variant types from the NamedUnion schemas
    if (!commandTypeInfo.variantSubtypes || !responseTypeInfo.variantSubtypes) {
      throw new Error('Expected variant types for commands and responses');
    }

    // Verify we have the expected named_union format
    if (!Array.isArray(commandsSchema) || commandsSchema[0] !== 'named_union' ||
        !Array.isArray(responsesSchema) || responsesSchema[0] !== 'named_union') {
      throw new Error('Expected named_union schema format');
    }

    // Generate a function for each command/response pair
    const commandNamedTypes = commandsSchema[1];
    const responseNamedTypes = responsesSchema[1];
    for (let i = 0; i < commandTypeInfo.variantSubtypes.length; i++) {
      const cmdType = commandTypeInfo.variantSubtypes[i];
      const respType = responseTypeInfo.variantSubtypes[i];
      const [commandName] = commandNamedTypes[i] as [string, any];
      const [responseName] = responseNamedTypes[i] as [string, any];

      // Generate function name (lowercase version of command)
      const funcName = camelCase(commandName);

      // Store metadata for wrapper generation
      this.functionMetadata.push({
        name: funcName,
        commandType: cmdType.typeName,
        responseType: respType.typeName
      });

      // Generate the function
      const wasmType = this.mode === 'sync' ? 'BarretenbergWasmMain' : 'BarretenbergWasmMainWorker';
      const asyncKeyword = this.mode === 'async' ? 'async ' : '';
      const awaitKeyword = this.mode === 'async' ? 'await ' : '';
      const returnType = this.mode === 'async' ? `Promise<${respType.typeName}>` : respType.typeName;

      this.funcDecls.push(`export ${asyncKeyword}function ${funcName}(wasm: ${wasmType}, command: ${cmdType.typeName}): ${returnType} {
  const msgpackCommand = from${cmdType.typeName}(command);
  const [variantName, result] = ${awaitKeyword}wasm.msgpackCall('bbapi', ["${commandName}", msgpackCommand]);
  if (variantName !== '${responseName}') {
    throw new Error(\`Expected variant name '${responseName}' but got '\${variantName}'\`);
  }
  return to${respType.typeName}(result);
}`);
    }
  }

  /**
   * Compile the generated TypeScript code from processed cbind schemas into a single string.
   * The output string consists of necessary imports, type declarations, and helper methods
   * for serialization and deserialization between TypeScript classes and Msgpack format,
   * as well as the compiled cbind function calls.
   *
   * @returns A string containing the complete compiled TypeScript code.
   */
  compile(): string {
    const wasmImport = this.mode === 'sync'
      ? 'BarretenbergWasmMain'
      : 'BarretenbergWasmMainWorker';

    const outputs: string[] = [
      `/* eslint-disable */
// GENERATED FILE DO NOT EDIT, RUN yarn generate
import { Buffer } from "buffer";
import { ${wasmImport} } from "../barretenberg_wasm/barretenberg_wasm_main/index.js";

// Helper type for fixed-size arrays
type Tuple<T, N extends number> = T[] & { length: N };

// Helper function for mapping tuples
function mapTuple<T, U, N extends number>(tuple: Tuple<T, N>, fn: (t: T) => U): Tuple<U, N> {
  return tuple.map(fn) as Tuple<U, N>;
}
`,
    ];

    // Generate Fr type if needed
    if (this.typeInfos['Fr']) {
      outputs.push(`
// Field element type
export type Fr = Buffer;
`);
    }

    // Generate all type declarations and converters
    for (const typeInfo of Object.values(this.typeInfos)) {
      if (typeInfo.declaration) {
        outputs.push(typeInfo.declaration);
        outputs.push('');
      }
      if (typeInfo.toClassMethod) {
        outputs.push(typeInfo.toClassMethod);
      }
      if (typeInfo.fromClassMethod) {
        outputs.push(typeInfo.fromClassMethod);
      }
    }

    // Add cbind functions
    for (const funcDecl of Object.values(this.funcDecls)) {
      outputs.push('');
      outputs.push(funcDecl);
    }

    // Generate wrapper class if we have functions
    if (this.functionMetadata.length > 0) {
      outputs.push('');
      outputs.push(this.generateWrapperClass());
    }

    return outputs.join('\n');
  }

  /**
   * Generate the wrapper class for the API
   */
  protected generateWrapperClass(): string {
    const className = this.mode === 'sync' ? 'CbindApiSync' : 'CbindApi';
    const wasmType = this.mode === 'sync' ? 'BarretenbergWasmMain' : 'BarretenbergWasmMainWorker';

    let classContent = `/**
 * ${this.mode === 'sync' ? 'Sync' : 'Async'} API wrapper for cbind functions using ${wasmType}.
 * ${this.mode === 'sync' ? 'All methods are synchronous.' : 'All methods return promises.'}
 */
export class ${className} {
  constructor(protected wasm: ${wasmType}) {}
`;

    // Generate methods for each function
    for (const func of this.functionMetadata) {
      const asyncKeyword = this.mode === 'async' ? 'async ' : '';
      const returnType = this.mode === 'async' ? `Promise<${func.responseType}>` : func.responseType;

      classContent += `
  ${asyncKeyword}${func.name}(command: ${func.commandType}): ${returnType} {
    return ${func.name}(this.wasm, command);
  }
`;
    }

    classContent += '}';
    return classContent;
  }
}
