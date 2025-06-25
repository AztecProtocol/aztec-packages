import { inspect } from 'util';
import type { ZodType } from 'zod';

/**
 * A class wrapping a secret value to protect it from accidently being leaked in logs
 */
export class SecretValue<T> {
  /** The secret value. Use a private member field so that it's not visible to the outside */
  #value: T;

  constructor(
    value: T,
    private readonly redactedValue = '[Redacted]',
  ) {
    this.#value = value;
  }

  /**
   * Returns the wrapped value
   */
  public getValue(): T {
    return this.#value;
  }

  /**
   * Returns a redacted string representation of the value
   */
  public toString(): string {
    return this.redactedValue;
  }

  /**
   * Returns a redacted string representation of the value
   */
  public toJSON(): string {
    return this.redactedValue;
  }

  public [inspect.custom]() {
    return this.toString();
  }

  /**
   * Returns a Zod schema
   */
  static schema<O>(valueSchema: ZodType<O, any, any>): ZodType<SecretValue<O>, any, any> {
    return valueSchema.transform(value => new SecretValue<O>(value));
  }
}
