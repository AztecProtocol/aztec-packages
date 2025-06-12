import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

import { AztecAddress } from '../aztec-address/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import { BlockHeader } from '../tx/block_header.js';
import { ContentCommitment } from '../tx/content_commitment.js';
import { GlobalVariables } from '../tx/global_variables.js';
import { PartialStateReference } from '../tx/partial_state_reference.js';
import { StateReference } from '../tx/state_reference.js';

/**
 * Makes header.
 */
export function makeHeader(seed = 0, blockNumber?: number, slotNumber?: number, inHash?: Fr): BlockHeader {
  return new BlockHeader(
    makeAppendOnlyTreeSnapshot(seed + 0x100),
    makeContentCommitment(seed + 0x200, inHash),
    makeStateReference(seed + 0x600),
    makeGlobalVariables((seed += 0x700), blockNumber, slotNumber ?? blockNumber),
    new Fr(seed + 0x800),
    new Fr(seed + 0x900),
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

/**
 * Makes global variables.
 * @param seed - The seed to use for generating the global variables.
 * @param blockNumber - The block number to use for generating the global variables.
 * If blockNumber is undefined, it will be set to seed + 2.
 * @returns Global variables.
 */
export function makeGlobalVariables(
  seed = 1,
  blockNumber: number | undefined = undefined,
  slotNumber: number | undefined = undefined,
): GlobalVariables {
  return new GlobalVariables(
    new Fr(seed),
    new Fr(seed + 1),
    new Fr(blockNumber ?? seed + 2),
    new Fr(slotNumber ?? seed + 3),
    BigInt(seed + 4),
    EthAddress.fromField(new Fr(seed + 5)),
    AztecAddress.fromField(new Fr(seed + 6)),
    new GasFees(seed + 7, seed + 8),
  );
}
