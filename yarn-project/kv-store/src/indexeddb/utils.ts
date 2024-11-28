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
