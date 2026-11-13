/** A 32-byte field element as 0x-prefixed hex. */
export type FieldHex = `0x${string}`;

/** The canonical genesis of the protocol release this package ships with. */
export interface Genesis {
  /** What a world state is initialized with. Together these determine every value in `outputs`. */
  inputs: {
    treeHeights: {
      nullifierTree: number;
      noteHashTree: number;
      publicDataTree: number;
      l1ToL2MessageTree: number;
      archive: number;
    };
    /** Leaves each indexed tree starts with, the prefilled ones included. */
    treePrefill: { nullifierTree: number; publicDataTree: number };
    /** The domain separator of the genesis block header's hash. */
    initialHeaderGeneratorPoint: number;
    /** The protocol contracts' registration nullifiers, sorted ascending. */
    prefilledNullifiers: readonly FieldHex[];
    prefilledPublicData: readonly { slot: FieldHex; value: FieldHex }[];
    genesisTimestamp: number;
  };
  /** What a world state initialized with `inputs` reports. */
  outputs: {
    nullifierTreeRoot: FieldHex;
    /** The hash of the genesis block header, the archive's first leaf. */
    blockHeaderHash: FieldHex;
    archiveRoot: FieldHex;
  };
}

export declare const GENESIS: Genesis;
