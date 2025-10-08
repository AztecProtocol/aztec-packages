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

#include "eip7594/eip7594.h"
#include "common/alloc.h"
#include "common/fr.h"
#include "common/lincomb.h"
#include "common/utils.h"
#include "eip7594/fft.h"
#include "eip7594/fk20.h"
#include "eip7594/poly.h"
#include "eip7594/recovery.h"

#include <assert.h> /* For assert */
#include <string.h> /* For memcpy & strlen */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Macros
////////////////////////////////////////////////////////////////////////////////////////////////////

/** Length of the domain string. */
#define DOMAIN_STR_LENGTH 16

////////////////////////////////////////////////////////////////////////////////////////////////////
// Constants
////////////////////////////////////////////////////////////////////////////////////////////////////

/** The domain separator for verify_cell_kzg_proof_batch's random challenge. */
static const char *RANDOM_CHALLENGE_DOMAIN_VERIFY_CELL_KZG_PROOF_BATCH = "RCKZGCBATCH__V1_";

////////////////////////////////////////////////////////////////////////////////////////////////////
// Compute
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Given a blob, compute all of its cells and proofs.
 *
 * @param[out]  cells   An array of CELLS_PER_EXT_BLOB cells
 * @param[out]  proofs  An array of CELLS_PER_EXT_BLOB proofs
 * @param[in]   blob    The blob to get cells/proofs for
 * @param[in]   s       The trusted setup
 *
 * @remark If cells is NULL, they won't be computed.
 * @remark If proofs is NULL, they won't be computed.
 * @remark Will return an error if both cells & proofs are NULL.
 */
C_KZG_RET compute_cells_and_kzg_proofs(
    Cell *cells, KZGProof *proofs, const Blob *blob, const KZGSettings *s
) {
    C_KZG_RET ret;
    fr_t *poly_monomial = NULL;
    fr_t *poly_lagrange = NULL;
    fr_t *data_fr = NULL;
    g1_t *proofs_g1 = NULL;

    /* If both of these are null, something is wrong */
    if (cells == NULL && proofs == NULL) {
        return C_KZG_BADARGS;
    }

    /* Allocate space fr-form arrays */
    ret = new_fr_array(&poly_monomial, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&poly_lagrange, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;

    /*
     * Convert the blob to a polynomial in lagrange form. Note that only the first 4096 fields of
     * the polynomial will be set. The upper 4096 fields will remain zero. The extra space is
     * required because the polynomial will be evaluated to the extended domain (8192 roots of
     * unity).
     */
    ret = blob_to_polynomial(poly_lagrange, blob);
    if (ret != C_KZG_OK) goto out;

    /* We need the polynomial to be in monomial form */
    ret = poly_lagrange_to_monomial(poly_monomial, poly_lagrange, FIELD_ELEMENTS_PER_BLOB, s);
    if (ret != C_KZG_OK) goto out;

    /* Ensure that only the first FIELD_ELEMENTS_PER_BLOB elements can be non-zero */
    for (size_t i = FIELD_ELEMENTS_PER_BLOB; i < FIELD_ELEMENTS_PER_EXT_BLOB; i++) {
        assert(fr_equal(&poly_monomial[i], &FR_ZERO));
    }

    if (cells != NULL) {
        /* Allocate space for our data points */
        ret = new_fr_array(&data_fr, FIELD_ELEMENTS_PER_EXT_BLOB);
        if (ret != C_KZG_OK) goto out;

        /* Get the data points via forward transformation */
        ret = fr_fft(data_fr, poly_monomial, FIELD_ELEMENTS_PER_EXT_BLOB, s);
        if (ret != C_KZG_OK) goto out;

        /* Bit-reverse the data points */
        ret = bit_reversal_permutation(data_fr, sizeof(fr_t), FIELD_ELEMENTS_PER_EXT_BLOB);
        if (ret != C_KZG_OK) goto out;

        /* Convert all of the cells to byte-form */
        for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
            for (size_t j = 0; j < FIELD_ELEMENTS_PER_CELL; j++) {
                size_t index = i * FIELD_ELEMENTS_PER_CELL + j;
                size_t offset = j * BYTES_PER_FIELD_ELEMENT;
                bytes_from_bls_field((Bytes32 *)&cells[i].bytes[offset], &data_fr[index]);
            }
        }
    }

    if (proofs != NULL) {
        /* Allocate space for our proofs in g1-form */
        ret = new_g1_array(&proofs_g1, CELLS_PER_EXT_BLOB);
        if (ret != C_KZG_OK) goto out;

        /* Compute the proofs, only uses the first half of the polynomial */
        ret = compute_fk20_cell_proofs(proofs_g1, poly_monomial, s);
        if (ret != C_KZG_OK) goto out;

        /* Bit-reverse the proofs */
        ret = bit_reversal_permutation(proofs_g1, sizeof(g1_t), CELLS_PER_EXT_BLOB);
        if (ret != C_KZG_OK) goto out;

        /* Convert all of the proofs to byte-form */
        for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
            bytes_from_g1(&proofs[i], &proofs_g1[i]);
        }
    }

