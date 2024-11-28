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

export const mockLogger = {
  debug: (msg: string, data: any) => console.log(msg, data),
  info: (msg: string, data: any) => console.log(msg, data),
  warn: (msg: string, data: any) => console.log(msg, data),
  error: (msg: string, data: any) => console.error(msg, data),
  silent: (msg: string, data: any) => console.log(msg, data),
  verbose: (msg: string, data: any) => console.log(msg, data),
};
