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
#include "common/fr.h"
#include "common/ret.h"
#include "eip4844/blob.h"
#include "eip4844/eip4844.h"
#include "eip7594/cell.h"
#include "setup/settings.h"

////////////////////////////////////////////////////////////////////////////////////////////////////
// Public Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef __cplusplus
extern "C" {
#endif

C_KZG_RET compute_cells_and_kzg_proofs(
    Cell *cells, KZGProof *proofs, const Blob *blob, const KZGSettings *s
);

C_KZG_RET recover_cells_and_kzg_proofs(
    Cell *recovered_cells,
    KZGProof *recovered_proofs,
    const uint64_t *cell_indices,
    const Cell *cells,
    uint64_t num_cells,
    const KZGSettings *s
);

C_KZG_RET verify_cell_kzg_proof_batch(
    bool *ok,
    const Bytes48 *commitments_bytes,
    const uint64_t *cell_indices,
    const Cell *cells,
    const Bytes48 *proofs_bytes,
    uint64_t num_cells,
    const KZGSettings *s
);

/* Internal function exposed for testing purposes */
C_KZG_RET compute_verify_cell_kzg_proof_batch_challenge(
    fr_t *challenge_out,
    const Bytes48 *commitments_bytes,
    uint64_t num_commitments,
    const uint64_t *commitment_indices,
    const uint64_t *cell_indices,
    const Cell *cells,
    const Bytes48 *proofs_bytes,
    uint64_t num_cells
);

#ifdef __cplusplus
}
#endif