out:
    c_kzg_free(poly_monomial);
    c_kzg_free(poly_lagrange);
    c_kzg_free(data_fr);
    c_kzg_free(proofs_g1);
    return ret;
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Recover
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Given some cells for a blob, recover all cells/proofs.
 *
 * @param[out]  recovered_cells     An array of CELLS_PER_EXT_BLOB cells
 * @param[out]  recovered_proofs    An array of CELLS_PER_EXT_BLOB proofs
 * @param[in]   cell_indices        The cell indices for the available cells, length `num_cells`
 * @param[in]   cells               The available cells we recover from, length `num_cells`
 * @param[in]   num_cells           The number of available cells provided
 * @param[in]   s                   The trusted setup
 *
 * @remark At least CELLS_PER_BLOB cells must be provided.
 * @remark Recovery is faster if there are fewer missing cells.
 * @remark If recovered_proofs is NULL, they will not be recomputed.
 */
C_KZG_RET recover_cells_and_kzg_proofs(
    Cell *recovered_cells,
    KZGProof *recovered_proofs,
    const uint64_t *cell_indices,
    const Cell *cells,
    uint64_t num_cells,
    const KZGSettings *s
) {
    C_KZG_RET ret;
    fr_t *recovered_cells_fr = NULL;
    g1_t *recovered_proofs_g1 = NULL;

    /* Ensure only one blob's worth of cells was provided */
    if (num_cells > CELLS_PER_EXT_BLOB) {
        ret = C_KZG_BADARGS;
        goto out;
    }

    /* Check if it's possible to recover */
    if (num_cells < CELLS_PER_BLOB) {
        ret = C_KZG_BADARGS;
        goto out;
    }

    for (size_t i = 0; i < num_cells; i++) {
        /* Check that cell indices are valid */
        if (cell_indices[i] >= CELLS_PER_EXT_BLOB) {
            ret = C_KZG_BADARGS;
            goto out;
        }
        /* Check that indices are in strictly ascending order */
        if (i > 0 && cell_indices[i] <= cell_indices[i - 1]) {
            ret = C_KZG_BADARGS;
            goto out;
        }
    }

    /* Do allocations */
    ret = new_fr_array(&recovered_cells_fr, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_g1_array(&recovered_proofs_g1, CELLS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;

    /* Initialize all cells as missing */
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_EXT_BLOB; i++) {
        recovered_cells_fr[i] = FR_NULL;
    }

    /* Populate recovered_cells_fr with available cells at the right places */
    for (size_t i = 0; i < num_cells; i++) {
        size_t index = cell_indices[i] * FIELD_ELEMENTS_PER_CELL;
        for (size_t j = 0; j < FIELD_ELEMENTS_PER_CELL; j++) {
            /* Convert the untrusted input bytes to a field element */
            fr_t *ptr = &recovered_cells_fr[index + j];
            size_t offset = j * BYTES_PER_FIELD_ELEMENT;
            ret = bytes_to_bls_field(ptr, (const Bytes32 *)&cells[i].bytes[offset]);
            if (ret != C_KZG_OK) goto out;
        }
    }

    if (num_cells == CELLS_PER_EXT_BLOB) {
        /* Nothing to recover, copy the cells */
        for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
            /*
             * At this point, and based on our checks above, we know that all indices are in the
             * right order. That is: cell_indices[i] == i
             */
            recovered_cells[i] = cells[i];
        }
    } else {
        /* Perform cell recovery */
        ret = recover_cells(recovered_cells_fr, cell_indices, num_cells, recovered_cells_fr, s);
        if (ret != C_KZG_OK) goto out;

        /* Convert the recovered data points to byte-form */
        for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
            for (size_t j = 0; j < FIELD_ELEMENTS_PER_CELL; j++) {
                size_t index = i * FIELD_ELEMENTS_PER_CELL + j;
                size_t offset = j * BYTES_PER_FIELD_ELEMENT;
                bytes_from_bls_field(
                    (Bytes32 *)&recovered_cells[i].bytes[offset], &recovered_cells_fr[index]
                );
            }
        }
    }

    if (recovered_proofs != NULL) {
        /*
         * Instead of converting the cells to a blob and back, we can just treat the cells as a
         * polynomial. We are done with the fr-form recovered cells and we can safely mutate the
         * array.
         */
        ret = poly_lagrange_to_monomial(
            recovered_cells_fr, recovered_cells_fr, FIELD_ELEMENTS_PER_EXT_BLOB, s
        );
        if (ret != C_KZG_OK) goto out;

        /* Compute the proofs, only uses the first half of the polynomial */
        ret = compute_fk20_cell_proofs(recovered_proofs_g1, recovered_cells_fr, s);
        if (ret != C_KZG_OK) goto out;

        /* Bit-reverse the proofs */
        ret = bit_reversal_permutation(recovered_proofs_g1, sizeof(g1_t), CELLS_PER_EXT_BLOB);
        if (ret != C_KZG_OK) goto out;

        /* Convert all of the proofs to byte-form */
        for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
            bytes_from_g1(&recovered_proofs[i], &recovered_proofs_g1[i]);
        }
    }

