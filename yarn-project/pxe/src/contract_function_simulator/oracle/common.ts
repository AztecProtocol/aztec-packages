import type { L1_TO_L2_MSG_TREE_HEIGHT } from '@aztec/constants';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { Point } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import type { EventSelector, FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockParameter, L2Block } from '@aztec/stdlib/block';
import type { CompleteAddress, ContractInstance } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier, siloPrivateLog } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { computeAddressSecret } from '@aztec/stdlib/keys';
import {
  DirectionalAppTaggingSecret,
  PendingTaggedLog,
  PrivateLogWithTxData,
  PublicLog,
  PublicLogWithTxData,
  TxScopedL2Log,
  deriveEcdhSharedSecret,
} from '@aztec/stdlib/logs';
import { getNonNullifiedL1ToL2MessageWitness } from '@aztec/stdlib/messaging';
import { Note, NoteDao, type NoteStatus } from '@aztec/stdlib/note';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { ORACLE_VERSION } from '../../oracle_version.js';
import {
  type AddressDataProvider,
  AnchorBlockDataProvider,
  type CapsuleDataProvider,
  type ContractDataProvider,
  type NoteDataProvider,
  PrivateEventDataProvider,
  type RecipientTaggingDataProvider,
} from '../../storage/index.js';
import { SiloedTag, Tag, WINDOW_HALF_SIZE, getInitialIndexesMap, getPreTagsForTheWindow } from '../../tagging/index.js';
import type { ExecutionStats } from '../execution_data_provider.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import type { ProxiedNode } from '../proxied_node.js';
import { MessageLoadOracleInputs } from './message_load_oracle_inputs.js';

// TODO: this might not be the final home for these functions,
// it's just a way of starting to dissolve PXEOracleInterface
export async function getContractInstance(
  address: AztecAddress,
  contractDataProvider: ContractDataProvider,
): Promise<ContractInstance> {
  const instance = await contractDataProvider.getContractInstance(address);
  if (!instance) {
    throw new Error(`No contract instance found for address ${address.toString()}`);
  }
  return instance;
}

export async function getFunctionArtifact(
  contractAddress: AztecAddress,
  selector: FunctionSelector,
  contractDataProvider: ContractDataProvider,
): Promise<FunctionArtifactWithContractName> {
  const artifact = await contractDataProvider.getFunctionArtifact(contractAddress, selector);
  if (!artifact) {
    throw new Error(`Function artifact not found for contract ${contractAddress} and selector ${selector}.`);
  }
  const debug = await contractDataProvider.getFunctionDebugMetadata(contractAddress, selector);
  return {
    ...artifact,
    debug,
  };
}

export async function getNotes(
  contractAddress: AztecAddress,
  owner: AztecAddress | undefined,
  storageSlot: Fr,
  status: NoteStatus,
  noteDataProvider: NoteDataProvider,
  scopes?: AztecAddress[],
) {
  const noteDaos = await noteDataProvider.getNotes({
    contractAddress,
    owner,
    storageSlot,
    status,
    scopes,
  });
  return noteDaos.map(
    ({ contractAddress, owner, storageSlot, randomness, noteNonce, note, noteHash, siloedNullifier, index }) => ({
      contractAddress,
      owner,
      storageSlot,
      randomness,
      noteNonce,
      note,
      noteHash,
      siloedNullifier,
      // PXE can use this index to get full MembershipWitness
      index,
    }),
  );
}

export async function getCompleteAddress(
  account: AztecAddress,
  addressDataProvider: AddressDataProvider,
): Promise<CompleteAddress> {
  const completeAddress = await addressDataProvider.getCompleteAddress(account);
  if (!completeAddress) {
    throw new Error(
      `No public key registered for address ${account}.
      Register it by calling pxe.addAccount(...).\nSee docs for context: https://docs.aztec.network/developers/resources/debugging/aztecnr-errors#simulation-error-no-public-key-registered-for-address-0x0-register-it-by-calling-pxeregisterrecipient-or-pxeregisteraccount`,
    );
  }
  return completeAddress;
}

