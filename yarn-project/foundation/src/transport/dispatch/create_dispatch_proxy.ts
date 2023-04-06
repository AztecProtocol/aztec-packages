import { DispatchMsg } from './create_dispatch_fn.js';
import { TransportClient } from '../transport_client.js';
import { EventEmitter } from 'events';
import { isTransferDescriptor, TransferDescriptor } from '../interface/transferable.js';

type FilterOutAttributes<Base> = {
  [Key in keyof Base]: Base[Key] extends (...any: any) => any ? Base[Key] : never;
};

type PromisifyFunction<F extends (...any: any) => any> = (...args: Parameters<F>) => Promise<ReturnType<F>>;

type Promisify<Base extends { [key: string]: (...any: any) => any }> = {
  [Key in keyof Base]: ReturnType<Base[Key]> extends Promise<any> ? Base[Key] : PromisifyFunction<Base[Key]>;
};

type TransferTypes<Tuple extends [...args: any]> = {
  [Index in keyof Tuple]: Tuple[Index] | (Tuple[Index] extends Transferable ? TransferDescriptor<Tuple[Index]> : never);
};

/**
 * Annoying: https://github.com/microsoft/TypeScript/issues/29919
 * There's a bug that means we can't map over the tuple or function parameter types to make them transferrable, if
 * we use the Parameters builtin, and then try to map.
 * So instead we inline the Parameters builtin and apply the TransferTypes to the parameters within the inline.
 * Once the above is fixed we could in theory just do:
 *
 * type MakeFunctionTransferrable<TFunction extends (...args: any) => any> = (
 *   ...args: TransferTypes<Parameters<TFunction>>
 * ) => ReturnType<TFunction>;
 */
type MakeFunctionTransferrable<TFunction extends (...args: any) => any> = (
  ...args: TFunction extends (...args: infer P) => any ? TransferTypes<P> : never
) => ReturnType<TFunction>;

type Transferrable<Base extends { [key: string]: (...any: any) => any }> = {
  [Key in keyof Base]: MakeFunctionTransferrable<Base[Key]>;
};

export type Proxify<T> = Promisify<Transferrable<FilterOutAttributes<T>>>;

/**
 * Creates a proxy object for the provided class, wrapping each method in a request function.
 * The resulting proxy object allows invoking methods of the original class, but their execution
 * is delegated to the request function. This is useful when executing methods across different
 * environments or threads, such as Web Workers or Node.js processes.
 *
 * @typeParam T - The type of the class to create a proxy for.
 * @param class_ - The class constructor to create a proxy for.
 * @param requestFn - A higher-order function that takes a method name and returns a function
 *                    with the same signature as the original method, which wraps the actual
 *                    invocation in a custom logic (e.g., sending a message to another thread).
 * @returns An object whose methods match those of the original class, but whose execution is
 *          delegated to the provided request function.
 */
export function createDispatchProxyFromFn<T>(
  class_: { new (...args: any[]): T },
  requestFn: (fn: string) => (...args: any[]) => Promise<any>,
): Proxify<T> {
  const proxy: any = class_.prototype instanceof EventEmitter ? new EventEmitter() : {};
  for (const fn of Object.getOwnPropertyNames(class_.prototype)) {
    if (fn === 'constructor') {
      continue;
    }
    proxy[fn] = requestFn(fn);
  }
  return proxy;
}

/**
 * Creates a proxy for the given class that transparently dispatches method calls over a transport client.
 * The proxy allows calling methods on remote instances of the class through the provided transport client
 * while maintaining the correct return types and handling promises. If the class inherits from EventEmitter,
 * it also handles event emissions through the transport client.
 *
 * @param class_ - The constructor function of the class to create the proxy for.
 * @param transportClient - The TransportClient instance used to handle communication between proxies.
 * @returns A proxified version of the given class with methods dispatched over the transport client.
 */
export function createDispatchProxy<T>(
  class_: { new (...args: any[]): T },
  transportClient: TransportClient<DispatchMsg>,
): Proxify<T> {
  // Create a proxy of class_ that passes along methods over our transportClient
  const proxy = createDispatchProxyFromFn(class_, (fn: string) => (...args: any[]) => {
    // Pass our proxied function name and arguments over our transport client
    const transfer: Transferable[] = args.reduce(
      (acc, a) => (isTransferDescriptor(a) ? [...acc, ...a.transferables] : acc),
      [] as Transferable[],
    );
    args = args.map(a => (isTransferDescriptor(a) ? a.send : a));
    return transportClient.request({ fn, args }, transfer);
  });
  if (proxy instanceof EventEmitter) {
    // Handle proxied 'emit' calls if our proxy object is an EventEmitter
    transportClient.on('event_msg', ({ fn, args }) => {
      if (fn === 'emit') {
        const [eventName, ...restArgs] = args;
        proxy.emit(eventName, ...restArgs);
      }
    });
  }
  return proxy;
}
