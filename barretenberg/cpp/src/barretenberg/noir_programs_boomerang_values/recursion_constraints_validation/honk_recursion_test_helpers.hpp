#pragma once

#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/kzg/kzg.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/flavor_concepts.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/verifier_commitments.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

#include <array>
#include <fstream>
#include <gtest/gtest.h>
#include <numeric>
#include <ostream>
#include <vector>

namespace honk_recursion_test_helpers {

using Builder = bb::UltraCircuitBuilder;
using RecursiveFlavor = bb::UltraRecursiveFlavor_<Builder>;
using Curve = RecursiveFlavor::Curve;
using FF = RecursiveFlavor::FF;
using Shplemini = bb::ShpleminiVerifier_<Curve, RecursiveFlavor::HasZK>;
using ClaimBatcher = bb::ClaimBatcher_<Curve>;
using Transcript = RecursiveFlavor::Transcript;
using VerifierInst = bb::VerifierInstance_<RecursiveFlavor>;

// pub_inputs=0, lookup=1, arithmetic=2, delta_range=3, elliptic=4,
// memory=5, nnf=6, poseidon2_ext=7, poseidon2_int=8.
constexpr size_t BLOCK_IDX_ARITHMETIC = 2;
constexpr size_t BLOCK_IDX_ELLIPTIC = 4;
constexpr size_t BLOCK_IDX_MEMORY = 5;
constexpr size_t BLOCK_IDX_NNF = 6;
constexpr size_t BLOCK_IDX_POSEIDON2_EXT = 7;
constexpr size_t BLOCK_IDX_POSEIDON2_INT = 8;

inline const char* block_kind_name(size_t block_index)
{
    switch (block_index) {
    case BLOCK_IDX_ARITHMETIC:
        return "arithmetic";
    case BLOCK_IDX_ELLIPTIC:
        return "elliptic";
    case BLOCK_IDX_MEMORY:
        return "memory";
    case BLOCK_IDX_NNF:
        return "nnf";
    case BLOCK_IDX_POSEIDON2_EXT:
        return "poseidon2_ext";
    case BLOCK_IDX_POSEIDON2_INT:
        return "poseidon2_int";
    default:
        return "unknown";
    }
}

inline recursion_helpers::FunctionFingerprint compute_block_fingerprint(Builder& builder,
                                                                        size_t block_idx,
                                                                        size_t start,
                                                                        size_t end)
{
    const size_t gate_count = end - start;
    const size_t fingerprint_size = std::min(recursion_helpers::SCANNER_FINGERPRINT_SIZE, gate_count);
    auto& block = builder.blocks.get()[block_idx];

    size_t prefix_hash = 0;
    size_t full_hash = 0;

    if (block_idx == BLOCK_IDX_ARITHMETIC) {
        prefix_hash = recursion_helpers::calculate_hash_arithmetic_block(builder, start, start + fingerprint_size);
        full_hash = recursion_helpers::calculate_hash_arithmetic_block(builder, start, end);
    } else {
        if (fingerprint_size > 0) {
            prefix_hash = sha256_helpers::compute_selector_hash(0, block, start, start + fingerprint_size - 1);
        }
        if (gate_count > 0) {
            full_hash = sha256_helpers::compute_selector_hash(0, block, start, end - 1);
        }
    }

    return { gate_count, prefix_hash, full_hash, fingerprint_size };
}

inline void dump_step_fingerprints(std::ostream& out,
                                   Builder& builder,
                                   const recursion_helpers::BlockSnapshot& before,
                                   const recursion_helpers::BlockSnapshot& after,
                                   const char* step_name)
{
    auto deltas = recursion_helpers::compute_block_deltas(before, after);
    out << step_name << "\n";
    for (const auto& d : deltas) {
        const size_t start = before.sizes[d.block_index];
        const size_t end = start + d.delta;
        auto fp = compute_block_fingerprint(builder, d.block_index, start, end);
        out << "  block[" << d.block_index << "] " << block_kind_name(d.block_index) << " gates=" << fp.gate_count
            << " fingerprint20=0x" << std::hex << fp.prefix_hash << " full_hash=0x" << fp.full_hash << std::dec << "\n";
    }
    if (deltas.empty()) {
        out << "  (no new gates)\n";
    }
}

inline void emit_fingerprint_line(
    std::ostream& out, Builder& builder, size_t block_idx, size_t start, size_t end, const char* label)
{
    const size_t gate_count = end - start;
    if (gate_count == 0) {
        out << label << " EMPTY\n";
        return;
    }
    auto fp = compute_block_fingerprint(builder, block_idx, start, end);
    out << label << " gates=" << gate_count << " prefix20=0x" << std::hex << fp.prefix_hash << " full=0x"
        << fp.full_hash << std::dec << "\n";
}

inline void expect_fingerprint_matches(Builder& builder,
                                       size_t block_idx,
                                       size_t start,
                                       size_t end,
                                       const recursion_helpers::FunctionFingerprint& fp,
                                       const char* label)
{
    const size_t gate_count = end - start;
    ASSERT_EQ(gate_count, fp.gate_count) << label << " gate_count mismatch";
    auto& block = builder.blocks.get()[block_idx];
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(builder, block, start, fp))
        << label << " fingerprint mismatch";
}

