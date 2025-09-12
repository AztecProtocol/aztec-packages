import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { ContractClassLog } from '@aztec/stdlib/logs';

import { getSamplePrivateFunctionBroadcastedEventPayload } from '../tests/fixtures.js';
import { PrivateFunctionBroadcastedEvent } from './private_function_broadcasted_event.js';

describe('PrivateFunctionBroadcastedEvent', () => {
  beforeAll(() => setupCustomSnapshotSerializers(expect));

  it('parses an event as emitted by the ContractClassRegistry', () => {
    const log = ContractClassLog.fromBuffer(getSamplePrivateFunctionBroadcastedEventPayload());
    expect(PrivateFunctionBroadcastedEvent.isPrivateFunctionBroadcastedEvent(log)).toBe(true);

    const event = PrivateFunctionBroadcastedEvent.fromLog(log);

    // See ./__snapshots__/README.md for how to update the snapshot.
    expect(event).toMatchSnapshot();
  });
});
