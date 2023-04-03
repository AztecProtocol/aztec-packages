import { abiChecker } from './checker.js';

describe('abiChecker', () => {
  let abi: any;

  describe('no functions', () => {
    it('should throw an error if it has no functions', () => {
      abi = {
        name: 'TEST_ABI',
      };
      expect(() => abiChecker(abi)).toThrowError('ABI has no functions');
      abi = {
        name: 'TEST_ABI',
        functions: [],
      };
      expect(() => abiChecker(abi)).toThrowError('ABI has no functions');
    });
  });

  describe('no names', () => {
    it('should error if ABI has no names', () => {
      abi = {
        name: 'TEST_ABI',
        functions: [{ bytecode: '0af', parameters: [{ type: { kind: 'test' } }] }],
      };
      expect(() => abiChecker(abi)).toThrowError('ABI function has no name');
    });
  });

  describe('wrong types', () => {
    describe('unrecognised type', () => {
      it('should error if ABI function has incorrect parameter', () => {
        abi = {
          name: 'TEST_ABI',
          functions: [
            {
              name: 'Function name',
              bytecode: '0af',
              parameters: [{ type: { kind: 'test' } }],
            },
          ],
        };
        expect(() => abiChecker(abi)).toThrowError('ABI function parameter has an unrecognised type');
      });
    });

    describe('incorrectly formed integer', () => {
      it('should error if integer is incorrectly formed', () => {
        abi = {
          name: 'TEST_ABI',
          functions: [
            {
              name: 'constructor',
              bytecode: '0af',
              parameters: [{ type: { kind: 'integer', sign: 5 } }],
            },
          ],
        };
        expect(() => abiChecker(abi)).toThrowError('Unrecognised attribute on type integer');
      });
    });

    describe('incorrectly formed string', () => {
      it('should error if string is incorrectly formed', () => {
        abi = {
          name: 'TEST_ABI',
          functions: [
            {
              name: 'constructor',
              bytecode: '0af',
              parameters: [{ type: { kind: 'string', sign: 5, additionalParam: true } }],
            },
          ],
        };
        expect(() => abiChecker(abi)).toThrowError('Unrecognised attribute on type string');
      });
    });

    describe('incorrectly formed struct', () => {
      it('should error if struct is incorrectly formed', () => {
        abi = {
          name: 'TEST_ABI',
          functions: [
            {
              name: 'constructor',
              bytecode: '0af',
              parameters: [
                {
                  type: {
                    kind: 'struct',
                  },
                },
              ],
            },
          ],
        };
        expect(() => abiChecker(abi)).toThrowError('Unrecognised attribute on type struct');
      });
    });

    describe('incorrectly formed array', () => {
      it('should error if array is incorrectly formed', () => {
        abi = {
          name: 'TEST_ABI',
          functions: [
            {
              name: 'constructor',
              bytecode: '0af',
              parameters: [
                {
                  type: {
                    kind: 'array',
                    length: 5,
                    type: {
                      kind: 'array',
                      length: '5',
                      type: {
                        sign: 'value',
                        width: 5,
                        kind: 'integer',
                      },
                    },
                  },
                },
              ],
            },
          ],
        };
        expect(() => abiChecker(abi)).toThrowError('ABI function parameter has an incorrectly formed array');
      });
    });
  });

  describe('valid types', () => {
    describe('valid matrix of integers', () => {
      it('should pass checker', () => {
        abi = {
          name: 'TEST_ABI',
          functions: [
            {
              name: 'constructor',
              bytecode: '0af',
              parameters: [
                {
                  type: {
                    kind: 'array',
                    length: 5,
                    type: {
                      kind: 'array',
                      length: 5,
                      type: {
                        sign: 'value',
                        width: 5,
                        kind: 'integer',
                      },
                    },
                  },
                },
              ],
            },
          ],
        };
        expect(abiChecker(abi)).toBe(true);
      });
    });

    describe('valid struct', () => {
      it('should pass checker', () => {
        abi = {
          name: 'TEST_ABI',
          functions: [
            {
              name: 'constructor',
              bytecode: '0af',
              parameters: [
                {
                  type: {
                    kind: 'struct',
                    fields: [
                      {
                        name: 'name',
                        type: {
                          sign: 'value',
                          width: 5,
                          kind: 'integer',
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        };
        expect(abiChecker(abi)).toBe(true);
      });
    });
  });
});
