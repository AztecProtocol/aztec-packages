import { Fq, Fr } from './field.js';

describe('Fr Serialization', () => {
  it('should serialize and deserialize correctly through hex schema', () => {
    const original = Fr.random();
    const string = original.toString();
    const obtained = Fr.schema.parse(string);
    expect(obtained).toEqual(original);
  });
});

describe('Fr Modulus Validation', () => {
  it('throws when constructing from bigint >= modulus', () => {
    expect(() => new Fr(Fr.MODULUS)).toThrow('greater or equal to field modulus');
    expect(() => new Fr(Fr.MODULUS + 1n)).toThrow('greater or equal to field modulus');
  });

  it('throws when constructing from negative bigint', () => {
    expect(() => new Fr(-1n)).toThrow('is negative');
  });

  it('throws when constructing from Buffer with value >= modulus', () => {
    const buf = Buffer.from(Fr.MODULUS.toString(16).padStart(64, '0'), 'hex');
    expect(() => new Fr(buf)).toThrow('greater or equal to field modulus');
  });

  it('throws when using fromBuffer with value >= modulus', () => {
    const buf = Buffer.from(Fr.MODULUS.toString(16).padStart(64, '0'), 'hex');
    expect(() => Fr.fromBuffer(buf)).toThrow('greater or equal to field modulus');
  });

  it('throws when using fromString with numeric string >= modulus', () => {
    expect(() => Fr.fromString(Fr.MODULUS.toString())).toThrow('greater or equal to field modulus');
  });

  it('throws when using fromHexString with value >= modulus', () => {
    expect(() => Fr.fromHexString(Fr.MODULUS.toString(16))).toThrow('greater or equal to field modulus');
  });

  it('accepts MAX_FIELD_VALUE (modulus - 1)', () => {
    expect(() => new Fr(Fr.MODULUS - 1n)).not.toThrow();
  });
});

describe('Fq Modulus Validation', () => {
  it('throws when constructing from bigint >= modulus', () => {
    expect(() => new Fq(Fq.MODULUS)).toThrow('greater or equal to field modulus');
    expect(() => new Fq(Fq.MODULUS + 1n)).toThrow('greater or equal to field modulus');
  });

  it('throws when constructing from negative bigint', () => {
    expect(() => new Fq(-1n)).toThrow('is negative');
  });

  it('throws when constructing from Buffer with value >= modulus', () => {
    const buf = Buffer.from(Fq.MODULUS.toString(16).padStart(64, '0'), 'hex');
    expect(() => new Fq(buf)).toThrow('greater or equal to field modulus');
  });

  it('throws when using fromBuffer with value >= modulus', () => {
    const buf = Buffer.from(Fq.MODULUS.toString(16).padStart(64, '0'), 'hex');
    expect(() => Fq.fromBuffer(buf)).toThrow('greater or equal to field modulus');
  });

  it('throws when using fromString with numeric string >= modulus', () => {
    expect(() => Fq.fromString(Fq.MODULUS.toString())).toThrow('greater or equal to field modulus');
  });

  it('throws when using fromHexString with value >= modulus', () => {
    expect(() => Fq.fromHexString(Fq.MODULUS.toString(16))).toThrow('greater or equal to field modulus');
  });

  it('accepts modulus - 1', () => {
    expect(() => new Fq(Fq.MODULUS - 1n)).not.toThrow();
  });
});

