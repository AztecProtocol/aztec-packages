import { ContractClassLog } from '@aztec/circuits.js/logs';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';

import { getSampleContractClassRegisteredEventPayload } from '../tests/fixtures.js';
import { ContractClassRegisteredEvent } from './contract_class_registered_event.js';

describe('ContractClassRegisteredEvent', () => {
  beforeAll(() => setupCustomSnapshotSerializers(expect));
  it('parses an event as emitted by the ContractClassRegisterer', () => {
    const log = ContractClassLog.fromBuffer(getSampleContractClassRegisteredEventPayload());
    expect(ContractClassRegisteredEvent.isContractClassRegisteredEvent(log)).toBe(true);

    const event = ContractClassRegisteredEvent.fromLog(log);
    expect(event).toMatchSnapshot();
  });
});
