// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Federico], commit: 2094fd1467dd9a94803b2c5007cf60ac357aa7d2 }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "acir_format.hpp"

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/honk/prover_instance_inspector.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/stdlib/primitives/field/field_conversion.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <utility>

namespace acir_format {

using namespace bb;

namespace {

// The opcode list a bench label names, e.g. "logic_constraints" for "acir::logic_constraints"; used to name
// the offending opcodes when an arithmetization cannot represent them.
constexpr std::string_view opcode_list_name(std::string_view bench_label)
{
    constexpr std::string_view prefix = "acir::";
    return bench_label.starts_with(prefix) ? bench_label.substr(prefix.size()) : bench_label;
}

// Opcode indices are one per constraint, except for BATCHED_EQ rows, where one gate is shared between a pair
// of opcodes and the gate delta is attributed to the first.
constexpr size_t first_opcode_index(size_t opcode_index)
{
    return opcode_index;
}
template <size_t N> constexpr size_t first_opcode_index(const std::array<size_t, N>& opcode_indices)
{
    return opcode_indices[0];
}

// What every opcode list of one `build_constraints` call is translated into, and where the gate counts it
// attributes to each opcode are recorded.
// NOLINTBEGIN(cppcoreguidelines-avoid-const-or-ref-data-members) short-lived parameter bundle
template <typename Builder_, typename GateCounterT> struct Translation {
    using Builder = Builder_;
    Builder& builder;
    GateCounterT& gate_counter;
    std::vector<size_t>& gates_per_opcode;
};
// NOLINTEND(cppcoreguidelines-avoid-const-or-ref-data-members)

/**
 * @brief Translate one ACIR opcode list, or reject it if the target arithmetization has no gates for it.
 * @details A reduced arithmetization has no block to append `RequiredKinds` to, so `translate` is compiled out
 * for it. Whether such an opcode is present is runtime data in the bytecode, so the mismatch is reported here
 * rather than being silently dropped: rejection is part of the same statement as the translation it replaces,
 * so a list cannot be translated without deciding which gate kinds it needs.
 *
 * @tparam Label Bench zone name; also names the opcodes in the rejection message.
 * @tparam RequiredKinds Gate kinds the translation creates. Empty for lists every arithmetization can represent.
 * @param translate Invoked with the builder. Generic so that its body is instantiated only when it is called,
 * i.e. only for arithmetizations that can represent these opcodes.
 */
template <bb::detail::OperationLabel Label,
          GateKind... RequiredKinds,
          typename Translation_,
          typename ConstraintList,
          typename Translate>
void translate_or_reject(Translation_& translation, ConstraintList& acir_constraints, Translate&& translate)
{
    if constexpr ((Translation_::Builder::ExecutionTrace::has_gate_kind(RequiredKinds) && ...)) {
        BB_BENCH_ONLY_NAME(Label);
        std::forward<Translate>(translate)(translation.builder);
    } else if (!acir_constraints.empty()) {
        throw_or_abort("ACIR contains " + std::string(opcode_list_name(Label.value)) +
                       ", which this arithmetization cannot represent.");
    }
}

/**
 * @brief Translate an ACIR opcode list one constraint at a time, tracking the gates each opcode contributes.
 * @details The common shape of a translation: see `translate_or_reject` for the rejection path, and
 * `build_constraints` for the lists whose gate counting does not fit this shape.
 */
template <bb::detail::OperationLabel Label,
          GateKind... RequiredKinds,
          typename Translation_,
          typename ConstraintList,
          typename IndexList,
          typename CreateGates>
void translate_opcodes(Translation_& translation,
                       ConstraintList& acir_constraints,
                       const IndexList& opcode_indices,
                       const CreateGates& create_gates)
{
    BB_ASSERT_EQ(acir_constraints.size(),
                 opcode_indices.size(),
                 "Each ACIR constraint must carry the index of the opcode it came from.");
    translate_or_reject<Label, RequiredKinds...>(translation, acir_constraints, [&](auto& target) {
        for (size_t i = 0; i < acir_constraints.size(); ++i) {
            create_gates(target, acir_constraints[i]);
            translation.gate_counter.track_diff(translation.gates_per_opcode, first_opcode_index(opcode_indices[i]));
        }
    });
}

} // namespace

template <typename Builder>
void build_constraints(Builder& builder, AcirFormat& constraints, const ProgramMetadata& metadata)
{
    bool collect_gates_per_opcode = metadata.collect_gates_per_opcode;

    if (collect_gates_per_opcode) {
        constraints.gates_per_opcode.resize(constraints.num_acir_opcodes, 0);
    }

    GateCounter gate_counter{ &builder, collect_gates_per_opcode };

    // Size hints: reserve the row storage of the blocks whose growth is predictable from the ACIR
    // constraint counts. Estimates only need to be the right order of magnitude — a single reserve
    // replaces the log2(size) reallocation-and-copy steps of geometric growth. Gadget-generated
    // gates (hashes, ECDSA, recursion) are excluded; those blocks still grow but from a warmer start.
    constexpr size_t GATES_PER_BIG_QUAD_HINT = 4;    // a big quad expands to a short chain of arith gates
    constexpr size_t GATES_PER_SMALL_RANGE_HINT = 3; // delta-range rows per range constraint, order of magnitude
    constexpr size_t ARITH_RESERVE_SLACK = 1024;     // headroom for gadget-generated arith gates
    constexpr size_t BLOCK_RESERVE_FLOOR = 512;      // warm start for blocks that grow only via gadgets
    builder.blocks.arithmetic.reserve(constraints.quad_constraints.size() + constraints.bilinear_constraints.size() +
                                      constraints.batched_eq_check_constraints.size() +
                                      GATES_PER_BIG_QUAD_HINT * constraints.big_quad_constraints.size() +
                                      ARITH_RESERVE_SLACK);
    builder.blocks.delta_range.reserve(GATES_PER_SMALL_RANGE_HINT * constraints.range_constraints.size() +
                                       BLOCK_RESERVE_FLOOR);
    if constexpr (Builder::ExecutionTrace::has_gate_kind(GateKind::Memory)) {
        builder.blocks.memory.reserve(BLOCK_RESERVE_FLOOR);
    }
    if constexpr (Builder::ExecutionTrace::has_gate_kind(GateKind::Nnf)) {
        builder.blocks.nnf.reserve(BLOCK_RESERVE_FLOOR);
    }

    Translation translation{ builder, gate_counter, constraints.gates_per_opcode };
    const AcirFormatOriginalOpcodeIndices& opcode_indices = constraints.original_opcode_indices;

    // Add standard width-4 Ultra arithmetic gates
    translate_opcodes<"acir::quad_constraints">(
        translation, constraints.quad_constraints, opcode_indices.quad_constraints, [](auto& target, auto& constraint) {
            create_quad_constraint(target, constraint);
        });

    // When an expression doesn't fit into a single width-4 gate, we split it across multiple gates and we leverage
    // w4_shift to use the least possible number of intermediate witnesses. See the documentation of
    // split_into_mul_quad_gates for more information.
    translate_opcodes<"acir::big_quad_constraints">(
        translation,
        constraints.big_quad_constraints,
        opcode_indices.big_quad_constraints,
        [](auto& target, auto& constraint) { create_big_quad_constraint(target, constraint); });

    // Bilinear rows: AssertZero opcodes with two products routed to the bilinear gate (Mega-only; see
    // bilinear_or_batched_eq_check_relation.hpp). Each row originates from a single AssertZero. The Ultra
    // arithmetization has no block owning this gate kind, so the bytecode must not contain these opcodes.
    translate_opcodes<"acir::bilinear_constraints", GateKind::BilinearBatchedEq>(
        translation,
        constraints.bilinear_constraints,
        opcode_indices.bilinear_constraints,
        [](auto& target, auto& constraint) { create_bilinear_constraint(target, constraint); });

    // BatchedEq rows: pairs of linear AssertZeros batched into one row (Mega-only). Each row originates from 1
    // (unpaired single-half) or 2 (paired) AssertZero opcodes; for a pair, the single emitted gate is attributed
    // to the first opcode (see first_opcode_index).
    translate_opcodes<"acir::batched_eq_check_constraints", GateKind::BilinearBatchedEq>(
        translation,
        constraints.batched_eq_check_constraints,
        opcode_indices.batched_eq_check_constraints,
        [](auto& target, auto& constraint) { create_batched_eq_check_constraint(target, constraint); });

    // Add logic constraint
    translate_opcodes<"acir::logic_constraints", GateKind::Lookup>(
        translation,
        constraints.logic_constraints,
        opcode_indices.logic_constraints,
        [](auto& target, auto& constraint) {
            create_logic_gate(
                target, constraint.a, constraint.b, constraint.result, constraint.num_bits, constraint.is_xor_gate);
        });

    // Add range constraint. The message is only consumed when the witness is out of range; formatting it
    // eagerly dominates the cost of this loop, so only build it for values that will actually fail. It names
    // the opcode, so the constraint is looked up by index rather than through the per-constraint callback.
    translate_or_reject<"acir::range_constraints">(translation, constraints.range_constraints, [&](auto& target) {
        for (size_t i = 0; i < constraints.range_constraints.size(); ++i) {
            const RangeConstraint& constraint = constraints.range_constraints[i];
            const size_t opcode_index = opcode_indices.range_constraints[i];
            std::string msg;
            if (uint256_t(target.get_variable(constraint.witness)).get_msb() >= constraint.num_bits) {
                msg = std::format("acir_format::build_constraints: range constraint at opcode index {} failed",
                                  opcode_index);
            }
            target.create_dyadic_range_constraint(constraint.witness, constraint.num_bits, msg);
            gate_counter.track_diff(constraints.gates_per_opcode, opcode_index);
        }
    });

    // Add aes128 constraints
    translate_opcodes<"acir::aes128_constraints", GateKind::Lookup>(
        translation,
        constraints.aes128_constraints,
        opcode_indices.aes128_constraints,
        [](auto& target, auto& constraint) { create_aes128_constraints(target, constraint); });

    // Add sha256 constraints
    translate_opcodes<"acir::sha256_compression", GateKind::Lookup>(
        translation,
        constraints.sha256_compression,
        opcode_indices.sha256_compression,
        [](auto& target, auto& constraint) { create_sha256_compression_constraints(target, constraint); });

    // Add ECDSA k1 constraints
    translate_opcodes<"acir::ecdsa_k1_constraints", GateKind::Nnf>(
        translation,
        constraints.ecdsa_k1_constraints,
        opcode_indices.ecdsa_k1_constraints,
        [](auto& target, auto& constraint) {
            create_ecdsa_verify_constraints<stdlib::secp256k1<Builder>>(target, constraint);
        });

    // Add ECDSA r1 constraints
    translate_opcodes<"acir::ecdsa_r1_constraints", GateKind::Nnf>(
        translation,
        constraints.ecdsa_r1_constraints,
        opcode_indices.ecdsa_r1_constraints,
        [](auto& target, auto& constraint) {
            create_ecdsa_verify_constraints<stdlib::secp256r1<Builder>>(target, constraint);
        });

    // Add blake2s constraints
    translate_opcodes<"acir::blake2s_constraints", GateKind::Lookup>(
        translation,
        constraints.blake2s_constraints,
        opcode_indices.blake2s_constraints,
        [](auto& target, auto& constraint) { create_blake2s_constraints(target, constraint); });

    // Add blake3 constraints
    translate_opcodes<"acir::blake3_constraints", GateKind::Lookup>(
        translation,
        constraints.blake3_constraints,
        opcode_indices.blake3_constraints,
        [](auto& target, auto& constraint) { create_blake3_constraints(target, constraint); });

    // Add keccak permutations
    translate_opcodes<"acir::keccak_permutations", GateKind::Lookup>(
        translation,
        constraints.keccak_permutations,
        opcode_indices.keccak_permutations,
        [](auto& target, auto& constraint) { create_keccak_permutations_constraints(target, constraint); });

    // Add poseidon2 constraints
    translate_opcodes<"acir::poseidon2_constraints">(
        translation,
        constraints.poseidon2_constraints,
        opcode_indices.poseidon2_constraints,
        [](auto& target, auto& constraint) { create_poseidon2_permutations_constraints(target, constraint); });

    // Add multi scalar mul constraints. cycle_group's Straus algorithm needs the elliptic gate and the
    // memory gate for its ROM tables; the plookup fixed-base path is an optimization it does without.
    translate_opcodes<"acir::multi_scalar_mul_constraints", GateKind::Elliptic, GateKind::Memory>(
        translation,
        constraints.multi_scalar_mul_constraints,
        opcode_indices.multi_scalar_mul_constraints,
        [](auto& target, auto& constraint) { create_multi_scalar_mul_constraint(target, constraint); });

    // Add ec add constraints (cycle_group; see above)
    translate_opcodes<"acir::ec_add_constraints", GateKind::Elliptic, GateKind::Memory>(
        translation,
        constraints.ec_add_constraints,
        opcode_indices.ec_add_constraints,
        [](auto& target, auto& constraint) { create_ec_add_constraint(target, constraint); });

    // Add block constraints. The opcode covers both memory tables and databus columns, so which
    // arithmetizations can represent it is decided per block type inside create_block_constraints. Each
    // constraint may correspond to multiple opcodes, so its gate count is averaged over them.
    translate_or_reject<"acir::block_constraints">(translation, constraints.block_constraints, [&](auto& target) {
        for (const auto& [constraint, block_opcode_indices] :
             zip_view(constraints.block_constraints, opcode_indices.block_constraints)) {
            create_block_constraints(target, constraint);
            if (collect_gates_per_opcode) {
                size_t avg_gates_per_opcode = gate_counter.compute_diff() / block_opcode_indices.size();
                for (size_t opcode_index : block_opcode_indices) {
                    constraints.gates_per_opcode[opcode_index] = avg_gates_per_opcode;
                }
            }
        }
    });

    // RecursionConstraints
    BB_BENCH_ONLY_NAME("acir::recursion_constraints");
    const bool is_hn_recursion_constraints = !constraints.hn_recursion_constraints.empty();
    HonkRecursionConstraintsOutput<Builder> output = create_recursion_constraints<Builder>(
        builder,
        gate_counter,
        constraints.gates_per_opcode,
        metadata.ivc,
        /*honk_recursion_data=*/
        { constraints.honk_recursion_constraints, constraints.original_opcode_indices.honk_recursion_constraints },
        /*avm_recursion_data=*/
        { constraints.avm_recursion_constraints, constraints.original_opcode_indices.avm_recursion_constraints },
        /*hn_recursion_data=*/
        { constraints.hn_recursion_constraints, constraints.original_opcode_indices.hn_recursion_constraints },
        /*chonk_recursion_data=*/
        { constraints.chonk_recursion_constraints, constraints.original_opcode_indices.chonk_recursion_constraints });

    // Process the result of adding recursion constraints and propagate the public inputs as needed
    output.finalize(builder, is_hn_recursion_constraints, metadata.has_ipa_claim);
}

/**
 * @brief Specialization for creating an Ultra circuit from an acir program
 *
 * @param program constraints and optionally a witness
 * @param metadata additional data needed to construct the circuit
 */
template <> UltraCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    BB_BENCH();
    AcirFormat& constraints = program.constraints;
    WitnessVector& witness = program.witness;
    const bool is_write_vk_mode = witness.empty();

