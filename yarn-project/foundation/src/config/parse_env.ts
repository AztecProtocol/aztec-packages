/** Parses an env var as boolean. Returns true only if value is 1, true, or TRUE. */
export function parseBooleanEnv(val: string | undefined): boolean {
  return val !== undefined && ['1', 'true', 'TRUE'].includes(val);
}

/** Parses a comma-separated env var into trimmed non-empty strings. */
export function parseCommaSeparated(val: string): string[] {
  return val
    .split(',')
    .map(item => item.trim())
    .filter(item => item.length > 0);
}

/**
 * Parses an integer env var. If the value is not a safe integer, returns `defaultValue`.
 */
export function parseIntegerEnv(value: string, defaultValue: number): number {
  const parsedValue = parseInt(value, 10);
  return Number.isSafeInteger(parsedValue) ? parsedValue : defaultValue;
}

/**
 * Parses a floating-point env var. If the value is not a number, returns `defaultValue`.
 */
export function parseFloatEnv(value: string, defaultValue: number): number {
  const parsedValue = parseFloat(value);
  return Number.isNaN(parsedValue) ? defaultValue : parsedValue;
}

/**
 * Parses an env var to a 0–1 percentage. Throws if the result is outside [0, 1].
 */
export function parsePercentageEnv(val: string, defaultValue: number): number {
  const parsed = parseFloatEnv(val, defaultValue);
  if (parsed < 0 || parsed > 1) {
    throw new TypeError(`Invalid percentage value: ${parsed} should be between 0 and 1`);
  }
  return parsed;
}

/** Parses an env var as a safe integer. Throws if the value is invalid. */
export function parseStrictIntegerEnv(val: string): number {
  const parsedValue = parseInt(val, 10);
  if (!Number.isSafeInteger(parsedValue)) {
    throw new Error(`Invalid number: ${val}`);
  }
  return parsedValue;
}

/** Parses an env var as bigint, including scientific notation. */
export function parseBigIntEnv(val: string): bigint {
  if (/[eE]/.test(val)) {
    const match = val.match(/^(-?\d+(?:\.(\d+))?)[eE]([+-]?\d+)$/);
    if (!match) {
      throw new Error(`Cannot convert '${val}' to a BigInt`);
    }
    const digits = match[1].replace('.', '');
    const decimalPlaces = match[2]?.length ?? 0;
    const exponent = parseInt(match[3], 10) - decimalPlaces;
    if (exponent < 0) {
      throw new Error(`Cannot convert '${val}' to a BigInt: result is not an integer`);
    }
    return BigInt(digits) * 10n ** BigInt(exponent);
  }
  return BigInt(val);
}

/** Parses an env var as one of the allowed enum strings (case-insensitive). */
export function parseEnumEnv<T extends string>(values: readonly T[], val: string): T {
  const sanitizedVal = val.trim().toLowerCase();
  if (values.some(v => v.toLowerCase() === sanitizedVal)) {
    return values.find(v => v.toLowerCase() === sanitizedVal)!;
  }
  throw new Error(`Invalid config value '${val}' (must be one of ${values.join(', ')})`);
}
