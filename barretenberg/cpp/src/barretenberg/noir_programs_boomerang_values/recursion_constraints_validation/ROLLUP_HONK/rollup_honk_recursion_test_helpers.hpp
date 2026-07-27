#pragma once

#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/gate_counter.hpp"
#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_validation.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_root_opcodes_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/honk_recursion_test_helpers.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/eccvm_verifier/verifier_commitment_key.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/transcript/transcript.hpp"

#include <algorithm>
#include <array>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <string>
#include <vector>

namespace rollup_honk_test_helpers {

using namespace honk_recursion_test_helpers;

using NativeFlavor = RecursiveFlavor::NativeFlavor;
using RollupIO = bb::stdlib::recursion::honk::RollupIO;
using PlainIO = bb::stdlib::recursion::honk::DefaultIO<Builder>;
using field_ct = bb::stdlib::field_t<Builder>;
using RecursiveVK = RecursiveFlavor::VerificationKey;
using VKAndHash = RecursiveFlavor::VKAndHash;
using StdlibProof = bb::stdlib::Proof<Builder>;

static_assert(!RecursiveFlavor::HasZK);
static_assert(RollupIO::HasIPA);

struct RollupVerifierComponents {
    std::unique_ptr<Builder> builder_ptr;
    std::shared_ptr<Transcript> transcript;
    std::shared_ptr<VerifierInst> verifier_instance;
    StdlibProof honk_stdlib_proof;
    std::vector<uint32_t> full_proof_indices;
    std::vector<uint32_t> honk_proof_indices;
    std::vector<uint32_t> ipa_proof_indices;
    acir_format::RecursionConstraint constraint;
    size_t num_public_inputs = 0;
    size_t log_n = 0;

    Builder& builder() { return *builder_ptr; }
    const Builder& builder() const { return *builder_ptr; }
};

inline acir_format::AcirProgram make_rollup_acir_program(size_t num_acir_pub_inputs = 0, bool use_valid_proof = false)
{
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const size_t dyadic_size = size_t{ 1 } << log_n;
    bb::HonkProof native_proof;
    std::shared_ptr<NativeFlavor::VerificationKey> native_vk;
    if (use_valid_proof) {
        auto valid_proof_and_vk =
            acir_format::construct_arbitrary_valid_honk_proof_and_vk_deterministic<NativeFlavor, RollupIO>(
                num_acir_pub_inputs);
        native_proof = std::move(valid_proof_and_vk.first);
        native_vk = std::move(valid_proof_and_vk.second);
    } else {
        native_vk = acir_format::create_mock_honk_vk<NativeFlavor, RollupIO>(dyadic_size, num_acir_pub_inputs);
        native_proof = acir_format::create_mock_honk_proof<NativeFlavor, RollupIO>(num_acir_pub_inputs);
    }

    acir_format::AcirProgram program;
    auto constraint = acir_format::recursion_data_to_recursion_constraint(program.witness,
                                                                          native_proof,
                                                                          native_vk->to_field_elements(),
                                                                          native_vk->hash(),
                                                                          bb::fr::one(),
                                                                          num_acir_pub_inputs,
                                                                          acir_format::PROOF_TYPE::ROLLUP_HONK);
    program.witness.pop_back();
    constraint.predicate = acir_format::WitnessOrConstant<bb::fr>::from_constant(bb::fr::one());
    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 1;
    program.constraints.honk_recursion_constraints = { constraint };
    program.constraints.original_opcode_indices =
        acir_format::AcirFormatOriginalOpcodeIndices{ .honk_recursion_constraints = { 0 } };
    return program;
}

inline acir_format::AcirProgram make_plain_acir_program(size_t num_acir_pub_inputs = 0)
{
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const size_t dyadic_size = size_t{ 1 } << log_n;
    auto native_vk = acir_format::create_mock_honk_vk<NativeFlavor, PlainIO>(dyadic_size, num_acir_pub_inputs);
    auto native_proof = acir_format::create_mock_honk_proof<NativeFlavor, PlainIO>(num_acir_pub_inputs);

    acir_format::AcirProgram program;
    auto constraint = acir_format::recursion_data_to_recursion_constraint(program.witness,
                                                                          native_proof,
                                                                          native_vk->to_field_elements(),
                                                                          native_vk->hash(),
                                                                          bb::fr::one(),
                                                                          num_acir_pub_inputs,
                                                                          acir_format::PROOF_TYPE::HONK);
    program.witness.pop_back();
    constraint.predicate = acir_format::WitnessOrConstant<bb::fr>::from_constant(bb::fr::one());
    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 1;
    program.constraints.honk_recursion_constraints = { constraint };
    program.constraints.original_opcode_indices =
        acir_format::AcirFormatOriginalOpcodeIndices{ .honk_recursion_constraints = { 0 } };
    return program;
}

inline acir_format::AcirProgram make_merged_rollup_acir_program_from_two_rollups(
    size_t num_acir_pub_inputs = 0,
    uint32_t proof_type = acir_format::PROOF_TYPE::ROOT_ROLLUP_HONK,
    bool use_valid_proof = true)
{
    auto first = make_rollup_acir_program(num_acir_pub_inputs, use_valid_proof);
    auto second = make_rollup_acir_program(num_acir_pub_inputs, use_valid_proof);

    auto first_constraint = first.constraints.honk_recursion_constraints[0];
    auto second_constraint = second.constraints.honk_recursion_constraints[0];
    auto merged_witness = first.witness;

    auto offset_constraint = [proof_type](acir_format::RecursionConstraint& constraint, size_t offset) {
        const uint32_t shift = static_cast<uint32_t>(offset);
        auto shift_indices = [shift](std::vector<uint32_t>& indices) {
            for (auto& index : indices) {
                index += shift;
            }
        };
        shift_indices(constraint.key);
        shift_indices(constraint.proof);
        shift_indices(constraint.public_inputs);
        constraint.key_hash += shift;
        if (!constraint.predicate.is_constant) {
            constraint.predicate.index += shift;
        }
        constraint.proof_type = proof_type;
    };

    offset_constraint(first_constraint, 0);
    offset_constraint(second_constraint, merged_witness.size());
    merged_witness.insert(merged_witness.end(), second.witness.begin(), second.witness.end());

    acir_format::AcirProgram program;
    program.witness = std::move(merged_witness);
    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = 2;
    program.constraints.honk_recursion_constraints = { first_constraint, second_constraint };
    program.constraints.original_opcode_indices =
        acir_format::AcirFormatOriginalOpcodeIndices{ .honk_recursion_constraints = { 0, 1 } };
    return program;
}

inline acir_format::AcirProgram make_root_rollup_acir_program_from_two_rollups(size_t num_acir_pub_inputs = 0,
                                                                               bool use_valid_proof = false)
{
    return make_merged_rollup_acir_program_from_two_rollups(
        num_acir_pub_inputs, acir_format::PROOF_TYPE::ROOT_ROLLUP_HONK, use_valid_proof);
}

inline RollupVerifierComponents setup_verifier_components_on_builder(std::unique_ptr<Builder> builder_ptr,
                                                                     const acir_format::RecursionConstraint& constraint)
{
    Builder& builder = *builder_ptr;

    auto key_fields = acir_format::fields_from_witnesses(builder, constraint.key);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);
    auto vk_hash_ct = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);

    std::vector<uint32_t> full_proof_indices =
        acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    std::vector<uint32_t> honk_proof_indices(
        full_proof_indices.begin(), full_proof_indices.end() - static_cast<std::ptrdiff_t>(bb::IPA_PROOF_LENGTH));
    std::vector<uint32_t> ipa_proof_indices(
        full_proof_indices.end() - static_cast<std::ptrdiff_t>(bb::IPA_PROOF_LENGTH), full_proof_indices.end());
    auto honk_proof_fields = acir_format::fields_from_witnesses(builder, honk_proof_indices);
    StdlibProof honk_stdlib_proof(honk_proof_fields);

    auto transcript = std::make_shared<Transcript>();
    transcript->load_proof(honk_stdlib_proof);
    auto verifier_instance = std::make_shared<VerifierInst>(vk_and_hash);

    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const size_t num_public_inputs =
        bb::ProofLength::Honk<RecursiveFlavor>::derive_num_public_inputs(honk_stdlib_proof.size(), log_n);

    RollupVerifierComponents vc;
    vc.builder_ptr = std::move(builder_ptr);
    vc.transcript = transcript;
    vc.verifier_instance = verifier_instance;
    vc.honk_stdlib_proof = std::move(honk_stdlib_proof);
    vc.full_proof_indices = std::move(full_proof_indices);
    vc.honk_proof_indices = std::move(honk_proof_indices);
    vc.ipa_proof_indices = std::move(ipa_proof_indices);
    vc.constraint = constraint;
    vc.num_public_inputs = num_public_inputs;
    vc.log_n = log_n;
    return vc;
}

