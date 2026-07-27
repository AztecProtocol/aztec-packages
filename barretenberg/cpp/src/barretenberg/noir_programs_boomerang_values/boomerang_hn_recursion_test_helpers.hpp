#pragma once

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/flavor/mega_zk_recursive_flavor.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/noir_programs_boomerang_values/hypernova_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

#include <gtest/gtest.h>

#include <algorithm>
#include <fstream>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace hn_recursion_test {

using namespace bb;
using namespace acir_format;
using namespace cdg;

using HNBuilder = MegaCircuitBuilder;
using HNAnalyzer = MegaStaticAnalyzer;

constexpr size_t HN_BLOCK_ECC_OP = 0;
constexpr size_t HN_BLOCK_ARITHMETIC = 3;
// Mega merged poseidon2_external/poseidon2_quad_internal into one `poseidon2` block (index 9 in
// the reordered 10-block trace: ecc_op, pub_inputs, lookup, arithmetic, delta_range, elliptic,
// memory, nnf, busread, poseidon2). HN_BLOCK_POSEIDON2_EXT/_INT used to be two distinct blocks
// (9, 10); both now alias this single index. Every poseidon2-linked FunctionFingerprint dumped via
// this constant is stale pending re-derivation against the merged block's actual gate layout.
constexpr size_t HN_BLOCK_POSEIDON2_EXT = 9;
constexpr size_t HN_BLOCK_POSEIDON2_INT = 9;

// Create a RecursionConstraint for a single verification queue entry. `group_index` is this
// entry's position within the kernel's own group (0 = the previous-kernel/leading-app verify).
//
// Cannot call expected_proof_type(ivc, group_index) here: it calls is_init_kernel(), which reads
// stdlib_verification_queue -- only populated during real circuit construction (instantiate_stdlib_
// verification_queue), not yet at this pre-circuit mock-setup stage. Re-derive the same logic from
// data already available pre-circuit: is_hiding_kernel() needs only circuit_kinds (fine here), and
// group_index==0's own entry.kind (already known -- this is that exact entry) stands in for
// is_init_kernel()'s stdlib_verification_queue.front().kind check, since instantiate_stdlib_
// verification_queue drains the native queue into the stdlib one in the same order.
inline RecursionConstraint create_hn_recursion_constraint(const Chonk& ivc,
                                                          size_t group_index,
                                                          const Chonk::VerifierInputs& entry,
                                                          std::vector<bb::fr>& witness)
{
    PROOF_TYPE proof_type;
    if (ivc.is_hiding_kernel()) {
        proof_type = PROOF_TYPE::HN_FINAL;
    } else if (group_index == 0 && entry.kind == Chonk::CircuitKind::App) {
        proof_type = PROOF_TYPE::OINK;
    } else {
        proof_type = PROOF_TYPE::HN;
    }

    RecursionConstraint constraint = recursion_data_to_recursion_constraint(witness,
                                                                            entry.proof,
                                                                            entry.vk_to_field_elements(),
                                                                            entry.vk_hash(),
                                                                            bb::fr::zero(),
                                                                            /*num_public_inputs_to_extract=*/0,
                                                                            proof_type);
    constraint.proof = {};
    return constraint;
}

// Build an AcirProgram from the IVC's verification queue (HN constraints only).
inline AcirProgram build_hn_kernel_program(const Chonk& ivc)
{
    AcirProgram program;
    const auto& queue = ivc.verification_queue;
    std::vector<RecursionConstraint> hn_constraints;
    hn_constraints.reserve(queue.size());

    size_t group_index = 0;
    for (const auto& entry : queue) {
        hn_constraints.push_back(create_hn_recursion_constraint(ivc, group_index, entry, program.witness));
        ++group_index;
    }

    program.constraints.max_witness_index = static_cast<uint32_t>(program.witness.size() - 1);
    program.constraints.num_acir_opcodes = static_cast<uint32_t>(hn_constraints.size());
    program.constraints.hn_recursion_constraints = hn_constraints;

    AcirFormatOriginalOpcodeIndices indices;
    indices.hn_recursion_constraints.reserve(hn_constraints.size());
    for (uint32_t i = 0; i < static_cast<uint32_t>(hn_constraints.size()); ++i) {
        indices.hn_recursion_constraints.push_back(i);
    }
    program.constraints.original_opcode_indices = indices;

    return program;
}

// ACIR program + matching mock IVC metadata. Source of truth for HN test fixtures.
struct HNAcirSetup {
    AcirProgram program;
    std::shared_ptr<Chonk> ivc;
    ProgramMetadata metadata;
    bb::fr expected_vk_hash{};
    std::vector<bb::fr> expected_vk_fields;
    std::vector<bb::fr> expected_vk_hashes;
    std::vector<std::vector<bb::fr>> expected_vk_fields_all;
    struct QueueEntrySnapshot {
        Chonk::CircuitKind kind = Chonk::CircuitKind::App;
        bool is_kernel = false;
    };
    std::vector<QueueEntrySnapshot> queue_snapshots;

    const RecursionConstraint& hn_constraint(size_t index = 0) const
    {
        return program.constraints.hn_recursion_constraints.at(index);
    }
};

inline void capture_queue_vk_expectations(HNAcirSetup& setup)
{
    setup.expected_vk_hashes.clear();
    setup.expected_vk_fields_all.clear();
    setup.queue_snapshots.clear();
    for (const auto& entry : setup.ivc->verification_queue) {
        setup.queue_snapshots.push_back({ entry.kind, entry.is_kernel() });
        setup.expected_vk_hashes.push_back(entry.vk_hash());
        setup.expected_vk_fields_all.push_back(entry.vk_to_field_elements());
    }
    if (!setup.expected_vk_hashes.empty()) {
        setup.expected_vk_hash = setup.expected_vk_hashes.front();
        setup.expected_vk_fields = setup.expected_vk_fields_all.front();
    }
}

