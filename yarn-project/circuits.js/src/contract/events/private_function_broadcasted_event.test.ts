import { getSamplePrivateFunctionBroadcastedEventPayload } from '../../tests/fixtures.js';
import { PrivateFunctionBroadcastedEvent } from './private_function_broadcasted_event.js';

describe('PrivateFunctionBroadcastedEvent', () => {
  it('parses an event as emitted by the ContractClassRegisterer', () => {
    const data = getSamplePrivateFunctionBroadcastedEventPayload();
    const event = PrivateFunctionBroadcastedEvent.fromLogData(data);
    expect(event.toBuffer().toString('hex')).toMatchSnapshot();
  });
});
