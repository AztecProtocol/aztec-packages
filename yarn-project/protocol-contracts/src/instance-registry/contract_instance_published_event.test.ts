import { PrivateLog } from '@aztec/stdlib/logs';

import { getSampleContractInstancePublishedEventPayload } from '../tests/fixtures.js';
import { ContractInstancePublishedEvent } from './contract_instance_published_event.js';

describe('ContractInstancePublishedEvent', () => {
  it('parses an event as emitted by the ClassInstanceRegistry', () => {
    const data = getSampleContractInstancePublishedEventPayload();
    const log = PrivateLog.fromBuffer(data);
    expect(ContractInstancePublishedEvent.isContractInstancePublishedEvent(log)).toBe(true);

    const event = ContractInstancePublishedEvent.fromLog(log);

    // See ./__snapshots__/README.md for how to update the snapshot.
    expect(event).toMatchSnapshot();
  });
});
