import { AztecAddress } from '@aztec/aztec.js/addresses';
import type { L2AmountClaim } from '@aztec/aztec.js/ethereum';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

export interface BridgeClaimData {
  claim: L2AmountClaim;
  timestamp: number;
  recipient: string;
}

export interface PendingL1ToL2Message {
  /** Random public content hash sent in the message. */
  publicContentHash: string;
  /** Secret for consuming the message; it forms the message's private content. */
  secret: string;
  /** The message's private content hash (hash of the claim secret). */
  privateContentHash: string;
  /** Hash of the L1→L2 message. */
  msgHash: string;
  /** L1 sender address (hex). */
  sender: string;
  /** Global leaf index in the L1→L2 message tree. */
  globalLeafIndex: string;
  /** Timestamp when the message was seeded. */
  timestamp: number;
}

/**
 * Simple data store for the bot to persist L1 bridge claims.
 */
export class BotStore {
  public static readonly SCHEMA_VERSION = 2;
  private readonly bridgeClaims: AztecAsyncMap<string, string>;
  private readonly pendingL1ToL2: AztecAsyncMap<string, string>;

  constructor(
    private readonly store: AztecAsyncKVStore,
    private readonly log: Logger = createLogger('bot:store'),
    private readonly dateProvider: DateProvider = new DateProvider(),
  ) {
    this.bridgeClaims = store.openMap<string, string>('bridge_claims');
    this.pendingL1ToL2 = store.openMap<string, string>('pending_l1_to_l2');
  }

  /**
   * Saves a bridge claim for a recipient.
   */
  public async saveBridgeClaim(recipient: AztecAddress, claim: L2AmountClaim): Promise<void> {
    // Convert Fr fields and BigInts to strings for JSON serialization
    const serializableClaim = {
      claimAmount: claim.claimAmount.toString(),
      claimSecret: claim.claimSecret.toString(),
      claimSecretHash: claim.claimSecretHash.toString(),
      messageHash: claim.messageHash,
      messageLeafIndex: claim.messageLeafIndex.toString(),
    };

    const data = {
      claim: serializableClaim,
      timestamp: this.dateProvider.now(),
      recipient: recipient.toString(),
    };

    await this.bridgeClaims.set(recipient.toString(), JSON.stringify(data));
    this.log.info(`Saved bridge claim for ${recipient.toString()}`);
  }

  /**
   * Gets a bridge claim for a recipient if it exists.
   */
  public async getBridgeClaim(recipient: AztecAddress): Promise<BridgeClaimData | undefined> {
    const data = await this.bridgeClaims.getAsync(recipient.toString());
    if (!data) {
      return undefined;
    }

    const parsed = JSON.parse(data);

    // Reconstruct L2AmountClaim from serialized data
    const claim: L2AmountClaim = {
      claimAmount: BigInt(parsed.claim.claimAmount),
      claimSecret: Fr.fromString(parsed.claim.claimSecret),
      claimSecretHash: Fr.fromString(parsed.claim.claimSecretHash),
      messageHash: parsed.claim.messageHash,
      messageLeafIndex: BigInt(parsed.claim.messageLeafIndex),
    };

    return {
      claim,
      timestamp: parsed.timestamp,
      recipient: parsed.recipient,
    };
  }

  /**
   * Deletes a bridge claim for a recipient.
   */
  public async deleteBridgeClaim(recipient: AztecAddress): Promise<void> {
    await this.bridgeClaims.delete(recipient.toString());
    this.log.info(`Deleted bridge claim for ${recipient.toString()}`);
  }

  /**
   * Gets all stored bridge claims.
   */
  public async getAllBridgeClaims(): Promise<BridgeClaimData[]> {
    const claims: BridgeClaimData[] = [];
    const entries = this.bridgeClaims.entriesAsync();

    for await (const [_, data] of entries) {
      const parsed = JSON.parse(data);

      // Reconstruct L2AmountClaim from serialized data
      const claim: L2AmountClaim = {
        claimAmount: BigInt(parsed.claim.claimAmount),
        claimSecret: Fr.fromString(parsed.claim.claimSecret),
        claimSecretHash: Fr.fromString(parsed.claim.claimSecretHash),
        messageHash: parsed.claim.messageHash,
        messageLeafIndex: BigInt(parsed.claim.messageLeafIndex),
      };

      claims.push({
        claim,
        timestamp: parsed.timestamp,
        recipient: parsed.recipient,
      });
    }

    return claims;
  }

  /**
   * Cleans up old bridge claims (older than 24 hours).
   */
  public async cleanupOldClaims(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = this.dateProvider.now();
    let cleanedCount = 0;
    const entries = this.bridgeClaims.entriesAsync();

    for await (const [key, data] of entries) {
      const parsed = JSON.parse(data);
      if (now - parsed.timestamp > maxAgeMs) {
        await this.bridgeClaims.delete(key);
        cleanedCount++;
        this.log.info(`Cleaned up old bridge claim for ${parsed.recipient}`);
      }
    }

    return cleanedCount;
  }

  /** Saves a pending L1→L2 message keyed by msgHash. */
  public async savePendingL1ToL2Message(msg: PendingL1ToL2Message): Promise<void> {
    await this.pendingL1ToL2.set(msg.msgHash, JSON.stringify(msg));
    this.log.info(`Saved pending L1→L2 message ${msg.msgHash}`);
  }

  /** Returns all unconsumed pending L1→L2 messages. */
  public async getUnconsumedL1ToL2Messages(): Promise<PendingL1ToL2Message[]> {
    const messages: PendingL1ToL2Message[] = [];
    for await (const [_, data] of this.pendingL1ToL2.entriesAsync()) {
      messages.push(JSON.parse(data));
    }
    return messages;
  }

  /** Deletes a consumed L1→L2 message from the store. */
  public async deleteL1ToL2Message(msgHash: string): Promise<void> {
    await this.pendingL1ToL2.delete(msgHash);
    this.log.info(`Deleted consumed L1→L2 message ${msgHash}`);
  }

  /** Cleans up pending L1→L2 messages older than maxAgeMs. */
  public async cleanupOldPendingMessages(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const now = this.dateProvider.now();
    let cleanedCount = 0;
    for await (const [key, data] of this.pendingL1ToL2.entriesAsync()) {
      const parsed = JSON.parse(data);
      if (now - parsed.timestamp > maxAgeMs) {
        await this.pendingL1ToL2.delete(key);
        cleanedCount++;
        this.log.info(`Cleaned up old pending L1→L2 message ${key}`);
      }
    }
    return cleanedCount;
  }

  /** Closes the store. */
  public async close(): Promise<void> {
    await this.store.close();
    this.log.info('Closed bot data store');
  }
}