out:
    c_kzg_free(recovered_cells_fr);
    c_kzg_free(recovered_proofs_g1);
    return ret;
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Verify
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Helper function to compare two commitments.
 *
 * @param[in]   a   The first commitment
 * @param[in]   b   The second commitment
 *
 * @return True if the commitments are the same, otherwise false.
 */
static bool commitments_equal(const Bytes48 *a, const Bytes48 *b) {
    return memcmp(a->bytes, b->bytes, BYTES_PER_COMMITMENT) == 0;
}

/**
 * Helper function to copy one commitment's bytes to another.
 *
 * @param[in]   dst The destination commitment
 * @param[in]   src The source commitment
 */
static void commitments_copy(Bytes48 *dst, const Bytes48 *src) {
    memcpy(dst->bytes, src->bytes, BYTES_PER_COMMITMENT);
}

/**
 * Convert a list of commitments with potential duplicates to a list of unique commitments. Also
 * returns a list of indices which point to those new unique commitments.
 *
 * @param[in,out]   commitments_out Updated to only contain unique commitments
 * @param[out]      indices_out     Used as map between old/new commitments
 * @param[in,out]   count_out       Number of commitments before and after
 *
 * @remark The input arrays are re-used.
 * @remark The number of commitments/indices must be the same.
 * @remark The length of `indices_out` is unchanged.
 * @remark `count_out` is updated to be the number of unique commitments.
 */
static void deduplicate_commitments(
    Bytes48 *commitments_out, uint64_t *indices_out, size_t *count_out
) {
    /* Bail early if there are no commitments */
    if (*count_out == 0) return;

    /* The first commitment is always new */
    indices_out[0] = 0;
    size_t new_count = 1;

    /* Create list of unique commitments & indices to them */
    for (size_t i = 1; i < *count_out; i++) {
        bool exist = false;
        for (size_t j = 0; j < new_count; j++) {
            if (commitments_equal(&commitments_out[i], &commitments_out[j])) {
                /* This commitment already exists */
                indices_out[i] = j;
                exist = true;
                break;
            }
        }
        if (!exist) {
            /* This is a new commitment */
            commitments_copy(&commitments_out[new_count], &commitments_out[i]);
            indices_out[i] = new_count;
            new_count++;
        }
    }

    /* Update the count */
    *count_out = new_count;
}

/**
 * Compute the challenge value used for batch verification of cell KZG proofs.
 *
 * @param[out]  challenge_out       The output challenge as a BLS field element
 * @param[in]   commitments_bytes   The input commitments, length `num_commitments`
 * @param[in]   num_commitments     The number of commitments
 * @param[in]   commitment_indices  The cell commitment indices, length `num_cells`
 * @param[in]   cell_indices        The cell indices, length `num_cells`
 * @param[in]   cells               The cells, length `num_cells`
 * @param[in]   proofs_bytes        The cell proofs, length `num_cells`
 * @param[in]   num_cells           The number of cells
 */