    if (!is_write_vk_mode) {
        BB_ASSERT_EQ(witness.size(),
                     constraints.max_witness_index + 1,
                     "ACIR witness size (" << witness.size() << ") does not match max witness index + 1 ("
                                           << (constraints.max_witness_index + 1) << ").");
    } else {
        witness.resize(constraints.max_witness_index + 1, 0);
    }

    UltraCircuitBuilder builder{ witness, constraints.public_inputs, is_write_vk_mode };

    // Populate constraints in the builder
    build_constraints(builder, constraints, metadata);

    vinfo("Created circuit");

    return builder;
};

/**
 * @brief Create a Mega circuit of the given arithmetization from an acir program
 *
 * @param program constraints and optionally a witness
 * @param metadata additional data needed to construct the circuit
 */
template <IsMegaBuilder Builder>
static Builder create_mega_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    BB_BENCH();
    AcirFormat& constraints = program.constraints;
    WitnessVector& witness = program.witness;
    const bool is_write_vk_mode = witness.empty();

    if (!is_write_vk_mode) {
        BB_ASSERT_EQ(witness.size(),
                     constraints.max_witness_index + 1,
                     "ACIR witness size (" << witness.size() << ") does not match max witness index + 1 ("
                                           << (constraints.max_witness_index + 1) << ").");
    } else {
        witness.resize(constraints.max_witness_index + 1, 0);
    }

    auto op_queue = (metadata.ivc == nullptr) ? std::make_shared<ECCOpQueue>() : metadata.ivc->get_goblin().op_queue;

    // Construct a builder using the witness and public input data from acir and with the goblin-owned op_queue
    Builder builder{ op_queue, witness, constraints.public_inputs, is_write_vk_mode };

    // Populate constraints in the builder
    build_constraints(builder, constraints, metadata);

    vinfo("Created circuit");

    return builder;
};

