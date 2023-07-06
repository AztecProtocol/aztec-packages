import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr, Point } from '@aztec/foundation/fields';
import { FunctionAbi } from '@aztec/foundation/abi';
import { CommitmentsDB } from '../index.js';

/**
 * The format that noir contracts use to get notes.
 */
export interface NoteLoadOracleInputs {
  /**
   * The preimage of the note.
   */
  preimage: Fr[];
  /**
   * The note's leaf index in the private data tree.
   */
  index: bigint;
}

/**
 * The format that noir uses to get L1 to L2 Messages.
 */
export interface MessageLoadOracleInputs {
  /**
   * An collapsed array of fields containing all of the l1 to l2 message components.
   * `l1ToL2Message.toFieldArray()` -\> [sender, chainId, recipient, version, content, secretHash, deadline, fee]
   */
  message: Fr[];
  /**
   * The path in the merkle tree to the message.
   */
  siblingPath: Fr[];
  /**
   * The index of the message commitment in the merkle tree.
   */
  index: bigint;
}

/**
 * The format noir uses to get commitments.
 */
export interface CommitmentDataOracleInputs {
  /** The siloed commitment. */
  commitment: Fr;
  /**
   * The path in the merkle tree to the commitment.
   */
  siblingPath: Fr[];
  /**
   * The index of the message commitment in the merkle tree.
   */
  index: bigint;
}

/**
 * The database oracle interface.
 */
export interface DBOracle extends CommitmentsDB {
  getSecretKey(contractAddress: AztecAddress, pubKey: Point): Promise<Buffer>;
  getNotes(
    contractAddress: AztecAddress,
    storageSlot: Fr,
    sortBy: number[],
    sortOrder: number[],
    limit: number,
    offset: number,
  ): Promise<{
    /** How many notes actually returned. */
    count: number;
    /** The notes. */
    notes: NoteLoadOracleInputs[];
  }>;
  getFunctionABI(contractAddress: AztecAddress, functionSelector: Buffer): Promise<FunctionAbi>;
  getPortalContractAddress(contractAddress: AztecAddress): Promise<EthAddress>;
}
