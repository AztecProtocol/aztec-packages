/** Returns a new object with the same keys and where each value has been passed through the mapping function. */
export function mapValues<K extends string | number | symbol, T, U>(
  obj: Record<K, T>,
  fn: (value: T, key: K) => U,
): Record<K, U>;
export function mapValues<K extends string | number | symbol, T, U>(
  obj: Partial<Record<K, T>>,
  fn: (value: T, key: K) => U,
): Partial<Record<K, U>>;
export function mapValues<K extends string | number | symbol, T, U>(
  obj: Record<K, T>,
  fn: (value: T, key: K) => U,
): Record<K, U> {
  const result: Record<K, U> = {} as Record<K, U>;
  for (const key in obj) {
    result[key] = fn(obj[key], key);
  }
  return result;
}

/** Returns a new object where all keys with undefined values have been removed. */
export function compact<T extends object>(obj: T): { [P in keyof T]+?: Exclude<T[P], undefined> } {
  const result: any = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}

/** Returns a new object by picking the given keys. */
export function pick<T extends object, U extends keyof T>(object: T, ...props: U[]): Pick<T, U>;
export function pick<T extends object>(object: T, ...props: string[]): Partial<T>;
export function pick<T extends object>(object: T, ...props: string[]): Partial<T> {
  const obj: any = {};
  for (const prop of props) {
    obj[prop] = (object as any)[prop];
  }
  return obj;
}

/** Returns a new object by omitting the given keys. */
export function omit<T extends object, K extends keyof T>(object: T, ...props: K[]): Omit<T, K>;
export function omit<T extends object>(object: T, ...props: string[]): Partial<T>;
export function omit<T extends object>(object: T, ...props: string[]): Partial<T> {
  const obj: any = { ...object };
  for (const prop of props) {
    delete obj[prop];
  }
  return obj;
}