export async function calculateDirectionalAppTaggingSecret(
  contractAddress: AztecAddress,
  sender: AztecAddress,
  recipient: AztecAddress,
  addressDataProvider: AddressDataProvider,
  keyStore: KeyStore,
) {
  const senderCompleteAddress = await getCompleteAddress(sender, addressDataProvider);
  const senderIvsk = await keyStore.getMasterIncomingViewingSecretKey(sender);
  return DirectionalAppTaggingSecret.compute(senderCompleteAddress, senderIvsk, recipient, contractAddress, recipient);
}

export async function getSharedSecret(
  address: AztecAddress,
  ephPk: Point,
  addressDataProvider: AddressDataProvider,
  keyStore: KeyStore,
): Promise<Point> {
  // TODO(#12656): return an app-siloed secret
  const recipientCompleteAddress = await getCompleteAddress(address, addressDataProvider);
  const ivskM = await keyStore.getMasterSecretKey(recipientCompleteAddress.publicKeys.masterIncomingViewingPublicKey);
  const addressSecret = await computeAddressSecret(await recipientCompleteAddress.getPreaddress(), ivskM);
  return deriveEcdhSharedSecret(addressSecret, ephPk);
}

/**
 * Fetches a message from the db, given its key.
 * @param contractAddress - Address of a contract by which the message was emitted.
 * @param messageHash - Hash of the message.
 * @param secret - Secret used to compute a nullifier.
 * @dev Contract address and secret are only used to compute the nullifier to get non-nullified messages
 * @returns The l1 to l2 membership witness (index of message in the tree and sibling path).
 */
export async function getL1ToL2MembershipWitness(
  contractAddress: AztecAddress,
  messageHash: Fr,
  secret: Fr,
  aztecNode: AztecNode,
): Promise<MessageLoadOracleInputs<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
  const [messageIndex, siblingPath] = await getNonNullifiedL1ToL2MessageWitness(
    aztecNode,
    contractAddress,
    messageHash,
    secret,
  );

  // Assuming messageIndex is what you intended to use for the index in MessageLoadOracleInputs
  return new MessageLoadOracleInputs(messageIndex, siblingPath);
}

export async function getMembershipWitness(
  blockNumber: BlockParameter,
  treeId: MerkleTreeId,
  leafValue: Fr,
  aztecNode: AztecNode,
): Promise<Fr[]> {
  const witness = await tryGetMembershipWitness(blockNumber, treeId, leafValue, aztecNode);
  if (!witness) {
    throw new Error(`Leaf value ${leafValue} not found in tree ${MerkleTreeId[treeId]} at block ${blockNumber}`);
  }
  return witness;
}

async function tryGetMembershipWitness(
  blockNumber: BlockParameter,
  treeId: MerkleTreeId,
  value: Fr,
  aztecNode: AztecNode,
): Promise<Fr[] | undefined> {
  switch (treeId) {
    case MerkleTreeId.NULLIFIER_TREE:
      return (await aztecNode.getNullifierMembershipWitness(blockNumber, value))?.withoutPreimage().toFields();
    case MerkleTreeId.NOTE_HASH_TREE:
      return (await aztecNode.getNoteHashMembershipWitness(blockNumber, value))?.toFields();
    case MerkleTreeId.PUBLIC_DATA_TREE:
      return (await aztecNode.getPublicDataWitness(blockNumber, value))?.withoutPreimage().toFields();
    case MerkleTreeId.ARCHIVE:
      return (await aztecNode.getArchiveMembershipWitness(blockNumber, value))?.toFields();
    default:
      throw new Error('Not implemented');
  }
}

export async function getLowNullifierMembershipWitness(
  blockNumber: BlockParameter,
  nullifier: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<NullifierMembershipWitness | undefined> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return aztecNode.getLowNullifierMembershipWitness(blockNumber, nullifier);
}

export async function getBlock(
  blockNumber: BlockParameter,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<L2Block | undefined> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return await aztecNode.getBlock(blockNumber);
}

export function getNullifierMembershipWitness(
  blockNumber: BlockParameter,
  nullifier: Fr,
  aztecNode: AztecNode,
): Promise<NullifierMembershipWitness | undefined> {
  return aztecNode.getNullifierMembershipWitness(blockNumber, nullifier);
}

export async function getNullifierMembershipWitnessAtLatestBlock(
  nullifier: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
) {
  const blockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  return getNullifierMembershipWitness(blockNumber, nullifier, aztecNode);
}

