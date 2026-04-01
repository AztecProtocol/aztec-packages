import type { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  ExtendedDirectionalAppTaggingSecret,
  PendingTaggedLog,
  SiloedTag,
  Tag,
  TxScopedL2Log,
} from '@aztec/stdlib/logs';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../contract_function_simulator/noir-structs/log_retrieval_response.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import type { CapsuleService } from '../storage/capsule_store/capsule_service.js';
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
    private readonly capsuleService: CapsuleService,
    private readonly recipientTaggingStore: RecipientTaggingStore,
    private readonly senderAddressBookStore: SenderAddressBookStore,
    private readonly addressStore: AddressStore,
    private readonly jobId: string,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('pxe:log_service', bindings);
  }

  public async fetchLogsByTag(
    contractAddress: AztecAddress,
    logRetrievalRequests: LogRetrievalRequest[],
  ): Promise<(LogRetrievalResponse | null)[]> {
    for (const request of logRetrievalRequests) {
      if (!contractAddress.equals(request.contractAddress)) {
        throw new Error(`Got a log retrieval request from ${request.contractAddress}, expected ${contractAddress}`);
      }
    }

    return await Promise.all(
      logRetrievalRequests.map(async request => {
        const [publicLog, privateLog] = await Promise.all([
          this.#getPublicLogByTag(request.tag, request.contractAddress),
          this.#getPrivateLogByTag(await SiloedTag.computeFromTagAndApp(request.tag, request.contractAddress)),
        ]);

        if (publicLog !== null && privateLog !== null) {
          this.log.warn(
            `Found both a public and private log for tag ${request.tag} from contract ${request.contractAddress}. This may indicate a contract bug. Returning the public log.`,
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
      this.log.warn(
        `Expected at most 1 public log for tag ${tag} and contract ${contractAddress.toString()}, got ${logsForTag.length}. This may indicate a contract bug. Returning the first log.`,
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
      this.log.warn(
        `Expected at most 1 private log for tag ${siloedTag}, got ${logsForTag.length}. This may indicate a contract bug. Returning the first log.`,
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

  public async fetchTaggedLogs(
    contractAddress: AztecAddress,
    pendingTaggedLogArrayBaseSlot: Fr,
    recipient: AztecAddress,
  ) {
    this.log.verbose(`Fetching tagged logs for ${contractAddress.toString()}`);

    // We only load logs from block up to and including the anchor block number
    const anchorBlockNumber = this.anchorBlockHeader.getBlockNumber();
    const anchorBlockHash = await this.anchorBlockHeader.hash();

    // Get all secrets for this recipient (one per sender)
    const secrets = await this.#getSecretsForSenders(contractAddress, recipient);

    // Load logs for all sender-recipient pairs in parallel
    const logArrays = await Promise.all(
      secrets.map(secret =>
        loadPrivateLogsForSenderRecipientPair(
          secret,
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

    if (allLogs.length > 0) {
      await this.#storePendingTaggedLogs(contractAddress, pendingTaggedLogArrayBaseSlot, recipient, allLogs);
    }
  }

  async #getSecretsForSenders(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
  ): Promise<ExtendedDirectionalAppTaggingSecret[]> {
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
      deduplicatedSenders.map(async sender => {
        const secret = await ExtendedDirectionalAppTaggingSecret.compute(
          recipientCompleteAddress,
          recipientIvsk,
          sender,
          contractAddress,
          recipient,
        );

        if (!secret) {
          // Note that all senders originate from either the SenderAddressBookStore or the KeyStore.
          // TODO(F-512): make sure we actually prevent registering invalid senders.
          throw new Error(
            `Failed to compute a tagging secret for sender ${sender} - this implies this is an invalid address, which should not happen as they have been previously registered in PXE.`,
          );
        }

        return secret;
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
      );

      return pendingTaggedLog.toFields();
    });

    // TODO: This looks like it could belong more at the oracle interface level
    return this.capsuleService.appendToCapsuleArray(
      contractAddress,
      capsuleArrayBaseSlot,
      pendingTaggedLogs,
      this.jobId,
      recipient,
    );
  }
}
