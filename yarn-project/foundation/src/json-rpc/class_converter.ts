import { convertFromJsonObj, convertToJsonObj } from './convert.js';
import { assert } from './js_utils.js';

/**
 * Represents a class compatible with our class conversion system.
 * E.g. PublicKey here satisfies 'StringIOClass'.
 * ```
 *    class PublicKey {
 *      toString() {
 *        return '...';
 *      }
 *      static fromString(str) {
 *        return new PublicKey(...);
 *      }
 *    }
 * ```
 */
interface StringIOClass {
  new (...args: any): any;

  // TODO(#4254): Ensure that toString method is checked for as well.

  /**
   * Creates an IOClass from a given string.
   */
  fromString: (str: string) => any;
}

/**
 * Represents a class compatible with our class conversion system.
 * E.g. PublicKey here satisfies 'ObjIOClass'.
 * ```
 *    class PublicKey {
 *      toJSON() {
 *        return {...};
 *      }
 *      static fromJSON(obj) {
 *        return new PublicKey({...});
 *      }
 *    }
 * ```
 */
interface ObjIOClass {
  new (...args: any): any;

  // TODO(#4254): Ensure that toJSON method is checked for as well.

  /**
   * Creates an IOClass from a given JSON object.
   */
  fromJSON: (str: object) => any;
}

/**
 * Represents a class compatible with our class conversion system.
 * E.g. PublicKey here satisfies 'BufferIOClass'.
 * ```
 *    class PublicKey {
 *      toJSON() {
 *        return {...};
 *      }
 *      static fromJSON(obj) {
 *        return new PublicKey({...});
 *      }
 *    }
 * ```
 */
interface BufferIOClass {
  new (...args: any): any;

  // TODO(#4254): Ensure that toJSON method is checked for as well.

  /**
   * Creates an IOClass from a given JSON object.
   */
  fromBuffer: (buffer: Buffer) => any;
}

/**
 * Either a StringIOClass or ObjIOClass
 */
type IOClass = ObjIOClass | StringIOClass | BufferIOClass;

/**
 * Registered classes available for conversion.
 */
export interface StringClassConverterInput {
  [className: string]: StringIOClass;
}

/**
 * Registered classes available for conversion.
 */
export interface JsonClassConverterInput {
  [className: string]: ObjIOClass;
}

/**
 * Registered classes available for conversion.
 */
export interface BufferClassConverterInput {
  [className: string]: BufferIOClass;
}

/**
 * Registered classes available for conversion.
 */
export interface PlainClassConverterInput {
  [className: string]: any;
}
export interface ClassConverterInput {
  fromString?: StringClassConverterInput;
  fromJSON?: JsonClassConverterInput;
  fromBuffer?: BufferClassConverterInput;
  fromMembers?: PlainClassConverterInput;
}

/**
 * Represents a class in a JSON, string or buffer encoding.
 */
export interface EncodedClass {
  /**
   * The class type.
   */
  type: string;
  /**
   * The class data string. Could be an object, string or (base64) buffer.
   */
  data: any;
}
/**
 * Whether a class is a complex object or simply represented by a string.
 */
export type ClassEncoding = 'string' | 'object' | 'buffer' | 'plain';

/**
 * Handles mapping of classes to names, and calling toString and fromString to convert to and from JSON-friendly formats.
 * Takes a class map as input.
 */
export class ClassConverter {
  private toClass = new Map<string, [IOClass, ClassEncoding]>();
  private toName = new Map<IOClass, [string, ClassEncoding]>();

