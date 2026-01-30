import { isErrorClass } from './index.js';

describe('isErrorClass', () => {
  class CustomError extends Error {
    constructor() {
      super('This is a custom error');
      this.name = 'CustomError';
    }
  }

  class AnotherError extends Error {
    constructor() {
      super('This is a another error');
      this.name = 'AnotherError';
    }
  }

  it('should identify instances of the specified error class', () => {
    const error = new CustomError();
    expect(isErrorClass(error, CustomError)).toBe(true);
    expect(isErrorClass(error, AnotherError)).toBe(false);
  });

  it('should handle non-error values correctly', () => {
    expect(isErrorClass({}, CustomError)).toBe(false);
    expect(isErrorClass(null, CustomError)).toBe(false);
    expect(isErrorClass(undefined, CustomError)).toBe(false);
    expect(isErrorClass('error', CustomError)).toBe(false);
  });

  it('should identify built-in Error instances', () => {
    const error = new Error('Built-in error');
    expect(isErrorClass(error, Error)).toBe(true);
    expect(isErrorClass(error, CustomError)).toBe(false);
  });
});
