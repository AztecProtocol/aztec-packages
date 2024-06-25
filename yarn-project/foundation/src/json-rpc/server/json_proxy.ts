import { format } from 'util';

import { createDebugLogger } from '../../log/index.js';
import { convertFromJsonObj, convertToJsonObj } from '../convert.js';
import { assert, hasOwnProperty } from '../js_utils.js';
import { ClassConverter, ClassConverterInput } from '../class_converter.js';

const log = createDebugLogger('json-rpc:json_proxy');

/**
 * Handles conversion of objects over the write.
 * Delegates to a ClassConverter object.
 */
export class JsonProxy {
  classConverter: ClassConverter;
  constructor(
    private handler: object,
    private classMap: ClassConverterInput,
  ) {
    this.classConverter = new ClassConverter(classMap);
  }
  /**
   * Call an RPC method.
   * @param methodName - The RPC method.
   * @param jsonParams - The RPG parameters.
   * @param skipConversion - Whether to skip conversion of the parameters.
   * @returns The remote result.
   */
  public async call(methodName: string, jsonParams: any[] = [], skipConversion = false) {
    log.debug(format(`JsonProxy:call`, methodName, jsonParams));
    // Get access to our class members
    const proto = Object.getPrototypeOf(this.handler);
    assert(hasOwnProperty(proto, methodName), `JsonProxy: Method ${methodName} not found!`);
    assert(Array.isArray(jsonParams), `JsonProxy: ${methodName} params not an array: ${jsonParams}`);
    // convert the params from json representation to classes
    let convertedParams = jsonParams;
    if (!skipConversion) {
      convertedParams = jsonParams.map(param => convertFromJsonObj(this.classConverter, param));
    }
    log.debug(format('JsonProxy:call', methodName, '<-', convertedParams));
    const rawRet = await (this.handler as any)[methodName](...convertedParams);
    let ret = rawRet;
    if (!skipConversion) {
      ret = convertToJsonObj(this.classConverter, rawRet);
    }
    log.debug(format('JsonProxy:call', methodName, '->', ret));
    return ret;
  }
}
