import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { DirectionalAppTaggingSecret, PendingTaggedLog, SiloedTag, Tag, TxScopedL2Log } from '@aztec/stdlib/logs';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { AccessScopes } from '../access_scopes.js';
import type { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../contract_function_simulator/noir-structs/log_retrieval_response.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import { CapsuleStore } from '../storage/capsule_store/capsule_store.js';
import type { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../storage/tagging_store/sender_address_book_store.js';
import {
  getAllPrivateLogsByTags,
  getAllPublicLogsByTagsFromContract,
  loadPrivateLogsForSenderRecipientPair,
} from '../tagging/index.js';

export class LogService {
  private log: Logger;

  constructor(
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockHeader: BlockHeader,
    private readonly keyStore: KeyStore,
    private readonly capsuleStore: CapsuleStore,
    private readonly recipientTaggingStore: RecipientTaggingStore,
    private readonly senderAddressBookStore: SenderAddressBookStore,
    private readonly addressStore: AddressStore,
    private readonly jobId: string,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('pxe:log_service', bindings);
  }

  public async bulkRetrieveLogs(logRetrievalRequests: LogRetrievalRequest[]): Promise<(LogRetrievalResponse | null)[]> {
    return await Promise.all(
      logRetrievalRequests.map(async request => {
        const [publicLog, privateLog] = await Promise.all([
          this.#getPublicLogByTag(request.tag, request.contractAddress),
          this.#getPrivateLogByTag(await SiloedTag.compute(request.tag, request.contractAddress)),
        ]);

        if (publicLog !== null && privateLog !== null) {
          throw new Error(
            `Found both a public and private log when searching for tag ${request.tag} from contract ${request.contractAddress}`,
          );
        }

        return publicLog ?? privateLog;
      }),
    );
  }

  async #getPublicLogByTag(tag: Tag, contractAddress: AztecAddress): Promise<LogRetrievalResponse | null> {
    const anchorBlockHash = await this.anchorBlockHeader.hash();
    const allLogsPerTag = await getAllPublicLogsByTagsFromContract(
      this.aztecNode,
      contractAddress,
      [tag],
      anchorBlockHash,
    );
    const logsForTag = allLogsPerTag[0];

    if (logsForTag.length === 0) {
      return null;
    } else if (logsForTag.length > 1) {
      // TODO(#11627): handle this case
      throw new Error(
        `Got ${logsForTag.length} logs for tag ${tag} and contract ${contractAddress.toString()}. getPublicLogByTag currently only supports a single log per tag`,
      );
    }

    const scopedLog = logsForTag[0];

    return new LogRetrievalResponse(
      scopedLog.logData.slice(1), // Skip the tag
      scopedLog.txHash,
      scopedLog.noteHashes,
      scopedLog.firstNullifier,
    );
  }

  async #getPrivateLogByTag(siloedTag: SiloedTag): Promise<LogRetrievalResponse | null> {
    const anchorBlockHash = await this.anchorBlockHeader.hash();
    const allLogsPerTag = await getAllPrivateLogsByTags(this.aztecNode, [siloedTag], anchorBlockHash);
    const logsForTag = allLogsPerTag[0];

    if (logsForTag.length === 0) {
      return null;
    } else if (logsForTag.length > 1) {
      // TODO(#11627): handle this case
      throw new Error(
        `Got ${logsForTag.length} logs for tag ${siloedTag}. getPrivateLogByTag currently only supports a single log per tag`,
      );
    }

    const scopedLog = logsForTag[0];

    return new LogRetrievalResponse(
      scopedLog.logData.slice(1), // Skip the tag
      scopedLog.txHash,
      scopedLog.noteHashes,
      scopedLog.firstNullifier,
    );
  }

  public async fetchTaggedLogs(contractAddress: AztecAddress, pendingTaggedLogArrayBaseSlot: Fr, scopes: AccessScopes) {
    this.log.verbose(`Fetching tagged logs for ${contractAddress.toString()}`);

    // We only load logs from block up to and including the anchor block number
    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();
    const anchorBlockHash = await this.anchorBlockHeader.hash();

    // Determine recipients: use scopes if provided, otherwise get all accounts
    const recipients = scopes !== 'ALL_SCOPES' && scopes.length > 0 ? scopes : await this.keyStore.getAccounts();

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
              this.recipientTaggingStore,
              anchorBlockNumber,
              anchorBlockHash,
              this.jobId,
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
    const recipientCompleteAddress = await this.addressStore.getCompleteAddress(recipient);
    if (!recipientCompleteAddress) {
      return [];
    }
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);

    // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
    // (recipient = us, sender = us)
    const allSenders = [...(await this.senderAddressBookStore.getSenders()), ...(await this.keyStore.getAccounts())];

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

  #storePendingTaggedLogs(
    contractAddress: AztecAddress,
    capsuleArrayBaseSlot: Fr,
    recipient: AztecAddress,
    privateLogs: TxScopedL2Log[],
  ) {
    // Build all pending tagged logs from the scoped logs
    const pendingTaggedLogs = privateLogs.map(scopedLog => {
      const pendingTaggedLog = new PendingTaggedLog(
        scopedLog.logData,
        scopedLog.txHash,
        scopedLog.noteHashes,
        scopedLog.firstNullifier,
        recipient,
      );

      return pendingTaggedLog.toFields();
    });

    // TODO: This looks like it could belong more at the oracle interface level
    return this.capsuleStore.appendToCapsuleArray(contractAddress, capsuleArrayBaseSlot, pendingTaggedLogs, this.jobId);
  }
}
