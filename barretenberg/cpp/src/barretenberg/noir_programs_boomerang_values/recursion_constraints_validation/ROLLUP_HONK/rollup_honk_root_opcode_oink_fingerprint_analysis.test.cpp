// Phase 4: witness-anchored PRE_ETA_ARITH re-discovery for opcode 1 of the ROOT_ROLLUP_HONK merge.
//
// Once the pre-Oink VkDeserialize gap is witness-anchored (see
// rollup_honk_root_opcode_vk_deserialize_analysis.test.cpp / rollup_honk_vk_deserialize_verification.hpp),
// opcode 1's PRE_ETA_ARITH (Preamble+Wire) does NOT hash-match the single fingerprint pinned from
// opcode 0's circuit — not an offset error, a content mismatch. This mirrors why VkDeserialize itself
// needed ARITH_OP0/ARITH_OP1 variants: fix_witness dedup (opcode 1 reuses constants opcode 0 already
// committed) propagates from VkDeserialize into Oink's own Preamble/Wire gates, which consume those
// deduped values.
//
// This test measures opcode 1's real PRE_ETA_ARITH fingerprint purely from witnesses — no squeeze
// gates involved:
//   - start = VkDeserialize::validate_vk_deserialize_region(...).region_end (already witness-anchored)
//   - end   = 1 + the last arithmetic gate touched by any PRE_ETA_COMMITMENT_GROUPS (w_l/w_r/w_o)
//             witness from this opcode's own constraint.proof[]
// emitting a dumpable FunctionFingerprint for promotion into rollup_honk_recursion_oink_verification.hpp
// as an OP1-specific constant. Both PRE_ETA_ARITH_OP1 and PREAMBLE_ARITH_OP1 (in that file) were
// measured this way.
//
// KZG's ARITH_TOTAL has the same fix_witness-dedup mismatch for opcode 1 (see
// honk_recursion_kzg_verification.hpp), but inside a ~285K-gate span where a plain nearby-offset scan
// is infeasible. dump_kzg_breakdown below anchors the KZG:W commitment's own proof[] witnesses (offset
// via bb::ProofLength) — this locates where KZG:W is *received* (early in the stage, transcript
// deserialize), not the end of the stage's own batch_mul, so it does NOT resolve KZG's true boundary
// by itself. To get the real gate_count, find_arith_hash_matches replicates
// calculate_hash_arithmetic_block's fix_witness-skip loop incrementally over the whole remaining
// span and records the running hash after every gate, then reports every gate_count whose hash equals
// ARITH_TOTAL.full_hash — one pass (O(n)) instead of re-hashing per candidate length (O(n^2)).

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_output_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_vk_deserialize_verification.hpp"

#include <fstream>
#include <gtest/gtest.h>
#include <memory>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;

namespace {

void dump_oink_pre_eta_breakdown(std::ostream& out,
                                 const acir_format::AcirProgram& program,
                                 size_t opcode_index,
                                 const char* prefix)
{
    const auto& constraint = program.constraints.honk_recursion_constraints[opcode_index];
    auto builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder = *builder_ptr;

    // Exact production order (real replay, zero reimplementation): run all preceding opcodes fully
    // first, so fix_witness dedup matches the real merged circuit exactly.
    for (size_t i = 0; i < opcode_index; ++i) {
        run_root_rollup_honk_recursion_opcode(builder, program.constraints.honk_recursion_constraints[i]);
    }
    run_root_rollup_honk_recursion_opcode(builder, constraint);
    const auto snap_after = recursion_helpers::BlockSnapshot::capture(builder);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto vk_deserialize = RollupHonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        builder, analyzer, constraint, opcode_index);
    ASSERT_TRUE(vk_deserialize.is_valid) << prefix << ": VkDeserialize anchor failed";
    const size_t oink_arith_start = vk_deserialize.region_end;
    const size_t search_hi = snap_after.sizes[BLOCK_IDX_ARITHMETIC];

