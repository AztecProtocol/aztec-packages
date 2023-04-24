import * as msgpack from '@msgpack/msgpack';

/**
 * Helper functions for transformation from underlying camel-case C++-defined format.
 * This helps make using the raw output more idiomatic.
 */

// Global in-memory cache
const snakeToCamelCache: Map<string, string> = new Map();
const camelToSnakeCache: Map<string, string> = new Map();

// Helper function to convert snake_case to camelCase
function snakeToCamel(str: string): string {
  if (snakeToCamelCache.has(str)) {
    return snakeToCamelCache.get(str) as string;
  }

  const camelCase = str.replace(/(_\w)/g, matches => matches[1].toUpperCase());
  snakeToCamelCache.set(str, camelCase);
  return camelCase;
}

// Helper function to convert camelCase to snake_case
function camelToSnake(str: string): string {
  if (camelToSnakeCache.has(str)) {
    return camelToSnakeCache.get(str) as string;
  }

  const snakeCase = str.replace(/([A-Z])/g, matches => `_${matches[0].toLowerCase()}`);
  camelToSnakeCache.set(str, snakeCase);
  return snakeCase;
}

function recursiveToCamelCase(data: any): any {
  if (Array.isArray(data)) {
    return data.map(recursiveToCamelCase);
  } else if (data instanceof Uint8Array) {
    return Buffer.from(data);
  } else if (data && typeof data === 'object') {
    const camelCaseData: any = {};

    for (const key in data) {
      camelCaseData[snakeToCamel(key)] = recursiveToCamelCase(data[key]);
    }

    return camelCaseData;
  } else {
    return data;
  }
}

function recursiveToSnakeCase(data: any): any {
  if (Array.isArray(data)) {
    return data.map(recursiveToSnakeCase);
  } else if (data instanceof Uint8Array) {
    return data;
  } else if (data && typeof data === 'object') {
    const snakeCaseData: any = {};

    for (const key in data) {
      snakeCaseData[camelToSnake(key)] = recursiveToSnakeCase(data[key]);
    }

    return snakeCaseData;
  } else {
    return data;
  }
}

// Function that wraps msgpack.decode and converts keys from snake_case to camelCase
export function decode(data: Uint8Array): any {
  const decodedData = msgpack.decode(data);
  return recursiveToCamelCase(decodedData);
}

// Function that wraps msgpack.encode and converts keys from camelCase to snake_case
export function encode(data: any): Uint8Array {
  const snakeCaseData = recursiveToSnakeCase(data);
  return msgpack.encode(snakeCaseData);
}
