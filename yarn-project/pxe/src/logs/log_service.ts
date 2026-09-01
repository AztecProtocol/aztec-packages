import type { BlockNumber } from '@aztec/foundation/branded-types';
import type { Fr } from '@aztec/foundation/curves/bn254';
import type { GrumpkinScalar, Point } from '@aztec/foundation/curves/grumpkin';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { allToCompletion } from '@aztec/foundation/promise';
import type { KeyStore } from '@aztec/key-store';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2TipsProvider } from '@aztec/stdlib/block';
import type { CompleteAddress } from '@aztec/stdlib/contract';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import {
  AppTaggingSecret,
  AppTaggingSecretKind,
  type LogResult,
  SiloedTag,
  computeSharedTaggingSecret,
} from '@aztec/stdlib/logs';
import type { BlockHeader } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import {
  type LogRetrievalRequest,
  LogSource,
} from '../contract_function_simulator/noir-structs/log_retrieval_request.js';
import type { TxOnchainContext } from '../messages/tx_resolver_service.js';
import { AddressStore } from '../storage/address_store/address_store.js';
import { assertAllowedScope } from '../storage/allowed_scopes.js';
import type { ChangeSetId } from '../storage/staged_write_coordinator.js';
import type { RecipientTaggingStore } from '../storage/tagging_store/recipient_tagging_store.js';
import type { TaggingSecretSourcesStore } from '../storage/tagging_store/tagging_secret_sources_store.js';
import {
  type LogQueryAnchor,
  getAllPrivateLogsByTags,
  getAllPublicLogsByTagsFromContract,
  logQueryAnchorOf,
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
    private readonly scopes: AztecAddress[],
    private readonly changeSetId: ChangeSetId,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('pxe:log_service', bindings);
  }

  /** Fetches all logs matching each request's tag, returning an array of log arrays (one per request). */
  public async fetchLogsByTag(
    contractAddress: AztecAddress,
    logRetrievalRequests: LogRetrievalRequest[],
  ): Promise<RetrievedTaggedLog[][]> {
    for (const request of logRetrievalRequests) {
      if (!contractAddress.equals(request.contractAddress)) {
        throw new Error(`Got a log retrieval request from ${request.contractAddress}, expected ${contractAddress}`);
      }
    }

    if (logRetrievalRequests.length === 0) {
      return [];
    }

    const anchor = await logQueryAnchorOf(this.anchorBlockHeader);

    const [publicLogsPerRequest, privateLogsPerRequest] = await allToCompletion([
      this.#fetchPublicLogs(contractAddress, logRetrievalRequests, anchor),
      this.#fetchPrivateLogs(logRetrievalRequests, anchor),
    ]);

    return logRetrievalRequests.map((_request, i) => [
      ...publicLogsPerRequest[i].map(LogService.#toRetrievedTaggedLog),
      ...privateLogsPerRequest[i].map(LogService.#toRetrievedTaggedLog),
    ]);
  }

  async #fetchPublicLogs(
    contractAddress: AztecAddress,
    requests: LogRetrievalRequest[],
    anchor: LogQueryAnchor,
  ): Promise<LogResult[][]> {
    const indices = requests.flatMap((r, i) => (r.source !== LogSource.PRIVATE ? [i] : []));
    if (indices.length === 0) {
      return requests.map(() => []);
    }

    const resultsPerRequest: LogResult[][] = requests.map(() => []);
    const groups = LogService.#groupByRange(indices.map(i => ({ index: i, request: requests[i] })));

    await allToCompletion(
      Array.from(groups.values()).map(async group => {
        const tags = group.entries.map(e => e.request.tag);
        const results = await getAllPublicLogsByTagsFromContract(this.aztecNode, contractAddress, tags, anchor, {
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

  async #fetchPrivateLogs(requests: LogRetrievalRequest[], anchor: LogQueryAnchor): Promise<LogResult[][]> {
    const indices = requests.flatMap((r, i) => (r.source !== LogSource.PUBLIC ? [i] : []));
    if (indices.length === 0) {
      return requests.map(() => []);
    }

    const resultsPerRequest: LogResult[][] = requests.map(() => []);
    const groups = LogService.#groupByRange(indices.map(i => ({ index: i, request: requests[i] })));

    await allToCompletion(
      Array.from(groups.values()).map(async group => {
        const siloedTags = await allToCompletion(
          group.entries.map(e => SiloedTag.computeFromTagAndApp(e.request.tag, e.request.contractAddress)),
        );
        const results = await getAllPrivateLogsByTags(this.aztecNode, siloedTags, anchor, {
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

  static #toRetrievedTaggedLog(log: LogResult): RetrievedTaggedLog {
    // includeEffects: true was used, so noteHashes and nullifiers are populated. Every tx has at least one nullifier
    // (the first nullifier derived from the tx hash); empty here would indicate a buggy node.
    const noteHashes = log.noteHashes!;
    const nullifiers = log.nullifiers!;
    if (nullifiers.length === 0) {
      throw new Error(`Log for tx ${log.txHash} returned no nullifiers from the node`);
    }
    return {
      logData: log.logData,
      txHash: log.txHash,
      noteHashes,
      nullifiers,
      blockNumber: log.blockNumber,
      blockTimestamp: log.blockTimestamp,
      blockHash: log.blockHash,
      // The log index and the tx receipt both count the tx's position in `block.body.txEffects`, so this is the same
      // index a receipt reports. Note ordering depends on the two staying in agreement.
      txIndexInBlock: log.txIndexWithinBlock,
    };
  }

  /** Fetches the pending tagged logs for a recipient across all its tagging secrets for the contract. */
  public async fetchTaggedLogs(
    contractAddress: AztecAddress,
    recipient: AztecAddress,
    providedSecrets: AppTaggingSecret[],
  ): Promise<RetrievedTaggedLog[]> {
    assertAllowedScope(recipient, this.scopes);

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
      this.changeSetId,
    );

    return logs.map(log => LogService.#toRetrievedTaggedLog(log));
  }

  /**
   * Computes the tagging secrets PXE can enumerate for a recipient: one per known sender (via ECDH) plus any
   * pre-shared secrets registered directly for the recipient. Each registered secret is scanned under the tag
   * streams its kind can back. Deriving the sender-based secrets requires the recipient's address preimage and keys,
   * so returns an empty array when those are unavailable. App-supplied secrets (e.g. derived from discovered
   * handshakes) are handled separately by the caller and do not go through here.
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

    const [senderPoints, registeredSecrets] = await allToCompletion([
      this.#getSecretsForSenders(recipientCompleteAddress, recipientIvsk),
      this.taggingSecretSourcesStore.getSharedSecretsForRecipient(recipient),
    ]);
    return allToCompletion([
      ...senderPoints.map(secret => AppTaggingSecret.computeDirectional(secret, contractAddress, recipient)),
      ...registeredSecrets.flatMap(({ kind, secret }) => {
        switch (kind) {
          case 'arbitrary-secret':
            return [AppTaggingSecret.computeDirectional(secret, contractAddress, recipient)];
          case 'handshake':
            // A handshake-backed sender tags messages with the bare app-siloed secret, one tag domain per delivery
            // mode.
            return [
              AppTaggingSecret.computeAppSiloed(secret, contractAddress, AppTaggingSecretKind.UNCONSTRAINED),
              AppTaggingSecret.computeAppSiloed(secret, contractAddress, AppTaggingSecretKind.CONSTRAINED),
            ];
        }
      }),
    ]);
  }

  async #getSecretsForSenders(
    recipientCompleteAddress: CompleteAddress,
    recipientIvsk: GrumpkinScalar,
  ): Promise<Point[]> {
    // We implicitly add all PXE accounts as senders, this helps us decrypt tags on notes that we send to ourselves
    // (recipient = us, sender = us).
    const allSenders = [...(await this.taggingSecretSourcesStore.getSenders()), ...(await this.keyStore.getAccounts())];

    return allToCompletion(
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

/** A tagged log fetched from the node, together with the onchain context of the tx that emitted it. */
export type RetrievedTaggedLog = TxOnchainContext & {
  /** The raw log payload, tag included. */
  logData: Fr[];
  blockTimestamp: UInt64;
};
