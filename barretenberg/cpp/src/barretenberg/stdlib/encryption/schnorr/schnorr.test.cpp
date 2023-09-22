#include <gtest/gtest.h>

#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib/primitives/point/point.hpp"
#include "schnorr.hpp"

namespace proof_system::test_stdlib_schnorr {

using namespace barretenberg;
using namespace proof_system::plonk::stdlib;
using namespace proof_system::plonk::stdlib::schnorr;

using Builder = proof_system::UltraCircuitBuilder;
using bool_ct = bool_t<Builder>;
using byte_array_ct = byte_array<Builder>;
using field_ct = field_t<Builder>;
using point_ct = point<Builder>;
using witness_ct = witness_t<Builder>;

auto run_scalar_mul_test = [](grumpkin::fr scalar_mont, bool expect_verify) {
    Builder builder = Builder();

    grumpkin::fr scalar = scalar_mont.from_montgomery_form();

    uint256_t scalar_low{ scalar.data[0], scalar.data[1], 0ULL, 0ULL };
    uint256_t scalar_high{ scalar.data[2], scalar.data[3], 0ULL, 0ULL };

    field_ct input_lo = witness_ct(&builder, scalar_low);
    field_ct input_hi = witness_ct(&builder, scalar_high);

    grumpkin::g1::element expected = grumpkin::g1::one * scalar_mont;
    expected = expected.normalize();
    point_ct point_input{ witness_ct(&builder, grumpkin::g1::affine_one.x),
                          witness_ct(&builder, grumpkin::g1::affine_one.y) };

    point_ct output = variable_base_mul(point_input, input_lo, input_hi);

    if (expect_verify) {
        EXPECT_EQ(output.x.get_value(), expected.x);
        EXPECT_EQ(output.y.get_value(), expected.y);
    };

    info("num gates = ", builder.get_num_gates());

    bool result = builder.check_circuit();
    EXPECT_EQ(result, expect_verify);
};

typedef wnaf_record<Builder> wnaf_record_ct;

/**
 * @brief Helper function to compare wnaf_records, useful since == on bool_ct's returns a bool_ct.
 */
bool compare_records(wnaf_record_ct a, wnaf_record_ct b)
{
    bool result = a.skew.witness_bool == b.skew.witness_bool;
    if (result) {
        for (size_t i = 0; i != a.bits.size(); ++i) {
            bool a_bit = a.bits[i].witness_bool;
            bool b_bit = b.bits[i].witness_bool;
            result = result == false ? false : a_bit == b_bit;
        }
    }
    return result;
}

TEST(stdlib_schnorr, convert_field_into_wnaf_special)
{
    Builder builder = Builder();

    // the wnaf_record ((b_1, ... b_128), skew) corresponding to the 129-bit  non-negative value
    // is, 2^128 + 2^127 w_1 + ... + 2 w_127 + w_128 - skew, where w_i = 1 if b_i is true, else -1..
    // We make some auxiliary wnaf records that will be helpful.
    std::vector<bool_ct> false128(128, false);
    wnaf_record_ct all_false({ .bits = false128, .skew = false });

    std::vector<bool_ct> true128(128, true);
    wnaf_record_ct all_true({ .bits = true128, .skew = true });

    // establish a list of special values to be converted to a wnaf_record
    std::vector<uint256_t> special_values({ 1,
                                            0,
                                            (static_cast<uint256_t>(1) << 128) - 1,
                                            (static_cast<uint256_t>(1) << 128) + 1,
                                            (static_cast<uint256_t>(1) << 128),
                                            (static_cast<uint256_t>(1) << 129) - 1 });

    size_t num_special_values(special_values.size());

    // convert these values to field elements
    std::vector<field_ct> special_field_elts(num_special_values);
    for (size_t i = 0; i != num_special_values; ++i) {
        field_ct a(special_values[i]);
        special_field_elts[i] = a;
    };

    // manually build the expected wnaf records
    //  1 is given by ((false, ..., false), false)
    auto record_1 = all_false;

    // 0 is given by ((false, ..., false), true)
    auto record_0 = all_false;
    record_0.skew = true;

    // 2^128 - 1 = 2^128 - 2^127 + (2^127 - 1) - 0 is given by((false, true, ..., true), false)
    auto record_128_minus_1 = all_true;
    record_128_minus_1.bits[0] = false;
    record_128_minus_1.skew = false;

    // 2^128 + 1 = 2^128 + (2^127 - (2^127 - 1)) - 0 is given by((true, false, false, ..., false), false)
    auto record_128_plus_1 = all_false;
    record_128_plus_1.bits[0] = true;

    // 2^128  = 2^128 + (2^127 - (2^127 - 1)) - 1 is given by((true, false, false, ..., false), true)
    auto record_128 = all_false;
    record_128.bits[0] = true;
    record_128.skew = true;

    // // 2^129-1 = 2^128 + 2^127 + ... + 1 - 0 should be given by ((true, true, ..., true), false).
    // Note: fixed_wnaf<129, 1, 1>, used inside of convert_field_into_wnaf, incorrectly computes the the coefficient
    // of
    // 2^127 in the wnaf representation of to be -1.
    auto record_max = all_true;
    record_max.skew = false;

    std::vector<wnaf_record_ct> expected_wnaf_records(
        { record_1, record_0, record_128_minus_1, record_128_plus_1, record_128, record_max });

    // integers less than 2^128 are converted correctly
    for (size_t i = 0; i != num_special_values; ++i) {
        field_ct elt = special_field_elts[i];
        wnaf_record_ct record = convert_field_into_wnaf(&builder, elt);
        wnaf_record_ct expected_record = expected_wnaf_records[i];
        bool records_equal = compare_records(record, expected_record);
        ASSERT_TRUE(records_equal);
        ASSERT_FALSE(builder.failed());
    }
}

TEST(stdlib_schnorr, convert_field_into_wnaf)
{
    Builder builder = Builder();

    grumpkin::fq scalar_mont = grumpkin::fq::random_element();
    grumpkin::fq scalar = scalar_mont.from_montgomery_form();

    // our wnaf records only represent 128 bits, so we test by generating a field
    // element and then truncating.
    scalar.data[2] = 0ULL;
    scalar.data[3] = 0ULL;

    scalar = scalar.to_montgomery_form();

    field_ct input(&builder, scalar);
    convert_field_into_wnaf(&builder, input);

    info("num gates = ", builder.get_num_gates());

    bool result = builder.check_circuit();
    EXPECT_EQ(result, true);
}

/**
 * @brief Test variable_base_mul(const point<C>& pub_key,
 *                               const field_t<C>& low_bits,
 *                               const field_t<C>& high_bits)
 * by taking a random field Fr element s, computing the corresponding Grumpkin G1 element both natively
 * and using the function in question (splitting s into 128-bit halves), then comparing the results.
 */
TEST(stdlib_schnorr, test_scalar_mul_low_high)
{
    run_scalar_mul_test(grumpkin::fr::random_element(), true);
    run_scalar_mul_test(grumpkin::fr(static_cast<uint256_t>(1) << 128), false);
    run_scalar_mul_test(0, false);
}

/**
 * @test Test circuit verifying a Schnorr signature generated by \see{crypto::schnorr::verify_signature}.
 * We only test: messages signed and verified using Grumpkin and the BLAKE2s hash function. We only test
 * TurboPLONK. We test strings of lengths 0, 1, ..., 33.
 */
TEST(stdlib_schnorr, verify_signature)
{
    std::string longer_string = "This is a test string of length 34";

    std::vector<size_t> test_lengths({ 0, 1, 32, 33 });
    for (size_t i : test_lengths) {
        Builder builder = Builder();
        auto message_string = longer_string.substr(0, i);

        crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> account;
        account.private_key = grumpkin::fr::random_element();
        account.public_key = grumpkin::g1::one * account.private_key;

        crypto::schnorr::signature signature =
            crypto::schnorr::construct_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(
                message_string, account);

        bool first_result = crypto::schnorr::verify_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(
            message_string, account.public_key, signature);
        EXPECT_EQ(first_result, true);

        point_ct pub_key{ witness_ct(&builder, account.public_key.x), witness_ct(&builder, account.public_key.y) };
        signature_bits sig = convert_signature(&builder, signature);
        byte_array_ct message(&builder, message_string);
        verify_signature(message, pub_key, sig);

        info("num gates = ", builder.get_num_gates());
        bool result = builder.check_circuit();
        EXPECT_EQ(result, true);
    }
}

/**
 * @brief Verification fails when the wrong public key is used.
 *
 */
TEST(stdlib_schnorr, verify_signature_failure)
{
    Builder builder = Builder();
    std::string message_string = "This is a test string of length 34";

    // create key pair 1
    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> account1;
    account1.private_key = grumpkin::fr::random_element();
    account1.public_key = grumpkin::g1::one * account1.private_key;

    // create key pair 2
    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> account2;
    account2.private_key = grumpkin::fr::random_element();
    account2.public_key = grumpkin::g1::one * account2.private_key;

    // sign the message with account 1 private key
    crypto::schnorr::signature signature =
        crypto::schnorr::construct_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(message_string,
                                                                                                      account1);

    // check native verification with account 2 public key fails
    bool native_result = crypto::schnorr::verify_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(
        message_string, account2.public_key, signature);
    EXPECT_EQ(native_result, false);

    // check stdlib verification with account 2 public key fails
    point_ct pub_key2_ct{ witness_ct(&builder, account2.public_key.x), witness_ct(&builder, account2.public_key.y) };
    signature_bits sig = convert_signature(&builder, signature);
    byte_array_ct message(&builder, message_string);
    verify_signature(message, pub_key2_ct, sig);

    info("num gates = ", builder.get_num_gates());

    bool verification_result = builder.check_circuit();
    EXPECT_EQ(verification_result, false);
}

/**
 * @test Like stdlib_schnorr.verify_signature, but we use the function signature_verification that produces a
 * boolean witness and does not require the prover to provide a valid signature.
 */
TEST(stdlib_schnorr, signature_verification_result)
{
    std::string longer_string = "This is a test string of length 34";

    Builder builder = Builder();

    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> account;
    account.private_key = grumpkin::fr::random_element();
    account.public_key = grumpkin::g1::one * account.private_key;

    crypto::schnorr::signature signature =
        crypto::schnorr::construct_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(longer_string,
                                                                                                      account);

    bool first_result = crypto::schnorr::verify_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(
        longer_string, account.public_key, signature);
    EXPECT_EQ(first_result, true);

    point_ct pub_key{ witness_ct(&builder, account.public_key.x), witness_ct(&builder, account.public_key.y) };
    signature_bits sig = convert_signature(&builder, signature);
    byte_array_ct message(&builder, longer_string);
    bool_ct signature_result = signature_verification_result(message, pub_key, sig);
    EXPECT_EQ(signature_result.witness_bool, true);

    info("num gates = ", builder.get_num_gates());

    bool result = builder.check_circuit();
    EXPECT_EQ(result, true);
}

/**
 * @test Like stdlib_schnorr.verify_signature_failure, but we use the function signature_verification that produces a
 * boolean witness and allow for proving that a signature verification fails.
 */
TEST(stdlib_schnorr, signature_verification_result_failure)
{
    Builder builder = Builder();
    std::string message_string = "This is a test string of length 34";

    // create key pair 1
    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> account1;
    account1.private_key = grumpkin::fr::random_element();
    account1.public_key = grumpkin::g1::one * account1.private_key;

    // create key pair 2
    crypto::schnorr::key_pair<grumpkin::fr, grumpkin::g1> account2;
    account2.private_key = grumpkin::fr::random_element();
    account2.public_key = grumpkin::g1::one * account2.private_key;

    // sign the message with account 1 private key
    crypto::schnorr::signature signature =
        crypto::schnorr::construct_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(message_string,
                                                                                                      account1);

    // check native verification with account 2 public key fails
    bool native_result = crypto::schnorr::verify_signature<Blake2sHasher, grumpkin::fq, grumpkin::fr, grumpkin::g1>(
        message_string, account2.public_key, signature);
    EXPECT_EQ(native_result, false);

    // check stdlib verification with account 2 public key fails
    point_ct pub_key2_ct{ witness_ct(&builder, account2.public_key.x), witness_ct(&builder, account2.public_key.y) };
    signature_bits sig = convert_signature(&builder, signature);
    byte_array_ct message(&builder, message_string);
    bool_ct signature_result = signature_verification_result(message, pub_key2_ct, sig);
    EXPECT_EQ(signature_result.witness_bool, false);

    info("num gates = ", builder.get_num_gates());

    bool verification_result = builder.check_circuit();
    EXPECT_EQ(verification_result, true);
}

} // namespace proof_system::test_stdlib_schnorr