    const size_t prefix_size = HonkRecursionValidation::Oink::honk_public_input_prefix_size(&constraint);
    size_t pre_eta_end = 0;
    for (size_t group_idx : HonkRecursionValidation::Oink::PRE_ETA_COMMITMENT_GROUPS) {
        auto frs = HonkRecursionValidation::Oink::get_honk_commitment_group_witness_indices(
            constraint.proof, group_idx, prefix_size);
        ASSERT_TRUE(frs.has_value()) << prefix << ": group " << group_idx << " offset out of range";
        for (uint32_t widx : *frs) {
            const uint32_t real = builder.real_variable_index[widx];
            for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
                if (&builder.blocks.get()[blk] == &builder.blocks.arithmetic && gi >= oink_arith_start &&
                    gi < search_hi) {
                    pre_eta_end = std::max(pre_eta_end, gi + 1);
                }
            }
        }
    }
    ASSERT_GT(pre_eta_end, oink_arith_start)
        << prefix << ": wire commitment witnesses not found past the VkDeserialize anchor";

    out << prefix << "\n";
    out << "  oink_arith_start(witness)=" << oink_arith_start
        << " pre_eta_end(witness, last wire-commitment gate + 1)=" << pre_eta_end << "\n";
    emit_fingerprint_line(
        out, builder, BLOCK_IDX_ARITHMETIC, oink_arith_start, pre_eta_end, "  PRE_ETA_ARITH(undershot)");

    // The wire-commitment-witness anchor undershoots the true PRE_ETA/WIRE boundary (some trailing
    // gates after the last direct commitment-witness touch still belong to WIRE, e.g. decomposition
    // finalization on derived witnesses). Disambiguate the exact boundary via a small local scan
    // (not a global squeeze search) for where the already-pinned POST_ETA_ARITH pattern starts.
    bool found_true_end = false;
    for (size_t candidate = pre_eta_end; candidate <= pre_eta_end + 20 && candidate < search_hi; ++candidate) {
        if (recursion_helpers::matches_fingerprint_at(
                builder, builder.blocks.arithmetic, candidate, RollupHonkRecursionValidation::Oink::POST_ETA_ARITH)) {
            out << "  true_pre_eta_end(POST_ETA_ARITH match)=" << candidate << "\n";
            emit_fingerprint_line(
                out, builder, BLOCK_IDX_ARITHMETIC, oink_arith_start, candidate, "  PRE_ETA_ARITH(true)");
            found_true_end = true;
            break;
        }
    }
    if (!found_true_end) {
        out << "  true_pre_eta_end: NOT FOUND within +20 gates of the undershot anchor\n";
    }

    // Locate the PREAMBLE/WIRE split within PRE_ETA: scan near the opcode-0-pinned PREAMBLE_ARITH
    // length for where WIRE_ARITH's pattern starts (small local disambiguation, not a global scan).
    const size_t nominal_preamble_end =
        oink_arith_start + RollupHonkRecursionValidation::Oink::PREAMBLE_ARITH_OP0.gate_count;
    bool found_wire_start = false;
    for (size_t delta = 0; delta <= 5 && !found_wire_start; ++delta) {
        for (int sign : { 0, -1, 1 }) {
            if (sign == 0 && delta != 0) {
                continue;
            }
            const size_t candidate = nominal_preamble_end + static_cast<size_t>(sign) * delta;
            if (candidate < oink_arith_start || candidate >= search_hi) {
                continue;
            }
            if (recursion_helpers::matches_fingerprint_at(
                    builder, builder.blocks.arithmetic, candidate, RollupHonkRecursionValidation::Oink::WIRE_ARITH)) {
                out << "  wire_start(WIRE_ARITH match)=" << candidate
                    << " (preamble_end - oink_arith_start=" << (candidate - oink_arith_start) << ")\n";
                emit_fingerprint_line(
                    out, builder, BLOCK_IDX_ARITHMETIC, oink_arith_start, candidate, "  PREAMBLE_ARITH(true)");
                found_wire_start = true;
                break;
            }
        }
    }
    if (!found_wire_start) {
        out << "  wire_start: NOT FOUND within +-5 gates of the opcode-0-nominal boundary\n";
    }
    out << "\n";
}

