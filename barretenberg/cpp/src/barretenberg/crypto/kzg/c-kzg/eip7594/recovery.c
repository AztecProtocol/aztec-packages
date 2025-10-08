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

#include "eip7594/recovery.h"
#include "common/alloc.h"
#include "common/fr.h"
#include "common/utils.h"
#include "eip7594/cell.h"
#include "eip7594/fft.h"

#include <assert.h> /* For assert */
#include <stdlib.h> /* For NULL */
#include <string.h> /* For memcpy */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Vanishing Polynomial
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Calculates the minimal polynomial that evaluates to zero for each root.
 *
 * Uses straightforward long multiplication to calculate the product of `(x - r_i)` where `r_i` is
 * the i'th root. This results in a poly of degree roots_len.
 *
 * @param[in,out]   poly        The zero polynomial for roots, length `poly_len`
 * @param[in,out]   poly_len    The length of poly
 * @param[in]       roots       The array of roots, length `roots_len`
 * @param[in]       roots_len   The number of roots
 *
 * @remark These do not have to be roots of unity. They are roots of a polynomial.
 * @remark The `poly` array must be at least `roots_len + 1` in length.
 */
static C_KZG_RET compute_vanishing_polynomial_from_roots(
    fr_t *poly, size_t *poly_len, const fr_t *roots, size_t roots_len
) {
    fr_t neg_root;

    if (roots_len == 0) {
        return C_KZG_BADARGS;
    }

    /* Initialize with -root[0] */
    blst_fr_cneg(&poly[0], &roots[0], true);

    for (size_t i = 1; i < roots_len; i++) {
        blst_fr_cneg(&neg_root, &roots[i], true);

        poly[i] = neg_root;
        blst_fr_add(&poly[i], &poly[i], &poly[i - 1]);

        for (size_t j = i - 1; j > 0; j--) {
            blst_fr_mul(&poly[j], &poly[j], &neg_root);
            blst_fr_add(&poly[j], &poly[j], &poly[j - 1]);
        }
        blst_fr_mul(&poly[0], &poly[0], &neg_root);
    }

    poly[roots_len] = FR_ONE;
    *poly_len = roots_len + 1;

    return C_KZG_OK;
}

/**
 * Computes the minimal polynomial that evaluates to zero at equally spaced chosen roots of unity in
 * the domain of size `FIELD_ELEMENTS_PER_BLOB`.
 *
 * The roots of unity are chosen based on the missing cell indices. If the i'th cell is missing,
 * then the i'th root of unity from `roots_of_unity` will be zero on the polynomial
 * computed, along with every `CELLS_PER_EXT_BLOB` spaced root of unity in the domain.
 *
 * @param[in,out]   vanishing_poly          The output vanishing polynomial
 * @param[in]       missing_cell_indices    The array of missing cell indices
 * @param[in]       len_missing_cells       The number of missing cell indices
 * @param[in]       s                       The trusted setup
 *
 * @remark If no cells are missing, recovery is trivial; we expect the caller to handle this.
 * @remark If all cells are missing, we return C_KZG_BADARGS; the algorithm has an edge case.
 */
static C_KZG_RET vanishing_polynomial_for_missing_cells(
    fr_t *vanishing_poly,
    const uint64_t *missing_cell_indices,
    size_t len_missing_cells,
    const KZGSettings *s
) {
    C_KZG_RET ret;
    fr_t *roots = NULL;
    fr_t *short_vanishing_poly = NULL;
    size_t short_vanishing_poly_len = 0;

    /* Return early if none or all of the cells are missing */
    if (len_missing_cells == 0 || len_missing_cells >= CELLS_PER_EXT_BLOB) {
        ret = C_KZG_BADARGS;
        goto out;
    }

    /* Allocate arrays */
    ret = new_fr_array(&roots, len_missing_cells);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&short_vanishing_poly, (len_missing_cells + 1));
    if (ret != C_KZG_OK) goto out;

    /*
     * For each missing cell index, choose the corresponding root of unity from the subgroup of
     * size `CELLS_PER_EXT_BLOB`.
     *
     * In other words, if the missing index is `i`, then we add \omega^i to the roots array, where
     * \omega is a primitive `CELLS_PER_EXT_BLOB` root of unity.
     */
    size_t stride = FIELD_ELEMENTS_PER_EXT_BLOB / CELLS_PER_EXT_BLOB;
    for (size_t i = 0; i < len_missing_cells; i++) {
        roots[i] = s->roots_of_unity[missing_cell_indices[i] * stride];
    }

    /* Compute the polynomial that evaluates to zero on the roots */
    ret = compute_vanishing_polynomial_from_roots(
        short_vanishing_poly, &short_vanishing_poly_len, roots, len_missing_cells
    );
    if (ret != C_KZG_OK) goto out;

    /* Zero out all the coefficients of the output poly */
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_EXT_BLOB; i++) {
        vanishing_poly[i] = FR_ZERO;
    }

    /*
     * For each root \omega^i in `short_vanishing_poly`, we compute a polynomial that has roots at
     *
     *  H = {
     *      \omega^i * \gamma^0,
     *      \omega^i * \gamma^1,
     *      ...,
     *      \omega^i * \gamma^{FIELD_ELEMENTS_PER_CELL-1}
     *  }
     *
     * where \gamma is a primitive `FIELD_ELEMENTS_PER_EXT_BLOB`-th root of unity.
     *
     * This is done by shifting the degree of all coefficients in `short_vanishing_poly` up by
     * `FIELD_ELEMENTS_PER_CELL` amount.
     */
    for (size_t i = 0; i < short_vanishing_poly_len; i++) {
        vanishing_poly[i * FIELD_ELEMENTS_PER_CELL] = short_vanishing_poly[i];
    }

