/**
 * Schema Visitor - Minimal abstraction over raw msgpack schema
 *
 * Philosophy:
 *   - Keep raw schema structure
 *   - Resolve type references into a graph
 *   - No normalization - languages handle their own conventions
 *   - Output is "compiled schema" with resolved types
 */

export type PrimitiveType = 'bool' | 'u8' | 'u16' | 'u32' | 'u64' | 'f64' | 'string' | 'bytes' | 'field2';

export interface Type {
  kind: 'primitive' | 'vector' | 'array' | 'optional' | 'struct';
  primitive?: PrimitiveType;
  element?: Type;  // For vector, array, optional
  size?: number;   // For array
  struct?: Struct; // For struct types
}

export interface Field {
  name: string;
  type: Type;
}

export interface Struct {
  name: string;
  fields: Field[];
}

export interface Command {
  name: string;
  fields: Field[];
  responseType: string;
}

export interface CompiledSchema {
  // All unique struct types discovered
  structs: Map<string, Struct>;

  // Command -> Response mappings
  commands: Command[];

  // Response types
  responses: Map<string, Struct>;
}

/**
 * SchemaVisitor - Walks raw msgpack schema and resolves references
 */
export class SchemaVisitor {
  private structs = new Map<string, Struct>();
  private responses = new Map<string, Struct>();

  visit(commandsSchema: any, responsesSchema: any): CompiledSchema {
    // Reset state
    this.structs.clear();
    this.responses.clear();

    const commands: Command[] = [];

    // Schema format: ["named_union", [[name, schema], ...]]
    const commandPairs = commandsSchema[1] as Array<[string, any]>;
    const responsePairs = responsesSchema[1] as Array<[string, any]>;

    // First, visit all response types (including ErrorResponse)
    for (const [respName, respSchema] of responsePairs) {
      if (typeof respSchema !== 'string') {
        const respStruct = this.visitStruct(respName, respSchema);
        this.responses.set(respName, respStruct);
      }
    }

    // Visit all commands and pair with responses
    for (let i = 0; i < commandPairs.length; i++) {
      const [cmdName, cmdSchema] = commandPairs[i];
      // Find matching response (skip ErrorResponse which is always last)
      const normalResponses = responsePairs.filter(([name]: [string, any]) => name !== 'ErrorResponse');
      const [respName] = normalResponses[i];

      // Discover command structure
      const cmdStruct = this.visitStruct(cmdName, cmdSchema);
      this.structs.set(cmdName, cmdStruct);

      // Create command mapping
      commands.push({
        name: cmdName,
        fields: cmdStruct.fields,
        responseType: respName,
      });
    }

    return {
      structs: this.structs,
      commands,
      responses: this.responses,
    };
  }

  private visitStruct(name: string, schema: any): Struct {
    const fields: Field[] = [];

    // Schema is an object with __typename and fields
    for (const [key, value] of Object.entries(schema)) {
      if (key === '__typename') continue;

      fields.push({
        name: key,
        type: this.visitType(value),
      });
    }

    return { name, fields };
  }

  private visitType(schema: any): Type {
    // Primitive string type
    if (typeof schema === 'string') {
      return this.resolvePrimitive(schema);
    }

    // Array type descriptor: ['vector', [elementType]]
    if (Array.isArray(schema)) {
      const [kind, args] = schema;

      switch (kind) {
        case 'vector': {
          const [elemType] = args as [any];
          // Special case: vector<unsigned char> = bytes
          if (elemType === 'unsigned char') {
            return { kind: 'primitive', primitive: 'bytes' };
          }
          return {
            kind: 'vector',
            element: this.visitType(elemType),
          };
        }

        case 'array': {
          const [elemType, size] = args as [any, number];
          // Special case: array<unsigned char, N> = bytes
          if (elemType === 'unsigned char') {
            return { kind: 'primitive', primitive: 'bytes' };
          }
          return {
            kind: 'array',
            element: this.visitType(elemType),
            size,
          };
        }

        case 'optional': {
          const [elemType] = args as [any];
          return {
            kind: 'optional',
            element: this.visitType(elemType),
          };
        }

        case 'shared_ptr': {
          // Dereference shared_ptr - just use inner type
          const [innerType] = args as [any];
          return this.visitType(innerType);
        }

        case 'alias': {
          // Alias types (like uint256_t) are treated as bytes
          return { kind: 'primitive', primitive: 'bytes' };
        }

        default:
          throw new Error(`Unknown type kind: ${kind}`);
      }
    }

    // Inline struct definition
    if (typeof schema === 'object' && schema.__typename) {
      const structName = schema.__typename as string;
      // Check if already visited
      if (!this.structs.has(structName)) {
        const struct = this.visitStruct(structName, schema);
        this.structs.set(structName, struct);
      }
      return {
        kind: 'struct',
        struct: this.structs.get(structName)!,
      };
    }

    throw new Error(`Cannot resolve type: ${JSON.stringify(schema)}`);
  }

  private resolvePrimitive(name: string): Type {
    const primitiveMap: Record<string, PrimitiveType> = {
      'bool': 'bool',
      'int': 'u32',
      'unsigned int': 'u32',
      'unsigned short': 'u16',
      'unsigned long': 'u64',
      'unsigned char': 'u8',
      'double': 'f64',
      'string': 'string',
      'bin32': 'bytes',
      'field2': 'field2',  // Extension field (Fq2) - pair of field elements
    };

    const primitive = primitiveMap[name];
    if (primitive) {
      return { kind: 'primitive', primitive };
    }

    // Unknown primitive - treat as struct reference
    // This will be resolved later if it's a real struct
    return {
      kind: 'struct',
      struct: { name, fields: [] }, // Placeholder
    };
  }
}
