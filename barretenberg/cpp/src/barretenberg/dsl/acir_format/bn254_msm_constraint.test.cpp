// Tests for the experimental BN254_MSM proof type (see bn254_msm_constraint.hpp).
// They build circuits and run the circuit checker and the ECCVM trace checker only. They do not prove.
//
// Rejection tests check two things separately: the witness-generation failure flag (builder.failed(), set by the
// native checks while the circuit is built) and the constrained relation (CircuitChecker on its own, or the copy
// constraint where the relation is a copy constraint). One of them alone could hide a missing constraint.

#include <array>
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

// One RecursiveAggregation opcode with proof_type BN254_MSM, as std::verify_proof_with_type emits it. Noir emits an
// unconditional call with the constant predicate 1; constant_predicate selects that form.
Acir::Circuit msm_circuit(bool constant_predicate = false, bool enabled = true)
{
    Acir::BlackBoxFuncCall call;
    call.value = Acir::BlackBoxFuncCall::RecursiveAggregation{
        .verification_key = witness_range(0, 4 * NUM_POINTS),
        .proof = witness_range(RESULT_START, 4),
        .public_inputs = witness_range(SCALARS_START, NUM_POINTS),
        .key_hash = witness_input(KEY_HASH),
        .proof_type = BN254_MSM,
        .predicate = constant_predicate ? Acir::FunctionInput{ .value =
                                                                   Acir::FunctionInput::Constant{
                                                                       .value = bb::fr(enabled ? 1 : 0).to_buffer() } }
                                        : witness_input(PREDICATE),
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

template <typename Builder> Builder build(WitnessVector witness, bool is_mega = true, bool constant_predicate = false)
{
    AcirFormat constraints = circuit_serde_to_acir_format(msm_circuit(constant_predicate), is_mega);
    witness.resize(constraints.max_witness_index + 1, bb::fr(0));
    AcirProgram program{ constraints, witness };
    return create_circuit<Builder>(program, ProgramMetadata{});
}

// Adds the BN254_MSM constraints to an app circuit that shares op_queue with earlier circuits, as Chonk does.
MegaAppCircuitBuilder build_on_queue(const std::shared_ptr<bb::ECCOpQueue>& op_queue,
                                     WitnessVector witness,
                                     bool constant_predicate = true)
{
    AcirFormat constraints = circuit_serde_to_acir_format(msm_circuit(constant_predicate), /*is_mega=*/true);
    witness.resize(constraints.max_witness_index + 1, bb::fr(0));
    MegaAppCircuitBuilder builder{ op_queue, witness, constraints.public_inputs, /*is_write_vk_mode=*/false };
    build_constraints(builder, constraints, ProgramMetadata{});
    return builder;
}

// Op codes of the circuit's ECC op rows, in queue order (first row of each two-row op).
std::vector<uint32_t> op_codes(auto& builder)
{
    std::vector<uint32_t> codes;
    auto& op_wires = builder.blocks.ecc_op.w_l();
    for (size_t row = 0; row < builder.blocks.ecc_op.size(); row += 2) {
        codes.push_back(static_cast<uint32_t>(uint256_t(builder.get_variable(op_wires[row]))));
    }
    return codes;
}

// Witness indices of the result limbs (x_lo, x_hi, y_lo, y_hi) of the last ECC op of the circuit.
std::array<uint32_t, 4> last_op_point_limbs(auto& builder)
{
    auto& block = builder.blocks.ecc_op;
    const size_t row = block.size() - 2;
    return { block.w_r()[row], block.w_o()[row], block.w_4()[row], block.w_r()[row + 1] };
}

bool same_copy_class(auto& builder, uint32_t a, uint32_t b)
{
    return builder.real_variable_index[a] == builder.real_variable_index[b];
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

constexpr uint32_t OP_ADD = 8; // EccOpCode{ .add = true }
constexpr uint32_t OP_MUL = 4; // EccOpCode{ .mul = true }
constexpr uint32_t OP_EQ = 3;  // EccOpCode{ .eq = true, .reset = true }

} // namespace

class Bn254MsmConstraintTest : public ::testing::Test {};

// The parser routes proof type 9 to the Honk recursion list; the handler consumes it there.
TEST_F(Bn254MsmConstraintTest, ParserRoutesToHonkRecursionList)
{
    AcirFormat constraints = circuit_serde_to_acir_format(msm_circuit(), /*is_mega=*/true);
    ASSERT_EQ(constraints.honk_recursion_constraints.size(), 1U);
    EXPECT_EQ(constraints.honk_recursion_constraints[0].proof_type, BN254_MSM);
    EXPECT_TRUE(constraints.hn_recursion_constraints.empty());
}

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

// The full Mega builder (not a Chonk circuit kind) also accepts the selector.
TEST_F(Bn254MsmConstraintTest, FullMegaAcceptsCorrectResult)
{
    auto builder = build<MegaCircuitBuilder>(valid_witness());
    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
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

// Noir's form: constant predicate, so the claimed limbs are the ACIR witnesses themselves. The circuit checker
// evaluates copy-constrained witnesses through one shared value, so it cannot see a copy-constraint violation. The
// relation is checked directly: every claimed limb is in the copy class of the equality op's result limb. The
// permutation argument enforces this in a proof; the ECCVM equality row binds that op to the accumulator.
TEST_F(Bn254MsmConstraintTest, AppIncorrectResultConstantPredicateIsCopyConstrained)
{
    WitnessVector witness = valid_witness();
    write_point(witness, RESULT_START, bb::g1::affine_one);
    auto builder = build<MegaAppCircuitBuilder>(witness, /*is_mega=*/true, /*constant_predicate=*/true);
    EXPECT_TRUE(builder.failed());
    EXPECT_NE(builder.err().find("BN254_MSM incorrect result"), std::string::npos) << builder.err();
    const auto codes = op_codes(builder);
    ASSERT_FALSE(codes.empty());
    EXPECT_EQ(codes.back(), OP_EQ);
    const auto eq_limbs = last_op_point_limbs(builder);
    for (uint32_t i = 0; i < 4; ++i) {
        EXPECT_TRUE(same_copy_class(builder, RESULT_START + i, eq_limbs[i])) << "claimed limb " << i;
    }
    // The same structure holds for a correct claim, so the copy constraint is not created by the failure.
    auto good = build<MegaAppCircuitBuilder>(valid_witness(), /*is_mega=*/true, /*constant_predicate=*/true);
    EXPECT_FALSE(good.failed()) << good.err();
    EXPECT_TRUE(CircuitChecker::check(good));
    const auto good_limbs = last_op_point_limbs(good);
    for (uint32_t i = 0; i < 4; ++i) {
        EXPECT_TRUE(same_copy_class(good, RESULT_START + i, good_limbs[i])) << "claimed limb " << i;
    }
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

TEST_F(Bn254MsmConstraintTest, AppRejectsNonZeroKeyHash)
{
    WitnessVector witness = valid_witness();
    witness[KEY_HASH] = bb::fr(1);
    auto builder = build<MegaAppCircuitBuilder>(witness);
    EXPECT_TRUE(builder.failed());
    EXPECT_NE(builder.err().find("BN254_MSM reserved key_hash must be zero"), std::string::npos) << builder.err();
    EXPECT_FALSE(CircuitChecker::check(builder));
}

// A disabled call may carry arbitrary point and result witnesses; the handler substitutes safe values.
TEST_F(Bn254MsmConstraintTest, AppDisabledCallIgnoresArbitraryInputs)
{
    WitnessVector witness = valid_witness();
    witness[PREDICATE] = bb::fr(0);
    witness[0] = bb::fr(5); // not a curve point
    witness[RESULT_START] = bb::fr(123);
    auto builder = build<MegaAppCircuitBuilder>(witness);
    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Kernels drop the non-native-field gate the handler needs. They must reject BN254_MSM with an assertion
// failure, never skip it.
TEST_F(Bn254MsmConstraintTest, KernelRejects)
{
    EXPECT_THROW_WITH_MESSAGE(build<MegaKernelCircuitBuilder>(valid_witness()),
                              "Honk recursion constraints are not supported by this arithmetization");
}

TEST_F(Bn254MsmConstraintTest, HidingKernelRejects)
{
    EXPECT_THROW_WITH_MESSAGE(build<MegaHidingKernelCircuitBuilder>(valid_witness()),
                              "Honk recursion constraints are not supported by this arithmetization");
}

// Ultra has no ECC op queue. BN254_MSM is not a supported proof type there.
TEST_F(Bn254MsmConstraintTest, UltraRejects)
{
    EXPECT_THROW_WITH_MESSAGE(build<UltraCircuitBuilder>(valid_witness(), /*is_mega=*/false),
                              "Invalid Honk proof type");
}

// Operation order. Each BN254_MSM opcode queues one add or mul per point and then one eq-and-reset, so the
// accumulator is empty after every opcode. Two opcodes in one app circuit give [mul, mul, eq, mul, mul, eq], and
// the ECCVM accepts the honest queue.
TEST_F(Bn254MsmConstraintTest, AppOpGroupsCloseTheAccumulator)
{
    Acir::Circuit circuit = msm_circuit(/*constant_predicate=*/true);
    circuit.opcodes.push_back(circuit.opcodes[0]);
    AcirFormat constraints = circuit_serde_to_acir_format(circuit, /*is_mega=*/true);
    WitnessVector witness = valid_witness();
    witness.resize(constraints.max_witness_index + 1, bb::fr(0));
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    MegaAppCircuitBuilder builder{ op_queue, witness, constraints.public_inputs, /*is_write_vk_mode=*/false };
    build_constraints(builder, constraints, ProgramMetadata{});
    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
    EXPECT_TRUE(op_queue->get_accumulator().is_point_at_infinity());
    EXPECT_EQ(op_codes(builder), (std::vector<uint32_t>{ OP_MUL, OP_MUL, OP_EQ, OP_MUL, OP_MUL, OP_EQ }));
    op_queue->merge();
    EXPECT_TRUE(eccvm_trace_accepts(op_queue, /*with_separators=*/true));
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
        EXPECT_EQ(op_codes(attacker), std::vector<uint32_t>{ OP_ADD });
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

// Control for the test above: the same victim without a carry is accepted with separators, and the shifted claim
// without a carry fails witness generation.
TEST_F(Bn254MsmConstraintTest, SeparatedAppsWithoutCarryAreAccepted)
{
    const std::vector<bb::fr> scalars = { bb::fr(1), bb::fr(42) };
    auto op_queue = std::make_shared<bb::ECCOpQueue>();
    MegaAppCircuitBuilder first{ op_queue };
    first.queue_ecc_mul_accum(bb::g1::affine_one, bb::fr(7));
    first.queue_ecc_eq();
    op_queue->merge();
    auto victim = build_on_queue(op_queue, valid_witness(scalars));
    EXPECT_FALSE(victim.failed()) << victim.err();
    EXPECT_TRUE(CircuitChecker::check(victim));
    op_queue->merge();
    EXPECT_TRUE(eccvm_trace_accepts(op_queue, /*with_separators=*/true));

    auto shifted = build<MegaAppCircuitBuilder>(valid_witness(scalars, msm({ bb::fr(1), bb::fr(1337) })),
                                                /*is_mega=*/true,
                                                /*constant_predicate=*/true);
    EXPECT_TRUE(shifted.failed());
    EXPECT_NE(shifted.err().find("BN254_MSM incorrect result"), std::string::npos) << shifted.err();
}

TEST_F(Bn254MsmConstraintTest, AppRejectsMalformedShapes)
{
    auto check = [](int shape) {
        auto constraints = circuit_serde_to_acir_format(msm_circuit(), true);
        auto& msm_constraint = constraints.honk_recursion_constraints[0];
        if (shape == 0) {
            msm_constraint.public_inputs.clear();
        }
        if (shape == 1) {
            msm_constraint.key.pop_back();
        }
        if (shape == 2) {
            msm_constraint.proof.pop_back();
        }
        auto witness = valid_witness();
        witness.resize(constraints.max_witness_index + 1, bb::fr(0));
        AcirProgram program{ constraints, witness };
        return create_circuit<MegaAppCircuitBuilder>(program, ProgramMetadata{});
    };
    EXPECT_THROW_WITH_MESSAGE(check(0), "BN254_MSM requires at least one point");
    EXPECT_THROW_WITH_MESSAGE(check(1), "BN254_MSM point/scalar count mismatch");
    EXPECT_THROW_WITH_MESSAGE(check(2), "BN254_MSM output must have four limbs");
}

TEST_F(Bn254MsmConstraintTest, AppRejectsNonBooleanPredicate)
{
    auto witness = valid_witness();
    witness[PREDICATE] = bb::fr(2);
    EXPECT_THROW_WITH_MESSAGE(build<MegaAppCircuitBuilder>(witness),
                              "Attempting to create a bool_t from a witness_t not satisfying");
    // Bypass the native constructor rejection: mutate a satisfying circuit witness.
    auto builder = build<MegaAppCircuitBuilder>(valid_witness());
    auto& variables = const_cast<std::vector<bb::fr>&>(builder.get_variables());
    variables[builder.real_variable_index[PREDICATE]] = bb::fr(2);
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST_F(Bn254MsmConstraintTest, AppAcceptsZeroScalarsAndCancellation)
{
    for (const auto& scalars : std::vector<std::vector<bb::fr>>{ { 0, 0 }, { 11, -bb::fr(1) } }) {
        auto builder = build<MegaAppCircuitBuilder>(valid_witness(scalars));
        EXPECT_FALSE(builder.failed()) << builder.err();
        EXPECT_TRUE(CircuitChecker::check(builder));
        EXPECT_TRUE(builder.op_queue->get_accumulator().is_point_at_infinity());
    }
}

TEST_F(Bn254MsmConstraintTest, AppAcceptsInfinityInput)
{
    auto witness = valid_witness({ 0, 1 }, test_points()[1]);
    for (size_t i = 0; i < 4; ++i) {
        witness[i] = bb::fr(0);
    }
    witness[SCALARS_START] = bb::fr(17);
    auto builder = build<MegaAppCircuitBuilder>(witness);
    EXPECT_FALSE(builder.failed()) << builder.err();
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// The claimed result is the correct point (1, 2), with x given either canonically or as 1 + q. The op queue reads a
// coordinate as x_lo + 2^136 * x_hi mod q, so both forms are the same op-queue point. The honest op queue writes the
// canonical form, so witness generation also flags 1 + q as a mismatch with the equality op. A malicious prover
// writes the claimed limbs into the equality op instead; the test models this by setting the equality op's x limbs,
// which the claimed limbs are copy-constrained to, to the claimed limbs. Then only the canonicality check on the
// claimed result can reject 1 + q. The same rewrite with the canonical claim is accepted.
TEST_F(Bn254MsmConstraintTest, AppRejectsNonCanonicalClaimedCoordinate)
{
    const uint256_t x = uint256_t(bb::g1::affine_one.x);
    for (bool constant_predicate : { false, true }) {
        for (bool non_canonical : { false, true }) {
            auto witness = valid_witness({ 1, 0 }, bb::g1::affine_one);
            std::tie(witness[RESULT_START], witness[RESULT_START + 1]) =
                limbs(non_canonical ? x + uint256_t(bb::fq::modulus) : x);
            const bb::UltraOp claimed_op{ .x_lo = witness[RESULT_START],
                                          .x_hi = witness[RESULT_START + 1],
                                          .y_lo = witness[RESULT_START + 2],
                                          .y_hi = witness[RESULT_START + 3] };
            EXPECT_EQ(claimed_op.get_base_point_standard_form(),
                      (std::array<bb::fq, 2>{ bb::g1::affine_one.x, bb::g1::affine_one.y }));

            auto builder = build<MegaAppCircuitBuilder>(witness, /*is_mega=*/true, constant_predicate);
            EXPECT_EQ(builder.failed(), non_canonical) << builder.err();
            if (non_canonical) {
                EXPECT_NE(builder.err().find("BN254_MSM coordinate must be canonical"), std::string::npos)
                    << builder.err();
            }
            ASSERT_EQ(op_codes(builder).back(), OP_EQ);
            const auto eq_limbs = last_op_point_limbs(builder);
            auto& variables = const_cast<std::vector<bb::fr>&>(builder.get_variables());
            for (uint32_t i = 0; i < 2; ++i) {
                variables[builder.real_variable_index[eq_limbs[i]]] = witness[RESULT_START + i];
            }
            EXPECT_EQ(CircuitChecker::check(builder), !non_canonical)
                << "constant_predicate=" << constant_predicate << " non_canonical=" << non_canonical;
        }
    }
}

TEST_F(Bn254MsmConstraintTest, AppRejectsOversizedCoordinateLimb)
{
    auto witness = valid_witness();
    witness[0] = bb::fr(uint256_t(1) << 136);
    EXPECT_THROW_WITH_MESSAGE(build<MegaAppCircuitBuilder>(witness), "low_bits_in.get_value()");
    // Independently test the constraints, without invoking the rejecting constructor.
    auto builder = build<MegaAppCircuitBuilder>(valid_witness());
    auto& variables = const_cast<std::vector<bb::fr>&>(builder.get_variables());
    variables[builder.real_variable_index[0]] = witness[0];
    EXPECT_FALSE(CircuitChecker::check(builder));
}

TEST_F(Bn254MsmConstraintTest, ConstantZeroPredicateIsElidedBeforeDispatch)
{
    auto circuit = msm_circuit(true, false);
    auto& op = std::get<Acir::Opcode::BlackBoxFuncCall>(circuit.opcodes[0].value);
    auto& call = std::get<Acir::BlackBoxFuncCall::RecursiveAggregation>(op.value.value);
    call.verification_key.clear(); // Deliberately malformed, but the call is inactive.
    auto constraints = circuit_serde_to_acir_format(circuit, false);
    EXPECT_TRUE(constraints.honk_recursion_constraints.empty());
    EXPECT_TRUE(constraints.hn_recursion_constraints.empty());
    auto witness = valid_witness();
    witness[KEY_HASH] = bb::fr(1);
    witness.resize(constraints.max_witness_index + 1, bb::fr(0));
    AcirProgram program{ constraints, witness };
    auto builder = create_circuit<UltraCircuitBuilder>(program, ProgramMetadata{});
    EXPECT_FALSE(builder.failed());
    EXPECT_TRUE(CircuitChecker::check(builder));
}

TEST_F(Bn254MsmConstraintTest, WitnessZeroPredicateStillChecksReservedKey)
{
    auto witness = valid_witness();
    witness[PREDICATE] = bb::fr(0);
    witness[KEY_HASH] = bb::fr(1);
    auto builder = build<MegaAppCircuitBuilder>(witness);
    EXPECT_TRUE(builder.failed());
    EXPECT_FALSE(CircuitChecker::check(builder));
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
