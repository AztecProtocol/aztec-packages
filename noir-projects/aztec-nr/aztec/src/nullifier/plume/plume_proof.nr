use std::embedded_curve_ops::{EmbeddedCurvePoint as Point, EmbeddedCurveScalar as Scalar};

// Lives in its own file, because the oracle also needs to access this,
// and we want to avoid cyclic dependencies.

#[derive(Eq)]
pub struct PlumeProof<let N: u32> {
    pub msg: [Field; N], // Not siloed with the app's contract_address
    pub pk: Point, // a.k.a. A
    pub nullifier_point: Point, // a.k.a. B
    pub A2: Point,
    pub B2: Point,
    pub s: Scalar,
}
