import {
  Fr,
  GrumpkinScalar,
  MAX_NEW_COMMITMENTS_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_READ_REQUESTS_PER_TX,
  MembershipWitness,
  NULLIFIER_TREE_HEIGHT,
  NullifierKeyValidationRequestContext,
  NullifierReadRequestResetHintsBuilder,
  ReadRequestContext,
  SideEffect,
  SideEffectLinkedToNoteHash,
  SideEffectType,
} from '@aztec/circuits.js';
import { siloNullifier } from '@aztec/circuits.js/hash';
import { makeTuple } from '@aztec/foundation/array';
import { Tuple } from '@aztec/foundation/serialize';

import { ProvingDataOracle } from './proving_data_oracle.js';

export class HintsBuilder {
  constructor(private oracle: ProvingDataOracle) {}

  sortSideEffects<T extends SideEffectType, K extends number>(
    sideEffects: Tuple<T, K>,
  ): [Tuple<T, K>, Tuple<number, K>] {
    const sorted = sideEffects
      .map((sideEffect, index) => ({ sideEffect, index }))
      .sort((a, b) => {
        // Empty ones go to the right
        if (a.sideEffect.isEmpty()) {
          return 1;
        }
        return Number(a.sideEffect.counter.toBigInt() - b.sideEffect.counter.toBigInt());
      });

    const originalToSorted = sorted.map(() => 0);
    sorted.forEach(({ index }, i) => {
      originalToSorted[index] = i;
    });

    return [sorted.map(({ sideEffect }) => sideEffect) as Tuple<T, K>, originalToSorted as Tuple<number, K>];
  }

  /**
   * Performs the matching between an array of read request and an array of commitments. This produces
   * hints for the private kernel ordering circuit to efficiently match a read request with the corresponding
   * commitment.
   *
   * @param readRequests - The array of read requests.
   * @param commitments - The array of commitments.
   * @returns An array of hints where each element is the index of the commitment in commitments array
   *  corresponding to the read request. In other words we have readRequests[i] == commitments[hints[i]].
   */
  getReadRequestHints(
    readRequests: Tuple<SideEffect, typeof MAX_READ_REQUESTS_PER_TX>,
    commitments: Tuple<SideEffect, typeof MAX_NEW_COMMITMENTS_PER_TX>,
  ): Tuple<Fr, typeof MAX_READ_REQUESTS_PER_TX> {
    const hints = makeTuple(MAX_READ_REQUESTS_PER_TX, Fr.zero);
    for (let i = 0; i < MAX_READ_REQUESTS_PER_TX && !readRequests[i].isEmpty(); i++) {
      const equalToRR = (cmt: SideEffect) => cmt.value.equals(readRequests[i].value);
      const result = commitments.findIndex(equalToRR);
      if (result == -1) {
        throw new Error(
          `The read request at index ${i} with value ${readRequests[i].toString()} does not match to any commitment.`,
        );
      } else {
        hints[i] = new Fr(result);
      }
    }
    return hints;
  }

  async getNullifierReadRequestResetHints(
    nullifiers: Tuple<SideEffectLinkedToNoteHash, typeof MAX_NEW_NULLIFIERS_PER_TX>,
    nullifierReadRequests: Tuple<ReadRequestContext, typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX>,
  ) {
    // TODO - Should be comparing un-siloed values and contract addresses.
    const builder = new NullifierReadRequestResetHintsBuilder();
    const nullifierIndexMap: Map<bigint, number> = new Map();
    nullifiers.forEach((n, i) => nullifierIndexMap.set(n.value.toBigInt(), i));
    const siloedReadRequestValues = nullifierReadRequests.map(r =>
      r.isEmpty() ? Fr.ZERO : siloNullifier(r.contractAddress, r.value),
    );
    for (let i = 0; i < nullifierReadRequests.length; ++i) {
      const value = siloedReadRequestValues[i];
      if (value.isZero()) {
        break;
      }
      const pendingValueIndex = nullifierIndexMap.get(value.toBigInt());
      if (pendingValueIndex !== undefined) {
        builder.addPendingReadRequest(i, pendingValueIndex);
      } else {
        const membershipWitness = await this.oracle.getNullifierMembershipWitness(0, value);
        if (!membershipWitness) {
          throw new Error('Read request is reading an unknown nullifier value.');
        }
        builder.addSettledReadRequest(
          i,
          new MembershipWitness(
            NULLIFIER_TREE_HEIGHT,
            membershipWitness.index,
            membershipWitness.siblingPath.toTuple<typeof NULLIFIER_TREE_HEIGHT>(),
          ),
        );
      }
    }
    return builder.toHints();
  }

  /**
   *  Performs the matching between an array of nullified commitments and an array of commitments. This produces
   * hints for the private kernel ordering circuit to efficiently match a nullifier with the corresponding
   * commitment.
   *
   * @param nullifiedCommitments - The array of nullified commitments.
   * @param commitments - The array of commitments.
   * @returns An array of hints where each element is the index of the commitment in commitments array
   *  corresponding to the nullified commitments. In other words we have nullifiedCommitments[i] == commitments[hints[i]].
   */
  getNullifierHints(
    nullifiedCommitments: Tuple<Fr, typeof MAX_NEW_NULLIFIERS_PER_TX>,
    commitments: Tuple<SideEffect, typeof MAX_NEW_COMMITMENTS_PER_TX>,
  ): Tuple<Fr, typeof MAX_NEW_NULLIFIERS_PER_TX> {
    const hints = makeTuple(MAX_NEW_NULLIFIERS_PER_TX, Fr.zero);
    for (let i = 0; i < MAX_NEW_NULLIFIERS_PER_TX; i++) {
      if (!nullifiedCommitments[i].isZero()) {
        const equalToCommitment = (cmt: SideEffect) => cmt.value.equals(nullifiedCommitments[i]);
        const result = commitments.findIndex(equalToCommitment);
        if (result == -1) {
          throw new Error(
            `The nullified commitment at index ${i} with value ${nullifiedCommitments[
              i
            ].toString()} does not match to any commitment.`,
          );
        } else {
          hints[i] = new Fr(result);
        }
      }
    }
    return hints;
  }

  async getMasterNullifierSecretKeys(
    nullifierKeyValidationRequests: Tuple<
      NullifierKeyValidationRequestContext,
      typeof MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX
    >,
  ) {
    const keys = makeTuple(MAX_NULLIFIER_KEY_VALIDATION_REQUESTS_PER_TX, GrumpkinScalar.zero);
    for (let i = 0; i < nullifierKeyValidationRequests.length; ++i) {
      const request = nullifierKeyValidationRequests[i];
      if (request.isEmpty()) {
        break;
      }
      keys[i] = await this.oracle.getMasterNullifierSecretKey(request.publicKey);
    }
    return keys;
  }
}
