import {
  type FunctionArtifact,
  FunctionCall,
  FunctionSelector,
  FunctionType,
  encodeArguments,
} from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { ContractFunctionSimulator } from '../../contract_function_simulator/contract_function_simulator.js';
import type { EntityTypeId, FactStore } from './fact_store.js';
import { type ReceptionState, packFacts, receptionStateFromCode } from './offchain_reception_fixture.js';

/**
 * Run the offchain-reception fold over one entity's currently-canonical fact set, in the real
 * simulator: filter by canonicality, pack the facts, run the Noir fold as a utility function, and
 * decode the returned state.
 */
export async function foldOffchainReception(
  factStore: FactStore,
  simulator: ContractFunctionSimulator,
  fixture: { artifact: FunctionArtifact & { contractName: string }; address: AztecAddress },
  anchorBlockHeader: BlockHeader,
  entityType: EntityTypeId,
  correlationKey: Buffer,
  jobId: string,
): Promise<ReceptionState> {
  const facts = await factStore.loadCanonicalFactSet(entityType, correlationKey);
  const packed = packFacts(facts);

  const call = FunctionCall.from({
    name: fixture.artifact.name,
    to: fixture.address,
    selector: FunctionSelector.empty(),
    type: FunctionType.UTILITY,
    hideMsgSender: false,
    isStatic: false,
    args: encodeArguments(fixture.artifact, [packed]),
    returnTypes: fixture.artifact.returnTypes,
  });

  const { result } = await simulator.runUtility(call, [], anchorBlockHeader, [], jobId);
  if (result.length === 0) {
    throw new Error('offchain_reception_fold returned no value');
  }
  return receptionStateFromCode(result[0].toNumber());
}