C_KZG_RET compute_verify_cell_kzg_proof_batch_challenge(
    fr_t *challenge_out,
    const Bytes48 *commitments_bytes,
    uint64_t num_commitments,
    const uint64_t *commitment_indices,
    const uint64_t *cell_indices,
    const Cell *cells,
    const Bytes48 *proofs_bytes,
    uint64_t num_cells
) {
    C_KZG_RET ret;
    uint8_t *bytes = NULL;
    Bytes32 r_bytes;

    /* Calculate the size of the data we're going to hash */
    size_t input_size = DOMAIN_STR_LENGTH                          /* The domain separator */
                        + sizeof(uint64_t)                         /* FIELD_ELEMENTS_PER_BLOB */
                        + sizeof(uint64_t)                         /* FIELD_ELEMENTS_PER_CELL */
                        + sizeof(uint64_t)                         /* num_commitments */
                        + sizeof(uint64_t)                         /* num_cells */
                        + (num_commitments * BYTES_PER_COMMITMENT) /* commitment_bytes */
                        + (num_cells * sizeof(uint64_t))           /* commitment_indices */
                        + (num_cells * sizeof(uint64_t))           /* cell_indices */
                        + (num_cells * BYTES_PER_CELL)             /* cells */
                        + (num_cells * BYTES_PER_PROOF);           /* proofs_bytes */

    /* Allocate space to copy this data into */
    ret = c_kzg_malloc((void **)&bytes, input_size);
    if (ret != C_KZG_OK) goto out;

    /* Pointer tracking `bytes` for writing on top of it */
    uint8_t *offset = bytes;

    /* Ensure that the domain string is the correct length */
    assert(strlen(RANDOM_CHALLENGE_DOMAIN_VERIFY_CELL_KZG_PROOF_BATCH) == DOMAIN_STR_LENGTH);

    /* Copy domain separator */
    memcpy(offset, RANDOM_CHALLENGE_DOMAIN_VERIFY_CELL_KZG_PROOF_BATCH, DOMAIN_STR_LENGTH);
    offset += DOMAIN_STR_LENGTH;

    /* Copy field elements per blob */
    bytes_from_uint64(offset, FIELD_ELEMENTS_PER_BLOB);
    offset += sizeof(uint64_t);

    /* Copy field elements per cell */
    bytes_from_uint64(offset, FIELD_ELEMENTS_PER_CELL);
    offset += sizeof(uint64_t);

    /* Copy number of commitments */
    bytes_from_uint64(offset, num_commitments);
    offset += sizeof(uint64_t);

    /* Copy number of cells */
    bytes_from_uint64(offset, num_cells);
    offset += sizeof(uint64_t);

    for (size_t i = 0; i < num_commitments; i++) {
        /* Copy commitment */
        memcpy(offset, &commitments_bytes[i], BYTES_PER_COMMITMENT);
        offset += BYTES_PER_COMMITMENT;
    }

    for (size_t i = 0; i < num_cells; i++) {
        /* Copy row id */
        bytes_from_uint64(offset, commitment_indices[i]);
        offset += sizeof(uint64_t);

        /* Copy column id */
        bytes_from_uint64(offset, cell_indices[i]);
        offset += sizeof(uint64_t);

        /* Copy cell */
        memcpy(offset, &cells[i], BYTES_PER_CELL);
        offset += BYTES_PER_CELL;

        /* Copy proof */
        memcpy(offset, &proofs_bytes[i], BYTES_PER_PROOF);
        offset += BYTES_PER_PROOF;
    }

    /* Make sure we wrote the entire buffer */
    assert(offset == bytes + input_size);

    /* Create the challenge hash */
    blst_sha256(r_bytes.bytes, bytes, input_size);

    /* Convert to BLS field element */
    hash_to_bls_field(challenge_out, &r_bytes);

out:
    c_kzg_free(bytes);
    return ret;
}

/**
 * Compute the sum of the commitments weighted by the powers of r.
 *
 * @param[out]  sum_of_commitments_out  The resulting G1 sum of the commitments
 * @param[in]   unique_commitments      Array of unique commitments, length `num_commitments`
 * @param[in]   commitment_indices      Indices mapping to unique commitments, length `num_cells`
 * @param[in]   r_powers                Array of powers of r used for weighting, length `num_cells`
 * @param[in]   num_commitments         The number of unique commitments
 * @param[in]   num_cells               The number of cells
 */
