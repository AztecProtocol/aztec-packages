import { getSampleContractInstanceDeployedEventPayload } from '../../tests/fixtures.js';
import { ContractInstanceDeployedEvent } from './contract_instance_deployed_event.js';

describe('ContractInstanceDeployedEvent', () => {
  it('parses an event as emitted by the ClassInstanceDeployer', () => {
    const data = getSampleContractInstanceDeployedEventPayload();
    const event = ContractInstanceDeployedEvent.fromLogData(data);
    expect(event.address.toString()).toEqual('0x011870b273ea9661b2893efeb641df4136b3f67b24fc79aed1d5bd779d35e3cd');
    expect(event.contractClassId.toString()).toEqual(
      '0x23ced3716a04d81b58822bc3e1843626aa2884888b1a2d2250e79fb7d41a365e',
    );
  });
});
