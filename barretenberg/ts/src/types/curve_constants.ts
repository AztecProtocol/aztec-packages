import { BarretenbergSync } from '../barretenberg/index.js';

/**
 * BN254 curve constants lazily initialized from barretenberg.
 * Provides field moduli and generator points.
 */
export class CurveConstants {
  private static instance: CurveConstants | null = null;

  public readonly bn254FrModulus: bigint;
  public readonly bn254FqModulus: bigint;
  public readonly bn254G1Generator: { x: Uint8Array; y: Uint8Array };
  public readonly bn254G2Generator: { x: Uint8Array; y: Uint8Array };

  private constructor() {
    const api = BarretenbergSync.getSingleton();
    const response = api.bn254GetCurveConstants({ dummy: 0 });

    // Convert moduli from big-endian byte arrays to bigint
    this.bn254FrModulus = this.bytesToBigInt(response.frModulus);
    this.bn254FqModulus = this.bytesToBigInt(response.fqModulus);

    // Store generator points as raw bytes
    this.bn254G1Generator = {
      x: response.g1Generator.x,
      y: response.g1Generator.y,
    };

    this.bn254G2Generator = {
      x: response.g2Generator.x,
      y: response.g2Generator.y,
    };
  }

  private bytesToBigInt(bytes: Uint8Array): bigint {
    let result = 0n;
    for (const byte of bytes) {
      result = (result << 8n) | BigInt(byte);
    }
    return result;
  }

  /**
   * Get the singleton instance of curve constants.
   * Lazily initializes on first access.
   */
  public static getInstance(): CurveConstants {
    if (!CurveConstants.instance) {
      // Ensure barretenberg is initialized
      BarretenbergSync.initSingleton();
      CurveConstants.instance = new CurveConstants();
    }
    return CurveConstants.instance;
  }

  /**
   * Reset the singleton (useful for testing).
   */
  public static reset(): void {
    CurveConstants.instance = null;
  }
}
