import {
  Fr,
  GrumpkinScalar,
  type KeyGenerator,
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
  type MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MembershipWitness,
  NULLIFIER_TREE_HEIGHT,
  type PrivateKernelCircuitPublicInputs,
  PrivateKernelResetHints,
  type ScopedKeyValidationRequest,
  type ScopedNullifier,
  type ScopedReadRequest,
  buildNoteHashReadRequestHints,
  buildNullifierReadRequestHints,
  buildTransientDataHints,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { type Tuple } from '@aztec/foundation/serialize';

import { type ProvingDataOracle } from '../proving_data_oracle.js';

function getNullifierReadRequestHints(
  nullifierReadRequests: Tuple<ScopedReadRequest, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  nullifiers: Tuple<ScopedNullifier, typeof MAX_NEW_NULLIFIERS_PER_TX>,
  oracle: ProvingDataOracle,
) {
  const getNullifierMembershipWitness = async (nullifier: Fr) => {
    const res = await oracle.getNullifierMembershipWitness(nullifier);
    if (!res) {
      throw new Error(`Cannot find the leaf for nullifier ${nullifier.toBigInt()}.`);
    }

    const { index, siblingPath, leafPreimage } = res;
    return {
      membershipWitness: new MembershipWitness(
        NULLIFIER_TREE_HEIGHT,
        index,
        siblingPath.toTuple<typeof NULLIFIER_TREE_HEIGHT>(),
      ),
      leafPreimage,
    };
  };

  return buildNullifierReadRequestHints({ getNullifierMembershipWitness }, nullifierReadRequests, nullifiers);
}

async function getMasterSecretKeysAndAppKeyGenerators(
  keyValidationRequests: Tuple<ScopedKeyValidationRequest, typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
  oracle: ProvingDataOracle,
): Promise<
  [
    Tuple<GrumpkinScalar, typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
    Tuple<KeyGenerator, typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX>,
  ]
> {
  const keys = makeTuple(MAX_KEY_VALIDATION_REQUESTS_PER_TX, GrumpkinScalar.zero);
  const generators = makeTuple(MAX_KEY_VALIDATION_REQUESTS_PER_TX, () => 0);
  for (let i = 0; i < keyValidationRequests.length; ++i) {
    const request = keyValidationRequests[i].request;
    if (request.isEmpty()) {
      break;
    }
    [keys[i], generators[i]] = await oracle.getMasterSecretKeyAndAppKeyGenerator(request.masterPublicKey);
  }
  return [keys, generators];
}

export async function buildPrivateKernelResetHints(
  publicInputs: PrivateKernelCircuitPublicInputs,
  noteHashLeafIndexMap: Map<bigint, bigint>,
  oracle: ProvingDataOracle,
) {
  const noteHashReadRequestHints = await buildNoteHashReadRequestHints(
    oracle,
    publicInputs.validationRequests.noteHashReadRequests,
    publicInputs.end.newNoteHashes,
    noteHashLeafIndexMap,
  );

  const nullifierReadRequestHints = await getNullifierReadRequestHints(
    publicInputs.validationRequests.nullifierReadRequests,
    publicInputs.end.newNullifiers,
    oracle,
  );

  const [masterSecretKeys, appKeyGenerators] = await getMasterSecretKeysAndAppKeyGenerators(
    publicInputs.validationRequests.keyValidationRequests,
    oracle,
  );

  // In TS key generators are numbers but circuits expect Fr so we have to do this ugly conversion 🤮💥🤮🌪️🤮🔥🤮🌈🤮
  const appKeyGeneratorsFields = appKeyGenerators.map(generator => new Fr(generator)) as Tuple<
    Fr,
    typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX
  >;

  const [
    transientNullifierIndexesForNoteHashes,
    transientNoteHashIndexesForNullifiers,
    transientNoteHashIndexesForLogs,
  ] = buildTransientDataHints(
    publicInputs.end.newNoteHashes,
    publicInputs.end.newNullifiers,
    publicInputs.end.noteEncryptedLogsHashes,
    MAX_NEW_NOTE_HASHES_PER_TX,
    MAX_NEW_NULLIFIERS_PER_TX,
    MAX_NOTE_ENCRYPTED_LOGS_PER_TX,
  );

  return new PrivateKernelResetHints(
    transientNullifierIndexesForNoteHashes,
    transientNoteHashIndexesForNullifiers,
    transientNoteHashIndexesForLogs,
    noteHashReadRequestHints,
    nullifierReadRequestHints,
    masterSecretKeys,
    appKeyGeneratorsFields,
  );
}