out:
    c_kzg_free(roots);
    c_kzg_free(short_vanishing_poly);
    return ret;
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Cell Recovery
////////////////////////////////////////////////////////////////////////////////////////////////////

/**
 * Helper function to check if a uint64 value is in an array.
 *
 * @param[in]   arr         The array
 * @param[in]   arr_size    The size of the array
 * @param[in]   value       The value we want to search
 *
 * @return True if the value is in the array, otherwise false.
 */
static bool is_in_array(const uint64_t *arr, size_t arr_size, uint64_t value) {
    for (size_t i = 0; i < arr_size; i++) {
        if (arr[i] == value) {
            return true;
        }
    }
    return false;
}

/**
 * Given a set of cells with up to half the entries missing, return the reconstructed
 * original. Assumes that the inverse FFT of the original data has the upper half of its values
 * equal to zero.
 *
 * @param[out]  reconstructed_data_out  Array of size FIELD_ELEMENTS_PER_EXT_BLOB to recover cells
 * @param[in]   cell_indices            An array with the available cell indices, length `num_cells`
 * @param[in]   num_cells               The size of the `cell_indices` array
 * @param[in]   cells                   An array of size FIELD_ELEMENTS_PER_EXT_BLOB with the cells
 * @param[in]   s                       The trusted setup
 *
 * @remark `reconstructed_data_out` and `cells` can point to the same memory.
 * @remark The array `cells` must be in the correct order (according to cell_indices).
 * @remark Missing cells in `cells` should be equal to FR_NULL.
 */
