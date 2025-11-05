import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block } from '@aztec/stdlib/block';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import { makeAppendOnlyTreeSnapshot } from '@aztec/stdlib/testing';
import {
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { GlobalVariables, TxEffect, TxHash } from '@aztec/stdlib/tx';
import type { UInt32 } from '@aztec/stdlib/types';

import { insertTxEffectIntoWorldTrees, makeTXEBlockHeader } from '../utils/block_creation.js';
import type { IAvmExecutionOracle } from './interfaces.js';

export class TXEOraclePublicContext implements IAvmExecutionOracle {
  isAvm = true as const;

  private logger: Logger;
  private transientUniqueNoteHashes: Fr[] = [];
  private transientSiloedNullifiers: Fr[] = [];
  private publicDataWrites: PublicDataWrite[] = [];

  constructor(
    private contractAddress: AztecAddress,
    private forkedWorldTrees: MerkleTreeWriteOperations,
    private txRequestHash: Fr,
    private globalVariables: GlobalVariables,
  ) {
    this.logger = createLogger('txe:public_context');

    this.logger.debug('Entering Public Context', {
      contractAddress,
      blockNumber: globalVariables.blockNumber,
      timestamp: globalVariables.timestamp,
    });
  }

  avmOpcodeAddress(): Promise<AztecAddress> {
    return Promise.resolve(this.contractAddress);
  }

  avmOpcodeSender(): Promise<AztecAddress> {
    return Promise.resolve(AztecAddress.ZERO); // todo: change?
  }

  avmOpcodeBlockNumber(): Promise<UInt32> {
    return Promise.resolve(this.globalVariables.blockNumber);
  }

  avmOpcodeTimestamp(): Promise<bigint> {
    return Promise.resolve(this.globalVariables.timestamp);
  }

  avmOpcodeIsStaticCall(): Promise<boolean> {
    return Promise.resolve(false);
  }

  avmOpcodeChainId(): Promise<Fr> {
    return Promise.resolve(this.globalVariables.chainId);
  }

  avmOpcodeVersion(): Promise<Fr> {
    return Promise.resolve(this.globalVariables.version);
  }

  async avmOpcodeEmitNullifier(nullifier: Fr) {
    const siloedNullifier = await siloNullifier(this.contractAddress, nullifier);
    this.transientSiloedNullifiers.push(siloedNullifier);
  }

  async avmOpcodeEmitNoteHash(noteHash: Fr) {
    const siloedNoteHash = await siloNoteHash(this.contractAddress, noteHash);
    // TODO: make the note hash unique - they are only siloed right now
    this.transientUniqueNoteHashes.push(siloedNoteHash);
  }

  async avmOpcodeNullifierExists(innerNullifier: Fr, targetAddress: AztecAddress): Promise<boolean> {
    const nullifier = await siloNullifier(targetAddress, innerNullifier!);

    const treeIndex = (
      await this.forkedWorldTrees.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()])
    )[0];
    const transientIndex = this.transientSiloedNullifiers.find(n => n.equals(nullifier));

    return treeIndex !== undefined || transientIndex !== undefined;
  }

  async avmOpcodeStorageWrite(slot: Fr, value: Fr) {
    this.logger.debug('AVM storage write', { slot, value });

    const dataWrite = new PublicDataWrite(await computePublicDataTreeLeafSlot(this.contractAddress, slot), value);

    this.publicDataWrites.push(dataWrite);

    await this.forkedWorldTrees.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [
      new PublicDataTreeLeaf(dataWrite.leafSlot, dataWrite.value).toBuffer(),
    ]);
  }

  async avmOpcodeStorageRead(slot: Fr): Promise<Fr> {
    const leafSlot = await computePublicDataTreeLeafSlot(this.contractAddress, slot);

    const lowLeafResult = await this.forkedWorldTrees.getPreviousValueIndex(
      MerkleTreeId.PUBLIC_DATA_TREE,
      leafSlot.toBigInt(),
    );

    const value =
      !lowLeafResult || !lowLeafResult.alreadyPresent
        ? Fr.ZERO
        : (
            (await this.forkedWorldTrees.getLeafPreimage(
              MerkleTreeId.PUBLIC_DATA_TREE,
              lowLeafResult.index,
            )) as PublicDataTreeLeafPreimage
          ).leaf.value;

    this.logger.debug('AVM storage read', { slot, value });

    return value;
  }

  async close(): Promise<L2Block> {
    this.logger.debug('Exiting Public Context, building block with collected side effects', {
      blockNumber: this.globalVariables.blockNumber,
    });

    const txEffect = this.makeTxEffect();
    await insertTxEffectIntoWorldTrees(txEffect, this.forkedWorldTrees);

    const block = new L2Block(
      makeAppendOnlyTreeSnapshot(),
      await makeTXEBlockHeader(this.forkedWorldTrees, this.globalVariables),
      new Body([txEffect]),
    );

    await this.forkedWorldTrees.close();

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
}