// Build a mock Chonk positioned at the kernel a `proof_types` sequence describes, reusing
// production's own create_mock_chonk_from_constraints instead of re-deriving the CircuitKind
// stack here (see hypernova_recursion_constraint.cpp for the exact group/kinds construction).
inline std::shared_ptr<Chonk> make_mock_chonk_for_scenario(const std::vector<PROOF_TYPE>& proof_types)
{
    std::vector<RecursionConstraint> placeholder_constraints;
    placeholder_constraints.reserve(proof_types.size());
    for (const auto proof_type : proof_types) {
        RecursionConstraint constraint;
        constraint.proof_type = static_cast<uint32_t>(proof_type);
        placeholder_constraints.push_back(constraint);
    }
    return create_mock_chonk_from_constraints(placeholder_constraints);
}

inline HNAcirSetup make_hn_acir_setup(const std::vector<PROOF_TYPE>& proof_types)
{
    auto ivc = make_mock_chonk_for_scenario(proof_types);
    AcirProgram program = build_hn_kernel_program(*ivc);
    HNAcirSetup setup{
        .program = std::move(program),
        .ivc = ivc,
        .metadata = ProgramMetadata{ ivc },
    };
    capture_queue_vk_expectations(setup);
    return setup;
}

// Single-entry scenario. `is_kernel` must match the entry expected_group_entry_kind derives for
// group_index 0 given proof_type (OINK => leading app for INIT, HN => previous kernel otherwise).
inline HNAcirSetup make_hn_acir_setup(PROOF_TYPE proof_type, bool is_kernel = true)
{
    HNAcirSetup setup = make_hn_acir_setup(std::vector<PROOF_TYPE>{ proof_type });
    BB_ASSERT_EQ(setup.queue_snapshots.size(), size_t{ 1 });
    BB_ASSERT_EQ(setup.queue_snapshots[0].is_kernel, is_kernel);
    return setup;
}

inline HNAcirSetup make_hn_init_acir_setup()
{
    return make_hn_acir_setup(PROOF_TYPE::OINK, /*is_kernel=*/false);
}

// Kernel + num_apps app-verify constraints in one INNER circuit (num_apps >= 1). Mirrors
// production's create_mock_chonk_from_constraints INNER loop: first entry is_kernel=true (the
// previous-kernel verify), all subsequent entries is_kernel=false (app verifies).
inline HNAcirSetup make_hn_inner_acir_setup_n(size_t num_apps)
{
    std::vector<PROOF_TYPE> proof_types(num_apps + 1, PROOF_TYPE::HN);
    return make_hn_acir_setup(proof_types);
}

inline HNAcirSetup make_hn_inner_acir_setup()
{
    return make_hn_inner_acir_setup_n(/*num_apps=*/1);
}

inline HNBuilder build_hn_circuit_from_acir(HNAcirSetup setup)
{
    return create_circuit<HNBuilder>(setup.program, setup.metadata);
}

// Builder seeded only from ACIR witnesses — for step-by-step verifier instrumentation.
inline HNBuilder build_hn_witness_builder(const HNAcirSetup& setup)
{
    auto op_queue =
        setup.metadata.ivc == nullptr ? std::make_shared<ECCOpQueue>() : setup.metadata.ivc->get_goblin().op_queue;
    return HNBuilder{
        op_queue,
        setup.program.witness,
        setup.program.constraints.public_inputs,
        false,
    };
}

inline HNBuilder build_reset_kernel_circuit()
{
    return build_hn_circuit_from_acir(make_hn_acir_setup(PROOF_TYPE::HN, /*is_kernel=*/true));
}

// TAIL is indistinguishable from RESET at the IVC-mock level (both a single HN entry, is_kernel
// true) -- upstream folded PROOF_TYPE::HN_TAIL into plain PROOF_TYPE::HN (they share the same
// fold-core). Callers wanting a "TAIL-shaped" circuit should just pass PROOF_TYPE::HN.
inline HNBuilder build_hn_kernel_circuit(PROOF_TYPE proof_type, bool is_kernel = true)
{
    return build_hn_circuit_from_acir(make_hn_acir_setup(proof_type, is_kernel));
}

inline HNBuilder build_hn_init_kernel_circuit()
{
    return build_hn_circuit_from_acir(make_hn_init_acir_setup());
}

inline HNBuilder build_inner_kernel_circuit()
{
    return build_hn_circuit_from_acir(make_hn_inner_acir_setup());
}

// ── Real multi-step IVC chain helpers ──────────────────────────────────────
// Mirrors dsl/acir_format/hypernova_recursion_constraint.test.cpp's
// HypernovaRecursionConstraintTest fixture (construct_mock_app_circuit /
// construct_and_accumulate_mock_kernel), but exposes the intermediate ACIR
// builder+constraints of each kernel step so the boomerang validator can be
// run against a genuine ivc->accumulate() chain instead of an isolated
// single-opcode mock.

inline HNBuilder build_hn_app_circuit(const std::shared_ptr<Chonk>& ivc)
{
    HNBuilder circuit{ ivc->goblin.op_queue };
    GoblinMockCircuits::add_some_ecc_op_gates(circuit);
    MockCircuits::add_arithmetic_gates(circuit);
    stdlib::recursion::honk::AppIO::add_default(circuit);
    return circuit;
}

inline std::shared_ptr<Chonk::AppVerificationKey> get_hn_app_verification_key(HNBuilder& app_circuit)
{
    // Deep-copy the op_queue so computing the VK doesn't disturb the queue shared with `ivc`.
    HNBuilder builder{ app_circuit };
    builder.op_queue = std::make_shared<ECCOpQueue>(*builder.op_queue);
    auto prover_instance = std::make_shared<ProverInstance_<Chonk::AppFlavor>>(builder);
    return std::make_shared<Chonk::AppVerificationKey>(prover_instance->get_precomputed());
}

