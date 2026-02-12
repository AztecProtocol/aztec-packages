// Browser stub for Node.js 'util' module
// Provides minimal util functionality for browser environments

// Custom inspect symbol
export const inspect = {
  custom: Symbol.for('nodejs.util.inspect.custom'),
};

// Other util functions as simple pass-throughs
export function format(fmt, ...args) {
  return String(fmt);
}

export function deprecate(fn, msg) {
  return fn;
}

export function isArray(arg) {
  return Array.isArray(arg);
}

export function isBoolean(arg) {
  return typeof arg === 'boolean';
}

export function isNull(arg) {
  return arg === null;
}

export function isNumber(arg) {
  return typeof arg === 'number';
}

export function isString(arg) {
  return typeof arg === 'string';
}

export function isUndefined(arg) {
  return arg === undefined;
}

export function isFunction(arg) {
  return typeof arg === 'function';
}

export function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

export default {
  inspect,
  format,
  deprecate,
  isArray,
  isBoolean,
  isNull,
  isNumber,
  isString,
  isUndefined,
  isFunction,
  isObject,
};
