import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { ContractStore } from '@aztec/pxe/server';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2Block } from '@aztec/stdlib/block';
import type { ContractInstancePreimageWithAddress } from '@aztec/stdlib/contract';
import { computePublicDataTreeLeafSlot, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import {
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  PublicDataTreeLeaf,
  PublicDataTreeLeafPreimage,
} from '@aztec/stdlib/trees';
import { GlobalVariables, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { insertTxEffectIntoWorldTrees, makeTXEBlock } from '../utils/block_creation.js';
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
    private contractStore: ContractStore,
  ) {
    this.logger = createLogger('txe:public_context');

    this.logger.debug('Entering Public Context', {
      contractAddress,
      blockNumber: globalVariables.blockNumber,
      timestamp: globalVariables.timestamp,
    });
  }

  address(): Promise<AztecAddress> {
    return Promise.resolve(this.contractAddress);
  }

  sender(): Promise<AztecAddress> {
    return Promise.resolve(AztecAddress.ZERO); // todo: change?
  }

  blockNumber(): Promise<BlockNumber> {
    return Promise.resolve(this.globalVariables.blockNumber);
  }

  timestamp(): Promise<bigint> {
    return Promise.resolve(this.globalVariables.timestamp);
  }

  isStaticCall(): Promise<boolean> {
    return Promise.resolve(false);
  }

  chainId(): Promise<Fr> {
    return Promise.resolve(this.globalVariables.chainId);
  }

  version(): Promise<Fr> {
    return Promise.resolve(this.globalVariables.version);
  }

  async emitNullifier(nullifier: Fr) {
    const siloedNullifier = await siloNullifier(this.contractAddress, nullifier);
    this.transientSiloedNullifiers.push(siloedNullifier);
  }

  async emitNoteHash(noteHash: Fr) {
    const siloedNoteHash = await siloNoteHash(this.contractAddress, noteHash);
    // TODO: make the note hash unique - they are only siloed right now
    this.transientUniqueNoteHashes.push(siloedNoteHash);
  }

  async nullifierExists(siloedNullifier: Fr): Promise<boolean> {
    const treeIndex = (
      await this.forkedWorldTrees.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [siloedNullifier.toBuffer()])
    )[0];
    const transientIndex = this.transientSiloedNullifiers.find(n => n.equals(siloedNullifier));

    return treeIndex !== undefined || transientIndex !== undefined;
  }

  async storageWrite(slot: Fr, value: Fr) {
    this.logger.debug('AVM storage write', { slot, value });

    const dataWrite = new PublicDataWrite(await computePublicDataTreeLeafSlot(this.contractAddress, slot), value);

    this.publicDataWrites.push(dataWrite);

    await this.forkedWorldTrees.sequentialInsert(MerkleTreeId.PUBLIC_DATA_TREE, [
      new PublicDataTreeLeaf(dataWrite.leafSlot, dataWrite.value).toBuffer(),
    ]);
  }

  async storageRead(slot: Fr, contractAddress: AztecAddress): Promise<Fr> {
    const leafSlot = await computePublicDataTreeLeafSlot(contractAddress, slot);

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

    this.logger.debug('AVM storage read', { slot, contractAddress, value });

    return value;
  }

  getContractInstanceDeployer(address: AztecAddress): Promise<{ member: Fr; exists: boolean }> {
    return this.getContractInstanceMember(address, i => i.deployer.toField());
  }

  getContractInstanceClassId(address: AztecAddress): Promise<{ member: Fr; exists: boolean }> {
    // TXE has no contract updates, so the current class always equals the original.
    return this.getContractInstanceMember(address, i => i.originalContractClassId);
  }

  getContractInstanceInitializationHash(address: AztecAddress): Promise<{ member: Fr; exists: boolean }> {
    return this.getContractInstanceMember(address, i => i.initializationHash);
  }

  getContractInstanceImmutablesHash(address: AztecAddress): Promise<{ member: Fr; exists: boolean }> {
    return this.getContractInstanceMember(address, i => i.immutablesHash);
  }

  private async getContractInstanceMember(
    address: AztecAddress,
    accessor: (instance: ContractInstancePreimageWithAddress) => Fr,
  ): Promise<{ member: Fr; exists: boolean }> {
    const instance = await this.contractStore.getContractInstance(address);
    if (!instance) {
      return { member: Fr.ZERO, exists: false };
    }
    return { member: accessor(instance), exists: true };
  }

  returndataSize(): Promise<Fr> {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  returndataCopy(_rdOffset: number, _copySize: number): Promise<Fr[]> {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  call(_l2Gas: number, _daGas: number, _address: AztecAddress, _argsLength: number, _args: Fr[]): Promise<void> {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  staticCall(_l2Gas: number, _daGas: number, _address: AztecAddress, _argsLength: number, _args: Fr[]): Promise<void> {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  successCopy(): Promise<boolean> {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::public_context`, use `public_call` instead',
    );
  }

  async close(): Promise<L2Block> {
    this.logger.debug('Exiting Public Context, building block with collected side effects', {
      blockNumber: this.globalVariables.blockNumber,
    });

    const txEffect = this.makeTxEffect();
    await insertTxEffectIntoWorldTrees(txEffect, this.forkedWorldTrees);

    const block = await makeTXEBlock(this.forkedWorldTrees, this.globalVariables, [txEffect]);

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
