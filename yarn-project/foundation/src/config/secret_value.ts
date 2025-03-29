import { type ZodType } from 'zod';

/**
 * A class wrapping a secret value to protect it from accidently being leaked in logs
 */
export class SecretValue<T> {
  /** The secret value */
  #value: T;

  constructor(value: T, private readonly redactedValue = '[Redacted]') {
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

  /**
   * Returns a Zod schema
   */
  static schema<O>(valueSchemaalueSchema: ZodType<O, any, any>): ZodType<SecretValue<O>, any, any> {
    return valueSchemaalueSchema.transform(value => new SecretValue<O>(value));
  }
}
