/**
 * Base schema compiler with shared logic for TypeScript and Rust code generation
 */

// Core type definitions
export type Schema =
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

export type ObjectSchema = { [key: string]: Schema };

export interface FunctionMetadata {
  name: string;
  commandType: string;
  responseType: string;
}

// Helper functions
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.substring(1);
}

export function camelCase(s: string): string {
  return s
    .split('_')
    .map((part, index) => (index === 0 ? part.charAt(0).toLowerCase() + part.substring(1) : capitalize(part)))
    .join('');
}

export function pascalCase(s: string): string {
  return s.split('_').map(capitalize).join('');
}

export function toSnakeCase(s: string): string {
  return s
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

export function toPascalCase(s: string): string {
  return s
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.substring(1))
    .join('');
}

/**
 * Abstract base class for schema compilers
 */
export abstract class SchemaCompilerBase<TypeInfo> {
  protected typeCache = new Map<string, TypeInfo>();
  protected functionMetadata: FunctionMetadata[] = [];
  protected objectSchemas = new Map<string, ObjectSchema>();

  /**
   * Process API schema and extract function metadata
   */
  processApiSchema(commandsSchema: Schema, responsesSchema: Schema): void {
    // Validate schema format
    if (
      !Array.isArray(commandsSchema) ||
      commandsSchema[0] !== 'named_union' ||
      !Array.isArray(responsesSchema) ||
      responsesSchema[0] !== 'named_union'
    ) {
      throw new Error('Expected named_union schema format');
    }

    const commands = commandsSchema[1] as Array<[string, Schema]>;
    const responses = responsesSchema[1] as Array<[string, Schema]>;

    // Extract function metadata
    for (let i = 0; i < commands.length; i++) {
      const [commandName, commandSchema] = commands[i];
      const [responseName, responseSchema] = responses[i];

      this.functionMetadata.push({
        name: this.convertFunctionName(commandName),
        commandType: this.convertTypeName(commandName),
        responseType: this.convertTypeName(responseName),
      });

      // Process individual command and response types
      this.processSchema(commandSchema);
      this.processSchema(responseSchema);
    }
  }

  /**
   * Process a schema and populate type cache
   */
  processSchema(schema: Schema): TypeInfo {
    const key = this.getSchemaKey(schema);
    if (this.typeCache.has(key)) {
      return this.typeCache.get(key)!;
    }

    const typeInfo = this.generateTypeInfo(schema);
    this.typeCache.set(key, typeInfo);
    return typeInfo;
  }

  /**
   * Generate a unique key for a schema
   */
  protected getSchemaKey(schema: Schema): string {
    if (typeof schema === 'string') return schema;
    if (Array.isArray(schema)) return JSON.stringify(schema);
    if (typeof schema === 'object') return (schema as any).__typename || JSON.stringify(schema);
    return String(schema);
  }

  /**
   * Generate type information from a schema
   */
  protected generateTypeInfo(schema: Schema): TypeInfo {
    if (Array.isArray(schema)) {
      return this.processArraySchema(schema);
    } else if (typeof schema === 'string') {
      return this.processPrimitiveSchema(schema);
    } else if (typeof schema === 'object') {
      return this.processObjectSchema(schema);
    }
    throw new Error(`Unsupported schema type: ${schema}`);
  }

  /**
   * Generate the complete output
   */
  abstract compile(): string;

  /**
   * Convert function name to target language convention
   */
  protected abstract convertFunctionName(name: string): string;

  /**
   * Convert type name to target language convention
   */
  protected abstract convertTypeName(name: string): string;

  /**
   * Process array-based schema types
   */
  protected abstract processArraySchema(schema: any[]): TypeInfo;

  /**
   * Process primitive schema types
   */
  protected abstract processPrimitiveSchema(schema: string): TypeInfo;

  /**
   * Process object schema types
   */
  protected abstract processObjectSchema(schema: ObjectSchema): TypeInfo;
}
