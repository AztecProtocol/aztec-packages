import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { ContractClassLog } from '@aztec/stdlib/logs';

import { getSampleContractClassPublishedEventPayload } from '../tests/fixtures.js';
import { ContractClassPublishedEvent } from './contract_class_published_event.js';

describe('ContractClassPublishedEvent', () => {
  beforeAll(() => setupCustomSnapshotSerializers(expect));
  it('parses an event as emitted by the ContractClassRegistry', () => {
    const log = ContractClassLog.fromBuffer(getSampleContractClassPublishedEventPayload());
    expect(ContractClassPublishedEvent.isContractClassPublishedEvent(log)).toBe(true);

    const event = ContractClassPublishedEvent.fromLog(log);

    // TODO: How do you update this snapshot?
    expect(event).toMatchSnapshot();
  });
});