// Mirrors ultra_honk/ultra_verifier.cpp's UltraVerifier_<Flavor, IO>::reduce_to_pairing_check line-for-line,
// parameterized on Flavor so both plain-HONK (UltraRecursiveFlavor_) and HONK_ZK (UltraZKRecursiveFlavor_)
// share one mirror instead of maintaining independent copies that can silently drift apart. Flavor defaults
// to the ambient non-ZK RecursiveFlavor so existing HONK/ROLLUP_HONK call sites are unaffected.

template <typename Flavor = RecursiveFlavor, typename VC> void run_oink_step(VC& vc)
{
    bb::OinkVerifier<Flavor> oink{ vc.verifier_instance, vc.transcript, vc.num_public_inputs };
    oink.verify();
}

// ultra_verifier.cpp UltraVerifier_::compute_log_n(): USE_PADDING flavors run the full virtual log_n
// (padding lives entirely in the sumcheck/shplemini round counts now, not in a separate indicator array);
// non-padding flavors use the VK's actual log_circuit_size.
template <typename Flavor = RecursiveFlavor, typename VC> size_t compute_log_n(VC& vc)
{
    if constexpr (Flavor::USE_PADDING) {
        return static_cast<size_t>(Flavor::VIRTUAL_LOG_N);
    } else {
        return static_cast<size_t>(vc.verifier_instance->get_vk()->log_circuit_size);
    }
}

template <typename Flavor = RecursiveFlavor, typename VC> void run_gate_challenges_step(VC& vc)
{
    vc.verifier_instance->gate_challenges =
        vc.transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", vc.log_n);
}

template <typename Flavor = RecursiveFlavor, typename VC> bb::SumcheckOutput<Flavor> run_sumcheck_step(VC& vc)
{
    bb::SumcheckVerifier<Flavor> sumcheck(vc.transcript, vc.verifier_instance->alpha, vc.log_n);
    return sumcheck.verify(vc.verifier_instance->relation_parameters, vc.verifier_instance->gate_challenges);
}

template <typename Flavor = RecursiveFlavor, typename VC>
bb::ShpleminiVerifierOutput_<Curve, Flavor::HasZK> run_shplemini_step(VC& vc,
                                                                      bb::SumcheckOutput<Flavor>& sumcheck_output)
{
    using ShpleminiF = bb::ShpleminiVerifier_<Curve, Flavor::HasZK, bb::flavor_entities_have_gemini_masking<Flavor>()>;
    auto commitments =
        bb::VerifierCommitmentsConstructor<Flavor>::construct(vc.verifier_instance->get_vk(),
                                                              vc.verifier_instance->witness_commitments,
                                                              vc.verifier_instance->gemini_masking_commitment);

    using ClaimBatch = typename ClaimBatcher::Batch;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    auto one_commitment = Flavor::Commitment::one(&vc.builder());
    std::array<typename Flavor::Commitment, bb::NUM_SMALL_IPA_COMMITMENTS> libra_commitments{};
    return ShpleminiF::compute_batch_opening_claim(claim_batcher,
                                                   sumcheck_output.challenge,
                                                   one_commitment,
                                                   vc.transcript,
                                                   Flavor::REPEATED_COMMITMENTS,
                                                   libra_commitments,
                                                   sumcheck_output.claimed_libra_evaluation);
}

template <typename Flavor = RecursiveFlavor, typename VC>
typename bb::KZG<Curve>::PairingPointsType run_kzg_step(
    VC& vc, bb::ShpleminiVerifierOutput_<Curve, Flavor::HasZK>& shplemini_output)
{
    using KZG = bb::KZG<Curve>;
    return KZG::reduce_verify_batch_opening_claim(
        std::move(shplemini_output.batch_opening_claim), vc.transcript, Flavor::FINAL_PCS_MSM_SIZE(vc.log_n));
}