export async function getPublicDataWitness(
  blockNumber: BlockParameter,
  leafSlot: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<PublicDataWitness | undefined> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return await aztecNode.getPublicDataWitness(blockNumber, leafSlot);
}

export async function getPublicStorageAt(
  blockNumber: BlockParameter,
  contract: AztecAddress,
  slot: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
): Promise<Fr> {
  const anchorBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
  if (blockNumber !== 'latest' && blockNumber > anchorBlockNumber) {
    throw new Error(`Block number ${blockNumber} is higher than current block ${anchorBlockNumber}`);
  }
  return await aztecNode.getPublicStorageAt(blockNumber, contract, slot);
}

export function assertCompatibleOracleVersion(version: number): void {
  if (version !== ORACLE_VERSION) {
    throw new Error(`Incompatible oracle version. Expected version ${ORACLE_VERSION}, got ${version}.`);
  }
}

export function getStats(aztecNode: AztecNode): ExecutionStats {
  const nodeRPCCalls =
    typeof (aztecNode as ProxiedNode).getStats === 'function' ? (aztecNode as ProxiedNode).getStats() : {};

  return { nodeRPCCalls };
}

// TODO(#17775): Replace this implementation of this function with one implementing an approach similar
// to syncSenderTaggingIndexes. Not done yet due to re-prioritization to devex and this doesn't directly affect
// devex.
export async function syncTaggedLogs(
  contractAddress: AztecAddress,
  pendingTaggedLogArrayBaseSlot: Fr,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  keyStore: KeyStore,
  contractDataProvider: ContractDataProvider,
  capsuleDataProvider: CapsuleDataProvider,
  addressDataProvider: AddressDataProvider,
  recipientTaggingDataProvider: RecipientTaggingDataProvider,
  aztecNode: AztecNode,
  scopes?: AztecAddress[],
) {
  const maxBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

  // Ideally this algorithm would be implemented in noir, exposing its building blocks as oracles.
  // However it is impossible at the moment due to the language not supporting nested slices.
  // This nesting is necessary because for a given set of tags we don't
  // know how many logs we will get back. Furthermore, these logs are of undetermined
  // length, since we don't really know the note they correspond to until we decrypt them.
  const recipients = scopes ? scopes : await keyStore.getAccounts();
  for (const recipient of recipients) {
    // Get all the secrets for the recipient and sender pairs (#9365)
    const indexedSecrets = await getLastUsedTaggingIndexesForSenders(
      contractAddress,
      recipient,
      addressDataProvider,
      keyStore,
      recipientTaggingDataProvider,
    );

    // We fetch logs for a window of indexes in a range:
    //    <latest_log_index - WINDOW_HALF_SIZE, latest_log_index + WINDOW_HALF_SIZE>.
    //
    // We use this window approach because it could happen that a sender might have messed up and inadvertently
    // incremented their index without us getting any logs (for example, in case of a revert). If we stopped looking
    // for logs the first time we don't receive any logs for a tag, we might never receive anything from that sender again.
    //    Also there's a possibility that we have advanced our index, but the sender has reused it, so we might have missed
    // some logs. For these reasons, we have to look both back and ahead of the stored index.
    let secretsAndWindows = indexedSecrets.map(indexedSecret => {
      if (indexedSecret.index === undefined) {
        return {
          secret: indexedSecret.secret,
          leftMostIndex: 0,
          rightMostIndex: WINDOW_HALF_SIZE,
        };
      } else {
        return {
          secret: indexedSecret.secret,
          leftMostIndex: Math.max(0, indexedSecret.index - WINDOW_HALF_SIZE),
          rightMostIndex: indexedSecret.index + WINDOW_HALF_SIZE,
        };
      }
    });

    // As we iterate we store the largest index we have seen for a given secret to later on store it in the db.
    const newLargestIndexMapToStore: { [k: string]: number } = {};

    // The initial/unmodified indexes of the secrets stored in a key-value map where key is the directional app
    // tagging secret.
    const initialIndexesMap = getInitialIndexesMap(indexedSecrets);

    while (secretsAndWindows.length > 0) {
      const preTagsForTheWholeWindow = getPreTagsForTheWindow(secretsAndWindows);
      const tagsForTheWholeWindow = await Promise.all(
        preTagsForTheWholeWindow.map(async preTag => {
          return SiloedTag.compute(await Tag.compute(preTag), contractAddress);
        }),
      );

      // We store the new largest indexes we find in the iteration in the following map to later on construct
      // a new set of secrets and windows to fetch logs for.
      const newLargestIndexMapForIteration: { [k: string]: number } = {};

      // Fetch the private logs for the tags and iterate over them
      // TODO: The following conversion is unfortunate and we should most likely just type the #getPrivateLogsByTags
      // to accept SiloedTag[] instead of Fr[]. That would result in a large change so I didn't do it yet.
      const tagsForTheWholeWindowAsFr = tagsForTheWholeWindow.map(tag => tag.value);
      const logsByTags = await internalGetPrivateLogsByTags(tagsForTheWholeWindowAsFr, aztecNode);

      for (let logIndex = 0; logIndex < logsByTags.length; logIndex++) {
        const logsByTag = logsByTags[logIndex];
        if (logsByTag.length > 0) {
          // We filter out the logs that are newer than the anchor block number of the tx currently being constructed
          const filteredLogsByBlockNumber = logsByTag.filter(l => l.blockNumber <= maxBlockNumber);

          // We store the logs in capsules (to later be obtained in Noir)
          await storePendingTaggedLogs(
            contractAddress,
            pendingTaggedLogArrayBaseSlot,
            recipient,
            filteredLogsByBlockNumber,
            aztecNode,
            capsuleDataProvider,
          );

          // We retrieve the pre-tag corresponding to the log as I need that to evaluate whether
          // a new largest index have been found.
          const preTagCorrespondingToLog = preTagsForTheWholeWindow[logIndex];
          const initialIndex = initialIndexesMap[preTagCorrespondingToLog.secret.toString()];

          if (
            preTagCorrespondingToLog.index >= initialIndex &&
            (newLargestIndexMapForIteration[preTagCorrespondingToLog.secret.toString()] === undefined ||
              preTagCorrespondingToLog.index >=
                newLargestIndexMapForIteration[preTagCorrespondingToLog.secret.toString()])
          ) {
            // We have found a new largest index so we store it for later processing (storing it in the db + fetching
            // the difference of the window sets of current and the next iteration)
            newLargestIndexMapForIteration[preTagCorrespondingToLog.secret.toString()] =
              preTagCorrespondingToLog.index + 1;
          }
        }
      }

      // Now based on the new largest indexes we found, we will construct a new secrets and windows set to fetch logs
      // for. Note that it's very unlikely that a new log from the current window would appear between the iterations
      // so we fetch the logs only for the difference of the window sets.
      const newSecretsAndWindows = [];
      for (const [directionalAppTaggingSecret, newIndex] of Object.entries(newLargestIndexMapForIteration)) {
        const maybeIndexedSecret = indexedSecrets.find(
          indexedSecret => indexedSecret.secret.toString() === directionalAppTaggingSecret,
        );
        if (maybeIndexedSecret) {
          newSecretsAndWindows.push({
            secret: maybeIndexedSecret.secret,
            // We set the left most index to the new index to avoid fetching the same logs again
            leftMostIndex: newIndex,
            rightMostIndex: newIndex + WINDOW_HALF_SIZE,
          });

          // We store the new largest index in the map to later store it in the db.
          newLargestIndexMapToStore[directionalAppTaggingSecret] = newIndex;
        } else {
          throw new Error(
            `Secret not found for directionalAppTaggingSecret ${directionalAppTaggingSecret}. This is a bug as it should never happen!`,
          );
        }
      }

      // Now we set the new secrets and windows and proceed to the next iteration.
      secretsAndWindows = newSecretsAndWindows;
    }

    // At this point we have processed all the logs for the recipient so we store the last used indexes in the db.
    // newLargestIndexMapToStore contains "next" indexes to look for (one past the last found), so subtract 1 to get
    // last used.
    await recipientTaggingDataProvider.setLastUsedIndexes(
      Object.entries(newLargestIndexMapToStore).map(([directionalAppTaggingSecret, index]) => ({
        secret: DirectionalAppTaggingSecret.fromString(directionalAppTaggingSecret),
        index: index - 1,
      })),
    );
  }
}