static C_KZG_RET compute_weighted_sum_of_commitments(
    g1_t *sum_of_commitments_out,
    const Bytes48 *unique_commitments,
    const uint64_t *commitment_indices,
    const fr_t *r_powers,
    size_t num_commitments,
    uint64_t num_cells
) {
    C_KZG_RET ret;
    g1_t *commitments_g1 = NULL;
    fr_t *commitment_weights = NULL;

    ret = new_fr_array(&commitment_weights, num_commitments);
    if (ret != C_KZG_OK) goto out;
    ret = new_g1_array(&commitments_g1, num_commitments);
    if (ret != C_KZG_OK) goto out;

    for (size_t i = 0; i < num_commitments; i++) {
        /* Convert & validate commitment */
        ret = bytes_to_kzg_commitment(&commitments_g1[i], &unique_commitments[i]);
        if (ret != C_KZG_OK) goto out;

        /* Initialize the weight to zero */
        commitment_weights[i] = FR_ZERO;
    }

    /* Update commitment weights */
    for (uint64_t i = 0; i < num_cells; i++) {
        blst_fr_add(
            &commitment_weights[commitment_indices[i]],
            &commitment_weights[commitment_indices[i]],
            &r_powers[i]
        );
    }

    /* Compute commitment sum */
    ret = g1_lincomb_fast(
        sum_of_commitments_out, commitments_g1, commitment_weights, num_commitments
    );
    if (ret != C_KZG_OK) goto out;

out:
    c_kzg_free(commitment_weights);
    c_kzg_free(commitments_g1);
    return ret;
}

/**
 * Compute the inverse coset factor h_k^{-1},
 *  where `h_k` is the coset factor for cell with index `k`.
 *
 * @param[out]  inv_coset_factor_out    Pointer to store the computed inverse coset factor
 * @param[in]   cell_index              The index of the cell
 * @param[in]   s                       The trusted setup
 */
static void get_inv_coset_shift_for_cell(
    fr_t *inv_coset_factor_out, uint64_t cell_index, const KZGSettings *s
) {
    /*
     * Get the cell index in reverse-bit order.
     * This index points to this cell's coset factor h_k in the roots_of_unity array.
     */
    uint64_t cell_idx_rbl = reverse_bits_limited(CELLS_PER_EXT_BLOB, cell_index);

    /*
     * Observe that for every element in roots_of_unity, we can find its inverse by
     * accessing its reflected element.
     *
     * For example, consider a multiplicative subgroup with eight elements:
     *   roots = {w^0, w^1, w^2, ... w^7, w^0}
     * For a root of unity in roots[i], we can find its inverse in roots[-i].
     */
    assert(cell_idx_rbl <= FIELD_ELEMENTS_PER_EXT_BLOB);
    uint64_t inv_coset_factor_idx = FIELD_ELEMENTS_PER_EXT_BLOB - cell_idx_rbl;

    /* Get h_k^{-1} using the index */
    assert(inv_coset_factor_idx < FIELD_ELEMENTS_PER_EXT_BLOB + 1);
    *inv_coset_factor_out = s->roots_of_unity[inv_coset_factor_idx];
}

/**
 * Compute h_k^{n}, where `h_k` is the coset factor for cell with index `k`.
 *
 * @param[out]  coset_factor_out    Pointer to store h_k^{n}
 * @param[in]   cell_index          The index of the cell
 * @param[in]   s                   The trusted setup
 */
static void get_coset_shift_pow_for_cell(
    fr_t *coset_factor_out, uint64_t cell_index, const KZGSettings *s
) {
    /*
     * Get the cell index in reverse-bit order.
     * This index points to this cell's coset factor h_k in the roots_of_unity array.
     */
    uint64_t cell_idx_rbl = reverse_bits_limited(CELLS_PER_EXT_BLOB, cell_index);

    /*
     * Get the index to h_k^n in the roots_of_unity array.
     *
     * Multiplying the index of h_k by n, effectively raises h_k to the n-th power,
     * because advancing in the roots_of_unity array corresponds to increasing exponents.
     */
    uint64_t h_k_pow_idx = cell_idx_rbl * FIELD_ELEMENTS_PER_CELL;

    /* Get h_k^n using the index */
    assert(h_k_pow_idx < FIELD_ELEMENTS_PER_EXT_BLOB + 1);
    *coset_factor_out = s->roots_of_unity[h_k_pow_idx];
}

/**
 * Aggregate columns, compute the sum of interpolation polynomials, and commit to the result.
 *
 * This function computes `RLI = [sum_k r^k interpolation_poly_k(s)]` from the spec.
 *
 * @param[out]  commitment_out  Commitment to the aggregated interpolation poly
 * @param[in]   r_powers        Precomputed powers of the random challenge, length `num_cells`
 * @param[in]   cell_indices    Indices of the cells, length `num_cells`
 * @param[in]   cells           Array of cells, length `num_cells`
 * @param[in]   num_cells       Number of cells
 * @param[in]   s               The trusted setup
 */
