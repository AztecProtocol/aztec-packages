import { ContractClassLog } from '@aztec/circuits.js';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';

import { getSamplePrivateFunctionBroadcastedEventPayload } from '../tests/fixtures.js';
import { PrivateFunctionBroadcastedEvent } from './private_function_broadcasted_event.js';

describe('PrivateFunctionBroadcastedEvent', () => {
  beforeAll(() => setupCustomSnapshotSerializers(expect));

  it('parses an event as emitted by the ContractClassRegisterer', () => {
    const log = ContractClassLog.fromBuffer(getSamplePrivateFunctionBroadcastedEventPayload());
    expect(PrivateFunctionBroadcastedEvent.isPrivateFunctionBroadcastedEvent(log)).toBe(true);

    const event = PrivateFunctionBroadcastedEvent.fromLog(log);
    expect(event).toMatchSnapshot();
  });
});