// Phase 5: witness-anchored KZG ARITH_TOTAL re-discovery for opcode 1. Same fix_witness-dedup class
// of issue as PRE_ETA_ARITH, just inside KZG's much larger (~285K gate) span, and this one doesn't
// hash-match at ANY of arith_start +- 5 gates (a plain scan is infeasible over a region this size).
// Anchor via the KZG:W commitment's own proof[] witnesses (offset computed purely from
// bb::ProofLength — the same mechanism already used by validate_shplemini_kzg_commitments).
//
// To find the TRUE gate_count (not just start +- 5), replicate calculate_hash_arithmetic_block's
// fix_witness-skipping loop incrementally: one pass over [kzg_start, search_hi) recording the
// running hash after every gate, then scan that recorded array for ARITH_TOTAL.full_hash. This is
// O(n) instead of the O(n^2) a naive "recompute full hash per candidate length" scan would need.
std::vector<size_t> find_arith_hash_matches(Builder& builder, size_t start, size_t max_len, size_t target_hash)
{
    auto& arith = builder.blocks.arithmetic;
    std::vector<size_t> matches;
    size_t hash = 0;
    for (size_t i = 0; i < max_len; ++i) {
        const size_t index = start + i;
        bool skip = false;
        if (recursion_helpers::is_fix_witness_gate(builder, index)) {
            const bb::fr fixed_value = -arith.q_c()[index];
            auto it = builder.constant_variable_indices.find(fixed_value);
            if (it != builder.constant_variable_indices.end() && arith.w_l()[index] == it->second) {
                skip = true;
            }
        }
        if (!skip) {
            sha256_helpers::update_selector_hash(hash, arith, index);
        }
        if (hash == target_hash) {
            matches.push_back(i + 1);
        }
    }
    return matches;
}

// Shared with dump_kzg_gate_diff below: the same additive chain used by validate_rollup_honk_recursion.
size_t compute_kzg_start(Builder& builder,
                         cdg::StaticAnalyzer_<bb::fr, Builder>& analyzer,
                         const acir_format::RecursionConstraint& constraint,
                         size_t opcode_index)
{
    auto vk_deserialize = RollupHonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        builder, analyzer, constraint, opcode_index);
    if (!vk_deserialize.is_valid) {
        return SIZE_MAX;
    }
    const size_t oink_arith_start = vk_deserialize.region_end;
    const size_t preproc_start =
        oink_arith_start + RollupHonkRecursionValidation::Oink::arith_total(opcode_index).gate_count;
    const size_t sumcheck_start = preproc_start + HonkRecursionValidation::PREPROCESSOR_ARITH_GATES;
    const size_t shplemini_start = sumcheck_start + HonkRecursionValidation::SUMCHECK_ARITH_GATES;
    return shplemini_start + HonkRecursionValidation::SHPLEMINI_ARITH_GATES;
}