inline std::shared_ptr<Chonk::KernelVerificationKey> get_hn_kernel_verification_key(HNBuilder& kernel_circuit)
{
    auto prover_instance = std::make_shared<ProverInstance_<Chonk::KernelFlavor>>(kernel_circuit);
    return std::make_shared<Chonk::KernelVerificationKey>(prover_instance->get_precomputed());
}

// Build + accumulate one mock app circuit into the real IVC.
inline void accumulate_hn_app_step(const std::shared_ptr<Chonk>& ivc)
{
    HNBuilder app_circuit = build_hn_app_circuit(ivc);
    auto vk = get_hn_app_verification_key(app_circuit);
    ivc->accumulate(app_circuit, vk);
}

// Build the next kernel step's ACIR circuit from the ivc's current verification queue
// (the real production entry point every Aztec kernel goes through), run the boomerang
// validator against it, then feed the same circuit into the real ivc->accumulate() flow.
inline void accumulate_hn_kernel_step_and_validate(const std::shared_ptr<Chonk>& ivc, const char* step_label)
{
    const ProgramMetadata metadata{ ivc };
    AcirProgram program = build_hn_kernel_program(*ivc);
    HNBuilder kernel = create_circuit<HNBuilder>(program, metadata);

    {
        // Validate a copy so `kernel` remains intact for the subsequent real accumulate.
        HNBuilder analyzer_builder{ kernel };
        AcirFormat constraint_system_copy = program.constraints;
        cdg::MegaStaticAnalyzerAcir analyzer(std::move(constraint_system_copy), std::move(analyzer_builder));
        const auto incorrect = analyzer.get_incorrect_opcodes();
        EXPECT_TRUE(incorrect.empty()) << step_label << ": " << incorrect.size() << " incorrect opcode(s) detected";
    }

    auto kernel_vk = get_hn_kernel_verification_key(kernel);
    ivc->accumulate(kernel, kernel_vk);
}

// Thin HN-local wrapper over the shared recursion_helpers::compute_fingerprint_at (moved there
// per shared_api_functions.md group C — was an independent HN copy, duplicate of CHONK's own
// compute_fingerprint_at in boomerang_chonk_recursion.test.cpp). Kept as a 4-arg wrapper (vs the
// shared function's 5-arg signature) so the ~30 existing HN call sites don't need touching.
inline recursion_helpers::FunctionFingerprint hn_compute_fingerprint(HNBuilder& builder,
                                                                     size_t block_index,
                                                                     size_t start,
                                                                     size_t end)
{
    return recursion_helpers::compute_fingerprint_at(builder, block_index, start, end, HN_BLOCK_ARITHMETIC);
}

// Print a FunctionFingerprint as a C++ constant declaration line.
// Always uses decimal for gate_count and fingerprint_size, hex for hashes.
inline void print_fp(std::ostream& out, const char* name, const recursion_helpers::FunctionFingerprint& fp)
{
    out << std::dec << "inline constexpr FunctionFingerprint " << name << " = { " << fp.gate_count << ", 0x" << std::hex
        << fp.prefix_hash << "ULL, 0x" << fp.full_hash << "ULL, " << std::dec << fp.fingerprint_size << " };\n";
}

struct HNPoseidonSegment {
    size_t start = 0;
    recursion_helpers::FunctionFingerprint fp{};
};

// Fingerprint the contiguous range covering all linked gates (CHONK-style stage dump).
inline std::optional<HNPoseidonSegment> hn_poseidon_segment_covering_linked(HNBuilder& builder,
                                                                            size_t block_index,
                                                                            const std::set<size_t>& linked_gates)
{
    if (linked_gates.empty()) {
        return std::nullopt;
    }
    const size_t start = *linked_gates.begin();
    const size_t end = *linked_gates.rbegin() + 1;
    return HNPoseidonSegment{ start, hn_compute_fingerprint(builder, block_index, start, end) };
}

struct HNLinkedPoseidonFingerprints {
    HNPoseidonSegment external{};
    HNPoseidonSegment internal{};
    bool valid = false;
};

// Given an arithmetic window, walk witness links into the (Mega-merged) poseidon2 block.
//
// Ultra's poseidon2_external/poseidon2_internal two-hop model no longer applies to Mega: the
// external/internal GateKinds (Ext/ExtInitial/QuadInt/QuadIntTerminal/TransitionEntry) were merged
// into one `poseidon2` block, so a second hop from a range inside that block back into itself is
// meaningless. This is a single hop now; `result.internal` duplicates `result.external` so the
// existing two-field struct shape stays source-compatible with callers (print_linked_poseidon_fps,
// write_hn_arith_poseidon_stage) pending a Step-2 rewrite once the merged layout is re-derived.
inline HNLinkedPoseidonFingerprints hn_extract_linked_poseidon_fps(HNBuilder& builder,
                                                                   HNAnalyzer& analyzer,
                                                                   size_t arith_start,
                                                                   size_t arith_end)
{
    HNLinkedPoseidonFingerprints result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2 = builder.blocks.poseidon2;

    const std::set<size_t> linked_gates =
        recursion_helpers::collect_linked_gates<bb::fr>(builder, analyzer, arith, arith_start, arith_end, poseidon2);
    if (linked_gates.empty()) {
        return result;
    }

    const auto segment = hn_poseidon_segment_covering_linked(builder, HN_BLOCK_POSEIDON2_EXT, linked_gates);
    if (!segment.has_value()) {
        return result;
    }
    result.external = *segment;
    result.internal = *segment;
    result.valid = true;
    return result;
}

