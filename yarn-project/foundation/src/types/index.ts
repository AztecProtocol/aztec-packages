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
