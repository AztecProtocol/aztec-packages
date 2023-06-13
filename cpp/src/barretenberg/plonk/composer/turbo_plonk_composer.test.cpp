#include "turbo_plonk_composer.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/generators/fixed_base_scalar_mul.hpp"
#include <gtest/gtest.h>
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"

using namespace barretenberg;
using namespace proof_system;
using namespace crypto::generators;

namespace proof_system::plonk::test_turbo_plonk_composer {
namespace {
auto& engine = numeric::random::get_debug_engine();
}

TEST(turbo_plonk_composer, base_case)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr a = fr::one();
    composer.add_public_variable(a);

    auto prover = composer.create_prover();
    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);
    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, composer_from_serialized_keys)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr a = fr::one();
    composer.add_public_variable(a);

    auto pk_buf = to_buffer(*composer.compute_proving_key());
    auto vk_buf = to_buffer(*composer.compute_verification_key());
    auto pk_data = from_buffer<plonk::proving_key_data>(pk_buf);
    auto vk_data = from_buffer<plonk::verification_key_data>(vk_buf);

    auto crs = std::make_unique<barretenberg::srs::factories::FileCrsFactory>("../srs_db/ignition");
    auto proving_key =
        std::make_shared<plonk::proving_key>(std::move(pk_data), crs->get_prover_crs(pk_data.circuit_size + 1));
    auto verification_key = std::make_shared<plonk::verification_key>(std::move(vk_data), crs->get_verifier_crs());

    TurboPlonkComposer composer2 = TurboPlonkComposer(proving_key, verification_key);
    composer2.add_public_variable(a);

    auto prover = composer2.create_prover();
    auto verifier = composer2.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);
    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, test_add_gate_proofs)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr a = fr::one();
    fr b = fr::one();
    fr c = a + b;
    fr d = a + c;
    uint32_t a_idx = composer.add_variable(a);
    uint32_t b_idx = composer.add_variable(b);
    uint32_t c_idx = composer.add_variable(c);
    uint32_t d_idx = composer.add_variable(d);

    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ d_idx, c_idx, a_idx, fr::one(), fr::neg_one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ b_idx, a_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    // TODO: proof fails if one wire contains all zeros. Should we support this?
    uint32_t zero_idx = composer.add_variable(fr::zero());

    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, a_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof); // instance, prover.reference_string.SRS_T2);
    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, test_mul_gate_proofs)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr q[7]{ fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(),
             fr::random_element(), fr::random_element(), fr::random_element() };
    fr q_inv[7]{
        q[0].invert(), q[1].invert(), q[2].invert(), q[3].invert(), q[4].invert(), q[5].invert(), q[6].invert(),
    };

    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = -((((q[0] * a) + (q[1] * b)) + q[3]) * q_inv[2]);
    fr d = -((((q[4] * (a * b)) + q[6]) * q_inv[5]));

    uint32_t a_idx = composer.add_public_variable(a);
    uint32_t b_idx = composer.add_variable(b);
    uint32_t c_idx = composer.add_variable(c);
    uint32_t d_idx = composer.add_variable(d);

    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });

    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    uint32_t e_idx = composer.add_variable(a - fr::one());
    composer.create_add_gate({ e_idx, b_idx, c_idx, q[0], q[1], q[2], (q[3] + q[0]) });
    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, small_scalar_multipliers)
{
    constexpr size_t num_bits = 63;
    constexpr size_t num_quads_base = (num_bits - 1) >> 1;
    constexpr size_t num_quads = ((num_quads_base << 1) + 1 < num_bits) ? num_quads_base + 1 : num_quads_base;
    constexpr size_t num_wnaf_bits = (num_quads << 1) + 1;
    constexpr size_t initial_exponent = ((num_bits & 1) == 1) ? num_bits - 1 : num_bits;
    constexpr uint64_t bit_mask = (1ULL << num_bits) - 1UL;
    auto gen_data = crypto::generators::get_generator_data(DEFAULT_GEN_1);
    const crypto::generators::fixed_base_ladder* ladder = gen_data.get_ladder(num_bits);
    grumpkin::g1::affine_element generator = gen_data.generator;

    grumpkin::g1::element origin_points[2];
    origin_points[0] = grumpkin::g1::element(ladder[0].one);
    origin_points[1] = origin_points[0] + generator;
    origin_points[1] = origin_points[1].normalize();

    grumpkin::fr scalar_multiplier_entropy = grumpkin::fr::random_element();
    grumpkin::fr scalar_multiplier_base{ scalar_multiplier_entropy.data[0] & bit_mask, 0, 0, 0 };
    // scalar_multiplier_base.data[0] = scalar_multiplier_base.data[0] | (1ULL);
    scalar_multiplier_base.data[0] = scalar_multiplier_base.data[0] & (~1ULL);
    grumpkin::fr scalar_multiplier = scalar_multiplier_base;

    uint64_t wnaf_entries[num_quads + 1] = { 0 };
    if ((scalar_multiplier_base.data[0] & 1) == 0) {
        scalar_multiplier_base.data[0] -= 2;
    }
    bool skew = false;
    barretenberg::wnaf::fixed_wnaf<num_wnaf_bits, 1, 2>(&scalar_multiplier_base.data[0], &wnaf_entries[0], skew, 0);

    fr accumulator_offset = (fr::one() + fr::one()).pow(static_cast<uint64_t>(initial_exponent)).invert();
    fr origin_accumulators[2]{ fr::one(), accumulator_offset + fr::one() };

    grumpkin::g1::element* multiplication_transcript =
        static_cast<grumpkin::g1::element*>(aligned_alloc(64, sizeof(grumpkin::g1::element) * (num_quads + 1)));
    fr* accumulator_transcript = static_cast<fr*>(aligned_alloc(64, sizeof(fr) * (num_quads + 1)));

    if (skew) {
        multiplication_transcript[0] = origin_points[1];
        accumulator_transcript[0] = origin_accumulators[1];
    } else {
        multiplication_transcript[0] = origin_points[0];
        accumulator_transcript[0] = origin_accumulators[0];
    }

    fr one = fr::one();
    fr three = ((one + one) + one);
    for (size_t i = 0; i < num_quads; ++i) {
        uint64_t entry = wnaf_entries[i + 1] & crypto::generators::WNAF_MASK;
        fr prev_accumulator = accumulator_transcript[i] + accumulator_transcript[i];
        prev_accumulator = prev_accumulator + prev_accumulator;

        grumpkin::g1::affine_element point_to_add = (entry == 1) ? ladder[i + 1].three : ladder[i + 1].one;
        fr scalar_to_add = (entry == 1) ? three : one;
        uint64_t predicate = (wnaf_entries[i + 1] >> 31U) & 1U;
        if (predicate) {
            point_to_add = -point_to_add;
            scalar_to_add.self_neg();
        }
        accumulator_transcript[i + 1] = prev_accumulator + scalar_to_add;
        multiplication_transcript[i + 1] = multiplication_transcript[i] + point_to_add;
    }
    grumpkin::g1::element::batch_normalize(&multiplication_transcript[0], num_quads + 1);

    fixed_group_init_quad init_quad{ origin_points[0].x,
                                     (origin_points[0].x - origin_points[1].x),
                                     origin_points[0].y,
                                     (origin_points[0].y - origin_points[1].y) };

    TurboPlonkComposer composer = TurboPlonkComposer();

    fr x_alpha = accumulator_offset;
    for (size_t i = 0; i < num_quads; ++i) {
        fixed_group_add_quad round_quad;
        round_quad.d = composer.add_variable(accumulator_transcript[i]);
        round_quad.a = composer.add_variable(multiplication_transcript[i].x);
        round_quad.b = composer.add_variable(multiplication_transcript[i].y);
        round_quad.c = composer.add_variable(x_alpha);
        if ((wnaf_entries[i + 1] & 0xffffffU) == 0) {
            x_alpha = ladder[i + 1].one.x;
        } else {
            x_alpha = ladder[i + 1].three.x;
        }
        round_quad.q_x_1 = ladder[i + 1].q_x_1;
        round_quad.q_x_2 = ladder[i + 1].q_x_2;
        round_quad.q_y_1 = ladder[i + 1].q_y_1;
        round_quad.q_y_2 = ladder[i + 1].q_y_2;

        if (i > 0) {
            composer.create_fixed_group_add_gate(round_quad);
        } else {
            composer.create_fixed_group_add_gate_with_init(round_quad, init_quad);
        }
    }

    add_quad add_quad{ composer.add_variable(multiplication_transcript[num_quads].x),
                       composer.add_variable(multiplication_transcript[num_quads].y),
                       composer.add_variable(x_alpha),
                       composer.add_variable(accumulator_transcript[num_quads]),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero() };
    composer.create_big_add_gate(add_quad);

    grumpkin::g1::element expected_point =
        grumpkin::g1::element(generator * scalar_multiplier.to_montgomery_form()).normalize();
    EXPECT_EQ((multiplication_transcript[num_quads].x == expected_point.x), true);
    EXPECT_EQ((multiplication_transcript[num_quads].y == expected_point.y), true);

    uint64_t result_accumulator = accumulator_transcript[num_quads].from_montgomery_form().data[0];
    uint64_t expected_accumulator = scalar_multiplier.data[0];
    EXPECT_EQ(result_accumulator, expected_accumulator);

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, true);

    free(multiplication_transcript);
    free(accumulator_transcript);
}