async function storePendingTaggedLogs(
  contractAddress: AztecAddress,
  capsuleArrayBaseSlot: Fr,
  recipient: AztecAddress,
  privateLogs: TxScopedL2Log[],
  aztecNode: AztecNode,
  capsuleDataProvider: CapsuleDataProvider,
) {
  // Build all pending tagged logs upfront with their tx effects
  const pendingTaggedLogs = await Promise.all(
    privateLogs.map(async scopedLog => {
      // TODO(#9789): get these effects along with the log
      const txEffect = await aztecNode.getTxEffect(scopedLog.txHash);
      if (!txEffect) {
        throw new Error(`Could not find tx effect for tx hash ${scopedLog.txHash}`);
      }

      const pendingTaggedLog = new PendingTaggedLog(
        scopedLog.log.fields,
        scopedLog.txHash,
        txEffect.data.noteHashes,
        txEffect.data.nullifiers[0],
        recipient,
      );

      return pendingTaggedLog.toFields();
    }),
  );

  return capsuleDataProvider.appendToCapsuleArray(contractAddress, capsuleArrayBaseSlot, pendingTaggedLogs);
}

/**
 * Returns the last used tagging indexes along with the directional app tagging secrets for a given recipient and all
 * the senders in the address book.
 * This method should be exposed as an oracle call to allow aztec.nr to perform the orchestration
 * of the syncTaggedLogs and processTaggedLogs methods. However, it is not possible to do so at the moment,
 * so we're keeping it private for now.
 * @param contractAddress - The contract address to silo the secret for
 * @param recipient - The address receiving the notes
 * @returns A list of directional app tagging secrets along with the last used tagging indexes. If the corresponding
 * secret was never used, the index is undefined.
 * TODO(#17775): The naming here is broken as the function name does not reflect the return type. Make sure this gets
 * fixed when implementing the linked issue.
 */