inline RollupVerifierComponents setup_rollup_verifier_components(size_t num_acir_pub_inputs = 0)
{
    acir_format::AcirProgram program = make_rollup_acir_program(num_acir_pub_inputs);
    const auto& constraint = program.constraints.honk_recursion_constraints[0];
    auto builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    return setup_verifier_components_on_builder(std::move(builder_ptr), constraint);
}

inline void build_full_rollup_honk_circuit(RollupVerifierComponents& vc)
{
    build_full_honk_circuit<RollupIO>(vc);
}

inline void dump_rollup_layout(std::ostream& out,
                               const acir_format::RecursionConstraint& constraint,
                               const RollupHonkRecursionValidation::IO::RollupProofLayout& layout)
{
    out << "Proof layout\n";
    out << "  constraint.public_inputs=" << constraint.public_inputs.size() << "\n";
    out << "  constraint.proof=" << constraint.proof.size() << "\n";
    out << "  rollup_public_inputs=[" << layout.rollup_public_inputs_start << ", " << layout.rollup_public_inputs_end
        << ")\n";
    out << "  pairing_inputs=[" << layout.pairing_inputs_start << ", " << layout.pairing_inputs_end << ")\n";
    out << "  ipa_claim=[" << layout.ipa_claim_start << ", " << layout.ipa_claim_end << ")\n";
    out << "  honk_body=[" << layout.honk_body_start << ", " << layout.honk_body_end << ")\n";
    out << "  ipa_tail=[" << layout.ipa_tail_start << ", " << layout.ipa_tail_end << ")\n";
}

inline void dump_rollup_public_input_prefix(std::ostream& out, const RollupVerifierComponents& vc)
{
    out << "RollupIO public input prefix\n";
    out << "  num_public_inputs=" << vc.num_public_inputs << "\n";
    out << "  constraint.proof prefix size=" << bb::ROLLUP_PUBLIC_INPUTS_SIZE << "\n";
    out << "  pairing_inputs proof offsets=[0, " << bb::PAIRING_POINTS_SIZE << ")\n";
    out << "  ipa_claim proof offsets=[" << bb::PAIRING_POINTS_SIZE << ", " << bb::ROLLUP_PUBLIC_INPUTS_SIZE << ")\n";
    for (size_t i = 0; i < bb::ROLLUP_PUBLIC_INPUTS_SIZE; ++i) {
        out << "    public_input_" << i << " witness=" << vc.constraint.proof[i];
        if (i < bb::PAIRING_POINTS_SIZE) {
            out << " role=pairing_input";
        } else {
            out << " role=ipa_claim";
        }
        out << "\n";
    }
}

struct RollupValidatorContext {
    RollupVerifierComponents vc;
    std::unique_ptr<cdg::StaticAnalyzer_<bb::fr, Builder>> analyzer;
    size_t oink_arith_start = 0;
    std::vector<size_t> all_squeezes;
    // False when Phase 1 Step 0 fork is cursor-migrate (Oink squeeze windows dead).
    bool oink_squeeze_ok = false;

    explicit RollupValidatorContext(size_t num_pub_inputs = 0)
        : vc(setup_rollup_verifier_components(num_pub_inputs))
    {
        build_full_rollup_honk_circuit(vc);
        analyzer = std::make_unique<cdg::StaticAnalyzer_<bb::fr, Builder>>(vc.builder(), false);
        all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(vc.builder());

        std::set<size_t> peek;
        auto oink_chal = recursion_helpers::oink_challenges(vc.builder(), all_squeezes, peek);
        if (!oink_chal.valid) {
            return;
        }
        std::vector<size_t> oink_sq(oink_chal.squeeze_gate_indices.begin(), oink_chal.squeeze_gate_indices.end());
        std::sort(oink_sq.begin(), oink_sq.end());
        if (oink_sq.size() != HonkRecursionValidation::Oink::NUM_OINK_SQUEEZES) {
            return;
        }
        oink_arith_start = oink_sq[0] + 1 - RollupHonkRecursionValidation::Oink::PRE_ETA_ARITH_OP0.gate_count;
        oink_squeeze_ok = true;
    }
};

struct FinalizeDumpData {
    std::array<recursion_helpers::FunctionFingerprint, 9> finalize_fps{};
    recursion_helpers::BlockSnapshot before_finalize;
    recursion_helpers::BlockSnapshot after_finalize;
    std::vector<size_t> gates_per_opcode;
    size_t total_before_finalize = 0;
    size_t total_after_finalize = 0;
};

inline FinalizeDumpData run_and_capture_finalize(acir_format::AcirProgram& program, bool has_ipa_claim)
{
    acir_format::ProgramMetadata metadata{ .has_ipa_claim = has_ipa_claim, .collect_gates_per_opcode = true };
    program.constraints.gates_per_opcode.assign(program.constraints.num_acir_opcodes, 0);

    Builder builder(program.witness, program.constraints.public_inputs, false);
    acir_format::GateCounter<Builder> gate_counter(&builder, metadata.collect_gates_per_opcode);
    auto output = acir_format::create_recursion_constraints<Builder>(
        builder,
        gate_counter,
        program.constraints.gates_per_opcode,
        metadata.ivc,
        { program.constraints.honk_recursion_constraints,
          program.constraints.original_opcode_indices.honk_recursion_constraints },
        { program.constraints.avm_recursion_constraints,
          program.constraints.original_opcode_indices.avm_recursion_constraints },
        { program.constraints.hn_recursion_constraints,
          program.constraints.original_opcode_indices.hn_recursion_constraints },
        { program.constraints.chonk_recursion_constraints,
          program.constraints.original_opcode_indices.chonk_recursion_constraints });

    const auto before_finalize = recursion_helpers::BlockSnapshot::capture(builder);
    const size_t total_before_finalize = builder.get_num_finalized_gates_inefficient();
    output.finalize(builder, !program.constraints.hn_recursion_constraints.empty(), metadata.has_ipa_claim);
    const auto after_finalize = recursion_helpers::BlockSnapshot::capture(builder);
    const size_t total_after_finalize = builder.get_num_finalized_gates_inefficient();

    std::array<recursion_helpers::FunctionFingerprint, 9> finalize_fps{};
    for (const auto& [block_idx, _] : IPA_ANALYSIS_BLOCKS) {
        const size_t start = snapshot_size_at(before_finalize, block_idx);
        const size_t end = snapshot_size_at(after_finalize, block_idx);
        if (end > start) {
            finalize_fps[block_idx] = compute_block_fingerprint(builder, block_idx, start, end);
        }
    }

    return FinalizeDumpData{
        .finalize_fps = finalize_fps,
        .before_finalize = before_finalize,
        .after_finalize = after_finalize,
        .gates_per_opcode = program.constraints.gates_per_opcode,
        .total_before_finalize = total_before_finalize,
        .total_after_finalize = total_after_finalize,
    };
}

using GrumpkinCurve = bb::stdlib::grumpkin<Builder>;
using RecursiveGrumpkinIPA = bb::IPA<GrumpkinCurve, bb::CONST_ECCVM_LOG_N>;
using IpaFr = GrumpkinCurve::ScalarField;
using IpaStdlibTranscript = bb::UltraStdlibTranscript;
using IpaVerifierAccumulator = RecursiveGrumpkinIPA::VerifierAccumulator;
using IpaStdlibProof = bb::stdlib::Proof<Builder>;
using IpaVerifierKey = bb::VerifierCommitmentKey<GrumpkinCurve>;

struct IpaAccumulatedData {
    bb::OpeningClaim<GrumpkinCurve> claim;
    bb::HonkProof proof;
};

struct RootRollupIpaDiscoveryContext {
    acir_format::AcirProgram program;
    std::unique_ptr<Builder> builder_ptr;
    acir_format::HonkRecursionConstraintsOutput<Builder> output;
    recursion_helpers::BlockSnapshot before_opcodes;
    recursion_helpers::BlockSnapshot after_opcode0;
    recursion_helpers::BlockSnapshot after_opcodes;
    size_t baseline_squeeze_count = 0;
    std::vector<size_t> gates_per_opcode;

