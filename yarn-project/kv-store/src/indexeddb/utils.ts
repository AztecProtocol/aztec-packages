import { type Logger } from '@aztec/foundation/log';

export async function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onerror = _ => {
      reject(request.error);
    };
    request.onsuccess = _ => {
      resolve(request.result);
    };
  });
}

export const mockLogger: Logger = {
  debug: (msg, data) => console.log(msg, data),
  info: (msg, data) => console.log(msg, data),
  warn: (msg, data) => console.log(msg, data),
  error: (msg, data) => console.error(msg, data),
  silent: (msg, data) => console.log(msg, data),
  verbose: (msg, data) => console.log(msg, data),
};