static C_KZG_RET compute_commitment_to_aggregated_interpolation_poly(
    g1_t *commitment_out,
    const fr_t *r_powers,
    const uint64_t *cell_indices,
    const Cell *cells,
    uint64_t num_cells,
    const KZGSettings *s
) {
    C_KZG_RET ret;
    bool *is_cell_used = NULL;
    fr_t *aggregated_column_cells = NULL;
    fr_t *column_interpolation_poly = NULL;
    fr_t *aggregated_interpolation_poly = NULL;

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Array allocations
    ////////////////////////////////////////////////////////////////////////////////////////////////

    ret = new_bool_array(&is_cell_used, CELLS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&aggregated_column_cells, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&column_interpolation_poly, FIELD_ELEMENTS_PER_CELL);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&aggregated_interpolation_poly, FIELD_ELEMENTS_PER_CELL);
    if (ret != C_KZG_OK) goto out;

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Aggregate cells from the same column
    ////////////////////////////////////////////////////////////////////////////////////////////////

    /* Start with zeroed out columns */
    for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
        for (size_t j = 0; j < FIELD_ELEMENTS_PER_CELL; j++) {
            size_t index = i * FIELD_ELEMENTS_PER_CELL + j;
            aggregated_column_cells[index] = FR_ZERO;
        }
    }

    /*
     * Vertically collapse cells of the 2D matrix into a single array: `aggregated_column_cells`.
     *
     * For each provided cell, go over its field elements, and scale them by the appropriate power
     * of r. Then aggregate all field elements on the same vertical slice into a single array.
     */
    for (uint64_t cell_index = 0; cell_index < num_cells; cell_index++) {
        /* Determine which column this cell belongs to */
        uint64_t column_index = cell_indices[cell_index];

        /* Iterate over every field element of this cell: scale it and aggregate it */
        for (size_t fr_index = 0; fr_index < FIELD_ELEMENTS_PER_CELL; fr_index++) {
            fr_t original_fr, scaled_fr;

            /* Get the field element at this offset */
            size_t offset = fr_index * BYTES_PER_FIELD_ELEMENT;
            ret = bytes_to_bls_field(
                &original_fr, (const Bytes32 *)&cells[cell_index].bytes[offset]
            );
            if (ret != C_KZG_OK) goto out;

            /* Scale the field element by the appropriate power of r */
            blst_fr_mul(&scaled_fr, &original_fr, &r_powers[cell_index]);

            /* Figure out the right index for this field element within the extended array */
            size_t array_index = column_index * FIELD_ELEMENTS_PER_CELL + fr_index;
            /* Aggregate the scaled field element into the array */
            blst_fr_add(
                &aggregated_column_cells[array_index],
                &aggregated_column_cells[array_index],
                &scaled_fr
            );
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Determine which cells are used
    ////////////////////////////////////////////////////////////////////////////////////////////////

    /* Start with false values */
    for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
        is_cell_used[i] = false;
    }

    /* Mark each cell index as used */
    for (uint64_t i = 0; i < num_cells; i++) {
        is_cell_used[cell_indices[i]] = true;
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Compute interpolation polynomials using the aggregated cells
    ////////////////////////////////////////////////////////////////////////////////////////////////

    /* Start with a zeroed out poly */
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_CELL; i++) {
        aggregated_interpolation_poly[i] = FR_ZERO;
    }

    /* Interpolate each column */
    for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
        /* We can skip columns without any cells */
        if (!is_cell_used[i]) continue;

        /* Offset to the first cell for this column */
        size_t index = i * FIELD_ELEMENTS_PER_CELL;

        /*
         * Reach into the big array and permute the right column.
         * No need to copy the data, we are not gonna use them again.
         */
        ret = bit_reversal_permutation(
            &aggregated_column_cells[index], sizeof(fr_t), FIELD_ELEMENTS_PER_CELL
        );
        if (ret != C_KZG_OK) goto out;

        /*
         * Get interpolation polynomial for this column. To do so we first do an IDFT over the roots
         * of unity and then we scale the coefficients by the coset factor. We can't do an IDFT
         * directly over the coset because it's not a subgroup.
         */
        ret = fr_ifft(
            column_interpolation_poly, &aggregated_column_cells[index], FIELD_ELEMENTS_PER_CELL, s
        );
        if (ret != C_KZG_OK) goto out;

        /* Shift the poly by h_k^{-1} where h_k is the coset factor for this cell */
        fr_t inv_coset_factor;
        get_inv_coset_shift_for_cell(&inv_coset_factor, i, s);
        shift_poly(column_interpolation_poly, FIELD_ELEMENTS_PER_CELL, &inv_coset_factor);

        /* Update the aggregated poly */
        for (size_t k = 0; k < FIELD_ELEMENTS_PER_CELL; k++) {
            blst_fr_add(
                &aggregated_interpolation_poly[k],
                &aggregated_interpolation_poly[k],
                &column_interpolation_poly[k]
            );
        }
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Commit to the aggregated interpolation polynomial
    ////////////////////////////////////////////////////////////////////////////////////////////////

    ret = g1_lincomb_fast(
        commitment_out,
        s->g1_values_monomial,
        aggregated_interpolation_poly,
        FIELD_ELEMENTS_PER_CELL
    );
    if (ret != C_KZG_OK) goto out;

out:
    c_kzg_free(is_cell_used);
    c_kzg_free(aggregated_column_cells);
    c_kzg_free(column_interpolation_poly);
    c_kzg_free(aggregated_interpolation_poly);
    return ret;
}

