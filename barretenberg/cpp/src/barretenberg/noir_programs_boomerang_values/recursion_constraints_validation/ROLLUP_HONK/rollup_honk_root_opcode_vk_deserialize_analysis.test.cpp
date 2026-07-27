// Phase 2: per-operation FunctionFingerprint breakdown of the pre-OINK gate gap for
// ROOT_ROLLUP_HONK opcodes. Emits root_rollup_honk_vk_deserialize_analysis.txt.
//
// The "gap" is every gate built by create_honk_recursion_constraints BEFORE the inner HONK
// verifier's Oink protocol begins (the eta challenge squeeze == circuit_build_start anchor).
//
// For a constant predicate (the root rollup case) the only gate-producing operation in the gap
// is verification-key commitment deserialization:
//   StdlibVerificationKey(key_fields) -> per commitment:
//       assert_is_in_field()  (range / arithmetic gates)   field_conversion.hpp:177
//       assert_on_curve=true  (elliptic gates)             field_conversion.hpp:194
// Witness field extraction (key[], proof[]) and key_hash binding produce NO gates — they are
// pure witness references; the proof commitments are deserialized lazily during the protocol.
//
// This test replays the exact construction order of setup_verifier_components_on_builder,
// capturing a BlockSnapshot between each operation, then dumps per-operation per-block
// FunctionFingerprints (and constexpr-ready lines for promotion into a validation header).

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;

namespace {

// Replay the pre-Oink construction (same order as setup_verifier_components_on_builder) on a
// fresh builder, capturing a snapshot between each operation, and emit per-operation per-block
// fingerprints. Fingerprints are selector/structure based (position independent), so opcode 0 and
// opcode 1 yield identical VkDeserialize fingerprints when the two rollup VKs share structure.
void dump_pre_oink_gap_breakdown(std::ostream& out,
                                 const acir_format::AcirProgram& program,
                                 size_t opcode_index,
                                 const char* prefix)
{
    const auto& constraint = program.constraints.honk_recursion_constraints[opcode_index];
    auto builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder = *builder_ptr;

    // Run all preceding opcodes fully — exact production order from create_circuit / setup_root_rollup_ipa_discovery.
    // This ensures fix_witness deduplication matches the real merged circuit: opcode 1 reuses
    // constants already committed by opcode 0, so its VkDeserialize produces fewer gates.
    for (size_t i = 0; i < opcode_index; ++i) {
        run_root_rollup_honk_recursion_opcode(builder, program.constraints.honk_recursion_constraints[i]);
    }

    out << prefix << "\n";
    out << "  key_fields=" << constraint.key.size() << " proof_fields=" << constraint.proof.size()
        << " public_inputs=" << constraint.public_inputs.size()
        << " predicate_const=" << (constraint.predicate.is_constant ? "true" : "false") << "\n";

    const auto snap_segment_start = recursion_helpers::BlockSnapshot::capture(builder);

    // ── Exact code from setup_verifier_components_on_builder, snapshots injected between steps ──

    // Op 1: key witnesses -> field_t  (pure witness references, no new gates expected)
    auto key_fields = acir_format::fields_from_witnesses(builder, constraint.key);
    const auto snap_after_key_fields = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_segment_start, snap_after_key_fields, "  Op1_FieldsFromWitnesses_key");