    Builder& builder() { return *builder_ptr; }
    const Builder& builder() const { return *builder_ptr; }
};

inline RootRollupIpaDiscoveryContext setup_root_rollup_ipa_discovery(size_t num_acir_pub_inputs = 0,
                                                                     bool use_valid_proof = false)
{
    RootRollupIpaDiscoveryContext ctx;
    ctx.program = make_root_rollup_acir_program_from_two_rollups(num_acir_pub_inputs, use_valid_proof);
    ctx.program.constraints.gates_per_opcode.assign(ctx.program.constraints.num_acir_opcodes, 0);

    ctx.builder_ptr = std::make_unique<Builder>(ctx.program.witness, ctx.program.constraints.public_inputs, false);
    acir_format::GateCounter<Builder> gate_counter(ctx.builder_ptr.get(), true);
    ctx.before_opcodes = recursion_helpers::BlockSnapshot::capture(*ctx.builder_ptr);

    BB_ASSERT_EQ(ctx.program.constraints.honk_recursion_constraints.size(),
                 2U,
                 "RootRollupIpaDiscoveryContext: expected 2 honk recursion constraints");

    for (size_t opcode_idx = 0; opcode_idx < ctx.program.constraints.honk_recursion_constraints.size(); ++opcode_idx) {
        const auto honk_output = acir_format::create_honk_recursion_constraints<RecursiveFlavor, RollupIO>(
            *ctx.builder_ptr, ctx.program.constraints.honk_recursion_constraints[opcode_idx]);
        ctx.output.update(honk_output, /*update_ipa_data=*/true);
        gate_counter.track_diff(ctx.program.constraints.gates_per_opcode, opcode_idx);
        if (opcode_idx == 0) {
            ctx.after_opcode0 = recursion_helpers::BlockSnapshot::capture(*ctx.builder_ptr);
        }
    }

    ctx.output.is_root_rollup = true;
    BB_ASSERT(ctx.output.is_root_rollup, "RootRollupIpaDiscoveryContext: expected root rollup output");
    BB_ASSERT_EQ(
        ctx.output.nested_ipa_claims.size(), 2U, "RootRollupIpaDiscoveryContext: expected 2 nested IPA claims");
    BB_ASSERT_EQ(
        ctx.output.nested_ipa_proofs.size(), 2U, "RootRollupIpaDiscoveryContext: expected 2 nested IPA proofs");

    ctx.after_opcodes = recursion_helpers::BlockSnapshot::capture(*ctx.builder_ptr);
    ctx.baseline_squeeze_count = recursion_helpers::find_all_transcript_squeeze_gates(*ctx.builder_ptr).size();
    ctx.gates_per_opcode = ctx.program.constraints.gates_per_opcode;
    return ctx;
}

// ── Phase 2: ACIR witness → gate discovery (segment-scoped opcodes) ───────────
//
// RootRollupVkHashAnchor + discover_rollup_vk_hash_in_segment live in the production header
// `rollup_honk_root_opcodes_verification.hpp` (RollupHonkRootOpcodesValidation namespace) since
// `validate_root_rollup_opcodes` uses them directly to cross-check its own entry cursor.

using RootRollupVkHashAnchor = RollupHonkRootOpcodesValidation::RootRollupVkHashAnchor;

struct RootRollupOpcodeSegmentAnchor {
    size_t opcode_index = 0;
    recursion_helpers::BlockSnapshot segment_start;
    recursion_helpers::BlockSnapshot segment_end;
    RootRollupVkHashAnchor vk_hash;
    size_t circuit_build_start_arith = SIZE_MAX;
    size_t circuit_build_start_poseidon2_ext = SIZE_MAX;
    size_t circuit_build_start_poseidon2_int = SIZE_MAX;
    size_t serialization_end_arith = SIZE_MAX;
};

struct RootRollupIpaAccumulateSegmentAnchor {
    recursion_helpers::BlockSnapshot segment_start;
    size_t circuit_build_start_arith = SIZE_MAX;
    size_t baseline_squeeze_count = 0;
};

inline std::vector<size_t> squeezes_in_arith_segment(Builder& builder, size_t min_arith, size_t max_arith)
{
    std::vector<size_t> segment_squeezes;
    for (size_t sq : recursion_helpers::find_all_transcript_squeeze_gates(builder)) {
        if (sq >= min_arith && sq < max_arith) {
            segment_squeezes.push_back(sq);
        }
    }
    return segment_squeezes;
}

template <typename FF, typename CircuitBuilder>
RootRollupOpcodeSegmentAnchor discover_root_rollup_opcode_segment_anchor(
    RootRollupIpaDiscoveryContext& ctx, size_t opcode_index, cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    BB_ASSERT(opcode_index < ctx.program.constraints.honk_recursion_constraints.size(),
              "discover_root_rollup_opcode_segment_anchor: bad opcode index");

    RootRollupOpcodeSegmentAnchor anchor;
    anchor.opcode_index = opcode_index;
    anchor.segment_start = opcode_index == 0 ? ctx.before_opcodes : ctx.after_opcode0;
    anchor.segment_end = opcode_index == 0 ? ctx.after_opcode0 : ctx.after_opcodes;
    const auto& constraint = ctx.program.constraints.honk_recursion_constraints[opcode_index];

    anchor.vk_hash = RollupHonkRootOpcodesValidation::discover_rollup_vk_hash_in_segment<FF>(
        ctx.builder(), analyzer, constraint, anchor.segment_start, anchor.segment_end, opcode_index);
    if (anchor.vk_hash.is_valid) {
        anchor.circuit_build_start_arith = anchor.vk_hash.arith_start;
        anchor.circuit_build_start_poseidon2_ext = anchor.vk_hash.poseidon2_ext_start;
        anchor.circuit_build_start_poseidon2_int = anchor.vk_hash.poseidon2_int_start;
        anchor.serialization_end_arith = snapshot_size_at(anchor.segment_start, BLOCK_IDX_ARITHMETIC);
    }
    return anchor;
}

inline RootRollupIpaAccumulateSegmentAnchor discover_root_rollup_ipa_accumulate_segment_anchor(
    const RootRollupIpaDiscoveryContext& ctx)
{
    RootRollupIpaAccumulateSegmentAnchor anchor;
    anchor.segment_start = ctx.after_opcodes;
    anchor.circuit_build_start_arith = snapshot_size_at(ctx.after_opcodes, BLOCK_IDX_ARITHMETIC);
    anchor.baseline_squeeze_count = ctx.baseline_squeeze_count;
    return anchor;
}

// ── Phase 2: IPA-tail witness link (opcode proof tail → IPA finalize gates) ────
//
// The last IPA_PROOF_LENGTH witnesses of each opcode's stitched proof are the nested IPA proof.
// Production keeps them as a stdlib::Proof (same builder witness indices) inside
// output.nested_ipa_proofs[i]; at finalize IPA::accumulate consumes them
// (recursion_constraint_output.cpp: ipa_transcript_{1,2} -> IPA::accumulate). This link proves
// those ACIR opcode witnesses actually reappear in gates built AFTER all opcodes (the finalize
// region), i.e. the opcode output really feeds the IPA mechanism — not just a positional boundary.
struct IpaTailWitnessLink {
    size_t opcode_index = 0;
    size_t ipa_tail_size = 0;
    size_t tail_start_index = 0; // offset into stitched proof_indices where the IPA tail begins
    size_t witnesses_with_finalize_gates = 0;
    std::map<size_t, size_t> finalize_gates_per_block; // block_idx -> count of finalize-region gates
    std::map<size_t, size_t> opcode_gates_per_block;   // block_idx -> count of pre-finalize gates
    size_t min_finalize_arith_gate = SIZE_MAX;
    bool is_valid = false; // at least one tail witness reappears in the finalize region
};

