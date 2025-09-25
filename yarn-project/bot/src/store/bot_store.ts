import type { AztecAddress, L2AmountClaim } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';

export interface BridgeClaimData {
  claim: L2AmountClaim;
  timestamp: number;
  recipient: string;
}

/**
 * Simple data store for the bot to persist L1 bridge claims.
 */
export class BotStore {
  public static readonly SCHEMA_VERSION = 1;
  private readonly bridgeClaims: AztecAsyncMap<string, string>;

  constructor(
    private readonly store: AztecAsyncKVStore,
    private readonly log: Logger = createLogger('bot:store'),
  ) {
    this.bridgeClaims = store.openMap<string, string>('bridge_claims');
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
      timestamp: Date.now(),
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
    const now = Date.now();
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

  /**
   * Closes the store.
   */
  public async close(): Promise<void> {
    await this.store.close();
    this.log.info('Closed bot data store');
  }
}
