/** Strips methods of a type. */
export type FieldsOf<T> = {
  [P in keyof T as T[P] extends Function ? never : P]: T[P];
};

/** Extracts methods of a type. */
export type FunctionsOf<T> = {
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

/**
 * Type-safe Event Emitter type
 * @example
 * export type ArchiverEmitter = TypedEventEmitter<{
 *  [L2BlockSourceEvents.L2PruneDetected]: (args: L2BlockSourceEvent) => void;
 *  [L2BlockSourceEvents.L2BlockProven]: (args: L2BlockSourceEvent) => void;
 * }>;
 * class Archiver extends (EventEmitter as new () => ArchiverEmitter) {
 *  // ...
 * }
 */
export interface TypedEventEmitter<TEventMap extends { [key in keyof TEventMap]: (...args: any[]) => void }> {
  on<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  off<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  emit<K extends keyof TEventMap>(event: K, ...args: Parameters<TEventMap[K]>): boolean;
  removeListener<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  // Can add other EventEmitter methods if needed, like once(), listenerCount(), etc.
}