// Phase 6: gate-by-gate selector diff between opcode 0's and opcode 1's KZG windows, at the same
// relative offset from their respective kzg_start. Needed because batch_mul was confirmed
// fixed-shape (max_num_bits=0 forces a constant 254-round Strauss MSM regardless of scalar value)
// and Shplemini's own output topology was confirmed identical for both opcodes (single fixed
// fingerprint, no OP0/OP1 split needed) — yet find_arith_hash_matches found NO matching gate_count
// anywhere for opcode 1. This locates the exact first gate where selectors diverge, to see whether
// it's a scattered fix_witness dedup (same class as PREAMBLE/PRE_ETA) or genuine structural content.
void dump_kzg_gate_diff(std::ostream& out, const acir_format::AcirProgram& program)
{
    auto builder0_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder0 = *builder0_ptr;
    run_root_rollup_honk_recursion_opcode(builder0, program.constraints.honk_recursion_constraints[0]);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer0(builder0, false);
    const size_t kzg0_start =
        compute_kzg_start(builder0, analyzer0, program.constraints.honk_recursion_constraints[0], 0);
    ASSERT_NE(kzg0_start, SIZE_MAX) << "opcode0 kzg_start anchor failed";

    auto builder1_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder1 = *builder1_ptr;
    run_root_rollup_honk_recursion_opcode(builder1, program.constraints.honk_recursion_constraints[0]);
    run_root_rollup_honk_recursion_opcode(builder1, program.constraints.honk_recursion_constraints[1]);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer1(builder1, false);
    const size_t kzg1_start =
        compute_kzg_start(builder1, analyzer1, program.constraints.honk_recursion_constraints[1], 1);
    ASSERT_NE(kzg1_start, SIZE_MAX) << "opcode1 kzg_start anchor failed";

    auto& arith0 = builder0.blocks.arithmetic;
    auto& arith1 = builder1.blocks.arithmetic;
    const size_t max_len = std::min(arith0.size() - kzg0_start, arith1.size() - kzg1_start);

    out << "KZG gate-by-gate selector diff (op0 vs op1, same relative offset from kzg_start)\n";
    out << "  kzg0_start=" << kzg0_start << " kzg1_start=" << kzg1_start << " max_len=" << max_len << "\n";

    auto selectors_equal = [&](size_t g0, size_t g1) {
        return arith0.q_m()[g0] == arith1.q_m()[g1] && arith0.q_1()[g0] == arith1.q_1()[g1] &&
               arith0.q_2()[g0] == arith1.q_2()[g1] && arith0.q_3()[g0] == arith1.q_3()[g1] &&
               arith0.q_4()[g0] == arith1.q_4()[g1] && arith0.q_c()[g0] == arith1.q_c()[g1] &&
               arith0.gate_selector_for(bb::GateKind::Arith)[g0] == arith1.gate_selector_for(bb::GateKind::Arith)[g1];
    };

    size_t first_diff = SIZE_MAX;
    for (size_t i = 0; i < max_len; ++i) {
        if (!selectors_equal(kzg0_start + i, kzg1_start + i)) {
            first_diff = i;
            break;
        }
    }

    if (first_diff == SIZE_MAX) {
        out << "  no selector diff found in overlapping range [0, " << max_len << ")\n\n";
        return;
    }

    out << "  first_diff at relative offset=" << first_diff << " (op0 gate=" << (kzg0_start + first_diff)
        << ", op1 gate=" << (kzg1_start + first_diff) << ")\n";

    const size_t ctx_lo = first_diff >= 5 ? first_diff - 5 : 0;
    const size_t ctx_hi = std::min(first_diff + 15, max_len);
    for (size_t i = ctx_lo; i < ctx_hi; ++i) {
        const size_t g0 = kzg0_start + i;
        const size_t g1 = kzg1_start + i;
        out << "  [" << i << "] op0: q_m=" << arith0.q_m()[g0] << " q_1=" << arith0.q_1()[g0]
            << " q_2=" << arith0.q_2()[g0] << " q_3=" << arith0.q_3()[g0] << " q_4=" << arith0.q_4()[g0]
            << " q_c=" << arith0.q_c()[g0] << " q_arith=" << arith0.gate_selector_for(bb::GateKind::Arith)[g0]
            << (i == first_diff ? "  <-- DIFF" : "") << "\n";
        out << "  [" << i << "] op1: q_m=" << arith1.q_m()[g1] << " q_1=" << arith1.q_1()[g1]
            << " q_2=" << arith1.q_2()[g1] << " q_3=" << arith1.q_3()[g1] << " q_4=" << arith1.q_4()[g1]
            << " q_c=" << arith1.q_c()[g1] << " q_arith=" << arith1.gate_selector_for(bb::GateKind::Arith)[g1]
            << (i == first_diff ? "  <-- DIFF" : "") << "\n";
    }

    // Full resync scan: greedily assume every mismatch is a single extra gate in op0's stream
    // (skip op0 only, keep op1 in place) and see whether the two streams re-align for the rest of
    // op0's known-good 285573-gate stage. If they do, op1's true content-equivalent gate_count is
    // wherever op1's pointer lands once op0's pointer reaches its own known-good end.
    const size_t op0_full_len = HonkRecursionValidation::KZG::ARITH_TOTAL_OP0.gate_count;
    size_t i0 = 0;
    size_t i1 = 0;
    std::vector<size_t> gap_positions;
    while (i0 < op0_full_len && i0 < max_len && i1 < max_len) {
        if (selectors_equal(kzg0_start + i0, kzg1_start + i1)) {
            ++i0;
            ++i1;
        } else {
            gap_positions.push_back(i0);
            ++i0;
        }
    }

    out << "  resync: op0_full_len=" << op0_full_len << " reached i0=" << i0 << " i1=" << i1
        << " total_gaps=" << gap_positions.size() << "\n";
    out << "  gap positions (op0-relative):";
    for (size_t p : gap_positions) {
        out << " " << p;
    }
    out << "\n";

    if (i0 == op0_full_len) {
        out << "  op1 true gate_count(raw, content-equivalent)=" << i1 << "\n";
        emit_fingerprint_line(
            out, builder1, BLOCK_IDX_ARITHMETIC, kzg1_start, kzg1_start + i1, "  KZG_ARITH_OP1(true)");
    } else {
        out << "  DID NOT reach op0_full_len cleanly - resync failed, needs manual inspection\n";
    }
    out << "\n";
}