inline void print_linked_poseidon_fps(std::ostream& out, const char* prefix, const HNLinkedPoseidonFingerprints& linked)
{
    BB_ASSERT(linked.valid);
    // Mega's merged poseidon2 block: external/internal are the same segment (see
    // hn_extract_linked_poseidon_fps).
    print_fp(out, (std::string(prefix) + "_POSEIDON2").c_str(), linked.external.fp);
    out << "//   " << prefix << " poseidon2 start=" << linked.external.start << "\n";
}

// build_hn_init_oink_context is INIT-specific: its single queue entry is the leading app,
// verified via an OINK proof (expected_proof_type), so the Oink verifier instance is App-flavored.
using HNOinkRecursiveFlavor = Chonk::AppRecursiveFlavor;
using HNOinkTranscript = typename HNOinkRecursiveFlavor::Transcript;
using HNOinkVerificationKey = typename HNOinkRecursiveFlavor::VerificationKey;
using HNOinkVKAndHash = typename HNOinkRecursiveFlavor::VKAndHash;
using HNOinkVerifierInstance = VerifierInstance_<HNOinkRecursiveFlavor>;
using HNOinkCommitment = typename HNOinkRecursiveFlavor::Commitment;
using HNOinkField = typename HNOinkRecursiveFlavor::FF;

struct HNOinkExecutionContext {
    std::shared_ptr<HNOinkTranscript> transcript;
    std::shared_ptr<HNOinkVerifierInstance> verifier_instance;
    size_t num_public_inputs = 0;
};

inline HNOinkExecutionContext build_hn_init_oink_context(HNBuilder& builder, const HNAcirSetup& setup)
{
    BB_ASSERT_EQ(setup.ivc->verification_queue.size(), size_t(1));
    const auto& constraint = setup.hn_constraint(0);
    BB_ASSERT_EQ(constraint.proof_type, PROOF_TYPE::OINK);
    const auto& entry = setup.ivc->verification_queue.front();

    HNOinkExecutionContext ctx;

    auto key_fields = fields_from_witnesses(builder, constraint.key);
    auto recursive_vk = std::make_shared<HNOinkVerificationKey>(key_fields);

    auto vk_hash_ct = HNOinkField::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<HNOinkVKAndHash>(recursive_vk, vk_hash_ct);

    // HN ACIR constraints carry empty proof indices; native proof comes from the mock IVC queue.
    stdlib::Proof<HNBuilder> stdlib_proof(builder, entry.proof);
    ctx.transcript = std::make_shared<HNOinkTranscript>();
    ctx.transcript->load_proof(stdlib_proof);
    ctx.verifier_instance = std::make_shared<HNOinkVerifierInstance>(vk_and_hash);
    ctx.num_public_inputs = ProofLength::HypernovaInstanceToAccum<HNOinkRecursiveFlavor>::derive_num_public_inputs(
        entry.proof.size(), HNOinkRecursiveFlavor::VIRTUAL_LOG_N);

    return ctx;
}

