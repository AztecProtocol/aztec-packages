import { Aes128 } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import { PXEOracleInterface } from '@aztec/pxe/server';
import { ExecutionNoteCache, HashedValuesCache, type NoteData, UtilityContext, pickNotes } from '@aztec/pxe/simulator';
import type { NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block } from '@aztec/stdlib/block';
import type { ContractInstance } from '@aztec/stdlib/contract';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { IndexedTaggingSecret } from '@aztec/stdlib/logs';
import { Note, type NoteStatus } from '@aztec/stdlib/note';
import { makeAppendOnlyTreeSnapshot } from '@aztec/stdlib/testing';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { insertTxEffectIntoWorldTrees, makeTXEBlockHeader } from '../utils/block_creation.js';
import { TXETypedOracle } from './txe_typed_oracle.js';

export class TXE extends TXETypedOracle {
  private logger: Logger;

  private executionCache = new HashedValuesCache();
  private senderForTags?: AztecAddress;

  public noteCache: ExecutionNoteCache;

  private constructor(
    private contractAddress: AztecAddress,
    private pxeOracleInterface: PXEOracleInterface,
    private forkedWorldTrees: MerkleTreeWriteOperations,
    private anchorBlockGlobalVariables: GlobalVariables,
    private nextBlockGlobalVariables: GlobalVariables,
    private txRequestHash: Fr,
  ) {
    super('TXEOraclePrivateUtilityContext');

    this.logger = createLogger('txe:oracle');
    this.logger.debug('Entering Private/Utility context');

    this.noteCache = new ExecutionNoteCache(txRequestHash);
  }

  static async create(
    contractAddress: AztecAddress,
    pxeOracleInterface: PXEOracleInterface,
    forkedWorldTrees: MerkleTreeWriteOperations,
    anchorBlockGlobalVariables: GlobalVariables,
    nextBlockGlobalVariables: GlobalVariables,
    txRequestHash: Fr,
  ) {
    // There is no automatic message discovery and contract-driven syncing process in inlined private or utility
    // contexts, which means that known nullifiers are also not searched for, since it is during the tagging sync that
    // we perform this. We therefore search for known nullifiers now, as otherwise notes that were nullified would not
    // be removed from the database.
    await pxeOracleInterface.removeNullifiedNotes(contractAddress);

    return new TXE(
      contractAddress,
      pxeOracleInterface,
      forkedWorldTrees,
      anchorBlockGlobalVariables,
      nextBlockGlobalVariables,
      txRequestHash,
    );
  }

  // Utils

  async checkNullifiersNotInTree(contractAddress: AztecAddress, nullifiers: Fr[]) {
    const siloedNullifiers = await Promise.all(nullifiers.map(nullifier => siloNullifier(contractAddress, nullifier)));
    const db = this.forkedWorldTrees;
    const nullifierIndexesInTree = await db.findLeafIndices(
      MerkleTreeId.NULLIFIER_TREE,
      siloedNullifiers.map(n => n.toBuffer()),
    );
    if (nullifierIndexesInTree.some(index => index !== undefined)) {
      throw new Error(`Rejecting tx for emitting duplicate nullifiers`);
    }
  }

  // TypedOracle

  override utilityGetRandomField() {
    return Fr.random();
  }

  override utilityGetUtilityContext() {
    return Promise.resolve(
      UtilityContext.from({
        blockNumber: this.anchorBlockGlobalVariables.blockNumber,
        timestamp: this.anchorBlockGlobalVariables.timestamp,
        contractAddress: this.contractAddress,
        version: this.anchorBlockGlobalVariables.version,
        chainId: this.anchorBlockGlobalVariables.chainId,
      }),
    );
  }

  override privateStoreInExecutionCache(values: Fr[], hash: Fr) {
    return this.executionCache.store(values, hash);
  }

  override privateLoadFromExecutionCache(hash: Fr) {
    const preimage = this.executionCache.getPreimage(hash);
    if (!preimage) {
      throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
    }
    return Promise.resolve(preimage);
  }

  override utilityGetKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.pxeOracleInterface.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  override utilityGetContractInstance(address: AztecAddress): Promise<ContractInstance> {
    return this.pxeOracleInterface.getContractInstance(address);
  }

  override utilityGetMembershipWitness(
    blockNumber: number,
    treeId: MerkleTreeId,
    leafValue: Fr,
  ): Promise<Fr[] | undefined> {
    return this.pxeOracleInterface.getMembershipWitness(blockNumber, treeId, leafValue);
  }