async function getLastUsedTaggingIndexesForSenders(
  contractAddress: AztecAddress,
  recipient: AztecAddress,
  addressDataProvider: AddressDataProvider,
  keyStore: KeyStore,
  recipientTaggingDataProvider: RecipientTaggingDataProvider,
): Promise<{ secret: DirectionalAppTaggingSecret; index: number | undefined }[]> {
  const recipientCompleteAddress = await getCompleteAddress(recipient, addressDataProvider);
  const recipientIvsk = await keyStore.getMasterIncomingViewingSecretKey(recipient);

  // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
  // (recipient = us, sender = us)
  const senders = [
    ...(await recipientTaggingDataProvider.getSenderAddresses()),
    ...(await keyStore.getAccounts()),
  ].filter((address, index, self) => index === self.findIndex(otherAddress => otherAddress.equals(address)));
  const secrets = await Promise.all(
    senders.map(contact => {
      return DirectionalAppTaggingSecret.compute(
        recipientCompleteAddress,
        recipientIvsk,
        contact,
        contractAddress,
        recipient,
      );
    }),
  );
  const indexes = await recipientTaggingDataProvider.getLastUsedIndexes(secrets);
  if (indexes.length !== secrets.length) {
    throw new Error('Indexes and directional app tagging secrets have different lengths');
  }

  return secrets.map((secret, i) => ({
    secret,
    index: indexes[i],
  }));
}

// TODO(#14555): delete this function and implement this behavior in the node instead
export async function getPublicLogByTag(
  tag: Fr,
  contractAddress: AztecAddress,
  aztecNode: AztecNode,
): Promise<PublicLogWithTxData | null> {
  const logs = await internalGetPublicLogsByTagsFromContract([tag], contractAddress, aztecNode);
  const logsForTag = logs[0];

  if (logsForTag.length == 0) {
    return null;
  } else if (logsForTag.length > 1) {
    // TODO(#11627): handle this case
    throw new Error(
      `Got ${logsForTag.length} logs for tag ${tag} and contract ${contractAddress.toString()}. getPublicLogByTag currently only supports a single log per tag`,
    );
  }

  const scopedLog = logsForTag[0];

  // getLogsByTag doesn't have all of the information that we need (notably note hashes and the first nullifier), so
  // we need to make a second call to the node for `getTxEffect`.
  // TODO(#9789): bundle this information in the `getLogsByTag` call.
  const txEffect = await aztecNode.getTxEffect(scopedLog.txHash);
  if (txEffect == undefined) {
    throw new Error(`Unexpected: failed to retrieve tx effects for tx ${scopedLog.txHash} which is known to exist`);
  }

  return new PublicLogWithTxData(
    scopedLog.log.getEmittedFieldsWithoutTag(),
    scopedLog.txHash,
    txEffect.data.noteHashes,
    txEffect.data.nullifiers[0],
  );
}

