import { PRIVATE_LOG_CIPHERTEXT_LEN } from '@aztec/constants';
import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { KeyStore } from '@aztec/key-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockHash, L2TipsProvider } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  AppTaggingSecret,
  type LogResult,
  type PendingTaggedLog,
  SiloedTag,
  computeSharedTaggingSecret,
} from '@aztec/stdlib/logs';
import type { BlockHeader } from '@aztec/stdlib/tx';

import {
  type LogRetrievalRequest,
  LogSource,
} from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import type { LogRetrievalResponse } from '../contract_function_simulator/noir-structs/log_retrieval_response.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import type { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import type { TaggingSecretSourcesStore } from '../storage/tagging_store/tagging_secret_sources_store.js';
import {
  getAllPrivateLogsByTags,
  getAllPublicLogsByTagsFromContract,
  syncTaggedPrivateLogs,
} from '../tagging/index.js';

/** Key used to group requests by their (fromBlock, toBlock) range so each group becomes a single node call. */
type RangeKey = string;
const rangeKey = (fromBlock?: BlockNumber, toBlock?: BlockNumber): RangeKey => `${fromBlock ?? ''}-${toBlock ?? ''}`;

export class LogService {
  private log: Logger;

  constructor(
    private readonly aztecNode: AztecNode,
    private readonly anchorBlockHeader: BlockHeader,
    private readonly l2TipsStore: L2TipsProvider,
    private readonly keyStore: KeyStore,
    private readonly recipientTaggingStore: RecipientTaggingStore,
    private readonly taggingSecretSourcesStore: TaggingSecretSourcesStore,
    private readonly addressStore: AddressStore,
    private readonly jobId: string,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('pxe:log_service', bindings);
  }

  /** Fetches all logs matching each request's tag, returning an array of log arrays (one per request). */
  public async fetchLogsByTag(
    contractAddress: AztecAddress,
    logRetrievalRequests: LogRetrievalRequest[],
  ): Promise<LogRetrievalResponse[][]> {
    for (const request of logRetrievalRequests) {
      if (!contractAddress.equals(request.contractAddress)) {
        throw new Error(`Got a log retrieval request from ${request.contractAddress}, expected ${contractAddress}`);
      }
    }

    if (logRetrievalRequests.length === 0) {
      return [];
    }

    const anchorBlockHash = await this.anchorBlockHeader.hash();

    const [publicLogsPerRequest, privateLogsPerRequest] = await Promise.all([
      this.#fetchPublicLogs(contractAddress, logRetrievalRequests, anchorBlockHash),
      this.#fetchPrivateLogs(logRetrievalRequests, anchorBlockHash),
    ]);

    return logRetrievalRequests.map((_request, i) => [
      ...publicLogsPerRequest[i].map(LogService.#toLogRetrievalResponse),
      ...privateLogsPerRequest[i].map(LogService.#toLogRetrievalResponse),
    ]);
  }

  async #fetchPublicLogs(
    contractAddress: AztecAddress,
    requests: LogRetrievalRequest[],
    anchorBlockHash: BlockHash,
  ): Promise<LogResult[][]> {
    const indices = requests.flatMap((r, i) => (r.source !== LogSource.PRIVATE ? [i] : []));
    if (indices.length === 0) {
      return requests.map(() => []);
    }

    const resultsPerRequest: LogResult[][] = requests.map(() => []);
    const groups = LogService.#groupByRange(indices.map(i => ({ index: i, request: requests[i] })));

    await Promise.all(
      Array.from(groups.values()).map(async group => {
        const tags = group.entries.map(e => e.request.tag);
        const results = await getAllPublicLogsByTagsFromContract(
          this.aztecNode,
          contractAddress,
          tags,
          anchorBlockHash,
          { fromBlock: group.fromBlock, toBlock: group.toBlock, includeEffects: true },
        );
        group.entries.forEach((entry, i) => {
          resultsPerRequest[entry.index] = results[i];
        });
      }),
    );

    return resultsPerRequest;
  }

  async #fetchPrivateLogs(requests: LogRetrievalRequest[], anchorBlockHash: BlockHash): Promise<LogResult[][]> {
    const indices = requests.flatMap((r, i) => (r.source !== LogSource.PUBLIC ? [i] : []));
    if (indices.length === 0) {
      return requests.map(() => []);
    }

    const resultsPerRequest: LogResult[][] = requests.map(() => []);
    const groups = LogService.#groupByRange(indices.map(i => ({ index: i, request: requests[i] })));

    await Promise.all(
      Array.from(groups.values()).map(async group => {
        const siloedTags = await Promise.all(
          group.entries.map(e => SiloedTag.computeFromTagAndApp(e.request.tag, e.request.contractAddress)),
        );
        const results = await getAllPrivateLogsByTags(this.aztecNode, siloedTags, anchorBlockHash, {
          fromBlock: group.fromBlock,
          toBlock: group.toBlock,
          includeEffects: true,
        });
        group.entries.forEach((entry, i) => {
          resultsPerRequest[entry.index] = results[i];
        });
      }),
    );

    return resultsPerRequest;
  }

