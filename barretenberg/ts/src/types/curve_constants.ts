/**
 * Re-export generated curve constants for all curves.
 * These constants are generated at build time from barretenberg native binary.
 *
 * @deprecated This file exists for backward compatibility.
 * Import directly from '../cbind/generated/curve_constants.js' instead.
 */

export {
  BN254_FR_MODULUS,
  BN254_FQ_MODULUS,
  BN254_G1_GENERATOR,
  BN254_G2_GENERATOR,
  GRUMPKIN_FR_MODULUS,
  GRUMPKIN_FQ_MODULUS,
  GRUMPKIN_G1_GENERATOR,
  SECP256K1_FR_MODULUS,
  SECP256K1_FQ_MODULUS,
  SECP256K1_G1_GENERATOR,
  SECP256R1_FR_MODULUS,
  SECP256R1_FQ_MODULUS,
  SECP256R1_G1_GENERATOR,
} from '../cbind/generated/curve_constants.js';

/**
 * Legacy class for backward compatibility
 * @deprecated Use direct imports from curve_constants instead
 */
export class CurveConstants {
  private static instance: CurveConstants | null = null;

  public readonly bn254FrModulus: bigint;
  public readonly bn254FqModulus: bigint;
  public readonly bn254G1Generator: { x: Uint8Array; y: Uint8Array };
  public readonly bn254G2Generator: { x: Uint8Array; y: Uint8Array };

  private constructor() {
    const {
      BN254_FR_MODULUS,
      BN254_FQ_MODULUS,
      BN254_G1_GENERATOR,
      BN254_G2_GENERATOR,
    } = require('../cbind/generated/curve_constants.js');

    this.bn254FrModulus = BN254_FR_MODULUS;
    this.bn254FqModulus = BN254_FQ_MODULUS;
    this.bn254G1Generator = BN254_G1_GENERATOR;
    this.bn254G2Generator = BN254_G2_GENERATOR;
  }

  /**
   * Get the singleton instance of curve constants.
   * @deprecated Use direct imports from curve_constants instead
   */
  public static getInstance(): CurveConstants {
    if (!CurveConstants.instance) {
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