TEST(turbo_plonk_composer, large_scalar_multipliers)
{
    constexpr size_t num_bits = 254;
    constexpr size_t num_quads_base = (num_bits - 1) >> 1;
    constexpr size_t num_quads = ((num_quads_base << 1) + 1 < num_bits) ? num_quads_base + 1 : num_quads_base;
    constexpr size_t num_wnaf_bits = (num_quads << 1) + 1;

    constexpr size_t initial_exponent = num_bits; // ((num_bits & 1) == 1) ? num_bits - 1 : num_bits;
    auto gen_data = crypto::generators::get_generator_data(DEFAULT_GEN_1);
    const crypto::generators::fixed_base_ladder* ladder = gen_data.get_ladder(num_bits);
    grumpkin::g1::affine_element generator = gen_data.generator;

    grumpkin::g1::element origin_points[2];
    origin_points[0] = grumpkin::g1::element(ladder[0].one);
    origin_points[1] = origin_points[0] + generator;
    origin_points[1] = origin_points[1].normalize();

    grumpkin::fr scalar_multiplier_base = grumpkin::fr::random_element();

    grumpkin::fr scalar_multiplier = scalar_multiplier_base.from_montgomery_form();

    if ((scalar_multiplier.data[0] & 1) == 0) {
        grumpkin::fr two = grumpkin::fr::one() + grumpkin::fr::one();
        scalar_multiplier_base = scalar_multiplier_base - two;
    }
    scalar_multiplier_base = scalar_multiplier_base.from_montgomery_form();
    uint64_t wnaf_entries[num_quads + 1] = { 0 };

    bool skew = false;
    barretenberg::wnaf::fixed_wnaf<num_wnaf_bits, 1, 2>(&scalar_multiplier_base.data[0], &wnaf_entries[0], skew, 0);

    fr accumulator_offset = (fr::one() + fr::one()).pow(static_cast<uint64_t>(initial_exponent)).invert();
    fr origin_accumulators[2]{ fr::one(), accumulator_offset + fr::one() };

    grumpkin::g1::element* multiplication_transcript =
        static_cast<grumpkin::g1::element*>(aligned_alloc(64, sizeof(grumpkin::g1::element) * (num_quads + 1)));
    fr* accumulator_transcript = static_cast<fr*>(aligned_alloc(64, sizeof(fr) * (num_quads + 1)));

    if (skew) {
        multiplication_transcript[0] = origin_points[1];
        accumulator_transcript[0] = origin_accumulators[1];
    } else {
        multiplication_transcript[0] = origin_points[0];
        accumulator_transcript[0] = origin_accumulators[0];
    }

    fr one = fr::one();
    fr three = ((one + one) + one);
    for (size_t i = 0; i < num_quads; ++i) {
        uint64_t entry = wnaf_entries[i + 1] & crypto::generators::WNAF_MASK;
        fr prev_accumulator = accumulator_transcript[i] + accumulator_transcript[i];
        prev_accumulator = prev_accumulator + prev_accumulator;

        grumpkin::g1::affine_element point_to_add = (entry == 1) ? ladder[i + 1].three : ladder[i + 1].one;
        fr scalar_to_add = (entry == 1) ? three : one;
        uint64_t predicate = (wnaf_entries[i + 1] >> 31U) & 1U;
        if (predicate) {
            point_to_add = -point_to_add;
            scalar_to_add.self_neg();
        }
        accumulator_transcript[i + 1] = prev_accumulator + scalar_to_add;
        multiplication_transcript[i + 1] = multiplication_transcript[i] + point_to_add;
    }
    grumpkin::g1::element::batch_normalize(&multiplication_transcript[0], num_quads + 1);

    fixed_group_init_quad init_quad{ origin_points[0].x,
                                     (origin_points[0].x - origin_points[1].x),
                                     origin_points[0].y,
                                     (origin_points[0].y - origin_points[1].y) };

    TurboPlonkComposer composer = TurboPlonkComposer();

    fr x_alpha = accumulator_offset;
    for (size_t i = 0; i < num_quads; ++i) {
        fixed_group_add_quad round_quad;
        round_quad.d = composer.add_variable(accumulator_transcript[i]);
        round_quad.a = composer.add_variable(multiplication_transcript[i].x);
        round_quad.b = composer.add_variable(multiplication_transcript[i].y);
        round_quad.c = composer.add_variable(x_alpha);
        if ((wnaf_entries[i + 1] & 0xffffffU) == 0) {
            x_alpha = ladder[i + 1].one.x;
        } else {
            x_alpha = ladder[i + 1].three.x;
        }
        round_quad.q_x_1 = ladder[i + 1].q_x_1;
        round_quad.q_x_2 = ladder[i + 1].q_x_2;
        round_quad.q_y_1 = ladder[i + 1].q_y_1;
        round_quad.q_y_2 = ladder[i + 1].q_y_2;

        if (i > 0) {
            composer.create_fixed_group_add_gate(round_quad);
        } else {
            composer.create_fixed_group_add_gate_with_init(round_quad, init_quad);
        }
    }

    add_quad add_quad{ composer.add_variable(multiplication_transcript[num_quads].x),
                       composer.add_variable(multiplication_transcript[num_quads].y),
                       composer.add_variable(x_alpha),
                       composer.add_variable(accumulator_transcript[num_quads]),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero() };
    composer.create_big_add_gate(add_quad);

    grumpkin::g1::element expected_point =
        grumpkin::g1::element(generator * scalar_multiplier.to_montgomery_form()).normalize();
    EXPECT_EQ((multiplication_transcript[num_quads].x == expected_point.x), true);
    EXPECT_EQ((multiplication_transcript[num_quads].y == expected_point.y), true);

    fr result_accumulator = (accumulator_transcript[num_quads]);
    fr expected_accumulator =
        fr{ scalar_multiplier.data[0], scalar_multiplier.data[1], scalar_multiplier.data[2], scalar_multiplier.data[3] }
            .to_montgomery_form();
    EXPECT_EQ((result_accumulator == expected_accumulator), true);

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, true);

    free(multiplication_transcript);
    free(accumulator_transcript);
}

