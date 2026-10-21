use bignum::BigNum;

/// CurveJ represents a Short Weierstrass elliptic curve using Jacobian coordinates.
///
/// # Representation
/// - **Jacobian form:** (X, Y, Z)
/// - **Affine form:** (x, y)
/// - **Relation:** x = X / Z^2, y = Y / Z^3
///
/// # Purpose
/// This class is designed to speed up witness generation when optimally constraining elliptic curve operations.
///
/// # Motivation
/// - Constraints are best constructed in affine coordinates due to fewer field multiplications (3 vs ~14 for Jacobian).
/// - However, affine coordinates require one modular inverse per group operation, which is expensive over a non-native field (~2D multiplications, where D is the field bit-width).
///
/// # Solution
/// - Perform all computations in unconstrained functions using Jacobian coordinates (no inverses required).
/// - Record each ECC operation in a `JTranscript` object.
/// - Use a Montgomery Batch Inverse to compute all required inverses at once when evaluating with affine arithmetic.
/// - This reduces the number of modular inverses from ~256 or 320 (depending on the curve) to just one.
///
/// # Note
/// This approach is complex but necessary due to the high cost of generating modular inverses for witness generation.
pub struct CurveJ<BN, BigCurve> {
    pub(crate) x: BN,
    pub(crate) y: BN,
    pub(crate) z: BN,
    pub is_infinity: bool,
}

/// A transcript of a group operation in Jacobian coordinates.
///
/// # Fields
/// - `x3`, `y3`, `z3`: The output coordinates of the group operation in Jacobian form.
/// - `lambda_numerator`: The numerator of the `lambda` term used in the group operation.
///   (The denominator is assumed to be `z3`.)
pub struct JTranscript<BN> {
    pub(crate) lambda_numerator: BN,
    pub(crate) x3: BN,
    pub(crate) y3: BN,
    pub(crate) z3: BN,
}

impl<BN> JTranscript<BN>
where
    BN: BigNum,
{
    pub unconstrained fn new() -> Self {
        JTranscript { lambda_numerator: BN::zero(), x3: BN::zero(), y3: BN::zero(), z3: BN::zero() }
    }
}

/// A transcript of a group operation in Affine coordinates.
///
/// # Fields
/// - `x3`, `y3`: The output coordinates of the group operation.
/// - `lambda`: The gradient of the line that passes through the input points of the group operation.
///
/// # Details
/// - For addition: `lambda = (y2 - y1) / (x2 - x1)`
/// - For doubling: `lambda = (3 * x1 * x1) / (2 * y1)`
///
/// # Optimization
/// If you have an array of `JTranscript` objects, you can convert them into `AffineTranscript` objects using only one modular inverse.
pub struct AffineTranscript<BN> {
    pub lambda: BN,
    pub x3: BN,
    pub y3: BN,
}

impl<BN> AffineTranscript<BN>
where
    BN: BigNum,
{
    pub(crate) fn new() -> Self {
        AffineTranscript { lambda: BN::zero(), x3: BN::zero(), y3: BN::zero() }
    }

    /// Convert a single `JTranscript` to `AffineTranscript` (unconstrained)
    ///
    /// Convenience wrapper around `from_jacobian_transcript` for a single entry.
    pub unconstrained fn from_j(j_tx: JTranscript<BN>) -> Self {
        AffineTranscript::from_jacobian_transcript([j_tx])[0]
    }

    /// Convert a `JTranscript` to `AffineTranscript` given a precomputed `Z3^-1` (unconstrained)
    ///
    /// Applies the Jacobian-to-affine conversion:
    ///
    ///     lambda = lambda_numerator * z_inv
    ///     x3     = X3 * z_inv^2
    ///     y3     = Y3 * z_inv^3
    pub unconstrained fn from_j_with_hint(
        j_tx: JTranscript<BN>,
        inverse: BN,
    ) -> AffineTranscript<BN> {
        let z_inv = inverse;
        let zz = z_inv.__mul(z_inv);
        let zzz = zz.__mul(z_inv);
        let lambda = j_tx.lambda_numerator.__mul(z_inv);
        let x3 = j_tx.x3.__mul(zz);
        let y3 = j_tx.y3.__mul(zzz);
        AffineTranscript { x3, y3, lambda }
    }

    /// Batch-convert an array of `JTranscript` to `AffineTranscript` (unconstrained)
    ///
    /// ## Algorithm
    ///
    /// Uses Montgomery's batch inversion trick to compute all `Z3^-1` values
    /// with a single modular inverse, then converts each entry to affine:
    /// `lambda = lambda_numerator / Z3`, `x3 = X3 / Z3^2`, `y3 = Y3 / Z3^3`.
    pub(crate) unconstrained fn from_jacobian_transcript<let NumEntries: u32>(
        j_tx: [JTranscript<BN>; NumEntries],
    ) -> [AffineTranscript<BN>; NumEntries] {
        let mut result: [AffineTranscript<BN>; NumEntries] = [AffineTranscript::new(); NumEntries];

        let mut inverses: [BN; NumEntries] = [BN::zero(); NumEntries];
        for i in 0..j_tx.len() {
            inverses[i] = j_tx[i].z3;
        }

        // Montgomery batch inversion: one modular inverse for all Z3 values
        let inverses: [BN; NumEntries] = bignum::bignum::batch_invert(inverses);

        for i in 0..j_tx.len() {
            let z_inv = inverses[i];
            let zz = z_inv.__mul(z_inv);
            let zzz = zz.__mul(z_inv);
            let lambda = j_tx[i].lambda_numerator.__mul(z_inv);
            let x3 = j_tx[i].x3.__mul(zz);
            let y3 = j_tx[i].y3.__mul(zzz);
            result[i] = AffineTranscript { lambda, x3, y3 };
        }
        result
    }
}