template <typename FF, typename CircuitBuilder>
IpaTailWitnessLink discover_ipa_tail_witness_link(RootRollupIpaDiscoveryContext& ctx,
                                                  size_t opcode_index,
                                                  cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    IpaTailWitnessLink link;
    link.opcode_index = opcode_index;
    BB_ASSERT(opcode_index < ctx.program.constraints.honk_recursion_constraints.size(),
              "discover_ipa_tail_witness_link: bad opcode index");
    const auto& constraint = ctx.program.constraints.honk_recursion_constraints[opcode_index];

    // Same stitch as production (honk_recursion_constraint.cpp:55) then take the IPA tail.
    const std::vector<uint32_t> proof_indices =
        acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    if (proof_indices.size() < bb::IPA_PROOF_LENGTH) {
        return link;
    }
    link.ipa_tail_size = bb::IPA_PROOF_LENGTH;
    link.tail_start_index = proof_indices.size() - bb::IPA_PROOF_LENGTH;

    auto& builder = ctx.builder();
    for (size_t i = link.tail_start_index; i < proof_indices.size(); ++i) {
        const uint32_t real = builder.real_variable_index[proof_indices[i]];
        bool links_to_finalize = false;
        for (const auto& [blk, gate_idx] : analyzer.get_variable_gates(real)) {
            const size_t boundary = snapshot_size_at(ctx.after_opcodes, blk);
            if (gate_idx >= boundary) {
                ++link.finalize_gates_per_block[blk];
                links_to_finalize = true;
                if (blk == BLOCK_IDX_ARITHMETIC) {
                    link.min_finalize_arith_gate = std::min(link.min_finalize_arith_gate, gate_idx);
                }
            } else {
                ++link.opcode_gates_per_block[blk];
            }
        }
        if (links_to_finalize) {
            ++link.witnesses_with_finalize_gates;
        }
    }
    link.is_valid = link.witnesses_with_finalize_gates > 0;
    return link;
}

inline void dump_fingerprint_constexpr_line(std::ostream& out,
                                            const std::string& name,
                                            const recursion_helpers::FunctionFingerprint& fp)
{
    out << "static constexpr recursion_helpers::FunctionFingerprint " << name << " = { " << fp.gate_count << ", 0x"
        << std::hex << fp.prefix_hash << "ULL, 0x" << fp.full_hash << "ULL, " << std::dec << fp.fingerprint_size
        << " };\n";
}

template <typename CircuitBuilder>
void try_emit_witness_containing_stage_fp(std::ostream& out, CircuitBuilder& builder, size_t block_idx, size_t gate_idx)
{
    using namespace RollupHonkRecursionValidation::Oink;
    auto try_on_block = [&](const char* stage_name, const auto& fp) {
        auto& block = builder.blocks.get()[block_idx];
        auto start = recursion_helpers::find_fingerprint_range_containing_gate(builder, block, gate_idx, fp);
        if (start.has_value()) {
            out << " stage_fp=" << stage_name << "@start" << *start;
        }
    };

    if (block_idx == BLOCK_IDX_ARITHMETIC) {
        try_on_block("PRE_ETA_OP0", PRE_ETA_ARITH_OP0);
        try_on_block("PRE_ETA_OP1", PRE_ETA_ARITH_OP1);
        try_on_block("PREAMBLE_OP0", PREAMBLE_ARITH_OP0);
        try_on_block("PREAMBLE_OP1", PREAMBLE_ARITH_OP1);
        try_on_block("WIRE", WIRE_ARITH);
    } else if (block_idx == BLOCK_IDX_NNF) {
        try_on_block("WIRE", WIRE_NNF);
    } else if (block_idx == BLOCK_IDX_POSEIDON2_EXT) {
        try_on_block("PREAMBLE_POSEIDON2_EXT", PREAMBLE_POSEIDON2_EXT);
    } else if (block_idx == BLOCK_IDX_POSEIDON2_INT) {
        try_on_block("PREAMBLE_POSEIDON2_INT", PREAMBLE_POSEIDON2_INT);
    }
}

template <typename FF, typename CircuitBuilder>
void dump_root_rollup_opcode_acir_witness_fingerprints(std::ostream& out,
                                                       CircuitBuilder& builder,
                                                       cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                       const acir_format::RecursionConstraint& constraint,
                                                       const recursion_helpers::BlockSnapshot& segment_start,
                                                       const char* opcode_prefix,
                                                       const std::set<size_t>& consumed_squeezes = {})
{
    using namespace RollupHonkRecursionValidation::Oink;
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    const auto layout =
        RollupHonkRecursionValidation::IO::validate_rollup_proof_layout<RecursiveFlavor>(constraint, log_n);

    out << opcode_prefix << ":AcirWitnesses\n";
    out << "  segment_start_arith=" << snapshot_size_at(segment_start, BLOCK_IDX_ARITHMETIC) << "\n";

    const size_t min_arith = snapshot_size_at(segment_start, BLOCK_IDX_ARITHMETIC);
    std::set<size_t> consumed = consumed_squeezes;
    if (consumed.empty() && min_arith > 1) {
        for (size_t sq : recursion_helpers::find_all_transcript_squeeze_gates(builder)) {
            if (sq < min_arith) {
                consumed.insert(sq);
            }
        }
    }

    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    const auto oink = recursion_helpers::oink_challenges(builder, all_squeezes, consumed);
    if (oink.valid) {
        std::vector<size_t> oink_sq(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());
        std::sort(oink_sq.begin(), oink_sq.end());
        if (oink_sq.size() == HonkRecursionValidation::Oink::NUM_OINK_SQUEEZES) {
            // Dump-only tool with no opcode_index of its own: try both pinned variants and use
            // whichever one's gate_count actually lands on a matching arith_start.
            for (const auto* pre_eta_candidate : { &PRE_ETA_ARITH_OP0, &PRE_ETA_ARITH_OP1 }) {
                const size_t arith_start = oink_sq[0] + 1 - pre_eta_candidate->gate_count;
                auto& arith = builder.blocks.arithmetic;
                if (!recursion_helpers::matches_fingerprint_at(builder, arith, arith_start, *pre_eta_candidate)) {
                    continue;
                }
                out << "  circuit_build_start_arith=" << arith_start << "\n";
                out << "  oink_eta_gate=" << oink_sq[0] << "\n";
                out << "  circuit_build_start_stage=PRE_ETA\n";
                dump_fp_line(out, BLOCK_IDX_ARITHMETIC, "arithmetic", *pre_eta_candidate);
                dump_fingerprint_constexpr_line(
                    out, std::string(opcode_prefix) + ":circuit_build_start_PRE_ETA_arithmetic", *pre_eta_candidate);
                for (const auto* preamble_candidate : { &PREAMBLE_ARITH_OP0, &PREAMBLE_ARITH_OP1 }) {
                    if (recursion_helpers::matches_fingerprint_at(builder, arith, arith_start, *preamble_candidate)) {
                        out << "  circuit_build_start_preamble=PREAMBLE@arith_start\n";
                        dump_fingerprint_constexpr_line(out,
                                                        std::string(opcode_prefix) +
                                                            ":circuit_build_start_PREAMBLE_arithmetic",
                                                        *preamble_candidate);
                        break;
                    }
                }
                break;
            }
        }
    }

    out << "  validate_vk_hash="
        << (recursion_helpers::validate_vk_hash<FF>(builder, analyzer, &constraint) ? "true" : "false") << "\n";

    if (layout.is_valid) {
        out << "  proof_layout pairing=[" << layout.pairing_inputs_start << "," << layout.pairing_inputs_end << ")"
            << " ipa_claim=[" << layout.ipa_claim_start << "," << layout.ipa_claim_end << ")"
            << " honk_body=[" << layout.honk_body_start << "," << layout.honk_body_end << ")\n";
    }

    const auto dump_witness = [&](const char* role, uint32_t witness_idx) {
        const uint32_t real = builder.real_variable_index[witness_idx];
        out << "  acir_witness role=" << role << " index=" << witness_idx << " real=" << real << "\n";
        for (const auto& [block_idx, gate_idx] : analyzer.get_variable_gates(real)) {
            if (gate_idx < snapshot_size_at(segment_start, block_idx)) {
                continue;
            }
            out << "    gate block=" << block_idx << " (" << block_kind_name(block_idx) << ") idx=" << gate_idx;
            try_emit_witness_containing_stage_fp(out, builder, block_idx, gate_idx);
            const size_t gate_end = gate_idx + 1;
            const auto local_fp = compute_block_fingerprint(builder, block_idx, gate_idx, gate_end);
            if (local_fp.gate_count > 0) {
                out << " local_fp prefix20=0x" << std::hex << local_fp.prefix_hash << " full=0x" << local_fp.full_hash
                    << std::dec;
            }
            out << "\n";
        }
    };

    dump_witness("key_hash", constraint.key_hash);
    if (!constraint.key.empty()) {
        dump_witness("key[0]", constraint.key[0]);
    }
    if (constraint.key.size() > 1) {
        dump_witness("key[1]", constraint.key[1]);
    }
    if (layout.is_valid) {
        if (layout.pairing_inputs_start < constraint.proof.size()) {
            dump_witness("proof_pairing[0]", constraint.proof[layout.pairing_inputs_start]);
        }
        if (layout.ipa_claim_start < constraint.proof.size()) {
            dump_witness("proof_ipa_claim[0]", constraint.proof[layout.ipa_claim_start]);
        }
        if (layout.honk_body_start < constraint.proof.size()) {
            dump_witness("proof_honk_body[0]", constraint.proof[layout.honk_body_start]);
        }
    }
    out << "\n";
}

