import { Fr, GlobalVariables, Proof } from "@aztec/circuits.js";
import { L2Block } from "../l2_block.js";
import { ProcessedTx } from "../index.js";

export type ProvingResult = {
  block: L2Block;
  proof: Proof;
}

/**
 * The interface to the prover client.
 * Provides the ability to generate proofs and build rollups.
 */
export interface BlockProver {

  proveBlock(
    globalVariables: GlobalVariables,
    txs: ProcessedTx[],
    newModelL1ToL2Messages: Fr[], // TODO(#4492): Rename this when purging the old inbox
    newL1ToL2Messages: Fr[], // TODO(#4492): Nuke this when purging the old inbox
  ): Promise<[L2Block, Proof]>;

  startNewBlock(numTxs: number, completionCallback: (result: ProvingResult) => void, globalVariables: GlobalVariables): void;

  addNewTx(tx: ProcessedTx): void;
}