TEST(turbo_plonk_composer, range_constraint)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    for (size_t i = 0; i < 10; ++i) {
        uint32_t value = engine.get_random_uint32();
        fr witness_value = fr{ value, 0, 0, 0 }.to_montgomery_form();
        uint32_t witness_index = composer.add_variable(witness_value);

        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        std::vector<uint32_t> accumulators = composer.decompose_into_base4_accumulators(
            witness_index, 32 + extra_bits, "constraint in test range_constraint fails");

        for (uint32_t j = 0; j < 16; ++j) {
            uint32_t result = (value >> (30U - (2 * j)));
            fr source = composer.get_variable(accumulators[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t expected = static_cast<uint32_t>(source.data[0]);
            EXPECT_EQ(result, expected);
        }
        for (uint32_t j = 1; j < 16; ++j) {
            uint32_t left = (value >> (30U - (2 * j)));
            uint32_t right = (value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);
        }
    }

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, range_constraint_fail)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    uint64_t value = 0xffffff;
    uint32_t witness_index = composer.add_variable(fr(value));

    composer.decompose_into_base4_accumulators(witness_index, 23, "yay, range constraint fails");

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    plonk::proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, false);
}

/**
 * @brief Test that the `AND` constraint fails when constraining too few bits.
 *
 */
