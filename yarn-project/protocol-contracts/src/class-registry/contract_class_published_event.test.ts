import {
  CONTRACT_CLASS_LOG_SIZE_IN_FIELDS,
  CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE,
  MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { bufferAsFields } from '@aztec/stdlib/abi';
import { ContractClassLog, ContractClassLogFields } from '@aztec/stdlib/logs';

import { ProtocolContractAddress } from '../protocol_contract_data.js';
import { getSampleContractClassPublishedEventPayload } from '../tests/fixtures.js';
import { ContractClassPublishedEvent } from './contract_class_published_event.js';

describe('ContractClassPublishedEvent', () => {
  beforeAll(() => setupCustomSnapshotSerializers(expect));

  it('parses an event as emitted by the ContractClassRegistry', () => {
    const log = ContractClassLog.fromBuffer(getSampleContractClassPublishedEventPayload());
    expect(ContractClassPublishedEvent.isContractClassPublishedEvent(log)).toBe(true);

    const event = ContractClassPublishedEvent.fromLog(log);

    // See ./__snapshots__/README.md for how to update the snapshot.
    expect(event).toMatchSnapshot();
  });

  it('fits a max-size public bytecode within CONTRACT_CLASS_LOG_SIZE_IN_FIELDS', () => {
    // Create a bytecode that fills the maximum allowed size.
    // bufferAsFields encodes as [length_in_bytes, ...31-byte-chunks, ...zero-padding] up to the target length.
    // The max bytecode in bytes is (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * 31,
    // since one field is used for the length prefix.
    const maxBytecodeBytes = (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * 31;
    const maxBytecode = Buffer.alloc(maxBytecodeBytes, 0xab);

    // Encode the bytecode as fields (same encoding used in the Noir contract).
    const bytecodeFields = bufferAsFields(maxBytecode, MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);
    expect(bytecodeFields).toHaveLength(MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS);

    // The event header: [magic, contractClassId, version, artifactHash, privateFunctionsRoot]
    const headerFields = [
      new Fr(CONTRACT_CLASS_PUBLISHED_MAGIC_VALUE),
      Fr.random(), // contractClassId
      new Fr(1), // version
      Fr.random(), // artifactHash
      Fr.random(), // privateFunctionsRoot
    ];

    // This is the main assertion: the CONTRACT_CLASS_LOG_SIZE_IN_FIELDS is enough such that
    // a max-size bytecode can be included in the event log together with the header fields
    const totalFields = headerFields.length + bytecodeFields.length;
    expect(totalFields).toBeLessThanOrEqual(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS);

    // Verify it round-trips through ContractClassLog and ContractClassPublishedEvent.
    const allFields = [...headerFields, ...bytecodeFields];
    const padded = [...allFields, ...Array(CONTRACT_CLASS_LOG_SIZE_IN_FIELDS - allFields.length).fill(Fr.ZERO)];
    const logFields = new ContractClassLogFields(padded);
    const log = new ContractClassLog(ProtocolContractAddress.ContractClassRegistry, logFields, allFields.length);

    expect(ContractClassPublishedEvent.isContractClassPublishedEvent(log)).toBe(true);

    const event = ContractClassPublishedEvent.fromLog(log);
    expect(event.packedPublicBytecode).toEqual(maxBytecode);
  });
});
