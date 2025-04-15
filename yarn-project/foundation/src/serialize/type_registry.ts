import { mapValues } from '../collection/object.js';

type Deserializable = { fromString(str: string): object };

/**
 * Register a class here that has a toJSON method that returns:
 * ```
 * {
 *   "type": "ExampleClassName",
 *   "value": <result of ExampleClassName.toString()>
 * }
 * ```
 * and has an e.g. ExampleClassName.fromString(string) method.
 * This means you can then easily serialize/deserialize the type using JSON.stringify and JSON.parse.
 */
export class TypeRegistry {
  private static registry: Map<string, Deserializable> = new Map();

  public static register(typeName: string, constructor: Deserializable): void {
    this.registry.set(typeName, constructor);
  }

  public static getConstructor(typeName: string): Deserializable | undefined {
    return this.registry.get(typeName);
  }
}

function replace<T>(value: T) {
  if (
    value &&
    typeof value === 'object' &&
    'toString' in value &&
    TypeRegistry.getConstructor(value.constructor.name)
  ) {
    return {
      type: value.constructor.name,
      value: value.toString(),
    };
  }

  return value;
}

// Resolver function that enables JSON serialization of BigInts.
export function resolver(_: any, value: any) {
  if (typeof value === 'bigint') {
    return value.toString() + 'n';
  }

  if (typeof value === 'object' && value) {
    if (Array.isArray(value)) {
      return value.map(replace);
    } else if (Buffer.isBuffer(value)) {
      return { type: 'buffer', value: value.toString('hex') };
    } else {
      return mapValues(value, replace);
    }
  }

  return value;
}

// Reviver function that uses TypeRegistry to instantiate objects.
export function reviver(key: string, value: any) {
  if (typeof value === 'string' && /^\d+n$/.test(value)) {
    return BigInt(value.slice(0, -1));
  }
  if (value && typeof value === 'object' && 'type' in value && 'value' in value) {
    const Constructor = TypeRegistry.getConstructor(value.type);
    if (Constructor) {
      return Constructor.fromString(value.value);
    }
  }
  return value;
}