inline void write_root_rollup_witness_gate_map_header(std::ostream& out)
{
    out << "# ROOT_ROLLUP_HONK witness gate map\n"
        << "# key_hash -> validate_vk_hash + segment Oink squeeze -> PRE_ETA (circuit_build_start)\n"
        << "# circuit_build_start_* = Oink PRE_ETA start within opcode segment (not gate 0)\n"
        << "# ipa_accumulate segment starts at after_opcodes snapshot (post 2× honk opcodes)\n\n";
}

template <typename FF, typename CircuitBuilder>
void write_root_rollup_opcode_anchor_lines(std::ostream& out,
                                           RootRollupIpaDiscoveryContext& ctx,
                                           size_t opcode_index,
                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    const auto anchor = discover_root_rollup_opcode_segment_anchor<FF>(ctx, opcode_index, analyzer);
    const auto& constraint = ctx.program.constraints.honk_recursion_constraints[opcode_index];

    out << "RootOpcode" << opcode_index << "\n";
    out << "  constraint.key_hash witness=" << constraint.key_hash << "\n";
    out << "  segment_start_arith=" << snapshot_size_at(anchor.segment_start, BLOCK_IDX_ARITHMETIC) << "\n";
    out << "  circuit_build_start_arith=" << anchor.circuit_build_start_arith << "\n";
    out << "  circuit_build_start_poseidon2_ext=" << anchor.circuit_build_start_poseidon2_ext << "\n";
    out << "  circuit_build_start_poseidon2_int=" << anchor.circuit_build_start_poseidon2_int << "\n";
    out << "  serialization_end_arith=" << anchor.serialization_end_arith << "\n";
    out << "  vk_hash_arith_end=" << anchor.vk_hash.arith_end << "\n";

    const uint32_t key_hash_real = ctx.builder().real_variable_index[constraint.key_hash];
    out << "  key_hash_real=" << key_hash_real << "\n";
    for (const auto& [block_idx, gate_idx] : analyzer.get_variable_gates(key_hash_real)) {
        out << "    key_hash_gate block=" << block_idx << " gate=" << gate_idx << "\n";
    }
    out << "\n";
}

inline void run_root_rollup_honk_recursion_opcode(Builder& builder, const acir_format::RecursionConstraint& constraint)
{
    std::ignore = acir_format::create_honk_recursion_constraints<RecursiveFlavor, RollupIO>(builder, constraint);
}

inline std::shared_ptr<IpaStdlibTranscript> make_nested_ipa_transcript(const IpaStdlibProof& nested_ipa_proof)
{
    return std::make_shared<IpaStdlibTranscript>(nested_ipa_proof);
}

inline void run_ipa_reduce_verify_claim_hash(const bb::OpeningClaim<GrumpkinCurve>& claim,
                                             const std::shared_ptr<IpaStdlibTranscript>& transcript)
{
    RecursiveGrumpkinIPA::add_claim_to_hash_buffer(claim, transcript);
}

inline IpaVerifierAccumulator run_ipa_reduce_verify_body(const bb::OpeningClaim<GrumpkinCurve>& claim,
                                                         const std::shared_ptr<IpaStdlibTranscript>& transcript)
{
    return RecursiveGrumpkinIPA::reduce_verify_internal_recursive(claim, transcript);
}

inline bb::OpeningClaim<GrumpkinCurve> run_ipa_accumulation_glue(const IpaVerifierAccumulator& acc1,
                                                                 const IpaVerifierAccumulator& acc2)
{
    IpaStdlibTranscript transcript;
    transcript.add_to_hash_buffer("u_challenges_inv_1", acc1.u_challenges_inv);
    transcript.add_to_hash_buffer("U_1", acc1.comm);
    transcript.add_to_hash_buffer("u_challenges_inv_2", acc2.u_challenges_inv);
    transcript.add_to_hash_buffer("U_2", acc2.comm);
    auto [alpha, r] = transcript.template get_challenges<IpaFr>(std::array<std::string, 2>{ "IPA:alpha", "IPA:r" });

    bb::OpeningClaim<GrumpkinCurve> output_claim;
    output_claim.commitment = acc1.comm + acc2.comm * alpha;
    output_claim.opening_pair.challenge = r;
    output_claim.opening_pair.evaluation = RecursiveGrumpkinIPA::evaluate_and_accumulate_challenge_polys(
        acc1.u_challenges_inv, acc2.u_challenges_inv, r, alpha);
    output_claim.opening_pair.evaluation.self_reduce();
    return output_claim;
}

inline IpaAccumulatedData run_ipa_accumulate_with_proof(RootRollupIpaDiscoveryContext& ctx)
{
    bb::CommitmentKey<bb::curve::Grumpkin> commitment_key(1 << bb::CONST_ECCVM_LOG_N);
    auto transcript_1 = make_nested_ipa_transcript(ctx.output.nested_ipa_proofs[0]);
    auto transcript_2 = make_nested_ipa_transcript(ctx.output.nested_ipa_proofs[1]);
    auto [claim, proof] = RecursiveGrumpkinIPA::accumulate(
        commitment_key, transcript_1, ctx.output.nested_ipa_claims[0], transcript_2, ctx.output.nested_ipa_claims[1]);
    return { claim, proof };
}

inline void run_ipa_accumulate_monolithic(RootRollupIpaDiscoveryContext& ctx)
{
    std::ignore = run_ipa_accumulate_with_proof(ctx);
}

inline IpaVerifierKey make_grumpkin_ipa_verifier_key(Builder& builder)
{
    return IpaVerifierKey(&builder,
                          1 << bb::CONST_ECCVM_LOG_N,
                          bb::VerifierCommitmentKey<bb::curve::Grumpkin>(1 << bb::CONST_ECCVM_LOG_N));
}

template <size_t LogPolyLength> IpaVerifierKey make_grumpkin_ipa_verifier_key(Builder& builder)
{
    constexpr size_t poly_length = 1ULL << LogPolyLength;
    return IpaVerifierKey(&builder, poly_length, bb::VerifierCommitmentKey<bb::curve::Grumpkin>(poly_length));
}

inline void dump_ipa_round_separator(std::ostream& out)
{
    out << "----------------------------------------\n";
}

inline void dump_step_fingerprints_as_constexpr(std::ostream& out,
                                                Builder& builder,
                                                const recursion_helpers::BlockSnapshot& before,
                                                const recursion_helpers::BlockSnapshot& after,
                                                const char* stage_prefix)
{
    auto deltas = recursion_helpers::compute_block_deltas(before, after);
    for (const auto& d : deltas) {
        const size_t start = before.sizes[d.block_index];
        const size_t end = start + d.delta;
        auto fp = compute_block_fingerprint(builder, d.block_index, start, end);
        if (fp.gate_count == 0) {
            continue;
        }
        out << "static constexpr recursion_helpers::FunctionFingerprint " << stage_prefix << "_"
            << block_kind_name(d.block_index) << " = { " << fp.gate_count << ", 0x" << std::hex << fp.prefix_hash
            << "ULL, 0x" << fp.full_hash << "ULL, " << std::dec << fp.fingerprint_size << " };\n";
    }
}

