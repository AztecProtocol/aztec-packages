import { ClassConverter, ClassConverterInput } from '../ClassConverter.js';
import { assert, hasOwnProperty } from '../jsUtils.js';
import { logTrace } from '../logUtils.js';

export class JsonProxy {
  classMap: ClassConverter;
  constructor(private handler: object, input: ClassConverterInput) {
    this.classMap = new ClassConverter(input);
  }
  public call(methodName: string, jsonParams: any[] = []) {
    // Get access to our class members
    const proto = Object.getPrototypeOf(this.handler);
    const convert = (obj: any): any => {
      // Is this a convertible type?
      if (obj.constructor.fromString) {
        return this.classMap.toJsonObj(obj);
      }
      // Is this an array?
      if (Array.isArray(obj)) {
        return obj.map((x: any) => convert(x));
      }
      // Is this a dictionary?
      if (obj.constructor === Object) {
        const newObj: any = {};
        for (const key of Object.keys(obj)) {
          newObj[key] = convert(obj[key]);
        }
        return newObj;
      }

      // Leave alone, assume JSON primitive
      return obj;
    };
    assert(hasOwnProperty(proto, methodName), 'JsonProxy: Method not found!');
    // convert the params from json representation to classes
    const convertedParams = jsonParams.map(convert);
    logTrace('JsonProxy:call', this.handler, methodName, '<-', convertedParams);
    const ret = convert((this.handler as any)[methodName](...convertedParams));
    logTrace('JsonProxy:call', this.handler, methodName, '->', ret);
    return ret;
  }
}