// TODO(#14555): delete this function and implement this behavior in the node instead
export async function getPrivateLogByTag(siloedTag: Fr, aztecNode: AztecNode): Promise<PrivateLogWithTxData | null> {
  const logs = await internalGetPrivateLogsByTags([siloedTag], aztecNode);
  const logsForTag = logs[0];

  if (logsForTag.length == 0) {
    return null;
  } else if (logsForTag.length > 1) {
    // TODO(#11627): handle this case
    throw new Error(
      `Got ${logsForTag.length} logs for tag ${siloedTag}. getPrivateLogByTag currently only supports a single log per tag`,
    );
  }

  const scopedLog = logsForTag[0];

  // getLogsByTag doesn't have all of the information that we need (notably note hashes and the first nullifier), so
  // we need to make a second call to the node for `getTxEffect`.
  // TODO(#9789): bundle this information in the `getLogsByTag` call.
  const txEffect = await aztecNode.getTxEffect(scopedLog.txHash);
  if (txEffect == undefined) {
    throw new Error(`Unexpected: failed to retrieve tx effects for tx ${scopedLog.txHash} which is known to exist`);
  }

  return new PrivateLogWithTxData(
    scopedLog.log.getEmittedFieldsWithoutTag(),
    scopedLog.txHash,
    txEffect.data.noteHashes,
    txEffect.data.nullifiers[0],
  );
}

// TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
// was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
async function internalGetPrivateLogsByTags(tags: Fr[], aztecNode: AztecNode): Promise<TxScopedL2Log[][]> {
  const allLogs = await aztecNode.getLogsByTags(tags);
  return allLogs.map(logs => logs.filter(log => !log.isFromPublic));
}

// TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
// was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
async function internalGetPublicLogsByTagsFromContract(
  tags: Fr[],
  contractAddress: AztecAddress,
  aztecNode: AztecNode,
): Promise<TxScopedL2Log[][]> {
  const allLogs = await aztecNode.getLogsByTags(tags);
  const allPublicLogs = allLogs.map(logs => logs.filter(log => log.isFromPublic));
  return allPublicLogs.map(logs => logs.filter(log => (log.log as PublicLog).contractAddress.equals(contractAddress)));
}

export async function bulkRetrieveLogs(
  contractAddress: AztecAddress,
  logRetrievalRequestsArrayBaseSlot: Fr,
  logRetrievalResponsesArrayBaseSlot: Fr,
  capsuleDataProvider: CapsuleDataProvider,
  aztecNode: AztecNode,
) {
  // We read all log retrieval requests and process them all concurrently. This makes the process much faster as we
  // don't need to wait for the network round-trip.
  const logRetrievalRequests = (
    await capsuleDataProvider.readCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot)
  ).map(LogRetrievalRequest.fromFields);

  const maybeLogRetrievalResponses = await Promise.all(
    logRetrievalRequests.map(async request => {
      // TODO(#14555): remove these internal functions and have node endpoints that do this instead
      const [publicLog, privateLog] = await Promise.all([
        getPublicLogByTag(request.unsiloedTag, request.contractAddress, aztecNode),
        getPrivateLogByTag(await siloPrivateLog(request.contractAddress, request.unsiloedTag), aztecNode),
      ]);

      if (publicLog !== null) {
        if (privateLog !== null) {
          throw new Error(
            `Found both a public and private log when searching for tag ${request.unsiloedTag} from contract ${request.contractAddress}`,
          );
        }

        return new LogRetrievalResponse(
          publicLog.logPayload,
          publicLog.txHash,
          publicLog.uniqueNoteHashesInTx,
          publicLog.firstNullifierInTx,
        );
      } else if (privateLog !== null) {
        return new LogRetrievalResponse(
          privateLog.logPayload,
          privateLog.txHash,
          privateLog.uniqueNoteHashesInTx,
          privateLog.firstNullifierInTx,
        );
      } else {
        return null;
      }
    }),
  );

  // Requests are cleared once we're done.
  await capsuleDataProvider.setCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot, []);

  // The responses are stored as Option<LogRetrievalResponse> in a second CapsuleArray.
  await capsuleDataProvider.setCapsuleArray(
    contractAddress,
    logRetrievalResponsesArrayBaseSlot,
    maybeLogRetrievalResponses.map(LogRetrievalResponse.toSerializedOption),
  );
}

