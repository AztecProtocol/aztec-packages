// Tests for the experimental BN254_MSM proof type (see bn254_msm_constraint.hpp).
// They build circuits and run the circuit checker and the ECCVM trace checker only. They do not prove.
//
// The app-circuit rejection tests check both the witness-generation failure flag (builder.failed(), set by the
// native checks while the circuit is built) and the constrained relation (CircuitChecker). One of them alone could
// hide a missing constraint.

#include <gtest/gtest.h>
#include <optional>
#include <string>
#include <vector>

#include "acir_format.hpp"
#include "acir_to_constraint_buf.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/eccvm/eccvm_trace_checker.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "serde/acir.hpp"

using namespace acir_format;

namespace {

constexpr size_t NUM_POINTS = 2;
// Witness layout: key = 4 * NUM_POINTS limbs, scalars, result limbs, key_hash, predicate.
constexpr uint32_t SCALARS_START = 4 * NUM_POINTS;
constexpr uint32_t RESULT_START = SCALARS_START + NUM_POINTS;
constexpr uint32_t KEY_HASH = RESULT_START + 4;
constexpr uint32_t PREDICATE = KEY_HASH + 1;
constexpr uint32_t NUM_WITNESSES = PREDICATE + 1;

Acir::FunctionInput witness_input(uint32_t index)
{
    return Acir::FunctionInput{ .value = Acir::FunctionInput::Witness{ .value = Acir::Witness{ .value = index } } };
}

std::vector<Acir::FunctionInput> witness_range(uint32_t start, uint32_t count)
{
    std::vector<Acir::FunctionInput> out;
    for (uint32_t i = 0; i < count; ++i) {
        out.push_back(witness_input(start + i));
    }
    return out;
}

// One RecursiveAggregation opcode with proof_type BN254_MSM. With constant_predicate the predicate is the constant 1
// (the form Noir emits for an unconditional call); otherwise it is the witness PREDICATE.
Acir::Circuit msm_circuit(bool constant_predicate)
{
    Acir::FunctionInput predicate = witness_input(PREDICATE);
    if (constant_predicate) {
        predicate = Acir::FunctionInput{ .value = Acir::FunctionInput::Constant{ .value = bb::fr(1).to_buffer() } };
    }
    Acir::BlackBoxFuncCall call;
    call.value = Acir::BlackBoxFuncCall::RecursiveAggregation{
        .verification_key = witness_range(0, 4 * NUM_POINTS),
        .proof = witness_range(RESULT_START, 4),
        .public_inputs = witness_range(SCALARS_START, NUM_POINTS),
        .key_hash = witness_input(KEY_HASH),
        .proof_type = BN254_MSM,
        .predicate = predicate,
    };
    Acir::Circuit circuit;
    circuit.opcodes = { Acir::Opcode{ Acir::Opcode::BlackBoxFuncCall{ .value = call } } };
    return circuit;
}

// Radix 2^136 limbs [lo, hi] of a base field element (or of any value below 2^272).
std::pair<bb::fr, bb::fr> limbs(const uint256_t& value)
{
    return { bb::fr(value.slice(0, 136)), bb::fr(value.slice(136, 256)) };
}

void write_point(WitnessVector& witness, uint32_t start, const bb::g1::affine_element& point)
{
    uint256_t x = point.is_point_at_infinity() ? uint256_t(0) : uint256_t(point.x);
    uint256_t y = point.is_point_at_infinity() ? uint256_t(0) : uint256_t(point.y);
    std::tie(witness[start], witness[start + 1]) = limbs(x);
    std::tie(witness[start + 2], witness[start + 3]) = limbs(y);
}

// P_0 is the generator (1, 2): x + q still fits the bigfield limb ranges (see the non-canonical test).
const std::vector<bb::g1::affine_element>& test_points()
{
    static const std::vector<bb::g1::affine_element> points = { bb::g1::affine_one, bb::g1::affine_one * bb::fr(11) };
    return points;
}

bb::g1::affine_element msm(const std::vector<bb::fr>& scalars)
{
    const auto& points = test_points();
    return bb::g1::affine_element(bb::g1::element(points[0]) * scalars[0] + bb::g1::element(points[1]) * scalars[1]);
}

// Witness with the given scalars and claimed result, key_hash = 0 and predicate = 1. The default is satisfying:
// result = s_0 * P_0 + s_1 * P_1 with fixed scalars; the second uses the full scalar width.
WitnessVector valid_witness(const std::vector<bb::fr>& scalars = { bb::fr(123456789), -bb::fr(5) },
                            std::optional<bb::g1::affine_element> claimed = std::nullopt)
{
    WitnessVector witness(NUM_WITNESSES, bb::fr(0));
    const auto& points = test_points();
    bb::g1::affine_element result = claimed.value_or(msm(scalars));
    for (size_t i = 0; i < NUM_POINTS; ++i) {
        write_point(witness, static_cast<uint32_t>(4 * i), points[i]);
        witness[SCALARS_START + i] = scalars[i];
    }
    write_point(witness, RESULT_START, result);
    witness[PREDICATE] = bb::fr(1);
    return witness;
}

// Builds a Mega-family circuit containing one BN254_MSM opcode with a witness predicate.
template <typename Builder> Builder build(WitnessVector witness)
{
    AcirFormat constraints = circuit_serde_to_acir_format(msm_circuit(/*constant_predicate=*/false), /*is_mega=*/true);
    witness.resize(constraints.max_witness_index + 1, bb::fr(0));
    AcirProgram program{ constraints, witness };
    return create_circuit<Builder>(program, ProgramMetadata{});
}

// Adds the BN254_MSM constraints (constant predicate) to an app circuit that shares op_queue with earlier circuits,
// as Chonk does.
MegaAppCircuitBuilder build_on_queue(const std::shared_ptr<bb::ECCOpQueue>& op_queue, WitnessVector witness)
{
    AcirFormat constraints = circuit_serde_to_acir_format(msm_circuit(/*constant_predicate=*/true), /*is_mega=*/true);
    witness.resize(constraints.max_witness_index + 1, bb::fr(0));
    MegaAppCircuitBuilder builder{ op_queue, witness, constraints.public_inputs, /*is_write_vk_mode=*/false };
    build_constraints(builder, constraints, ProgramMetadata{});
    return builder;
}

// ECCVM trace check of everything queued so far. Every circuit must be merged first. with_separators installs the
// fixed equality-to-infinity/reset separator after every subtable, as Goblin::prove_batch_merge and the recursive
// batch-merge verifier require. The false branch deliberately omits that boundary constraint to exercise the attack.
bool eccvm_trace_accepts(const std::shared_ptr<bb::ECCOpQueue>& op_queue, bool with_separators)
{
    if (with_separators) {
        op_queue->add_batch_merge_separators();
    }
    op_queue->append_hiding_op(bb::fq::random_element(), bb::fq::random_element());
    auto queue = op_queue;
    bb::ECCVMCircuitBuilder eccvm{ queue };
    return bb::ECCVMTraceChecker::check(eccvm);
}

} // namespace

