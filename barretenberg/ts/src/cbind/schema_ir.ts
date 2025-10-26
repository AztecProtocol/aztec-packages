/**
 * Intermediate Representation (IR) for msgpack schema
 *
 * This IR sits between the raw msgpack schema and language-specific code generators.
 * It provides a normalized, language-agnostic view of the schema.
 */

export interface TypeIR {
  kind: 'primitive' | 'struct' | 'array' | 'vec' | 'option' | 'custom';
  name?: string; // For custom types
  elementType?: TypeIR; // For array/vec/option
  size?: number; // For fixed arrays
  fields?: FieldIR[]; // For structs
}

export interface FieldIR {
  name: string; // snake_case field name
  originalName: string; // Original schema name
  type: TypeIR;
  doc?: string;
}

export interface StructIR {
  name: string; // PascalCase type name
  originalName: string; // Original schema name
  fields: FieldIR[];
  isCommand: boolean;
  doc?: string;
}

export interface MethodIR {
  name: string; // snake_case method name
  originalName: string; // Original schema name (PascalCase)
  params: FieldIR[];
  returnType: string; // Response type name
  doc?: string;
}

export interface SchemaIR {
  structs: Map<string, StructIR>;
  commands: MethodIR[];
  primitiveTypes: Set<string>;
}

/**
 * Process raw msgpack schema into IR
 */
export class SchemaProcessor {
  private structs = new Map<string, StructIR>();
  private commandMethods: MethodIR[] = [];
  private primitives = new Set<string>(['bool', 'u8', 'u16', 'u32', 'u64', 'f64', 'String', 'bytes']);

  process(commandsSchema: any, responsesSchema: any): SchemaIR {
    // Reset state
    this.structs.clear();
    this.commandMethods = [];

    // Process command/response pairs
    const commands = commandsSchema[1] as Array<[string, any]>;
    const responses = responsesSchema[1] as Array<[string, any]>;

    for (let i = 0; i < commands.length; i++) {
      const [cmdName, cmdSchema] = commands[i];
      const [respName, respSchema] = responses[i];

      // Discover types from command and response
      this.discoverStruct(cmdName, cmdSchema, true);

      // Skip string references (already defined types)
      if (typeof respSchema !== 'string') {
        this.discoverStruct(respName, respSchema, false);
      }

      // Create method IR
      const commandStruct = this.structs.get(this.toPascalCase(cmdName));
      if (commandStruct) {
        this.commandMethods.push({
          name: this.toSnakeCase(cmdName),
          originalName: cmdName,
          params: commandStruct.fields,
          returnType: this.toPascalCase(respName),
          doc: `Execute ${cmdName} command`,
        });
      }
    }

    return {
      structs: this.structs,
      commands: this.commandMethods,
      primitiveTypes: this.primitives,
    };
  }

  private discoverStruct(name: string, schema: any, isCommand: boolean): void {
    const typeName = this.toPascalCase(name);

    if (this.structs.has(typeName)) {
      return;
    }

    if (typeof schema === 'string') {
      return; // Type reference
    }

    if (typeof schema === 'object' && schema.__typename) {
      const fields: FieldIR[] = [];

      for (const [key, value] of Object.entries(schema)) {
        if (key === '__typename') continue;

        fields.push({
          name: this.toSnakeCase(key),
          originalName: key,
          type: this.resolveType(value),
        });
      }

      this.structs.set(typeName, {
        name: typeName,
        originalName: schema.__typename as string,
        fields,
        isCommand,
      });
    }
  }

  private resolveType(schema: any): TypeIR {
    // Primitive string types
    if (typeof schema === 'string') {
      return this.resolvePrimitiveType(schema);
    }

    // Array types
    if (Array.isArray(schema)) {
      const [type, ...args] = schema;

      switch (type) {
        case 'vector':
          const [elemType] = args[0] as [any];
          if (elemType === 'unsigned char') {
            return { kind: 'primitive', name: 'bytes' };
          }
          return { kind: 'vec', elementType: this.resolveType(elemType) };

        case 'array':
          const [arrayElem, size] = args[0] as [any, number];
          if (arrayElem === 'unsigned char') {
            return { kind: 'primitive', name: 'bytes' };
          }
          return { kind: 'array', elementType: this.resolveType(arrayElem), size };

        case 'optional':
          const [optType] = args[0] as [any];
          return { kind: 'option', elementType: this.resolveType(optType) };

        case 'shared_ptr':
          const [ptrType] = args[0] as [any];
          return this.resolveType(ptrType);

        case 'alias':
          return { kind: 'primitive', name: 'bytes' };

        default:
          throw new Error(`Unknown array type: ${type}`);
      }
    }

    // Inline object schema
    if (typeof schema === 'object' && schema.__typename) {
      const typeName = schema.__typename as string;
      this.discoverStruct(typeName, schema, false);
      return { kind: 'custom', name: this.toPascalCase(typeName) };
    }

    throw new Error(`Cannot resolve type: ${JSON.stringify(schema)}`);
  }

  private resolvePrimitiveType(schema: string): TypeIR {
    const primitiveMap: Record<string, string> = {
      'bool': 'bool',
      'int': 'u32',
      'unsigned int': 'u32',
      'unsigned short': 'u16',
      'unsigned long': 'u64',
      'unsigned char': 'u8',
      'double': 'f64',
      'string': 'String',
      'bin32': 'bytes',
    };

    if (primitiveMap[schema]) {
      return { kind: 'primitive', name: primitiveMap[schema] };
    }

    // Custom type reference
    return { kind: 'custom', name: this.toPascalCase(schema) };
  }

  private toSnakeCase(s: string): string {
    return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
  }

  private toPascalCase(s: string): string {
    if (!s.includes('_') && s.charAt(0) === s.charAt(0).toUpperCase()) {
      return s;
    }
    return s.split('_').map(part =>
      part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    ).join('');
  }
}

/**
 * Base class for language-specific generators that consume IR
 */
export abstract class CodeGenerator {
  abstract generate(ir: SchemaIR): string;
}