C_KZG_RET recover_cells(
    fr_t *reconstructed_data_out,
    const uint64_t *cell_indices,
    size_t num_cells,
    fr_t *cells,
    const KZGSettings *s
) {
    C_KZG_RET ret;
    uint64_t *missing_cell_indices = NULL;
    fr_t *vanishing_poly_eval = NULL;
    fr_t *vanishing_poly_coeff = NULL;
    fr_t *extended_evaluation_times_zero = NULL;
    fr_t *extended_evaluation_times_zero_coeffs = NULL;
    fr_t *extended_evaluations_over_coset = NULL;
    fr_t *vanishing_poly_over_coset = NULL;
    fr_t *reconstructed_poly_coeff = NULL;
    fr_t *cells_brp = NULL;

    /* Allocate space for arrays */
    ret = c_kzg_calloc(
        (void **)&missing_cell_indices, FIELD_ELEMENTS_PER_EXT_BLOB, sizeof(uint64_t)
    );
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&vanishing_poly_eval, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&vanishing_poly_coeff, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&extended_evaluation_times_zero, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&extended_evaluation_times_zero_coeffs, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&extended_evaluations_over_coset, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&vanishing_poly_over_coset, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&reconstructed_poly_coeff, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;
    ret = new_fr_array(&cells_brp, FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;

    /* Bit-reverse the data points, stored in new array */
    memcpy(cells_brp, cells, FIELD_ELEMENTS_PER_EXT_BLOB * sizeof(fr_t));
    ret = bit_reversal_permutation(cells_brp, sizeof(fr_t), FIELD_ELEMENTS_PER_EXT_BLOB);
    if (ret != C_KZG_OK) goto out;

    /* Identify missing cells */
    size_t len_missing = 0;
    for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
        /* Iterate over each cell index and check if we have received it */
        if (!is_in_array(cell_indices, num_cells, i)) {
            /* If the cell is missing, bit reverse the index and add it to the missing array */
            uint64_t brp_i = reverse_bits_limited(CELLS_PER_EXT_BLOB, i);
            missing_cell_indices[len_missing++] = brp_i;
        }
    }

    /*
     * Check that we have enough cells to recover.
     * Concretely, we need to have at least CELLS_PER_BLOB many cells.
     */
    assert(CELLS_PER_EXT_BLOB - len_missing >= CELLS_PER_BLOB);

    /*
     * Compute Z(x) in monomial form.
     * Z(x) is the polynomial which vanishes on all of the evaluations which are missing.
     */
    ret = vanishing_polynomial_for_missing_cells(
        vanishing_poly_coeff, missing_cell_indices, len_missing, s
    );
    if (ret != C_KZG_OK) goto out;

    /* Convert Z(x) to evaluation form */
    ret = fr_fft(vanishing_poly_eval, vanishing_poly_coeff, FIELD_ELEMENTS_PER_EXT_BLOB, s);
    if (ret != C_KZG_OK) goto out;

    /*
     * Compute (E*Z)(x) = E(x) * Z(x) in evaluation form over the FFT domain.
     *
     * Note: over the FFT domain, the polynomials (E*Z)(x) and (P*Z)(x) agree, where
     * P(x) is the polynomial we want to reconstruct (degree FIELD_ELEMENTS_PER_BLOB - 1).
     */
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_EXT_BLOB; i++) {
        if (fr_is_null(&cells_brp[i])) {
            /*
             * We handle this situation differently because FR_NULL is an invalid value. The right
             * hand side, vanishing_poly_eval[i], will always be zero when cells_brp[i] is null, so
             * the multiplication would still be result in zero, but we shouldn't depend on blst
             * handling invalid values like this.
             */
            extended_evaluation_times_zero[i] = FR_ZERO;
        } else {
            blst_fr_mul(&extended_evaluation_times_zero[i], &cells_brp[i], &vanishing_poly_eval[i]);
        }
    }

    /*
     * Convert (E*Z)(x) to monomial form.
     *
     * We know that (E*Z)(x) and (P*Z)(x) agree over the FFT domain,
     * and we know that (P*Z)(x) has degree at most FIELD_ELEMENTS_PER_EXT_BLOB - 1.
     * Thus, an inverse FFT of the evaluations of (E*Z)(x) (= evaluations of (P*Z)(x))
     * yields the coefficient form of (P*Z)(x).
     */
    ret = fr_ifft(
        extended_evaluation_times_zero_coeffs,
        extended_evaluation_times_zero,
        FIELD_ELEMENTS_PER_EXT_BLOB,
        s
    );
    if (ret != C_KZG_OK) goto out;

    /*
     * Next step is to divide the polynomial (P*Z)(x) by polynomial Z(x) to get P(x).
     * We do this in evaluation form over a coset of the FFT domain to avoid division by 0.
     *
     * Convert (P*Z)(x) to evaluation form over a coset of the FFT domain.
     */
    ret = coset_fft(
        extended_evaluations_over_coset,
        extended_evaluation_times_zero_coeffs,
        FIELD_ELEMENTS_PER_EXT_BLOB,
        s
    );
    if (ret != C_KZG_OK) goto out;

    /* Convert Z(x) to evaluation form over a coset of the FFT domain */
    ret = coset_fft(
        vanishing_poly_over_coset, vanishing_poly_coeff, FIELD_ELEMENTS_PER_EXT_BLOB, s
    );
    if (ret != C_KZG_OK) goto out;

    /* Compute P(x) = (P*Z)(x) / Z(x) in evaluation form over a coset of the FFT domain */
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_EXT_BLOB; i++) {
        fr_div(
            &extended_evaluations_over_coset[i],
            &extended_evaluations_over_coset[i],
            &vanishing_poly_over_coset[i]
        );
    }

    /*
     * Note: After the above polynomial division, extended_evaluations_over_coset is the same
     * polynomial as reconstructed_poly_over_coset in the spec.
     */

    /* Convert P(x) to coefficient form */
    ret = coset_ifft(
        reconstructed_poly_coeff, extended_evaluations_over_coset, FIELD_ELEMENTS_PER_EXT_BLOB, s
    );
    if (ret != C_KZG_OK) goto out;

    /*
     * After unscaling the reconstructed polynomial, we have P(x) which evaluates to our original
     * data at the roots of unity. Next, we evaluate the polynomial to get the original data.
     */
    ret = fr_fft(reconstructed_data_out, reconstructed_poly_coeff, FIELD_ELEMENTS_PER_EXT_BLOB, s);
    if (ret != C_KZG_OK) goto out;

    /* Bit-reverse the recovered data points */
    ret = bit_reversal_permutation(
        reconstructed_data_out, sizeof(fr_t), FIELD_ELEMENTS_PER_EXT_BLOB
    );
    if (ret != C_KZG_OK) goto out;

out:
    c_kzg_free(missing_cell_indices);
    c_kzg_free(vanishing_poly_eval);
    c_kzg_free(extended_evaluation_times_zero);
    c_kzg_free(extended_evaluation_times_zero_coeffs);
    c_kzg_free(extended_evaluations_over_coset);
    c_kzg_free(vanishing_poly_over_coset);
    c_kzg_free(reconstructed_poly_coeff);
    c_kzg_free(vanishing_poly_coeff);
    c_kzg_free(cells_brp);
    return ret;
}
