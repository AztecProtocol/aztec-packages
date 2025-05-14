/** Strips methods of a type. */
export type FieldsOf<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [P in keyof T as T[P] extends Function ? never : P]: T[P];
};

/** Extracts methods of a type. */
export type FunctionsOf<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [P in keyof T as T[P] extends Function ? P : never]: T[P];
};

/** Marks a set of properties of a type as optional. */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** Removes readonly modifiers for a type. */
export type Writeable<T> = { -readonly [P in keyof T]: T[P] };

/** Removes readonly modifiers for an object. */
export function unfreeze<T>(obj: T): Writeable<T> {
  return obj as Writeable<T>;
}

/** Maybe exists, maybe not. */
export type Maybe<T extends object> = T | unknown;

// More flexible TypedEventEmitter definition
// It expects an object where keys are event names (string or symbol)
// and values are listener functions.
// See Archiver for an example of how to use this.
export interface TypedEventEmitter<TEventMap extends { [key in keyof TEventMap]: (...args: any[]) => void }> {
  on<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  off<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  emit<K extends keyof TEventMap>(event: K, ...args: Parameters<TEventMap[K]>): boolean;
  removeListener<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  // Can add other EventEmitter methods if needed, like once(), listenerCount(), etc.
}