class Bn254MsmConstraintTest : public ::testing::Test {};

// App circuits (MegaAppCircuitBuilder, the builder Chonk uses for apps) accept a correct MSM claim and queue
// the group operations to the ECC op queue.
TEST_F(Bn254MsmConstraintTest, AppAcceptsCorrectResultAndQueuesOps)
{
    AcirProgram empty_program{ circuit_serde_to_acir_format(Acir::Circuit{}, /*is_mega=*/true), { bb::fr(0) } };
    auto baseline = create_circuit<MegaAppCircuitBuilder>(empty_program, ProgramMetadata{});
    auto builder = build<MegaAppCircuitBuilder>(valid_witness());
    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
    // batch_mul queues at least one mul per point and one equality op.
    EXPECT_GE(builder.op_queue->get_current_subtable_size(),
              baseline.op_queue->get_current_subtable_size() + NUM_POINTS + 1);
}

// A wrong claimed result. Witness generation flags it. The constrained relation is a copy constraint between the
// claimed limbs and the result limbs of the closing equality op, whose point the ECCVM checks against the
// accumulator. With a witness predicate, the conditional-assign gate also fails in the circuit checker.
TEST_F(Bn254MsmConstraintTest, AppRejectsIncorrectResult)
{
    WitnessVector witness = valid_witness();
    write_point(witness, RESULT_START, bb::g1::affine_one);
    auto builder = build<MegaAppCircuitBuilder>(witness);
    EXPECT_TRUE(builder.failed());
    EXPECT_NE(builder.err().find("BN254_MSM incorrect result"), std::string::npos) << builder.err();
    EXPECT_FALSE(CircuitChecker::check(builder));
}

