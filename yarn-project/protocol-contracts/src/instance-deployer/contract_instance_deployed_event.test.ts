import { PrivateLog } from '@aztec/circuits.js';

import { getSampleContractInstanceDeployedEventPayload } from '../tests/fixtures.js';
import { ContractInstanceDeployedEvent } from './contract_instance_deployed_event.js';

describe('ContractInstanceDeployedEvent', () => {
  it('parses an event as emitted by the ClassInstanceDeployer', () => {
    const data = getSampleContractInstanceDeployedEventPayload();
    const log = PrivateLog.fromBuffer(data);
    expect(ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log)).toBe(true);

    const event = ContractInstanceDeployedEvent.fromLog(log);
    expect(event.address.toString()).toEqual('0x0c5c6978e380c4e3940ab74770639260bcc75c93c3d0ae48ee4a241d555b094e');
    expect(event.contractClassId.toString()).toEqual(
      '0x2b78af6d543573f77372e53e66932714d68877b4bcbb18671e68a846795297e1',
    );
  });
});