TEST(turbo_plonk_composer, and_constraint_failure)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    uint32_t left_value = 4;
    fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
    uint32_t left_witness_index = composer.add_variable(left_witness_value);

    uint32_t right_value = 5;
    fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();
    uint32_t right_witness_index = composer.add_variable(right_witness_value);

    // 4 && 5 is 4, so 3 bits are needed, but we only constrain 2
    accumulator_triple accumulators = composer.create_and_constraint(left_witness_index, right_witness_index, 2);

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    if (composer.failed()) {
        info("Composer failed; ", composer.err());
    }

    EXPECT_EQ(result, false);
}

TEST(turbo_plonk_composer, and_constraint)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    for (size_t i = 0; i < /*10*/ 1; ++i) {
        uint32_t left_value = engine.get_random_uint32();

        fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t left_witness_index = composer.add_variable(left_witness_value);

        uint32_t right_value = engine.get_random_uint32();
        fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t right_witness_index = composer.add_variable(right_witness_value);

        uint32_t out_value = left_value & right_value;
        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        accumulator_triple accumulators =
            composer.create_and_constraint(left_witness_index, right_witness_index, 32 + extra_bits);
        // composer.create_and_constraint(left_witness_index, right_witness_index, 32 + extra_bits);

        for (uint32_t j = 0; j < 16; ++j) {
            uint32_t left_expected = (left_value >> (30U - (2 * j)));
            uint32_t right_expected = (right_value >> (30U - (2 * j)));
            uint32_t out_expected = left_expected & right_expected;

            fr left_source = composer.get_variable(accumulators.left[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t left_result = static_cast<uint32_t>(left_source.data[0]);

            fr right_source = composer.get_variable(accumulators.right[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t right_result = static_cast<uint32_t>(right_source.data[0]);

            fr out_source = composer.get_variable(accumulators.out[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t out_result = static_cast<uint32_t>(out_source.data[0]);

            EXPECT_EQ(left_result, left_expected);
            EXPECT_EQ(right_result, right_expected);
            EXPECT_EQ(out_result, out_expected);
        }
        for (uint32_t j = 1; j < 16; ++j) {
            uint32_t left = (left_value >> (30U - (2 * j)));
            uint32_t right = (left_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (right_value >> (30U - (2 * j)));
            right = (right_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (out_value >> (30U - (2 * j)));
            right = (out_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);
        }
    }

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, true);
}

/**
 * @brief Test that the `XOR` constraint fails when constraining too few bits.
 *
 */
TEST(turbo_plonk_composer, xor_constraint_failure)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    uint32_t left_value = 4;
    fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
    uint32_t left_witness_index = composer.add_variable(left_witness_value);

    uint32_t right_value = 1;
    fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();
    uint32_t right_witness_index = composer.add_variable(right_witness_value);

    // 4 && 1 is 5, so 3 bits are needed, but we only constrain 2
    accumulator_triple accumulators = composer.create_and_constraint(left_witness_index, right_witness_index, 2);

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    if (composer.failed()) {
        info("Composer failed; ", composer.err());
    }

    EXPECT_EQ(result, false);
}

TEST(turbo_plonk_composer, xor_constraint)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    for (size_t i = 0; i < /*10*/ 1; ++i) {
        uint32_t left_value = engine.get_random_uint32();

        fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t left_witness_index = composer.add_variable(left_witness_value);

        uint32_t right_value = engine.get_random_uint32();
        fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t right_witness_index = composer.add_variable(right_witness_value);

        uint32_t out_value = left_value ^ right_value;
        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        accumulator_triple accumulators =
            composer.create_xor_constraint(left_witness_index, right_witness_index, 32 + extra_bits);

        for (uint32_t j = 0; j < 16; ++j) {
            uint32_t left_expected = (left_value >> (30U - (2 * j)));
            uint32_t right_expected = (right_value >> (30U - (2 * j)));
            uint32_t out_expected = left_expected ^ right_expected;

            fr left_source = composer.get_variable(accumulators.left[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t left_result = static_cast<uint32_t>(left_source.data[0]);

            fr right_source = composer.get_variable(accumulators.right[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t right_result = static_cast<uint32_t>(right_source.data[0]);

            fr out_source = composer.get_variable(accumulators.out[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t out_result = static_cast<uint32_t>(out_source.data[0]);

            EXPECT_EQ(left_result, left_expected);
            EXPECT_EQ(right_result, right_expected);
            EXPECT_EQ(out_result, out_expected);
        }
        for (uint32_t j = 1; j < 16; ++j) {
            uint32_t left = (left_value >> (30U - (2 * j)));
            uint32_t right = (left_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (right_value >> (30U - (2 * j)));
            right = (right_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (out_value >> (30U - (2 * j)));
            right = (out_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);
        }
    }

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, big_add_gate_with_bit_extract)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    const auto generate_constraints = [&composer](uint32_t quad_value) {
        uint32_t quad_accumulator_left =
            (engine.get_random_uint32() & 0x3fffffff) - quad_value; // make sure this won't overflow
        uint32_t quad_accumulator_right = (4 * quad_accumulator_left) + quad_value;

        uint32_t left_idx = composer.add_variable(uint256_t(quad_accumulator_left));
        uint32_t right_idx = composer.add_variable(uint256_t(quad_accumulator_right));

        uint32_t input = engine.get_random_uint32();
        uint32_t output = input + (quad_value > 1 ? 1 : 0);

        add_quad gate{ composer.add_variable(uint256_t(input)),
                       composer.add_variable(uint256_t(output)),
                       right_idx,
                       left_idx,
                       fr(6),
                       -fr(6),
                       fr::zero(),
                       fr::zero(),
                       fr::zero() };

        composer.create_big_add_gate_with_bit_extraction(gate);
    };

    generate_constraints(0);
    generate_constraints(1);
    generate_constraints(2);
    generate_constraints(3);

    auto prover = composer.create_prover();

    auto verifier = composer.create_verifier();

    proof proof = prover.construct_proof();

    bool result = verifier.verify_proof(proof);

    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, validate_copy_constraints)
{
    for (size_t m = 0; m < 2; ++m) {
        for (size_t k = 0; k < 4; ++k) {
            for (size_t j = 0; j < 4; ++j) {
                if (m == 0 && (j > 0 || k > 0)) {
                    continue;
                }
                TurboPlonkComposer composer = TurboPlonkComposer();

                barretenberg::fr variables[4]{
                    barretenberg::fr::random_element(),
                    barretenberg::fr::random_element(),
                    barretenberg::fr::random_element(),
                    barretenberg::fr::random_element(),
                };

                uint32_t indices[4]{
                    composer.add_variable(variables[0]),
                    composer.add_variable(variables[1]),
                    composer.add_variable(variables[2]),
                    composer.add_variable(variables[3]),
                };

                for (size_t i = 0; i < 4; ++i) {
                    composer.create_big_add_gate({
                        indices[0],
                        indices[1],
                        indices[2],
                        indices[3],
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                    });

                    composer.create_big_add_gate({
                        indices[3],
                        indices[2],
                        indices[1],
                        indices[0],
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                        barretenberg::fr(0),
                    });
                }

                auto prover = composer.create_prover();

                if (m > 0) {
                    prover.key->polynomial_store.get("w_" + std::to_string(k + 1) + "_lagrange")[j] =
                        barretenberg::fr::random_element();
                }

                auto verifier = composer.create_verifier();

                proof proof = prover.construct_proof();

                bool result = verifier.verify_proof(proof);

                bool expected = (m == 0);
                EXPECT_EQ(result, expected);
            }
        }
    }
}

TEST(turbo_plonk_composer, test_check_circuit_add_gate_proofs_correct)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr a = fr::one();
    fr b = fr::one();
    fr c = a + b;
    fr d = a + c;
    uint32_t a_idx = composer.add_variable(a);
    uint32_t b_idx = composer.add_variable(b);
    uint32_t c_idx = composer.add_variable(c);
    uint32_t d_idx = composer.add_variable(d);

    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ d_idx, c_idx, a_idx, fr::one(), fr::neg_one(), fr::neg_one(), fr::zero() });

    // TODO: proof fails if one wire contains all zeros. Should we support this?
    uint32_t zero_idx = composer.add_variable(fr::zero());

    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, a_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    bool result = composer.check_circuit();
    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, test_check_circuit_add_gate_proofs_broken)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr a = fr::one();
    fr b = fr::one();
    fr c = a + b;
    fr d = a + c;
    uint32_t a_idx = composer.add_variable(a);
    uint32_t b_idx = composer.add_variable(b);
    uint32_t c_idx = composer.add_variable(c + 1);
    uint32_t d_idx = composer.add_variable(d);

    composer.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    composer.create_add_gate({ d_idx, c_idx, a_idx, fr::one(), fr::neg_one(), fr::neg_one(), fr::zero() });

    // TODO: proof fails if one wire contains all zeros. Should we support this?
    uint32_t zero_idx = composer.add_variable(fr::zero());

    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, a_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    bool result = composer.check_circuit();
    EXPECT_EQ(result, false);
}
TEST(turbo_plonk_composer, test_check_circuit_mul_gate_proofs_correct)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr q[7]{ fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(),
             fr::random_element(), fr::random_element(), fr::random_element() };
    fr q_inv[7]{
        q[0].invert(), q[1].invert(), q[2].invert(), q[3].invert(), q[4].invert(), q[5].invert(), q[6].invert(),
    };

    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = -((((q[0] * a) + (q[1] * b)) + q[3]) * q_inv[2]);
    fr d = -((((q[4] * (a * b)) + q[6]) * q_inv[5]));

    uint32_t a_idx = composer.add_public_variable(a);
    uint32_t b_idx = composer.add_variable(b);
    uint32_t c_idx = composer.add_variable(c);
    uint32_t d_idx = composer.add_variable(d);

    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    uint32_t e_idx = composer.add_variable(a - fr::one());
    composer.create_add_gate({ e_idx, b_idx, c_idx, q[0], q[1], q[2], (q[3] + q[0]) });

    bool result = composer.check_circuit();

    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, test_check_circuit_mul_gate_proofs_broken)
{
    TurboPlonkComposer composer = TurboPlonkComposer();
    fr q[7]{ fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(),
             fr::random_element(), fr::random_element(), fr::random_element() };
    fr q_inv[7]{
        q[0].invert(), q[1].invert(), q[2].invert(), q[3].invert(), q[4].invert(), q[5].invert(), q[6].invert(),
    };

    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = -((((q[0] * a) + (q[1] * b)) + q[3]) * q_inv[2]);
    fr d = -((((q[4] * (a * b)) + q[6]) * q_inv[5]));

    uint32_t a_idx = composer.add_public_variable(a);
    uint32_t b_idx = composer.add_variable(b);
    uint32_t c_idx = composer.add_variable(c + 1);
    uint32_t d_idx = composer.add_variable(d);

    composer.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    composer.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    uint32_t e_idx = composer.add_variable(a - fr::one());
    composer.create_add_gate({ e_idx, b_idx, c_idx, q[0], q[1], q[2], (q[3] + q[0]) });

    bool result = composer.check_circuit();

    EXPECT_EQ(result, false);
}
TEST(turbo_plonk_composer, test_check_circuit_fixed_group)
{
    constexpr size_t num_bits = 254;
    constexpr size_t num_quads_base = (num_bits - 1) >> 1;
    constexpr size_t num_quads = ((num_quads_base << 1) + 1 < num_bits) ? num_quads_base + 1 : num_quads_base;
    constexpr size_t num_wnaf_bits = (num_quads << 1) + 1;

    constexpr size_t initial_exponent = num_bits; // ((num_bits & 1) == 1) ? num_bits - 1 : num_bits;
    auto gen_data = crypto::generators::get_generator_data(DEFAULT_GEN_1);
    const crypto::generators::fixed_base_ladder* ladder = gen_data.get_ladder(num_bits);
    grumpkin::g1::affine_element generator = gen_data.generator;

    grumpkin::g1::element origin_points[2];
    origin_points[0] = grumpkin::g1::element(ladder[0].one);
    origin_points[1] = origin_points[0] + generator;
    origin_points[1] = origin_points[1].normalize();

    grumpkin::fr scalar_multiplier_base = grumpkin::fr::random_element();

    grumpkin::fr scalar_multiplier = scalar_multiplier_base.from_montgomery_form();

    if ((scalar_multiplier.data[0] & 1) == 0) {
        grumpkin::fr two = grumpkin::fr::one() + grumpkin::fr::one();
        scalar_multiplier_base = scalar_multiplier_base - two;
    }
    scalar_multiplier_base = scalar_multiplier_base.from_montgomery_form();
    uint64_t wnaf_entries[num_quads + 1] = { 0 };

    bool skew = false;
    barretenberg::wnaf::fixed_wnaf<num_wnaf_bits, 1, 2>(&scalar_multiplier_base.data[0], &wnaf_entries[0], skew, 0);

    fr accumulator_offset = (fr::one() + fr::one()).pow(static_cast<uint64_t>(initial_exponent)).invert();
    fr origin_accumulators[2]{ fr::one(), accumulator_offset + fr::one() };

    grumpkin::g1::element* multiplication_transcript =
        static_cast<grumpkin::g1::element*>(aligned_alloc(64, sizeof(grumpkin::g1::element) * (num_quads + 1)));
    fr* accumulator_transcript = static_cast<fr*>(aligned_alloc(64, sizeof(fr) * (num_quads + 1)));

    if (skew) {
        multiplication_transcript[0] = origin_points[1];
        accumulator_transcript[0] = origin_accumulators[1];
    } else {
        multiplication_transcript[0] = origin_points[0];
        accumulator_transcript[0] = origin_accumulators[0];
    }

    fr one = fr::one();
    fr three = ((one + one) + one);
    for (size_t i = 0; i < num_quads; ++i) {
        uint64_t entry = wnaf_entries[i + 1] & 0xffffff;
        fr prev_accumulator = accumulator_transcript[i] + accumulator_transcript[i];
        prev_accumulator = prev_accumulator + prev_accumulator;

        grumpkin::g1::affine_element point_to_add = (entry == 1) ? ladder[i + 1].three : ladder[i + 1].one;
        fr scalar_to_add = (entry == 1) ? three : one;
        uint64_t predicate = (wnaf_entries[i + 1] >> 31U) & 1U;
        if (predicate) {
            point_to_add = -point_to_add;
            scalar_to_add.self_neg();
        }
        accumulator_transcript[i + 1] = prev_accumulator + scalar_to_add;
        multiplication_transcript[i + 1] = multiplication_transcript[i] + point_to_add;
    }
    grumpkin::g1::element::batch_normalize(&multiplication_transcript[0], num_quads + 1);

    fixed_group_init_quad init_quad{ origin_points[0].x,
                                     (origin_points[0].x - origin_points[1].x),
                                     origin_points[0].y,
                                     (origin_points[0].y - origin_points[1].y) };

    TurboPlonkComposer composer = TurboPlonkComposer();

    fr x_alpha = accumulator_offset;
    for (size_t i = 0; i < num_quads; ++i) {
        fixed_group_add_quad round_quad;
        round_quad.d = composer.add_variable(accumulator_transcript[i]);
        round_quad.a = composer.add_variable(multiplication_transcript[i].x);
        round_quad.b = composer.add_variable(multiplication_transcript[i].y);
        round_quad.c = composer.add_variable(x_alpha);
        if ((wnaf_entries[i + 1] & 0xffffffU) == 0) {
            x_alpha = ladder[i + 1].one.x;
        } else {
            x_alpha = ladder[i + 1].three.x;
        }
        round_quad.q_x_1 = ladder[i + 1].q_x_1;
        round_quad.q_x_2 = ladder[i + 1].q_x_2;
        round_quad.q_y_1 = ladder[i + 1].q_y_1;
        round_quad.q_y_2 = ladder[i + 1].q_y_2;

        if (i > 0) {
            composer.create_fixed_group_add_gate(round_quad);
        } else {
            composer.create_fixed_group_add_gate_with_init(round_quad, init_quad);
        }
    }

    add_quad add_quad{ composer.add_variable(multiplication_transcript[num_quads].x),
                       composer.add_variable(multiplication_transcript[num_quads].y),
                       composer.add_variable(x_alpha),
                       composer.add_variable(accumulator_transcript[num_quads]),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero(),
                       fr::zero() };
    composer.create_big_add_gate(add_quad);

    grumpkin::g1::element expected_point =
        grumpkin::g1::element(generator * scalar_multiplier.to_montgomery_form()).normalize();
    EXPECT_EQ((multiplication_transcript[num_quads].x == expected_point.x), true);
    EXPECT_EQ((multiplication_transcript[num_quads].y == expected_point.y), true);

    fr result_accumulator = (accumulator_transcript[num_quads]);
    fr expected_accumulator =
        fr{ scalar_multiplier.data[0], scalar_multiplier.data[1], scalar_multiplier.data[2], scalar_multiplier.data[3] }
            .to_montgomery_form();
    EXPECT_EQ((result_accumulator == expected_accumulator), true);

    bool result = composer.check_circuit();

    EXPECT_EQ(result, true);

    free(multiplication_transcript);
    free(accumulator_transcript);
}

TEST(turbo_plonk_composer, test_check_circuit_range_constraint)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    for (size_t i = 0; i < 10; ++i) {
        uint32_t value = engine.get_random_uint32();
        fr witness_value = fr{ value, 0, 0, 0 }.to_montgomery_form();
        uint32_t witness_index = composer.add_variable(witness_value);

        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        std::vector<uint32_t> accumulators = composer.decompose_into_base4_accumulators(
            witness_index, 32 + extra_bits, "range constraint fails in test_check_circuit_range_constraint");
    }

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    bool result = composer.check_circuit();

    EXPECT_EQ(result, true);
}

TEST(turbo_plonk_composer, test_check_circuit_xor)
{
    TurboPlonkComposer composer = TurboPlonkComposer();

    for (size_t i = 0; i < /*10*/ 1; ++i) {
        uint32_t left_value = engine.get_random_uint32();

        fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t left_witness_index = composer.add_variable(left_witness_value);

        uint32_t right_value = engine.get_random_uint32();
        fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t right_witness_index = composer.add_variable(right_witness_value);

        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        accumulator_triple accumulators =
            composer.create_xor_constraint(left_witness_index, right_witness_index, 32 + extra_bits);
    }

    uint32_t zero_idx = composer.add_variable(fr::zero());
    uint32_t one_idx = composer.add_variable(fr::one());
    composer.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    bool result = composer.check_circuit();

    EXPECT_EQ(result, true);
}
} // namespace proof_system::plonk::test_turbo_plonk_composer