inline void hn_execute_oink_part(HNBuilder& builder, HNOinkExecutionContext& ctx, std::ostream& out)
{
    static_assert(std::is_same_v<HNOinkRecursiveFlavor, Chonk::AppRecursiveFlavor>);

    // OinkVerifier's per-stage internals (relation_parameters, witness_commitments, comm_labels,
    // and the receive_* methods) are private; this mirrors verify()'s body directly against
    // verifier_instance instead of driving an OinkVerifier instance stage-by-stage.
    auto& rel_params = ctx.verifier_instance->relation_parameters;
    auto& witness_comms = ctx.verifier_instance->witness_commitments;
    typename HNOinkRecursiveFlavor::CommitmentLabels comm_labels;
    auto vk = ctx.verifier_instance->get_vk();

    const auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

    const auto dump_stage = [&](const char* stage_tag,
                                const char* const_prefix,
                                const recursion_helpers::BlockSnapshot& before,
                                const recursion_helpers::BlockSnapshot& after) {
        const auto block_name = [](size_t block_index) {
            switch (block_index) {
            case HN_BLOCK_ARITHMETIC:
                return "arithmetic";
            case HN_BLOCK_POSEIDON2_EXT: // == HN_BLOCK_POSEIDON2_INT (merged Mega poseidon2 block)
                return "poseidon2";
            case 0:
                return "ecc_op";
            default:
                return "unknown";
            }
        };

        bool printed_any = false;
        out << stage_tag << "\n";
        for (size_t block_index : { size_t(0), HN_BLOCK_ARITHMETIC, HN_BLOCK_POSEIDON2_EXT }) {
            const size_t start = before.sizes[block_index];
            const size_t end = after.sizes[block_index];
            if (end <= start) {
                continue;
            }
            const auto fp = hn_compute_fingerprint(builder, block_index, start, end);
            printed_any = true;
            out << "  block[" << block_index << "] " << block_name(block_index) << " gates=" << fp.gate_count
                << " fingerprint20=0x" << std::hex << fp.prefix_hash << " full_hash=0x" << fp.full_hash << std::dec
                << "\n";
            switch (block_index) {
            case HN_BLOCK_ARITHMETIC:
                print_fp(out, (std::string(const_prefix) + "_ARITH").c_str(), fp);
                break;
            case HN_BLOCK_POSEIDON2_EXT: // == HN_BLOCK_POSEIDON2_INT
                print_fp(out, (std::string(const_prefix) + "_POSEIDON2").c_str(), fp);
                break;
            default:
                break;
            }
        }
        if (!printed_any) {
            out << "  (no new gates)\n";
        }
        out << "\n";
    };

    out << "# HN INIT OINK step-by-step FunctionFingerprint dump\n";
    out << "# Generated by hn_execute_oink_part(...)\n\n";

    {
        auto before = snap();
        HNOinkField vk_hash = vk->hash_with_origin_tagging(*ctx.transcript);
        ctx.transcript->add_to_hash_buffer("vk_hash", vk_hash);
        ctx.verifier_instance->vk_and_hash->hash.assert_equal(vk_hash);
        vk->num_public_inputs.assert_equal(HNOinkField(ctx.num_public_inputs),
                                           "OinkVerifier: num_public_inputs mismatch with VK");
        dump_stage("HN_OINK:vk_hash", "HN_OINK_VK_HASH", before, snap());
    }

    {
        auto before = snap();
        out << "# num_public_inputs=" << ctx.num_public_inputs << "\n";
        for (size_t i = 0; i < ctx.num_public_inputs; ++i) {
            auto public_input_i =
                ctx.transcript->template receive_from_prover<HNOinkField>("public_input_" + std::to_string(i));
            ctx.verifier_instance->public_inputs.emplace_back(public_input_i);
        }
        dump_stage("HN_OINK:public_inputs", "HN_OINK_PUBLIC_INPUTS", before, snap());
    }

    auto receive_commitment_stage =
        [&](const char* stage_tag, const char* const_prefix, auto& commitment_slot, const std::string& label) {
            auto before = snap();
            commitment_slot = ctx.transcript->template receive_from_prover<HNOinkCommitment>(label);
            dump_stage(stage_tag, const_prefix, before, snap());
        };

    receive_commitment_stage("HN_OINK:w_l", "HN_OINK_W_L", witness_comms.w_l(), comm_labels.w_l());
    receive_commitment_stage("HN_OINK:w_r", "HN_OINK_W_R", witness_comms.w_r(), comm_labels.w_r());
    receive_commitment_stage("HN_OINK:w_o", "HN_OINK_W_O", witness_comms.w_o(), comm_labels.w_o());

    size_t idx = 0;
    for (auto [commitment, label] : zip_view(witness_comms.get_ecc_op_wires(), comm_labels.get_ecc_op_wires())) {
        receive_commitment_stage(("HN_OINK:ecc_op_wire_" + std::to_string(idx)).c_str(),
                                 ("HN_OINK_ECC_OP_WIRE_" + std::to_string(idx)).c_str(),
                                 commitment,
                                 label);
        ++idx;
    }

    idx = 0;
    for (auto [commitment, label] :
         zip_view(witness_comms.get_databus_entities(), comm_labels.get_databus_entities())) {
        receive_commitment_stage(("HN_OINK:databus_commitment_" + std::to_string(idx)).c_str(),
                                 ("HN_OINK_DATABUS_COMMITMENT_" + std::to_string(idx)).c_str(),
                                 commitment,
                                 label);
        ++idx;
    }

    {
        auto before = snap();
        rel_params.compute_eta_powers(ctx.transcript->template get_challenge<HNOinkField>("eta"));
        dump_stage("HN_OINK:eta", "HN_OINK_ETA", before, snap());
    }

    receive_commitment_stage("HN_OINK:lookup_read_counts",
                             "HN_OINK_LOOKUP_READ_COUNTS",
                             witness_comms.lookup_read_counts(),
                             comm_labels.lookup_read_counts());
    receive_commitment_stage("HN_OINK:lookup_read_tags",
                             "HN_OINK_LOOKUP_READ_TAGS",
                             witness_comms.lookup_read_tags(),
                             comm_labels.lookup_read_tags());
    receive_commitment_stage("HN_OINK:w_4", "HN_OINK_W_4", witness_comms.w_4(), comm_labels.w_4());

    {
        auto before = snap();
        auto [beta, gamma] =
            ctx.transcript->template get_challenges<HNOinkField>(std::array<std::string, 2>{ "beta", "gamma" });
        rel_params.compute_beta_powers(beta);
        rel_params.gamma = gamma;
        dump_stage("HN_OINK:beta_gamma", "HN_OINK_BETA_GAMMA", before, snap());
    }

    receive_commitment_stage("HN_OINK:lookup_inverses",
                             "HN_OINK_LOOKUP_INVERSES",
                             witness_comms.lookup_inverses(),
                             comm_labels.lookup_inverses());

    idx = 0;
    for (auto [commitment, label] :
         zip_view(witness_comms.get_databus_inverses(), comm_labels.get_databus_inverses())) {
        receive_commitment_stage(("HN_OINK:databus_inverse_" + std::to_string(idx)).c_str(),
                                 ("HN_OINK_DATABUS_INVERSE_" + std::to_string(idx)).c_str(),
                                 commitment,
                                 label);
        ++idx;
    }

    {
        auto before = snap();
        rel_params.public_input_delta = compute_public_input_delta<HNOinkRecursiveFlavor>(
            ctx.verifier_instance->public_inputs, rel_params.beta, rel_params.gamma, vk->pub_inputs_offset);
        dump_stage("HN_OINK:public_input_delta", "HN_OINK_PUBLIC_INPUT_DELTA", before, snap());
    }

    receive_commitment_stage("HN_OINK:z_perm", "HN_OINK_Z_PERM", witness_comms.z_perm(), comm_labels.z_perm());

    {
        auto before = snap();
        ctx.verifier_instance->alpha = ctx.transcript->template get_challenge<HNOinkField>("alpha");
        dump_stage("HN_OINK:alpha", "HN_OINK_ALPHA", before, snap());
    }

    const auto squeeze_gates = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    out << "# total squeezes after OINK: " << squeeze_gates.size() << "\n";
    if (squeeze_gates.size() >= 3) {
        out << "# squeeze[0]=" << squeeze_gates[0] << " squeeze[1]=" << squeeze_gates[1]
            << " squeeze[2]=" << squeeze_gates[2] << "\n";
    }
}

