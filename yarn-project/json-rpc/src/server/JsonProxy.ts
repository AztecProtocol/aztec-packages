import { ClassConverter, ClassConverterInput } from '../ClassConverter.js';
import { convertFromJsonObj, convertToJsonObj } from '../convert.js';
import { assert, hasOwnProperty } from '../jsUtils.js';
import { logTrace } from '../logUtils.js';

export class JsonProxy {
  classConverter: ClassConverter;
  constructor(private handler: object, input: ClassConverterInput) {
    this.classConverter = new ClassConverter(input);
  }
  public async call(methodName: string, jsonParams: any[] = []) {
    // Get access to our class members
    const proto = Object.getPrototypeOf(this.handler);
    assert(hasOwnProperty(proto, methodName), 'JsonProxy: Method not found!');
    assert(Array.isArray(jsonParams), 'JsonProxy: Params not an array!');
    // convert the params from json representation to classes
    const convertedParams = jsonParams.map(param => convertFromJsonObj(this.classConverter, param));
    logTrace('JsonProxy:call', this.handler, methodName, '<-', convertedParams);
    const rawRet = await (this.handler as any)[methodName](...convertedParams);
    const ret = convertToJsonObj(this.classConverter, rawRet);
    logTrace('JsonProxy:call', this.handler, methodName, '->', ret);
    return ret;
  }
}
