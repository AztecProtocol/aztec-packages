import { ClassConverter, ClassConverterInput } from '../ClassConverter.js';
import { assert, hasOwnProperty } from '../jsUtils.js';

export class JsonProxy {
  classMap: ClassConverter;
  constructor(private handler: any, input: ClassConverterInput) {
    this.classMap = new ClassConverter(input);
  }
  public call(method: string, jsonParams: any[] = []) {
    const convert = (obj: any) => {
      // Is this a convertable type?
      if (obj?.constructor?.fromString) {
        return this.classMap.toClassObj(obj);
      }
      // Leave alone, assume JSON-friendly
      return obj;
    };
    assert(hasOwnProperty(this.handler, method), 'JsonProxy: Method not found!');
    // convert the params from json representation to classes
    const convertedParams = jsonParams.map(convert);
    return convert(this.handler[method](...convertedParams));
  }
}
