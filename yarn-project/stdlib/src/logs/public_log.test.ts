import { FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH, PUBLIC_LOG_HEADER_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { AztecAddress } from '../aztec-address/index.js';
import { FlatPublicLogs, PublicLog } from './public_log.js';

describe('FlatPublicLogs', () => {
  let sampleLogs: PublicLog[];
  let flatLogs: FlatPublicLogs;

  beforeAll(async () => {
    // Create sample logs for testing
    sampleLogs = [
      new PublicLog(await AztecAddress.random(), [new Fr(1), new Fr(2), new Fr(3)]),
      new PublicLog(await AztecAddress.random(), [new Fr(4), new Fr(5)]),
      new PublicLog(await AztecAddress.random(), [new Fr(6)]),
    ];
    flatLogs = FlatPublicLogs.fromLogs(sampleLogs);
  });

  describe('constructor', () => {
    it('should create FlatPublicLogs with valid parameters', () => {
      const length = 10;
      const payload = Array(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH).fill(Fr.ZERO);
      const logs = new FlatPublicLogs(length, payload);

      expect(logs.length).toBe(length);
      expect(logs.payload.length).toBe(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);
    });

    it('should throw error if payload length is invalid', () => {
      const length = 10;
      const invalidPayload = Array(100).fill(Fr.ZERO); // Wrong size

      expect(() => new FlatPublicLogs(length, invalidPayload)).toThrow('Invalid payload given to FlatPublicLogs');
    });

    it('should throw error if length is greater than payload length', () => {
      const length = FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH + 1;
      const payload = Array(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH).fill(Fr.ZERO);

      expect(() => new FlatPublicLogs(length, payload)).toThrow('Invalid length given to FlatPublicLogs');
    });
  });

  describe('static factory methods', () => {
    it('should create empty FlatPublicLogs', () => {
      const emptyLogs = FlatPublicLogs.empty();

      expect(emptyLogs.length).toBe(0);
      expect(emptyLogs.payload.length).toBe(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);
      expect(emptyLogs.isEmpty()).toBe(true);
    });

    it('should create FlatPublicLogs from PublicLog array', () => {
      const logs = FlatPublicLogs.fromLogs(sampleLogs);

      expect(logs.length).toEqual(sampleLogs.reduce((acc, log) => acc + log.sizeInFields(), 0));
      expect(logs.payload.length).toBe(FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH);
      expect(logs.isEmpty()).toBe(false);
    });

    it('should create FlatPublicLogs from empty PublicLog array', () => {
      const logs = FlatPublicLogs.fromLogs([]);

      expect(logs.length).toBe(0);
      expect(logs.isEmpty()).toBe(true);
    });
  });

  describe('serialization and deserialization', () => {
    it('should serialize to buffer and deserialize back correctly', () => {
      expect(FlatPublicLogs.fromBuffer(flatLogs.toBuffer())).toEqual(flatLogs);
    });

    it('should serialize to fields and deserialize back correctly', () => {
      expect(FlatPublicLogs.fromFields(flatLogs.toFields())).toEqual(flatLogs);
    });

    it('should handle empty logs serialization', () => {
      const emptyLogs = FlatPublicLogs.empty();
      expect(FlatPublicLogs.fromBuffer(emptyLogs.toBuffer())).toEqual(emptyLogs);
    });
  });

  describe('blob serialization', () => {
    it('should convert to and from blob fields correctly', () => {
      const blobFields = flatLogs.toBlobFields();
      expect(FlatPublicLogs.fromBlobFields(blobFields.length, blobFields)).toEqual(flatLogs);
    });

    it('should handle empty logs blob operations', () => {
      const emptyLogs = FlatPublicLogs.empty();
      const blobFields = emptyLogs.toBlobFields();
      expect(FlatPublicLogs.fromBlobFields(blobFields.length, blobFields)).toEqual(emptyLogs);
    });
  });

  it('should convert to logs and back correctly', () => {
    const recreatedLogs = flatLogs.toLogs();

    expect(recreatedLogs).toEqual(sampleLogs);
  });
});

describe('PublicLog', () => {
  let log: PublicLog;

  beforeAll(async () => {
    log = await PublicLog.random();
  });

  it('serializes to buffer and deserializes it back', () => {
    const buffer = log.toBuffer();
    const res = PublicLog.fromBuffer(buffer);
    expect(res).toEqual(log);
  });

  it('serializes to field array and deserializes it back', () => {
    const fieldArray = log.toFields();
    const res = PublicLog.fromFields(fieldArray);
    expect(res).toEqual(log);
  });

  it('convert to and from json', () => {
    const parsed = PublicLog.schema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed).toEqual(log);
  });

  it('calculates size in fields correctly', () => {
    const expectedSize = log.fields.length + PUBLIC_LOG_HEADER_LENGTH; // fields length + contract address field + fields length field
    expect(log.sizeInFields()).toBe(expectedSize);
  });
});