    // Op 2: RecursiveVK(key_fields)  — the only gate-producing step before Oink.
    //   UltraCircuitBuilder: assert_is_in_field() → arith gates; assert_on_curve → NNF gates (not elliptic).
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);
    const auto snap_after_vk = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_after_key_fields, snap_after_vk, "  Op2_VkDeserialize");

    // Op 3: key_hash -> field_t + VKAndHash  (no gates; Poseidon2 vk_hash recompute is inside Oink preamble)
    auto vk_hash_ct = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);
    const auto snap_after_vk_hash = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_after_vk, snap_after_vk_hash, "  Op3_VkHashBind");

    // Op 4: proof witnesses -> field_t + StdlibProof  (deserialized lazily, no gates pre-Oink)
    std::vector<uint32_t> full_proof_indices =
        acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    std::vector<uint32_t> honk_proof_indices(
        full_proof_indices.begin(), full_proof_indices.end() - static_cast<std::ptrdiff_t>(bb::IPA_PROOF_LENGTH));
    auto honk_proof_fields = acir_format::fields_from_witnesses(builder, honk_proof_indices);
    const auto snap_after_proof = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_after_vk_hash, snap_after_proof, "  Op4_FieldsFromWitnesses_proof");

    // constexpr-ready lines for Op2 VkDeserialize (promote to validation header).
    out << "  -- constexpr (Op2 VkDeserialize) --\n";
    const auto deltas = recursion_helpers::compute_block_deltas(snap_after_key_fields, snap_after_vk);
    for (const auto& d : deltas) {
        const size_t start = snap_after_key_fields.sizes[d.block_index];
        const size_t end = start + d.delta;
        const auto fp = compute_block_fingerprint(builder, d.block_index, start, end);
        dump_fingerprint_constexpr_line(
            out, std::string(prefix) + "_VK_DESERIALIZE_" + block_kind_name(d.block_index), fp);
    }

    // Witness participation in the VkDeserialize region [snap_after_key_fields, snap_after_vk).
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);
    auto region_gates = [&](uint32_t witness_idx) {
        const uint32_t real = builder.real_variable_index[witness_idx];
        std::map<size_t, size_t> per_block;
        size_t total = 0;
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            ++total;
            if (gi >= snap_after_key_fields.sizes[blk] && gi < snap_after_vk.sizes[blk]) {
                ++per_block[blk];
            }
        }
        return std::make_pair(per_block, total);
    };
    auto emit_role = [&](const char* role, uint32_t witness_idx) {
        const auto [per_block, total] = region_gates(witness_idx);
        size_t in_region = 0;
        for (const auto& [blk, n] : per_block) {
            in_region += n;
        }
        out << "    " << role << " witness=" << witness_idx << " real=" << builder.real_variable_index[witness_idx]
            << " region_gates=" << in_region << " total_gates=" << total;
        for (const auto& [blk, n] : per_block) {
            out << " " << block_kind_name(blk) << "=" << n;
        }
        out << "\n";
    };

    out << "  -- witness -> VkDeserialize region participation --\n";
    size_t key_with_region = 0;
    size_t key_arith = 0;
    size_t key_nnf = 0;
    for (uint32_t widx : constraint.key) {
        const auto [per_block, total] = region_gates(widx);
        size_t in_region = 0;
        for (const auto& [blk, n] : per_block) {
            in_region += n;
            if (blk == BLOCK_IDX_ARITHMETIC) {
                key_arith += n;
            } else if (blk == BLOCK_IDX_NNF) {
                key_nnf += n;
            }
        }
        if (in_region > 0) {
            ++key_with_region;
        }
    }
    out << "    key[] total=" << constraint.key.size() << " touching_region=" << key_with_region
        << " region_arith=" << key_arith << " region_nnf=" << key_nnf << "\n";
    if (constraint.key.size() > 2) {
        emit_role("key[0]_log_n", constraint.key[0]);
        emit_role("key[1]_num_pub", constraint.key[1]);
        emit_role("key[2]_pub_offset", constraint.key[2]);
        emit_role("key[3]_first_comm", constraint.key[3]);
    }
    emit_role("key_hash", constraint.key_hash);
    if (!constraint.proof.empty()) {
        emit_role("proof[0]", constraint.proof[0]);
        emit_role("proof[mid]", constraint.proof[constraint.proof.size() / 2]);
    }
    out << "\n";
}

} // namespace

class RootRollupOpcodeVkDeserializeAnalysisTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RootRollupOpcodeVkDeserializeAnalysisTests, RootRollupOpcodeVkDeserializeAnalysis)
{
    const auto program = make_root_rollup_acir_program_from_two_rollups(0, /*use_valid_proof=*/true);
    ASSERT_EQ(program.constraints.honk_recursion_constraints.size(), 2U);

    std::ofstream out("root_rollup_honk_vk_deserialize_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open root_rollup_honk_vk_deserialize_analysis.txt";

    out << "# ROOT_ROLLUP_HONK pre-Oink gate gap: per-operation FunctionFingerprint breakdown\n"
        << "# gap = create_honk_recursion_constraints work before the inner HONK Oink eta squeeze\n"
        << "# replays setup_verifier_components_on_builder construction order with snapshots\n"
        << "# Op2_VkDeserialize is the only gate-producing op for a constant predicate\n\n";

    dump_pre_oink_gap_breakdown(out, program, 0, "RootOpcode0");
    dump_pre_oink_gap_breakdown(out, program, 1, "RootOpcode1");

    out.flush();
    SUCCEED();
}

