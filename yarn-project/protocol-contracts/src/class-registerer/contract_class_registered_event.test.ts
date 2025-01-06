import { computePublicBytecodeCommitment } from '@aztec/circuits.js';

import { getSampleContractClassRegisteredEventPayload } from '../tests/fixtures.js';
import { ContractClassRegisteredEvent } from './contract_class_registered_event.js';

describe('ContractClassRegisteredEvent', () => {
  it('parses an event as emitted by the ContractClassRegisterer', () => {
    const log = getSampleContractClassRegisteredEventPayload();
    expect(ContractClassRegisteredEvent.isContractClassRegisteredEvent(log)).toBe(true);

    const event = ContractClassRegisteredEvent.fromLog(log);
    expect(event.contractClassId.toString()).toEqual(
      '0x1c9a43d08a1af21c35e4201262a49497a488b0686209370a70f2434af643b4f7',
    );
    expect(event.artifactHash.toString()).toEqual('0x072dce903b1a299d6820eeed695480fe9ec46658b1101885816aed6dd86037f0');
    expect(event.packedPublicBytecode.length).toEqual(27090);
    expect(computePublicBytecodeCommitment(event.packedPublicBytecode).toString()).toEqual(
      '0x0378491b34825cd67d1e13e140bbc80f2cd3a9b52171ea577f8f11620d4198ba',
    );
  });
});