export async function getNullifierIndex(nullifier: Fr, aztecNode: AztecNode) {
  return await findLeafIndex('latest', MerkleTreeId.NULLIFIER_TREE, nullifier, aztecNode);
}

async function findLeafIndex(
  blockNumber: BlockParameter,
  treeId: MerkleTreeId,
  leafValue: Fr,
  aztecNode: AztecNode,
): Promise<bigint | undefined> {
  const [leafIndex] = await aztecNode.findLeavesIndexes(blockNumber, treeId, [leafValue]);
  return leafIndex?.data;
}

export async function validateEnqueuedNotesAndEvents(
  contractAddress: AztecAddress,
  noteValidationRequestsArrayBaseSlot: Fr,
  eventValidationRequestsArrayBaseSlot: Fr,
  capsuleDataProvider: CapsuleDataProvider,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
  noteDataProvider: NoteDataProvider,
  privateEventDataProvider: PrivateEventDataProvider,
): Promise<void> {
  // We read all note and event validation requests and process them all concurrently. This makes the process much
  // faster as we don't need to wait for the network round-trip.
  const noteValidationRequests = (
    await capsuleDataProvider.readCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot)
  ).map(NoteValidationRequest.fromFields);

  const eventValidationRequests = (
    await capsuleDataProvider.readCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot)
  ).map(EventValidationRequest.fromFields);

  const noteDeliveries = noteValidationRequests.map(request =>
    deliverNote(
      request.contractAddress,
      request.owner,
      request.storageSlot,
      request.randomness,
      request.noteNonce,
      request.content,
      request.noteHash,
      request.nullifier,
      request.txHash,
      request.recipient,
      anchorBlockDataProvider,
      aztecNode,
      noteDataProvider,
    ),
  );

  const eventDeliveries = eventValidationRequests.map(request =>
    deliverEvent(
      request.contractAddress,
      request.eventTypeId,
      request.serializedEvent,
      request.eventCommitment,
      request.txHash,
      request.recipient,
      anchorBlockDataProvider,
      aztecNode,
      privateEventDataProvider,
    ),
  );

  await Promise.all([...noteDeliveries, ...eventDeliveries]);

  // Requests are cleared once we're done.
  await capsuleDataProvider.setCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, []);
  await capsuleDataProvider.setCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, []);
}

