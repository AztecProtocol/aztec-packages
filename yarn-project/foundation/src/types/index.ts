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

/** Is defined type guard */
export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/** Type guard for error classes */
export function isErrorClass<T extends Error>(value: unknown, errorClass: new (...args: any[]) => T): value is T {
  return value instanceof errorClass || (value instanceof Error && value.name === errorClass.name);
}

/** Resolves a record-like type. Lifted from viem. */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/** Returns a type T based on a flag: T if true, undefined if false, optional otherwise. */
export type DefineIfFlag<Opts, Key extends keyof Opts, T> = Opts extends {
  [K in Key]: true;
}
  ? T
  : Opts extends { [K in Key]: false }
    ? never
    : Opts extends { [K in Key]?: boolean }
      ? T | undefined
      : never;

/** Returns a type with fields conditionally required based on a flag */
export type PickIfFlag<
  OptsSchema,
  Opts extends OptsSchema,
  Key extends keyof OptsSchema,
  Field extends object,
> = Opts extends { [K in Key]: true }
  ? Field
  : Opts extends { [K in Key]: false }
    ? {}
    : Opts extends { [K in Key]?: boolean }
      ? Partial<Field>
      : {};

/** Picks only the defined (non-undefined) properties of a type. */
export type PickDefined<T> = Prettify<Pick<T, { [K in keyof T]: T[K] extends undefined ? never : K }[keyof T]>>;

/**
 * Type-safe Event Emitter type
 * @example
 * export type ArchiverEmitter = TypedEventEmitter<{
 *  [L2BlockSourceEvents.L2PruneUnproven]: (args: L2BlockSourceEvent) => void;
 *  [L2BlockSourceEvents.L2BlockProven]: (args: L2BlockSourceEvent) => void;
 * }>;
 * class Archiver extends (EventEmitter as new () => ArchiverEmitter) {
 *  // ...
 * }
 */
export interface TypedEventEmitter<TEventMap extends { [key in keyof TEventMap]: (...args: any[]) => void }> {
  once<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  on<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  off<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  emit<K extends keyof TEventMap>(event: K, ...args: Parameters<TEventMap[K]>): boolean;
  removeListener<K extends keyof TEventMap>(event: K, listener: TEventMap[K]): this;
  removeAllListeners<K extends keyof TEventMap>(event: K): this;
  // Can add other EventEmitter methods if needed, like once(), listenerCount(), etc.
}
