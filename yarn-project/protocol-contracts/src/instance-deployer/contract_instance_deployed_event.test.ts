import { PrivateLog } from '@aztec/stdlib/logs';

import { getSampleContractInstanceDeployedEventPayload } from '../tests/fixtures.js';
import { ContractInstanceDeployedEvent } from './contract_instance_deployed_event.js';

describe('ContractInstanceDeployedEvent', () => {
  it('parses an event as emitted by the ClassInstanceDeployer', () => {
    const data = getSampleContractInstanceDeployedEventPayload();
    const log = PrivateLog.fromBuffer(data);
    expect(ContractInstanceDeployedEvent.isContractInstanceDeployedEvent(log)).toBe(true);

    const event = ContractInstanceDeployedEvent.fromLog(log);
    expect(event.address.toString()).toEqual('0x04f87a348a9ae0b5d14e97994e7ca28167781e7472f1a1e4855e35899bb2a817');
    expect(event.contractClassId.toString()).toEqual(
      '0x0c2bdf9780f2cae1057a85ad251639170e5db7b97bcbf3732f103a62de70e53a',
    );
  });
});
