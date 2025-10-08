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

#include "common/bytes.h"

#include <stdio.h> /* For printf */

/**
 * Serialize a 64-bit unsigned integer into bytes.
 *
 * @param[out]  out An 8-byte array to store the serialized integer
 * @param[in]   n   The integer to be serialized
 *
 * @remark The output format is big-endian.
 */
void bytes_from_uint64(uint8_t out[8], uint64_t n) {
    for (int i = 7; i >= 0; i--) {
        out[i] = n & 0xFF;
        n >>= 8;
    }
}

/**
 * Serialize a G1 group element into bytes.
 *
 * @param[out]  out A 48-byte array to store the serialized G1 element
 * @param[in]   in  The G1 element to be serialized
 */
void bytes_from_g1(Bytes48 *out, const g1_t *in) {
    blst_p1_compress(out->bytes, in);
}

/**
 * Serialize a BLS field element into bytes.
 *
 * @param[out]  out A 32-byte array to store the serialized field element
 * @param[in]   in  The field element to be serialized
 */
void bytes_from_bls_field(Bytes32 *out, const fr_t *in) {
    blst_scalar s;
    blst_scalar_from_fr(&s, in);
    blst_bendian_from_scalar(out->bytes, &s);
}

/**
 * Convert untrusted bytes to a trusted and validated BLS scalar field element.
 *
 * @param[out]  out The field element to store the deserialized data
 * @param[in]   b   A 32-byte array containing the serialized field element
 */
C_KZG_RET bytes_to_bls_field(fr_t *out, const Bytes32 *b) {
    blst_scalar tmp;
    blst_scalar_from_bendian(&tmp, b->bytes);
    if (!blst_scalar_fr_check(&tmp)) return C_KZG_BADARGS;
    blst_fr_from_scalar(out, &tmp);
    return C_KZG_OK;
}

/**
 * Perform BLS validation required by the types KZGProof and KZGCommitment.
 *
 * @param[out]  out The output g1 point
 * @param[in]   b   The proof/commitment bytes
 *
 * @remark This function deviates from the spec because it returns (via an output argument) the g1
 * point. This way is more efficient (faster) but the function name is a bit misleading.
 */
static C_KZG_RET validate_kzg_g1(g1_t *out, const Bytes48 *b) {
    blst_p1_affine p1_affine;

    /* Convert the bytes to a p1 point */
    /* The uncompress routine checks that the point is on the curve */
    if (blst_p1_uncompress(&p1_affine, b->bytes) != BLST_SUCCESS) return C_KZG_BADARGS;
    blst_p1_from_affine(out, &p1_affine);

    /* The point at infinity is accepted! */
    if (blst_p1_is_inf(out)) return C_KZG_OK;
    /* The point must be on the right subgroup */
    if (!blst_p1_in_g1(out)) return C_KZG_BADARGS;

    return C_KZG_OK;
}

/**
 * Convert untrusted bytes into a trusted and validated KZGCommitment.
 *
 * @param[out]  out The output commitment
 * @param[in]   b   The commitment bytes
 */
C_KZG_RET bytes_to_kzg_commitment(g1_t *out, const Bytes48 *b) {
    return validate_kzg_g1(out, b);
}

/**
 * Convert untrusted bytes into a trusted and validated KZGProof.
 *
 * @param[out]  out The output proof
 * @param[in]   b   The proof bytes
 */
C_KZG_RET bytes_to_kzg_proof(g1_t *out, const Bytes48 *b) {
    return validate_kzg_g1(out, b);
}

/**
 * Map bytes to a BLS field element.
 *
 * @param[out]  out The field element to store the result
 * @param[in]   b   A 32-byte array containing the input
 */
void hash_to_bls_field(fr_t *out, const Bytes32 *b) {
    blst_scalar tmp;
    blst_scalar_from_bendian(&tmp, b->bytes);
    blst_fr_from_scalar(out, &tmp);
}

/**
 * Print a Bytes32 to the console.
 *
 * @param[in]   bytes   The Bytes32 to print
 */
void print_bytes32(const Bytes32 *bytes) {
    for (size_t i = 0; i < 32; i++) {
        printf("%02x", bytes->bytes[i]);
    }
    printf("\n");
}

/**
 * Print a Bytes48 to the console.
 *
 * @param[in]   bytes   The Bytes48 to print
 */
void print_bytes48(const Bytes48 *bytes) {
    for (size_t i = 0; i < 48; i++) {
        printf("%02x", bytes->bytes[i]);
    }
    printf("\n");
}
