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
    const convert = (obj: any) => {
      // Is this a convertible type?
      if (obj.constructor.fromString) {
        return this.classMap.toJsonObj(obj);
      }
      // Leave alone, assume JSON-friendly
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
