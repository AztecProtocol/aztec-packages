/** Parses an env var as boolean. Returns true only if value is 1, true, or TRUE. */
export function parseBooleanEnv(val: string | undefined): boolean {
  return val !== undefined && ['1', 'true', 'TRUE'].includes(val);
}