// Mirrors ultra_honk/ultra_verifier.cpp UltraVerifier_::verify_proof Step 3: reconstruct the IO's own
// pairing-point accumulator from the (inner) proof's public inputs, then fold the freshly-reduced KZG
// pairing points into it. Final core stage of the baseline HONK pipeline (HONK:Output:reconstruct_from_public
// + HONK:Output:pairing_points_aggregate in honk_recursion_plan.md) — must run for the circuit to match
// acir_format::create_honk_recursion_constraints.
template <typename IOType, typename VC>
typename bb::KZG<Curve>::PairingPointsType run_output_step(
    VC& vc, typename bb::KZG<Curve>::PairingPointsType& pcs_pairing_points)
{
    IOType inputs;
    inputs.reconstruct_from_public(vc.verifier_instance->public_inputs);
    auto pi_pairing_points = inputs.pairing_inputs;
    pi_pairing_points.aggregate(pcs_pairing_points);
    return pi_pairing_points;
}

template <typename IOType, typename Flavor = RecursiveFlavor, typename VC> void build_full_honk_circuit(VC& vc)
{
    run_oink_step<Flavor>(vc);
    run_gate_challenges_step<Flavor>(vc);
    auto sc = run_sumcheck_step<Flavor>(vc);
    auto shp = run_shplemini_step<Flavor>(vc, sc);
    auto pcs_pairing_points = run_kzg_step<Flavor>(vc, shp);
    run_output_step<IOType>(vc, pcs_pairing_points);
}

inline const std::array<std::pair<size_t, const char*>, 6> IPA_ANALYSIS_BLOCKS = { {
    { BLOCK_IDX_ARITHMETIC, "arithmetic" },
    { BLOCK_IDX_ELLIPTIC, "elliptic" },
    { BLOCK_IDX_MEMORY, "memory" },
    { BLOCK_IDX_NNF, "nnf" },
    { BLOCK_IDX_POSEIDON2_EXT, "poseidon2_ext" },
    { BLOCK_IDX_POSEIDON2_INT, "poseidon2_int" },
} };

inline size_t snapshot_size_at(const recursion_helpers::BlockSnapshot& snapshot, size_t idx)
{
    return idx < snapshot.sizes.size() ? snapshot.sizes[idx] : 0;
}

inline void dump_fp_line(std::ostream& out,
                         size_t block_idx,
                         const char* block_name,
                         const recursion_helpers::FunctionFingerprint& fp)
{
    if (fp.gate_count == 0) {
        return;
    }
    out << "  block[" << block_idx << "] " << block_name << " gates=" << fp.gate_count << " fingerprint20=0x"
        << std::hex << fp.prefix_hash << " full_hash=0x" << fp.full_hash << std::dec << "\n";
}

inline void dump_total_block_counts(std::ostream& out,
                                    const recursion_helpers::BlockSnapshot& snapshot,
                                    const char* label,
                                    bool include_zero_blocks = true)
{
    out << label << "\n";
    for (const auto& [block_idx, block_name] : IPA_ANALYSIS_BLOCKS) {
        const size_t total = snapshot_size_at(snapshot, block_idx);
        if (!include_zero_blocks && total == 0) {
            continue;
        }
        out << "  block[" << block_idx << "] " << block_name << " total=" << total << "\n";
    }
}

inline void dump_opcode_gate_counts(std::ostream& out, const std::vector<size_t>& gates_per_opcode, const char* label)
{
    out << label << "\n";
    for (size_t i = 0; i < gates_per_opcode.size(); ++i) {
        out << "  opcode[" << i << "] gates=" << gates_per_opcode[i] << "\n";
    }
}

inline void dump_analysis_header(
    std::ostream& out, const char* title, const char* io_label, size_t log_n, const char* extra_lines = nullptr)
{
    out << "# " << title << "\n";
    out << "# Flavor: UltraRecursiveFlavor_<UltraCircuitBuilder>\n";
    out << "# IO: " << io_label << "\n";
    out << "# Predicate: constant true\n";
    out << "# HasZK: false\n";
    out << "# log_n: " << log_n << "\n";
    if (extra_lines != nullptr) {
        out << extra_lines;
    }
    out << "\n";
}

inline void dump_squeeze_chain_summary(std::ostream& out, Builder& builder)
{
    const auto all_squeezes = recursion_helpers::find_all_transcript_squeeze_gates(builder);
    out << "Squeeze chain (" << all_squeezes.size() << " total):\n";
    for (size_t i = 0; i < all_squeezes.size(); ++i) {
        out << "  [" << i << "] arith_gate=" << all_squeezes[i] << "\n";
    }
}

inline void dump_nonempty_block_totals(std::ostream& out, Builder& builder)
{
    out << "\nTotal gate counts per block:\n";
    auto blocks = builder.blocks.get();
    for (size_t b = 0; b < blocks.size(); ++b) {
        if (blocks[b].size() > 0) {
            out << "  block[" << b << "] " << block_kind_name(b) << " total=" << blocks[b].size() << "\n";
        }
    }
}

} // namespace honk_recursion_test_helpers
