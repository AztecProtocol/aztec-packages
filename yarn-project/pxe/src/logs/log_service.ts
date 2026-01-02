import type { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  DirectionalAppTaggingSecret,
  PendingTaggedLog,
  PrivateLogWithTxData,
  PublicLogWithTxData,
  SiloedTag,
  Tag,
  TxScopedL2Log,
} from '@aztec/stdlib/logs';

import type { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../contract_function_simulator/noir-structs/log_retrieval_response.js';
import { AddressDataProvider } from '../storage/address_data_provider/address_data_provider.js';
import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import { CapsuleDataProvider } from '../storage/capsule_data_provider/capsule_data_provider.js';
import type { SenderAddressBook } from '../storage/tagging_data_provider/sender_address_book.js';
import { loadPrivateLogsForSenderRecipientPair } from '../tagging/recipient_sync/load_private_logs_for_sender_recipient_pair.js';
import type { RecipientTaggingDataProvider } from '../tagging/recipient_sync/recipient_tagging_data_provider.js';

export class LogService {
  private log = createLogger('log_service');

  constructor(
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockDataProvider: AnchorBlockDataProvider,
    private readonly keyStore: KeyStore,
    private readonly capsuleDataProvider: CapsuleDataProvider,
    private readonly recipientTaggingDataProvider: RecipientTaggingDataProvider,
    private readonly senderAddressBook: SenderAddressBook,
    private readonly addressDataProvider: AddressDataProvider,
  ) {}

  public async bulkRetrieveLogs(logRetrievalRequests: LogRetrievalRequest[]): Promise<(LogRetrievalResponse | null)[]> {
    return await Promise.all(
      logRetrievalRequests.map(async request => {
        // TODO(F-231): remove these internal functions and have node endpoints that do this instead
        const [publicLog, privateLog] = await Promise.all([
          this.getPublicLogByTag(request.tag, request.contractAddress),
          this.getPrivateLogByTag(await SiloedTag.compute(request.tag, request.contractAddress)),
        ]);

        if (publicLog !== null) {
          if (privateLog !== null) {
            throw new Error(
              `Found both a public and private log when searching for tag ${request.tag} from contract ${request.contractAddress}`,
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

  // TODO(F-231): delete this function and implement this behavior in the node instead
  public async getPublicLogByTag(tag: Tag, contractAddress: AztecAddress): Promise<PublicLogWithTxData | null> {
    const logs = await this.aztecNode.getPublicLogsByTagsFromContract(contractAddress, [tag]);
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

  // TODO(F-231): delete this function and implement this behavior in the node instead
  public async getPrivateLogByTag(siloedTag: SiloedTag): Promise<PrivateLogWithTxData | null> {
    const logs = await this.aztecNode.getPrivateLogsByTags([siloedTag]);
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

  public async syncTaggedLogs(
    contractAddress: AztecAddress,
    pendingTaggedLogArrayBaseSlot: Fr,
    scopes?: AztecAddress[],
  ) {
    this.log.verbose('Searching for tagged logs', { contract: contractAddress });

    // We only load logs from block up to and including the anchor block number
    const anchorBlockNumber = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

    // Determine recipients: use scopes if provided, otherwise get all accounts
    const recipients = scopes && scopes.length > 0 ? scopes : await this.keyStore.getAccounts();

    // For each recipient, fetch secrets, load logs, and store them.
    // We run these per-recipient tasks in parallel so that logs are loaded for all recipients concurrently.
    await Promise.all(
      recipients.map(async recipient => {
        // Get all secrets for this recipient (one per sender)
        const secrets = await this.#getSecretsForSenders(contractAddress, recipient);

        // Load logs for all sender-recipient pairs in parallel
        const logArrays = await Promise.all(
          secrets.map(secret =>
            loadPrivateLogsForSenderRecipientPair(
              secret,
              contractAddress,
              this.aztecNode,
              this.recipientTaggingDataProvider,
              anchorBlockNumber,
            ),
          ),
        );

        // Flatten all logs from all secrets
        const allLogs = logArrays.flat();

        // Store the logs for this recipient
        if (allLogs.length > 0) {
          await this.#storePendingTaggedLogs(contractAddress, pendingTaggedLogArrayBaseSlot, recipient, allLogs);
        }
      }),
    );
  }

  async #getSecretsForSenders(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
  ): Promise<DirectionalAppTaggingSecret[]> {
    const recipientCompleteAddress = await this.#getCompleteAddress(recipient);
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);

    // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
    // (recipient = us, sender = us)
    const allSenders = [...(await this.senderAddressBook.getSenders()), ...(await this.keyStore.getAccounts())];

    // We deduplicate the senders by adding them to a set and then converting the set back to an array
    const deduplicatedSenders = Array.from(new Set(allSenders.map(sender => sender.toString()))).map(sender =>
      AztecAddress.fromString(sender),
    );

    return Promise.all(
      deduplicatedSenders.map(sender => {
        return DirectionalAppTaggingSecret.compute(
          recipientCompleteAddress,
          recipientIvsk,
          sender,
          contractAddress,
          recipient,
        );
      }),
    );
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