// Phase 1 staged dump: Oink -> Preprocessor -> Sumcheck -> Shplemini -> KZG (same tags as
// rollup_honk_functions_analysis).
inline void dump_rollup_honk_staged_pipeline(std::ostream& out, RollupVerifierComponents& vc, const char* stage_prefix)
{
    auto dump_stage = [&](const recursion_helpers::BlockSnapshot& before,
                          const recursion_helpers::BlockSnapshot& after,
                          const char* stage_name) {
        std::string tag = std::string(stage_prefix) + ":" + stage_name;
        dump_step_fingerprints(out, vc.builder(), before, after, tag.c_str());
        dump_step_fingerprints_as_constexpr(out, vc.builder(), before, after, tag.c_str());
    };

    auto snap_before_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    run_oink_step(vc);
    auto snap_after_oink = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_stage(snap_before_oink, snap_after_oink, "Oink");

    auto snap_before_preproc = snap_after_oink;
    run_gate_challenges_step(vc);
    auto snap_after_preproc = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_stage(snap_before_preproc, snap_after_preproc, "Preprocessor");

    auto snap_before_sumcheck = snap_after_preproc;
    auto sc_output = run_sumcheck_step(vc);
    auto snap_after_sumcheck = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_stage(snap_before_sumcheck, snap_after_sumcheck, "Sumcheck");

    auto snap_before_shplemini = snap_after_sumcheck;
    auto shp_output = run_shplemini_step(vc, sc_output);
    auto snap_after_shplemini = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_stage(snap_before_shplemini, snap_after_shplemini, "Shplemini");

    auto snap_before_kzg = snap_after_shplemini;
    run_kzg_step(vc, shp_output);
    auto snap_after_kzg = recursion_helpers::BlockSnapshot::capture(vc.builder());
    dump_stage(snap_before_kzg, snap_after_kzg, "KZG");

    out << stage_prefix << "_pipeline_total\n";
    dump_step_fingerprints(out, vc.builder(), snap_before_oink, snap_after_kzg, stage_prefix);
    dump_step_fingerprints_as_constexpr(out, vc.builder(), snap_before_oink, snap_after_kzg, stage_prefix);
    out << "\n";
}

struct RootRollupOpcodeStagedDumpContext {
    acir_format::AcirProgram program;
    RollupVerifierComponents vc;
    acir_format::HonkRecursionConstraintsOutput<Builder> output;
    recursion_helpers::BlockSnapshot segment_start;
};

inline RootRollupOpcodeStagedDumpContext setup_root_rollup_opcode_staged_dump(size_t opcode_index,
                                                                              size_t num_acir_pub_inputs = 0)
{
    BB_ASSERT(opcode_index < 2U, "setup_root_rollup_opcode_staged_dump: opcode_index must be 0 or 1");

    RootRollupOpcodeStagedDumpContext ctx;
    ctx.program = make_root_rollup_acir_program_from_two_rollups(num_acir_pub_inputs);
    auto builder_ptr = std::make_unique<Builder>(ctx.program.witness, ctx.program.constraints.public_inputs, false);

    if (opcode_index == 1) {
        const auto honk_output = acir_format::create_honk_recursion_constraints<RecursiveFlavor, RollupIO>(
            *builder_ptr, ctx.program.constraints.honk_recursion_constraints[0]);
        ctx.output.update(honk_output, /*update_ipa_data=*/true);
    }

    ctx.segment_start = recursion_helpers::BlockSnapshot::capture(*builder_ptr);
    ctx.vc = setup_verifier_components_on_builder(std::move(builder_ptr),
                                                  ctx.program.constraints.honk_recursion_constraints[opcode_index]);
    return ctx;
}

template <size_t LogPolyLength> struct FastIpaReduceVerifyState {
    IpaFr generator_challenge;
    std::vector<IpaFr> round_challenges;
    std::vector<IpaFr> round_challenges_inv;
    std::vector<typename GrumpkinCurve::AffineElement> msm_elements;
    std::vector<IpaFr> msm_scalars;
    bool initialized = false;
};

template <size_t LogPolyLength>
void run_ipa_generator_challenge_step(FastIpaReduceVerifyState<LogPolyLength>& state,
                                      const std::shared_ptr<IpaStdlibTranscript>& transcript)
{
    state.generator_challenge = transcript->template get_challenge<IpaFr>("IPA:generator_challenge");
    state.round_challenges.assign(LogPolyLength, IpaFr());
    state.round_challenges_inv.assign(LogPolyLength, IpaFr());
    const size_t pippenger_size = (2 * LogPolyLength) + 2;
    state.msm_elements.resize(pippenger_size);
    state.msm_scalars.resize(pippenger_size);
    state.initialized = true;
}

template <size_t LogPolyLength>
void run_ipa_transcript_round_step(FastIpaReduceVerifyState<LogPolyLength>& state,
                                   size_t round_index,
                                   const std::shared_ptr<IpaStdlibTranscript>& transcript)
{
    using Commitment = typename GrumpkinCurve::AffineElement;

    BB_ASSERT(state.initialized, "Fast IPA reduce stepper: generator challenge not initialized");
    BB_ASSERT_LT(round_index, LogPolyLength, "Fast IPA reduce stepper: round index out of range");

    const std::string index = std::to_string(LogPolyLength - round_index - 1);
    auto element_L = transcript->template receive_from_prover<Commitment>("IPA:L_" + index);
    auto element_R = transcript->template receive_from_prover<Commitment>("IPA:R_" + index);
    state.round_challenges[round_index] = transcript->template get_challenge<IpaFr>("IPA:round_challenge_" + index);
    state.round_challenges_inv[round_index] = state.round_challenges[round_index].invert();

    state.msm_elements[2 * round_index] = element_L;
    state.msm_elements[(2 * round_index) + 1] = element_R;
    state.msm_scalars[2 * round_index] = state.round_challenges_inv[round_index];
    state.msm_scalars[(2 * round_index) + 1] = state.round_challenges[round_index];
}

template <size_t LogPolyLength>
IpaVerifierAccumulator run_ipa_reduce_verify_finish(FastIpaReduceVerifyState<LogPolyLength>& state,
                                                    const bb::OpeningClaim<GrumpkinCurve>& opening_claim,
                                                    const std::shared_ptr<IpaStdlibTranscript>& transcript)
{
    using FastIPA = bb::IPA<GrumpkinCurve, LogPolyLength>;
    using Commitment = typename GrumpkinCurve::AffineElement;
    using GroupElement = typename GrumpkinCurve::Group;
    using Fr = IpaFr;

    BB_ASSERT(state.initialized, "Fast IPA reduce stepper: generator challenge not initialized");

    const Fr b_zero =
        FastIPA::evaluate_challenge_poly(state.round_challenges_inv, opening_claim.opening_pair.challenge);
    Commitment G_zero = transcript->template receive_from_prover<Commitment>("IPA:G_0");
    const Fr a_zero = transcript->template receive_from_prover<Fr>("IPA:a_0");

    state.msm_elements.emplace_back(-G_zero);
    state.msm_elements.emplace_back(-Commitment::one(state.generator_challenge.get_context()));
    state.msm_scalars.emplace_back(a_zero);
    state.msm_scalars.emplace_back(state.generator_challenge *
                                   a_zero.madd(b_zero, { -opening_claim.opening_pair.evaluation }));
    GroupElement ipa_relation = GroupElement::batch_mul(state.msm_elements, state.msm_scalars);
    auto neg_commitment = -opening_claim.commitment;
    ipa_relation.assert_equal(neg_commitment);

    return { state.round_challenges_inv, G_zero, ipa_relation.get_value() == -opening_claim.commitment.get_value() };
}

template <size_t LogPolyLength> struct FastIpaGZeroState {
    std::vector<IpaFr> s_vec_temporaries;
    std::vector<IpaFr> s_vec;
    IpaFr* previous_round_s = nullptr;
    IpaFr* current_round_s = nullptr;
    size_t rounds_completed = 0;

    void init()
    {
        constexpr size_t poly_length = 1ULL << LogPolyLength;
        s_vec_temporaries.resize(poly_length / 2);
        s_vec.resize(poly_length);
        previous_round_s = s_vec_temporaries.data();
        current_round_s = s_vec.data();
        if constexpr ((LogPolyLength & 1) == 0) {
            std::swap(previous_round_s, current_round_s);
        }
        previous_round_s[0] = IpaFr(1);
        rounds_completed = 0;
    }

    void run_s_vec_round(size_t round_index, const std::vector<IpaFr>& round_challenges_inv)
    {
        BB_ASSERT_LT(round_index, LogPolyLength, "Fast IPA G_zero stepper: round index out of range");
        const size_t round_size = 1ULL << (round_index + 1);
        const IpaFr round_challenge = round_challenges_inv[round_index];
        for (size_t j = 0; j < round_size / 2; ++j) {
            current_round_s[j * 2] = previous_round_s[j];
            current_round_s[j * 2 + 1] = previous_round_s[j] * round_challenge;
        }
        std::swap(current_round_s, previous_round_s);
        rounds_completed++;
    }

    const std::vector<IpaFr>& final_s_vec() const { return s_vec; }
};

template <size_t LogPolyLength>
void run_ipa_g_zero_batch_mul_check(const IpaVerifierKey& vk,
                                    const IpaVerifierAccumulator& partial,
                                    const std::vector<IpaFr>& s_vec)
{
    using Commitment = typename GrumpkinCurve::AffineElement;
    using GroupElement = typename GrumpkinCurve::Group;
    auto claimed_G_zero = partial.comm;
    const std::vector<Commitment> srs_elements = vk.get_monomial_points();
    GroupElement computed_G_zero = GroupElement::batch_mul(srs_elements, s_vec);
    claimed_G_zero.assert_equal(computed_G_zero);
}