void dump_kzg_breakdown(std::ostream& out,
                        const acir_format::AcirProgram& program,
                        size_t opcode_index,
                        const char* prefix)
{
    const auto& constraint = program.constraints.honk_recursion_constraints[opcode_index];
    auto builder_ptr = std::make_unique<Builder>(program.witness, program.constraints.public_inputs, false);
    Builder& builder = *builder_ptr;

    for (size_t i = 0; i < opcode_index; ++i) {
        run_root_rollup_honk_recursion_opcode(builder, program.constraints.honk_recursion_constraints[i]);
    }
    run_root_rollup_honk_recursion_opcode(builder, constraint);
    const auto snap_after = recursion_helpers::BlockSnapshot::capture(builder);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(builder, false);

    auto vk_deserialize = RollupHonkRecursionValidation::VkDeserialize::validate_vk_deserialize_region<bb::fr>(
        builder, analyzer, constraint, opcode_index);
    ASSERT_TRUE(vk_deserialize.is_valid) << prefix << ": VkDeserialize anchor failed";
    const size_t oink_arith_start = vk_deserialize.region_end;
    const size_t search_hi = snap_after.sizes[BLOCK_IDX_ARITHMETIC];

    // Same additive chain as validate_rollup_honk_recursion_cursor_from (cursor Oink totals).
    const size_t preproc_start =
        oink_arith_start + RollupHonkRecursionValidation::Oink::arith_total(opcode_index).gate_count;
    const size_t sumcheck_start = preproc_start + HonkRecursionValidation::PREPROCESSOR_ARITH_GATES;
    const size_t shplemini_start = sumcheck_start + HonkRecursionValidation::SUMCHECK_ARITH_GATES;
    const size_t kzg_start = shplemini_start + HonkRecursionValidation::SHPLEMINI_ARITH_GATES;

    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);
    using Codec = bb::ProofLength::CodecConstants<RecursiveFlavor>;
    const size_t prefix_size = HonkRecursionValidation::Oink::honk_public_input_prefix_size(&constraint);
    const size_t oink_len = bb::ProofLength::Oink<RecursiveFlavor>::LENGTH_WITHOUT_PUB_INPUTS;
    const size_t sumcheck_len = bb::ProofLength::Sumcheck<RecursiveFlavor>::LENGTH(log_n);
    const size_t shplemini_proof_start = prefix_size + oink_len + sumcheck_len;
    const size_t num_folds = log_n - 1;
    const size_t gemini_eval_len = log_n * Codec::num_frs_in_scalar;
    const size_t shplonk_q_offset = shplemini_proof_start + num_folds * Codec::num_frs_in_comm + gemini_eval_len;
    const size_t kzg_w_offset = shplonk_q_offset + Codec::num_frs_in_comm;

    ASSERT_LE(kzg_w_offset + recursion_helpers::FRS_PER_COMMITMENT, constraint.proof.size())
        << prefix << ": kzg_w_offset out of range";

    size_t kzg_w_last_gate = 0;
    for (size_t i = 0; i < recursion_helpers::FRS_PER_COMMITMENT; ++i) {
        const uint32_t widx = constraint.proof[kzg_w_offset + i];
        const uint32_t real = builder.real_variable_index[widx];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            if (&builder.blocks.get()[blk] == &builder.blocks.arithmetic && gi >= kzg_start && gi < search_hi) {
                kzg_w_last_gate = std::max(kzg_w_last_gate, gi + 1);
            }
        }
    }
    ASSERT_GT(kzg_w_last_gate, kzg_start) << prefix << ": KZG:W witnesses not found past kzg_start";

    out << prefix << "\n";
    out << "  kzg_start(derived)=" << kzg_start << " kzg_w_offset=" << kzg_w_offset
        << " kzg_w_last_gate+1(witness, undershot)=" << kzg_w_last_gate << "\n";
    emit_fingerprint_line(out, builder, BLOCK_IDX_ARITHMETIC, kzg_start, kzg_w_last_gate, "  KZG_ARITH(undershot)");
    out << "  search_hi(end of this opcode's gate construction)=" << search_hi << "\n";
    emit_fingerprint_line(out, builder, BLOCK_IDX_ARITHMETIC, kzg_start, search_hi, "  KZG_ARITH(to end of opcode)");

    // Cursor-promote window: Honk KZG ARITH_TOTAL.gate_count at the derived start (and end-minus-Output).
    const size_t honk_kzg_len = HonkRecursionValidation::KZG::ARITH_TOTAL.gate_count;
    const size_t rollup_output_len = RollupHonkRecursionValidation::Output::ARITH_TOTAL.gate_count;
    if (kzg_start + honk_kzg_len <= search_hi) {
        emit_fingerprint_line(
            out, builder, BLOCK_IDX_ARITHMETIC, kzg_start, kzg_start + honk_kzg_len, "  KZG_ARITH(honk_gate_count)");
    }
    if (search_hi >= rollup_output_len && search_hi - rollup_output_len >= kzg_start) {
        const size_t kzg_end_via_output = search_hi - rollup_output_len;
        emit_fingerprint_line(
            out, builder, BLOCK_IDX_ARITHMETIC, kzg_start, kzg_end_via_output, "  KZG_ARITH(before_output)");
        dump_fingerprint_constexpr_line(
            out,
            std::string(prefix) + "_KZG_ARITH",
            compute_block_fingerprint(builder, BLOCK_IDX_ARITHMETIC, kzg_start, kzg_end_via_output));
    }

    const size_t max_len = search_hi - kzg_start;
    const size_t target_hash = HonkRecursionValidation::KZG::arith_total(opcode_index).full_hash;
    const auto matches = find_arith_hash_matches(builder, kzg_start, max_len, target_hash);
    out << "  ARITH_TOTAL.full_hash(0x" << std::hex << target_hash << std::dec << ") matches at gate_count =";
    if (matches.empty()) {
        out << " NONE";
    } else {
        for (size_t len : matches) {
            out << " " << len;
        }
    }
    out << "\n";
    out << "\n";
}

} // namespace