  /**
   * Create a class converter from a table of classes.
   * @param stringClassMap - The class table of string encoded classes.
   * @param objectClassMap - The class table of complex object classes
   * @param bufferClassMap - The class table of buffer encoded classes
   */
  constructor(
    input: ClassConverterInput = {}
  ) {
    if (input.fromString) {
      for (const key of Object.keys(input.fromString)) {
        this.register(key, input.fromString[key], 'string');
      }
    }
    if (input.fromJSON) {
      for (const key of Object.keys(input.fromJSON)) {
        this.register(key, input.fromJSON[key], 'object');
      }
    }
    if (input.fromBuffer) {
      for (const key of Object.keys(input.fromBuffer)) {
        this.register(key, input.fromBuffer[key], 'buffer');
      }
    }
    if (input.fromMembers) {
      for (const key of Object.keys(input.fromMembers)) {
        this.register(key, input.fromMembers[key], 'plain');
      }
    }
  }

  /**
   * Register a class with a certain name.
   * This name is used for conversion from and to this class.
   * @param type - The class name to use for serialization.
   * @param class_ - The class object.
   * @param encoding - Whether the class is a complex object or simply represented by a string.
   */
  register(type: string, class_: IOClass, encoding: ClassEncoding) {
    assert(type !== 'Buffer', "'Buffer' handling is hardcoded. Cannot use as name.");
    this.toName.set(class_, [type, encoding]);
    this.toClass.set(type, [class_, encoding]);
  }

  /**
   * Does this type name have a registered class?
   * @param type - The type name.
   * @returns If there's a registered class.
   */
  isRegisteredClassName(type: string) {
    return this.toClass.has(type);
  }
  /**
   * Is this class object registered?
   * @param obj - The class object.
   * @returns If it is a registered class.
   */
  isRegisteredClass(obj: any) {
    const name = obj.prototype.constructor.name;
    return this.toName.has(obj) || this.isRegisteredClassName(name);
  }
  /**
   * Convert a JSON-like object to a class object.
   * @param jsonObj - An object encoding a class.
   * @returns The class object.
   */
  toClassObj(jsonObj: EncodedClass): any {
    const result = this.toClass.get(jsonObj.type);
    assert(result, `Could not find type in lookup.`);

    const [class_, encoding] = result;
    switch (encoding) {
      case 'plain': {
        const obj = Object.create(class_.prototype);
        for (const [key, value] of Object.entries(jsonObj.data)) {
          obj[key] = convertFromJsonObj(this, value);
        }
        return obj;
      }
      case 'string':
        return (class_ as StringIOClass).fromString(jsonObj.data);
      case 'object':
        return (class_ as ObjIOClass).fromJSON(jsonObj.data as object);
      case 'buffer':
        return (class_ as BufferIOClass).fromBuffer(Buffer.from(jsonObj.data, 'base64'));
      default:
        throw new Error('unexpected case');
    }
  }
  /**
   * Convert a class object to a JSON object.
   * @param classObj - A JSON encoding a class.
   * @returns The class object.
   */
  toJsonObj(classObj: any): EncodedClass {
    const { type, encoding } = this.lookupObject(classObj);
    switch (encoding) {
      case 'plain':
        return { type: type!, data: convertToJsonObj(this, { ...classObj }) };
      case 'string':
        return { type: type!, data: classObj.toString() };
      case 'object':
        return { type: type!, data: classObj.toJSON() };
      case 'buffer':
        return { type: type!, data: classObj.toBuffer().toString('base64') };
      default:
        throw new Error('unexpected case');
    }
  }

  /**
   * Loads the corresponding type for this class based on constructor first and constructor name if not found.
   * Constructor match works in the event of a minifier changing function names, and constructor name match
   * works in the event of duplicated instances of node modules being loaded (see #1826).
   * @param classObj - Object to lookup in the registered types.
   * @returns Registered type name and encoding.
   */
  private lookupObject(classObj: any) {
    const nameResult = this.toName.get(classObj.constructor);
    if (nameResult) {
      return { type: nameResult[0], encoding: nameResult[1] };
    }
    const classResult = this.toClass.get(classObj.constructor.name);
    if (classResult) {
      return { type: classObj.constructor.name, encoding: classResult[1] };
    }
    throw new Error(`Could not find class ${classObj.constructor.name} in lookup.`);
  }
}