  /**
   * Groups requests by their (fromBlock, toBlock) range so each distinct range becomes a single node call with
   * the range pushed down into the query (no in-memory filter).
   */
  static #groupByRange(
    entries: Array<{ index: number; request: LogRetrievalRequest }>,
  ): Map<RangeKey, { fromBlock?: BlockNumber; toBlock?: BlockNumber; entries: typeof entries }> {
    const groups = new Map<RangeKey, { fromBlock?: BlockNumber; toBlock?: BlockNumber; entries: typeof entries }>();
    for (const entry of entries) {
      const fromBlock = entry.request.fromBlock.value;
      const toBlock = entry.request.toBlock.value;
      const key = rangeKey(fromBlock, toBlock);
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(entry);
      } else {
        groups.set(key, { fromBlock, toBlock, entries: [entry] });
      }
    }
    return groups;
  }

  static #toLogRetrievalResponse(log: LogResult): LogRetrievalResponse {
    // includeEffects: true was used, so noteHashes and nullifiers are populated. Every tx has at least one nullifier
    // (the first nullifier derived from the tx hash); empty here would indicate a buggy node.
    const noteHashes = log.noteHashes!;
    const nullifiers = log.nullifiers!;
    if (nullifiers.length === 0) {
      throw new Error(`Log for tx ${log.txHash} returned no nullifiers from the node`);
    }
    return {
      // Skip the tag, and clip to the wire cap: public logs can exceed PRIVATE_LOG_CIPHERTEXT_LEN, which is the fixed
      // size of the oracle's BoundedVec slot. A no-op for private logs, which are already within the cap.
      logPayload: log.logData.slice(1, 1 + PRIVATE_LOG_CIPHERTEXT_LEN),
      txHash: log.txHash,
      uniqueNoteHashesInTx: noteHashes,
      firstNullifierInTx: nullifiers[0],
    };
  }

  public async fetchTaggedLogs(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    providedSecrets: AppTaggingSecret[],
  ): Promise<PendingTaggedLog[]> {
    this.log.verbose(
      `Fetching tagged logs for contract ${contractAddress.toString()} and recipient ${recipient.toString()}`,
    );

    const l2Tips = await this.l2TipsStore.getL2Tips();

    // Secrets PXE can enumerate for this recipient (senders via ECDH + pre-shared store secrets), plus any the app
    // supplies explicitly for secrets PXE cannot enumerate itself (e.g. handshake-derived ones). The latter arrive
    // already computed and are searched even when the recipient's account is unknown locally, since they need no ECDH.
    const combinedSecrets = [...(await this.#getPointDerivedSecrets(contractAddress, recipient)), ...providedSecrets];

    // These sources can overlap (a sender that is also a PXE account, or a pre-shared secret that coincides with a
    // sender-derived one), so we deduplicate the combined set.
    const secrets = Array.from(new Map(combinedSecrets.map(secret => [secret.toString(), secret])).values());

    const logs = await syncTaggedPrivateLogs(
      secrets,
      this.aztecNode,
      this.recipientTaggingStore,
      this.anchorBlockHeader,
      l2Tips.finalized.block.number,
      this.jobId,
    );

    return logs.map(log => {
      const noteHashes = log.noteHashes!;
      const nullifiers = log.nullifiers!;
      if (nullifiers.length === 0) {
        throw new Error(`Log for tx ${log.txHash} returned no nullifiers from the node`);
      }
      return {
        log: log.logData,
        context: { txHash: log.txHash, uniqueNoteHashesInTx: noteHashes, firstNullifierInTx: nullifiers[0] },
      };
    });
  }

  /**
   * Computes the tagging secrets PXE can enumerate for a recipient: one per known sender (via ECDH) plus any
   * pre-shared secret points registered directly for the recipient, each siloed to `contractAddress` and directed to
   * `recipient`. These require knowing the recipient's address preimage and keys, so returns an empty array when those
   * are unavailable. App-supplied secrets (e.g. handshake-derived) are handled separately by the caller and do not go
   * through here.
   */
  async #getPointDerivedSecrets(contractAddress: AztecAddress, recipient: AztecAddress): Promise<AppTaggingSecret[]> {
    const recipientCompleteAddress = await this.addressStore.getCompleteAddress(recipient);
    if (!recipientCompleteAddress || !(await this.keyStore.hasAccount(recipient))) {
      this.log.warn(
        `Skipping sender-derived tag retrieval for ${recipient.toString()} due to unknown address preimage`,
      );
      return [];
    }
    const recipientIvsk = await this.keyStore.getMasterIncomingViewingSecretKey(recipient);

    const points = [
      ...(await this.#getSecretsForSenders(recipientCompleteAddress, recipientIvsk)),
      ...(await this.taggingSecretSourcesStore.getSharedSecretsForRecipient(recipient)),
    ];
    return Promise.all(points.map(secret => AppTaggingSecret.computeDirectional(secret, contractAddress, recipient)));
  }

  async #getSecretsForSenders(
    recipientCompleteAddress: CompleteAddress,
    recipientIvsk: GrumpkinScalar,
  ): Promise<Point[]> {
    // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
    // (recipient = us, sender = us).
    const allSenders = [...(await this.taggingSecretSourcesStore.getSenders()), ...(await this.keyStore.getAccounts())];

    return Promise.all(
      allSenders.map(async sender => {
        const taggingSecretPoint = await computeSharedTaggingSecret(recipientCompleteAddress, recipientIvsk, sender);

        if (!taggingSecretPoint) {
          // Note that all senders originate from either the TaggingSecretSourcesStore or the KeyStore.
          throw new Error(
            `Failed to compute a tagging secret for sender ${sender} - this implies this is an invalid address, which should not happen as they have been previously registered in PXE.`,
          );
        }

        return taggingSecretPoint;
      }),
    );
  }
}
