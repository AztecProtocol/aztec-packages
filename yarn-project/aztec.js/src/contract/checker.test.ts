import { abiChecker } from './checker.js';

describe('abiChecker', () => {
  describe('no functions', () => {
    let abi: any;

    describe('no functions', () => {
      beforeEach(() => {
        abi = {
          name: 'TEST_ABI',
        };
      });

      it('should error if it has no functions', () => {
        expect(() => abiChecker(abi)).toThrowError('ABI has no functions');
      });
    });

    describe('empty functions', () => {
      beforeEach(() => {
        const abi = {
          name: 'TEST_ABI',
          functions: [],
        };
      });

      it('should error if it has no functions', () => {
        expect(() => abiChecker(abi)).toThrowError('ABI has no functions');
      });
    });
  });

  describe('no names', () => {
    let abi: any;

    beforeEach(() => {
      abi = {
        name: 'TEST_ABI',
        functions: [{ bytecode: '0af', parameters: [{ type: { kind: 'test' } }] }],
      };
    });

    it('should error if ABI has no names', () => {
      expect(() => abiChecker(abi)).toThrowError('ABI function has no name');
    });
  });

  describe('wrong types', () => {
    describe('unrecognised type', () => {
      let abi: any;

      beforeEach(() => {
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
      });

      it('should error if ABI function has incorrect parameter', () => {
        expect(() => abiChecker(abi)).toThrowError('ABI function parameter has an unrecognised type');
      });
    });

    describe('incorrectly formed integer', () => {
      let abi: any;

      beforeEach(() => {
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
      });

      it('should error if ABI function has incorrect parameter', () => {
        expect(() => abiChecker(abi)).toThrowError('Unrecognised attribute on type integer');
      });
    });
  });

  describe('valid types', () => {
    describe('valid matrix of integers', () => {
      let abi: any;

      beforeEach(() => {
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
      });

      it('should pass checker', () => {
        expect(abiChecker(abi)).toBe(true);
      });
    });

    describe('valid struct', () => {
      let abi: any;

      beforeEach(() => {
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
      });

      it('should pass checker', () => {
        expect(abiChecker(abi)).toBe(true);
      });
    });
  });
});
