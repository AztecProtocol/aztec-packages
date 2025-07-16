/**
 * Functions for processing msgpack schemas and generating TypeScript code.
 * These are used by both cbind and native API generators.
 */

/**
 * Capitalize the first character of a given string.
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
 * Represents an object schema where keys are mapped to their corresponding type schemas.
 */
type ObjectSchema = { [key: string]: Schema };

/**
 * Represents the various data structures and types used to model schema definitions.
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
 */
export interface TypeInfo {
  typeName: string;
  msgpackTypeName?: string;
  needsInterface?: boolean;
  isImport?: boolean;
  isAlias?: boolean;
  isTuple?: boolean;
  arraySubtype?: TypeInfo;
  variantSubtypes?: TypeInfo[];
  mapSubtypes?: [TypeInfo, TypeInfo];
  declaration?: string;
  toClassMethod?: string;
  fromClassMethod?: string;
  toMsgpackMethod?: string;
  objectSchema?: ObjectSchema;
}

export interface ProcessingContext {
  typeInfos: Record<string, TypeInfo>;
  interfaceDecls: string[];
  conversionDecls: string[];
}

/**
 * Process msgpack schema and generate TypeScript interfaces and conversions.
 */
export function processSchema(
  schema: Schema,
  context: ProcessingContext = { typeInfos: {}, interfaceDecls: [], conversionDecls: [] }
): TypeInfo {
  return getTypeInfo(schema, context);
}

/**
 * Process API schema to generate function metadata.
 */
export function processApiSchema(
  commands: Schema,
  responses: Schema,
  context: ProcessingContext
): Array<{ name: string; commandType: string; responseType: string }> {
  const functionMetadata: Array<{ name: string; commandType: string; responseType: string }> = [];

  if (!Array.isArray(commands) || commands[0] !== 'named_union') {
    throw new Error('Expected commands to be a named_union');
  }
  if (!Array.isArray(responses) || responses[0] !== 'named_union') {
    throw new Error('Expected responses to be a named_union');
  }

  const commandList = commands[1] as Array<[string, Schema]>;
  const responseList = responses[1] as Array<[string, Schema]>;

  // Create a map of command names to response names
  const responseMap = new Map<string, string>();
  for (const [responseName] of responseList) {
    // Match command name to response name (e.g., CircuitProve -> CircuitProveResponse)
    const commandName = responseName.replace(/Response$/, '');
    responseMap.set(commandName, responseName);
  }

  // Process each command
  for (const [commandName, commandSchema] of commandList) {
    const responseName = responseMap.get(commandName);
    if (!responseName) {
      throw new Error(`No response found for command ${commandName}`);
    }

    // Process the schemas
    const cmdType = processSchema(commandSchema, context);
    const respType = processSchema(['named_union', [[responseName, commandSchema]]], context);

    // Generate function name (camelCase version of command name)
    const funcName = camelCase(commandName);

    functionMetadata.push({
      name: funcName,
      commandType: cmdType.typeName,
      responseType: responseName,
    });
  }

  return functionMetadata;
}

/**
 * Generate cbind function for sync/async WASM usage.
 */
export function generateCbindFunction(
  funcMeta: { name: string; commandType: string; responseType: string },
  mode: 'sync' | 'async'
): string {
  const wasmType = mode === 'sync' ? 'BarretenbergWasmMain' : 'BarretenbergWasmMainWorker';
  const asyncKeyword = mode === 'async' ? 'async ' : '';
  const awaitKeyword = mode === 'async' ? 'await ' : '';
  const returnType = mode === 'async' ? `Promise<${funcMeta.responseType}>` : funcMeta.responseType;
  const commandName = funcMeta.commandType.replace(/^Circuit|^ClientIvc|^ProofAsFields|^VkAsFields/, '');

  return `export ${asyncKeyword}function ${funcMeta.name}(wasm: ${wasmType}, command: ${funcMeta.commandType}): ${returnType} {
  const msgpackCommand = from${funcMeta.commandType}(command);
  const [variantName, result] = ${awaitKeyword}wasm.callCbind('bbapi', ["${commandName}", msgpackCommand]);
  if (variantName !== '${funcMeta.responseType}') {
    throw new Error(\`Expected variant name '${funcMeta.responseType}' but got '\${variantName}'\`);
  }
  return to${funcMeta.responseType}(result);
}`;
}

/**
 * Generate native API method for process-based usage.
 */
export function generateNativeApiMethod(
  funcMeta: { name: string; commandType: string; responseType: string }
): string {
  const commandName = funcMeta.commandType.replace(/^Circuit|^ClientIvc|^ProofAsFields|^VkAsFields/, '');

  return `
  async ${funcMeta.name}(command: ${funcMeta.commandType}): Promise<${funcMeta.responseType}> {
    const msgpackCommand = from${funcMeta.commandType}(command);
    const [variantName, result] = await this.sendCommand(["${commandName}", msgpackCommand]);
    if (variantName !== '${funcMeta.responseType}') {
      throw new Error(\`Expected variant name '${funcMeta.responseType}' but got '\${variantName}'\`);
    }
    return to${funcMeta.responseType}(result);
  }`;
}

// Helper functions for type processing (migrated from the class)

function getTypeInfo(type: Schema, context: ProcessingContext): TypeInfo {
  // Implementation would be migrated from the CbindCompiler class
  // For now, returning a placeholder
  return {
    typeName: 'PlaceholderType',
  };
}

// Additional helper functions would be migrated here...