// x + q has the same residue as x but is not canonical. The handler must reject it so that the queued
// coordinate is the one the Noir caller supplied. With x = 1, x + q passes the limb range checks, so this
// exercises the in-circuit comparison with q.
TEST_F(Bn254MsmConstraintTest, AppRejectsNonCanonicalCoordinate)
{
    WitnessVector witness = valid_witness();
    uint256_t shifted_x = uint256_t(bb::g1::affine_one.x) + uint256_t(bb::fq::modulus);
    std::tie(witness[0], witness[1]) = limbs(shifted_x);
    auto builder = build<MegaAppCircuitBuilder>(witness);
    EXPECT_TRUE(builder.failed());
    EXPECT_NE(builder.err().find("BN254_MSM coordinate must be canonical"), std::string::npos) << builder.err();
    EXPECT_FALSE(CircuitChecker::check(builder));
}

// A preceding app circuit ends its subtable with a dangling add(P), and the next app's BN254_MSM claims MSM + P.
// The native accumulator assertion in Goblin batch_mul is a prover-side check, not a constraint, so it is disabled
// here to model a malicious prover. The victim's Mega circuit is satisfied, because the carry is invisible to it.
// With the batch-merge separator after every subtable the ECCVM rejects the queue (the separator's equality to
// infinity needs an empty accumulator). Without separators the same queue is accepted, which shows that this test
// detects the carry.
TEST_F(Bn254MsmConstraintTest, CrossAppCarryIsRejectedBySubtableSeparator)
{
    BB_DISABLE_ASSERTS();
    const std::vector<bb::fr> scalars = { bb::fr(1), bb::fr(42) };
    const std::vector<bb::fr> other_scalars = { bb::fr(1), bb::fr(1337) };
    const bb::g1::affine_element claimed = msm(other_scalars);
    const bb::g1::affine_element carry(bb::g1::element(claimed) - bb::g1::element(msm(scalars)));
    for (bool with_separators : { true, false }) {
        auto op_queue = std::make_shared<bb::ECCOpQueue>();
        MegaAppCircuitBuilder attacker{ op_queue };
        attacker.queue_ecc_add_accum(carry);
        EXPECT_TRUE(CircuitChecker::check(attacker));
        op_queue->merge();
        auto victim = build_on_queue(op_queue, valid_witness(scalars, claimed));
        EXPECT_FALSE(victim.failed()) << victim.err();
        EXPECT_TRUE(CircuitChecker::check(victim));
        op_queue->merge();
        EXPECT_EQ(eccvm_trace_accepts(op_queue, with_separators), !with_separators)
            << "with_separators=" << with_separators;
    }
}

// Point membership is an ECCVM relation, not an app-circuit constraint. The off-curve point gets a zero scalar, so
// the native and ECCVM accumulators agree (the point never enters the MSM) and the app circuit is satisfied. Only
// the ECCVM transcript's on-curve check can then reject the queue. The same queue with P_0 on the curve is accepted.
TEST_F(Bn254MsmConstraintTest, EccvmRejectsActiveOffCurvePoint)
{
    for (bool off_curve : { false, true }) {
        auto witness = valid_witness({ 0, 42 });
        if (off_curve) {
            witness[0] = bb::fr(5); // (5, 2) is not on BN254.
        }
        auto queue = std::make_shared<bb::ECCOpQueue>();
        auto builder = build_on_queue(queue, witness);
        EXPECT_FALSE(builder.failed()) << builder.err();
        EXPECT_TRUE(CircuitChecker::check(builder));
        queue->merge();
        EXPECT_EQ(eccvm_trace_accepts(queue, /*with_separators=*/true), !off_curve) << "off_curve=" << off_curve;
    }
}

// Kernels drop the non-native-field gate the handler needs. They must reject BN254_MSM with an assertion
// failure, never skip it.
TEST_F(Bn254MsmConstraintTest, KernelRejects)
{
    EXPECT_THROW_WITH_MESSAGE(build<MegaKernelCircuitBuilder>(valid_witness()),
                              "Honk recursion constraints are not supported by this arithmetization");
}
