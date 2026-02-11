/**
 * Converts bigint values to strings recursively in a log object to avoid serialization issues.
 */
export function convertBigintsToStrings(obj: unknown): unknown {
  if (typeof obj === 'bigint') {
    return String(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => convertBigintsToStrings(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key in obj) {
      result[key] = convertBigintsToStrings((obj as Record<string, unknown>)[key]);
    }
    return result;
  }

  return obj;
}
