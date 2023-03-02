import { assert, hasOwnProperty } from './jsUtils.js';

/**
 * IOClass:
 *  Represents a class compatible with our class conversion system
 *  e.g. PublicKey here satisfies 'IOClass'
 *    class PublicKey {
 *      toString() {
 *        return '...';
 *      }
 *      static fromString(str) {
 *        return new PublicKey(...);
 *      }
 *    }
 */
interface IOClass {
  new (...args: any): any;
  fromString: (str: string) => any;
}

export interface ClassConverterInput {
  [className: string]: IOClass;
}

/**
 * Handles mapping of classes to names, and calling toString and fromString
 * to convert to and from JSON-friendly formats
 */
export class ClassConverter {
  private toClass = new Map<string, IOClass>();
  private toName = new Map<IOClass, string>();

  constructor(input: ClassConverterInput) {
    for (const key of Object.keys(input)) {
      this.register(key, input[key]);
    }
  }
  register(type: string, class_: IOClass) {
    assert(type !== 'Buffer', "'Buffer' handling is hardcoded. Cannot use as name.");
    assert(hasOwnProperty(class_.prototype, 'toString'), `Class ${type} must define a toString() method.`);
    assert(class_['fromString'], `Class ${type} must define a fromString() static method.`);
    this.toName.set(class_, type);
    this.toClass.set(type, class_);
  }
  toClassObj(jsonObj: { type: string; data: string }) {
    const class_ = this.toClass.get(jsonObj.type);
    assert(class_, `Could not find type in lookup.`);
    return class_!.fromString(jsonObj.data);
  }
  toJsonObj(classObj: any) {
    const type = this.toName.get(classObj.constructor);
    assert(type, `Could not find class in lookup.`);
    return { type: type!, data: classObj.toString() };
  }
}
