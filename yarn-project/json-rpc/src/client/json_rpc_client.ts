import { retry } from '../js_utils.js';
import { logTrace } from '../log_utils.js';
// comlink:
//  Dev dependency just for the somewhat complex RemoteObject type
//  This takes a {foo(): T} and makes {foo(): Promise<T>}
//  while avoiding Promise of Promise.
import { RemoteObject } from 'comlink';
import { ClassConverter, ClassConverterInput } from '../class_converter.js';
import { convertFromJsonObj, convertToJsonObj } from '../convert.js';

export class JsonRpcClient<T extends object> {
  private classConverter: ClassConverter;
  public readonly rpc: RemoteObject<T>;
  private id = 0;

  constructor(private host: string, classMap: ClassConverterInput, private netMustSucceed = false) {
    // the rpc object has syntax sugar over 'request'
    // for accessing the remote methods
    this.rpc = this.createRpcProxy();
    this.classConverter = new ClassConverter(classMap);
  }
  /**
   * Creates a Proxy object that delegates over RPC
   * and satisfies RemoteObject<T>
   */
  private createRpcProxy(): RemoteObject<T> {
    return new Proxy(
      {},
      {
        get:
          (_, method: string) =>
          (...params: any[]) => {
            logTrace(`JsonRpcClient.constructor`, 'proxy', method, '<-', params);
            return this.request(method, params);
          },
      },
    ) as RemoteObject<T>;
  }
  public async request(method: string, params: any[]): Promise<any> {
    const body = {
      jsonrpc: '2.0',
      id: this.id++,
      method,
      params: params.map(param => convertToJsonObj(this.classConverter, param)),
    };
    logTrace(`JsonRpcClient.request`, method, '<-', params);
    const res = await this.fetch(method, body);
    logTrace(`JsonRpcClient.request`, method, '->', res);
    if (res.error) {
      throw res.error;
    }
    return convertFromJsonObj(this.classConverter, res.result);
  }

  private async fetch(method: string, body: any) {
    const tryOnce = async () => {
      logTrace(`JsonRpcClient.fetch`, this.host, method, '<-', body);
      const resp = await fetch(`${this.host}/${method}`, {
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
    };

    if (this.netMustSucceed) {
      return await retry(tryOnce, 'JsonRpcClient request');
    }

    return await tryOnce();
  }
}
