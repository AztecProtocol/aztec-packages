import {
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block } from '@aztec/stdlib/block';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { makeAppendOnlyTreeSnapshot, makeContentCommitment } from '@aztec/stdlib/testing';
import {
  AppendOnlyTreeSnapshot,
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, TxEffect, TxHash } from '@aztec/stdlib/tx';
import type { UInt32 } from '@aztec/stdlib/types';

import { TXETypedOracle } from './txe_typed_oracle.js';

export class TXEOraclePublicContext extends TXETypedOracle {
  private logger: Logger;
  private transientUniqueNoteHashes: Fr[] = [];
  private transientSiloedNullifiers: Fr[] = [];
  private publicDataWrites: PublicDataWrite[] = [];

  constructor(
    private contractAddress: AztecAddress,
    private worldTrees: MerkleTreeWriteOperations,
    private txRequestHash: Fr,
    private globalVariables: GlobalVariables,
  ) {
    super();
    this.logger = createLogger('txe:public_context');

    this.logger.debug('Entering PublicContext', {
      contractAddress,
      blockNumber: globalVariables.blockNumber,
      timestamp: globalVariables.timestamp,
    });
  }

  override avmOpcodeAddress(): Promise<AztecAddress> {
    return Promise.resolve(this.contractAddress);
  }

  override avmOpcodeBlockNumber(): Promise<UInt32> {
    return Promise.resolve(this.globalVariables.blockNumber);
  }

  override avmOpcodeTimestamp(): Promise<bigint> {
    return Promise.resolve(this.globalVariables.timestamp);
  }

  override avmOpcodeIsStaticCall(): Promise<boolean> {
    return Promise.resolve(false);
  }

  override avmOpcodeChainId(): Promise<Fr> {
    return Promise.resolve(this.globalVariables.chainId);
  }

  override avmOpcodeVersion(): Promise<Fr> {
    return Promise.resolve(this.globalVariables.version);
  }

  override async avmOpcodeEmitNullifier(nullifier: Fr) {
    const siloedNullifier = await siloNullifier(this.contractAddress, nullifier);
    this.transientSiloedNullifiers.push(siloedNullifier);
  }

  override async avmOpcodeEmitNoteHash(noteHash: Fr) {
    const siloedNoteHash = await siloNoteHash(this.contractAddress, noteHash);
    // TODO: make the note hash unique - they are only siloed right now
    this.transientUniqueNoteHashes.push(siloedNoteHash);
  }

  override async avmOpcodeNullifierExists(innerNullifier: Fr, targetAddress: AztecAddress): Promise<boolean> {
    const nullifier = await siloNullifier(targetAddress, innerNullifier!);

    const treeIndex = (await this.worldTrees.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]))[0];
    const transientIndex = this.transientSiloedNullifiers.find(n => n.equals(nullifier));

    return treeIndex !== undefined || transientIndex !== undefined;
  }

  override async avmOpcodeStorageWrite(slot: Fr, value: Fr) {
    this.logger.debug('AVM storage write', { slot, value });

    const dataWrite = new PublicDataWrite(await computePublicDataTreeLeafSlot(this.contractAddress, slot), value);

    this.publicDataWrites.push(dataWrite);

    await this.worldTrees.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [
      new PublicDataTreeLeaf(dataWrite.leafSlot, dataWrite.value).toBuffer(),
    ]);
  }

  override async avmOpcodeStorageRead(slot: Fr): Promise<Fr> {
    const leafSlot = await computePublicDataTreeLeafSlot(this.contractAddress, slot);

    const lowLeafResult = await this.worldTrees.getPreviousValueIndex(
      MerkleTreeId.PUBLIC_DATA_TREE,
      leafSlot.toBigInt(),
    );

    const value =
      !lowLeafResult || !lowLeafResult.alreadyPresent
        ? Fr.ZERO
        : (
            (await this.worldTrees.getLeafPreimage(
              MerkleTreeId.PUBLIC_DATA_TREE,
              lowLeafResult.index,
            )) as PublicDataTreeLeafPreimage
          ).leaf.value;

    this.logger.debug('AVM storage read', { slot, value });

    return value;
  }

  async close(): Promise<L2Block> {
    this.logger.debug('Exiting PublicContext, building block with collected side effects', {
      blockNumber: this.globalVariables.blockNumber,
    });

    const txEffect = this.makeTxEffect();
    await this.insertSideEffectIntoWorldTrees(txEffect);

    const block = new L2Block(
      makeAppendOnlyTreeSnapshot(this.globalVariables.blockNumber),
      await this.makeBlockHeader(),
      new Body([txEffect]),
    );

    await this.worldTrees.close();

    this.logger.debug('Exited PublicContext with built block', {
      blockNumber: block.number,
      txEffects: block.body.txEffects,
    });

    return block;
  }

  private makeTxEffect(): TxEffect {
    const txEffect = TxEffect.empty();

    txEffect.noteHashes = this.transientUniqueNoteHashes;
    txEffect.nullifiers = [this.txRequestHash, ...this.transientSiloedNullifiers];

    txEffect.publicDataWrites = this.publicDataWrites;
    // TODO: support public logs

    txEffect.txHash = new TxHash(new Fr(this.globalVariables.blockNumber));

    return txEffect;
  }

  private async insertSideEffectIntoWorldTrees(txEffect: TxEffect) {
    const l1ToL2Messages = Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(0).map(Fr.zero);

    await this.worldTrees.appendLeaves(
      MerkleTreeId.NOTE_HASH_TREE,
      padArrayEnd(txEffect.noteHashes, Fr.ZERO, MAX_NOTE_HASHES_PER_TX),
    );

    await this.worldTrees.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    // We do not need to add public data writes because we apply them as we go.

    await this.worldTrees.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      padArrayEnd(txEffect.nullifiers, Fr.ZERO, MAX_NULLIFIERS_PER_TX).map(nullifier => nullifier.toBuffer()),
      NULLIFIER_SUBTREE_HEIGHT,
    );
  }

  private async makeBlockHeader(): Promise<BlockHeader> {
    const stateReference = await this.worldTrees.getStateReference();
    const archiveInfo = await this.worldTrees.getTreeInfo(MerkleTreeId.ARCHIVE);

    return new BlockHeader(
      new AppendOnlyTreeSnapshot(new Fr(archiveInfo.root), Number(archiveInfo.size)),
      makeContentCommitment(),
      stateReference,
      this.globalVariables,
      Fr.ZERO,
      Fr.ZERO,
    );
  }
}
