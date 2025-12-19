import type { Fr } from '@aztec/foundation/curves/bn254';
import type { KeyStore } from '@aztec/key-store';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import { siloPrivateLog } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  DirectionalAppTaggingSecret,
  PendingTaggedLog,
  PrivateLogWithTxData,
  PublicLog,
  PublicLogWithTxData,
  TxScopedL2Log,
} from '@aztec/stdlib/logs';

import type { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../contract_function_simulator/noir-structs/log_retrieval_response.js';
import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import { RecipientTaggingDataProvider } from '../storage/tagging_data_provider/recipient_tagging_data_provider.js';
import { WINDOW_HALF_SIZE } from '../tagging/constants.js';
import { SiloedTag } from '../tagging/siloed_tag.js';
import { Tag } from '../tagging/tag.js';
import { getInitialIndexesMap, getPreTagsForTheWindow } from '../tagging/utils.js';

// TODO: wanted: good name
export class LogService {
  constructor(
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockDataProvider: AnchorBlockDataProvider,
    private readonly keyStore: KeyStore,
    private readonly capsuleDataProvider: CapsuleDataProvider,
    private readonly recipientTaggingDataProvider: RecipientTaggingDataProvider,
    private readonly addressDataProvider: AddressDataProvider,
  ) {}

  public async bulkRetrieveLogs(logRetrievalRequests: LogRetrievalRequest[]): Promise<(LogRetrievalResponse | null)[]> {
    return await Promise.all(
      logRetrievalRequests.map(async request => {
        // TODO(#14555): remove these internal functions and have node endpoints that do this instead
        const [publicLog, privateLog] = await Promise.all([
          this.getPublicLogByTag(request.unsiloedTag, request.contractAddress),
          this.getPrivateLogByTag(await siloPrivateLog(request.contractAddress, request.unsiloedTag)),
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
  }

  // TODO(#14555): delete this function and implement this behavior in the node instead
  public async getPublicLogByTag(tag: Fr, contractAddress: AztecAddress): Promise<PublicLogWithTxData | null> {
    const logs = await this.#getPublicLogsByTagsFromContract([tag], contractAddress);
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
    const txEffect = await this.aztecNode.getTxEffect(scopedLog.txHash);
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
  public async getPrivateLogByTag(siloedTag: Fr): Promise<PrivateLogWithTxData | null> {
    const logs = await this.#getPrivateLogsByTags([siloedTag]);
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
    const txEffect = await this.aztecNode.getTxEffect(scopedLog.txHash);
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
  async #getPublicLogsByTagsFromContract(tags: Fr[], contractAddress: AztecAddress): Promise<TxScopedL2Log[][]> {
    const allLogs = await this.aztecNode.getLogsByTags(tags);
    const allPublicLogs = allLogs.map(logs => logs.filter(log => log.isFromPublic));
    return allPublicLogs.map(logs =>
      logs.filter(log => (log.log as PublicLog).contractAddress.equals(contractAddress)),
    );
  }

  // TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
  // was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
  async #getPrivateLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    const allLogs = await this.aztecNode.getLogsByTags(tags);
    return allLogs.map(logs => logs.filter(log => !log.isFromPublic));
  }

  // TODO(#17775): Replace this implementation of this function with one implementing an approach similar
  // to syncSenderTaggingIndexes. Not done yet due to re-prioritization to devex and this doesn't directly affect
  // devex.
  public async syncTaggedLogs(
    contractAddress: AztecAddress,
    pendingTaggedLogArrayBaseSlot: Fr,
    scopes?: AztecAddress[],
  ) {
    const maxBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

    // Ideally this algorithm would be implemented in noir, exposing its building blocks as oracles.
    // However it is impossible at the moment due to the language not supporting nested slices.
    // This nesting is necessary because for a given set of tags we don't
    // know how many logs we will get back. Furthermore, these logs are of undetermined
    // length, since we don't really know the note they correspond to until we decrypt them.
    const recipients = scopes ? scopes : await this.keyStore.getAccounts();
    for (const recipient of recipients) {
      // Get all the secrets for the recipient and sender pairs (#9365)
      const indexedSecrets = await this.getLastUsedTaggingIndexesForSenders(contractAddress, recipient);

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
        const logsByTags = await this.#getPrivateLogsByTags(tagsForTheWholeWindowAsFr);

        for (let logIndex = 0; logIndex < logsByTags.length; logIndex++) {
          const logsByTag = logsByTags[logIndex];
          if (logsByTag.length > 0) {
            // We filter out the logs that are newer than the anchor block number of the tx currently being constructed
            const filteredLogsByBlockNumber = logsByTag.filter(l => l.blockNumber <= maxBlockNumber);

            // We store the logs in capsules (to later be obtained in Noir)
            await this.#storePendingTaggedLogs(
              contractAddress,
              pendingTaggedLogArrayBaseSlot,
              recipient,
              filteredLogsByBlockNumber,
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
      await this.recipientTaggingDataProvider.setLastUsedIndexes(
        Object.entries(newLargestIndexMapToStore).map(([directionalAppTaggingSecret, index]) => ({
          secret: DirectionalAppTaggingSecret.fromString(directionalAppTaggingSecret),
          index: index - 1,
        })),
      );
    }
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
  protected async getLastUsedTaggingIndexesForSenders(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
  ): Promise<{ secret: DirectionalAppTaggingSecret; index: number | undefined }[]> {
    const recipientCompleteAddress = await this.#getCompleteAddress(recipient);
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);

    // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
    // (recipient = us, sender = us)
    const senders = [
      ...(await this.recipientTaggingDataProvider.getSenderAddresses()),
      ...(await this.keyStore.getAccounts()),
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
    const indexes = await this.recipientTaggingDataProvider.getLastUsedIndexes(secrets);
    if (indexes.length !== secrets.length) {
      throw new Error('Indexes and directional app tagging secrets have different lengths');
    }

    return secrets.map((secret, i) => ({
      secret,
      index: indexes[i],
    }));
  }

  async #storePendingTaggedLogs(
    contractAddress: AztecAddress,
    capsuleArrayBaseSlot: Fr,
    recipient: AztecAddress,
    privateLogs: TxScopedL2Log[],
  ) {
    // Build all pending tagged logs upfront with their tx effects
    const pendingTaggedLogs = await Promise.all(
      privateLogs.map(async scopedLog => {
        // TODO(#9789): get these effects along with the log
        const txEffect = await this.aztecNode.getTxEffect(scopedLog.txHash);
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

    // TODO: This looks like it could belong more at the oracle interface level
    return this.capsuleDataProvider.appendToCapsuleArray(contractAddress, capsuleArrayBaseSlot, pendingTaggedLogs);
  }

  async #getCompleteAddress(account: AztecAddress): Promise<CompleteAddress> {
    const completeAddress = await this.addressDataProvider.getCompleteAddress(account);
    if (!completeAddress) {
      throw new Error(
        `No public key registered for address ${account}.
				Register it by calling pxe.addAccount(...).\nSee docs for context: https://docs.aztec.network/developers/resources/debugging/aztecnr-errors#simulation-error-no-public-key-registered-for-address-0x0-register-it-by-calling-pxeregisterrecipient-or-pxeregisteraccount`,
      );
    }
    return completeAddress;
  }
}