/**
 * Compute weighted sum of proofs.
 *
 * @param[out]  weighted_proof_lincomb  The resulting G1 sum of the proofs scaled by coset factors
 * @param[in]   proofs_g1               Array of proofs, length `num_cells`
 * @param[in]   r_powers                Array of powers of r used for weighting, length `num_cells`
 * @param[in]   cell_indices            Array of cell indices, length `num_cells`
 * @param[in]   num_cells               The number of cells
 * @param[in]   s                       The trusted setup
 */
static C_KZG_RET computed_weighted_sum_of_proofs(
    g1_t *weighted_proof_sum_out,
    const g1_t *proofs_g1,
    const fr_t *r_powers,
    const uint64_t *cell_indices,
    uint64_t num_cells,
    const KZGSettings *s
) {
    C_KZG_RET ret;
    fr_t *weighted_powers_of_r = NULL;

    ret = new_fr_array(&weighted_powers_of_r, num_cells);
    if (ret != C_KZG_OK) goto out;

    for (uint64_t i = 0; i < num_cells; i++) {
        /* Get scaling factor h_k^n where h_k is the coset factor for this cell */
        fr_t h_k_pow;
        get_coset_shift_pow_for_cell(&h_k_pow, cell_indices[i], s);

        /* Scale the power of r by h_k^n */
        blst_fr_mul(&weighted_powers_of_r[i], &r_powers[i], &h_k_pow);
    }

    ret = g1_lincomb_fast(weighted_proof_sum_out, proofs_g1, weighted_powers_of_r, num_cells);

out:
    c_kzg_free(weighted_powers_of_r);
    return ret;
}

/**
 * Given some cells, verify that their proofs are valid.
 *
 * @param[out]  ok                  True if the proofs are valid
 * @param[in]   commitments_bytes   The commitments for the cells, length `num_cells`
 * @param[in]   cell_indices        The indices for the cells, length `num_cells`
 * @param[in]   cells               The cells to check, length `num_cells`
 * @param[in]   proofs_bytes        The proofs for the cells, length `num_cells`
 * @param[in]   num_cells           The number of cells provided
 * @param[in]   s                   The trusted setup
 */