export async function deliverNote(
  contractAddress: AztecAddress,
  owner: AztecAddress,
  storageSlot: Fr,
  randomness: Fr,
  noteNonce: Fr,
  content: Fr[],
  noteHash: Fr,
  nullifier: Fr,
  txHash: TxHash,
  recipient: AztecAddress,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
  noteDataProvider: NoteDataProvider,
): Promise<void> {
  // We are going to store the new note in the NoteDataProvider, which will let us later return it via `getNotes`.
  // There's two things we need to check before we do this however:
  //  - we must make sure the note does actually exist in the note hash tree
  //  - we need to check if the note has already been nullified
  //
  // Failing to do either of the above would result in circuits getting either non-existent notes and failing to
  // produce inclusion proofs for them, or getting nullified notes and producing duplicate nullifiers, both of which
  // are catastrophic failure modes.
  //
  // Note that adding a note and removing it is *not* equivalent to never adding it in the first place. A nullifier
  // emitted in a block that comes after note creation might result in the note being de-nullified by a chain reorg,
  // so we must store both the note hash and nullifier block information.

  // We avoid making node queries at 'latest' since we don't want to process notes or nullifiers that only exist ahead
  // in time of the locally synced state.
  // Note that while this technically results in historical queries, we perform it at the latest locally synced block
  // number which *should* be recent enough to be available, even for non-archive nodes.
  // Also note that the note should never be ahead of the synced block here since `fetchTaggedLogs` only processes
  // logs up to the synced block making this only an additional safety check.
  const syncedBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

  // By computing siloed and unique note hashes ourselves we prevent contracts from interfering with the note storage
  // of other contracts, which would constitute a security breach.
  const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
  const siloedNullifier = await siloNullifier(contractAddress, nullifier);

  const txEffect = await aztecNode.getTxEffect(txHash);
  if (!txEffect) {
    throw new Error(`Could not find tx effect for tx hash ${txHash}`);
  }

  if (txEffect.l2BlockNumber > syncedBlockNumber) {
    throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${syncedBlockNumber}`);
  }

  const noteInTx = txEffect.data.noteHashes.some(nh => nh.equals(uniqueNoteHash));
  if (!noteInTx) {
    throw new Error(`Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present in tx ${txHash}`);
  }

  // We store notes by their index in the global note hash tree, which has the convenient side effect of validating
  // note existence in said tree. We concurrently also check if the note's nullifier exists, performing all node
  // queries in a single round-trip.
  const [[uniqueNoteHashTreeIndexInBlock], [nullifierIndex]] = await Promise.all([
    aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NOTE_HASH_TREE, [uniqueNoteHash]),
    aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [siloedNullifier]),
  ]);

  if (uniqueNoteHashTreeIndexInBlock === undefined) {
    throw new Error(
      `Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present on the tree at block ${syncedBlockNumber} (from tx ${txHash})`,
    );
  }

  const noteDao = new NoteDao(
    new Note(content),
    contractAddress,
    owner,
    storageSlot,
    randomness,
    noteNonce,
    noteHash,
    siloedNullifier,
    txHash,
    uniqueNoteHashTreeIndexInBlock.l2BlockNumber,
    uniqueNoteHashTreeIndexInBlock.l2BlockHash.toString(),
    uniqueNoteHashTreeIndexInBlock.data,
  );

  // The note was found by `recipient`, so we use that as the scope when storing the note.
  await noteDataProvider.addNotes([noteDao], recipient);

  if (nullifierIndex !== undefined) {
    const { data: _, ...blockHashAndNum } = nullifierIndex;
    await noteDataProvider.applyNullifiers([{ data: siloedNullifier, ...blockHashAndNum }]);
  }
}

export async function deliverEvent(
  contractAddress: AztecAddress,
  selector: EventSelector,
  content: Fr[],
  eventCommitment: Fr,
  txHash: TxHash,
  scope: AztecAddress,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
  privateEventDataProvider: PrivateEventDataProvider,
): Promise<void> {
  // While using 'latest' block number would be fine for private events since they cannot be accessed from Aztec.nr
  // (and thus we're less concerned about being ahead of the synced block), we use the synced block number to
  // maintain consistent behavior in the PXE. Additionally, events should never be ahead of the synced block here
  // since `fetchTaggedLogs` only processes logs up to the synced block.
  const [syncedBlockHeader, siloedEventCommitment, txEffect] = await Promise.all([
    anchorBlockDataProvider.getBlockHeader(),
    siloNullifier(contractAddress, eventCommitment),
    aztecNode.getTxEffect(txHash),
  ]);

  const syncedBlockNumber = syncedBlockHeader.getBlockNumber();

  if (!txEffect) {
    throw new Error(`Could not find tx effect for tx hash ${txHash}`);
  }

  if (txEffect.l2BlockNumber > syncedBlockNumber) {
    throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${syncedBlockNumber}`);
  }

  const eventInTx = txEffect.data.nullifiers.some(n => n.equals(siloedEventCommitment));
  if (!eventInTx) {
    throw new Error(
      `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present in tx ${txHash}`,
    );
  }

  const [nullifierIndex] = await aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [
    siloedEventCommitment,
  ]);

  if (nullifierIndex === undefined) {
    throw new Error(
      `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present on the nullifier tree at block ${syncedBlockNumber} (from tx ${txHash})`,
    );
  }

  return privateEventDataProvider.storePrivateEventLog(
    selector,
    content,
    Number(nullifierIndex.data), // Index of the event commitment in the nullifier tree
    {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber: nullifierIndex.l2BlockNumber, // Block number in which the event was emitted
      l2BlockHash: nullifierIndex.l2BlockHash, // Block hash in which the event was emitted
    },
  );
}
