import { compact } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import type { FieldsOf } from '@aztec/foundation/types';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { ContentCommitment } from '../tx/content_commitment.js';
import { GlobalVariables } from '../tx/global_variables.js';
import { PartialStateReference } from '../tx/partial_state_reference.js';
import { StateReference } from '../tx/state_reference.js';
import { L2BlockHeader } from './l2_block_header.js';

export function makeL2BlockHeader(
  seed = 0,
  blockNumber?: number,
  slotNumber?: number,
  overrides: Partial<FieldsOf<L2BlockHeader>> = {},
  inHash?: Fr,
) {
  return new L2BlockHeader(
    makeAppendOnlyTreeSnapshot(seed + 0x100),
    overrides?.contentCommitment ?? makeContentCommitment(seed + 0x200, inHash),
    overrides?.state ?? makeStateReference(seed + 0x600),
    makeGlobalVariables((seed += 0x700), {
      ...(blockNumber ? { blockNumber } : {}),
      ...(slotNumber ? { slotNumber: new Fr(slotNumber) } : {}),
    }),
    new Fr(seed + 0x800),
    new Fr(seed + 0x900),
    new Fr(seed + 0xa00),
  );
}

/**
 * Makes arbitrary append only tree snapshot.
 * @param seed - The seed to use for generating the append only tree snapshot.
 * @returns An append only tree snapshot.
 */
export function makeAppendOnlyTreeSnapshot(seed = 1): AppendOnlyTreeSnapshot {
  return new AppendOnlyTreeSnapshot(new Fr(seed), seed);
}

/**
 * Makes content commitment
 */
function makeContentCommitment(seed = 0, inHash?: Fr): ContentCommitment {
  return new ContentCommitment(new Fr(seed + 0x100), inHash ?? new Fr(seed + 0x200), new Fr(seed + 0x300));
}

/**
 * Makes arbitrary state reference.
 * @param seed - The seed to use for generating the state reference.
 * @returns A state reference.
 */
function makeStateReference(seed = 0): StateReference {
  return new StateReference(makeAppendOnlyTreeSnapshot(seed), makePartialStateReference(seed + 1));
}

/**
 * Makes arbitrary partial state reference.
 * @param seed - The seed to use for generating the partial state reference.
 * @returns A partial state reference.
 */
function makePartialStateReference(seed = 0): PartialStateReference {
  return new PartialStateReference(
    makeAppendOnlyTreeSnapshot(seed),
    makeAppendOnlyTreeSnapshot(seed + 1),
    makeAppendOnlyTreeSnapshot(seed + 2),
  );
}

function makeGlobalVariables(seed = 1, overrides: Partial<FieldsOf<GlobalVariables>> = {}): GlobalVariables {
  return GlobalVariables.from({
    chainId: new Fr(seed),
    version: new Fr(seed + 1),
    blockNumber: seed + 2,
    slotNumber: new Fr(seed + 3),
    timestamp: BigInt(seed + 4),
    coinbase: EthAddress.fromField(new Fr(seed + 5)),
    feeRecipient: AztecAddress.fromField(new Fr(seed + 6)),
    gasFees: new GasFees(seed + 7, seed + 8),
    ...compact(overrides),
  });
}