class RootRollupOpcodeOinkFingerprintAnalysisTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RootRollupOpcodeOinkFingerprintAnalysisTests, RootRollupOpcodeOinkFingerprintAnalysis)
{
    const auto program = make_root_rollup_acir_program_from_two_rollups(0, /*use_valid_proof=*/true);
    ASSERT_EQ(program.constraints.honk_recursion_constraints.size(), 2U);

    std::ofstream out("root_rollup_honk_oink_fingerprint_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open root_rollup_honk_oink_fingerprint_analysis.txt";

    out << "# ROOT_ROLLUP_HONK Oink PRE_ETA_ARITH: witness-anchored re-discovery per opcode\n"
        << "# start = VkDeserialize region_end (constraint.key[] anchored)\n"
        << "# end   = 1 + last arith gate touched by PRE_ETA_COMMITMENT_GROUPS (w_l/w_r/w_o) witnesses\n\n";

    dump_oink_pre_eta_breakdown(out, program, 0, "RootOpcode0");
    dump_oink_pre_eta_breakdown(out, program, 1, "RootOpcode1");

    out << "# KZG ARITH_TOTAL re-discovery\n\n";
    dump_kzg_breakdown(out, program, 0, "RootOpcode0");
    dump_kzg_breakdown(out, program, 1, "RootOpcode1");

    out << "# KZG gate-by-gate diff\n\n";
    dump_kzg_gate_diff(out, program);

    out.flush();
    SUCCEED();
}
