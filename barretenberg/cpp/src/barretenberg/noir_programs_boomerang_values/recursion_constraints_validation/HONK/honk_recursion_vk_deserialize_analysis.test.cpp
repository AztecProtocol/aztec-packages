// Phase 1: per-operation FunctionFingerprint breakdown of the pre-Oink gate gap for standalone HONK
// recursion constraints (single opcode, no fix_witness dedup from a sibling opcode).
//
// The "gap" is every gate built by create_honk_recursion_constraints BEFORE the inner HONK verifier's
// Oink protocol begins (HonkRecursionValidation::compute_arith_boundaries anchors this at
// eta_squeeze + 1 - Oink::PRE_ETA_ARITH.gate_count). For a constant predicate the only gate-producing
// operation in the gap is verification-key commitment deserialization (see the ROLLUP_HONK sibling
// analysis: rollup_honk_root_opcode_vk_deserialize_analysis.test.cpp, same construction order).
//
// This test replays the construction steps directly from production
// (acir_format::create_honk_recursion_constraints's own witness wiring: fields_from_witnesses(key),
// RecursiveVK(key_fields), key_hash bind, fields_from_witnesses(proof)) against the REAL ACIR build
// (setup_honk_verifier_components_for_acir_build) rather than the mirrored build
// (build_full_honk_circuit) — HonkMirroredBuildMatchesRealAcirCircuit currently shows a 1131-gate
// arithmetic residual between mirror and real build, so per boomerang-constraint-validator's circuit
// source rules this fingerprint (feeds a witness-link validator) must be pinned against the real build.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_honk_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>
#include <map>
#include <string>
#include <vector>

using namespace bb;
using namespace honk_recursion_test_helpers;

namespace {

inline void dump_fingerprint_constexpr_line(std::ostream& out,
                                            const std::string& name,
                                            const recursion_helpers::FunctionFingerprint& fp)
{
    out << "static constexpr recursion_helpers::FunctionFingerprint " << name << " = { " << fp.gate_count << ", 0x"
        << std::hex << fp.prefix_hash << "ULL, 0x" << fp.full_hash << "ULL, " << std::dec << fp.fingerprint_size
        << " };\n";
}

void dump_pre_oink_gap_breakdown(std::ostream& out, size_t num_acir_pub_inputs)
{
    HonkVerifierComponents vc = setup_honk_verifier_components_for_acir_build(num_acir_pub_inputs);
    const auto& constraint = vc.constraint;
    Builder& builder = vc.builder();

    out << "# num_acir_pub_inputs=" << num_acir_pub_inputs << "\n";
    out << "  key_fields=" << constraint.key.size() << " proof_fields=" << constraint.proof.size()
        << " public_inputs=" << constraint.public_inputs.size()
        << " predicate_const=" << (constraint.predicate.is_constant ? "true" : "false") << "\n";

    const auto snap_segment_start = recursion_helpers::BlockSnapshot::capture(builder);

    // ── Same steps as create_honk_recursion_constraints / setup_honk_verifier_components ──

    // Op1: key witnesses -> field_t (pure witness references, no new gates expected).
    auto key_fields = acir_format::fields_from_witnesses(builder, constraint.key);
    const auto snap_after_key_fields = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_segment_start, snap_after_key_fields, "  Op1_FieldsFromWitnesses_key");

    // Op2: RecursiveVK(key_fields) — the only gate-producing step before Oink.
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);
    const auto snap_after_vk = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_after_key_fields, snap_after_vk, "  Op2_VkDeserialize");

    // Op3: key_hash -> field_t + VKAndHash (no gates; Poseidon2 vk_hash recompute is inside Oink preamble).
    auto vk_hash_ct = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto vk_and_hash = std::make_shared<VKAndHash>(recursive_vk, vk_hash_ct);
    const auto snap_after_vk_hash = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_after_vk, snap_after_vk_hash, "  Op3_VkHashBind");

    // Op4: proof witnesses -> field_t (no gates pre-Oink; commitments deserialized lazily in Oink).
    std::vector<uint32_t> proof_indices =
        acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    auto proof_fields = acir_format::fields_from_witnesses(builder, proof_indices);
    const auto snap_after_proof = recursion_helpers::BlockSnapshot::capture(builder);
    dump_step_fingerprints(out, builder, snap_after_vk_hash, snap_after_proof, "  Op4_FieldsFromWitnesses_proof");

    // constexpr-ready lines for Op2 VkDeserialize (promote to validation header).
    out << "  -- constexpr (Op2 VkDeserialize) --\n";
    const auto deltas = recursion_helpers::compute_block_deltas(snap_after_key_fields, snap_after_vk);
    for (const auto& d : deltas) {
        const size_t start = snap_after_key_fields.sizes[d.block_index];
        const size_t end = start + d.delta;
        const auto fp = compute_block_fingerprint(builder, d.block_index, start, end);
        dump_fingerprint_constexpr_line(out, std::string("HONK_VK_DESERIALIZE_") + block_kind_name(d.block_index), fp);
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
    if (constraint.key.size() > 3) {
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

class HonkVkDeserializeAnalysisTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(HonkVkDeserializeAnalysisTests, HonkVkDeserializeAnalysis)
{
    std::ofstream out("honk_vk_deserialize_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open honk_vk_deserialize_analysis.txt";

    out << "# HONK pre-Oink gate gap: per-operation FunctionFingerprint breakdown\n"
        << "# gap = create_honk_recursion_constraints work before the inner HONK Oink eta squeeze\n"
        << "# built against the REAL ACIR build (setup_honk_verifier_components_for_acir_build), not the\n"
        << "# mirror, because HonkMirroredBuildMatchesRealAcirCircuit currently shows a 1131-gate residual\n"
        << "# Op2_VkDeserialize is the only gate-producing op for a constant predicate\n\n";

    dump_pre_oink_gap_breakdown(out, /*num_acir_pub_inputs=*/0);

    out.flush();
    SUCCEED();
}