  override utilityGetNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.pxeOracleInterface.getNullifierMembershipWitness(blockNumber, nullifier);
  }

  override utilityGetPublicDataWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return this.pxeOracleInterface.getPublicDataWitness(blockNumber, leafSlot);
  }

  override utilityGetLowNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.pxeOracleInterface.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  override async utilityGetBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
    return (await this.pxeOracleInterface.getBlock(blockNumber))?.header.toBlockHeader();
  }

  override utilityGetPublicKeysAndPartialAddress(account: AztecAddress) {
    return this.pxeOracleInterface.getCompleteAddress(account);
  }

  override async utilityGetNotes(
    storageSlot: Fr,
    numSelects: number,
    selectByIndexes: number[],
    selectByOffsets: number[],
    selectByLengths: number[],
    selectValues: Fr[],
    selectComparators: number[],
    sortByIndexes: number[],
    sortByOffsets: number[],
    sortByLengths: number[],
    sortOrder: number[],
    limit: number,
    offset: number,
    status: NoteStatus,
  ) {
    // Nullified pending notes are already removed from the list.
    const pendingNotes = this.noteCache.getNotes(this.contractAddress, storageSlot);

    const pendingNullifiers = this.noteCache.getNullifiers(this.contractAddress);
    const dbNotes = await this.pxeOracleInterface.getNotes(this.contractAddress, storageSlot, status);
    const dbNotesFiltered = dbNotes.filter(n => !pendingNullifiers.has((n.siloedNullifier as Fr).value));

    const notes = pickNotes<NoteData>([...dbNotesFiltered, ...pendingNotes], {
      selects: selectByIndexes.slice(0, numSelects).map((index, i) => ({
        selector: { index, offset: selectByOffsets[i], length: selectByLengths[i] },
        value: selectValues[i],
        comparator: selectComparators[i],
      })),
      sorts: sortByIndexes.map((index, i) => ({
        selector: { index, offset: sortByOffsets[i], length: sortByLengths[i] },
        order: sortOrder[i],
      })),
      limit,
      offset,
    });

    this.logger.debug(
      `Returning ${notes.length} notes for ${this.contractAddress} at ${storageSlot}: ${notes
        .map(n => `${n.noteNonce.toString()}:[${n.note.items.map(i => i.toString()).join(',')}]`)
        .join(', ')}`,
    );

    if (notes.length > 0) {
      const noteLength = notes[0].note.items.length;
      if (!notes.every(({ note }) => noteLength === note.items.length)) {
        throw new Error('Notes should all be the same length.');
      }
    }

    return notes;
  }

  override privateNotifyCreatedNote(
    storageSlot: Fr,
    _noteTypeId: NoteSelector,
    noteItems: Fr[],
    noteHash: Fr,
    counter: number,
  ) {
    const note = new Note(noteItems);
    this.noteCache.addNewNote(
      {
        contractAddress: this.contractAddress,
        storageSlot,
        noteNonce: Fr.ZERO, // Nonce cannot be known during private execution.
        note,
        siloedNullifier: undefined, // Siloed nullifier cannot be known for newly created note.
        noteHash,
      },
      counter,
    );
  }

  override async privateNotifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, _counter: number) {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifyNote(this.contractAddress, innerNullifier, noteHash);
  }

  override async privateNotifyCreatedNullifier(innerNullifier: Fr): Promise<void> {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifierCreated(this.contractAddress, innerNullifier);
  }

  override async utilityCheckNullifierExists(innerNullifier: Fr): Promise<boolean> {
    const nullifier = await siloNullifier(this.contractAddress, innerNullifier!);
    const index = await this.pxeOracleInterface.getNullifierIndex(nullifier);
    return index !== undefined;
  }

  override async utilityStorageRead(
    contractAddress: AztecAddress,
    startStorageSlot: Fr,
    blockNumber: number,
    numberOfElements: number,
  ): Promise<Fr[]> {
    const values = [];
    for (let i = 0n; i < numberOfElements; i++) {
      const storageSlot = startStorageSlot.add(new Fr(i));
      const value = await this.pxeOracleInterface.getPublicStorageAt(blockNumber, contractAddress, storageSlot);
      values.push(value);
    }
    return values;
  }

  override utilityDebugLog(message: string, fields: Fr[]): void {
    this.logger.verbose(`${applyStringFormatting(message, fields)}`, { module: `${this.logger.module}:debug_log` });
  }

  override async privateIncrementAppTaggingSecretIndexAsSender(
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<void> {
    await this.pxeOracleInterface.incrementAppTaggingSecretIndexAsSender(this.contractAddress, sender, recipient);
  }

  override async utilityGetIndexedTaggingSecretAsSender(
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret> {
    return await this.pxeOracleInterface.getIndexedTaggingSecretAsSender(this.contractAddress, sender, recipient);
  }

  override async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    await this.pxeOracleInterface.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot);

    await this.pxeOracleInterface.removeNullifiedNotes(this.contractAddress);

    return Promise.resolve();
  }

  public override async utilityValidateEnqueuedNotesAndEvents(
    contractAddress: AztecAddress,
    noteValidationRequestsArrayBaseSlot: Fr,
    eventValidationRequestsArrayBaseSlot: Fr,
  ): Promise<void> {
    await this.pxeOracleInterface.validateEnqueuedNotesAndEvents(
      contractAddress,
      noteValidationRequestsArrayBaseSlot,
      eventValidationRequestsArrayBaseSlot,
    );
  }

  override async utilityBulkRetrieveLogs(
    contractAddress: AztecAddress,
    logRetrievalRequestsArrayBaseSlot: Fr,
    logRetrievalResponsesArrayBaseSlot: Fr,
  ): Promise<void> {
    return await this.pxeOracleInterface.bulkRetrieveLogs(
      contractAddress,
      logRetrievalRequestsArrayBaseSlot,
      logRetrievalResponsesArrayBaseSlot,
    );
  }

  override utilityStoreCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.storeCapsule(this.contractAddress, slot, capsule);
  }

  override utilityLoadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.loadCapsule(this.contractAddress, slot);
  }

  override utilityDeleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.deleteCapsule(this.contractAddress, slot);
  }

  override utilityCopyCapsule(
    contractAddress: AztecAddress,
    srcSlot: Fr,
    dstSlot: Fr,
    numEntries: number,
  ): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries);
  }

  override utilityAes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  override utilityGetSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    return this.pxeOracleInterface.getSharedSecret(address, ephPk);
  }

  override privateGetSenderForTags(): Promise<AztecAddress | undefined> {
    return Promise.resolve(this.senderForTags);
  }

  override privateSetSenderForTags(senderForTags: AztecAddress): Promise<void> {
    this.senderForTags = senderForTags;
    return Promise.resolve();
  }

  async close(): Promise<L2Block> {
    this.logger.debug('Exiting Private Context, building block with collected side effects', {
      blockNumber: this.nextBlockGlobalVariables.blockNumber,
    });

    const txEffect = await this.makeTxEffect();

    await insertTxEffectIntoWorldTrees(txEffect, this.forkedWorldTrees);

    const block = new L2Block(
      makeAppendOnlyTreeSnapshot(),
      await makeTXEBlockHeader(this.forkedWorldTrees, this.nextBlockGlobalVariables),
      new Body([txEffect]),
    );

    await this.forkedWorldTrees.close();

    this.logger.debug('Exited PublicContext with built block', {
      blockNumber: block.number,
      txEffects: block.body.txEffects,
    });

    return block;
  }

  private async makeTxEffect(): Promise<TxEffect> {
    const txEffect = TxEffect.empty();

    const { usedTxRequestHashForNonces } = this.noteCache.finish();
    const nonceGenerator = usedTxRequestHashForNonces ? this.txRequestHash : this.noteCache.getAllNullifiers()[0];

    txEffect.noteHashes = await Promise.all(
      this.noteCache
        .getAllNotes()
        .map(async (pendingNote, i) =>
          computeUniqueNoteHash(
            await computeNoteHashNonce(nonceGenerator, i),
            await siloNoteHash(pendingNote.note.contractAddress, pendingNote.noteHashForConsumption),
          ),
        ),
    );

    // Nullifiers are already siloed
    txEffect.nullifiers = this.noteCache.getAllNullifiers();

    if (usedTxRequestHashForNonces) {
      txEffect.nullifiers.unshift(this.txRequestHash);
    }

    txEffect.txHash = new TxHash(new Fr(this.nextBlockGlobalVariables.blockNumber));

    return txEffect;
  }
}
