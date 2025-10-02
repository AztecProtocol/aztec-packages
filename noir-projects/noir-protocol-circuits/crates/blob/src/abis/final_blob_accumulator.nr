use bignum::BLS12_381_Fr;

/**
* Final values of a batched blob. Output in the root rollup circuit and validated on L1.
*
* - blob_commitments_hash = sha256( ...sha256(sha256(C_0), C_1) ... C_n)
* - z = poseidon2( ...poseidon2(poseidon2(z_0, z_1), z_2) ... z_n)
* - y = y_0 + gamma * y_1 + gamma^2 * y_2 + ... + gamma^n * y_n
* - c = C_0 + gamma * C_1 + gamma^2 * C_2 + ... + gamma^n * C_n
*
* Gamma has served its purpose in the 'random' linear combination and is not required as a public input.
*/
pub struct FinalBlobAccumulator {
    // Hash of Cs (to link to L1 blob hashes) (BN254Fr).
    pub blob_commitments_hash: Field,
    // Challenge at which the batched blob polynomial is evaluated (BN254Fr)
    pub z: Field,
    // Batched blob's evaluation y.
    pub y: BLS12_381_Fr,
    // Batched blob's commitment C (BLS12 point: { x: BLS12Fq, y: BLS12Fq }) compressed to 48 bytes, stored in 2 fields
    // of 31 and 17 bytes
    pub c: [Field; 2],
}

impl Eq for FinalBlobAccumulator {
    fn eq(self, other: Self) -> bool {
        (self.blob_commitments_hash.eq(other.blob_commitments_hash))
            & (self.z.eq(other.z))
            & (self.y.eq(other.y))
            & (self.c.eq(other.c))
    }
}