describe('Bn254 arithmetic', () => {
  describe('Addition', () => {
    it('Low Boundary', () => {
      // 0 + -1 = -1
      const a = Fr.ZERO;
      const b = Fr.MAX_FIELD_VALUE;
      const expected = Fr.MAX_FIELD_VALUE;

      const actual = a.add(b);
      expect(actual).toEqual(expected);
    });

    it('High Boundary', () => {
      // -1 + 1 = 0
      const a = Fr.MAX_FIELD_VALUE;
      const b = new Fr(1);
      const expected = Fr.ZERO;

      const actual = a.add(b);
      expect(actual).toEqual(expected);
    });

    it('Performs addition correctly', () => {
      const a = new Fr(2);
      const b = new Fr(3);
      const expected = new Fr(5);

      const actual = a.add(b);
      expect(actual).toEqual(expected);
    });
  });

  describe('Subtraction', () => {
    it('Low Boundary', () => {
      // 0 - 1 = -1
      const a = new Fr(0);
      const b = new Fr(1);
      const expected = Fr.MAX_FIELD_VALUE;

      const actual = a.sub(b);
      expect(actual).toEqual(expected);
    });

    it('High Boundary', () => {
      // -1 - (-1) = 0
      const a = Fr.MAX_FIELD_VALUE;
      const b = Fr.MAX_FIELD_VALUE;

      const actual = a.sub(b);
      expect(actual).toEqual(Fr.ZERO);
    });

    it('Performs subtraction correctly', () => {
      const a = new Fr(10);
      const b = new Fr(5);
      const expected = new Fr(5);

      const actual = a.sub(b);
      expect(actual).toEqual(expected);
    });
  });

  describe('Multiplication', () => {
    it('Identity', () => {
      const a = Fr.MAX_FIELD_VALUE;
      const b = new Fr(1);
      const expected = Fr.MAX_FIELD_VALUE;

      const actual = a.mul(b);
      expect(actual).toEqual(expected);
    });

    it('Performs multiplication correctly', () => {
      const a = new Fr(2);
      const b = new Fr(3);
      const expected = new Fr(6);

      const actual = a.mul(b);
      expect(actual).toEqual(expected);
    });

    it('High Boundary', () => {
      const a = Fr.MAX_FIELD_VALUE;
      const b = new Fr(Fr.MODULUS / 2n);
      const expected = new Fr(10944121435919637611123202872628637544274182200208017171849102093287904247809n);

      const actual = a.mul(b);
      expect(actual).toEqual(expected);
    });
  });

  describe('Division', () => {
    it('Should succeed when mod inverse is -ve', () => {
      const a = new Fr(2);
      const b = new Fr(3);

      const actual = a.div(b);
      expect(actual.mul(b)).toEqual(a);
    });

    it('Should succeed when mod inverse is +ve', () => {
      const a = new Fr(10);
      const b = new Fr(5);
      const expected = new Fr(2);

      const actual = a.div(b);
      expect(actual.mul(b)).toEqual(a);
      expect(actual).toEqual(expected);
    });

    it('Should not allow a division by 0', () => {
      const a = new Fr(10);
      const b = Fr.ZERO;

      expect(() => a.div(b)).toThrow();
    });
  });

  describe('Square root (Fr)', () => {
    it.each([
      [new Fr(0), 0n],
      [new Fr(4), 2n],
      [new Fr(9), 3n],
      [new Fr(16), 4n],
    ])('Should return the correct square root for %p', async (input, expected) => {
      const actual = (await input.sqrt())!.toBigInt();

      // The square root can be either the expected value or the modulus - expected value
      const isValid = actual == expected || actual == Fr.MODULUS - expected;

      expect(isValid).toBeTruthy();
    });

    it('Should return the correct square root for random value', async () => {
      const a = Fr.random();
      const squared = a.mul(a);

      const actual = await squared.sqrt();
      expect(actual!.mul(actual!)).toEqual(squared);
    });
  });

  describe('Square root (Fq)', () => {
    it.each([
      [new Fq(0), 0n],
      [new Fq(4), 2n],
      [new Fq(9), 3n],
      [new Fq(16), 4n],
    ])('Should return the correct square root for %p', async (input, expected) => {
      const actual = (await input.sqrt())!.toBigInt();

      // The square root can be either the expected value or the modulus - expected value
      const isValid = actual == expected || actual == Fq.MODULUS - expected;

      expect(isValid).toBeTruthy();
    });

    it('Should return the correct square root for a perfect square', async () => {
      // Test sqrt(100) = 10
      const input = new Fq(100);
      const actual = await input.sqrt();

      expect(actual).not.toBeNull();
      // Square the result to verify
      const squared = (actual!.toBigInt() * actual!.toBigInt()) % Fq.MODULUS;
      expect(squared).toBe(100n);
    });
  });

  describe('Comparison', () => {
    it.each([
      [new Fr(5), new Fr(10), -1],
      [new Fr(10), new Fr(5), 1],
      [new Fr(5), new Fr(5), 0],
      [Fr.MAX_FIELD_VALUE, new Fr(Fr.MODULUS - 1n), 0],
      [new Fr(0), new Fr(Fr.MODULUS - 1n), -1],
      [new Fr(Fr.MODULUS - 1n), new Fr(0), 1],
      [Fr.ZERO, Fr.ZERO, 0],
      [Fr.zero(), Fr.ZERO, 0],
    ])('Should compare field elements correctly', (a, b, expected) => {
      expect(a.cmp(b)).toEqual(expected);
    });
  });
});