// One entry point per Mega arithmetization. The full-Mega one is not a Chonk circuit kind; it is the
// unrestricted arithmetization used by standalone Mega circuits and tests.
template <> MegaCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    return create_mega_circuit<MegaCircuitBuilder>(program, metadata);
}
template <> MegaAppCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    return create_mega_circuit<MegaAppCircuitBuilder>(program, metadata);
}
template <> MegaKernelCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    return create_mega_circuit<MegaKernelCircuitBuilder>(program, metadata);
}
template <> MegaHidingKernelCircuitBuilder create_circuit(AcirProgram& program, const ProgramMetadata& metadata)
{
    return create_mega_circuit<MegaHidingKernelCircuitBuilder>(program, metadata);
}

template void build_constraints<UltraCircuitBuilder>(UltraCircuitBuilder&, AcirFormat&, const ProgramMetadata&);
template void build_constraints<MegaCircuitBuilder>(MegaCircuitBuilder&, AcirFormat&, const ProgramMetadata&);
template void build_constraints<MegaAppCircuitBuilder>(MegaAppCircuitBuilder&, AcirFormat&, const ProgramMetadata&);
template void build_constraints<MegaKernelCircuitBuilder>(MegaKernelCircuitBuilder&,
                                                          AcirFormat&,
                                                          const ProgramMetadata&);
template void build_constraints<MegaHidingKernelCircuitBuilder>(MegaHidingKernelCircuitBuilder&,
                                                                AcirFormat&,
                                                                const ProgramMetadata&);

} // namespace acir_format
