/**
* Final values of a batched blob opening. Output in the root rollup circuit and validated on L1 by calling the point
* evaluation precompile with commitment D, proof E, and z = y = 0, which checks e(D, [1]) == e(E, [s]).
*
* - blob_commitments_hash = sha256( ...sha256(sha256(s_0, C_0), s_1, C_1) ... s_n, C_n), where s_i is the byte 0x01
*   for the first blob of each checkpoint and 0x00 otherwise
* - d = sum_k alpha_k * (C_k - y_k * G + z_k * Q_k)
* - e = sum_k alpha_k * Q_k
*
* See BlobAccumulator for the per-checkpoint values C_k, y_k, z_k, Q_k and alpha_k.
*/
pub struct FinalBlobAccumulator {
    // Hash of Cs (to link to L1 blob hashes) (BN254Fr).
    pub blob_commitments_hash: Field,
    // D (BLS12 point) compressed to 48 bytes, stored in 2 fields of 31 and 17 bytes
    pub d: [Field; 2],
    // E (BLS12 point) compressed to 48 bytes, stored in 2 fields of 31 and 17 bytes
    pub e: [Field; 2],
}

impl Eq for FinalBlobAccumulator {
    fn eq(self, other: Self) -> bool {
        (self.blob_commitments_hash.eq(other.blob_commitments_hash))
            & (self.d.eq(other.d))
            & (self.e.eq(other.e))
    }
}
