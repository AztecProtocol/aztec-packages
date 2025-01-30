import { ContractClassLog, computePublicBytecodeCommitment } from '@aztec/circuits.js';

import { getSampleContractClassRegisteredEventPayload } from '../tests/fixtures.js';
import { ContractClassRegisteredEvent } from './contract_class_registered_event.js';

describe('ContractClassRegisteredEvent', () => {
  it('parses an event as emitted by the ContractClassRegisterer', async () => {
    const log = ContractClassLog.fromBuffer(getSampleContractClassRegisteredEventPayload());
    expect(ContractClassRegisteredEvent.isContractClassRegisteredEvent(log)).toBe(true);

    const event = ContractClassRegisteredEvent.fromLog(log);
    expect(event.contractClassId.toString()).toEqual(
      '0x1c9a43d08a1af21c35e4201262a49497a488b0686209370a70f2434af643b4f7',
    );
    expect(event.artifactHash.toString()).toEqual('0x072dce903b1a299d6820eeed695480fe9ec46658b1101885816aed6dd86037f0');
    expect(event.packedPublicBytecode.length).toEqual(27090);
    const publicBytecodeCommitment = await computePublicBytecodeCommitment(event.packedPublicBytecode);
    expect(publicBytecodeCommitment.toString()).toEqual(
      '0x1d7d509f736d09975b88d01b5779a6f52e70905ba9294776d4881e811e6c1e9f',
    );
  });
});