struct FastIpaAccumulatedFullVerifyContext {
    RootRollupIpaDiscoveryContext acir;
    bb::OpeningClaim<GrumpkinCurve> accumulated_claim;
    bb::HonkProof accumulated_proof;

    Builder& builder() { return acir.builder(); }
    const Builder& builder() const { return acir.builder(); }
};

inline std::shared_ptr<IpaStdlibTranscript> make_accumulated_ipa_transcript(Builder& builder,
                                                                            const bb::HonkProof& proof)
{
    return std::make_shared<IpaStdlibTranscript>(IpaStdlibProof(builder, proof));
}

// Phase 1: stepped full_verify_recursive dump (ClaimHash -> rounds -> GZero -> BatchMulCheck).
template <size_t LogPolyLength>
recursion_helpers::BlockSnapshot dump_root_rollup_ipa_full_verify_staged_rounds(
    std::ostream& out,
    Builder& builder,
    const bb::OpeningClaim<GrumpkinCurve>& accumulated_claim,
    const bb::HonkProof& accumulated_proof,
    const recursion_helpers::BlockSnapshot& after_accumulate_baseline)
{
    using FastIPA = bb::IPA<GrumpkinCurve, LogPolyLength>;

    auto dump_round_stage = [&](const recursion_helpers::BlockSnapshot& before,
                                const recursion_helpers::BlockSnapshot& after,
                                const char* stage_name) {
        dump_step_fingerprints(out, builder, before, after, stage_name);
        dump_step_fingerprints_as_constexpr(out, builder, before, after, stage_name);
        dump_ipa_round_separator(out);
    };

    auto transcript = make_accumulated_ipa_transcript(builder, accumulated_proof);
    const auto vk = make_grumpkin_ipa_verifier_key<LogPolyLength>(builder);
    auto snap = after_accumulate_baseline;

    {
        const auto before = snap;
        FastIPA::add_claim_to_hash_buffer(accumulated_claim, transcript);
        const auto after = recursion_helpers::BlockSnapshot::capture(builder);
        dump_round_stage(before, after, "FullVerify_ClaimHash");
        snap = after;
    }

    FastIpaReduceVerifyState<LogPolyLength> reduce_state;
    {
        const auto before = snap;
        run_ipa_generator_challenge_step<LogPolyLength>(reduce_state, transcript);
        const auto after = recursion_helpers::BlockSnapshot::capture(builder);
        dump_round_stage(before, after, "FullVerify_GeneratorChallenge");
        snap = after;
    }

    for (size_t round = 0; round < LogPolyLength; ++round) {
        const auto before = snap;
        run_ipa_transcript_round_step<LogPolyLength>(reduce_state, round, transcript);
        const auto after = recursion_helpers::BlockSnapshot::capture(builder);

        std::ostringstream stage_name;
        stage_name << "FullVerify_TranscriptRound_" << round << "_L" << (LogPolyLength - round - 1);
        dump_round_stage(before, after, stage_name.str().c_str());
        snap = after;
    }

    IpaVerifierAccumulator partial{};
    {
        const auto before = snap;
        partial = run_ipa_reduce_verify_finish<LogPolyLength>(reduce_state, accumulated_claim, transcript);
        const auto after = recursion_helpers::BlockSnapshot::capture(builder);
        dump_round_stage(before, after, "FullVerify_ReduceFinish_MSM");
        snap = after;
    }

    FastIpaGZeroState<LogPolyLength> gzero_state;
    gzero_state.init();
    for (size_t round = 0; round < LogPolyLength; ++round) {
        const auto before = snap;
        gzero_state.run_s_vec_round(round, partial.u_challenges_inv);
        const auto after = recursion_helpers::BlockSnapshot::capture(builder);

        std::ostringstream stage_name;
        stage_name << "FullVerify_GZero_SVecRound_" << round;
        dump_round_stage(before, after, stage_name.str().c_str());
        snap = after;
    }

    {
        const auto before = snap;
        run_ipa_g_zero_batch_mul_check<LogPolyLength>(vk, partial, gzero_state.final_s_vec());
        const auto after = recursion_helpers::BlockSnapshot::capture(builder);
        dump_round_stage(before, after, "FullVerify_GZero_BatchMulCheck");
        snap = after;
    }

    std::ostringstream aggregate_label;
    aggregate_label << "IpaFullVerify_LogN" << LogPolyLength;
    out << aggregate_label.str() << " aggregate (accumulate -> after G_zero check)\n";
    dump_step_fingerprints(out, builder, after_accumulate_baseline, snap, aggregate_label.str().c_str());
    dump_step_fingerprints_as_constexpr(out, builder, after_accumulate_baseline, snap, aggregate_label.str().c_str());
    dump_ipa_round_separator(out);

    BB_ASSERT_EQ(gzero_state.rounds_completed, LogPolyLength, "G_zero s_vec rounds incomplete");
    return snap;
}

inline void run_ipa_full_verify_g_zero_check(const IpaVerifierKey& vk, const IpaVerifierAccumulator& partial)
{
    using Commitment = GrumpkinCurve::Group;
    using Fr = IpaFr;
    constexpr size_t log_poly_length = bb::CONST_ECCVM_LOG_N;
    constexpr size_t poly_length = 1 << log_poly_length;

    const auto round_challenges_inv = partial.u_challenges_inv;
    auto claimed_G_zero = partial.comm;

    std::vector<Fr> s_vec_temporaries(poly_length / 2);
    std::vector<Fr> s_vec(poly_length);

    Fr* previous_round_s = &s_vec_temporaries[0];
    Fr* current_round_s = &s_vec[0];
    if constexpr ((log_poly_length & 1) == 0) {
        std::swap(previous_round_s, current_round_s);
    }
    previous_round_s[0] = Fr(1);
    for (size_t i = 0; i < log_poly_length; ++i) {
        const size_t round_size = 1 << (i + 1);
        const Fr round_challenge = round_challenges_inv[i];
        for (size_t j = 0; j < round_size / 2; ++j) {
            current_round_s[j * 2] = previous_round_s[j];
            current_round_s[j * 2 + 1] = previous_round_s[j] * round_challenge;
        }
        std::swap(current_round_s, previous_round_s);
    }

    const std::vector<Commitment> srs_elements = vk.get_monomial_points();
    Commitment computed_G_zero = Commitment::batch_mul(srs_elements, s_vec);
    claimed_G_zero.assert_equal(computed_G_zero);
}

inline bool run_ipa_full_verify_monolithic(const IpaVerifierKey& vk,
                                           const bb::OpeningClaim<GrumpkinCurve>& claim,
                                           const std::shared_ptr<IpaStdlibTranscript>& transcript)
{
    return RecursiveGrumpkinIPA::full_verify_recursive(vk, claim, transcript);
}

inline void run_ipa_full_verify_on_accumulated(RootRollupIpaDiscoveryContext& ctx,
                                               const IpaAccumulatedData& accumulated)
{
    const auto vk = make_grumpkin_ipa_verifier_key(ctx.builder());
    const auto transcript = make_accumulated_ipa_transcript(ctx.builder(), accumulated.proof);
    BB_ASSERT(run_ipa_full_verify_monolithic(vk, accumulated.claim, transcript),
              "run_ipa_full_verify_on_accumulated: full_verify_recursive failed");
}

inline void run_ipa_full_verification_monolithic(RootRollupIpaDiscoveryContext& ctx)
{
    run_ipa_full_verify_on_accumulated(ctx, run_ipa_accumulate_with_proof(ctx));
}

inline void run_root_default_io_finalize(Builder& builder,
                                         const acir_format::HonkRecursionConstraintsOutput<Builder>& output)
{
    using IO = bb::stdlib::recursion::honk::DefaultIO<Builder>;
    if (output.points_accumulator.is_populated()) {
        IO inputs;
        inputs.pairing_inputs = output.points_accumulator;
        inputs.set_public();
    } else {
        IO::add_default(builder);
    }
}

inline void run_root_rollup_ipa_finalize_path(RootRollupIpaDiscoveryContext& ctx)
{
    run_ipa_full_verification_monolithic(ctx);
    run_root_default_io_finalize(ctx.builder(), ctx.output);
}

