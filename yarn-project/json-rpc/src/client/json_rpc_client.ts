import { retry } from '../js_utils.js';
import { logTrace } from '../log_utils.js';
// comlink:
//  Dev dependency just for the somewhat complex RemoteObject type
//  This takes a {foo(): T} and makes {foo(): Promise<T>}
//  while avoiding Promise of Promise.
import { RemoteObject } from 'comlink';
import { ClassConverter, ClassConverterInput } from '../class_converter.js';
import { convertFromJsonObj, convertToJsonObj } from '../convert.js';

export async function defaultFetch(host: string, method: string, body: any) {
  logTrace(`JsonRpcClient.fetch`, host, method, '<-', body);
  const resp = await fetch(`${host}/${method}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

  if (!resp.ok) {
    throw new Error(resp.statusText);
  }

  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse body as JSON: ${text}`);
  }
}

export async function mustSucceedFetch(host: string, method: string, body: any) {
  return await retry(() => defaultFetch(host, method, body), 'JsonRpcClient request');
}
/**
 * Creates a Proxy object that delegates over RPC
 * and satisfies RemoteObject<T>
 * The server should have ran new JsonRpcServer()
 */
export function createJsonRpcClient<T extends object>(
  host: string,
  classMap: ClassConverterInput,
  fetch = defaultFetch,
) {
  const classConverter = new ClassConverter(classMap);
  let id = 0;
  const request = async (method: string, params: any[]): Promise<any> => {
    const body = {
      jsonrpc: '2.0',
      id: id++,
      method,
      params: params.map(param => convertToJsonObj(classConverter, param)),
    };
    logTrace(`JsonRpcClient.request`, method, '<-', params);
    const res = await fetch(host, method, body);
    logTrace(`JsonRpcClient.request`, method, '->', res);
    if (res.error) {
      throw res.error;
    }
    return convertFromJsonObj(classConverter, res.result);
  };

  // Intercept any RPC methods with a proxy
  // This wraps 'request' with a method-call syntax wrapper
  return new Proxy(
    {},
    {
      get:
        (_, method: string) =>
        (...params: any[]) => {
          logTrace(`JsonRpcClient.constructor`, 'proxy', method, '<-', params);
          return request(method, params);
        },
    },
  ) as RemoteObject<T>;
}
