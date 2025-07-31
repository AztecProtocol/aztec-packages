diff --git a/yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts b/yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts
index 56f8d2b470..04e6465104 100644
--- a/yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts
+++ b/yarn-project/pxe/src/contract_function_simulator/contract_function_simulator.ts
@@ -167,7 +167,7 @@ export class ContractFunctionSimulator {
       );
       const publicFunctionsCalldata = await Promise.all(
         publicCallRequests.map(async r => {
-          const calldata = await privateExecutionOracle.loadFromExecutionCache(r.calldataHash);
+          const calldata = await privateExecutionOracle.pxeLoadFromExecutionCache(r.calldataHash);
           return new HashedValues(calldata, r.calldataHash);
         }),
       );
diff --git a/yarn-project/pxe/src/contract_function_simulator/oracle/oracle.ts b/yarn-project/pxe/src/contract_function_simulator/oracle/oracle.ts
index 15016df38c..a456046374 100644
--- a/yarn-project/pxe/src/contract_function_simulator/oracle/oracle.ts
+++ b/yarn-project/pxe/src/contract_function_simulator/oracle/oracle.ts
@@ -36,50 +36,50 @@ export class Oracle {
       }, {} as ACIRCallback);
   }
 
-  getRandomField(): Promise<ACVMField[]> {
-    const val = this.typedOracle.getRandomField();
+  utilityGetRandomField(): Promise<ACVMField[]> {
+    const val = this.typedOracle.utilityGetRandomField();
     return Promise.resolve([toACVMField(val)]);
   }
 
   // Since the argument is a slice, noir automatically adds a length field to oracle call.
-  storeInExecutionCache(_length: ACVMField[], values: ACVMField[], [hash]: ACVMField[]): Promise<ACVMField[]> {
-    this.typedOracle.storeInExecutionCache(values.map(Fr.fromString), Fr.fromString(hash));
+  pxeStoreInExecutionCache(_length: ACVMField[], values: ACVMField[], [hash]: ACVMField[]): Promise<ACVMField[]> {
+    this.typedOracle.pxeStoreInExecutionCache(values.map(Fr.fromString), Fr.fromString(hash));
     return Promise.resolve([]);
   }
 
-  async loadFromExecutionCache([returnsHash]: ACVMField[]): Promise<ACVMField[][]> {
-    const values = await this.typedOracle.loadFromExecutionCache(Fr.fromString(returnsHash));
+  async pxeLoadFromExecutionCache([returnsHash]: ACVMField[]): Promise<ACVMField[][]> {
+    const values = await this.typedOracle.pxeLoadFromExecutionCache(Fr.fromString(returnsHash));
     return [values.map(toACVMField)];
   }
 
-  async getBlockNumber(): Promise<ACVMField[]> {
-    return [toACVMField(await this.typedOracle.getBlockNumber())];
+  async utilityGetBlockNumber(): Promise<ACVMField[]> {
+    return [toACVMField(await this.typedOracle.utilityGetBlockNumber())];
   }
 
-  async getTimestamp(): Promise<ACVMField[]> {
-    return [toACVMField(await this.typedOracle.getTimestamp())];
+  async utilityGetTimestamp(): Promise<ACVMField[]> {
+    return [toACVMField(await this.typedOracle.utilityGetTimestamp())];
   }
 
-  async getContractAddress(): Promise<ACVMField[]> {
-    return [toACVMField(await this.typedOracle.getContractAddress())];
+  async utilityGetContractAddress(): Promise<ACVMField[]> {
+    return [toACVMField(await this.typedOracle.utilityGetContractAddress())];
   }
 
-  async getVersion(): Promise<ACVMField[]> {
-    return [toACVMField(await this.typedOracle.getVersion())];
+  async utilityGetVersion(): Promise<ACVMField[]> {
+    return [toACVMField(await this.typedOracle.utilityGetVersion())];
   }
 
-  async getChainId(): Promise<ACVMField[]> {
-    return [toACVMField(await this.typedOracle.getChainId())];
+  async utilityGetChainId(): Promise<ACVMField[]> {
+    return [toACVMField(await this.typedOracle.utilityGetChainId())];
   }
 
-  async getKeyValidationRequest([pkMHash]: ACVMField[]): Promise<ACVMField[]> {
-    const keyValidationRequest = await this.typedOracle.getKeyValidationRequest(Fr.fromString(pkMHash));
+  async utilityGetKeyValidationRequest([pkMHash]: ACVMField[]): Promise<ACVMField[]> {
+    const keyValidationRequest = await this.typedOracle.utilityGetKeyValidationRequest(Fr.fromString(pkMHash));
 
     return keyValidationRequest.toFields().map(toACVMField);
   }
 
-  async getContractInstance([address]: ACVMField[]): Promise<ACVMField[]> {
-    const instance = await this.typedOracle.getContractInstance(AztecAddress.fromField(Fr.fromString(address)));
+  async utilityGetContractInstance([address]: ACVMField[]): Promise<ACVMField[]> {
+    const instance = await this.typedOracle.utilityGetContractInstance(AztecAddress.fromField(Fr.fromString(address)));
 
     return [
       instance.salt,
@@ -90,7 +90,7 @@ export class Oracle {
     ].map(toACVMField);
   }
 
-  async getMembershipWitness(
+  async utilityGetMembershipWitness(
     [blockNumber]: ACVMField[],
     [treeId]: ACVMField[],
     [leafValue]: ACVMField[],
@@ -99,7 +99,11 @@ export class Oracle {
     const parsedTreeId = Fr.fromString(treeId).toNumber();
     const parsedLeafValue = Fr.fromString(leafValue);
 
-    const witness = await this.typedOracle.getMembershipWitness(parsedBlockNumber, parsedTreeId, parsedLeafValue);
+    const witness = await this.typedOracle.utilityGetMembershipWitness(
+      parsedBlockNumber,
+      parsedTreeId,
+      parsedLeafValue,
+    );
     if (!witness) {
       throw new Error(
         `Leaf ${leafValue} not found in the tree ${MerkleTreeId[parsedTreeId]} at block ${parsedBlockNumber}.`,
@@ -108,28 +112,28 @@ export class Oracle {
     return [toACVMField(witness[0]), witness.slice(1).map(toACVMField)];
   }
 
-  async getNullifierMembershipWitness(
+  async utilityGetNullifierMembershipWitness(
     [blockNumber]: ACVMField[],
     [nullifier]: ACVMField[], // nullifier, we try to find the witness for (to prove inclusion)
   ): Promise<(ACVMField | ACVMField[])[]> {
     const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
     const parsedNullifier = Fr.fromString(nullifier);
 
-    const witness = await this.typedOracle.getNullifierMembershipWitness(parsedBlockNumber, parsedNullifier);
+    const witness = await this.typedOracle.utilityGetNullifierMembershipWitness(parsedBlockNumber, parsedNullifier);
     if (!witness) {
       throw new Error(`Nullifier witness not found for nullifier ${parsedNullifier} at block ${parsedBlockNumber}.`);
     }
     return witness.toNoirRepresentation();
   }
 
-  async getLowNullifierMembershipWitness(
+  async utilityGetLowNullifierMembershipWitness(
     [blockNumber]: ACVMField[],
     [nullifier]: ACVMField[], // nullifier, we try to find the low nullifier witness for (to prove non-inclusion)
   ): Promise<(ACVMField | ACVMField[])[]> {
     const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
     const parsedNullifier = Fr.fromString(nullifier);
 
-    const witness = await this.typedOracle.getLowNullifierMembershipWitness(parsedBlockNumber, parsedNullifier);
+    const witness = await this.typedOracle.utilityGetLowNullifierMembershipWitness(parsedBlockNumber, parsedNullifier);
     if (!witness) {
       throw new Error(
         `Low nullifier witness not found for nullifier ${parsedNullifier} at block ${parsedBlockNumber}.`,
@@ -138,47 +142,47 @@ export class Oracle {
     return witness.toNoirRepresentation();
   }
 
-  async getPublicDataWitness(
+  async utilityGetPublicDataWitness(
     [blockNumber]: ACVMField[],
     [leafSlot]: ACVMField[],
   ): Promise<(ACVMField | ACVMField[])[]> {
     const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
     const parsedLeafSlot = Fr.fromString(leafSlot);
 
-    const witness = await this.typedOracle.getPublicDataWitness(parsedBlockNumber, parsedLeafSlot);
+    const witness = await this.typedOracle.utilityGetPublicDataWitness(parsedBlockNumber, parsedLeafSlot);
     if (!witness) {
       throw new Error(`Public data witness not found for slot ${parsedLeafSlot} at block ${parsedBlockNumber}.`);
     }
     return witness.toNoirRepresentation();
   }
 
-  async getBlockHeader([blockNumber]: ACVMField[]): Promise<ACVMField[]> {
+  async utilityGetBlockHeader([blockNumber]: ACVMField[]): Promise<ACVMField[]> {
     const parsedBlockNumber = Fr.fromString(blockNumber).toNumber();
 
-    const header = await this.typedOracle.getBlockHeader(parsedBlockNumber);
+    const header = await this.typedOracle.utilityGetBlockHeader(parsedBlockNumber);
     if (!header) {
       throw new Error(`Block header not found for block ${parsedBlockNumber}.`);
     }
     return header.toFields().map(toACVMField);
   }
 
-  async getAuthWitness([messageHash]: ACVMField[]): Promise<ACVMField[][]> {
+  async utilityGetAuthWitness([messageHash]: ACVMField[]): Promise<ACVMField[][]> {
     const messageHashField = Fr.fromString(messageHash);
-    const witness = await this.typedOracle.getAuthWitness(messageHashField);
+    const witness = await this.typedOracle.utilityGetAuthWitness(messageHashField);
     if (!witness) {
       throw new Error(`Unknown auth witness for message hash ${messageHashField}`);
     }
     return [witness.map(toACVMField)];
   }
 
-  async getPublicKeysAndPartialAddress([address]: ACVMField[]): Promise<ACVMField[][]> {
+  async utilityGetCompleteAddress([address]: ACVMField[]): Promise<ACVMField[][]> {
     const parsedAddress = AztecAddress.fromField(Fr.fromString(address));
-    const { publicKeys, partialAddress } = await this.typedOracle.getCompleteAddress(parsedAddress);
+    const { publicKeys, partialAddress } = await this.typedOracle.utilityGetCompleteAddress(parsedAddress);
 
     return [[...publicKeys.toFields(), partialAddress].map(toACVMField)];
   }
 
-  async getNotes(
+  async utilityGetNotes(
     [storageSlot]: ACVMField[],
     [numSelects]: ACVMField[],
     selectByIndexes: ACVMField[],
@@ -196,7 +200,7 @@ export class Oracle {
     [maxNotes]: ACVMField[],
     [packedRetrievedNoteLength]: ACVMField[],
   ): Promise<(ACVMField | ACVMField[])[]> {
-    const noteDatas = await this.typedOracle.getNotes(
+    const noteDatas = await this.typedOracle.utilityGetNotes(
       Fr.fromString(storageSlot),
       +numSelects,
       selectByIndexes.map(s => +s),
@@ -239,14 +243,14 @@ export class Oracle {
     return arrayOfArraysToBoundedVecOfArrays(returnDataAsArrayOfACVMFieldArrays, +maxNotes, +packedRetrievedNoteLength);
   }
 
-  notifyCreatedNote(
+  pxeNotifyCreatedNote(
     [storageSlot]: ACVMField[],
     [noteTypeId]: ACVMField[],
     note: ACVMField[],
     [noteHash]: ACVMField[],
     [counter]: ACVMField[],
   ): Promise<ACVMField[]> {
-    this.typedOracle.notifyCreatedNote(
+    this.typedOracle.pxeNotifyCreatedNote(
       Fr.fromString(storageSlot),
       NoteSelector.fromField(Fr.fromString(noteTypeId)),
       note.map(Fr.fromString),
@@ -256,31 +260,31 @@ export class Oracle {
     return Promise.resolve([]);
   }
 
-  async notifyNullifiedNote(
+  async pxeNotifyNullifiedNote(
     [innerNullifier]: ACVMField[],
     [noteHash]: ACVMField[],
     [counter]: ACVMField[],
   ): Promise<ACVMField[]> {
-    await this.typedOracle.notifyNullifiedNote(Fr.fromString(innerNullifier), Fr.fromString(noteHash), +counter);
+    await this.typedOracle.pxeNotifyNullifiedNote(Fr.fromString(innerNullifier), Fr.fromString(noteHash), +counter);
     return [];
   }
 
-  async notifyCreatedNullifier([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
-    await this.typedOracle.notifyCreatedNullifier(Fr.fromString(innerNullifier));
+  async pxeNotifyCreatedNullifier([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
+    await this.typedOracle.pxeNotifyCreatedNullifier(Fr.fromString(innerNullifier));
     return [];
   }
 
-  async checkNullifierExists([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
-    const exists = await this.typedOracle.checkNullifierExists(Fr.fromString(innerNullifier));
+  async utilityCheckNullifierExists([innerNullifier]: ACVMField[]): Promise<ACVMField[]> {
+    const exists = await this.typedOracle.utilityCheckNullifierExists(Fr.fromString(innerNullifier));
     return [toACVMField(exists)];
   }
 
-  async getL1ToL2MembershipWitness(
+  async utilityGetL1ToL2MembershipWitness(
     [contractAddress]: ACVMField[],
     [messageHash]: ACVMField[],
     [secret]: ACVMField[],
   ): Promise<(ACVMField | ACVMField[])[]> {
-    const message = await this.typedOracle.getL1ToL2MembershipWitness(
+    const message = await this.typedOracle.utilityGetL1ToL2MembershipWitness(
       AztecAddress.fromString(contractAddress),
       Fr.fromString(messageHash),
       Fr.fromString(secret),
@@ -288,13 +292,13 @@ export class Oracle {
     return message.toNoirRepresentation();
   }
 
-  async storageRead(
+  async utilityStorageRead(
     [contractAddress]: ACVMField[],
     [startStorageSlot]: ACVMField[],
     [blockNumber]: ACVMField[],
     [numberOfElements]: ACVMField[],
   ): Promise<ACVMField[][]> {
-    const values = await this.typedOracle.storageRead(
+    const values = await this.typedOracle.utilityStorageRead(
       new AztecAddress(Fr.fromString(contractAddress)),
       Fr.fromString(startStorageSlot),
       +blockNumber,
@@ -308,7 +312,7 @@ export class Oracle {
     return newValues.map(toACVMField);
   }
 
-  notifyCreatedContractClassLog(
+  pxeNotifyCreatedContractClassLog(
     [contractAddress]: ACVMField[],
     message: ACVMField[],
     [length]: ACVMField[],
@@ -317,25 +321,25 @@ export class Oracle {
     const logFields = new ContractClassLogFields(message.map(Fr.fromString));
     const log = new ContractClassLog(new AztecAddress(Fr.fromString(contractAddress)), logFields, +length);
 
-    this.typedOracle.notifyCreatedContractClassLog(log, +counter);
+    this.typedOracle.pxeNotifyCreatedContractClassLog(log, +counter);
     return Promise.resolve([]);
   }
 
-  debugLog(message: ACVMField[], _ignoredFieldsSize: ACVMField[], fields: ACVMField[]): Promise<ACVMField[]> {
+  utilityDebugLog(message: ACVMField[], _ignoredFieldsSize: ACVMField[], fields: ACVMField[]): Promise<ACVMField[]> {
     const messageStr = message.map(acvmField => String.fromCharCode(Fr.fromString(acvmField).toNumber())).join('');
     const fieldsFr = fields.map(Fr.fromString);
-    this.typedOracle.debugLog(messageStr, fieldsFr);
+    this.typedOracle.utilityDebugLog(messageStr, fieldsFr);
     return Promise.resolve([]);
   }
 
-  async callPrivateFunction(
+  async pxeCallPrivateFunction(
     [contractAddress]: ACVMField[],
     [functionSelector]: ACVMField[],
     [argsHash]: ACVMField[],
     [sideEffectCounter]: ACVMField[],
     [isStaticCall]: ACVMField[],
   ): Promise<ACVMField[][]> {
-    const { endSideEffectCounter, returnsHash } = await this.typedOracle.callPrivateFunction(
+    const { endSideEffectCounter, returnsHash } = await this.typedOracle.pxeCallPrivateFunction(
       AztecAddress.fromField(Fr.fromString(contractAddress)),
       FunctionSelector.fromField(Fr.fromString(functionSelector)),
       Fr.fromString(argsHash),
@@ -345,13 +349,13 @@ export class Oracle {
     return [[endSideEffectCounter, returnsHash].map(toACVMField)];
   }
 
-  async notifyEnqueuedPublicFunctionCall(
+  async pxeNotifyEnqueuedPublicFunctionCall(
     [contractAddress]: ACVMField[],
     [calldataHash]: ACVMField[],
     [sideEffectCounter]: ACVMField[],
     [isStaticCall]: ACVMField[],
   ): Promise<ACVMField[]> {
-    await this.typedOracle.notifyEnqueuedPublicFunctionCall(
+    await this.typedOracle.pxeNotifyEnqueuedPublicFunctionCall(
       AztecAddress.fromString(contractAddress),
       Fr.fromString(calldataHash),
       Fr.fromString(sideEffectCounter).toNumber(),
@@ -360,13 +364,13 @@ export class Oracle {
     return [];
   }
 
-  async notifySetPublicTeardownFunctionCall(
+  async pxeNotifySetPublicTeardownFunctionCall(
     [contractAddress]: ACVMField[],
     [calldataHash]: ACVMField[],
     [sideEffectCounter]: ACVMField[],
     [isStaticCall]: ACVMField[],
   ): Promise<ACVMField[]> {
-    await this.typedOracle.notifySetPublicTeardownFunctionCall(
+    await this.typedOracle.pxeNotifySetPublicTeardownFunctionCall(
       AztecAddress.fromString(contractAddress),
       Fr.fromString(calldataHash),
       Fr.fromString(sideEffectCounter).toNumber(),
@@ -375,40 +379,45 @@ export class Oracle {
     return [];
   }
 
-  async notifySetMinRevertibleSideEffectCounter([minRevertibleSideEffectCounter]: ACVMField[]): Promise<ACVMField[]> {
-    await this.typedOracle.notifySetMinRevertibleSideEffectCounter(
+  async pxeNotifySetMinRevertibleSideEffectCounter([minRevertibleSideEffectCounter]: ACVMField[]): Promise<
+    ACVMField[]
+  > {
+    await this.typedOracle.pxeNotifySetMinRevertibleSideEffectCounter(
       Fr.fromString(minRevertibleSideEffectCounter).toNumber(),
     );
     return Promise.resolve([]);
   }
 
-  async getIndexedTaggingSecretAsSender([sender]: ACVMField[], [recipient]: ACVMField[]): Promise<ACVMField[]> {
-    const taggingSecret = await this.typedOracle.getIndexedTaggingSecretAsSender(
+  async utilityGetIndexedTaggingSecretAsSender([sender]: ACVMField[], [recipient]: ACVMField[]): Promise<ACVMField[]> {
+    const taggingSecret = await this.typedOracle.utilityGetIndexedTaggingSecretAsSender(
       AztecAddress.fromString(sender),
       AztecAddress.fromString(recipient),
     );
     return taggingSecret.toFields().map(toACVMField);
   }
 
-  async incrementAppTaggingSecretIndexAsSender([sender]: ACVMField[], [recipient]: ACVMField[]): Promise<ACVMField[]> {
-    await this.typedOracle.incrementAppTaggingSecretIndexAsSender(
+  async pxeIncrementAppTaggingSecretIndexAsSender(
+    [sender]: ACVMField[],
+    [recipient]: ACVMField[],
+  ): Promise<ACVMField[]> {
+    await this.typedOracle.pxeIncrementAppTaggingSecretIndexAsSender(
       AztecAddress.fromString(sender),
       AztecAddress.fromString(recipient),
     );
     return [];
   }
 
-  async fetchTaggedLogs([pendingTaggedLogArrayBaseSlot]: ACVMField[]): Promise<ACVMField[]> {
-    await this.typedOracle.fetchTaggedLogs(Fr.fromString(pendingTaggedLogArrayBaseSlot));
+  async utilityFetchTaggedLogs([pendingTaggedLogArrayBaseSlot]: ACVMField[]): Promise<ACVMField[]> {
+    await this.typedOracle.utilityFetchTaggedLogs(Fr.fromString(pendingTaggedLogArrayBaseSlot));
     return [];
   }
 
-  async validateEnqueuedNotesAndEvents(
+  async utilityValidateEnqueuedNotesAndEvents(
     [contractAddress]: ACVMField[],
     [noteValidationRequestsArrayBaseSlot]: ACVMField[],
     [eventValidationRequestsArrayBaseSlot]: ACVMField[],
   ): Promise<ACVMField[]> {
-    await this.typedOracle.validateEnqueuedNotesAndEvents(
+    await this.typedOracle.utilityValidateEnqueuedNotesAndEvents(
       AztecAddress.fromString(contractAddress),
       Fr.fromString(noteValidationRequestsArrayBaseSlot),
       Fr.fromString(eventValidationRequestsArrayBaseSlot),
@@ -417,12 +426,12 @@ export class Oracle {
     return [];
   }
 
-  async bulkRetrieveLogs(
+  async utilityBulkRetrieveLogs(
     [contractAddress]: ACVMField[],
     [logRetrievalRequestsArrayBaseSlot]: ACVMField[],
     [logRetrievalResponsesArrayBaseSlot]: ACVMField[],
   ): Promise<ACVMField[]> {
-    await this.typedOracle.bulkRetrieveLogs(
+    await this.typedOracle.utilityBulkRetrieveLogs(
       AztecAddress.fromString(contractAddress),
       Fr.fromString(logRetrievalRequestsArrayBaseSlot),
       Fr.fromString(logRetrievalResponsesArrayBaseSlot),
@@ -430,8 +439,12 @@ export class Oracle {
     return [];
   }
 
-  async storeCapsule([contractAddress]: ACVMField[], [slot]: ACVMField[], capsule: ACVMField[]): Promise<ACVMField[]> {
-    await this.typedOracle.storeCapsule(
+  async utilityStoreCapsule(
+    [contractAddress]: ACVMField[],
+    [slot]: ACVMField[],
+    capsule: ACVMField[],
+  ): Promise<ACVMField[]> {
+    await this.typedOracle.utilityStoreCapsule(
       AztecAddress.fromField(Fr.fromString(contractAddress)),
       Fr.fromString(slot),
       capsule.map(Fr.fromString),
@@ -439,12 +452,12 @@ export class Oracle {
     return [];
   }
 
-  async loadCapsule(
+  async utilityLoadCapsule(
     [contractAddress]: ACVMField[],
     [slot]: ACVMField[],
     [tSize]: ACVMField[],
   ): Promise<(ACVMField | ACVMField[])[]> {
-    const values = await this.typedOracle.loadCapsule(
+    const values = await this.typedOracle.utilityLoadCapsule(
       AztecAddress.fromField(Fr.fromString(contractAddress)),
       Fr.fromString(slot),
     );
@@ -460,18 +473,21 @@ export class Oracle {
     }
   }
 
-  async deleteCapsule([contractAddress]: ACVMField[], [slot]: ACVMField[]): Promise<ACVMField[]> {
-    await this.typedOracle.deleteCapsule(AztecAddress.fromField(Fr.fromString(contractAddress)), Fr.fromString(slot));
+  async utilityDeleteCapsule([contractAddress]: ACVMField[], [slot]: ACVMField[]): Promise<ACVMField[]> {
+    await this.typedOracle.utilityDeleteCapsule(
+      AztecAddress.fromField(Fr.fromString(contractAddress)),
+      Fr.fromString(slot),
+    );
     return [];
   }
 
-  async copyCapsule(
+  async utilityCopyCapsule(
     [contractAddress]: ACVMField[],
     [srcSlot]: ACVMField[],
     [dstSlot]: ACVMField[],
     [numEntries]: ACVMField[],
   ): Promise<ACVMField[]> {
-    await this.typedOracle.copyCapsule(
+    await this.typedOracle.utilityCopyCapsule(
       AztecAddress.fromField(Fr.fromString(contractAddress)),
       Fr.fromString(srcSlot),
       Fr.fromString(dstSlot),
@@ -480,7 +496,7 @@ export class Oracle {
     return [];
   }
 
-  async aes128Decrypt(
+  async utilityAes128Decrypt(
     ciphertextBVecStorage: ACVMField[],
     [ciphertextLength]: ACVMField[],
     iv: ACVMField[],
@@ -490,36 +506,36 @@ export class Oracle {
     const ivBuffer = fromUintArray(iv, 8);
     const symKeyBuffer = fromUintArray(symKey, 8);
 
-    const plaintext = await this.typedOracle.aes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);
+    const plaintext = await this.typedOracle.utilityAes128Decrypt(ciphertext, ivBuffer, symKeyBuffer);
     return bufferToBoundedVec(plaintext, ciphertextBVecStorage.length);
   }
 
-  async getSharedSecret(
+  async utilityGetSharedSecret(
     [address]: ACVMField[],
     [ephPKField0]: ACVMField[],
     [ephPKField1]: ACVMField[],
     [ephPKField2]: ACVMField[],
   ): Promise<ACVMField[]> {
-    const secret = await this.typedOracle.getSharedSecret(
+    const secret = await this.typedOracle.utilityGetSharedSecret(
       AztecAddress.fromField(Fr.fromString(address)),
       Point.fromFields([ephPKField0, ephPKField1, ephPKField2].map(Fr.fromString)),
     );
     return secret.toFields().map(toACVMField);
   }
 
-  async emitOffchainEffect(data: ACVMField[]) {
-    await this.typedOracle.emitOffchainEffect(data.map(Fr.fromString));
+  async utilityEmitOffchainEffect(data: ACVMField[]) {
+    await this.typedOracle.utilityEmitOffchainEffect(data.map(Fr.fromString));
     return [];
   }
 
-  async getSenderForTags(): Promise<ACVMField[]> {
-    const sender = await this.typedOracle.getSenderForTags();
+  async pxeGetSenderForTags(): Promise<ACVMField[]> {
+    const sender = await this.typedOracle.pxeGetSenderForTags();
     // Return [1, address] for Some(address), [0, 0] for None
     return sender ? [toACVMField(1n), toACVMField(sender)] : [toACVMField(0n), toACVMField(0n)];
   }
 
-  async setSenderForTags([senderForTags]: ACVMField[]): Promise<ACVMField[]> {
-    await this.typedOracle.setSenderForTags(AztecAddress.fromField(Fr.fromString(senderForTags)));
+  async pxeSetSenderForTags([senderForTags]: ACVMField[]): Promise<ACVMField[]> {
+    await this.typedOracle.pxeSetSenderForTags(AztecAddress.fromField(Fr.fromString(senderForTags)));
     return [];
   }
 }
diff --git a/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution.ts b/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution.ts
index 60f3c59485..34487ac92d 100644
--- a/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution.ts
+++ b/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution.ts
@@ -82,7 +82,7 @@ export async function executePrivateFunction(
 
   const contractClassLogs = privateExecutionOracle.getContractClassLogs();
 
-  const rawReturnValues = await privateExecutionOracle.loadFromExecutionCache(publicInputs.returnsHash);
+  const rawReturnValues = await privateExecutionOracle.pxeLoadFromExecutionCache(publicInputs.returnsHash);
 
   const noteHashLeafIndexMap = privateExecutionOracle.getNoteHashLeafIndexMap();
   const newNotes = privateExecutionOracle.getNewNotes();
diff --git a/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution_oracle.ts b/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution_oracle.ts
index dbfd1060b7..19d2ccceeb 100644
--- a/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution_oracle.ts
+++ b/yarn-project/pxe/src/contract_function_simulator/oracle/private_execution_oracle.ts
@@ -167,7 +167,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * The value persists through nested calls, meaning all calls down the stack will use the same
    * 'senderForTags' value (unless it is replaced).
    */
-  public override getSenderForTags(): Promise<AztecAddress | undefined> {
+  public override pxeGetSenderForTags(): Promise<AztecAddress | undefined> {
     return Promise.resolve(this.senderForTags);
   }
 
@@ -182,7 +182,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * through nested calls, meaning all calls down the stack will use the same 'senderForTags'
    * value (unless it is replaced by another call to this setter).
    */
-  public override setSenderForTags(senderForTags: AztecAddress): Promise<void> {
+  public override pxeSetSenderForTags(senderForTags: AztecAddress): Promise<void> {
     this.senderForTags = senderForTags;
     return Promise.resolve();
   }
@@ -192,7 +192,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param values - Values to store.
    * @returns The hash of the values.
    */
-  public override storeInExecutionCache(values: Fr[], hash: Fr) {
+  public override pxeStoreInExecutionCache(values: Fr[], hash: Fr) {
     return this.executionCache.store(values, hash);
   }
 
@@ -201,7 +201,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param hash - Hash of the values.
    * @returns The values.
    */
-  public override loadFromExecutionCache(hash: Fr): Promise<Fr[]> {
+  public override pxeLoadFromExecutionCache(hash: Fr): Promise<Fr[]> {
     const preimage = this.executionCache.getPreimage(hash);
     if (!preimage) {
       throw new Error(`Preimage for hash ${hash.toString()} not found in cache`);
@@ -229,7 +229,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param status - The status of notes to fetch.
    * @returns Array of note data.
    */
-  public override async getNotes(
+  public override async utilityGetNotes(
     storageSlot: Fr,
     numSelects: number,
     selectByIndexes: number[],
@@ -307,7 +307,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param noteHash - A hash of the new note.
    * @returns
    */
-  public override notifyCreatedNote(
+  public override pxeNotifyCreatedNote(
     storageSlot: Fr,
     noteTypeId: NoteSelector,
     noteItems: Fr[],
@@ -342,7 +342,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param innerNullifier - The pending nullifier to add in the list (not yet siloed by contract address).
    * @param noteHash - A hash of the new note.
    */
-  public override async notifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
+  public override async pxeNotifyNullifiedNote(innerNullifier: Fr, noteHash: Fr, counter: number) {
     const nullifiedNoteHashCounter = await this.noteCache.nullifyNote(
       this.callContext.contractAddress,
       innerNullifier,
@@ -359,7 +359,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param innerNullifier - The pending nullifier to add in the list (not yet siloed by contract address).
    * @param noteHash - A hash of the new note.
    */
-  public override notifyCreatedNullifier(innerNullifier: Fr) {
+  public override pxeNotifyCreatedNullifier(innerNullifier: Fr) {
     return this.noteCache.nullifierCreated(this.callContext.contractAddress, innerNullifier);
   }
 
@@ -370,7 +370,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param log - The contract class log to be emitted.
    * @param counter - The contract class log's counter.
    */
-  public override notifyCreatedContractClassLog(log: ContractClassLog, counter: number) {
+  public override pxeNotifyCreatedContractClassLog(log: ContractClassLog, counter: number) {
     this.contractClassLogs.push(new CountedContractClassLog(log, counter));
     const text = log.toBuffer().toString('hex');
     this.log.verbose(
@@ -399,7 +399,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param isStaticCall - Whether the call is a static call.
    * @returns The execution result.
    */
-  override async callPrivateFunction(
+  override async pxeCallPrivateFunction(
     targetContractAddress: AztecAddress,
     functionSelector: FunctionSelector,
     argsHash: Fr,
@@ -490,7 +490,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param sideEffectCounter - The side effect counter at the start of the call.
    * @param isStaticCall - Whether the call is a static call.
    */
-  public override notifyEnqueuedPublicFunctionCall(
+  public override pxeNotifyEnqueuedPublicFunctionCall(
     _targetContractAddress: AztecAddress,
     calldataHash: Fr,
     _sideEffectCounter: number,
@@ -507,7 +507,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
    * @param sideEffectCounter - The side effect counter at the start of the call.
    * @param isStaticCall - Whether the call is a static call.
    */
-  public override notifySetPublicTeardownFunctionCall(
+  public override pxeNotifySetPublicTeardownFunctionCall(
     _targetContractAddress: AztecAddress,
     calldataHash: Fr,
     _sideEffectCounter: number,
@@ -517,7 +517,7 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
     return Promise.resolve();
   }
 
-  public override notifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number): Promise<void> {
+  public override pxeNotifySetMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter: number): Promise<void> {
     return this.noteCache.setMinRevertibleSideEffectCounter(minRevertibleSideEffectCounter);
   }
 
@@ -545,17 +545,17 @@ export class PrivateExecutionOracle extends UtilityExecutionOracle {
     return this.executionDataProvider.getDebugFunctionName(this.contractAddress, this.callContext.functionSelector);
   }
 
-  public override async incrementAppTaggingSecretIndexAsSender(sender: AztecAddress, recipient: AztecAddress) {
+  public override async pxeIncrementAppTaggingSecretIndexAsSender(sender: AztecAddress, recipient: AztecAddress) {
     await this.executionDataProvider.incrementAppTaggingSecretIndexAsSender(this.contractAddress, sender, recipient);
   }
 
-  public override async fetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
+  public override async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
     await this.executionDataProvider.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot, this.scopes);
 
     await this.executionDataProvider.removeNullifiedNotes(this.contractAddress);
   }
 
-  public override emitOffchainEffect(data: Fr[]): Promise<void> {
+  public override utilityEmitOffchainEffect(data: Fr[]): Promise<void> {
     this.offchainEffects.push({ data });
     return Promise.resolve();
   }
diff --git a/yarn-project/pxe/src/contract_function_simulator/oracle/typed_oracle.ts b/yarn-project/pxe/src/contract_function_simulator/oracle/typed_oracle.ts
index 200f9d5f41..40e457683b 100644
--- a/yarn-project/pxe/src/contract_function_simulator/oracle/typed_oracle.ts
+++ b/yarn-project/pxe/src/contract_function_simulator/oracle/typed_oracle.ts
@@ -42,80 +42,89 @@ class OracleMethodNotAvailableError extends Error {
  * Oracle with typed parameters and typed return values.
  * Methods that require read and/or write will have to be implemented based on the context (public, private, or view)
  * and are unavailable by default.
+ *
+ * Oracle methods are now prefixed to clearly indicate their availability:
+ * - avm*: AVM oracles (transpiled to avm opcodes, handled by txe during public_context testing)
+ * - txe*: TXE oracles (only available in txe top level context, manage environment state)
+ * - pxe*: PXE oracles (stateful operations like notify_created_note)
+ * - utility*: Utility oracles (typically don't need private execution, like blockNumber)
  */
 export abstract class TypedOracle {
-  getRandomField(): Fr {
-    return Fr.random();
+  utilityGetRandomField(): Fr {
+    throw new OracleMethodNotAvailableError('utilityGetRandomField');
   }
 
-  storeInExecutionCache(_values: Fr[], _hash: Fr): void {
-    throw new OracleMethodNotAvailableError('storeInExecutionCache');
+  pxeStoreInExecutionCache(_values: Fr[], _hash: Fr): void {
+    throw new OracleMethodNotAvailableError('pxeStoreInExecutionCache');
   }
 
-  loadFromExecutionCache(_hash: Fr): Promise<Fr[]> {
-    return Promise.reject(new OracleMethodNotAvailableError('loadFromExecutionCache'));
+  pxeLoadFromExecutionCache(_hash: Fr): Promise<Fr[]> {
+    return Promise.reject(new OracleMethodNotAvailableError('pxeLoadFromExecutionCache'));
   }
 
-  getBlockNumber(): Promise<number> {
-    return Promise.reject(new OracleMethodNotAvailableError('getBlockNumber'));
+  utilityGetBlockNumber(): Promise<number> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetBlockNumber'));
   }
 
-  getTimestamp(): Promise<UInt64> {
-    return Promise.reject(new OracleMethodNotAvailableError('getTimestamp'));
+  utilityGetTimestamp(): Promise<UInt64> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetTimestamp'));
   }
 
-  getContractAddress(): Promise<AztecAddress> {
-    return Promise.reject(new OracleMethodNotAvailableError('getContractAddress'));
+  utilityGetContractAddress(): Promise<AztecAddress> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetContractAddress'));
   }
 
-  getChainId(): Promise<Fr> {
-    return Promise.reject(new OracleMethodNotAvailableError('getChainId'));
+  utilityGetChainId(): Promise<Fr> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetChainId'));
   }
 
-  getVersion(): Promise<Fr> {
-    return Promise.reject(new OracleMethodNotAvailableError('getVersion'));
+  utilityGetVersion(): Promise<Fr> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetVersion'));
   }
 
-  getKeyValidationRequest(_pkMHash: Fr): Promise<KeyValidationRequest> {
-    return Promise.reject(new OracleMethodNotAvailableError('getKeyValidationRequest'));
+  utilityGetKeyValidationRequest(_pkMHash: Fr): Promise<KeyValidationRequest> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetKeyValidationRequest'));
   }
 
-  getContractInstance(_address: AztecAddress): Promise<ContractInstance> {
-    return Promise.reject(new OracleMethodNotAvailableError('getContractInstance'));
+  utilityGetContractInstance(_address: AztecAddress): Promise<ContractInstance> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetContractInstance'));
   }
 
-  getMembershipWitness(_blockNumber: number, _treeId: MerkleTreeId, _leafValue: Fr): Promise<Fr[] | undefined> {
-    return Promise.reject(new OracleMethodNotAvailableError('getMembershipWitness'));
+  utilityGetMembershipWitness(_blockNumber: number, _treeId: MerkleTreeId, _leafValue: Fr): Promise<Fr[] | undefined> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetMembershipWitness'));
   }
 
-  getNullifierMembershipWitness(_blockNumber: number, _nullifier: Fr): Promise<NullifierMembershipWitness | undefined> {
-    return Promise.reject(new OracleMethodNotAvailableError('getNullifierMembershipWitness'));
+  utilityGetNullifierMembershipWitness(
+    _blockNumber: number,
+    _nullifier: Fr,
+  ): Promise<NullifierMembershipWitness | undefined> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetNullifierMembershipWitness'));
   }
 
-  getPublicDataWitness(_blockNumber: number, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
-    return Promise.reject(new OracleMethodNotAvailableError('getPublicDataWitness'));
+  utilityGetPublicDataWitness(_blockNumber: number, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetPublicDataWitness'));
   }
 
-  getLowNullifierMembershipWitness(
+  utilityGetLowNullifierMembershipWitness(
     _blockNumber: number,
     _nullifier: Fr,
   ): Promise<NullifierMembershipWitness | undefined> {
-    return Promise.reject(new OracleMethodNotAvailableError('getLowNullifierMembershipWitness'));
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetLowNullifierMembershipWitness'));
   }
 
-  getBlockHeader(_blockNumber: number): Promise<BlockHeader | undefined> {
-    return Promise.reject(new OracleMethodNotAvailableError('getBlockHeader'));
+  utilityGetBlockHeader(_blockNumber: number): Promise<BlockHeader | undefined> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetBlockHeader'));
   }
 
-  getCompleteAddress(_account: AztecAddress): Promise<CompleteAddress> {
-    return Promise.reject(new OracleMethodNotAvailableError('getCompleteAddress'));
+  utilityGetCompleteAddress(_account: AztecAddress): Promise<CompleteAddress> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetCompleteAddress'));
   }
 
-  getAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
-    return Promise.reject(new OracleMethodNotAvailableError('getAuthWitness'));
+  utilityGetAuthWitness(_messageHash: Fr): Promise<Fr[] | undefined> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetAuthWitness'));
   }
 
-  getNotes(
+  utilityGetNotes(
     _storageSlot: Fr,
     _numSelects: number,
     _selectByIndexes: number[],
@@ -131,147 +140,157 @@ export abstract class TypedOracle {
     _offset: number,
     _status: NoteStatus,
   ): Promise<NoteData[]> {
-    return Promise.reject(new OracleMethodNotAvailableError('getNotes'));
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetNotes'));
   }
 
-  notifyCreatedNote(_storageSlot: Fr, _noteTypeId: NoteSelector, _note: Fr[], _noteHash: Fr, _counter: number): void {
-    throw new OracleMethodNotAvailableError('notifyCreatedNote');
+  pxeNotifyCreatedNote(
+    _storageSlot: Fr,
+    _noteTypeId: NoteSelector,
+    _note: Fr[],
+    _noteHash: Fr,
+    _counter: number,
+  ): void {
+    throw new OracleMethodNotAvailableError('pxeNotifyCreatedNote');
   }
 
-  notifyNullifiedNote(_innerNullifier: Fr, _noteHash: Fr, _counter: number): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('notifyNullifiedNote'));
+  pxeNotifyNullifiedNote(_innerNullifier: Fr, _noteHash: Fr, _counter: number): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifyNullifiedNote'));
   }
 
-  notifyCreatedNullifier(_innerNullifier: Fr): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('notifyCreatedNullifier'));
+  pxeNotifyCreatedNullifier(_innerNullifier: Fr): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifyCreatedNullifier'));
   }
 
-  checkNullifierExists(_innerNullifier: Fr): Promise<boolean> {
-    return Promise.reject(new OracleMethodNotAvailableError('checkNullifierExists'));
+  utilityCheckNullifierExists(_innerNullifier: Fr): Promise<boolean> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityCheckNullifierExists'));
   }
 
-  getL1ToL2MembershipWitness(
+  utilityGetL1ToL2MembershipWitness(
     _contractAddress: AztecAddress,
     _messageHash: Fr,
     _secret: Fr,
   ): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
-    return Promise.reject(new OracleMethodNotAvailableError('getL1ToL2MembershipWitness'));
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetL1ToL2MembershipWitness'));
   }
 
-  storageRead(
+  utilityStorageRead(
     _contractAddress: AztecAddress,
     _startStorageSlot: Fr,
     _blockNumber: number,
     _numberOfElements: number,
   ): Promise<Fr[]> {
-    return Promise.reject(new OracleMethodNotAvailableError('storageRead'));
+    return Promise.reject(new OracleMethodNotAvailableError('utilityStorageRead'));
   }
 
+  // TODO(benesjan): This is an AVM oracle. Should this be nuked?
   storageWrite(_startStorageSlot: Fr, _values: Fr[]): Promise<Fr[]> {
     return Promise.reject(new OracleMethodNotAvailableError('storageWrite'));
   }
 
-  notifyCreatedContractClassLog(_log: ContractClassLog, _counter: number): void {
-    throw new OracleMethodNotAvailableError('notifyCreatedContractClassLog');
+  pxeNotifyCreatedContractClassLog(_log: ContractClassLog, _counter: number): void {
+    throw new OracleMethodNotAvailableError('pxeNotifyCreatedContractClassLog');
   }
 
-  callPrivateFunction(
+  pxeCallPrivateFunction(
     _targetContractAddress: AztecAddress,
     _functionSelector: FunctionSelector,
     _argsHash: Fr,
     _sideEffectCounter: number,
     _isStaticCall: boolean,
   ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }> {
-    return Promise.reject(new OracleMethodNotAvailableError('callPrivateFunction'));
+    return Promise.reject(new OracleMethodNotAvailableError('pxeCallPrivateFunction'));
   }
 
-  notifyEnqueuedPublicFunctionCall(
+  pxeNotifyEnqueuedPublicFunctionCall(
     _targetContractAddress: AztecAddress,
     _calldataHash: Fr,
     _sideEffectCounter: number,
     _isStaticCall: boolean,
   ): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('notifyEnqueuedPublicFunctionCall'));
+    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifyEnqueuedPublicFunctionCall'));
   }
 
-  notifySetPublicTeardownFunctionCall(
+  pxeNotifySetPublicTeardownFunctionCall(
     _targetContractAddress: AztecAddress,
     _calldataHash: Fr,
     _sideEffectCounter: number,
     _isStaticCall: boolean,
   ): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('notifySetPublicTeardownFunctionCall'));
+    return Promise.reject(new OracleMethodNotAvailableError('pxeNotifySetPublicTeardownFunctionCall'));
   }
 
-  notifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: number): Promise<void> {
-    throw new OracleMethodNotAvailableError('notifySetMinRevertibleSideEffectCounter');
+  pxeNotifySetMinRevertibleSideEffectCounter(_minRevertibleSideEffectCounter: number): Promise<void> {
+    throw new OracleMethodNotAvailableError('pxeNotifySetMinRevertibleSideEffectCounter');
   }
 
-  debugLog(_message: string, _fields: Fr[]): void {
-    throw new OracleMethodNotAvailableError('debugLog');
+  utilityDebugLog(_message: string, _fields: Fr[]): void {
+    throw new OracleMethodNotAvailableError('utilityDebugLog');
   }
 
-  getIndexedTaggingSecretAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<IndexedTaggingSecret> {
-    return Promise.reject(new OracleMethodNotAvailableError('getIndexedTaggingSecretAsSender'));
+  utilityGetIndexedTaggingSecretAsSender(
+    _sender: AztecAddress,
+    _recipient: AztecAddress,
+  ): Promise<IndexedTaggingSecret> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetIndexedTaggingSecretAsSender'));
   }
 
-  incrementAppTaggingSecretIndexAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('incrementAppTaggingSecretIndexAsSender'));
+  pxeIncrementAppTaggingSecretIndexAsSender(_sender: AztecAddress, _recipient: AztecAddress): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('pxeIncrementAppTaggingSecretIndexAsSender'));
   }
 
-  fetchTaggedLogs(_pendingTaggedLogArrayBaseSlot: Fr): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('fetchTaggedLogs'));
+  utilityFetchTaggedLogs(_pendingTaggedLogArrayBaseSlot: Fr): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityFetchTaggedLogs'));
   }
 
-  validateEnqueuedNotesAndEvents(
+  utilityValidateEnqueuedNotesAndEvents(
     _contractAddress: AztecAddress,
     _noteValidationRequestsArrayBaseSlot: Fr,
     _eventValidationRequestsArrayBaseSlot: Fr,
   ): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('validateEnqueuedNotesAndEvents'));
+    return Promise.reject(new OracleMethodNotAvailableError('utilityValidateEnqueuedNotesAndEvents'));
   }
 
-  bulkRetrieveLogs(
+  utilityBulkRetrieveLogs(
     _contractAddress: AztecAddress,
     _logRetrievalRequestsArrayBaseSlot: Fr,
     _logRetrievalResponsesArrayBaseSlot: Fr,
   ): Promise<void> {
-    throw new OracleMethodNotAvailableError('bulkRetrieveLogs');
+    throw new OracleMethodNotAvailableError('utilityBulkRetrieveLogs');
   }
 
-  storeCapsule(_contractAddress: AztecAddress, _key: Fr, _capsule: Fr[]): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('storeCapsule'));
+  utilityStoreCapsule(_contractAddress: AztecAddress, _key: Fr, _capsule: Fr[]): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityStoreCapsule'));
   }
 
-  loadCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<Fr[] | null> {
-    return Promise.reject(new OracleMethodNotAvailableError('loadCapsule'));
+  utilityLoadCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<Fr[] | null> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityLoadCapsule'));
   }
 
-  deleteCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('deleteCapsule'));
+  utilityDeleteCapsule(_contractAddress: AztecAddress, _key: Fr): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityDeleteCapsule'));
   }
 
-  copyCapsule(_contractAddress: AztecAddress, _srcKey: Fr, _dstKey: Fr, _numEntries: number): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('copyCapsule'));
+  utilityCopyCapsule(_contractAddress: AztecAddress, _srcKey: Fr, _dstKey: Fr, _numEntries: number): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityCopyCapsule'));
   }
 
-  aes128Decrypt(_ciphertext: Buffer, _iv: Buffer, _symKey: Buffer): Promise<Buffer> {
-    return Promise.reject(new OracleMethodNotAvailableError('aes128Decrypt'));
+  utilityAes128Decrypt(_ciphertext: Buffer, _iv: Buffer, _symKey: Buffer): Promise<Buffer> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityAes128Decrypt'));
   }
 
-  getSharedSecret(_address: AztecAddress, _ephPk: Point): Promise<Point> {
-    return Promise.reject(new OracleMethodNotAvailableError('getSharedSecret'));
+  utilityGetSharedSecret(_address: AztecAddress, _ephPk: Point): Promise<Point> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityGetSharedSecret'));
   }
 
-  emitOffchainEffect(_data: Fr[]): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('emitOffchainEffect'));
+  utilityEmitOffchainEffect(_data: Fr[]): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('utilityEmitOffchainEffect'));
   }
 
-  getSenderForTags(): Promise<AztecAddress | undefined> {
-    return Promise.reject(new OracleMethodNotAvailableError('getSenderForTags'));
+  pxeGetSenderForTags(): Promise<AztecAddress | undefined> {
+    return Promise.reject(new OracleMethodNotAvailableError('pxeGetSenderForTags'));
   }
 
-  setSenderForTags(_senderForTags: AztecAddress): Promise<void> {
-    return Promise.reject(new OracleMethodNotAvailableError('setSenderForTags'));
+  pxeSetSenderForTags(_senderForTags: AztecAddress): Promise<void> {
+    return Promise.reject(new OracleMethodNotAvailableError('pxeSetSenderForTags'));
   }
 }
diff --git a/yarn-project/pxe/src/contract_function_simulator/oracle/utility_execution_oracle.ts b/yarn-project/pxe/src/contract_function_simulator/oracle/utility_execution_oracle.ts
index 59bdb448ae..9534b9e478 100644
--- a/yarn-project/pxe/src/contract_function_simulator/oracle/utility_execution_oracle.ts
+++ b/yarn-project/pxe/src/contract_function_simulator/oracle/utility_execution_oracle.ts
@@ -32,23 +32,27 @@ export class UtilityExecutionOracle extends TypedOracle {
     super();
   }
 
-  public override getBlockNumber(): Promise<number> {
+  public override utilityGetRandomField(): Fr {
+    return Fr.random();
+  }
+
+  public override utilityGetBlockNumber(): Promise<number> {
     return this.executionDataProvider.getBlockNumber();
   }
 
-  public override getTimestamp(): Promise<UInt64> {
+  public override utilityGetTimestamp(): Promise<UInt64> {
     return this.executionDataProvider.getTimestamp();
   }
 
-  public override getContractAddress(): Promise<AztecAddress> {
+  public override utilityGetContractAddress(): Promise<AztecAddress> {
     return Promise.resolve(this.contractAddress);
   }
 
-  public override getChainId(): Promise<Fr> {
+  public override utilityGetChainId(): Promise<Fr> {
     return Promise.resolve(this.executionDataProvider.getChainId().then(id => new Fr(id)));
   }
 
-  public override getVersion(): Promise<Fr> {
+  public override utilityGetVersion(): Promise<Fr> {
     return Promise.resolve(this.executionDataProvider.getVersion().then(v => new Fr(v)));
   }
 
@@ -58,7 +62,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @returns A Promise that resolves to nullifier keys.
    * @throws If the keys are not registered in the key store.
    */
-  public override getKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
+  public override utilityGetKeyValidationRequest(pkMHash: Fr): Promise<KeyValidationRequest> {
     return this.executionDataProvider.getKeyValidationRequest(pkMHash, this.contractAddress);
   }
 
@@ -69,7 +73,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param leafValue - The leaf value
    * @returns The index and sibling path concatenated [index, sibling_path]
    */
-  public override getMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
+  public override utilityGetMembershipWitness(blockNumber: number, treeId: MerkleTreeId, leafValue: Fr): Promise<Fr[]> {
     return this.executionDataProvider.getMembershipWitness(blockNumber, treeId, leafValue);
   }
 
@@ -79,7 +83,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param nullifier - Nullifier we try to find witness for.
    * @returns The nullifier membership witness (if found).
    */
-  public override async getNullifierMembershipWitness(
+  public override async utilityGetNullifierMembershipWitness(
     blockNumber: number,
     nullifier: Fr,
   ): Promise<NullifierMembershipWitness | undefined> {
@@ -95,7 +99,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
    * we are trying to prove non-inclusion for.
    */
-  public override async getLowNullifierMembershipWitness(
+  public override async utilityGetLowNullifierMembershipWitness(
     blockNumber: number,
     nullifier: Fr,
   ): Promise<NullifierMembershipWitness | undefined> {
@@ -108,7 +112,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param leafSlot - The slot of the public data tree to get the witness for.
    * @returns - The witness
    */
-  public override async getPublicDataWitness(
+  public override async utilityGetPublicDataWitness(
     blockNumber: number,
     leafSlot: Fr,
   ): Promise<PublicDataWitness | undefined> {
@@ -120,7 +124,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param blockNumber - The number of a block of which to get the block header.
    * @returns Block extracted from a block with block number `blockNumber`.
    */
-  public override async getBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
+  public override async utilityGetBlockHeader(blockNumber: number): Promise<BlockHeader | undefined> {
     const block = await this.executionDataProvider.getBlock(blockNumber);
     if (!block) {
       return undefined;
@@ -134,7 +138,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @returns A complete address associated with the input address.
    * @throws An error if the account is not registered in the database.
    */
-  public override getCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
+  public override utilityGetCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
     return this.executionDataProvider.getCompleteAddress(account);
   }
 
@@ -143,7 +147,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param address - Address.
    * @returns A contract instance.
    */
-  public override getContractInstance(address: AztecAddress): Promise<ContractInstance> {
+  public override utilityGetContractInstance(address: AztecAddress): Promise<ContractInstance> {
     return this.executionDataProvider.getContractInstance(address);
   }
 
@@ -153,7 +157,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param messageHash - Hash of the message to authenticate.
    * @returns Authentication witness for the requested message hash.
    */
-  public override getAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
+  public override utilityGetAuthWitness(messageHash: Fr): Promise<Fr[] | undefined> {
     return Promise.resolve(this.authWitnesses.find(w => w.requestHash.equals(messageHash))?.witness);
   }
 
@@ -178,7 +182,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param status - The status of notes to fetch.
    * @returns Array of note data.
    */
-  public override async getNotes(
+  public override async utilityGetNotes(
     storageSlot: Fr,
     numSelects: number,
     selectByIndexes: number[],
@@ -215,7 +219,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param innerNullifier - The inner nullifier.
    * @returns A boolean indicating whether the nullifier exists in the tree or not.
    */
-  public override async checkNullifierExists(innerNullifier: Fr) {
+  public override async utilityCheckNullifierExists(innerNullifier: Fr) {
     const nullifier = await siloNullifier(this.contractAddress, innerNullifier!);
     const index = await this.executionDataProvider.getNullifierIndex(nullifier);
     return index !== undefined;
@@ -229,7 +233,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
    * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
    */
-  public override async getL1ToL2MembershipWitness(contractAddress: AztecAddress, messageHash: Fr, secret: Fr) {
+  public override async utilityGetL1ToL2MembershipWitness(contractAddress: AztecAddress, messageHash: Fr, secret: Fr) {
     return await this.executionDataProvider.getL1ToL2MembershipWitness(contractAddress, messageHash, secret);
   }
 
@@ -240,7 +244,7 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param blockNumber - The block number to read storage at.
    * @param numberOfElements - Number of elements to read from the starting storage slot.
    */
-  public override async storageRead(
+  public override async utilityStorageRead(
     contractAddress: AztecAddress,
     startStorageSlot: Fr,
     blockNumber: number,
@@ -259,7 +263,7 @@ export class UtilityExecutionOracle extends TypedOracle {
     return values;
   }
 
-  public override debugLog(message: string, fields: Fr[]): void {
+  public override utilityDebugLog(message: string, fields: Fr[]): void {
     this.log.verbose(`${applyStringFormatting(message, fields)}`, { module: `${this.log.module}:debug_log` });
   }
 
@@ -271,20 +275,20 @@ export class UtilityExecutionOracle extends TypedOracle {
    * @param recipient - The address receiving the note
    * @returns A tagging secret that can be used to tag notes.
    */
-  public override async getIndexedTaggingSecretAsSender(
+  public override async utilityGetIndexedTaggingSecretAsSender(
     sender: AztecAddress,
     recipient: AztecAddress,
   ): Promise<IndexedTaggingSecret> {
     return await this.executionDataProvider.getIndexedTaggingSecretAsSender(this.contractAddress, sender, recipient);
   }
 
-  public override async fetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
+  public override async utilityFetchTaggedLogs(pendingTaggedLogArrayBaseSlot: Fr) {
     await this.executionDataProvider.syncTaggedLogs(this.contractAddress, pendingTaggedLogArrayBaseSlot, this.scopes);
 
     await this.executionDataProvider.removeNullifiedNotes(this.contractAddress);
   }
 
-  public override async validateEnqueuedNotesAndEvents(
+  public override async utilityValidateEnqueuedNotesAndEvents(
     contractAddress: AztecAddress,
     noteValidationRequestsArrayBaseSlot: Fr,
     eventValidationRequestsArrayBaseSlot: Fr,
@@ -301,7 +305,7 @@ export class UtilityExecutionOracle extends TypedOracle {
     );
   }
 
-  public override async bulkRetrieveLogs(
+  public override async utilityBulkRetrieveLogs(
     contractAddress: AztecAddress,
     logRetrievalRequestsArrayBaseSlot: Fr,
     logRetrievalResponsesArrayBaseSlot: Fr,
@@ -318,7 +322,7 @@ export class UtilityExecutionOracle extends TypedOracle {
     );
   }
 
-  public override storeCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
+  public override utilityStoreCapsule(contractAddress: AztecAddress, slot: Fr, capsule: Fr[]): Promise<void> {
     if (!contractAddress.equals(this.contractAddress)) {
       // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
       throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
@@ -326,7 +330,7 @@ export class UtilityExecutionOracle extends TypedOracle {
     return this.executionDataProvider.storeCapsule(this.contractAddress, slot, capsule);
   }
 
-  public override async loadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
+  public override async utilityLoadCapsule(contractAddress: AztecAddress, slot: Fr): Promise<Fr[] | null> {
     if (!contractAddress.equals(this.contractAddress)) {
       // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
       throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
@@ -338,7 +342,7 @@ export class UtilityExecutionOracle extends TypedOracle {
     );
   }
 
-  public override deleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
+  public override utilityDeleteCapsule(contractAddress: AztecAddress, slot: Fr): Promise<void> {
     if (!contractAddress.equals(this.contractAddress)) {
       // TODO(#10727): instead of this check that this.contractAddress is allowed to access the external DB
       throw new Error(`Contract ${contractAddress} is not allowed to access ${this.contractAddress}'s PXE DB`);
@@ -346,7 +350,7 @@ export class UtilityExecutionOracle extends TypedOracle {
     return this.executionDataProvider.deleteCapsule(this.contractAddress, slot);
   }
 
-  public override copyCapsule(
+  public override utilityCopyCapsule(
     contractAddress: AztecAddress,
     srcSlot: Fr,
     dstSlot: Fr,
@@ -360,16 +364,16 @@ export class UtilityExecutionOracle extends TypedOracle {
   }
 
   // TODO(#11849): consider replacing this oracle with a pure Noir implementation of aes decryption.
-  public override aes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
+  public override utilityAes128Decrypt(ciphertext: Buffer, iv: Buffer, symKey: Buffer): Promise<Buffer> {
     const aes128 = new Aes128();
     return aes128.decryptBufferCBC(ciphertext, iv, symKey);
   }
 
-  public override getSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
+  public override utilityGetSharedSecret(address: AztecAddress, ephPk: Point): Promise<Point> {
     return this.executionDataProvider.getSharedSecret(address, ephPk);
   }
 
-  public override emitOffchainEffect(_data: Fr[]): Promise<void> {
+  public override utilityEmitOffchainEffect(_data: Fr[]): Promise<void> {
     return Promise.reject(new Error('Cannot emit offchain effects from a utility function'));
   }
 }
diff --git a/yarn-project/txe/src/oracle/txe_oracle.ts b/yarn-project/txe/src/oracle/txe_oracle.ts
index 59a3a71c13..c93fb42d52 100644
--- a/yarn-project/txe/src/oracle/txe_oracle.ts
+++ b/yarn-project/txe/src/oracle/txe_oracle.ts
@@ -972,7 +972,7 @@ export class TXE {
       from,
     );
 
-    context.storeInExecutionCache(args, argsHash);
+    context.pxeStoreInExecutionCache(args, argsHash);
 
     // Note: This is a slight modification of simulator.run without any of the checks. Maybe we should modify simulator.run with a boolean value to skip checks.
     let result: PrivateExecutionResult;
@@ -996,7 +996,7 @@ export class TXE {
       );
       const publicFunctionsCalldata = await Promise.all(
         publicCallRequests.map(async r => {
-          const calldata = await context.loadFromExecutionCache(r.calldataHash);
+          const calldata = await context.pxeLoadFromExecutionCache(r.calldataHash);
           return new HashedValues(calldata, r.calldataHash);
         }),
       );
