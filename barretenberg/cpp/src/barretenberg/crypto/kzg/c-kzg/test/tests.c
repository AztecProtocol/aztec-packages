/*
 * This file contains unit tests for C-KZG-4844.
 */
#include "ckzg.c"
#include "tinytest.h"

#include <assert.h>
#include <stdio.h>
#include <string.h>

#ifdef PROFILE
#include <gperftools/profiler.h>
#endif

////////////////////////////////////////////////////////////////////////////////////////////////////
// Globals
////////////////////////////////////////////////////////////////////////////////////////////////////

KZGSettings s;

////////////////////////////////////////////////////////////////////////////////////////////////////
// Helper functions
////////////////////////////////////////////////////////////////////////////////////////////////////

static void get_rand_bytes32(Bytes32 *out) {
    static uint64_t seed = 0;
    blst_sha256(out->bytes, (uint8_t *)&seed, sizeof(seed));
    seed++;
}

static void get_rand_field_element(Bytes32 *out) {
    fr_t tmp_fr;
    Bytes32 tmp_bytes;

    /*
     * Take 32 random bytes, make them an Fr, and then
     * turn the Fr back to a bytes array.
     */
    get_rand_bytes32(&tmp_bytes);
    hash_to_bls_field(&tmp_fr, &tmp_bytes);
    bytes_from_bls_field(out, &tmp_fr);
}

static void get_rand_fr(fr_t *out) {
    Bytes32 tmp_bytes;

    get_rand_bytes32(&tmp_bytes);
    hash_to_bls_field(out, &tmp_bytes);
}

static void get_rand_blob(Blob *out) {
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        get_rand_field_element((Bytes32 *)&out->bytes[i * 32]);
    }
}

static void get_rand_g1_bytes(Bytes48 *out) {
    C_KZG_RET ret;
    Blob blob;

    /*
     * Get the commitment to a random blob.
     * This commitment is a valid g1 point.
     */
    get_rand_blob(&blob);
    ret = blob_to_kzg_commitment(out, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);
}

static void get_rand_g1(g1_t *out) {
    Bytes32 tmp_bytes;

    get_rand_bytes32(&tmp_bytes);

    blst_hash_to_g1(out, tmp_bytes.bytes, 32, NULL, 0, NULL, 0);
}

static void get_rand_g2(g2_t *out) {
    Bytes32 tmp_bytes;

    get_rand_bytes32(&tmp_bytes);

    blst_hash_to_g2(out, tmp_bytes.bytes, 32, NULL, 0, NULL, 0);
}

static void bytes32_from_hex(Bytes32 *out, const char *hex) {
    int matches;
    for (size_t i = 0; i < sizeof(Bytes32); i++) {
        matches = sscanf(hex + i * 2, "%2hhx", &out->bytes[i]);
        ASSERT_EQUALS(matches, 1);
    }
}

static void bytes48_from_hex(Bytes48 *out, const char *hex) {
    int matches;
    for (size_t i = 0; i < sizeof(Bytes48); i++) {
        matches = sscanf(hex + i * 2, "%2hhx", &out->bytes[i]);
        ASSERT_EQUALS(matches, 1);
    }
}

static void get_rand_uint64(uint64_t *out) {
    Bytes32 b;
    get_rand_bytes32(&b);
    memcpy(out, b.bytes, sizeof(*out));
}

static void eval_poly(fr_t *out, fr_t *poly_coefficients, fr_t *x) {
    *out = poly_coefficients[FIELD_ELEMENTS_PER_BLOB - 1];
    for (size_t i = FIELD_ELEMENTS_PER_BLOB - 1; i > 0; i--) {
        blst_fr_mul(out, out, x);
        blst_fr_add(out, out, &poly_coefficients[i - 1]);
    }
}