// ── CHONK-style stage fingerprint dump helpers ───────────────────────────────
// Mirrors write_stage_fingerprint / write_challenge_generation_fingerprint from
// boomerang_chonk_recursion.test.cpp, adapted for Mega block indices.

struct HNStageFingerprintSegment {
    size_t block_index;
    size_t start;
    size_t end;
};

inline const char* hn_block_kind_name(size_t block_index)
{
    switch (block_index) {
    case HN_BLOCK_ARITHMETIC:
        return "arithmetic";
    case HN_BLOCK_POSEIDON2_EXT: // == HN_BLOCK_POSEIDON2_INT (merged Mega poseidon2 block)
        return "poseidon2";
    case 0:
        return "ecc_op";
    case 7:
        return "nnf";
    default:
        return "unknown";
    }
}

inline HNStageFingerprintSegment hn_segment(size_t block_index, size_t start, size_t end)
{
    return HNStageFingerprintSegment{ .block_index = block_index, .start = start, .end = end };
}

inline void write_stage_fingerprint(std::ostream& out,
                                    HNBuilder& builder,
                                    const char* stage_tag,
                                    const std::vector<HNStageFingerprintSegment>& segments)
{
    out << stage_tag << "\n";
    for (const auto& segment : segments) {
        const auto fp = hn_compute_fingerprint(builder, segment.block_index, segment.start, segment.end);
        out << "  block[" << segment.block_index << "] " << hn_block_kind_name(segment.block_index)
            << " gates=" << fp.gate_count << " fingerprint20=0x" << std::hex << fp.prefix_hash << " full_hash=0x"
            << fp.full_hash << std::dec << "\n";
    }
}

inline void write_hn_arith_poseidon_stage(std::ostream& out,
                                          HNBuilder& builder,
                                          HNAnalyzer& analyzer,
                                          const char* stage_tag,
                                          size_t arith_start,
                                          size_t arith_end)
{
    std::vector<HNStageFingerprintSegment> segments;
    segments.push_back(hn_segment(HN_BLOCK_ARITHMETIC, arith_start, arith_end));

    const auto linked = hn_extract_linked_poseidon_fps(builder, analyzer, arith_start, arith_end);
    if (linked.valid) {
        // Mega's merged poseidon2 block: external/internal are the same segment (see
        // hn_extract_linked_poseidon_fps); push it once.
        segments.push_back(hn_segment(
            HN_BLOCK_POSEIDON2_EXT, linked.external.start, linked.external.start + linked.external.fp.gate_count));
    }

    write_stage_fingerprint(out, builder, stage_tag, segments);
}

// ACIR metadata header for one HN constraint inside the INNER kernel (2× HN queue).
inline void write_hn_inner_acir_constraint_header(std::ostream& out,
                                                  const HNAcirSetup& setup,
                                                  size_t constraint_idx,
                                                  const HNAcirSetup::QueueEntrySnapshot& queue_entry,
                                                  size_t global_sq_begin,
                                                  size_t global_sq_count)
{
    const auto& constraint = setup.hn_constraint(constraint_idx);
    out << "# HN INNER kernel — ACIR hn_recursion_constraints[" << constraint_idx << "]\n";
    out << "# IVC role: " << (queue_entry.is_kernel ? "previous kernel (KernelIO)" : "new app (AppIO)") << "\n";
    out << "# proof_type=" << static_cast<int>(constraint.proof_type)
        << " queue_kind=" << static_cast<int>(queue_entry.kind) << "\n";
    out << "# key.size=" << constraint.key.size() << " key_hash witness=" << constraint.key_hash << "\n";
    out << "# public_inputs.size=" << constraint.public_inputs.size() << " proof.size=" << constraint.proof.size()
        << "\n";
    if (constraint_idx < setup.expected_vk_hashes.size()) {
        out << "# expected_vk_hash=" << setup.expected_vk_hashes[constraint_idx] << "\n";
    }
    out << "# verification loop: global squeezes [" << global_sq_begin << ".."
        << (global_sq_begin + global_sq_count - 1) << "] (" << global_sq_count << " total)\n";
    out << "# num_hn_recursion_constraints=" << setup.program.constraints.hn_recursion_constraints.size() << "\n\n";
}