inline FinalizeDumpData run_root_rollup_finalize_capture(acir_format::AcirProgram& program)
{
    return run_and_capture_finalize(program, /*has_ipa_claim=*/false);
}

inline FinalizeDumpData run_non_root_rollup_finalize_capture(acir_format::AcirProgram& program)
{
    return run_and_capture_finalize(program, /*has_ipa_claim=*/true);
}

inline void dump_ipa_squeeze_region(std::ostream& out, Builder& builder, size_t baseline_squeeze_count)
{
    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    out << "IPA squeeze region (indices >= " << baseline_squeeze_count
        << ", count=" << (all_squeezes.size() - baseline_squeeze_count) << "):\n";
    for (size_t i = baseline_squeeze_count; i < all_squeezes.size(); ++i) {
        out << "  [" << i << "] arith_gate=" << all_squeezes[i] << "\n";
    }
}

// --- Fast ROOT Rollup IPA path (ACIR opcodes + reduced log_n IPA instrumentation) ---

template <size_t LogPolyLength> struct ValidNativeIpaOpening {
    bb::HonkProof proof;
    bb::curve::Grumpkin::AffineElement commitment;
    bb::fq challenge;
    bb::fq evaluation;
};

template <size_t LogPolyLength> ValidNativeIpaOpening<LogPolyLength> create_valid_native_ipa_opening()
{
    using NativeCurve = bb::curve::Grumpkin;
    using NativeIPA = bb::IPA<NativeCurve, LogPolyLength>;
    using Fr = bb::fq;
    constexpr size_t poly_length = 1ULL << LogPolyLength;

    bb::CommitmentKey<NativeCurve> ck(poly_length);
    bb::Polynomial<Fr> poly = bb::Polynomial<Fr>::random(poly_length);
    Fr challenge = Fr::random_element();
    Fr evaluation = poly.evaluate(challenge);
    bb::curve::Grumpkin::AffineElement commitment = ck.commit(poly);

    auto transcript = std::make_shared<bb::NativeTranscript>();
    NativeIPA::compute_opening_proof(ck, { poly, bb::OpeningPair<NativeCurve>{ challenge, evaluation } }, transcript);

    bb::HonkProof proof = transcript->export_proof();
    BB_ASSERT_EQ(proof.size(), (4 * LogPolyLength) + 4);
    return { std::move(proof), commitment, challenge, evaluation };
}

template <size_t LogPolyLength>
bb::OpeningClaim<GrumpkinCurve> load_opening_claim(Builder& builder, const ValidNativeIpaOpening<LogPolyLength>& native)
{
    auto comm = GrumpkinCurve::Group::from_witness(&builder, native.commitment);
    auto challenge = GrumpkinCurve::ScalarField::from_witness(&builder, native.challenge);
    auto evaluation = GrumpkinCurve::ScalarField::from_witness(&builder, native.evaluation);
    return { { challenge, evaluation }, comm };
}

template <size_t LogPolyLength> IpaAccumulatedData run_fast_ipa_accumulate_on_builder(Builder& builder)
{
    using NativeCurve = bb::curve::Grumpkin;
    using FastIPA = bb::IPA<GrumpkinCurve, LogPolyLength>;
    constexpr size_t poly_length = 1ULL << LogPolyLength;

    const auto native1 = create_valid_native_ipa_opening<LogPolyLength>();
    const auto native2 = create_valid_native_ipa_opening<LogPolyLength>();
    auto claim1 = load_opening_claim<LogPolyLength>(builder, native1);
    auto claim2 = load_opening_claim<LogPolyLength>(builder, native2);
    auto transcript1 = std::make_shared<IpaStdlibTranscript>(IpaStdlibProof(builder, native1.proof));
    auto transcript2 = std::make_shared<IpaStdlibTranscript>(IpaStdlibProof(builder, native2.proof));

    bb::CommitmentKey<NativeCurve> ck(poly_length);
    auto [claim, proof] = FastIPA::accumulate(ck, transcript1, claim1, transcript2, claim2);
    return { claim, proof };
}

template <size_t LogPolyLength>
FastIpaAccumulatedFullVerifyContext setup_fast_ipa_accumulated_full_verify_context(size_t num_acir_pub_inputs = 0)
{
    FastIpaAccumulatedFullVerifyContext ctx;
    ctx.acir = setup_root_rollup_ipa_discovery(num_acir_pub_inputs);
    auto accumulated = run_fast_ipa_accumulate_on_builder<LogPolyLength>(ctx.builder());
    ctx.accumulated_claim = accumulated.claim;
    ctx.accumulated_proof = accumulated.proof;
    return ctx;
}

template <size_t LogPolyLength> struct FastRootRollupIpaCircuit {
    RootRollupIpaDiscoveryContext acir;
    bool ipa_verify_ok = false;
    size_t ipa_gate_count = 0;

    Builder& builder() { return acir.builder(); }
    const Builder& builder() const { return acir.builder(); }
};

template <size_t LogPolyLength>
FastRootRollupIpaCircuit<LogPolyLength> build_fast_root_rollup_ipa_finalize_circuit(size_t num_acir_pub_inputs = 0)
{
    using FastIPA = bb::IPA<GrumpkinCurve, LogPolyLength>;

    FastRootRollupIpaCircuit<LogPolyLength> result;
    result.acir = setup_root_rollup_ipa_discovery(num_acir_pub_inputs, /*use_valid_proof=*/true);
    Builder& builder = result.builder();
    const size_t gates_before = builder.get_num_finalized_gates_inefficient();

    auto [accumulated_claim, accumulated_proof] = run_fast_ipa_accumulate_on_builder<LogPolyLength>(builder);

    IpaVerifierKey vk = make_grumpkin_ipa_verifier_key<LogPolyLength>(builder);
    auto accumulated_transcript = make_accumulated_ipa_transcript(builder, accumulated_proof);
    result.ipa_verify_ok = FastIPA::full_verify_recursive(vk, accumulated_claim, accumulated_transcript);

    run_root_default_io_finalize(builder, result.acir.output);
    builder.finalize_circuit();

    const size_t gates_after = builder.get_num_finalized_gates_inefficient();
    result.ipa_gate_count = gates_after - gates_before;
    return result;
}

inline size_t total_block_delta(const recursion_helpers::BlockSnapshot& before,
                                const recursion_helpers::BlockSnapshot& after)
{
    size_t total = 0;
    for (const auto& [block_idx, _] : IPA_ANALYSIS_BLOCKS) {
        total += snapshot_size_at(after, block_idx) - snapshot_size_at(before, block_idx);
    }
    return total;
}

template <size_t LogPolyLength> struct RootRollupAcirFastIpaThroughReduceFinish {
    RootRollupIpaDiscoveryContext acir;
    IpaVerifierAccumulator partial;
    RollupHonkIpaAccumulateValidation::BlockCursor gzero_cursor;
};

// ACIR ROOT_ROLLUP_HONK opcodes, then fast IPA (log_n=LogPolyLength) stepped through ReduceFinish_MSM.
template <size_t LogPolyLength>
RootRollupAcirFastIpaThroughReduceFinish<LogPolyLength> setup_root_rollup_acir_fast_ipa_through_reduce_finish(
    size_t num_acir_pub_inputs = 0)
{
    using FastIPA = bb::IPA<GrumpkinCurve, LogPolyLength>;

    RootRollupAcirFastIpaThroughReduceFinish<LogPolyLength> result;
    result.acir = setup_root_rollup_ipa_discovery(num_acir_pub_inputs);
    Builder& builder = result.acir.builder();

    auto [accumulated_claim, accumulated_proof] = run_fast_ipa_accumulate_on_builder<LogPolyLength>(builder);
    auto transcript = make_accumulated_ipa_transcript(builder, accumulated_proof);

    FastIPA::add_claim_to_hash_buffer(accumulated_claim, transcript);

    FastIpaReduceVerifyState<LogPolyLength> reduce_state;
    run_ipa_generator_challenge_step<LogPolyLength>(reduce_state, transcript);
    for (size_t round = 0; round < LogPolyLength; ++round) {
        run_ipa_transcript_round_step<LogPolyLength>(reduce_state, round, transcript);
    }
    result.partial = run_ipa_reduce_verify_finish<LogPolyLength>(reduce_state, accumulated_claim, transcript);

    const auto snap = recursion_helpers::BlockSnapshot::capture(builder);
    result.gzero_cursor = RollupHonkIpaAccumulateValidation::block_cursor_from_snapshot(snap);
    return result;
}

} // namespace rollup_honk_test_helpers
