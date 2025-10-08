/*
 * Copyright 2024 Benjamin Edgington
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#pragma once

#include "common/bytes.h"
#include "common/ec.h"
#include "common/fr.h"
#include "eip4844/blob.h"
#include "setup/settings.h"

////////////////////////////////////////////////////////////////////////////////////////////////////
// Types
////////////////////////////////////////////////////////////////////////////////////////////////////

/** A trusted (valid) KZG commitment. */
typedef Bytes48 KZGCommitment;

/** A trusted (valid) KZG proof. */
typedef Bytes48 KZGProof;

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

C_KZG_RET blob_to_kzg_commitment(KZGCommitment *out, const Blob *blob, const KZGSettings *s);

C_KZG_RET compute_kzg_proof(
    KZGProof *proof_out,
    Bytes32 *y_out,
    const Blob *blob,
    const Bytes32 *z_bytes,
    const KZGSettings *s
);

C_KZG_RET compute_blob_kzg_proof(
    KZGProof *out, const Blob *blob, const Bytes48 *commitment_bytes, const KZGSettings *s
);

C_KZG_RET verify_kzg_proof(
    bool *ok,
    const Bytes48 *commitment_bytes,
    const Bytes32 *z_bytes,
    const Bytes32 *y_bytes,
    const Bytes48 *proof_bytes,
    const KZGSettings *s
);

C_KZG_RET verify_blob_kzg_proof(
    bool *ok,
    const Blob *blob,
    const Bytes48 *commitment_bytes,
    const Bytes48 *proof_bytes,
    const KZGSettings *s
);

C_KZG_RET verify_blob_kzg_proof_batch(
    bool *ok,
    const Blob *blobs,
    const Bytes48 *commitments_bytes,
    const Bytes48 *proofs_bytes,
    uint64_t n,
    const KZGSettings *s
);

/* Internal function exposed for testing purposes */
void compute_challenge(fr_t *eval_challenge_out, const Blob *blob, const g1_t *commitment);

#ifdef __cplusplus
}
#endif