C_KZG_RET verify_cell_kzg_proof_batch(
    bool *ok,
    const Bytes48 *commitments_bytes,
    const uint64_t *cell_indices,
    const Cell *cells,
    const Bytes48 *proofs_bytes,
    uint64_t num_cells,
    const KZGSettings *s
) {
    C_KZG_RET ret;
    fr_t r;
    g1_t interpolation_poly_commit;
    g1_t final_g1_sum;
    g1_t proof_lincomb;
    g1_t weighted_sum_of_proofs;
    g2_t power_of_s = s->g2_values_monomial[FIELD_ELEMENTS_PER_CELL];
    size_t num_commitments;

    /* Arrays */
    Bytes48 *unique_commitments = NULL;
    uint64_t *commitment_indices = NULL;
    fr_t *r_powers = NULL;
    g1_t *proofs_g1 = NULL;

    *ok = false;

    /* Exit early if we are given zero cells */
    if (num_cells == 0) {
        *ok = true;
        return C_KZG_OK;
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Sanity checks
    ////////////////////////////////////////////////////////////////////////////////////////////////

    for (size_t i = 0; i < num_cells; i++) {
        /* Make sure column index is valid */
        if (cell_indices[i] >= CELLS_PER_EXT_BLOB) return C_KZG_BADARGS;
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Deduplicate commitments
    ////////////////////////////////////////////////////////////////////////////////////////////////

    ret = c_kzg_calloc((void **)&unique_commitments, num_cells, sizeof(Bytes48));
    if (ret != C_KZG_OK) goto out;
    ret = c_kzg_calloc((void **)&commitment_indices, num_cells, sizeof(uint64_t));
    if (ret != C_KZG_OK) goto out;

    /*
     * Convert the array of cell commitments to an array of unique commitments and an array of
     * indices to those unique commitments. We do this before the array allocations section below
     * because we need to know how many commitment weights there will be.
     */
    num_commitments = num_cells;
    memcpy(unique_commitments, commitments_bytes, num_cells * sizeof(Bytes48));
    deduplicate_commitments(unique_commitments, commitment_indices, &num_commitments);

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Array allocations
    ////////////////////////////////////////////////////////////////////////////////////////////////

    ret = new_fr_array(&r_powers, num_cells);
    if (ret != C_KZG_OK) goto out;
    ret = new_g1_array(&proofs_g1, num_cells);
    if (ret != C_KZG_OK) goto out;

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Compute powers of r, and extract KZG proofs out of input bytes
    ////////////////////////////////////////////////////////////////////////////////////////////////

    /* Compute the challenge */
    ret = compute_verify_cell_kzg_proof_batch_challenge(
        &r,
        unique_commitments,
        num_commitments,
        commitment_indices,
        cell_indices,
        cells,
        proofs_bytes,
        num_cells
    );
    if (ret != C_KZG_OK) goto out;

    /*
     * Derive random factors for the linear combination. The exponents start with 0. That is, they
     * are r^0, r^1, r^2, r^3, and so on.
     */
    compute_powers(r_powers, &r, num_cells);

    /* There should be a proof for each cell */
    for (size_t i = 0; i < num_cells; i++) {
        ret = bytes_to_kzg_proof(&proofs_g1[i], &proofs_bytes[i]);
        if (ret != C_KZG_OK) goto out;
    }

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Compute random linear combination of the proofs
    ////////////////////////////////////////////////////////////////////////////////////////////////

    ret = g1_lincomb_fast(&proof_lincomb, proofs_g1, r_powers, num_cells);
    if (ret != C_KZG_OK) goto out;

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Compute sum of the commitments
    ////////////////////////////////////////////////////////////////////////////////////////////////

    ret = compute_weighted_sum_of_commitments(
        &final_g1_sum, unique_commitments, commitment_indices, r_powers, num_commitments, num_cells
    );
    if (ret != C_KZG_OK) goto out;

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Commit to aggregated interpolation polynomial
    ////////////////////////////////////////////////////////////////////////////////////////////////

    /* Aggregate cells from same columns, sum interpolation polynomials, and commit */
    ret = compute_commitment_to_aggregated_interpolation_poly(
        &interpolation_poly_commit, r_powers, cell_indices, cells, num_cells, s
    );
    if (ret != C_KZG_OK) goto out;

    /* Subtract commitment from sum by adding the negated commitment */
    blst_p1_cneg(&interpolation_poly_commit, true);
    blst_p1_add(&final_g1_sum, &final_g1_sum, &interpolation_poly_commit);

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Compute sum of the proofs scaled by the coset factors
    ////////////////////////////////////////////////////////////////////////////////////////////////

    ret = computed_weighted_sum_of_proofs(
        &weighted_sum_of_proofs, proofs_g1, r_powers, cell_indices, num_cells, s
    );
    if (ret != C_KZG_OK) goto out;

    blst_p1_add(&final_g1_sum, &final_g1_sum, &weighted_sum_of_proofs);

    ////////////////////////////////////////////////////////////////////////////////////////////////
    // Do the final pairing check
    ////////////////////////////////////////////////////////////////////////////////////////////////

    *ok = pairings_verify(&final_g1_sum, blst_p2_generator(), &proof_lincomb, &power_of_s);

out:
    c_kzg_free(unique_commitments);
    c_kzg_free(commitment_indices);
    c_kzg_free(r_powers);
    c_kzg_free(proofs_g1);
    return ret;
}
