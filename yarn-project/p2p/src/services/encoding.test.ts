import { TopicType } from '@aztec/stdlib/p2p';

import { compressSync, uncompressSync } from 'snappy';

import { SnappyTransform, readSnappyPreamble } from './encoding.js';

describe('readSnappyPreamble', () => {
  describe('basic varint decoding', () => {
    it('should read single-byte varint (64)', () => {
      // 64 = 0x40, fits in 7 bits, so it's just 0x40
      const data = new Uint8Array([0x40]);
      const result = readSnappyPreamble(data);
      expect(result.decompressedSize).toBe(64);
      expect(result.bytesRead).toBe(1);
    });

    it('should read single-byte varint (127)', () => {
      // 127 = 0x7F, maximum value for single byte
      const data = new Uint8Array([0x7f]);
      const result = readSnappyPreamble(data);
      expect(result.decompressedSize).toBe(127);
      expect(result.bytesRead).toBe(1);
    });

    it('should read multi-byte varint (2097150)', () => {
      // 2097150 = 0x1FFFFE
      // Encoded as: 0xFE 0xFF 0x7F
      // Byte 1: 0xFE = 11111110 -> data: 1111110 (0x7E), continue: 1
      // Byte 2: 0xFF = 11111111 -> data: 1111111 (0x7F), continue: 1
      // Byte 3: 0x7F = 01111111 -> data: 1111111 (0x7F), continue: 0
      // Result: 0x7F << 14 | 0x7F << 7 | 0x7E = 0x1FFFFE = 2097150
      const data = new Uint8Array([0xfe, 0xff, 0x7f]);
      const result = readSnappyPreamble(data);
      expect(result.decompressedSize).toBe(2097150);
      expect(result.bytesRead).toBe(3);
    });

    it('should read two-byte varint (128)', () => {
      // 128 = 0x80
      // Encoded as: 0x80 0x01
      // Byte 1: 0x80 = 10000000 -> data: 0000000 (0x00), continue: 1
      // Byte 2: 0x01 = 00000001 -> data: 0000001 (0x01), continue: 0
      // Result: 0x01 << 7 | 0x00 = 128
      const data = new Uint8Array([0x80, 0x01]);
      const result = readSnappyPreamble(data);
      expect(result.decompressedSize).toBe(128);
      expect(result.bytesRead).toBe(2);
    });

    it('should read maximum 32-bit value', () => {
      // 2^32 - 1 = 4294967295 = 0xFFFFFFFF
      // Encoded as 5 bytes: 0xFF 0xFF 0xFF 0xFF 0x0F
      const data = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x0f]);
      const result = readSnappyPreamble(data);
      expect(result.decompressedSize).toBe(4294967295);
      expect(result.bytesRead).toBe(5);
    });
  });

  describe('with actual snappy compression', () => {
    it('should correctly read preamble from compressed data (small)', () => {
      // Create uncompressed data of known size
      const originalSize = 100;
      const uncompressed = Buffer.alloc(originalSize, 'a');

      // Compress it
      const compressed = compressSync(uncompressed);

      // Read the preamble
      const result = readSnappyPreamble(compressed);

      // Verify the decompressed size matches
      expect(result.decompressedSize).toBe(originalSize);

      // Verify by actually decompressing
      const decompressed = uncompressSync(compressed, { asBuffer: true });
      expect(decompressed.length).toBe(originalSize);
    });

    it('should correctly read preamble from compressed data (1KB)', () => {
      const originalSize = 1024;
      const uncompressed = Buffer.alloc(originalSize, 'b');
      const compressed = compressSync(uncompressed);

      const result = readSnappyPreamble(compressed);
      expect(result.decompressedSize).toBe(originalSize);

      const decompressed = uncompressSync(compressed, { asBuffer: true });
      expect(decompressed.length).toBe(originalSize);
    });

    it('should correctly read preamble from compressed data (64KB)', () => {
      const originalSize = 65536;
      const uncompressed = Buffer.alloc(originalSize, 'c');
      const compressed = compressSync(uncompressed);

      const result = readSnappyPreamble(compressed);
      expect(result.decompressedSize).toBe(originalSize);

      const decompressed = uncompressSync(compressed, { asBuffer: true });
      expect(decompressed.length).toBe(originalSize);
    });

    it('should correctly read preamble from compressed data (1MB)', () => {
      const originalSize = 1024 * 1024;
      const uncompressed = Buffer.alloc(originalSize, 'd');
      const compressed = compressSync(uncompressed);

      const result = readSnappyPreamble(compressed);
      expect(result.decompressedSize).toBe(originalSize);

      const decompressed = uncompressSync(compressed, { asBuffer: true });
      expect(decompressed.length).toBe(originalSize);
    });

    it('should correctly read preamble from compressed random data', () => {
      // Random data compresses differently than repeated bytes
      const originalSize = 10000;
      const uncompressed = Buffer.alloc(originalSize);
      for (let i = 0; i < originalSize; i++) {
        uncompressed[i] = Math.floor(Math.random() * 256);
      }

      const compressed = compressSync(uncompressed);
      const result = readSnappyPreamble(compressed);

      expect(result.decompressedSize).toBe(originalSize);

      const decompressed = Buffer.from(uncompressSync(compressed, { asBuffer: true }));
      expect(decompressed.length).toBe(originalSize);
      expect(Buffer.compare(decompressed, uncompressed)).toBe(0);
    });

    it('should correctly read preamble from compressed structured data', () => {
      // Test with JSON data
      const data = {
        users: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`,
        })),
      };
      const uncompressed = Buffer.from(JSON.stringify(data));
      const originalSize = uncompressed.length;

      const compressed = compressSync(uncompressed);
      const result = readSnappyPreamble(compressed);

      expect(result.decompressedSize).toBe(originalSize);

      const decompressed = uncompressSync(compressed, { asBuffer: true });
      expect(decompressed.length).toBe(originalSize);
      expect(JSON.parse(decompressed.toString())).toEqual(data);
    });
  });

  describe('edge cases and errors', () => {
    it('should throw error for empty data', () => {
      const data = new Uint8Array([]);
      expect(() => readSnappyPreamble(data)).toThrow('Cannot read preamble from empty data');
    });

    it('should throw error for incomplete varint', () => {
      // Start of a multi-byte varint but incomplete
      const data = new Uint8Array([0x80]); // Continue bit set, but no next byte
      expect(() => readSnappyPreamble(data)).toThrow('Incomplete varint');
    });

    it('should throw error for varint that is too long', () => {
      // 6 bytes with all continue bits set (invalid)
      const data = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
      expect(() => readSnappyPreamble(data)).toThrow('Varint is too long');
    });

    it('should handle data with extra bytes after preamble', () => {
      // Single-byte varint followed by random data
      const data = new Uint8Array([0x40, 0xaa, 0xbb, 0xcc]);
      const result = readSnappyPreamble(data);
      expect(result.decompressedSize).toBe(64);
      expect(result.bytesRead).toBe(1);
    });

    it('should read zero-length size', () => {
      // Zero is a valid size (empty compressed data)
      const data = new Uint8Array([0x00]);
      const result = readSnappyPreamble(data);
      expect(result.decompressedSize).toBe(0);
      expect(result.bytesRead).toBe(1);
    });
  });

  describe('various size boundaries', () => {
    // Test various boundary conditions for varint encoding
    const testSizes = [
      { size: 1, expectedBytes: 1 },
      { size: 127, expectedBytes: 1 }, // Max 1-byte
      { size: 128, expectedBytes: 2 }, // Min 2-byte
      { size: 16383, expectedBytes: 2 }, // Max 2-byte
      { size: 16384, expectedBytes: 3 }, // Min 3-byte
      { size: 2097151, expectedBytes: 3 }, // Max 3-byte
      { size: 2097152, expectedBytes: 4 }, // Min 4-byte
      { size: 268435455, expectedBytes: 4 }, // Max 4-byte
      { size: 268435456, expectedBytes: 5 }, // Min 5-byte
    ];

    testSizes.forEach(({ size, expectedBytes }) => {
      it(`should read preamble for size ${size} (${expectedBytes} bytes)`, () => {
        const uncompressed = Buffer.alloc(size, 'x');
        const compressed = compressSync(uncompressed);

        const result = readSnappyPreamble(compressed);
        expect(result.decompressedSize).toBe(size);
        expect(result.bytesRead).toBe(expectedBytes);
      });
    });
  });
});

describe('SnappyTransform', () => {
  describe('max size validation', () => {
    describe('with default max sizes', () => {
      let transform: SnappyTransform;

      beforeEach(() => {
        transform = new SnappyTransform();
      });

      it('should accept tx payload within 512kb limit', () => {
        const size = 400 * 1024; // 400kb
        const data = Buffer.alloc(size, 'a');
        const compressed = compressSync(data);

        const result = transform.inboundTransformData(compressed, TopicType.tx);
        expect(result.length).toBe(size);
      });

      it('should reject tx payload exceeding 512kb limit', () => {
        const size = 600 * 1024; // 600kb (exceeds 512kb limit)
        const data = Buffer.alloc(size, 'a');
        const compressed = compressSync(data);

        expect(() => transform.inboundTransformData(compressed, TopicType.tx)).toThrow(
          'Decompressed size 614400 exceeds maximum allowed size of 512kb',
        );
      });

      it('should accept block_attestation payload within 5kb limit', () => {
        const size = 4 * 1024; // 4kb
        const data = Buffer.alloc(size, 'b');
        const compressed = compressSync(data);

        const result = transform.inboundTransformData(compressed, TopicType.block_attestation);
        expect(result.length).toBe(size);
      });

      it('should reject block_attestation payload exceeding 5kb limit', () => {
        const size = 6 * 1024; // 6kb (exceeds 5kb limit)
        const data = Buffer.alloc(size, 'b');
        const compressed = compressSync(data);

        expect(() => transform.inboundTransformData(compressed, TopicType.block_attestation)).toThrow(
          'Decompressed size 6144 exceeds maximum allowed size of 5kb',
        );
      });

      it('should accept block_proposal payload within 10MB limit', () => {
        const size = 8 * 1024 * 1024; // 8MB
        const data = Buffer.alloc(size, 'c');
        const compressed = compressSync(data);

        const result = transform.inboundTransformData(compressed, TopicType.block_proposal);
        expect(result.length).toBe(size);
      });

      it('should reject block_proposal payload exceeding 10MB limit', () => {
        const size = 11 * 1024 * 1024; // 11MB (exceeds 10MB limit)
        const data = Buffer.alloc(size, 'c');
        const compressed = compressSync(data);

        expect(() => transform.inboundTransformData(compressed, TopicType.block_proposal)).toThrow(
          'Decompressed size 11534336 exceeds maximum allowed size of 10240kb',
        );
      });

      it('should use default max size (10MB) for undefined topic', () => {
        const size = 9 * 1024 * 1024; // 9MB
        const data = Buffer.alloc(size, 'd');
        const compressed = compressSync(data);

        const result = transform.inboundTransformData(compressed, undefined);
        expect(result.length).toBe(size);
      });

      it('should reject payload exceeding default max size (10MB) for undefined topic', () => {
        const size = 11 * 1024 * 1024; // 11MB
        const data = Buffer.alloc(size, 'd');
        const compressed = compressSync(data);

        expect(() => transform.inboundTransformData(compressed, undefined)).toThrow(
          'Decompressed size 11534336 exceeds maximum allowed size of 10240kb',
        );
      });
    });

    describe('with custom max sizes', () => {
      it('should respect custom max sizes for each topic', () => {
        const customMaxSizes = {
          [TopicType.tx]: 100, // 100kb
          [TopicType.block_attestation]: 10, // 10kb
          [TopicType.block_proposal]: 500, // 500kb
        };
        const transform = new SnappyTransform(customMaxSizes);

        // Test tx at boundary
        const txData = Buffer.alloc(90 * 1024, 'a'); // 90kb
        const txCompressed = compressSync(txData);
        expect(() => transform.inboundTransformData(txCompressed, TopicType.tx)).not.toThrow();

        // Test tx exceeding limit
        const txDataLarge = Buffer.alloc(110 * 1024, 'a'); // 110kb
        const txCompressedLarge = compressSync(txDataLarge);
        expect(() => transform.inboundTransformData(txCompressedLarge, TopicType.tx)).toThrow(
          'exceeds maximum allowed size of 100kb',
        );
      });

      it('should respect custom default max size', () => {
        const customMaxSizes = {
          [TopicType.tx]: 100,
          [TopicType.block_attestation]: 10,
          [TopicType.block_proposal]: 500,
        };
        const customDefaultMaxSize = 200; // 200kb
        const transform = new SnappyTransform(customMaxSizes, customDefaultMaxSize);

        // Test undefined topic with custom default
        const data = Buffer.alloc(150 * 1024, 'a'); // 150kb
        const compressed = compressSync(data);
        expect(() => transform.inboundTransformData(compressed, undefined)).not.toThrow();

        // Test undefined topic exceeding custom default
        const dataLarge = Buffer.alloc(250 * 1024, 'a'); // 250kb
        const compressedLarge = compressSync(dataLarge);
        expect(() => transform.inboundTransformData(compressedLarge, undefined)).toThrow(
          'exceeds maximum allowed size of 200kb',
        );
      });
    });

    describe('exact boundary conditions', () => {
      let transform: SnappyTransform;

      beforeEach(() => {
        transform = new SnappyTransform();
      });

      it('should accept payload at exact limit (512kb for tx)', () => {
        const size = 512 * 1024; // Exactly 512kb
        const data = Buffer.alloc(size, 'a');
        const compressed = compressSync(data);

        const result = transform.inboundTransformData(compressed, TopicType.tx);
        expect(result.length).toBe(size);
      });

      it('should reject payload one byte over limit', () => {
        const size = 512 * 1024 + 1; // 512kb + 1 byte
        const data = Buffer.alloc(size, 'a');
        const compressed = compressSync(data);

        expect(() => transform.inboundTransformData(compressed, TopicType.tx)).toThrow(
          'exceeds maximum allowed size of 512kb',
        );
      });

      it('should accept payload one byte under limit', () => {
        const size = 512 * 1024 - 1; // 512kb - 1 byte
        const data = Buffer.alloc(size, 'a');
        const compressed = compressSync(data);

        const result = transform.inboundTransformData(compressed, TopicType.tx);
        expect(result.length).toBe(size);
      });
    });
  });

  describe('compression and decompression', () => {
    let transform: SnappyTransform;

    beforeEach(() => {
      transform = new SnappyTransform();
    });

    it('should compress and decompress data correctly', () => {
      const original = Buffer.from('Hello, World! This is a test message.');
      const compressed = transform.outboundTransformData(original);
      const decompressed = transform.inboundTransformData(compressed, TopicType.tx);

      expect(Buffer.compare(decompressed, original)).toBe(0);
    });

    it('should handle empty data', () => {
      const empty = Buffer.alloc(0);
      const compressed = transform.outboundTransformData(empty);
      const decompressed = transform.inboundTransformData(compressed, TopicType.tx);

      expect(compressed.length).toBe(0);
      expect(decompressed.length).toBe(0);
    });

    it('should compress large repetitive data efficiently', () => {
      const size = 100 * 1024; // 100kb of repeated data
      const original = Buffer.alloc(size, 'a');
      const compressed = transform.outboundTransformData(original);

      // Compressed size should be significantly smaller
      expect(compressed.length).toBeLessThan(original.length / 10);

      const decompressed = transform.inboundTransformData(compressed, TopicType.tx);
      expect(Buffer.compare(decompressed, original)).toBe(0);
    });

    it('should handle random data (less compressible)', () => {
      const size = 10 * 1024; // 10kb
      const original = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        original[i] = Math.floor(Math.random() * 256);
      }

      const compressed = transform.outboundTransformData(original);
      const decompressed = transform.inboundTransformData(compressed, TopicType.tx);

      expect(Buffer.compare(decompressed, original)).toBe(0);
    });
  });

  describe('inboundTransform with topic string', () => {
    let transform: SnappyTransform;

    beforeEach(() => {
      transform = new SnappyTransform();
    });

    it('should parse topic string and apply correct size limit', () => {
      const size = 400 * 1024; // 400kb
      const data = Buffer.alloc(size, 'a');
      const compressed = compressSync(data);

      // Should work with valid tx topic string
      const result = transform.inboundTransform('/aztec/tx/0.1.0', compressed);
      expect(result.length).toBe(size);
    });

    it('should reject payload when topic string indicates size limit exceeded', () => {
      const size = 6 * 1024; // 6kb (exceeds block_attestation limit of 5kb)
      const data = Buffer.alloc(size, 'a');
      const compressed = compressSync(data);

      expect(() => transform.inboundTransform('/aztec/block_attestation/0.1.0', compressed)).toThrow(
        'exceeds maximum allowed size of 5kb',
      );
    });

    it('should use default max size for invalid topic string', () => {
      const size = 9 * 1024 * 1024; // 9MB (under default 10MB)
      const data = Buffer.alloc(size, 'a');
      const compressed = compressSync(data);

      // Invalid topic string should fall back to default limit
      const result = transform.inboundTransform('/invalid/topic/string', compressed);
      expect(result.length).toBe(size);
    });

    it('should reject when invalid topic string and exceeds default limit', () => {
      const size = 11 * 1024 * 1024; // 11MB (exceeds default 10MB)
      const data = Buffer.alloc(size, 'a');
      const compressed = compressSync(data);

      expect(() => transform.inboundTransform('/invalid/topic/string', compressed)).toThrow(
        'exceeds maximum allowed size of 10240kb',
      );
    });
  });

  describe('outboundTransform', () => {
    let transform: SnappyTransform;

    beforeEach(() => {
      transform = new SnappyTransform();
    });

    it('should compress data via outboundTransform', () => {
      const original = new Uint8Array(Buffer.from('Test data for compression'));
      const compressed = transform.outboundTransform('/aztec/tx/0.1.0', original);

      expect(compressed.length).toBeGreaterThan(0);
      expect(compressed.length).not.toBe(original.length);
    });

    it('should handle empty data in outboundTransform', () => {
      const empty = new Uint8Array(0);
      const result = transform.outboundTransform('/aztec/tx/0.1.0', empty);

      expect(result.length).toBe(0);
    });
  });
});
