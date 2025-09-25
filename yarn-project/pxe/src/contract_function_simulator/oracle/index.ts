import type { Oracle } from './oracle.js';

export * from './oracle.js';
export * from './interfaces.js';

/**
 * A conditional type that takes a type `T` and returns a union of its method names.
 */
type MethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? K : never;
}[keyof T];

/**
 * Available oracle function names.
 */
export type ORACLE_NAMES = MethodNames<Oracle>;
