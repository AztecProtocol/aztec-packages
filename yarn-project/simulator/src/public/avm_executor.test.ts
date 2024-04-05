import { AztecAddress, CallContext, EthAddress, FunctionData, FunctionSelector, type Header } from '@aztec/circuits.js';
import { makeHeader } from '@aztec/circuits.js/testing';
import { randomInt } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { AvmTestContractArtifact } from '@aztec/noir-contracts.js';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type CommitmentsDB, type PublicContractsDB, type PublicStateDB } from './db.js';
import { type PublicExecution } from './execution.js';
import { PublicExecutor } from './executor.js';
import { initContext, initExecutionEnvironment } from '../avm/fixtures/index.js';

describe('AVM WitGen and Proof Generation', () => {
  let publicState: MockProxy<PublicStateDB>;
  let publicContracts: MockProxy<PublicContractsDB>;
  let commitmentsDb: MockProxy<CommitmentsDB>;
  let header: Header;

  const callContext = CallContext.from({
    msgSender: AztecAddress.random(),
    storageContractAddress: AztecAddress.random(),
    portalContractAddress: EthAddress.random(),
    functionSelector: FunctionSelector.empty(),
    isDelegateCall: false,
    isStaticCall: false,
    sideEffectCounter: 0,
  });
  const contractAddress = AztecAddress.random();

  beforeEach(() => {
    publicState = mock<PublicStateDB>();
    publicContracts = mock<PublicContractsDB>();
    commitmentsDb = mock<CommitmentsDB>();

    header = makeHeader(randomInt(1000000));
  }, 10000);

  it('Should prove valid execution contract function that performs addition', async () => {
    const addArtifact = AvmTestContractArtifact.functions.find(f => f.name === 'add_args_return')!;
    const bytecode = addArtifact.bytecode;
    publicContracts.getBytecode.mockResolvedValue(bytecode);

    const functionData = FunctionData.fromAbi(addArtifact);
    const args: Fr[] = [new Fr(99), new Fr(12)];
    const context = initContext({ env: initExecutionEnvironment({ calldata: args }) });

    const execution: PublicExecution = { contractAddress, functionData, args: context.environment.calldata, callContext };
    const executor = new PublicExecutor(publicState, publicContracts, commitmentsDb, header);
    const [proof, vk] = await executor.getAvmProof(execution);
    const valid = await executor.verifyAvmProof(vk, proof);
    expect(valid).toBe(true);
  });
});
