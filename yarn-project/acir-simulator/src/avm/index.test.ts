import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts';

import { jest } from '@jest/globals';
import { MockProxy, mock } from 'jest-mock-extended';

import { CommitmentsDB, PublicContractsDB, PublicStateDB } from '../index.js';
import { AvmContext } from './avm_context.js';
import { TypeTag } from './avm_memory_types.js';
import { initExecutionEnvironment } from './fixtures/index.js';
import { HostStorage } from './journal/host_storage.js';
import { AvmWorldStateJournal } from './journal/journal.js';
import { Add, CalldataCopy, Return } from './opcodes/index.js';
import { encodeToBytecode } from './serialization/bytecode_serialization.js';

describe('avm', () => {
  let journal: AvmWorldStateJournal;
  let contractsDb: MockProxy<PublicContractsDB>;

  beforeEach(() => {
    contractsDb = mock<PublicContractsDB>();

    const commitmentsDb = mock<CommitmentsDB>();
    const publicStateDb = mock<PublicStateDB>();
    const hostStorage = new HostStorage(publicStateDb, contractsDb, commitmentsDb);
    journal = new AvmWorldStateJournal(hostStorage);
  });

  it('Should execute bytecode that performs basic addition', async () => {
    const calldata: Fr[] = [new Fr(1), new Fr(2)];

    // Construct bytecode
    const bytecode = encodeToBytecode([
      new CalldataCopy(/*indirect=*/ 0, /*cdOffset=*/ 0, /*copySize=*/ 2, /*dstOffset=*/ 0),
      new Add(/*indirect=*/ 0, TypeTag.FIELD, /*aOffset=*/ 0, /*bOffset=*/ 1, /*dstOffset=*/ 2),
      new Return(/*indirect=*/ 0, /*returnOffset=*/ 2, /*copySize=*/ 1),
    ]);

    jest.spyOn(journal.hostStorage.contractsDb, 'getBytecode').mockReturnValue(Promise.resolve(bytecode));

    // Initialize AVM context
    const context = new AvmContext(journal, initExecutionEnvironment({ calldata }));

    // Execute AVM
    const results = await context.execute();

    expect(results.reverted).toBe(false);

    const returnData = results.output;
    expect(returnData.length).toBe(1);
    expect(returnData).toEqual([new Fr(3)]);
  });

  describe('testing transpiled Noir contracts', () => {
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/4361): sync wire format w/transpiler.
    it('Should execute contract function that performs addition', async () => {
      const calldata: Fr[] = [new Fr(1), new Fr(2)];

      // Get contract function artifact
      const addArtifact = AvmTestContractArtifact.functions.find(f => f.name === 'avm_addArgsReturn')!;

      // Decode bytecode into instructions
      const bytecode = Buffer.from(addArtifact.bytecode, 'base64');

      jest.spyOn(journal.hostStorage.contractsDb, 'getBytecode').mockReturnValue(Promise.resolve(bytecode));

      // Initialize AVM context
      const context = new AvmContext(journal, initExecutionEnvironment({ calldata }));

      // Execute AVM
      const results = await context.execute();

      expect(results.reverted).toBe(false);

      const returnData = results.output;
      expect(returnData.length).toBe(1);
      expect(returnData).toEqual([new Fr(3)]);
    });
  });
});