static void eval_extended_poly(fr_t *out, fr_t *poly_coefficients, fr_t *x) {
    *out = poly_coefficients[FIELD_ELEMENTS_PER_EXT_BLOB - 1];
    for (size_t i = FIELD_ELEMENTS_PER_EXT_BLOB - 1; i > 0; i--) {
        blst_fr_mul(out, out, x);
        blst_fr_add(out, out, &poly_coefficients[i - 1]);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for memory allocation functions
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_c_kzg_malloc__succeeds_size_greater_than_zero(void) {
    void *ptr = NULL;
    C_KZG_RET ret = c_kzg_malloc(&ptr, 123);
    bool is_null = ptr == NULL;
    c_kzg_free(ptr);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ASSERT_EQUALS(is_null, false);
}

static void test_c_kzg_malloc__fails_size_equal_to_zero(void) {
    void *ptr = NULL;
    C_KZG_RET ret = c_kzg_malloc(&ptr, 0);
    bool is_null = ptr == NULL;
    c_kzg_free(ptr);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
    ASSERT_EQUALS(is_null, true);
}

static void test_c_kzg_malloc__fails_too_big(void) {
    void *ptr = NULL;
    C_KZG_RET ret = c_kzg_malloc(&ptr, UINT64_MAX);
    bool is_null = ptr == NULL;
    c_kzg_free(ptr);
    ASSERT_EQUALS(ret, C_KZG_MALLOC);
    ASSERT_EQUALS(is_null, true);
}

static void test_c_kzg_calloc__succeeds_size_greater_than_zero(void) {
    void *ptr = NULL;
    C_KZG_RET ret = c_kzg_calloc(&ptr, 123, 456);
    bool is_null = ptr == NULL;
    c_kzg_free(ptr);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ASSERT_EQUALS(is_null, false);
}

static void test_c_kzg_calloc__fails_count_equal_to_zero(void) {
    void *ptr = (void *)0x123;
    C_KZG_RET ret = c_kzg_calloc(&ptr, 0, 456);
    bool is_null = ptr == NULL;
    c_kzg_free(ptr);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
    ASSERT_EQUALS(is_null, true);
}

static void test_c_kzg_calloc__fails_size_equal_to_zero(void) {
    void *ptr = (void *)0x123;
    C_KZG_RET ret = c_kzg_calloc(&ptr, 123, 0);
    bool is_null = ptr == NULL;
    c_kzg_free(ptr);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
    ASSERT_EQUALS(is_null, true);
}

static void test_c_kzg_calloc__fails_too_big(void) {
    void *ptr = NULL;
    C_KZG_RET ret = c_kzg_calloc(&ptr, UINT64_MAX, UINT64_MAX);
    bool is_null = ptr == NULL;
    c_kzg_free(ptr);
    ASSERT_EQUALS(ret, C_KZG_MALLOC);
    ASSERT_EQUALS(is_null, true);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for fr_div
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_fr_div__by_one_is_equal(void) {
    fr_t a, q;

    get_rand_fr(&a);

    fr_div(&q, &a, &FR_ONE);

    bool ok = fr_equal(&q, &a);
    ASSERT_EQUALS(ok, true);
}

static void test_fr_div__by_itself_is_one(void) {
    fr_t a, q;

    get_rand_fr(&a);

    fr_div(&q, &a, &a);

    bool ok = fr_equal(&q, &FR_ONE);
    ASSERT_EQUALS(ok, true);
}

static void test_fr_div__specific_value(void) {
    fr_t a, b, q, check;

    fr_from_uint64(&a, 2345);
    fr_from_uint64(&b, 54321);
    blst_fr_from_hexascii(
        &check,
        (const byte *)("0x264d23155705ca938a1f22117681ea9759f348cb177a07ffe0813"
                       "de67e85c684")
    );

    fr_div(&q, &a, &b);

    bool ok = fr_equal(&q, &check);
    ASSERT_EQUALS(ok, true);
}

static void test_fr_div__succeeds_round_trip(void) {
    fr_t a, b, q, r;

    get_rand_fr(&a);
    get_rand_fr(&b);

    fr_div(&q, &a, &b);
    blst_fr_mul(&r, &q, &b);

    bool ok = fr_equal(&r, &a);
    ASSERT_EQUALS(ok, true);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for fr_pow
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_fr_pow__test_power_of_two(void) {
    fr_t a, r, check;

    fr_from_uint64(&a, 2);
    fr_from_uint64(&check, 0x100000000);

    fr_pow(&r, &a, 32);

    bool ok = fr_equal(&r, &check);
    ASSERT_EQUALS(ok, true);
}

static void test_fr_pow__test_inverse_on_root_of_unity(void) {
    fr_t r;

    size_t order = log2_pow2(FIELD_ELEMENTS_PER_EXT_BLOB);
    fr_pow(&r, &ROOT_OF_UNITY, 1ULL << order);

    bool ok = fr_equal(&r, &FR_ONE);
    ASSERT_EQUALS(ok, true);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for fr_batch_inv
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_fr_batch_inv__test_consistent(void) {
    C_KZG_RET ret;
    fr_t a[32], batch_inverses[32], check_inverses[32];

    for (size_t i = 0; i < 32; i++) {
        get_rand_fr(&a[i]);
        blst_fr_eucl_inverse(&check_inverses[i], &a[i]);
    }

    ret = fr_batch_inv(batch_inverses, a, 32);
    ASSERT_EQUALS(ret, C_KZG_OK);

    for (size_t i = 0; i < 32; i++) {
        bool ok = fr_equal(&check_inverses[i], &batch_inverses[i]);
        ASSERT_EQUALS(ok, true);
    }
}

/** Make sure that batch inverse doesn't support zeroes */
static void test_fr_batch_inv__test_zero(void) {
    C_KZG_RET ret;
    fr_t a[32], batch_inverses[32];

    for (size_t i = 0; i < 32; i++) {
        get_rand_fr(&a[i]);
    }

    a[5] = FR_ZERO;

    ret = fr_batch_inv(batch_inverses, a, 32);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for g1_mul
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_g1_mul__test_consistent(void) {
    blst_scalar scalar;
    Bytes32 b;
    fr_t f;
    g1_t g, r, check;

    get_rand_field_element(&b);
    blst_scalar_from_lendian(&scalar, b.bytes);
    blst_fr_from_scalar(&f, &scalar);

    get_rand_g1(&g);

    blst_p1_mult(&check, &g, (const byte *)&b, 256);
    g1_mul(&r, &g, &f);

    ASSERT("points are equal", blst_p1_is_equal(&check, &r));
}

static void test_g1_mul__test_scalar_is_zero(void) {
    fr_t f;
    g1_t g, r;

    fr_from_uint64(&f, 0);
    get_rand_g1(&g);

    g1_mul(&r, &g, &f);

    ASSERT("result is neutral element", blst_p1_is_inf(&r));
}

static void test_g1_mul__test_different_bit_lengths(void) {
    Bytes32 b;
    fr_t f, two;
    g1_t g, r, check;
    blst_scalar scalar;

    fr_from_uint64(&f, 1);
    fr_from_uint64(&two, 2);
    blst_scalar_from_fr(&scalar, &f);
    /* blst_p1_mult needs it to be little-endian */
    blst_lendian_from_scalar(b.bytes, &scalar);

    for (size_t i = 1; i < 255; i++) {
        get_rand_g1(&g);

        blst_p1_mult(&check, &g, b.bytes, 256);
        g1_mul(&r, &g, &f);

        ASSERT("points are equal", blst_p1_is_equal(&check, &r));

        blst_fr_mul(&f, &f, &two);
        blst_scalar_from_fr(&scalar, &f);
        blst_lendian_from_scalar(b.bytes, &scalar);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for pairings_verify
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_pairings_verify__good_pairing(void) {
    fr_t f;
    g1_t g1, sg1;
    g2_t g2, sg2;

    get_rand_fr(&f);

    get_rand_g1(&g1);
    get_rand_g2(&g2);

    g1_mul(&sg1, &g1, &f);
    g2_mul(&sg2, &g2, &f);

    ASSERT("pairings verify", pairings_verify(&g1, &sg2, &sg1, &g2));
}

static void test_pairings_verify__bad_pairing(void) {
    fr_t f, splusone;
    g1_t g1, sg1;
    g2_t g2, s1g2;

    get_rand_fr(&f);
    blst_fr_add(&splusone, &f, &FR_ONE);

    get_rand_g1(&g1);
    get_rand_g2(&g2);

    g1_mul(&sg1, &g1, &f);
    g2_mul(&s1g2, &g2, &splusone);

    ASSERT("pairings fail", !pairings_verify(&g1, &s1g2, &sg1, &g2));
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for blob_to_kzg_commitment
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_blob_to_kzg_commitment__succeeds_x_less_than_modulus(void) {
    C_KZG_RET ret;
    KZGCommitment c;
    Blob blob;
    Bytes32 field_element;

    /*
     * A valid field element is x < BLS_MODULUS.
     * Therefore, x = BLS_MODULUS - 1 should be valid.
     *
     * int(BLS_MODULUS - 1).to_bytes(32, 'big').hex()
     */
    bytes32_from_hex(
        &field_element, "73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000000"
    );

    memset(&blob, 0, sizeof(blob));
    memcpy(blob.bytes, field_element.bytes, BYTES_PER_FIELD_ELEMENT);
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);
}

static void test_blob_to_kzg_commitment__fails_x_equal_to_modulus(void) {
    C_KZG_RET ret;
    KZGCommitment c;
    Blob blob;
    Bytes32 field_element;

    /*
     * A valid field element is x < BLS_MODULUS.
     * Therefore, x = BLS_MODULUS should be invalid.
     *
     * int(BLS_MODULUS).to_bytes(32, 'big').hex()
     */
    bytes32_from_hex(
        &field_element, "73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001"
    );

    memset(&blob, 0, sizeof(blob));
    memcpy(blob.bytes, field_element.bytes, BYTES_PER_FIELD_ELEMENT);
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_blob_to_kzg_commitment__fails_x_greater_than_modulus(void) {
    C_KZG_RET ret;
    KZGCommitment c;
    Blob blob;
    Bytes32 field_element;

    /*
     * A valid field element is x < BLS_MODULUS.
     * Therefore, x = BLS_MODULUS + 1 should be invalid.
     *
     * int(BLS_MODULUS + 1).to_bytes(32, 'big').hex()
     */
    bytes32_from_hex(
        &field_element, "73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000002"
    );

    memset(&blob, 0, sizeof(blob));
    memcpy(blob.bytes, field_element.bytes, BYTES_PER_FIELD_ELEMENT);
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_blob_to_kzg_commitment__succeeds_point_at_infinity(void) {
    C_KZG_RET ret;
    KZGCommitment c;
    Blob blob;
    Bytes48 point_at_infinity;
    int diff;

    /* Get the commitment for a blob that's all zeros */
    memset(&blob, 0, sizeof(blob));
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* The commitment should be the serialized point at infinity */
    bytes48_from_hex(
        &point_at_infinity,
        "c00000000000000000000000000000000000000000000000"
        "000000000000000000000000000000000000000000000000"
    );
    diff = memcmp(c.bytes, point_at_infinity.bytes, BYTES_PER_COMMITMENT);
    ASSERT_EQUALS(diff, 0);
}

static void test_blob_to_kzg_commitment__succeeds_expected_commitment(void) {
    C_KZG_RET ret;
    KZGCommitment c;
    Blob blob;
    Bytes32 field_element;
    Bytes48 expected_commitment;
    int diff;

    bytes32_from_hex(
        &field_element, "14629a3a39f7b854e6aa49aa2edb450267eac2c14bb2d4f97a0b81a3f57055ad"
    );

    /* Initialize the blob with a single field element */
    memset(&blob, 0, sizeof(blob));
    memcpy(blob.bytes, field_element.bytes, BYTES_PER_FIELD_ELEMENT);

    /* Get a commitment to this particular blob */
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /*
     * We expect the commitment to match. If it doesn't
     * match, something important has changed.
     */
    bytes48_from_hex(
        &expected_commitment,
        "91a5e1c143820d2e7bec38a5404c5145807cb88c0abbbecb"
        "cb4bccc83a4b417326e337574cff43303f8a6648ecbee7ac"
    );
    diff = memcmp(c.bytes, expected_commitment.bytes, BYTES_PER_COMMITMENT);
    ASSERT_EQUALS(diff, 0);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for validate_kzg_g1
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_validate_kzg_g1__succeeds_round_trip(void) {
    C_KZG_RET ret;
    Bytes48 a, b;
    g1_t g1;
    int diff;

    get_rand_g1_bytes(&a);
    ret = validate_kzg_g1(&g1, &a);
    ASSERT_EQUALS(ret, C_KZG_OK);
    bytes_from_g1(&b, &g1);

    diff = memcmp(a.bytes, b.bytes, sizeof(Bytes48));
    ASSERT_EQUALS(diff, 0);
}

static void test_validate_kzg_g1__succeeds_correct_point(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "a491d1b0ecd9bb917989f0e74f0dea0422eac4a873e5e264"
        "4f368dffb9a6e20fd6e10c1b77654d067c0618f6e5a7f79a"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_OK);
}

static void test_validate_kzg_g1__fails_not_in_g1(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_not_in_curve(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcde0"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_x_equal_to_modulus(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "9a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf"
        "6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_x_greater_than_modulus(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "9a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf"
        "6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaac"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__succeeds_infinity_with_true_b_flag(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "c00000000000000000000000000000000000000000000000"
        "000000000000000000000000000000000000000000000000"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_OK);
}

static void test_validate_kzg_g1__fails_infinity_with_true_b_flag(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "c01000000000000000000000000000000000000000000000"
        "000000000000000000000000000000000000000000000000"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_infinity_with_false_b_flag(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "800000000000000000000000000000000000000000000000"
        "000000000000000000000000000000000000000000000000"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_with_wrong_c_flag(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "0123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_with_b_flag_and_x_nonzero(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "c123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_with_b_flag_and_a_flag_true(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "e00000000000000000000000000000000000000000000000"
        "000000000000000000000000000000000000000000000000"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_with_mask_bits_111(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "e491d1b0ecd9bb917989f0e74f0dea0422eac4a873e5e264"
        "4f368dffb9a6e20fd6e10c1b77654d067c0618f6e5a7f79a"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_with_mask_bits_011(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "6491d1b0ecd9bb917989f0e74f0dea0422eac4a873e5e264"
        "4f368dffb9a6e20fd6e10c1b77654d067c0618f6e5a7f79a"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_validate_kzg_g1__fails_with_mask_bits_001(void) {
    C_KZG_RET ret;
    Bytes48 g1_bytes;
    g1_t g1;

    bytes48_from_hex(
        &g1_bytes,
        "2491d1b0ecd9bb917989f0e74f0dea0422eac4a873e5e264"
        "4f368dffb9a6e20fd6e10c1b77654d067c0618f6e5a7f79a"
    );
    ret = validate_kzg_g1(&g1, &g1_bytes);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for reverse_bits
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_reverse_bits__succeeds_round_trip(void) {
    uint64_t original;
    uint64_t reversed;
    uint64_t reversed_reversed;

    get_rand_uint64(&original);
    reversed = reverse_bits(original);
    reversed_reversed = reverse_bits(reversed);
    ASSERT_EQUALS(reversed_reversed, original);
}

static void test_reverse_bits__succeeds_all_bits_are_zero(void) {
    uint64_t original = 0;
    uint64_t reversed = 0;
    ASSERT_EQUALS(reverse_bits(original), reversed);
}

static void test_reverse_bits__succeeds_some_bits_are_one(void) {
    uint64_t original = 17004747765872328575ULL;
    uint64_t reversed = 18374677679283584983ULL;
    ASSERT_EQUALS(reverse_bits(original), reversed);
}

static void test_reverse_bits__succeeds_all_bits_are_one(void) {
    uint64_t original = 18446744073709551615ULL;
    uint64_t reversed = 18446744073709551615ULL;
    ASSERT_EQUALS(reverse_bits(original), reversed);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for bit_reversal_permutation
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_bit_reversal_permutation__succeeds_round_trip(void) {
    C_KZG_RET ret;
    uint64_t original[128];
    uint64_t reversed_reversed[128];

    for (size_t i = 0; i < 128; i++) {
        get_rand_uint64(&original[i]);
        reversed_reversed[i] = original[i];
    }
    ret = bit_reversal_permutation(&reversed_reversed, sizeof(uint64_t), 128);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ret = bit_reversal_permutation(&reversed_reversed, sizeof(uint64_t), 128);
    ASSERT_EQUALS(ret, C_KZG_OK);
    for (size_t i = 0; i < 128; i++) {
        ASSERT_EQUALS(reversed_reversed[i], original[i]);
    }
}

static void test_bit_reversal_permutation__specific_items(void) {
    C_KZG_RET ret;
    uint64_t original[128];
    uint64_t reversed[128];

    for (size_t i = 0; i < 128; i++) {
        get_rand_uint64(&original[i]);
        reversed[i] = original[i];
    }
    ret = bit_reversal_permutation(&reversed, sizeof(uint64_t), 128);
    ASSERT_EQUALS(ret, C_KZG_OK);

    // Test the first 8 elements of the bit reversal permutation
    // This tests the ordering of the values, not the values themselves,
    // so is independent of the randomness used to initialize original[]
    ASSERT_EQUALS(reversed[0], original[0]);
    ASSERT_EQUALS(reversed[1], original[64]);
    ASSERT_EQUALS(reversed[2], original[32]);
    ASSERT_EQUALS(reversed[3], original[96]);
    ASSERT_EQUALS(reversed[4], original[16]);
    ASSERT_EQUALS(reversed[5], original[80]);
    ASSERT_EQUALS(reversed[6], original[48]);
    ASSERT_EQUALS(reversed[7], original[112]);
}

static void test_bit_reversal_permutation__coset_structure(void) {
    C_KZG_RET ret;
    uint64_t original[256];
    uint64_t reversed[256];

    for (size_t i = 0; i < 256; i++) {
        original[i] = i % 16;
        reversed[i] = original[i];
    }
    ret = bit_reversal_permutation(&reversed, sizeof(uint64_t), 256);
    ASSERT_EQUALS(ret, C_KZG_OK);
    for (size_t i = 0; i < 16; i++) {
        for (size_t j = 1; j < 16; j++) {
            ASSERT_EQUALS(reversed[16 * i], reversed[16 * i + j]);
        }
    }
}

static void test_bit_reversal_permutation__fails_n_not_power_of_two(void) {
    C_KZG_RET ret;
    uint64_t reversed[256];

    for (size_t i = 0; i < 256; i++) {
        reversed[i] = 0;
    }
    ret = bit_reversal_permutation(&reversed, sizeof(uint64_t), 255);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_bit_reversal_permutation__n_is_zero(void) {
    C_KZG_RET ret;
    ret = bit_reversal_permutation(NULL, sizeof(uint64_t), 0);
    ASSERT_EQUALS(ret, C_KZG_OK);
}

static void test_bit_reversal_permutation__n_is_one(void) {
    C_KZG_RET ret;
    uint64_t reversed[1];

    for (size_t i = 0; i < 1; i++) {
        reversed[i] = 0;
    }
    ret = bit_reversal_permutation(&reversed, sizeof(uint64_t), 1);
    ASSERT_EQUALS(ret, C_KZG_OK);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for compute_powers
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_compute_powers__succeeds_expected_powers(void) {
    C_KZG_RET ret;
    Bytes32 field_element_bytes;
    fr_t field_element_fr;
    const size_t n = 3;
    int diff;
    fr_t powers[n];
    Bytes32 powers_bytes[n];
    Bytes32 expected_bytes[n];

    /* Convert random field element to a fr_t */
    bytes32_from_hex(
        &field_element_bytes, "1bf5410da0468196b4e242ca17617331d238ba5e586198bd42ebd7252919c3e1"
    );
    ret = bytes_to_bls_field(&field_element_fr, &field_element_bytes);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Compute three powers for the given field element */
    compute_powers((fr_t *)&powers, &field_element_fr, n);

    /*
     * These are the expected results. Notable, the first element should always
     * be 1 since x^0 is 1. The second element should be equivalent to the
     * input field element. The third element can be verified with Python.
     */
    bytes32_from_hex(
        &expected_bytes[0], "0000000000000000000000000000000000000000000000000000000000000001"
    );
    bytes32_from_hex(
        &expected_bytes[1], "1bf5410da0468196b4e242ca17617331d238ba5e586198bd42ebd7252919c3e1"
    );

    /*
     * b = bytes.fromhex("1bf5410da0468196b...")
     * i = (int.from_bytes(b, "big") ** 2) % BLS_MODULUS
     * print(i.to_bytes(32, "big").hex())
     */
    bytes32_from_hex(
        &expected_bytes[2], "2f417bcb88693ff8bc5d61b6d44503f3a99e8c3df3891e0040dee96047458a0e"
    );

    for (size_t i = 0; i < n; i++) {
        bytes_from_bls_field(&powers_bytes[i], &powers[i]);
        diff = memcmp(powers_bytes[i].bytes, expected_bytes[i].bytes, sizeof(Bytes32));
        ASSERT_EQUALS(diff, 0);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for g1_lincomb
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_g1_lincomb__verify_consistent(void) {
    C_KZG_RET ret;
    g1_t points[128], out, check;
    fr_t scalars[128];

    check = G1_IDENTITY;
    for (size_t i = 0; i < 128; i++) {
        get_rand_fr(&scalars[i]);
        get_rand_g1(&points[i]);
    }

    g1_lincomb_naive(&check, points, scalars, 128);

    ret = g1_lincomb_fast(&out, points, scalars, 128);
    ASSERT_EQUALS(ret, C_KZG_OK);

    ASSERT("pippenger matches naive MSM", blst_p1_is_equal(&out, &check));
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for evaluate_polynomial_in_evaluation_form
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_evaluate_polynomial_in_evaluation_form__constant_polynomial(void) {
    C_KZG_RET ret;
    fr_t p[FIELD_ELEMENTS_PER_BLOB];
    fr_t x, y, c;

    get_rand_fr(&c);
    get_rand_fr(&x);

    for (size_t i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        p[i] = c;
    }

    ret = evaluate_polynomial_in_evaluation_form(&y, p, &x, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    ASSERT("evaluation matches constant", fr_equal(&y, &c));
}

static void test_evaluate_polynomial_in_evaluation_form__constant_polynomial_in_range(void) {
    C_KZG_RET ret;
    fr_t p[FIELD_ELEMENTS_PER_BLOB];
    fr_t x, y, c;

    get_rand_fr(&c);
    x = s.brp_roots_of_unity[123];

    for (size_t i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        p[i] = c;
    }

    ret = evaluate_polynomial_in_evaluation_form(&y, p, &x, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    ASSERT("evaluation matches constant", fr_equal(&y, &c));
}

static void test_evaluate_polynomial_in_evaluation_form__random_polynomial(void) {
    C_KZG_RET ret;
    fr_t poly_coefficients[FIELD_ELEMENTS_PER_BLOB];
    fr_t p[FIELD_ELEMENTS_PER_BLOB];
    fr_t x, y, check;

    for (size_t i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        get_rand_fr(&poly_coefficients[i]);
    }

    for (size_t i = 0; i < FIELD_ELEMENTS_PER_BLOB; i++) {
        eval_poly(&p[i], poly_coefficients, &s.brp_roots_of_unity[i]);
    }

    get_rand_fr(&x);
    eval_poly(&check, poly_coefficients, &x);

    ret = evaluate_polynomial_in_evaluation_form(&y, p, &x, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    ASSERT("evaluation methods match", fr_equal(&y, &check));

    x = s.brp_roots_of_unity[123];

    eval_poly(&check, poly_coefficients, &x);

    ret = evaluate_polynomial_in_evaluation_form(&y, p, &x, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    ASSERT("evaluation methods match", fr_equal(&y, &check));
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for log2_pow2
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_log2_pow2__succeeds_expected_values(void) {
    uint64_t x = 1;
    for (size_t i = 0; i < 31; i++) {
        ASSERT_EQUALS(i, log2_pow2(x));
        x <<= 1;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for is_power_of_two
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_is_power_of_two__succeeds_powers_of_two(void) {
    uint64_t x = 1;
    for (size_t i = 0; i < 63; i++) {
        ASSERT("is_power_of_two good", is_power_of_two(x));
        x <<= 1;
    }
}

static void test_is_power_of_two__fails_not_powers_of_two(void) {
    uint64_t x = 4;
    for (size_t i = 2; i < 63; i++) {
        ASSERT("is_power_of_two bad", !is_power_of_two(x + 1));
        ASSERT("is_power_of_two bad", !is_power_of_two(x - 1));
        x <<= 1;
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for compute_kzg_proof
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_compute_kzg_proof__succeeds_expected_proof(void) {
    C_KZG_RET ret;
    Blob blob;
    fr_t poly[FIELD_ELEMENTS_PER_BLOB];
    fr_t y_fr, z_fr;
    Bytes32 input_value, output_value, field_element, expected_output_value;
    Bytes48 proof, expected_proof;
    int diff;

    bytes32_from_hex(
        &field_element, "69386e69dbae0357b399b8d645a57a3062dfbe00bd8e97170b9bdd6bc6168a13"
    );
    bytes32_from_hex(
        &input_value, "03ea4fb841b4f9e01aa917c5e40dbd67efb4b8d4d9052069595f0647feba320d"
    );

    /* Initialize the blob with a single field element */
    memset(&blob, 0, sizeof(blob));
    memcpy(blob.bytes, field_element.bytes, BYTES_PER_FIELD_ELEMENT);

    /* Compute the KZG proof for the given blob & z */
    ret = compute_kzg_proof(&proof, &output_value, &blob, &input_value, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    bytes48_from_hex(
        &expected_proof,
        "b21f8f9b85e52fd9c4a6d4fb4e9a27ebdc5a09c3f5ca17f6"
        "bcd85c26f04953b0e6925607aaebed1087e5cc2fe4b2b356"
    );

    /* Compare the computed proof to the expected proof */
    diff = memcmp(proof.bytes, expected_proof.bytes, sizeof(Bytes48));
    ASSERT_EQUALS(diff, 0);

    /* Get the expected y by evaluating the polynomial at input_value */
    ret = blob_to_polynomial(poly, &blob);
    ASSERT_EQUALS(ret, C_KZG_OK);

    ret = bytes_to_bls_field(&z_fr, &input_value);
    ASSERT_EQUALS(ret, C_KZG_OK);

    ret = evaluate_polynomial_in_evaluation_form(&y_fr, poly, &z_fr, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    bytes_from_bls_field(&expected_output_value, &y_fr);

    /* Compare the computed y to the expected y */
    diff = memcmp(output_value.bytes, expected_output_value.bytes, sizeof(Bytes32));
    ASSERT_EQUALS(diff, 0);
}

static void test_compute_and_verify_kzg_proof__succeeds_round_trip(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    Bytes32 z, y, computed_y;
    KZGCommitment c;
    Blob blob;
    fr_t poly[FIELD_ELEMENTS_PER_BLOB];
    fr_t y_fr, z_fr;
    bool ok;
    int diff;

    get_rand_field_element(&z);
    get_rand_blob(&blob);

    /* Get a commitment to that particular blob */
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Compute the proof */
    ret = compute_kzg_proof(&proof, &computed_y, &blob, &z, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /*
     * Now let's attempt to verify the proof.
     * First convert the blob to field elements.
     */
    ret = blob_to_polynomial(poly, &blob);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Also convert z to a field element */
    ret = bytes_to_bls_field(&z_fr, &z);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Now evaluate the poly at `z` to learn `y` */
    ret = evaluate_polynomial_in_evaluation_form(&y_fr, poly, &z_fr, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Now also get `y` in bytes */
    bytes_from_bls_field(&y, &y_fr);

    /* Compare the recently evaluated y to the computed y */
    diff = memcmp(y.bytes, computed_y.bytes, sizeof(Bytes32));
    ASSERT_EQUALS(diff, 0);

    /* Finally verify the proof */
    ret = verify_kzg_proof(&ok, &c, &z, &y, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ASSERT_EQUALS(ok, true);
}

static void test_compute_and_verify_kzg_proof__succeeds_within_domain(void) {
    for (size_t i = 0; i < 25; i++) {
        C_KZG_RET ret;
        Blob blob;
        KZGCommitment c;
        fr_t poly[FIELD_ELEMENTS_PER_BLOB];
        Bytes48 proof;
        Bytes32 z, y, computed_y;
        fr_t y_fr, z_fr;
        bool ok;
        int diff;

        get_rand_blob(&blob);

        /* Get a commitment to that particular blob */
        ret = blob_to_kzg_commitment(&c, &blob, &s);
        ASSERT_EQUALS(ret, C_KZG_OK);

        /* Get the polynomial version of the blob */
        ret = blob_to_polynomial(poly, &blob);
        ASSERT_EQUALS(ret, C_KZG_OK);

        z_fr = s.brp_roots_of_unity[i];
        bytes_from_bls_field(&z, &z_fr);

        /* Compute the proof */
        ret = compute_kzg_proof(&proof, &computed_y, &blob, &z, &s);
        ASSERT_EQUALS(ret, C_KZG_OK);

        /* Now evaluate the poly at `z` to learn `y` */
        ret = evaluate_polynomial_in_evaluation_form(&y_fr, poly, &z_fr, &s);
        ASSERT_EQUALS(ret, C_KZG_OK);

        /* Now also get `y` in bytes */
        bytes_from_bls_field(&y, &y_fr);

        /* Compare the recently evaluated y to the computed y */
        diff = memcmp(y.bytes, computed_y.bytes, sizeof(Bytes32));
        ASSERT_EQUALS(diff, 0);

        /* Finally verify the proof */
        ret = verify_kzg_proof(&ok, &c, &z, &y, &proof, &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
        ASSERT_EQUALS(ok, true);
    }
}

static void test_compute_and_verify_kzg_proof__fails_incorrect_proof(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    g1_t proof_g1;
    Bytes32 z, y, computed_y;
    KZGCommitment c;
    Blob blob;
    fr_t poly[FIELD_ELEMENTS_PER_BLOB];
    fr_t y_fr, z_fr;
    bool ok;

    get_rand_field_element(&z);
    get_rand_blob(&blob);

    /* Get a commitment to that particular blob */
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Compute the proof */
    ret = compute_kzg_proof(&proof, &computed_y, &blob, &z, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /*
     * Now let's attempt to verify the proof.
     * First convert the blob to field elements.
     */
    ret = blob_to_polynomial(poly, &blob);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Also convert z to a field element */
    ret = bytes_to_bls_field(&z_fr, &z);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Now evaluate the poly at `z` to learn `y` */
    ret = evaluate_polynomial_in_evaluation_form(&y_fr, poly, &z_fr, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Now also get `y` in bytes */
    bytes_from_bls_field(&y, &y_fr);

    /* Change the proof so it should not verify */
    ret = bytes_to_kzg_commitment(&proof_g1, &proof);
    ASSERT_EQUALS(ret, C_KZG_OK);
    blst_p1_add(&proof_g1, &proof_g1, blst_p1_generator());
    bytes_from_g1(&proof, &proof_g1);

    /* Finally verify the proof */
    ret = verify_kzg_proof(&ok, &c, &z, &y, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ASSERT_EQUALS(ok, 0);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for verify_kzg_proof
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_verify_kzg_proof__fails_proof_not_in_g1(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Bytes32 y, z;
    bool ok;

    get_rand_g1_bytes(&c);
    get_rand_field_element(&z);
    get_rand_field_element(&y);
    bytes48_from_hex(
        &proof,
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );

    ret = verify_kzg_proof(&ok, &c, &z, &y, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_verify_kzg_proof__fails_commitment_not_in_g1(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Bytes32 y, z;
    bool ok;

    bytes48_from_hex(
        &c,
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    get_rand_field_element(&z);
    get_rand_field_element(&y);
    get_rand_g1_bytes(&proof);

    ret = verify_kzg_proof(&ok, &c, &z, &y, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_verify_kzg_proof__fails_z_not_field_element(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Bytes32 y, z;
    bool ok;

    get_rand_g1_bytes(&c);
    bytes32_from_hex(&z, "73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001");
    get_rand_field_element(&y);
    get_rand_g1_bytes(&proof);

    ret = verify_kzg_proof(&ok, &c, &z, &y, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_verify_kzg_proof__fails_y_not_field_element(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Bytes32 y, z;
    bool ok;

    get_rand_g1_bytes(&c);
    get_rand_field_element(&z);
    bytes32_from_hex(&y, "73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001");
    get_rand_g1_bytes(&proof);

    ret = verify_kzg_proof(&ok, &c, &z, &y, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for compute_blob_kzg_proof
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_compute_and_verify_blob_kzg_proof__succeeds_round_trip(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Blob blob;
    bool ok;

    /* Some preparation */
    get_rand_blob(&blob);
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Compute the proof */
    ret = compute_blob_kzg_proof(&proof, &blob, &c, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Finally verify the proof */
    ret = verify_blob_kzg_proof(&ok, &blob, &c, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ASSERT_EQUALS(ok, true);
}

static void test_compute_and_verify_blob_kzg_proof__fails_incorrect_proof(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    g1_t proof_g1;
    KZGCommitment c;
    Blob blob;
    bool ok;

    /* Some preparation */
    get_rand_blob(&blob);
    ret = blob_to_kzg_commitment(&c, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Compute the proof */
    ret = compute_blob_kzg_proof(&proof, &blob, &c, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Change the proof so it should not verify */
    ret = bytes_to_kzg_commitment(&proof_g1, &proof);
    ASSERT_EQUALS(ret, C_KZG_OK);
    blst_p1_add(&proof_g1, &proof_g1, blst_p1_generator());
    bytes_from_g1(&proof, &proof_g1);

    /* Finally verify the proof */
    ret = verify_blob_kzg_proof(&ok, &blob, &c, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ASSERT_EQUALS(ok, false);
}

static void test_compute_and_verify_blob_kzg_proof__fails_proof_not_in_g1(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Blob blob;
    bool ok;

    /* Some preparation */
    get_rand_blob(&blob);
    get_rand_g1_bytes(&c);
    bytes48_from_hex(
        &proof,
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );

    /* Finally verify the proof */
    ret = verify_blob_kzg_proof(&ok, &blob, &c, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_compute_and_verify_blob_kzg_proof__fails_compute_commitment_not_in_g1(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Blob blob;

    /* Some preparation */
    get_rand_blob(&blob);
    bytes48_from_hex(
        &c,
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );

    /* Finally compute the proof */
    ret = compute_blob_kzg_proof(&proof, &blob, &c, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_compute_and_verify_blob_kzg_proof__fails_verify_commitment_not_in_g1(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    KZGCommitment c;
    Blob blob;
    bool ok;

    /* Some preparation */
    get_rand_blob(&blob);
    bytes48_from_hex(
        &c,
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );
    get_rand_g1_bytes(&proof);

    /* Finally verify the proof */
    ret = verify_blob_kzg_proof(&ok, &blob, &c, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_compute_and_verify_blob_kzg_proof__fails_invalid_blob(void) {
    C_KZG_RET ret;
    Bytes48 proof;
    Bytes32 field_element;
    KZGCommitment c;
    Blob blob;
    bool ok;

    bytes32_from_hex(
        &field_element, "73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001"
    );
    memset(&blob, 0, sizeof(blob));
    memcpy(blob.bytes, field_element.bytes, BYTES_PER_FIELD_ELEMENT);
    get_rand_g1_bytes(&c);
    get_rand_g1_bytes(&proof);

    /* Finally verify the proof */
    ret = verify_blob_kzg_proof(&ok, &blob, &c, &proof, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for verify_kzg_proof_batch
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_verify_kzg_proof_batch__succeeds_round_trip(void) {
    C_KZG_RET ret;
    const size_t n_cells = 16;
    Bytes48 proofs[n_cells];
    KZGCommitment commitments[n_cells];
    Blob *blobs = NULL;
    bool ok;

    /* Allocate blobs because they are big */
    ret = c_kzg_malloc((void **)&blobs, n_cells * sizeof(Blob));
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Some preparation */
    for (size_t i = 0; i < n_cells; i++) {
        get_rand_blob(&blobs[i]);
        ret = blob_to_kzg_commitment(&commitments[i], &blobs[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
        ret = compute_blob_kzg_proof(&proofs[i], &blobs[i], &commitments[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
    }

    /* Verify batched proofs for 0,1,2..16 blobs */
    /* This should still work with zero blobs */
    for (size_t count = 0; count <= n_cells; count++) {
        ret = verify_blob_kzg_proof_batch(&ok, blobs, commitments, proofs, count, &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
        ASSERT_EQUALS(ok, true);
    }

    /* Free the blobs */
    c_kzg_free(blobs);
}

static void test_verify_kzg_proof_batch__fails_with_incorrect_proof(void) {
    C_KZG_RET ret;
    const size_t n_cells = 2;
    Bytes48 proofs[n_cells];
    KZGCommitment commitments[n_cells];
    Blob blobs[n_cells];
    bool ok;

    /* Some preparation */
    for (size_t i = 0; i < n_cells; i++) {
        get_rand_blob(&blobs[i]);
        ret = blob_to_kzg_commitment(&commitments[i], &blobs[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
        ret = compute_blob_kzg_proof(&proofs[i], &blobs[i], &commitments[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
    }

    /* Overwrite second proof with an incorrect one */
    proofs[1] = proofs[0];

    ret = verify_blob_kzg_proof_batch(&ok, blobs, commitments, proofs, n_cells, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);
    ASSERT_EQUALS(ok, false);
}

static void test_verify_kzg_proof_batch__fails_proof_not_in_g1(void) {
    C_KZG_RET ret;
    const size_t n_cells = 2;
    Bytes48 proofs[n_cells];
    KZGCommitment commitments[n_cells];
    Blob blobs[n_cells];
    bool ok;

    /* Some preparation */
    for (size_t i = 0; i < n_cells; i++) {
        get_rand_blob(&blobs[i]);
        ret = blob_to_kzg_commitment(&commitments[i], &blobs[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
        ret = compute_blob_kzg_proof(&proofs[i], &blobs[i], &commitments[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
    }

    /* Overwrite proof with one not in G1 */
    bytes48_from_hex(
        &proofs[1],
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );

    ret = verify_blob_kzg_proof_batch(&ok, blobs, commitments, proofs, n_cells, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_verify_kzg_proof_batch__fails_commitment_not_in_g1(void) {
    C_KZG_RET ret;
    const size_t n_cells = 2;
    Bytes48 proofs[n_cells];
    KZGCommitment commitments[n_cells];
    Blob blobs[n_cells];
    bool ok;

    /* Some preparation */
    for (size_t i = 0; i < n_cells; i++) {
        get_rand_blob(&blobs[i]);
        ret = blob_to_kzg_commitment(&commitments[i], &blobs[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
        ret = compute_blob_kzg_proof(&proofs[i], &blobs[i], &commitments[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
    }

    /* Overwrite proof with one not in G1 */
    bytes48_from_hex(
        &commitments[1],
        "8123456789abcdef0123456789abcdef0123456789abcdef"
        "0123456789abcdef0123456789abcdef0123456789abcdef"
    );

    ret = verify_blob_kzg_proof_batch(&ok, blobs, commitments, proofs, n_cells, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_verify_kzg_proof_batch__fails_invalid_blob(void) {
    C_KZG_RET ret;
    const size_t n_cells = 2;
    Bytes48 proofs[n_cells];
    KZGCommitment commitments[n_cells];
    Blob blobs[n_cells];
    Bytes32 field_element;
    bool ok;

    /* Some preparation */
    for (size_t i = 0; i < n_cells; i++) {
        get_rand_blob(&blobs[i]);
        ret = blob_to_kzg_commitment(&commitments[i], &blobs[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
        ret = compute_blob_kzg_proof(&proofs[i], &blobs[i], &commitments[i], &s);
        ASSERT_EQUALS(ret, C_KZG_OK);
    }

    /* Overwrite one field element in the blob with modulus */
    bytes32_from_hex(
        &field_element, "73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001"
    );
    memcpy(blobs[1].bytes, field_element.bytes, BYTES_PER_FIELD_ELEMENT);

    ret = verify_blob_kzg_proof_batch(&ok, blobs, commitments, proofs, n_cells, &s);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for expand_root_of_unity
////////////////////////////////////////////////////////////////////////////////////////////////////

/** The 2**7th (128th) root of unity. */
static uint64_t root_of_unity_parts_7[] = {
    0x5130c2c1660125beL, 0x98d0caac87f5713cL, 0xb7c68b4d7fdd60d0L, 0x6898111413588742L
};

/** The 2**8th (256th) root of unity. */
static uint64_t root_of_unity_parts_8[] = {
    0x4935bd2f817f694bL, 0x0a0865a899e8deffL, 0x6b368121ac0cf4adL, 0x4f9b4098e2e9f12eL
};

/**
 * The 2**13th (8192th) root of unity.
 *
 * @note We are removing the SCALE2_ROOT_OF_UNITY array and only exposing the root of unity we need,
 * but in fr_t form directly. For posterity, we have added this test to ensure the new value
 * matches. For EIP-7594, we need the 8192th root of unity, order of log2(8192)=13. Please confirm
 * that this value matches SCALE2_ROOT_OF_UNITY[13] as defined here:
 * https://github.com/ethereum/c-kzg-4844/blob/e3ef368c67c7877636c66d6c66beb1bcbf883493/src/setup/setup.h#L64
 */
static uint64_t root_of_unity_parts_13[] = {
    0x6fdd00bfc78c8967L, 0x146b58bc434906acL, 0x2ccddea2972e89edL, 0x485d512737b1da3dL
};

static void test_expand_root_of_unity__global_matches_expected(void) {
    fr_t root_of_unity;

    /* The global value*/
    blst_fr_from_uint64(&root_of_unity, root_of_unity_parts_13);
    ASSERT_EQUALS(fr_equal(&ROOT_OF_UNITY, &root_of_unity), true);
}

static void test_expand_root_of_unity__succeeds_with_root(void) {
    C_KZG_RET ret;
    fr_t roots[257], root_of_unity;

    blst_fr_from_uint64(&root_of_unity, root_of_unity_parts_8);

    /* We gave it the correct root of unity, so this should succeed */
    ret = expand_root_of_unity(roots, &root_of_unity, 256);
    ASSERT_EQUALS(ret, C_KZG_OK);
}

static void test_expand_root_of_unity__fails_not_root_of_unity(void) {
    C_KZG_RET ret;
    fr_t roots[257], root_of_unity;

    fr_from_uint64(&root_of_unity, 3);

    /* We gave it a bogus root of unity, so this should fail */
    ret = expand_root_of_unity(roots, &root_of_unity, 256);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

static void test_expand_root_of_unity__fails_wrong_root_of_unity(void) {
    C_KZG_RET ret;
    fr_t roots[257], root_of_unity;

    blst_fr_from_uint64(&root_of_unity, root_of_unity_parts_7);

    /* We expected the 2**8th root of unity, so this should fail */
    ret = expand_root_of_unity(roots, &root_of_unity, 256);
    ASSERT_EQUALS(ret, C_KZG_BADARGS);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for reconstruction
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_fft(void) {
    // TODO: Breaks with N=4096 or N=128 which are used in the protocol (see
    // issue 444)
    const size_t N = 8192;
    fr_t poly_eval[N];
    fr_t poly_coeff[N];
    fr_t recovered_poly_coeff[N];

    // Generate poly in coeff form
    for (size_t i = 0; i < N; i++) {
        get_rand_fr(&poly_coeff[i]);
    }

    /* Evaluate poly using FFT */
    fr_fft(poly_eval, poly_coeff, N, &s);

    /* check: result of FFT are really the evaluations of the poly */
    for (size_t i = 0; i < N; i++) {
        fr_t individual_evaluation;

        eval_extended_poly(&individual_evaluation, poly_coeff, &s.roots_of_unity[i]);

        bool ok = fr_equal(&individual_evaluation, &poly_eval[i]);
        ASSERT_EQUALS(ok, true);
    }

    /* Turn the eval poly back into a coeff poly */
    fr_ifft(recovered_poly_coeff, poly_eval, N, &s);

    /* Check the end-to-end journey */
    for (size_t i = 0; i < N; i++) {
        bool ok = fr_equal(&poly_coeff[i], &recovered_poly_coeff[i]);
        ASSERT_EQUALS(ok, true);
    }
}

static void test_coset_fft(void) {
    // TODO: Breaks with N=4096 or N=128 which are used in the protocol (see
    // issue 444)
    const size_t N = 8192;
    fr_t poly_eval[N];
    fr_t poly_coeff[N];
    fr_t recovered_poly_coeff[N];

    // Generate poly in coeff form
    for (size_t i = 0; i < N; i++) {
        get_rand_fr(&poly_coeff[i]);
    }

    /* Evaluate poly using coset FFT */
    coset_fft(poly_eval, poly_coeff, N, &s);

    /* check: result of coset FFT are really the evaluations over the coset */
    for (size_t i = 0; i < N; i++) {
        fr_t shifted_w;
        fr_t individual_evaluation;

        blst_fr_mul(&shifted_w, &s.roots_of_unity[i], &RECOVERY_SHIFT_FACTOR);

        eval_extended_poly(&individual_evaluation, poly_coeff, &shifted_w);

        bool ok = fr_equal(&individual_evaluation, &poly_eval[i]);
        ASSERT_EQUALS(ok, true);
    }

    /* Turn the eval poly back into a coeff poly */
    coset_ifft(recovered_poly_coeff, poly_eval, N, &s);

    /* Check the end-to-end journey */
    for (size_t i = 0; i < N; i++) {
        bool ok = fr_equal(&poly_coeff[i], &recovered_poly_coeff[i]);
        ASSERT_EQUALS(ok, true);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for deduplicate_commitments
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_deduplicate_commitments__one_duplicate(void) {
    Bytes48 commitments[4];
    uint64_t indices[4];
    size_t count = 4;

    memset(&commitments[0], 0, sizeof(Bytes48));
    memset(&commitments[1], 1, sizeof(Bytes48));
    memset(&commitments[2], 0, sizeof(Bytes48)); /* Duplicate */
    memset(&commitments[3], 3, sizeof(Bytes48));

    deduplicate_commitments(commitments, indices, &count);

    ASSERT_EQUALS(count, 3);
    ASSERT_EQUALS(indices[0], 0);
    ASSERT_EQUALS(indices[1], 1);
    ASSERT_EQUALS(indices[2], 0);
    ASSERT_EQUALS(indices[3], 2);
}

static void test_deduplicate_commitments__no_duplicates(void) {
    Bytes48 commitments[4];
    uint64_t indices[4];
    size_t count = 4;

    memset(&commitments[0], 0, sizeof(Bytes48));
    memset(&commitments[1], 1, sizeof(Bytes48));
    memset(&commitments[2], 2, sizeof(Bytes48));
    memset(&commitments[3], 3, sizeof(Bytes48));

    deduplicate_commitments(commitments, indices, &count);

    ASSERT_EQUALS(count, 4);
    ASSERT_EQUALS(indices[0], 0);
    ASSERT_EQUALS(indices[1], 1);
    ASSERT_EQUALS(indices[2], 2);
    ASSERT_EQUALS(indices[3], 3);
}

static void test_deduplicate_commitments__all_duplicates(void) {
    Bytes48 commitments[4];
    uint64_t indices[4];
    size_t count = 4;

    memset(&commitments[0], 0, sizeof(Bytes48));
    memset(&commitments[1], 0, sizeof(Bytes48)); /* Duplicate */
    memset(&commitments[2], 0, sizeof(Bytes48)); /* Duplicate */
    memset(&commitments[3], 0, sizeof(Bytes48)); /* Duplicate */

    deduplicate_commitments(commitments, indices, &count);

    ASSERT_EQUALS(count, 1);
    ASSERT_EQUALS(indices[0], 0);
    ASSERT_EQUALS(indices[1], 0);
    ASSERT_EQUALS(indices[2], 0);
    ASSERT_EQUALS(indices[3], 0);
}

static void test_deduplicate_commitments__no_commitments(void) {
    Bytes48 *commitments = NULL;
    uint64_t *indices = NULL;
    size_t count = 0;

    deduplicate_commitments(commitments, indices, &count);

    ASSERT_EQUALS(count, 0);
}

static void test_deduplicate_commitments__one_commitment(void) {
    Bytes48 commitments[1];
    uint64_t indices[1];
    size_t count = 1;

    memset(&commitments[0], 0, sizeof(Bytes48));

    deduplicate_commitments(commitments, indices, &count);

    ASSERT_EQUALS(count, 1);
    ASSERT_EQUALS(indices[0], 0);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for coset shift factors
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_shift_factors__succeeds(void) {
    fr_t expected_inv_coset_factor, computed_inv_coset_factor, h_k;
    fr_t expected_coset_factor_pow, computed_coset_factor_pow;
    static uint64_t n = FIELD_ELEMENTS_PER_CELL;

    /* Loop over all cells */
    for (uint64_t cell_index = 0; cell_index < CELLS_PER_EXT_BLOB; cell_index++) {
        /* Get the cell index in reverse-bit order */
        uint64_t cell_idx_rbl = reverse_bits_limited(CELLS_PER_EXT_BLOB, cell_index);

        /* Ensure the index is within bounds */
        assert(cell_idx_rbl < FIELD_ELEMENTS_PER_EXT_BLOB + 1);

        /* Get h_k for this cell */
        h_k = s.roots_of_unity[cell_idx_rbl];

        /* First we test get_inv_coset_shift_for_cell() */

        /* Compute the expected inverse coset factor */
        blst_fr_eucl_inverse(&expected_inv_coset_factor, &h_k);

        /* Call the function we are testing */
        get_inv_coset_shift_for_cell(&computed_inv_coset_factor, cell_index, &s);

        /* Compare the expected and computed inverse coset factors */
        bool ok = fr_equal(&expected_inv_coset_factor, &computed_inv_coset_factor);
        ASSERT_EQUALS(ok, true);

        /* Now we test get_coset_shift_pow_for_cell() */

        /* Compute the expected coset factor h_k^n */
        fr_pow(&expected_coset_factor_pow, &h_k, n);

        /* Now call the function we are testing */
        get_coset_shift_pow_for_cell(&computed_coset_factor_pow, cell_index, &s);

        /* Compare the expected and computed inverse coset factors */
        ok = fr_equal(&expected_coset_factor_pow, &computed_coset_factor_pow);
        ASSERT_EQUALS(ok, true);
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for recover_cells_and_kzg_proofs
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_recover_cells_and_kzg_proofs__succeeds_random_blob(void) {
    C_KZG_RET ret;
    Blob blob;
    const size_t num_partial_cells = CELLS_PER_EXT_BLOB / 2;
    uint64_t cell_indices[CELLS_PER_EXT_BLOB];
    Cell cells[CELLS_PER_EXT_BLOB];
    Cell partial_cells[num_partial_cells];
    Cell recovered_cells[CELLS_PER_EXT_BLOB];
    KZGProof proofs[CELLS_PER_EXT_BLOB];
    KZGProof recovered_proofs[CELLS_PER_EXT_BLOB];
    int diff;

    /* Get a random blob */
    get_rand_blob(&blob);

    /* Get the cells and proofs */
    ret = compute_cells_and_kzg_proofs(cells, proofs, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Erase half of the cells */
    for (size_t i = 0; i < num_partial_cells; i++) {
        cell_indices[i] = i * 2;
        memcpy(&partial_cells[i], &cells[cell_indices[i]], sizeof(Cell));
    }

    /* Reconstruct with half of the cells */
    ret = recover_cells_and_kzg_proofs(
        recovered_cells, recovered_proofs, cell_indices, partial_cells, num_partial_cells, &s
    );
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Check that all of the cells match */
    for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
        diff = memcmp(&cells[i], &recovered_cells[i], sizeof(Cell));
        ASSERT_EQUALS(diff, 0);
        diff = memcmp(&proofs[i], &recovered_proofs[i], sizeof(KZGProof));
        ASSERT_EQUALS(diff, 0);
    }
}

static void test_compute_vanishing_polynomial_from_roots(void) {
    /*
     * Test case: (x - 2)(x - 3)
     *
     * Expected result: x^2 - 5x + 6
     */

    /* Initialize array with the roots 2 and 3 */
    fr_t roots[2];
    fr_from_uint64(&roots[0], 2);
    fr_from_uint64(&roots[1], 3);
    size_t roots_len = 2;

    fr_t poly[3];
    size_t poly_len = 3;

    compute_vanishing_polynomial_from_roots(poly, &poly_len, roots, roots_len);

    fr_t expected[3];

    fr_from_uint64(&expected[0], 6);

    /* Negate 5 */
    fr_from_uint64(&expected[1], 5);
    blst_fr_cneg(&expected[1], &expected[1], true);

    expected[2] = FR_ONE;

    ASSERT("polynomial length is 3", poly_len == 3);
    ASSERT("coefficient 0 are equal", fr_equal(&poly[0], &expected[0]));
    ASSERT("coefficient 1 are equal", fr_equal(&poly[1], &expected[1]));
    ASSERT("coefficient 2 are equal", fr_equal(&poly[2], &expected[2]));
}

static void test_vanishing_polynomial_for_missing_cells(void) {
    C_KZG_RET ret;

    fr_t vanishing_poly[FIELD_ELEMENTS_PER_EXT_BLOB];
    fr_t fft_result[FIELD_ELEMENTS_PER_EXT_BLOB];

    /* Test case: the 0th and 1st cell are missing */
    uint64_t missing_cell_indices[] = {0, 1};
    size_t len_missing_cells = 2;

    ret = vanishing_polynomial_for_missing_cells(
        vanishing_poly, missing_cell_indices, len_missing_cells, &s
    );

    /* Check return status */
    ASSERT("compute vanishing poly from cells", ret == C_KZG_OK);

    /* Compute FFT of vanishing_poly */
    fr_fft(fft_result, vanishing_poly, FIELD_ELEMENTS_PER_EXT_BLOB, &s);

    /*
     * Check FFT results
     *
     * Let explain how we are picking the roots of unity:
     * Focussing just on the missing cell index 0.
     *
     * We expect that the following roots will evaluate to zero on the vanishing polynomial we
     * computed:
     *
     * s->roots_of_unity[0]
     * s->roots_of_unity[128]
     * s->roots_of_unity[256]
     * ...
     * s->roots_of_unity[8064]
     *
     * For every cell index, we should have `FIELD_ELEMENTS_PER_CELL` number of these roots. ie each
     * cell index corresponds to 64 roots taken from `roots_of_unity` in the vanishing
     * polynomial.
     *
     * In general, the formula is roots_of_unity[cell_index + CELLS_PER_EXT_BLOB * k] where
     * `k` goes from 0 to FIELD_ELEMENTS_PER_CELL-1.
     *
     * For cell index 1, we would therefore expect the polynomial to vanish at points:
     *
     * s->roots_of_unity[1]
     * s->roots_of_unity[129]
     * s->roots_of_unity[257]
     * ...
     * s->roots_of_unity[8065]
     *
     * Sanity check:
     * The largest cell index we can have is 127 since there are 128 cells.
     *
     * The last element for that cell index would have array index `127 + 128*63 = 8191`. This is
     * correct since `roots_of_unity` has 8192 elements.
     */
    for (size_t i = 0; i < FIELD_ELEMENTS_PER_EXT_BLOB; i++) {
        if (i % CELLS_PER_EXT_BLOB == 1 || i % CELLS_PER_EXT_BLOB == 0) {
            /* Every CELLS_PER_EXT_BLOB-th evaluation should be zero */
            ASSERT("evaluation is zero", fr_is_zero(&fft_result[i]));
        } else {
            ASSERT("evaluation is not zero", !fr_is_zero(&fft_result[i]));
        }
    }
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Tests for verify_cell_kzg_proof_batch
////////////////////////////////////////////////////////////////////////////////////////////////////

static void test_verify_cell_kzg_proof_batch__succeeds_random_blob(void) {
    C_KZG_RET ret;
    bool ok;
    Blob blob;
    KZGCommitment commitment;
    Bytes48 commitments[CELLS_PER_EXT_BLOB];
    uint64_t cell_indices[CELLS_PER_EXT_BLOB];
    Cell cells[CELLS_PER_EXT_BLOB];
    KZGProof proofs[CELLS_PER_EXT_BLOB];

    /* Get a random blob */
    get_rand_blob(&blob);

    /* Get the commitment to the blob */
    ret = blob_to_kzg_commitment(&commitment, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Compute cells and proofs */
    ret = compute_cells_and_kzg_proofs(cells, proofs, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Initialize list of commitments & cell indices */
    for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
        memcpy(commitments[i].bytes, &commitment, BYTES_PER_COMMITMENT);
        cell_indices[i] = i;
    }

    /* Verify all the proofs */
    ret = verify_cell_kzg_proof_batch(
        &ok, commitments, cell_indices, cells, proofs, CELLS_PER_EXT_BLOB, &s
    );
    ASSERT_EQUALS(ret, C_KZG_OK);
}

////////////////////////////////////////////////////////////////////////////////////////////////////
// Profiling Functions
////////////////////////////////////////////////////////////////////////////////////////////////////

#ifdef PROFILE
static void profile_blob_to_kzg_commitment(void) {
    Blob blob;
    KZGCommitment c;

    get_rand_blob(&blob);

    ProfilerStart("blob_to_kzg_commitment.prof");
    for (size_t i = 0; i < 1000; i++) {
        blob_to_kzg_commitment(&c, &blob, &s);
    }
    ProfilerStop();
}

static void profile_compute_kzg_proof(void) {
    Blob blob;
    Bytes32 z, y_out;
    KZGProof proof_out;

    get_rand_blob(&blob);
    get_rand_field_element(&z);

    ProfilerStart("compute_kzg_proof.prof");
    for (size_t i = 0; i < 100; i++) {
        compute_kzg_proof(&proof_out, &y_out, &blob, &z, &s);
    }
    ProfilerStop();
}

static void profile_compute_blob_kzg_proof(void) {
    Blob blob;
    Bytes48 commitment;
    KZGProof out;

    get_rand_blob(&blob);
    get_rand_g1_bytes(&commitment);

    ProfilerStart("compute_blob_kzg_proof.prof");
    for (size_t i = 0; i < 10; i++) {
        compute_blob_kzg_proof(&out, &blob, &commitment, &s);
    }
    ProfilerStop();
}

static void profile_verify_kzg_proof(void) {
    Bytes32 z, y;
    Bytes48 commitment, proof;
    bool out;

    get_rand_g1_bytes(&commitment);
    get_rand_field_element(&z);
    get_rand_field_element(&y);
    get_rand_g1_bytes(&proof);

    ProfilerStart("verify_kzg_proof.prof");
    for (size_t i = 0; i < 5000; i++) {
        verify_kzg_proof(&out, &commitment, &z, &y, &proof, &s);
    }
    ProfilerStop();
}

static void profile_verify_blob_kzg_proof(void) {
    Blob blob;
    Bytes48 commitment, proof;
    bool out;

    get_rand_blob(&blob);
    get_rand_g1_bytes(&commitment);
    get_rand_g1_bytes(&proof);

    ProfilerStart("verify_blob_kzg_proof.prof");
    for (size_t i = 0; i < 5000; i++) {
        verify_blob_kzg_proof(&out, &blob, &commitment, &proof, &s);
    }
    ProfilerStop();
}

static void profile_verify_blob_kzg_proof_batch(void) {
    const int n = 4;
    Blob blobs[n];
    Bytes48 commitments[n];
    Bytes48 proofs[n];
    bool out;

    for (size_t i = 0; i < n; i++) {
        get_rand_blob(&blobs[i]);
        get_rand_g1_bytes(&commitments[i]);
        get_rand_g1_bytes(&proofs[i]);
    }

    ProfilerStart("verify_blob_kzg_proof_batch.prof");
    for (size_t i = 0; i < 1000; i++) {
        verify_blob_kzg_proof_batch(&out, blobs, commitments, proofs, n, &s);
    }
    ProfilerStop();
}

static void profile_compute_cells_and_kzg_proofs(void) {
    Blob blob;
    Cell cells[CELLS_PER_EXT_BLOB];
    KZGProof proofs[CELLS_PER_EXT_BLOB];

    /* Get a random blob */
    get_rand_blob(&blob);

    ProfilerStart("compute_cells_and_kzg_proofs.prof");
    for (size_t i = 0; i < 5; i++) {
        compute_cells_and_kzg_proofs(cells, proofs, &blob, &s);
    }
    ProfilerStop();
}

static void profile_recover_cells_and_kzg_proofs(void) {
    Blob blob;
    uint64_t cell_indices[CELLS_PER_EXT_BLOB];
    Cell cells[CELLS_PER_EXT_BLOB];

    /*
     * NOTE: this profiling function only cares about cell recovery since the proofs will always be
     * recomputed. If we included proof computation, it would drown out cell recovery.
     */

    /* Get a random blob */
    get_rand_blob(&blob);

    /* Compute cells */
    compute_cells_and_kzg_proofs(cells, NULL, &blob, &s);

    /* Initialize cell indices */
    for (size_t i = 0; i < CELLS_PER_EXT_BLOB / 2; i++) {
        cell_indices[i] = i;
    }

    ProfilerStart("recover_cells_and_kzg_proofs.prof");
    for (size_t i = 0; i < 5; i++) {
        recover_cells_and_kzg_proofs(cells, NULL, cell_indices, cells, CELLS_PER_EXT_BLOB / 2, &s);
    }
    ProfilerStop();
}

static void profile_verify_cell_kzg_proof_batch(void) {
    C_KZG_RET ret;
    bool ok;
    Blob blob;
    KZGCommitment commitment;
    KZGCommitment commitments[CELLS_PER_EXT_BLOB];
    uint64_t cell_indices[CELLS_PER_EXT_BLOB];
    Cell cells[CELLS_PER_EXT_BLOB];
    KZGProof proofs[CELLS_PER_EXT_BLOB];

    /* Get a random blob */
    get_rand_blob(&blob);

    /* Get the commitment to the blob */
    ret = blob_to_kzg_commitment(&commitment, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    /* Compute cells and proofs */
    ret = compute_cells_and_kzg_proofs(cells, proofs, &blob, &s);
    ASSERT_EQUALS(ret, C_KZG_OK);

    for (size_t i = 0; i < CELLS_PER_EXT_BLOB; i++) {
        memcpy(commitments[i].bytes, &commitment, BYTES_PER_COMMITMENT);
        cell_indices[i] = i;
    }

    ProfilerStart("verify_cell_kzg_proof_batch.prof");
    for (size_t i = 0; i < 100; i++) {
        verify_cell_kzg_proof_batch(
            &ok, commitments, cell_indices, cells, proofs, CELLS_PER_EXT_BLOB, &s
        );
    }
    ProfilerStop();
}
#endif /* PROFILE */

////////////////////////////////////////////////////////////////////////////////////////////////////
// Main logic
////////////////////////////////////////////////////////////////////////////////////////////////////

static void setup(void) {
    FILE *fp;
    C_KZG_RET ret;

    /* Open the mainnet trusted setup file */
    fp = fopen("trusted_setup.txt", "r");
    assert(fp != NULL);

    /* Load that trusted setup file */
    ret = load_trusted_setup_file(&s, fp, 0);
    assert(ret == C_KZG_OK);

    fclose(fp);
}

static void teardown(void) {
    free_trusted_setup(&s);
}

int main(void) {
    setup();
    RUN(test_c_kzg_malloc__succeeds_size_greater_than_zero);
    RUN(test_c_kzg_malloc__fails_size_equal_to_zero);
    RUN(test_c_kzg_malloc__fails_too_big);
    RUN(test_c_kzg_calloc__succeeds_size_greater_than_zero);
    RUN(test_c_kzg_calloc__fails_size_equal_to_zero);
    RUN(test_c_kzg_calloc__fails_count_equal_to_zero);
    RUN(test_c_kzg_calloc__fails_too_big);
    RUN(test_fr_div__by_one_is_equal);
    RUN(test_fr_div__by_itself_is_one);
    RUN(test_fr_div__specific_value);
    RUN(test_fr_div__succeeds_round_trip);
    RUN(test_fr_pow__test_power_of_two);
    RUN(test_fr_pow__test_inverse_on_root_of_unity);
    RUN(test_fr_batch_inv__test_consistent);
    RUN(test_fr_batch_inv__test_zero);
    RUN(test_g1_mul__test_consistent);
    RUN(test_g1_mul__test_scalar_is_zero);
    RUN(test_g1_mul__test_different_bit_lengths);
    RUN(test_pairings_verify__good_pairing);
    RUN(test_pairings_verify__bad_pairing);
    RUN(test_blob_to_kzg_commitment__succeeds_x_less_than_modulus);
    RUN(test_blob_to_kzg_commitment__fails_x_equal_to_modulus);
    RUN(test_blob_to_kzg_commitment__fails_x_greater_than_modulus);
    RUN(test_blob_to_kzg_commitment__succeeds_point_at_infinity);
    RUN(test_blob_to_kzg_commitment__succeeds_expected_commitment);
    RUN(test_validate_kzg_g1__succeeds_round_trip);
    RUN(test_validate_kzg_g1__succeeds_correct_point);
    RUN(test_validate_kzg_g1__fails_not_in_g1);
    RUN(test_validate_kzg_g1__fails_not_in_curve);
    RUN(test_validate_kzg_g1__fails_x_equal_to_modulus);
    RUN(test_validate_kzg_g1__fails_x_greater_than_modulus);
    RUN(test_validate_kzg_g1__succeeds_infinity_with_true_b_flag);
    RUN(test_validate_kzg_g1__fails_infinity_with_true_b_flag);
    RUN(test_validate_kzg_g1__fails_infinity_with_false_b_flag);
    RUN(test_validate_kzg_g1__fails_with_wrong_c_flag);
    RUN(test_validate_kzg_g1__fails_with_b_flag_and_x_nonzero);
    RUN(test_validate_kzg_g1__fails_with_b_flag_and_a_flag_true);
    RUN(test_validate_kzg_g1__fails_with_mask_bits_111);
    RUN(test_validate_kzg_g1__fails_with_mask_bits_011);
    RUN(test_validate_kzg_g1__fails_with_mask_bits_001);
    RUN(test_reverse_bits__succeeds_round_trip);
    RUN(test_reverse_bits__succeeds_all_bits_are_zero);
    RUN(test_reverse_bits__succeeds_some_bits_are_one);
    RUN(test_reverse_bits__succeeds_all_bits_are_one);
    RUN(test_bit_reversal_permutation__succeeds_round_trip);
    RUN(test_bit_reversal_permutation__specific_items);
    RUN(test_bit_reversal_permutation__coset_structure);
    RUN(test_bit_reversal_permutation__fails_n_not_power_of_two);
    RUN(test_bit_reversal_permutation__n_is_zero);
    RUN(test_bit_reversal_permutation__n_is_one);
    RUN(test_compute_powers__succeeds_expected_powers);
    RUN(test_g1_lincomb__verify_consistent);
    RUN(test_evaluate_polynomial_in_evaluation_form__constant_polynomial);
    RUN(test_evaluate_polynomial_in_evaluation_form__constant_polynomial_in_range);
    RUN(test_evaluate_polynomial_in_evaluation_form__random_polynomial);
    RUN(test_log2_pow2__succeeds_expected_values);
    RUN(test_is_power_of_two__succeeds_powers_of_two);
    RUN(test_is_power_of_two__fails_not_powers_of_two);
    RUN(test_compute_kzg_proof__succeeds_expected_proof);
    RUN(test_compute_and_verify_kzg_proof__succeeds_round_trip);
    RUN(test_compute_and_verify_kzg_proof__succeeds_within_domain);
    RUN(test_compute_and_verify_kzg_proof__fails_incorrect_proof);
    RUN(test_verify_kzg_proof__fails_proof_not_in_g1);
    RUN(test_verify_kzg_proof__fails_commitment_not_in_g1);
    RUN(test_verify_kzg_proof__fails_z_not_field_element);
    RUN(test_verify_kzg_proof__fails_y_not_field_element);
    RUN(test_compute_and_verify_blob_kzg_proof__succeeds_round_trip);
    RUN(test_compute_and_verify_blob_kzg_proof__fails_incorrect_proof);
    RUN(test_compute_and_verify_blob_kzg_proof__fails_proof_not_in_g1);
    RUN(test_compute_and_verify_blob_kzg_proof__fails_compute_commitment_not_in_g1);
    RUN(test_compute_and_verify_blob_kzg_proof__fails_verify_commitment_not_in_g1);
    RUN(test_compute_and_verify_blob_kzg_proof__fails_invalid_blob);
    RUN(test_verify_kzg_proof_batch__succeeds_round_trip);
    RUN(test_verify_kzg_proof_batch__fails_with_incorrect_proof);
    RUN(test_verify_kzg_proof_batch__fails_proof_not_in_g1);
    RUN(test_verify_kzg_proof_batch__fails_commitment_not_in_g1);
    RUN(test_verify_kzg_proof_batch__fails_invalid_blob);
    RUN(test_expand_root_of_unity__global_matches_expected);
    RUN(test_expand_root_of_unity__succeeds_with_root);
    RUN(test_expand_root_of_unity__fails_not_root_of_unity);
    RUN(test_expand_root_of_unity__fails_wrong_root_of_unity);
    RUN(test_fft);
    RUN(test_coset_fft);
    RUN(test_deduplicate_commitments__one_duplicate);
    RUN(test_deduplicate_commitments__no_duplicates);
    RUN(test_deduplicate_commitments__all_duplicates);
    RUN(test_deduplicate_commitments__no_commitments);
    RUN(test_deduplicate_commitments__one_commitment);
    RUN(test_recover_cells_and_kzg_proofs__succeeds_random_blob);
    RUN(test_shift_factors__succeeds);
    RUN(test_compute_vanishing_polynomial_from_roots);
    RUN(test_vanishing_polynomial_for_missing_cells);
    RUN(test_verify_cell_kzg_proof_batch__succeeds_random_blob);

    /*
     * These functions are only executed if we're profiling. To me, it makes sense to put these in
     * the testing file so we can re-use the helper functions. Additionally, it checks that whatever
     * performance changes haven't broken the library.
     */
#ifdef PROFILE
    profile_blob_to_kzg_commitment();
    profile_compute_kzg_proof();
    profile_compute_blob_kzg_proof();
    profile_verify_kzg_proof();
    profile_verify_blob_kzg_proof();
    profile_verify_blob_kzg_proof_batch();
    profile_compute_cells_and_kzg_proofs();
    profile_recover_cells_and_kzg_proofs();
    profile_verify_cell_kzg_proof_batch();
#endif
    teardown();

    return TEST_REPORT();
}
