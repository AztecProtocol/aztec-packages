import { jest } from '@jest/globals';

import { randomBytes } from '../crypto/random/index.js';
import { Fq, Fr } from '../curves/bn254/field.js';
import { BufferReader } from './buffer_reader.js';
import { bigintToUInt64BE, bigintToUInt128BE } from './free_funcs.js';
import { serializeArrayOfBufferableToVector, serializeBigInt, serializeToBuffer } from './serialize.js';

const ARRAY = Array.from(Array(32)).map((_, idx) => (idx % 2 === 0 ? 0 : 1));
const BUFFER = Buffer.from(ARRAY);
const NUMBER = 65537;
const sizes = [16, 48, 32];

describe('buffer reader', () => {
  let bufferReader: BufferReader;

  beforeEach(() => {
    bufferReader = new BufferReader(BUFFER);
  });

  describe('readNumber', () => {
    it('should return number', () => {
      expect(bufferReader.readNumber()).toBe(NUMBER);
    });
  });

  describe('readBoolean', () => {
    it('should read true when 1 and false when 0', () => {
      ARRAY.forEach(element => {
        if (element !== 0) {
          expect(bufferReader.readBoolean()).toBe(true);
        } else {
          expect(bufferReader.readBoolean()).toBe(false);
        }
      });
    });
  });

  describe('readBytes', () => {
    it('should read buffer by slices', () => {
      expect(bufferReader.readBytes(2)).toEqual(Buffer.from(ARRAY.slice(0, 2)));
      expect(bufferReader.readBytes(3)).toEqual(Buffer.from(ARRAY.slice(2, 5)));
    });
  });

  describe('readUInt64', () => {
    it('should read UInt64 from buffer', () => {
      // mix in some non-UInt64 values
      const content = [1n, 2n ** 64n, 2n ** 64n - 1n, BigInt(Number.MAX_SAFE_INTEGER), 3n];
      const buffer = Buffer.concat([
        bigintToUInt64BE(content[0]),
        serializeBigInt(content[1]),
        bigintToUInt64BE(content[2]),
        serializeBigInt(content[3]),
        bigintToUInt64BE(content[4]),
      ]);
      const myReader = new BufferReader(buffer);
      expect(myReader.readUInt64()).toEqual(content[0]);
      expect(myReader.readUInt256()).toEqual(content[1]);
      expect(myReader.readUInt64()).toEqual(content[2]);
      expect(myReader.readUInt256()).toEqual(content[3]);
      expect(myReader.readUInt64()).toEqual(content[4]);
    });
  });

  describe('readUInt128', () => {
    it('should read UInt128 from buffer', () => {
      // mix in some non-UInt128 values
      const content = [1n, 2n ** 128n, 2n ** 128n - 1n, BigInt(Number.MAX_SAFE_INTEGER), 3n];
      const buffer = Buffer.concat([
        bigintToUInt128BE(content[0]),
        serializeBigInt(content[1]),
        bigintToUInt128BE(content[2]),
        serializeBigInt(content[3]),
        bigintToUInt128BE(content[4]),
      ]);
      const myReader = new BufferReader(buffer);
      expect(myReader.readUInt128()).toEqual(content[0]);
      expect(myReader.readUInt256()).toEqual(content[1]);
      expect(myReader.readUInt128()).toEqual(content[2]);
      expect(myReader.readUInt256()).toEqual(content[3]);
      expect(myReader.readUInt128()).toEqual(content[4]);
    });
  });

  describe('readUInt256', () => {
    it('should read UInt256 from buffer', () => {
      // mix in some non-UInt256 values
      const content = [1, BigInt(Number.MAX_SAFE_INTEGER) + 1n, 2, BigInt(Number.MAX_SAFE_INTEGER) + 42n, 3];
      const myReader = new BufferReader(serializeToBuffer(content));
      expect(myReader.readNumber()).toEqual(content[0]);
      expect(myReader.readUInt256()).toEqual(content[1]);
      expect(myReader.readNumber()).toEqual(content[2]);
      expect(myReader.readUInt256()).toEqual(content[3]);
      expect(myReader.readNumber()).toEqual(content[4]);
    });
  });

  describe('readFr', () => {
    it('should get Fr from buffer', () => {
      expect(Fr.fromBuffer(bufferReader)).toEqual(Fr.fromBuffer(BUFFER));
    });
  });

  describe('readFq', () => {
    it('should get Fq from buffer', () => {
      expect(Fq.fromBuffer(bufferReader)).toEqual(Fq.fromBuffer(BUFFER));
    });
  });

  describe('readNumberVector', () => {
    let vectorBufferReader: BufferReader;

    beforeEach(() => {
      const uintArr = [7, 13, 16];
      const uintBufArr = uintArr.map(num => {
        const uintBuf = Buffer.alloc(4);
        uintBuf.writeUInt32BE(num, 0);
        return uintBuf;
      });
      const uintArrVec = serializeArrayOfBufferableToVector(uintBufArr);
      vectorBufferReader = new BufferReader(uintArrVec);
    });

    it('should read number vector', () => {
      expect(vectorBufferReader.readNumberVector()).toEqual([7, 13, 16]);
    });
  });

  describe('readVector', () => {
    it('should read vector and generate result array', () => {
      const items = Array.from(Array(10).keys());
      const reader = new BufferReader(serializeArrayOfBufferableToVector(items.map(i => Buffer.from([i]))));

      const result = reader.readVector({ fromBuffer: (r: BufferReader) => r.readUInt8() });

      expect(result).toEqual(items);
      expect(reader.isEmpty()).toBe(true);
    });

    it('should throw when size exceeds the bytes left in the buffer', () => {
      // BUFFER holds NUMBER as its size prefix, far more elements than its 28 remaining bytes can hold.
      expect(() => bufferReader.readVector({ fromBuffer: () => 1 })).toThrow(
        `Vector size ${NUMBER} exceeds remaining buffer length 28`,
      );
    });

    it('should bound the size by the bytes after the offset, not by the whole buffer', () => {
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32BE(200, 0);
      const reader = new BufferReader(Buffer.concat([Buffer.alloc(1000), prefix, Buffer.alloc(100)]), 1000);

      expect(() => reader.readVector({ fromBuffer: () => 1 })).toThrow(
        'Vector size 200 exceeds remaining buffer length 100',
      );
    });
  });

  describe('readArray', () => {
    it('should read array from buffer', () => {
      const fn = jest.fn();
      let i = -1;
      expect(
        bufferReader.readArray(10, {
          fromBuffer: () => {
            fn();
            i++;
            return i;
          },
        }),
      ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
  });

  describe('readBufferArray', () => {
    it('should read variable length array from buffer', () => {
      // Testing `readBufferArray` with a buffer that ONLY contains the data that will be read.
      // No `size` variable is passed in this case.
      const bufferArray: Buffer[] = [];
      let buf = Buffer.alloc(0);
      for (const size of sizes) {
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(size);
        const bytes = randomBytes(size);
        const ranBuf = Buffer.concat([sizeBuf, bytes]);
        bufferArray.push(bytes);
        buf = Buffer.concat([buf, ranBuf]);
      }
      const reader = BufferReader.asReader(buf);
      const res = reader.readBufferArray();
      expect(res).toEqual(bufferArray);
    });

    it('should read variable length array from buffer with other contents', () => {
      // testing `readBufferArray` with a buffer that includes some other data before and after the data that will be read.
      // The `size` variable needs to be passed in this case.
      const bufferArray: Buffer[] = [];
      const prefixBytes = randomBytes(32);
      const postfixBytes = randomBytes(16);
      let bufLen = 0;
      let buf = Buffer.alloc(32, prefixBytes);
      for (const size of sizes) {
        const sizeBuf = Buffer.alloc(4);
        sizeBuf.writeUInt32BE(size);

        const bytes = randomBytes(size);
        const ranBuf = Buffer.concat([sizeBuf, bytes]);
        buf = Buffer.concat([buf, ranBuf]);

        bufferArray.push(bytes);
        bufLen += ranBuf.length;
      }
      buf = Buffer.concat([buf, postfixBytes]);
      const reader = BufferReader.asReader(buf);
      const preRes = reader.readBytes(prefixBytes.length);
      expect(preRes).toEqual(prefixBytes);
      expect(reader.readBufferArray(bufLen)).toEqual(bufferArray);
      expect(reader.readBytes(postfixBytes.length)).toEqual(postfixBytes);
    });
  });

  describe('readObject', () => {
    it('should read object from buffer', () => {
      const fn = jest.fn();
      const object = bufferReader.readObject({
        fromBuffer: (reader: BufferReader) => {
          fn();
          return { value: 'test-string', buffer: reader };
        },
      });
      expect(object.value).toEqual('test-string');
      expect(object.buffer).toEqual(bufferReader);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('peekBytes', () => {
    it('should return bytes from buffer', () => {
      expect(bufferReader.peekBytes(10)).toEqual(Buffer.from(ARRAY.slice(0, 10)));
    });
  });

  describe('error handling', () => {
    let smallBuffer: Buffer;
    let smallBufferReader: BufferReader;

    beforeEach(() => {
      smallBuffer = Buffer.from([1, 2, 3]); // 3-byte buffer
      smallBufferReader = new BufferReader(smallBuffer);
    });

    it('should throw error when reading number beyond buffer length', () => {
      expect(() => smallBufferReader.readNumber()).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading numbers beyond buffer length', () => {
      expect(() => smallBufferReader.readNumbers(1)).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading UInt16 beyond buffer length', () => {
      smallBufferReader.readBytes(2);
      expect(() => smallBufferReader.readUInt16()).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading UInt8 beyond buffer length', () => {
      smallBufferReader.readBytes(3); // Read all bytes
      expect(() => smallBufferReader.readUInt8()).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading boolean beyond buffer length', () => {
      smallBufferReader.readBytes(3); // Read all bytes
      expect(() => smallBufferReader.readBoolean()).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading bytes beyond buffer length', () => {
      expect(() => smallBufferReader.readBytes(4)).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading buffer beyond buffer length', () => {
      // First, read a number (4 bytes) which is already beyond the buffer length
      expect(() => smallBufferReader.readBuffer()).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when peeking beyond buffer length', () => {
      expect(() => smallBufferReader.peekBytes(4)).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading vector beyond buffer length', () => {
      expect(() => smallBufferReader.readVector({ fromBuffer: () => 1 })).toThrow(
        'Attempted to read beyond buffer length',
      );
    });

    it('should throw error when reading array beyond buffer length', () => {
      expect(() =>
        smallBufferReader.readArray(4, { fromBuffer: (reader: BufferReader) => reader.readBytes(1) }),
      ).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading string beyond buffer length', () => {
      expect(() => smallBufferReader.readString()).toThrow('Attempted to read beyond buffer length');
    });

    it('should throw error when reading map beyond buffer length', () => {
      expect(() => smallBufferReader.readMap({ fromBuffer: () => 1 })).toThrow(
        'Attempted to read beyond buffer length',
      );
    });
  });

  describe('maxSize bounds checking', () => {
    describe('readVector with maxSize', () => {
      it('should read vector when size is within bounds', () => {
        const items = [1, 2, 3];
        const buffer = serializeToBuffer(items.length, items);
        const reader = new BufferReader(buffer);

        const result = reader.readVector({ fromBuffer: (r: BufferReader) => r.readNumber() }, 10);

        expect(result).toEqual(items);
      });

      it('should throw when vector size exceeds maxSize', () => {
        const items = [1, 2, 3, 4, 5];
        const buffer = serializeToBuffer(items.length, items);
        const reader = new BufferReader(buffer);

        expect(() => {
          reader.readVector({ fromBuffer: (r: BufferReader) => r.readNumber() }, 3);
        }).toThrow('Vector size 5 exceeds maximum allowed 3');
      });

      it('should allow any size when maxSize is not provided', () => {
        const items = [1, 2, 3, 4, 5];
        const buffer = serializeToBuffer(items.length, items);
        const reader = new BufferReader(buffer);

        const result = reader.readVector({ fromBuffer: (r: BufferReader) => r.readNumber() });

        expect(result).toEqual(items);
      });
    });

    describe('readBuffer with maxSize', () => {
      it('should read buffer when size is within bounds', () => {
        const data = Buffer.from('hello');
        // readBuffer expects length prefix + data
        const buffer = serializeToBuffer(data.length, data);
        const reader = new BufferReader(buffer);

        const result = reader.readBuffer(10);

        expect(result).toEqual(data);
      });

      it('should throw when buffer size exceeds maxSize', () => {
        const data = Buffer.from('hello world');
        // readBuffer expects length prefix + data
        const buffer = serializeToBuffer(data.length, data);
        const reader = new BufferReader(buffer);

        expect(() => {
          reader.readBuffer(5);
        }).toThrow('Buffer size 11 exceeds maximum allowed 5');
      });

      it('should allow any size when maxSize is not provided', () => {
        const data = Buffer.from('hello world');
        // readBuffer expects length prefix + data
        const buffer = serializeToBuffer(data.length, data);
        const reader = new BufferReader(buffer);

        const result = reader.readBuffer();

        expect(result).toEqual(data);
      });
    });

    describe('readString with maxSize', () => {
      it('should read string when size is within bounds', () => {
        const str = 'hello';
        const buffer = serializeToBuffer(str);
        const reader = new BufferReader(buffer);

        const result = reader.readString(10);

        expect(result).toEqual(str);
      });

      it('should throw when string size exceeds maxSize', () => {
        const str = 'hello world';
        const buffer = serializeToBuffer(str);
        const reader = new BufferReader(buffer);

        expect(() => {
          reader.readString(5);
        }).toThrow('Buffer size 11 exceeds maximum allowed 5');
      });

      it('should allow any size when maxSize is not provided', () => {
        const str = 'hello world';
        const buffer = serializeToBuffer(str);
        const reader = new BufferReader(buffer);

        const result = reader.readString();

        expect(result).toEqual(str);
      });
    });
  });
});
