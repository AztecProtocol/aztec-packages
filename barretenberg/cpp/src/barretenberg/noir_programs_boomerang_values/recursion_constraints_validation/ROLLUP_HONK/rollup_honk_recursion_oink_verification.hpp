#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_oink_verification.hpp"
#include <algorithm>
#include <cstddef>
#include <set>
#include <vector>

namespace RollupHonkRecursionValidation::Oink {

// PREAMBLE_ARITH differs by exactly 1 gate between opcode 0 and opcode 1 of the ROOT_ROLLUP_HONK
// merge: opcode 1's vk_hash recompute reuses a constant already fix_witness'd by opcode 0, skipping
// one comparison gate. Everything downstream (WIRE_ARITH etc.) is unaffected — same content, just
// shifted by that 1 gate, since arith_cursor is purely additive. Selected via opcode_index in
// validate_oink; see rollup_honk_root_opcode_oink_fingerprint_analysis.test.cpp for how this was
// measured (witness-anchored, no squeeze gates).
static constexpr recursion_helpers::FunctionFingerprint PREAMBLE_ARITH_OP0 = {
    460, 0xd58497aa29176bc3ULL, 0xd5cc92f02888f004ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PREAMBLE_ARITH_OP1 = {
    459, 0xd58497aa29176bc3ULL, 0xd5cc92f02888f004ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
inline const recursion_helpers::FunctionFingerprint& preamble_arith(size_t opcode_index)
{
    return opcode_index == 0 ? PREAMBLE_ARITH_OP0 : PREAMBLE_ARITH_OP1;
}
static constexpr recursion_helpers::FunctionFingerprint PREAMBLE_POSEIDON2_EXT = {
    390, 0x0ec92a899925d755ULL, 0x73bc93eeb5bfe795ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PREAMBLE_POSEIDON2_INT = {
    2223, 0xee3a7ac895f8a6d9ULL, 0x829e1f8bcde79ca0ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint WIRE_ARITH = {
    237, 0xb44f41ca2be07184ULL, 0xd71a00034d722fedULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint WIRE_NNF = {
    186, 0xff2ca3c0bde9b337ULL, 0x43111ffd5f9f58f4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint ETA_SORTED_ARITH = {
    337, 0xdbb109faabd849abULL, 0x6f3cd07c8fa130f5ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ETA_SORTED_NNF = {
    186, 0xff2ca3c0bde9b337ULL, 0x43111ffd5f9f58f4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ETA_SORTED_POSEIDON2_EXT = {
    90, 0x0ec92a899925d755ULL, 0xcf63161f3d7a1171ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ETA_SORTED_POSEIDON2_INT = {
    513, 0xee3a7ac895f8a6d9ULL, 0x213a857237d4d229ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint BETA_LOOKUP_ARITH = {
    141, 0x7abc963e79e4a095ULL, 0x737eb32d6008d762ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BETA_LOOKUP_NNF = {
    62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BETA_LOOKUP_POSEIDON2_EXT = {
    50, 0x0ec92a899925d755ULL, 0x59b14b4f5ee98d5fULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint BETA_LOOKUP_POSEIDON2_INT = {
    285, 0xee3a7ac895f8a6d9ULL, 0x2eb636e3067907baULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint PUBLIC_INPUT_DELTA_ARITH = {
    86, 0x30143336bb302b53ULL, 0x028e9a8926480972ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint Z_PERM_ARITH = {
    79, 0xb44f41ca2be07184ULL, 0x7e14d02952bda35aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint Z_PERM_NNF = {
    62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr recursion_helpers::FunctionFingerprint ALPHA_ARITH = {
    44, 0x9c9fc49459e7a252ULL, 0xc681a50f47726eeaULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ALPHA_POSEIDON2_EXT = {
    30, 0x0ec92a899925d755ULL, 0xbbafb1fec1376801ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ALPHA_POSEIDON2_INT = {
    171, 0xee3a7ac895f8a6d9ULL, 0x9c7752d639713580ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

// Same 1-gate PREAMBLE_ARITH difference propagates into the outer PRE_ETA_ARITH span (777 vs 776);
// full_hash is identical because calculate_hash_arithmetic_block normalizes fix_witness constant
// gates. See preamble_arith() above.
static constexpr recursion_helpers::FunctionFingerprint PRE_ETA_ARITH_OP0 = {
    777, 0xd58497aa29176bc3ULL, 0x64b67110443c092fULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint PRE_ETA_ARITH_OP1 = {
    776, 0xd58497aa29176bc3ULL, 0x64b67110443c092fULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
inline const recursion_helpers::FunctionFingerprint& pre_eta_arith(size_t opcode_index)
{
    return opcode_index == 0 ? PRE_ETA_ARITH_OP0 : PRE_ETA_ARITH_OP1;
}
static constexpr recursion_helpers::FunctionFingerprint POST_ETA_ARITH = {
    299, 0x773d8fe2d9499a22ULL, 0x2c4b44781a22effbULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POST_BETA_GAMMA_ARITH = {
    290, 0x773d8fe2d9499a22ULL, 0x65b86bf1a3272fc9ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr size_t SETUP_NNF_GATE_COUNT = HonkRecursionValidation::Oink::SETUP_NNF_GATE_COUNT;
static constexpr size_t NON_PREAMBLE_ARITH_GATES = WIRE_ARITH.gate_count + ETA_SORTED_ARITH.gate_count +
                                                   BETA_LOOKUP_ARITH.gate_count + PUBLIC_INPUT_DELTA_ARITH.gate_count +
                                                   Z_PERM_ARITH.gate_count + ALPHA_ARITH.gate_count;
// Total Oink arith span (PRE_ETA + POST_ETA + POST_BETA_GAMMA). Depends on opcode_index only through
// preamble_arith() — see its comment for why.
inline size_t arith_gates(size_t opcode_index)
{
    return preamble_arith(opcode_index).gate_count + NON_PREAMBLE_ARITH_GATES;
}
static constexpr size_t NNF_GATES =
    WIRE_NNF.gate_count + ETA_SORTED_NNF.gate_count + BETA_LOOKUP_NNF.gate_count + Z_PERM_NNF.gate_count;
static constexpr size_t POSEIDON2_EXT_GATES = PREAMBLE_POSEIDON2_EXT.gate_count + ETA_SORTED_POSEIDON2_EXT.gate_count +
                                              BETA_LOOKUP_POSEIDON2_EXT.gate_count + ALPHA_POSEIDON2_EXT.gate_count;
static constexpr size_t POSEIDON2_INT_GATES = PREAMBLE_POSEIDON2_INT.gate_count + ETA_SORTED_POSEIDON2_INT.gate_count +
                                              BETA_LOOKUP_POSEIDON2_INT.gate_count + ALPHA_POSEIDON2_INT.gate_count;

struct RollupOinkValidationResult {
    HonkRecursionValidation::Oink::OinkValidationResult base;
    bool preamble_ok = false;
    bool receive_public_inputs_ok = false;
    bool wire_ok = false;
    bool eta_sorted_ok = false;
    bool beta_lookup_ok = false;
    bool public_input_delta_ok = false;
    bool z_perm_ok = false;
    bool alpha_ok = false;
    bool num_pub_inputs_ok = false;
    bool public_input_delta_value_ok = false;
};

/**
 * @brief Validate the VK's num_public_inputs (constraint.key[1]) against the verified circuit's
 * expected public input count, and confirm it is copy-constrained into the preamble arithmetic gate.
 *
 * Unlike recursion_helpers::validate_num_pub_assertion (which assumes a MegaZK hiding-kernel VK,
 * expected = constraint.public_inputs.size() + HIDING_KERNEL_PUBLIC_INPUTS_SIZE), the VK verified
 * here belongs to a ROLLUP_HONK circuit, whose public input count is always bb::ROLLUP_PUBLIC_INPUTS_SIZE
 * (pairing points + IPA claim) — constraint.public_inputs is unrelated (ACIR-level, empty for root rollup).
 */
template <typename FF, typename CircuitBuilder>
bool validate_rollup_num_public_inputs(CircuitBuilder& builder,
                                       cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                       const acir_format::RecursionConstraint& constraint)
{
    if (constraint.key.size() < 2) {
        return false;
    }
    const uint32_t num_pub_idx = constraint.key[1];
    if (builder.get_variable(num_pub_idx) != FF(bb::ROLLUP_PUBLIC_INPUTS_SIZE)) {
        return false;
    }

    const uint32_t num_pub_real = builder.real_variable_index[num_pub_idx];
    auto& arith = builder.blocks.arithmetic;
    for (const auto& [blk, gi] : analyzer.get_variable_gates(num_pub_real)) {
        if (&builder.blocks.get()[blk] == &arith) {
            return true;
        }
    }
    return false;
}

template <typename CircuitBuilder>
bool matches(CircuitBuilder& builder, auto& block, size_t start, const recursion_helpers::FunctionFingerprint& fp)
{
    return recursion_helpers::matches_fingerprint_at(builder, block, start, fp);
}

/**
 * @brief Check whether real_idx participates in any gate of a given block within [window_lo, window_hi).
 */
template <typename FF, typename CircuitBuilder, typename Block>
bool participates_in_block_window(CircuitBuilder& builder,
                                  cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                  uint32_t real_idx,
                                  Block& block,
                                  size_t window_lo,
                                  size_t window_hi)
{
    for (const auto& [blk, gi] : analyzer.get_variable_gates(real_idx)) {
        if (&builder.blocks.get()[blk] == &block && gi >= window_lo && gi < window_hi) {
            return true;
        }
    }
    return false;
}

/**
 * @brief ROLLUP_HONK-local copy of recursion_helpers::find_and_validate_public_input_delta, scoped to
 * a known gate window instead of scanning the whole arithmetic block, with a fallback for the
 * empty-public-inputs case where no division gate exists at all.
 *
 * bb::compute_public_input_delta returns numerator/denominator, but when public_input_reals is empty
 * (true for every ROOT_ROLLUP_HONK opcode) the loop body that reassigns numerator/denominator from
 * numerator_acc/denominator_acc never runs — numerator and denominator stay the compile-time constant
 * FF(1), so field_t division of two constants is constant-folded and NEVER EMITS A GATE. There is no
 * "delta witness" to find in that case. pub_inputs_offset is still genuinely used though: computing
 * numerator_acc/denominator_acc (dead-end values, discarded before the loop that never runs) still
 * requires real gates since beta/gamma/offset are witnesses — so falling back to a plain
 * gate-participation check on pub_inputs_offset_real is the correct (and only possible) anchor here.
 *
 * When public_input_reals is non-empty, the division gate genuinely exists — search for it, scoped to
 * the known PUBLIC_INPUT_DELTA_ARITH window (unscoped, this collides: for the empty case delta=1, a
 * value common enough elsewhere in a 300k+ gate merged circuit that a whole-block scan is ambiguous).
 */
template <typename FF, typename CircuitBuilder>
bool validate_public_input_delta_binding(CircuitBuilder& builder,
                                         cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                         uint32_t beta_real,
                                         uint32_t gamma_real,
                                         uint32_t pub_inputs_offset_real,
                                         const std::vector<uint32_t>& public_input_reals,
                                         size_t window_lo,
                                         size_t window_hi)
{
    if (beta_real == UINT32_MAX || gamma_real == UINT32_MAX || pub_inputs_offset_real == UINT32_MAX) {
        return false;
    }

    auto& arith = builder.blocks.arithmetic;

    if (public_input_reals.empty()) {
        return participates_in_block_window<FF>(builder, analyzer, pub_inputs_offset_real, arith, window_lo, window_hi);
    }

    const FF beta_val = builder.get_variable(beta_real);
    const FF gamma_val = builder.get_variable(gamma_real);
    const FF offset_val = builder.get_variable(pub_inputs_offset_real);

    std::vector<FF> pub_input_values;
    pub_input_values.reserve(public_input_reals.size());
    for (uint32_t r : public_input_reals) {
        pub_input_values.push_back(builder.get_variable(r));
    }

    // Flavor param only selects FF — the math has no flavor-specific branching (grand_product_delta.hpp).
    const FF expected_delta =
        bb::compute_public_input_delta<bb::MegaFlavor>(pub_input_values, beta_val, gamma_val, offset_val);

    uint32_t found = UINT32_MAX;
    size_t match_count = 0;
    const size_t hi = std::min(window_hi, arith.size());
    for (size_t g = window_lo; g < hi; g++) {
        if (arith.q_m()[g] != FF::one() || arith.gate_selector_for(bb::GateKind::Arith)[g] != FF::one() ||
            arith.q_3()[g] != FF::neg_one()) {
            continue;
        }
        if (!arith.q_1()[g].is_zero() || !arith.q_2()[g].is_zero() || !arith.q_4()[g].is_zero() ||
            !arith.q_c()[g].is_zero()) {
            continue;
        }
        const uint32_t wl_real = builder.real_variable_index[arith.w_l()[g]];
        if (builder.get_variable(wl_real) == expected_delta) {
            found = wl_real;
            match_count++;
            if (match_count > 1) {
                return false;
            }
        }
    }
    return found != UINT32_MAX;
}

template <typename FF, typename CircuitBuilder>
RollupOinkValidationResult validate_oink(CircuitBuilder& builder,
                                         cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                         size_t arith_start,
                                         const std::vector<size_t>& all_squeezes,
                                         std::set<size_t>& consumed,
                                         const acir_format::RecursionConstraint& constraint,
                                         const std::vector<uint32_t>& proof_witnesses,
                                         size_t opcode_index = 0)
{
    const auto& preamble_fp = preamble_arith(opcode_index);
    const auto& pre_eta_fp = pre_eta_arith(opcode_index);
    RollupOinkValidationResult result;
    auto& base = result.base;

    auto oink_chal = recursion_helpers::oink_challenges(builder, all_squeezes, consumed);
    base.squeeze_count_ok = oink_chal.valid;
    if (!base.squeeze_count_ok) {
        return result;
    }
    std::vector<size_t> sq(oink_chal.squeeze_gate_indices.begin(), oink_chal.squeeze_gate_indices.end());
    std::sort(sq.begin(), sq.end());
    if (sq.size() != HonkRecursionValidation::Oink::NUM_OINK_SQUEEZES) {
        return result;
    }
    const size_t eta = sq[0];
    const size_t beta_gamma = sq[1];
    consumed.insert(oink_chal.squeeze_gate_indices.begin(), oink_chal.squeeze_gate_indices.end());

    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& p2ext = poseidon2_helpers::poseidon2_external_block(builder);
    auto& p2int = poseidon2_helpers::poseidon2_internal_block(builder);

    size_t arith_cursor = arith_start;
    size_t nnf_cursor = SETUP_NNF_GATE_COUNT;
    size_t ext_cursor = 0;
    size_t int_cursor = 0;

    result.preamble_ok = matches(builder, arith, arith_cursor, preamble_fp) &&
                         matches(builder, p2ext, ext_cursor, PREAMBLE_POSEIDON2_EXT) &&
                         matches(builder, p2int, int_cursor, PREAMBLE_POSEIDON2_INT);
    arith_cursor += preamble_fp.gate_count;
    ext_cursor += PREAMBLE_POSEIDON2_EXT.gate_count;
    int_cursor += PREAMBLE_POSEIDON2_INT.gate_count;

    // receive_public_inputs reads transcript fields only. It should not create circuit gates.
    result.receive_public_inputs_ok = true;

    result.wire_ok = matches(builder, arith, arith_cursor, WIRE_ARITH) && matches(builder, nnf, nnf_cursor, WIRE_NNF);
    arith_cursor += WIRE_ARITH.gate_count;
    nnf_cursor += WIRE_NNF.gate_count;

    result.eta_sorted_ok = matches(builder, arith, arith_cursor, ETA_SORTED_ARITH) &&
                           matches(builder, nnf, nnf_cursor, ETA_SORTED_NNF) &&
                           matches(builder, p2ext, ext_cursor, ETA_SORTED_POSEIDON2_EXT) &&
                           matches(builder, p2int, int_cursor, ETA_SORTED_POSEIDON2_INT);
    arith_cursor += ETA_SORTED_ARITH.gate_count;
    nnf_cursor += ETA_SORTED_NNF.gate_count;
    ext_cursor += ETA_SORTED_POSEIDON2_EXT.gate_count;
    int_cursor += ETA_SORTED_POSEIDON2_INT.gate_count;

    result.beta_lookup_ok = matches(builder, arith, arith_cursor, BETA_LOOKUP_ARITH) &&
                            matches(builder, nnf, nnf_cursor, BETA_LOOKUP_NNF) &&
                            matches(builder, p2ext, ext_cursor, BETA_LOOKUP_POSEIDON2_EXT) &&
                            matches(builder, p2int, int_cursor, BETA_LOOKUP_POSEIDON2_INT);
    arith_cursor += BETA_LOOKUP_ARITH.gate_count;
    nnf_cursor += BETA_LOOKUP_NNF.gate_count;
    ext_cursor += BETA_LOOKUP_POSEIDON2_EXT.gate_count;
    int_cursor += BETA_LOOKUP_POSEIDON2_INT.gate_count;

    result.public_input_delta_ok = matches(builder, arith, arith_cursor, PUBLIC_INPUT_DELTA_ARITH);
    const size_t public_input_delta_window_lo = arith_cursor;
    const size_t public_input_delta_window_hi = arith_cursor + PUBLIC_INPUT_DELTA_ARITH.gate_count;
    arith_cursor += PUBLIC_INPUT_DELTA_ARITH.gate_count;

    result.z_perm_ok =
        matches(builder, arith, arith_cursor, Z_PERM_ARITH) && matches(builder, nnf, nnf_cursor, Z_PERM_NNF);
    arith_cursor += Z_PERM_ARITH.gate_count;
    nnf_cursor += Z_PERM_NNF.gate_count;

    result.alpha_ok = matches(builder, arith, arith_cursor, ALPHA_ARITH) &&
                      matches(builder, p2ext, ext_cursor, ALPHA_POSEIDON2_EXT) &&
                      matches(builder, p2int, int_cursor, ALPHA_POSEIDON2_INT);
    arith_cursor += ALPHA_ARITH.gate_count;
    ext_cursor += ALPHA_POSEIDON2_EXT.gate_count;
    int_cursor += ALPHA_POSEIDON2_INT.gate_count;

    base.pre_eta_arith_ok = matches(builder, arith, arith_start, pre_eta_fp);
    base.post_eta_arith_ok = matches(builder, arith, eta + 1, POST_ETA_ARITH);
    base.post_beta_gamma_arith_ok = matches(builder, arith, beta_gamma + 1, POST_BETA_GAMMA_ARITH);
    base.acir_constraint_ok = recursion_helpers::validate_vk_hash<FF>(builder, analyzer, &constraint);

    result.num_pub_inputs_ok = validate_rollup_num_public_inputs<FF>(builder, analyzer, constraint);

    result.public_input_delta_value_ok = false;
    if (constraint.key.size() > 2) {
        std::vector<uint32_t> public_input_reals;
        public_input_reals.reserve(constraint.public_inputs.size());
        for (uint32_t idx : constraint.public_inputs) {
            public_input_reals.push_back(builder.real_variable_index[idx]);
        }
        const uint32_t pub_inputs_offset_real = builder.real_variable_index[constraint.key[2]];
        result.public_input_delta_value_ok = validate_public_input_delta_binding<FF>(builder,
                                                                                     analyzer,
                                                                                     oink_chal.beta,
                                                                                     oink_chal.gamma,
                                                                                     pub_inputs_offset_real,
                                                                                     public_input_reals,
                                                                                     public_input_delta_window_lo,
                                                                                     public_input_delta_window_hi);
    }

    auto validate_group = [&](size_t group_idx) {
        return HonkRecursionValidation::Oink::validate_honk_commitment_group_full<FF>(
            builder, analyzer, proof_witnesses, group_idx, &constraint);
    };
    const bool commitments_ok = std::all_of(HonkRecursionValidation::Oink::PRE_ETA_COMMITMENT_GROUPS.begin(),
                                            HonkRecursionValidation::Oink::PRE_ETA_COMMITMENT_GROUPS.end(),
                                            validate_group) &&
                                std::all_of(HonkRecursionValidation::Oink::POST_ETA_COMMITMENT_GROUPS.begin(),
                                            HonkRecursionValidation::Oink::POST_ETA_COMMITMENT_GROUPS.end(),
                                            validate_group) &&
                                std::all_of(HonkRecursionValidation::Oink::POST_BETA_GAMMA_COMMITMENT_GROUPS.begin(),
                                            HonkRecursionValidation::Oink::POST_BETA_GAMMA_COMMITMENT_GROUPS.end(),
                                            validate_group) &&
                                validate_group(HonkRecursionValidation::Oink::Z_PERM_GROUP);

    base.nnf_start = SETUP_NNF_GATE_COUNT;
    base.nnf_end = SETUP_NNF_GATE_COUNT + NNF_GATES;
    base.poseidon2_ext_start = 0;
    base.poseidon2_ext_end = POSEIDON2_EXT_GATES;
    base.poseidon2_int_start = 0;
    base.poseidon2_int_end = POSEIDON2_INT_GATES;
    base.arith_start = arith_start;
    base.arith_end = arith_start + arith_gates(opcode_index);

    base.nnf_ok = commitments_ok;
    base.poseidon2_ext_ok = ext_cursor == POSEIDON2_EXT_GATES;
    base.poseidon2_int_ok = int_cursor == POSEIDON2_INT_GATES;
    base.is_valid = result.preamble_ok && result.receive_public_inputs_ok && result.wire_ok && result.eta_sorted_ok &&
                    result.beta_lookup_ok && result.public_input_delta_ok && result.z_perm_ok && result.alpha_ok &&
                    base.pre_eta_arith_ok && base.post_eta_arith_ok && base.post_beta_gamma_arith_ok &&
                    base.acir_constraint_ok && base.nnf_ok && base.poseidon2_ext_ok && base.poseidon2_int_ok &&
                    base.squeeze_count_ok && result.num_pub_inputs_ok && result.public_input_delta_value_ok;
    return result;
}

// ── Cursor-migrate whole-Oink (Phase 3 promote / functions_analysis) ──
// Prefer validate_oink_cursor for ROLLUP / ROOT; squeeze path above is legacy.
// Opcode 1 Oink arith is one gate shorter (preamble fix_witness reuse) — see preamble_arith().
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL_OP0 = {
    1459, 0x54b6283c06479365ULL, 0x1aee897a2c1e5527ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
// gate_count = OP0 - 1; hashes measured on ROOT opcode-1 window (same prefix family as OP0).
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL_OP1 = {
    1458, 0x54b6283c06479365ULL, 0x1aee897a2c1e5527ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
inline const recursion_helpers::FunctionFingerprint& arith_total(size_t opcode_index)
{
    return opcode_index == 0 ? ARITH_TOTAL_OP0 : ARITH_TOTAL_OP1;
}
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = ARITH_TOTAL_OP0;
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    496, 0x8532e80b0fef3fa6ULL, 0x3dafb8c7e4c95f24ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT_TOTAL = {
    580, 0xd66e384960826081ULL, 0x7847807629ca2ddcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT_TOTAL = {
    3306, 0xfeae5f9d5c27d251ULL, 0xc6e3196ccd55ce4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr size_t ARITH_START = 4451; // after VkDeserialize + setup residual (single ROLLUP)
static constexpr size_t ARITH_GATES = ARITH_TOTAL_OP0.gate_count;

template <typename FF, typename CircuitBuilder>
HonkRecursionValidation::Oink::OinkValidationResult validate_oink_cursor(
    CircuitBuilder& builder,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
    size_t arith_start,
    size_t nnf_start,
    size_t poseidon2_ext_start,
    size_t poseidon2_int_start,
    const acir_format::RecursionConstraint* acir_constraint = nullptr,
    const std::vector<uint32_t>* proof_body_witnesses = nullptr,
    size_t opcode_index = 0)
{
    HonkRecursionValidation::Oink::OinkValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& p2ext = poseidon2_helpers::poseidon2_external_block(builder);
    auto& p2int = poseidon2_helpers::poseidon2_internal_block(builder);
    const auto& arith_fp = arith_total(opcode_index);

    result.arith_start = arith_start;
    result.nnf_start = nnf_start;
    result.poseidon2_ext_start = poseidon2_ext_start;
    result.poseidon2_int_start = poseidon2_int_start;

    result.arith_ok = recursion_helpers::matches_fingerprint_at(builder, arith, arith_start, arith_fp);
    result.nnf_ok = recursion_helpers::matches_fingerprint_at(builder, nnf, nnf_start, NNF_TOTAL);
    result.poseidon2_ext_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2ext, poseidon2_ext_start, POSEIDON2_EXT_TOTAL);
    result.poseidon2_int_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2int, poseidon2_int_start, POSEIDON2_INT_TOTAL);

    result.arith_end = arith_start + arith_fp.gate_count;
    result.nnf_end = nnf_start + NNF_TOTAL.gate_count;
    result.poseidon2_ext_end = poseidon2_ext_start + POSEIDON2_EXT_TOTAL.gate_count;
    result.poseidon2_int_end = poseidon2_int_start + POSEIDON2_INT_TOTAL.gate_count;

    result.acir_constraint_ok = true;
    if (acir_constraint != nullptr) {
        result.acir_constraint_ok = recursion_helpers::validate_vk_hash<FF>(builder, analyzer, acir_constraint);
    }

    result.commitments_ok = true;
    if (proof_body_witnesses != nullptr) {
        auto validate_group = [&](size_t group_idx) {
            const auto frs = HonkRecursionValidation::Oink::get_honk_commitment_group_witness_indices(
                *proof_body_witnesses,
                group_idx,
                HonkRecursionValidation::Oink::honk_public_input_prefix_size(acir_constraint));
            if (!frs.has_value()) {
                return false;
            }
            return recursion_helpers::validate_oink_commitment<FF>(
                builder, analyzer, (*frs)[0], (*frs)[1], (*frs)[2], (*frs)[3]);
        };
        namespace HO = HonkRecursionValidation::Oink;
        result.commitments_ok =
            std::all_of(HO::PRE_ETA_COMMITMENT_GROUPS.begin(), HO::PRE_ETA_COMMITMENT_GROUPS.end(), validate_group) &&
            std::all_of(HO::POST_ETA_COMMITMENT_GROUPS.begin(), HO::POST_ETA_COMMITMENT_GROUPS.end(), validate_group) &&
            std::all_of(HO::POST_BETA_GAMMA_COMMITMENT_GROUPS.begin(),
                        HO::POST_BETA_GAMMA_COMMITMENT_GROUPS.end(),
                        validate_group) &&
            validate_group(HO::Z_PERM_GROUP);
    }

    result.is_valid = result.arith_ok && result.nnf_ok && result.poseidon2_ext_ok && result.poseidon2_int_ok &&
                      result.acir_constraint_ok;
    result.squeeze_count_ok = true;
    result.pre_eta_arith_ok = result.arith_ok;
    result.post_eta_arith_ok = result.arith_ok;
    result.post_beta_gamma_arith_ok = result.arith_ok;
    return result;
}

} // namespace RollupHonkRecursionValidation::Oink
