import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  ExtendedDirectionalAppTaggingSecret,
  PendingTaggedLog,
  SiloedTag,
  type TxScopedL2Log,
} from '@aztec/stdlib/logs';
import type { BlockHeader } from '@aztec/stdlib/tx';

import type { LogRetrievalRequest } from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../contract_function_simulator/noir-structs/log_retrieval_response.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import type { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../storage/tagging_store/sender_address_book_store.js';
import {
  getAllPrivateLogsByTags,
  getAllPublicLogsByTagsFromContract,
  syncTaggedPrivateLogs,
} from '../tagging/index.js';

export class LogService {
  private log: Logger;

  constructor(
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockHeader: BlockHeader,
    private readonly l2TipsStore: L2TipsProvider,
    private readonly keyStore: KeyStore,
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

    if (logRetrievalRequests.length === 0) {
      return [];
    }

    const anchorBlockHash = await this.anchorBlockHeader.hash();
    const tags = logRetrievalRequests.map(r => r.tag);
    const siloedTags = await Promise.all(
      logRetrievalRequests.map(r => SiloedTag.computeFromTagAndApp(r.tag, r.contractAddress)),
    );

    const [allPublicLogsPerTag, allPrivateLogsPerTag] = await Promise.all([
      getAllPublicLogsByTagsFromContract(this.aztecNode, contractAddress, tags, anchorBlockHash),
      getAllPrivateLogsByTags(this.aztecNode, siloedTags, anchorBlockHash),
    ]);

    return logRetrievalRequests.map((request, i) => {
      const publicLog = this.#extractSingleLog(
        allPublicLogsPerTag[i],
        `public log for tag ${request.tag} and contract ${request.contractAddress.toString()}`,
      );
      const privateLog = this.#extractSingleLog(allPrivateLogsPerTag[i], `private log for tag ${siloedTags[i]}`);

      if (publicLog !== null && privateLog !== null) {
        this.log.warn(
          `Found both a public and private log for tag ${request.tag} from contract ${request.contractAddress}. This may indicate a contract bug. Returning the public log.`,
        );
      }

      return publicLog ?? privateLog;
    });
  }

  #extractSingleLog(logsForTag: TxScopedL2Log[], description: string): LogRetrievalResponse | null {
    if (logsForTag.length === 0) {
      return null;
    }

    if (logsForTag.length > 1) {
      this.log.warn(
        `Expected at most 1 ${description}, got ${logsForTag.length}. This may indicate a contract bug. Returning the first log.`,
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

  public async fetchTaggedLogs(contractAddress: AztecAddress, recipient: AztecAddress): Promise<PendingTaggedLog[]> {
    this.log.verbose(`Fetching tagged logs for ${contractAddress.toString()}`);

    const l2Tips = await this.l2TipsStore.getL2Tips();
    // Get all secrets for this recipient (one per sender)
    const secrets = await this.#getSecretsForSenders(contractAddress, recipient);

    const logs = await syncTaggedPrivateLogs(
      secrets,
      this.aztecNode,
      this.recipientTaggingStore,
      this.anchorBlockHeader,
      l2Tips.finalized.block.number,
      this.jobId,
    );

    return logs.map(
      scopedLog =>
        new PendingTaggedLog(scopedLog.logData, scopedLog.txHash, scopedLog.noteHashes, scopedLog.firstNullifier),
    );
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
          throw new Error(
            `Failed to compute a tagging secret for sender ${sender} - this implies this is an invalid address, which should not happen as they have been previously registered in PXE.`,
          );
        }

        return secret;
      }),
    );
  }
}