// Per-stage dump for one RESET-shaped 90-squeeze HN verification loop (INNER loop0 or loop1).
inline void dump_hn_baseline_pipeline_stages(std::ostream& out,
                                             HNBuilder& builder,
                                             HNAnalyzer& analyzer,
                                             const std::vector<size_t>& sq_loop,
                                             size_t loop_arith_lo,
                                             const char* tag_prefix)
{
    namespace HN = HNVerification;
    BB_ASSERT_EQ(sq_loop.size(), HN::HN_RESET_TOTAL_SQUEEZES);

    const auto dump = [&](const std::string& stage_suffix, size_t arith_start, size_t arith_end) {
        const std::string tag = std::string(tag_prefix) + ":" + stage_suffix;
        write_hn_arith_poseidon_stage(out, builder, analyzer, tag.c_str(), arith_start, arith_end);
    };

    const size_t pre_eta_start = (sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1 >= HN::OINK_PRE_ETA_ARITH.gate_count)
                                     ? sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1 - HN::OINK_PRE_ETA_ARITH.gate_count
                                     : loop_arith_lo;
    dump("Oink:pre_eta", std::max(pre_eta_start, loop_arith_lo), sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1);
    dump("Oink:eta_to_beta", sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1, sq_loop[HN::HN_SQUEEZE_OINK_BETA] + 1);
    dump("Oink:beta_to_alpha", sq_loop[HN::HN_SQUEEZE_OINK_BETA] + 1, sq_loop[HN::HN_SQUEEZE_OINK_ALPHA] + 1);
    dump("GateChallenge", sq_loop[HN::HN_SQUEEZE_OINK_ALPHA] + 1, sq_loop[HN::HN_SQUEEZE_GATE_CHALLENGE] + 1);

    for (size_t r = 0; r < HN::HN_NUM_MAIN_SC_SQUEEZES; ++r) {
        dump(("MainSumcheck:round_" + std::to_string(r)).c_str(),
             sq_loop[HN::HN_SQUEEZE_GATE_CHALLENGE + r] + 1,
             sq_loop[HN::HN_SQUEEZE_GATE_CHALLENGE + r + 1] + 1);
    }

    dump("Batching:transition", sq_loop[HN::HN_SQUEEZE_MAIN_SC_LAST] + 1, sq_loop[HN::HN_SQUEEZE_BATCHING_FIRST] + 1);
    for (size_t k = 0; k < HN::HN_NUM_BATCHING_SQUEEZES; ++k) {
        dump(("Batching:round_" + std::to_string(k)).c_str(),
             sq_loop[HN::HN_SQUEEZE_BATCHING_FIRST + k] + 1,
             sq_loop[HN::HN_SQUEEZE_BATCHING_FIRST + k + 1] + 1);
    }

    dump("MLB:alpha_transition", sq_loop[HN::HN_SQUEEZE_BATCHING_LAST] + 1, sq_loop[HN::HN_SQUEEZE_MLB_ALPHA] + 1);
    for (size_t r = 0; r < HN::HN_NUM_MLB_SC_SQUEEZES; ++r) {
        dump(("MLB:Sumcheck:round_" + std::to_string(r)).c_str(),
             sq_loop[HN::HN_SQUEEZE_MLB_ALPHA + r] + 1,
             sq_loop[HN::HN_SQUEEZE_MLB_ALPHA + r + 1] + 1);
    }
    dump("MLB:claim_batching", sq_loop[HN::HN_SQUEEZE_MLB_SC_LAST] + 1, sq_loop[HN::HN_SQUEEZE_CLAIM_BATCHING] + 1);

    const size_t arith_total = builder.blocks.arithmetic.size();
    dump("PostMLB:transition", sq_loop[HN::HN_SQUEEZE_CLAIM_BATCHING] + 1, sq_loop[HN::HN_SQUEEZE_POST_MLB_FIRST] + 1);
    for (size_t k = 0; k < HN::HN_NUM_POST_MLB_SQUEEZES; ++k) {
        const size_t end =
            (k + 1 < HN::HN_NUM_POST_MLB_SQUEEZES) ? sq_loop[HN::HN_SQUEEZE_POST_MLB_FIRST + k + 1] + 1 : arith_total;
        dump(("PostMLB:squeeze_" + std::to_string(k)).c_str(), sq_loop[HN::HN_SQUEEZE_POST_MLB_FIRST + k] + 1, end);
    }
}

// Bounds for INNER per-constraint dumps — prevents bridge / preamble / next-loop bleed.
struct HNInnerLoopDumpBounds {
    size_t arith_lo = 0;              // inclusive lower bound for this verification loop
    size_t arith_hi = SIZE_MAX;       // exclusive upper bound (loop0: before inter-loop bridge)
    bool dump_micro_oink = false;     // loop1: dump vk_hash + commitment chain before eta
    bool dump_kernel_preamble = true; // loop0: dump [arith_lo, vk_hash) separately
};

inline size_t cap_inner_arith_end(size_t end, size_t arith_hi)
{
    return std::min(end, arith_hi);
}

inline size_t floor_inner_arith_start(size_t start, size_t arith_lo)
{
    return std::max(start, arith_lo);
}

