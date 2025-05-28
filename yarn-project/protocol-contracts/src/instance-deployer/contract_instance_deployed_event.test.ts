import { PrivateLog } from '@aztec/stdlib/logs';

import { getSampleContractInstanceDeployedEventPayload } from '../tests/fixtures.js';
import { ContractInstanceDeployedEvent } from './contract_instance_deployed_event.js';

describe('ContractInstanceDeployedEvent', () => {
  it('parses an event as emitted by the ClassInstanceDeployer', () => {
    const data = getSampleContractInstanceDeployedEventPayload();
    const log = PrivateLog.fromBuffer(data);
    expect(ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log)).toBe(true);

    const event = ContractInstanceDeployedEvent.fromLog(log);
    expect(event).toMatchSnapshot();
  });
});
