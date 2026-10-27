import { CircuitKind } from '../circuit_kind.js';
import { AztecClientBackend, fieldToString, fieldsToStrings } from './backend.js';
import type { Barretenberg } from './index.js';

describe('field helper functions', () => {
  describe('fieldToString', () => {
    it('converts zero field to "0"', () => {
      const zeroField = new Uint8Array(32).fill(0);
      expect(fieldToString(zeroField)).toBe('0');
    });

    it('converts field with value 1 to "1"', () => {
      const oneField = new Uint8Array(32).fill(0);
      oneField[31] = 1;
      expect(fieldToString(oneField)).toBe('1');
    });

    it('converts field with value 256 to "256"', () => {
      const field = new Uint8Array(32).fill(0);
      field[30] = 1;
      field[31] = 0;
      expect(fieldToString(field)).toBe('256');
    });

    it('converts field with max uint8 in last byte to "255"', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 255;
      expect(fieldToString(field)).toBe('255');
    });

    it('converts larger values correctly', () => {
      // 0x0100 = 256 in decimal
      const field = new Uint8Array(32).fill(0);
      field[30] = 0x01;
      field[31] = 0x00;
      expect(fieldToString(field)).toBe('256');
    });

    it('handles multi-byte values', () => {
      // 0x010203 = 66051 in decimal
      const field = new Uint8Array(32).fill(0);
      field[29] = 0x01;
      field[30] = 0x02;
      field[31] = 0x03;
      expect(fieldToString(field)).toBe('66051');
    });

    it('handles large field values', () => {
      // A known value: all bytes set to 1
      const field = new Uint8Array(32).fill(1);
      const result = fieldToString(field);
      // Verify it's a valid decimal string
      expect(result).toMatch(/^\d+$/);
      // Verify the length is reasonable for a 256-bit number
      expect(result.length).toBeGreaterThan(70);
    });

    it('converts to hex with radix 16', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 255;
      expect(fieldToString(field, 16)).toBe('ff');
    });

    it('converts to hex for multi-byte values', () => {
      // 0x010203
      const field = new Uint8Array(32).fill(0);
      field[29] = 0x01;
      field[30] = 0x02;
      field[31] = 0x03;
      expect(fieldToString(field, 16)).toBe('10203');
    });

    it('converts to binary with radix 2', () => {
      const field = new Uint8Array(32).fill(0);
      field[31] = 5;
      expect(fieldToString(field, 2)).toBe('101');
    });
  });

  describe('fieldsToStrings', () => {
    it('converts empty array to empty array', () => {
      expect(fieldsToStrings([])).toEqual([]);
    });

    it('converts single field', () => {
      const oneField = new Uint8Array(32).fill(0);
      oneField[31] = 42;
      expect(fieldsToStrings([oneField])).toEqual(['42']);
    });

    it('converts multiple fields', () => {
      const field1 = new Uint8Array(32).fill(0);
      field1[31] = 1;

      const field2 = new Uint8Array(32).fill(0);
      field2[31] = 2;

      const field3 = new Uint8Array(32).fill(0);
      field3[31] = 3;

      expect(fieldsToStrings([field1, field2, field3])).toEqual(['1', '2', '3']);
    });

    it('preserves order of fields', () => {
      const fields = [10, 20, 30, 40, 50].map(v => {
        const field = new Uint8Array(32).fill(0);
        field[31] = v;
        return field;
      });

      expect(fieldsToStrings(fields)).toEqual(['10', '20', '30', '40', '50']);
    });

    it('converts to hex with radix 16', () => {
      const fields = [15, 16, 255].map(v => {
        const field = new Uint8Array(32).fill(0);
        field[31] = v;
        return field;
      });

      expect(fieldsToStrings(fields, 16)).toEqual(['f', '10', 'ff']);
    });
  });
});

describe('AztecClientBackend', () => {
  it.each(['chonkStart', 'chonkLoad', 'chonkAccumulate'] as const)('propagates %s failures', async step => {
    const error = new Error(`${step} failed`);
    const failure = Promise.reject(error);
    void failure.catch(() => {});
    const api = {
      chonkStart: () => Promise.resolve({}),
      chonkLoad: () => Promise.resolve({}),
      chonkAccumulate: () => Promise.resolve({}),
      chonkProve: () => Promise.reject(new Error('Proving continued after setup failed')),
    };
    api[step] = () => failure;
    const backend = new AztecClientBackend(
      [new Uint8Array([1])],
      api as unknown as Barretenberg,
      ['hiding_kernel'],
      [CircuitKind.HidingKernel],
    );
    await expect(backend.prove([new Uint8Array([2])], [new Uint8Array([3])])).rejects.toBe(error);
  });

  it('issues every command before the first one completes', async () => {
    const issued: string[] = [];
    let completeStart!: () => void;
    const startDone = new Promise<object>(resolve => (completeStart = () => resolve({})));
    const api = {
      chonkStart: () => (issued.push('chonkStart'), startDone),
      chonkLoad: () => (issued.push('chonkLoad'), startDone),
      chonkAccumulate: () => (issued.push('chonkAccumulate'), startDone),
      chonkProve: () => (issued.push('chonkProve'), startDone.then(() => Promise.reject(new Error('stop')))),
    };
    const backend = new AztecClientBackend(
      [new Uint8Array([1]), new Uint8Array([1])],
      api as unknown as Barretenberg,
      ['app', 'hiding_kernel'],
      [CircuitKind.App, CircuitKind.HidingKernel],
    );
    const proving = backend.prove(
      [new Uint8Array([2]), new Uint8Array([2])],
      [new Uint8Array([3]), new Uint8Array([3])],
    );
    await Promise.resolve();
    expect(issued).toEqual([
      'chonkStart',
      'chonkLoad',
      'chonkAccumulate',
      'chonkLoad',
      'chonkAccumulate',
      'chonkProve',
    ]);
    completeStart();
    await expect(proving).rejects.toThrow('stop');
  });

  it('rejects a missing VK before issuing any command', async () => {
    const issued: string[] = [];
    const record = (name: string) => () => (issued.push(name), Promise.resolve({}));
    const api = {
      chonkStart: record('chonkStart'),
      chonkLoad: record('chonkLoad'),
      chonkAccumulate: record('chonkAccumulate'),
      chonkProve: record('chonkProve'),
    };
    const backend = new AztecClientBackend(
      [new Uint8Array([1]), new Uint8Array([1])],
      api as unknown as Barretenberg,
      ['app', 'hiding_kernel'],
      [CircuitKind.App, CircuitKind.HidingKernel],
    );
    await expect(
      backend.prove([new Uint8Array([2]), new Uint8Array([2])], [new Uint8Array([3]), new Uint8Array(0)]),
    ).rejects.toThrow('Missing precomputed VK for circuit 1 (hiding_kernel)');
    expect(issued).toEqual([]);
  });
});
