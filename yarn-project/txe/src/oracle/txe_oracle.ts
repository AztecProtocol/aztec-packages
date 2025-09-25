import { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import { Aes128 } from '@aztec/foundation/crypto';
import { Fr, Point } from '@aztec/foundation/fields';
import { type Logger, applyStringFormatting, createLogger } from '@aztec/foundation/log';
import { PXEOracleInterface } from '@aztec/pxe/server';
import {
  ExecutionNoteCache,
  HashedValuesCache,
  type IPrivateExecutionOracle,
  type IUtilityExecutionOracle,
  MessageLoadOracleInputs,
  type NoteData,
  UtilityContext,
  pickNotes,
} from '@aztec/pxe/simulator';
import type { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Body, L2Block } from '@aztec/stdlib/block';
import type { ContractInstance } from '@aztec/stdlib/contract';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import type { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { ContractClassLog, IndexedTaggingSecret } from '@aztec/stdlib/logs';
import { Note, type NoteStatus } from '@aztec/stdlib/note';
import { makeAppendOnlyTreeSnapshot } from '@aztec/stdlib/testing';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { insertTxEffectIntoWorldTrees, makeTXEBlockHeader } from '../utils/block_creation.js';

export class TXE implements IUtilityExecutionOracle, IPrivateExecutionOracle {
  isMisc = true as const;
  isUtility = true as const;
  isPrivate = true as const;

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

  utilityGetRandomField() {
    return Fr.random();
  }

  utilityGetUtilityContext() {
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

  privateStoreInExecutionCache(values: Fr[], hash: Fr) {
    return this.executionCache.store(values, hash);
  }

  privateLoadFromExecutionCache(hash: Fr) {
    const preimage = this.executionCache.getPreimage(hash);
    if (!preimage) {
      throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
    }
    return Promise.resolve(preimage);
  }

  utilityGetKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
    return this.pxeOracleInterface.getKeyValidationRequest(pkMHash, this.contractAddress);
  }

  utilityGetContractInstance(address: AztecAddress): Promise<ContractInstance> {
    return this.pxeOracleInterface.getContractInstance(address);
  }

  utilityGetMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[] | undefined> {
    return this.pxeOracleInterface.getMembershipWitness(blockNumber, treeId, leafValue);
  }

  utilityGetNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.pxeOracleInterface.getNullifierMembershipWitness(blockNumber, nullifier);
  }

  utilityGetPublicDataWitness(blockNumber: number, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    return this.pxeOracleInterface.getPublicDataWitness(blockNumber, leafSlot);
  }

  utilityGetLowNullifierMembershipWitness(
    blockNumber: number,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    return this.pxeOracleInterface.getLowNullifierMembershipWitness(blockNumber, nullifier);
  }

  async utilityGetBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
    return (await this.pxeOracleInterface.getBlock(blockNumber))?.header.toBlockHeader();
  }

  utilityGetPublicKeysAndPartialAddress(account: AztecAddress) {
    return this.pxeOracleInterface.getCompleteAddress(account);
  }

  async utilityGetNotes(
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

  privateNotifyCreatedNote(storageSlot: Fr, _noteTypeId: NoteSelector, noteItems: Fr[], noteHash: Fr, counter: number) {
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

  async privateNotifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, _counter: number) {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifyNote(this.contractAddress, innerNullifier, noteHash);
  }

  async privateNotifyCreatedNullifier(innerNullifier: Fr): Promise<void> {
    await this.checkNullifiersNotInTree(this.contractAddress, [innerNullifier]);
    await this.noteCache.nullifierCreated(this.contractAddress, innerNullifier);
  }

  async utilityCheckNullifierExists(innerNullifier: Fr): Promise<boolean> {
    const nullifier = await siloNullifier(this.contractAddress, innerNullifier!);
    const index = await this.pxeOracleInterface.getNullifierIndex(nullifier);
    return index !== undefined;
  }

  async utilityStorageRead(
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

  utilityDebugLog(message: string, fields: Fr[]): void {
    this.logger.verbose(`${applyStringFormatting(message, fields)}`, { module: `${this.logger.module}:debug_log` });
  }

  async privateIncrementAppTaggingSecretIndexAsSender(sender: AztecAddress, recipient: AztecAddress): Promise<void> {
    await this.pxeOracleInterface.incrementAppTaggingSecretIndexAsSender(this.contractAddress, sender, recipient);
  }

  async utilityGetIndexedTaggingSecretAsSender(
    sender: AztecAddress,
    recipient: AztecAddress,
  ): Promise<IndexedTaggingSecret> {
    return await this.pxeOracleInterface.getIndexedTaggingSecretAsSender(this.contractAddress, sender, recipient);
  }

  async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
    await this.pxeOracleInterface.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot);

    await this.pxeOracleInterface.removeNullifiedNotes(this.contractAddress);

    return Promise.resolve();
  }

  public async utilityValidateEnqueuedNotesAndEvents(
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

  async utilityBulkRetrieveLogs(
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

  utilityStoreCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.storeCapsule(this.contractAddress, slot, capsule);
  }

  utilityLoadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.loadCapsule(this.contractAddress, slot);
  }

  utilityDeleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.deleteCapsule(this.contractAddress, slot);
  }

  utilityCopyCapsule(contractAddress: AztecAddress, srcSlot: Fr, dstSlot: Fr, numEntries: number): Promise<void> {
    if (!contractAddress.equals(this.contractAddress)) {
      // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
      throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
    }
    return this.pxeOracleInterface.copyCapsule(this.contractAddress, srcSlot, dstSlot, numEntries);
  }

  utilityAes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
    const aes128 = new Aes128();
    return aes128.decryptBufferCBC(ciphertext, iv, symKey);
  }

  utilityGetSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
    return this.pxeOracleInterface.getSharedSecret(address, ephPk);
  }

  privateGetSenderForTags(): Promise<AztecAddress | undefined> {
    return Promise.resolve(this.senderForTags);
  }

  privateSetSenderForTags(senderForTags: AztecAddress): Promise<void> {
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

  // TODO: this class will soon be replaced with the real UtilityExecutionOracle and PrivateExecutionOracle classes. The
  // functions below are not currently used in Noir tests, and in most cases they're caught beforehand by the RPC
  // translator - we just have a temporary empty implementation until we finalize the migration.

  utilityAssertCompatibleOracleVersion(_version: number): void {
    throw new Error('Method not implemented.');
  }
  utilityGetAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
    throw new Error('Method not implemented.');
  }
  utilityGetL1ToL2MembershipWitness(
    _contractAddress: AztecAddress,
    _messageHash: Fr,
    _secret: Fr,
  ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    throw new Error('Method not implemented.');
  }
  utilityEmitOffchainEffect(_data: Fr[]): Promise<void> {
    throw new Error('Method not implemented.');
  }
  privateNotifyCreatedContractClassLog(_log: ContractClassLog, _counter: number): void {
    throw new Error('Method not implemented.');
  }
  privateCallPrivateFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }> {
    throw new Error('Method not implemented.');
  }
  privateNotifyEnqueuedPublicFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }
  privateNotifySetPublicTeardownFunctionCall(
    _targetContractAddress: AztecAddress,
    _calldataHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<void> {
    throw new Error('Method not implemented.');
  }
  privateNotifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: number): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