// INNER-specific stage dump: ACIR vk_hash anchor + hard loop bounds (no cross-stage overlap).
inline void dump_hn_inner_loop_stages(std::ostream& out,
                                      HNBuilder& builder,
                                      HNAnalyzer& analyzer,
                                      const std::vector<size_t>& sq_loop,
                                      const char* tag_prefix,
                                      const HNInnerLoopDumpBounds& bounds,
                                      const RecursionConstraint* constraint = nullptr)
{
    namespace HN = HNVerification;
    namespace INNER = HNVerification::HNInnerValidation;
    // Loop0 (88 squeezes) and loop1 (87) differ by 1 (Stage 3.2): loop1's Oink-equivalent prefix
    // has one fewer squeeze than loop0's canonical 4-squeeze Oink, exactly what
    // LOOP1_TAIL_SQUEEZE_OFFSET compensates for in the real validator (validate_hn_baseline_impl's
    // sq_idx lambda, mirrored below). Deriving the offset from sq_loop.size() (rather than a
    // parameter) keeps this dump helper usable for either loop from its existing bounds struct.
    BB_ASSERT_GTE(sq_loop.size(), HN::HN_RESET_TOTAL_SQUEEZES);
    const size_t tail_offset = (sq_loop.size() >= INNER::HN_INNER_LOOP0_SQUEEZES) ? 0 : 1;

    const auto sq_idx = [&](size_t canonical_idx) -> size_t {
        if (tail_offset > 0 && canonical_idx >= HN::HN_SQUEEZE_MAIN_SC_LAST) {
            return sq_loop[canonical_idx - tail_offset];
        }
        return sq_loop[canonical_idx];
    };

    const auto dump = [&](const std::string& stage_suffix, size_t arith_start, size_t arith_end) {
        const size_t start = floor_inner_arith_start(arith_start, bounds.arith_lo);
        const size_t end = cap_inner_arith_end(arith_end, bounds.arith_hi);
        if (start >= end) {
            out << tag_prefix << ":" << stage_suffix << " (omitted: empty after bounds)\n";
            return;
        }
        const std::string tag = std::string(tag_prefix) + ":" + stage_suffix;
        write_hn_arith_poseidon_stage(out, builder, analyzer, tag.c_str(), start, end);
    };

    if (bounds.dump_micro_oink && constraint != nullptr) {
        const auto vk_hash = HNVerification::HNOinkValidation::validate_vk_hash_anchor<bb::fr>(
            builder, analyzer, *constraint, INNER::C1_VK_HASH_PROFILE);
        if (vk_hash.valid) {
            out << "# vk_hash anchor: arith[" << vk_hash.arith_start << ".." << vk_hash.arith_end << ")\n";
            dump("Oink:vk_hash", vk_hash.arith_start, vk_hash.arith_end);
            const size_t cursor = vk_hash.arith_end + INNER::LOOP1_PRE_ETA_ARITH.gate_count;
            dump("Oink:pre_eta_chain", vk_hash.arith_end, cursor);
            out << "# micro_oink cursor after pre-eta chain=" << cursor
                << " eta_end=" << sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1 << "\n";
            if (cursor < cap_inner_arith_end(sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1, bounds.arith_hi)) {
                dump("Oink:pre_eta_tail", cursor, sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1);
            }
        } else {
            out << "# vk_hash anchor: not found for micro-Oink dump\n";
        }
    } else if (constraint != nullptr) {
        const auto vk_hash = OinkVerifierValidation::validate_vk_hash_stage<bb::fr>(builder, analyzer, *constraint);
        const size_t eta_end = cap_inner_arith_end(sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1, bounds.arith_hi);

        if (vk_hash.is_valid) {
            out << "# vk_hash anchor: arith[" << vk_hash.arith_start << ".." << vk_hash.arith_end << ")\n";
            if (bounds.dump_kernel_preamble && vk_hash.arith_start > bounds.arith_lo) {
                dump("KernelPreamble", bounds.arith_lo, vk_hash.arith_start);
            }
            if (vk_hash.arith_start < eta_end) {
                dump("Oink:pre_eta", vk_hash.arith_start, eta_end);
            } else {
                out << tag_prefix << ":Oink:pre_eta (omitted: vk_hash starts at or after eta squeeze)\n";
            }
        } else {
            out << "# vk_hash anchor: not found — falling back to RESET pre_eta window\n";
            const size_t pre_eta_start = (sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1 >= HN::OINK_PRE_ETA_ARITH.gate_count)
                                             ? sq_loop[HN::HN_SQUEEZE_OINK_ETA] + 1 - HN::OINK_PRE_ETA_ARITH.gate_count
                                             : bounds.arith_lo;
            dump("Oink:pre_eta", pre_eta_start, eta_end);
        }
    }

    dump("Oink:eta_to_beta", sq_idx(HN::HN_SQUEEZE_OINK_ETA) + 1, sq_idx(HN::HN_SQUEEZE_OINK_BETA) + 1);
    dump("Oink:beta_to_alpha", sq_idx(HN::HN_SQUEEZE_OINK_BETA) + 1, sq_idx(HN::HN_SQUEEZE_OINK_ALPHA) + 1);
    dump("GateChallenge", sq_idx(HN::HN_SQUEEZE_OINK_ALPHA) + 1, sq_idx(HN::HN_SQUEEZE_GATE_CHALLENGE) + 1);

    for (size_t r = 0; r < HN::HN_NUM_MAIN_SC_SQUEEZES; ++r) {
        dump(("MainSumcheck:round_" + std::to_string(r)).c_str(),
             sq_idx(HN::HN_SQUEEZE_GATE_CHALLENGE + r) + 1,
             sq_idx(HN::HN_SQUEEZE_GATE_CHALLENGE + r + 1) + 1);
    }

    dump("Batching:transition", sq_idx(HN::HN_SQUEEZE_MAIN_SC_LAST) + 1, sq_idx(HN::HN_SQUEEZE_BATCHING_FIRST) + 1);
    for (size_t k = 0; k < HN::HN_NUM_BATCHING_SQUEEZES; ++k) {
        dump(("Batching:round_" + std::to_string(k)).c_str(),
             sq_idx(HN::HN_SQUEEZE_BATCHING_FIRST + k) + 1,
             sq_idx(HN::HN_SQUEEZE_BATCHING_FIRST + k + 1) + 1);
    }

    dump("MLB:alpha_transition", sq_idx(HN::HN_SQUEEZE_BATCHING_LAST) + 1, sq_idx(HN::HN_SQUEEZE_MLB_ALPHA) + 1);
    for (size_t r = 0; r < HN::HN_NUM_MLB_SC_SQUEEZES; ++r) {
        dump(("MLB:Sumcheck:round_" + std::to_string(r)).c_str(),
             sq_idx(HN::HN_SQUEEZE_MLB_ALPHA + r) + 1,
             sq_idx(HN::HN_SQUEEZE_MLB_ALPHA + r + 1) + 1);
    }
    dump("MLB:claim_batching", sq_idx(HN::HN_SQUEEZE_MLB_SC_LAST) + 1, sq_idx(HN::HN_SQUEEZE_CLAIM_BATCHING) + 1);

    // Post-claim-batching tail (Stage 3.2): each loop has exactly ONE such squeeze, the last
    // entry in its own slice -- not the old 12/13-squeeze-per-loop model this replaced (that
    // model's fixed HN_SQUEEZE_POST_MLB_FIRST+k indices ran past the end of loop1's shorter
    // slice and read garbage memory).
    const size_t claim_batching_local_idx = sq_loop.size() - 2;
    const size_t post_claim_tail_local_idx = sq_loop.size() - 1;
    dump("PostClaimTail", sq_loop[claim_batching_local_idx] + 1, sq_loop[post_claim_tail_local_idx] + 1);
}

class BoomerangHNRecursionTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

} // namespace hn_recursion_test
