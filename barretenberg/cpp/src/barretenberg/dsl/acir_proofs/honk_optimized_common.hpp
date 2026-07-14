// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/ecc/fields/field_conversion.hpp"
#include "barretenberg/honk/types/public_inputs_type.hpp"
#include <sstream>
#include <string>
#include <type_traits>
#include <vector>

// Shared helpers for honk_optimized_contract.hpp and honk_zk_optimized_contract.hpp.
// Both optimized verifier code generators share the same field-to-hex conversion,
// integer-to-hex conversion, unroll section generation, and template replacement logic.

template <typename Field> std::string field_to_hex(const Field& f)
{
    std::ostringstream os;
    os << f;
    return os.str();
}

// Emit the (x, y) coordinates of a G1 commitment as canonical 32-byte hex strings,
// routing through U256Codec so points at infinity collapse to the EIP-196 identity (0, 0).
// Reading commitment.x / commitment.y directly is unsafe: when is_point_at_infinity is set,
// the affine struct stores a sentinel (modulus) in x and leaves y untouched, so the raw
// coordinates do not lie on the curve and the EVM ecMul/ecAdd precompiles reject them.
template <typename Commitment> std::pair<std::string, std::string> g1_to_xy_hex(const Commitment& point)
{
    const auto coords = bb::U256Codec::template serialize_to_fields<std::remove_cvref_t<Commitment>>(point);
    std::ostringstream x_os;
    std::ostringstream y_os;
    x_os << coords[0];
    y_os << coords[1];
    return { x_os.str(), y_os.str() };
}

inline std::string int_to_hex(size_t i)
{
    std::ostringstream os;
    os << "0x" << std::hex << i;
    return os.str();
}

// Configuration for unroll section generation that varies between ZK and non-ZK verifiers.
struct UnrollConfig {
    int batch_scalar_offset; // 37 (non-ZK) or 38 (ZK)
};

// Generate the Solidity assembly code for a given unroll section.
// The section_name determines which code pattern to emit; the config parameterizes
// the differences between ZK and non-ZK verifiers.
inline std::string generate_unroll_section(const std::string& section_name, int log_n, const UnrollConfig& config)
{
    std::ostringstream code;

    if (section_name == "POWERS_OF_EVALUATION_COMPUTATION") {
        for (int i = 1; i < log_n; ++i) {
            code << "                   cache := mulmod(cache, cache, p)\n";
            code << "                   mstore(POWERS_OF_EVALUATION_CHALLENGE_" << i << "_LOC, cache)\n";
        }
    } else if (section_name == "ACCUMULATE_INVERSES") {
        // Generate INVERTED_CHALLENGE_POW_MINUS_U accumulations
        int temp_idx = 0;
        for (int i = 0; i < log_n; ++i) {
            code << "                       // INVERTED_CHALLENGE_POW_MINUS_U_" << i << "\n";
            code << "                       {\n";
            code << "                           let u := mload(SUM_U_CHALLENGE_" << i << ")\n";
            code << "                           let challPow := mload(POWERS_OF_EVALUATION_CHALLENGE_" << i
                 << "_LOC)\n";
            code << "                           let val := addmod(mulmod(challPow, addmod(1, sub(p, u), p), p), u, "
                    "p)\n";
            code << "                           mstore(INVERTED_CHALLENGE_POW_MINUS_U_" << i << "_LOC, val)\n";
            code << "                           mstore(TEMP_" << temp_idx << "_LOC, accumulator)\n";
            code << "                           accumulator := mulmod(accumulator, val, p)\n";
            code << "                       }\n";
            temp_idx++;
        }

        code << "\n                     // Accumulate pos inverted denom\n";
        code << "                       // Elements LOG_N+1..2*LOG_N: POS_INVERTED_DENOM\n";
        code << "                       let eval_challenge := mload(SHPLONK_Z_CHALLENGE)\n";

        for (int i = 0; i < log_n; ++i) {
            code << "                    // POS_INVERTED_DENOM_" << i << "\n";
            code << "                    {\n";
            code << "                        let val := addmod(eval_challenge, sub(p, "
                    "mload(POWERS_OF_EVALUATION_CHALLENGE_"
                 << i << "_LOC))        , p)\n";
            code << "                        mstore(POS_INVERTED_DENOM_" << i << "_LOC, val)\n";
            code << "                        mstore(TEMP_" << temp_idx << "_LOC, accumulator)\n";
            code << "                        accumulator := mulmod(accumulator, val, p)\n";
            code << "                    }\n";
            temp_idx++;
        }

        code << "\n                     // Accumulate neg inverted denom\n";
        code << "                       // Elements 2*LOG_N+1..3*LOG_N: NEG_INVERTED_DENOM\n";
        for (int i = 0; i < log_n; ++i) {
            code << "                       {\n";
            code << "                           let val := addmod(eval_challenge, "
                    "mload(POWERS_OF_EVALUATION_CHALLENGE_"
                 << i << "_LOC), p)\n";
            code << "                           mstore(NEG_INVERTED_DENOM_" << i << "_LOC, val)\n";
            code << "                           mstore(TEMP_" << temp_idx << "_LOC, accumulator)\n";
            code << "                           accumulator := mulmod(accumulator, val, p)\n";
            code << "                       }\n";
            temp_idx++;
        }
    } else if (section_name == "COLLECT_INVERSES") {
        int temp_idx = 3 * log_n - 1;

        // Process NEG_INVERTED_DENOM in reverse order
        code << "                       // i = " << log_n << "\n";
        code << "                       // NEG_INVERTED_DENOM (LOG_N elements, reverse) -- last group appended\n";
        for (int i = log_n - 1; i >= 0; --i) {
            code << "                       {\n";
            code << "                           let tmp := mulmod(accumulator, mload(TEMP_" << temp_idx
                 << "_LOC), p)\n";
            code << "                           accumulator := mulmod(accumulator, mload(NEG_INVERTED_DENOM_" << i
                 << "_LOC), p)\n";
            code << "                           mstore(NEG_INVERTED_DENOM_" << i << "_LOC, tmp)\n";
            code << "                   }\n";
            if (i > 0) {
                code << "            // i = " << i << "\n";
            }
            temp_idx--;
        }

        code << "\n            // Unrolled for LOG_N = " << log_n << "\n";
        code << "            // i = " << log_n << "\n";

        // Process POS_INVERTED_DENOM in reverse order
        for (int i = log_n - 1; i >= 0; --i) {
            code << "            {\n";
            code << "                let tmp := mulmod(accumulator, mload(TEMP_" << temp_idx << "_LOC), p)\n";
            code << "                accumulator := mulmod(accumulator, mload(POS_INVERTED_DENOM_" << i
                 << "_LOC), p)\n";
            code << "                mstore(POS_INVERTED_DENOM_" << i << "_LOC, tmp)\n";
            code << "            }\n";
            if (i > 0) {
                code << "            // i = " << i << "\n";
            }
            temp_idx--;
        }

        code << "\n            // i = " << log_n << "\n";

        // Process INVERTED_CHALLENGE_POW_MINUS_U in reverse order
        for (int i = log_n - 1; i >= 0; --i) {
            code << "            {\n";
            code << "                let tmp := mulmod(accumulator, mload(TEMP_" << temp_idx << "_LOC), p)\n";
            code << "                accumulator := mulmod(accumulator, mload(INVERTED_CHALLENGE_POW_MINUS_U_" << i
                 << "_LOC), p)\n";
            code << "                mstore(INVERTED_CHALLENGE_POW_MINUS_U_" << i << "_LOC, tmp)\n";
            code << "            }\n";
            if (i > 0) {
                code << "            // i = " << i << "\n";
            }
            temp_idx--;
        }
    } else if (section_name == "ACCUMULATE_GEMINI_FOLD_UNIVARIATE") {
        // Generate GEMINI_FOLD_UNIVARIATE accumulations (log_n - 1 folding commitments)
        for (int i = 0; i < log_n - 1; ++i) {
            code << "                        mcopy(G1_LOCATION, GEMINI_FOLD_UNIVARIATE_" << i << "_X_LOC, 0x40)\n";
            code << "                        mstore(SCALAR_LOCATION, mload(BATCH_SCALAR_"
                 << (config.batch_scalar_offset + i) << "_LOC))\n";
            code << "                        precomp_success_flag :=\n";
            code << "                            and(precomp_success_flag, staticcall(gas(), 7, G1_LOCATION, 0x60, "
                    "ACCUMULATOR_2, 0x40))\n";
            code << "                        precomp_success_flag :=\n";
            code << "                            and(precomp_success_flag, staticcall(gas(), 6, ACCUMULATOR, 0x80, "
                    "ACCUMULATOR, 0x40))\n";
            if (i < log_n - 2) {
                code << "\n";
            }
        }
    }

    return code.str();
}

// Replace a single UNROLL_SECTION block in the template string.
// Finds the START/END markers for the given section_name, generates the code,
// and splices it into the template.
inline void replace_unroll_section(std::string& template_str,
                                   const std::string& section_name,
                                   int log_n,
                                   const UnrollConfig& config)
{
    std::string start_marker = "/// {{ UNROLL_SECTION_START " + section_name + " }}";
    std::string end_marker = "/// {{ UNROLL_SECTION_END " + section_name + " }}";
    std::string::size_type start_pos = template_str.find(start_marker);
    std::string::size_type end_pos = template_str.find(end_marker);

    // Sanity check - much better to fail now if an expected template is missing - check whitespace matches exactly
    if (start_pos == std::string::npos || end_pos == std::string::npos) {
        info("Missing unroll markers for section: " + section_name);
        std::abort();
    }

    if (start_pos != std::string::npos && end_pos != std::string::npos) {
        std::string::size_type start_line_end = template_str.find("\n", start_pos);
        std::string generated_code = generate_unroll_section(section_name, log_n, config);
        template_str = template_str.substr(0, start_line_end + 1) + generated_code + template_str.substr(end_pos);
    }
}

// Configuration for memory layout generation that varies between ZK and non-ZK verifiers.
struct MemoryLayoutConfig {
    int batched_relation_partial_length; // 8 (non-ZK) or 9 (ZK)
    int barycentric_domain_size;         // 8 (non-ZK) or 9 (ZK)
    bool is_zk;                          // controls all ZK-specific conditional blocks
};

// Generate the Solidity memory layout constants for the optimized verifier.
// This is shared between ZK and non-ZK verifiers; the config parameterizes
// all differences (extra ZK proof elements, challenges, scratch space).
inline std::string generate_memory_offsets(int log_n, const MemoryLayoutConfig& config)
{
    const int NUMBER_OF_SUBRELATIONS = 31;
    const int NUMBER_OF_ALPHAS = NUMBER_OF_SUBRELATIONS - 1;
    const int START_POINTER = 0x1000;

    std::ostringstream out;

    // Helper lambdas
    auto print_header_centered = [&](const std::string& text) {
        const std::string top = "/*´:°•.°+.*•´.*:˚.°*.˚•´.°:°•.°•.*•´.*:˚.°*.˚•´.°:°•.°+.*•´.*:*/";
        const std::string bottom = "/*.•°:°.´+˚.*°.˚:*.´•*.+°.•°:´*.´•*.•°.•°:°.´:•˚°.*°.˚:*.´+°.•*/";
        size_t width = static_cast<size_t>(top.length()) - 4; // exclude /* and */
        std::string centered =
            "/*" + std::string(static_cast<size_t>((width - text.length()) / 2), ' ') + text +
            std::string(static_cast<size_t>(width - text.length() - (width - text.length()) / 2), ' ') + "*/";
        out << "\n" << top << "\n" << centered << "\n" << bottom << "\n";
    };

    auto print_loc = [&](int pointer, const std::string& name) {
        out << "uint256 internal constant " << name << " = " << std::showbase << std::hex << pointer << ";\n";
    };

    auto print_fr = print_loc;

    auto print_g1 = [&](int pointer, const std::string& name) {
        print_loc(pointer, name + "_X_LOC");
        print_loc(pointer + 32, name + "_Y_LOC");
    };

    // Data arrays
    const std::vector<std::string> vk_fr = { "VK_CIRCUIT_SIZE_LOC",
                                             "VK_NUM_PUBLIC_INPUTS_LOC",
                                             "VK_PUB_INPUTS_OFFSET_LOC" };

    const std::vector<std::string> vk_g1 = { "Q_M",
                                             "Q_L",
                                             "Q_R",
                                             "Q_O",
                                             "Q_4",
                                             "Q_C",
                                             "Q_ARITH",
                                             "SIGMA_1",
                                             "SIGMA_2",
                                             "SIGMA_3",
                                             "SIGMA_4",
                                             "ID_1",
                                             "ID_2",
                                             "ID_3",
                                             "ID_4",
                                             "LAGRANGE_FIRST",
                                             "LAGRANGE_LAST",
                                             "Q_LOOKUP",
                                             "TABLE_1",
                                             "TABLE_2",
                                             "TABLE_3",
                                             "TABLE_4",
                                             "Q_DELTA_RANGE",
                                             "Q_ELLIPTIC",
                                             "Q_MEMORY",
                                             "Q_NNF",
                                             "Q_POSEIDON_2_EXTERNAL",
                                             "Q_POSEIDON_2_INTERNAL" };

    const std::vector<std::string> pairing_points = { "PAIRING_POINT_0_X_0_LOC", "PAIRING_POINT_0_X_1_LOC",
                                                      "PAIRING_POINT_0_Y_0_LOC", "PAIRING_POINT_0_Y_1_LOC",
                                                      "PAIRING_POINT_1_X_0_LOC", "PAIRING_POINT_1_X_1_LOC",
                                                      "PAIRING_POINT_1_Y_0_LOC", "PAIRING_POINT_1_Y_1_LOC" };

    const std::vector<std::string> proof_g1 = {
        "W_L", "W_R", "W_O", "LOOKUP_READ_COUNTS", "LOOKUP_READ_TAGS", "W_4", "LOOKUP_INVERSES", "Z_PERM"
    };

    const std::vector<std::string> entities = { "SIGMA1",
                                                "SIGMA2",
                                                "SIGMA3",
                                                "SIGMA4",
                                                "ID1",
                                                "ID2",
                                                "ID3",
                                                "ID4",
                                                "LAGRANGE_FIRST",
                                                "LAGRANGE_LAST",
                                                "QLOOKUP",
                                                "TABLE1",
                                                "TABLE2",
                                                "TABLE3",
                                                "TABLE4",
                                                "QM",
                                                "QR",
                                                "QO",
                                                "QC",
                                                "QL",
                                                "Q4",
                                                "QARITH",
                                                "QRANGE",
                                                "QELLIPTIC",
                                                "QMEMORY",
                                                "QNNF",
                                                "QPOSEIDON2_EXTERNAL",
                                                "QPOSEIDON2_INTERNAL",
                                                "W1",
                                                "W2",
                                                "W3",
                                                "W4",
                                                "Z_PERM",
                                                "LOOKUP_INVERSES",
                                                "LOOKUP_READ_COUNTS",
                                                "LOOKUP_READ_TAGS",
                                                "W1_SHIFT",
                                                "W2_SHIFT",
                                                "W3_SHIFT",
                                                "W4_SHIFT",
                                                "Z_PERM_SHIFT" };

    const std::vector<std::string> challenges = { "ETA",
                                                  "ETA_TWO",
                                                  "ETA_THREE",
                                                  "ROM_LOGUP_GAMMA",
                                                  "BETA",
                                                  "GAMMA",
                                                  "RHO",
                                                  "GEMINI_R",
                                                  "SHPLONK_NU",
                                                  "SHPLONK_Z",
                                                  "PUBLIC_INPUTS_DELTA_NUMERATOR",
                                                  "PUBLIC_INPUTS_DELTA_DENOMINATOR" };

    const std::vector<std::string> subrelation_intermediates = { "AUX_NON_NATIVE_FIELD_IDENTITY",
                                                                 "AUX_LIMB_ACCUMULATOR_IDENTITY",
                                                                 "AUX_RAM_CONSISTENCY_CHECK_IDENTITY",
                                                                 "AUX_ROM_CONSISTENCY_CHECK_IDENTITY",
                                                                 "AUX_MEMORY_CHECK_IDENTITY" };

    const std::vector<std::string> general_intermediates = { "FINAL_ROUND_TARGET_LOC", "POW_PARTIAL_EVALUATION_LOC" };

    int pointer = START_POINTER;

    // VK INDICIES
    print_header_centered("VK INDICIES");
    for (const auto& item : vk_fr) {
        print_fr(pointer, item);
        pointer += 32;
    }
    for (const auto& item : vk_g1) {
        print_g1(pointer, item);
        pointer += 64;
    }

    // PROOF INDICIES
    print_header_centered("PROOF INDICIES");
    for (const auto& item : pairing_points) {
        print_fr(pointer, item);
        pointer += 32;
    }

    // ZK: GEMINI_MASKING_POLY before proof_g1
    if (config.is_zk) {
        print_g1(pointer, "GEMINI_MASKING_POLY");
        pointer += 64;
    }

    for (const auto& item : proof_g1) {
        print_g1(pointer, item);
        pointer += 64;
    }

    // ZK: LIBRA_CONCAT after proof_g1, then LIBRA_SUM
    if (config.is_zk) {
        print_g1(pointer, "LIBRA_CONCAT");
        pointer += 64;
        print_fr(pointer, "LIBRA_SUM_LOC");
        pointer += 32;
    }

    // SUMCHECK UNIVARIATES
    print_header_centered("PROOF INDICIES - SUMCHECK UNIVARIATES");
    for (int size = 0; size < log_n; ++size) {
        for (int relation_len = 0; relation_len < config.batched_relation_partial_length; ++relation_len) {
            std::string name =
                "SUMCHECK_UNIVARIATE_" + std::to_string(size) + "_" + std::to_string(relation_len) + "_LOC";
            print_fr(pointer, name);
            pointer += 32;
        }
    }

    // SUMCHECK EVALUATIONS
    print_header_centered("PROOF INDICIES - SUMCHECK EVALUATIONS");

    // ZK: GEMINI_MASKING_EVAL is entity index 0
    if (config.is_zk) {
        print_fr(pointer, "GEMINI_MASKING_EVAL_LOC");
        pointer += 32;
    }

    for (const auto& entity : entities) {
        print_fr(pointer, entity + "_EVAL_LOC");
        pointer += 32;
    }

    // ZK: LIBRA_EVALUATION, LIBRA_GRAND_PRODUCT, LIBRA_QUOTIENT after entity evals
    if (config.is_zk) {
        print_fr(pointer, "LIBRA_EVALUATION_LOC");
        pointer += 32;
        print_g1(pointer, "LIBRA_GRAND_PRODUCT");
        pointer += 64;
        print_g1(pointer, "LIBRA_QUOTIENT");
        pointer += 64;
    }

    // SHPLEMINI - GEMINI FOLDING COMMS
    print_header_centered("PROOF INDICIES - GEMINI FOLDING COMMS");
    for (int size = 0; size < log_n - 1; ++size) {
        print_g1(pointer, "GEMINI_FOLD_UNIVARIATE_" + std::to_string(size));
        pointer += 64;
    }

    // GEMINI FOLDING EVALUATIONS
    print_header_centered("PROOF INDICIES - GEMINI FOLDING EVALUATIONS");
    for (int size = 0; size < log_n; ++size) {
        print_fr(pointer, "GEMINI_A_EVAL_" + std::to_string(size));
        pointer += 32;
    }

    // ZK: LIBRA POLY EVALUATIONS
    if (config.is_zk) {
        print_header_centered("PROOF INDICIES - LIBRA POLY EVALUATIONS");
        for (int i = 0; i < 4; ++i) {
            print_fr(pointer, "LIBRA_POLY_EVAL_" + std::to_string(i) + "_LOC");
            pointer += 32;
        }
    }

    print_g1(pointer, "SHPLONK_Q");
    pointer += 64;
    print_g1(pointer, "KZG_QUOTIENT");
    pointer += 64;

    print_header_centered("PROOF INDICIES - COMPLETE");

    // CHALLENGES
    print_header_centered("CHALLENGES");
    for (const auto& chall : challenges) {
        print_fr(pointer, chall + "_CHALLENGE");
        pointer += 32;
    }
    for (int alpha = 0; alpha < NUMBER_OF_ALPHAS; ++alpha) {
        print_fr(pointer, "ALPHA_CHALLENGE_" + std::to_string(alpha));
        pointer += 32;
    }
    for (int gate = 0; gate < log_n; ++gate) {
        print_fr(pointer, "GATE_CHALLENGE_" + std::to_string(gate));
        pointer += 32;
    }

    // ZK: LIBRA_CHALLENGE before SUM_U challenges
    if (config.is_zk) {
        print_fr(pointer, "LIBRA_CHALLENGE");
        pointer += 32;
    }

    for (int sum_u = 0; sum_u < log_n; ++sum_u) {
        print_fr(pointer, "SUM_U_CHALLENGE_" + std::to_string(sum_u));
        pointer += 32;
    }
    print_header_centered("CHALLENGES - COMPLETE");

    // RUNTIME MEMORY
    print_header_centered("SUMCHECK - RUNTIME MEMORY");
    print_header_centered("SUMCHECK - RUNTIME MEMORY - BARYCENTRIC");

    // Barycentric domain
    for (int i = 0; i < config.barycentric_domain_size; ++i) {
        print_fr(pointer, "BARYCENTRIC_LAGRANGE_DENOMINATOR_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    for (int i = 0; i < log_n; ++i) {
        for (int j = 0; j < config.barycentric_domain_size; ++j) {
            print_fr(pointer,
                     "BARYCENTRIC_DENOMINATOR_INVERSES_" + std::to_string(i) + "_" + std::to_string(j) + "_LOC");
            pointer += 32;
        }
    }
    print_header_centered("SUMCHECK - RUNTIME MEMORY - BARYCENTRIC COMPLETE");

    // SUBRELATION EVALUATIONS
    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS");
    for (int i = 0; i < NUMBER_OF_SUBRELATIONS; ++i) {
        print_fr(pointer, "SUBRELATION_EVAL_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION EVALUATIONS COMPLETE");

    // SUBRELATION INTERMEDIATES
    print_header_centered("SUMCHECK - RUNTIME MEMORY - SUBRELATION INTERMEDIATES");
    for (const auto& item : general_intermediates) {
        print_fr(pointer, item);
        pointer += 32;
    }
    for (const auto& item : subrelation_intermediates) {
        print_fr(pointer, item);
        pointer += 32;
    }
    print_header_centered("SUMCHECK - RUNTIME MEMORY - COMPLETE");

    // SHPLEMINI RUNTIME MEMORY
    print_header_centered("SHPLEMINI - RUNTIME MEMORY");
    print_header_centered("SHPLEMINI - POWERS OF EVALUATION CHALLENGE");
    out << "/// {{ UNROLL_SECTION_START POWERS_OF_EVALUATION_CHALLENGE }}\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "POWERS_OF_EVALUATION_CHALLENGE_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "/// {{ UNROLL_SECTION_END POWERS_OF_EVALUATION_CHALLENGE }}\n";
    print_header_centered("SHPLEMINI - POWERS OF EVALUATION CHALLENGE COMPLETE");

    // BATCH SCALARS
    print_header_centered("SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS");
    const int BATCH_SIZE = 69;
    for (int i = 1; i < BATCH_SIZE; ++i) {
        print_fr(pointer, "BATCH_SCALAR_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    print_header_centered("SHPLEMINI - RUNTIME MEMORY - BATCH SCALARS COMPLETE");

    // INVERSIONS
    print_header_centered("SHPLEMINI - RUNTIME MEMORY - INVERSIONS");

    print_fr(pointer, "GEMINI_R_INV_LOC");
    pointer += 32;

    // ZK: LIBRA_SUBGROUP_DENOM
    if (config.is_zk) {
        print_fr(pointer, "LIBRA_SUBGROUP_DENOM_LOC");
        pointer += 32;
    }

    // Batched evaluation accumulator inversions
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "BATCH_EVALUATION_ACCUMULATOR_INVERSION_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    out << "\n";
    print_fr(pointer, "CONSTANT_TERM_ACCUMULATOR_LOC");
    pointer += 32;

    out << "\n";
    print_fr(pointer, "POS_INVERTED_DENOMINATOR");
    pointer += 32;
    print_fr(pointer, "NEG_INVERTED_DENOMINATOR");
    pointer += 32;

    out << "\n";
    out << "// LOG_N challenge pow minus u\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "INVERTED_CHALLENGE_POW_MINUS_U_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    out << "\n";
    out << "// LOG_N pos_inverted_off\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "POS_INVERTED_DENOM_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    out << "\n";
    out << "// LOG_N neg_inverted_off\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "NEG_INVERTED_DENOM_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    out << "\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "FOLD_POS_EVALUATIONS_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    print_header_centered("SHPLEMINI RUNTIME MEMORY - INVERSIONS - COMPLETE");
    print_header_centered("SHPLEMINI RUNTIME MEMORY - COMPLETE");

    // Temporary space for batch inversions
    out << "\n";
    for (int i = 0; i < config.barycentric_domain_size * log_n; ++i) {
        print_fr(pointer, "BARYCENTRIC_TEMP_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    print_fr(pointer, "PUBLIC_INPUTS_DENOM_TEMP_LOC");
    pointer += 32;
    print_fr(pointer, "GEMINI_R_INV_TEMP_LOC");
    pointer += 32;
    // ZK: LIBRA_SUBGROUP_DENOM_TEMP_LOC
    if (config.is_zk) {
        print_fr(pointer, "LIBRA_SUBGROUP_DENOM_TEMP_LOC");
        pointer += 32;
    }
    print_fr(pointer, "BATCH_PRODUCT_TEMP_LOC");
    pointer += 32;

    // Temporary space
    print_header_centered("Temporary space");
    for (int i = 0; i < 3 * log_n; ++i) {
        print_fr(pointer, "TEMP_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    // ZK: Consistency check scratch space
    if (config.is_zk) {
        const int active_challenge_poly_length = 1 + log_n * config.batched_relation_partial_length;
        const int consistency_scratch_length = active_challenge_poly_length + 1;
        print_header_centered("Small subgroup IPA");
        out << "// Allocate only the active challenge-poly prefix and the extra denominator/product slot\n";
        for (int i = 0; i < active_challenge_poly_length; ++i) {
            print_fr(pointer, "CHALLENGE_POLY_LAGRANGE_BASE_" + std::to_string(i));
            pointer += 32;
        }

        out << "\n";
        for (int i = 0; i < consistency_scratch_length; ++i) {
            print_fr(pointer, "CONSISTENCY_DENOMINATORS_BASE_" + std::to_string(i));
            pointer += 32;
        }

        out << "\n";
        for (int i = 0; i < consistency_scratch_length; ++i) {
            print_fr(pointer, "CONSISTENCY_PRODUCTS_BASE_" + std::to_string(i));
            pointer += 32;
        }

        out << "\n";
        out << "// LIBRA_UNIVARIATES_LENGTH = BATCHED_RELATION_PARTIAL_LENGTH = " << std::dec
            << config.batched_relation_partial_length << "\n";
        out << "uint256 internal constant LIBRA_UNIVARIATES_LENGTH = " << std::showbase << std::hex
            << config.batched_relation_partial_length << ";\n";
        out << "uint256 internal constant LIBRA_UNIVARIATES_LENGTH_MINUS_ONE = " << std::showbase << std::hex
            << config.batched_relation_partial_length - 1 << ";\n";
        out << "// 1/SUBGROUP_SIZE mod p (precomputed constant)\n";

        out << "// 1/256 mod p, computed as pow(256, p-2, p) where p = BN254 scalar field modulus\n";
        out << "// 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001\n";
        out << "uint256 internal constant INV_SUBGROUP_SIZE = "
               "0x3033ea246e506e898e97f570caffd704cb0bb460313fb720b29e139e5c100001;\n";
    }

    print_fr(pointer, "LATER_SCRATCH_SPACE");
    pointer += 32;
    print_header_centered("Temporary space - COMPLETE");

    // Scratch space aliases
    out << "\n";
    out << "// Aliases for scratch space\n";
    out << "// Scratch space aliases at 0x00-0x40\n";
    out << "// Phase 1 (sumcheck rounds): CHALL_POW_LOC, SUMCHECK_U_LOC, GEMINI_A_LOC\n";
    out << "// Phase 2 (shplemini batch scalars): SS_POS_INV_DENOM_LOC, SS_NEG_INV_DENOM_LOC, SS_GEMINI_EVALS_LOC\n";
    out << "// These phases do not overlap in execution time.\n";

    print_fr(0x00, "CHALL_POW_LOC");
    print_fr(0x20, "SUMCHECK_U_LOC");
    print_fr(0x40, "GEMINI_A_LOC");
    out << "\n";
    print_fr(0x00, "SS_POS_INV_DENOM_LOC");
    print_fr(0x20, "SS_NEG_INV_DENOM_LOC");
    print_fr(0x40, "SS_GEMINI_EVALS_LOC");

    // EC aliases
    out << "\n\n";
    print_header_centered("SUMCHECK - MEMORY ALIASES");

    return out.str();
}

/// Find the memory layout tags then insert generated layout into the offsets
inline void replace_memory_layout(std::string& template_str, int log_n, const MemoryLayoutConfig& mem_config)
{
    std::string::size_type start_pos = template_str.find("// {{ SECTION_START MEMORY_LAYOUT }}");
    std::string::size_type end_pos = template_str.find("// {{ SECTION_END MEMORY_LAYOUT }}");

    if (start_pos != std::string::npos && end_pos != std::string::npos) {
        std::string::size_type start_line_end = template_str.find("\n", start_pos);
        std::string generated_code = generate_memory_offsets(log_n, mem_config);
        template_str = template_str.substr(0, start_line_end + 1) + generated_code + template_str.substr(end_pos);
    }
}

// Apply all template parameter substitutions for the optimized verifier.
// This handles VK hash, circuit parameters, gemini fold lengths, and all 56 VK field substitutions.
// The is_zk flag controls ZK-specific parameters (BATCHED_RELATION_PARTIAL_LENGTH_MINUS_ONE,
// extra gemini eval terms).
template <typename VK>
inline void apply_template_params(std::string& template_str, VK const& verification_key, bool is_zk)
{
    auto set_template_param = [&template_str](const std::string& key, const std::string& value) {
        std::string::size_type pos = 0;
        std::string pattern = "{{ " + key + " }}";
        while ((pos = template_str.find(pattern, pos)) != std::string::npos) {
            template_str.replace(pos, pattern.length(), value);
            pos += value.length();
        }
    };

    auto log_circuit_size = verification_key->log_circuit_size;

    // larger overflows int, sanity check not 0
    if (log_circuit_size > 31 || log_circuit_size < 1) {
        info("log_circuit_size out of bounds | 0 < x < 31 | x = " + std::to_string(log_circuit_size));
        std::abort();
    }

    if (verification_key->num_public_inputs < bb::PAIRING_POINTS_SIZE) {
        info("invariant broken: public input points are smaller than pairing points (they are usually appended)");
        std::abort();
    }

    set_template_param("VK_HASH", field_to_hex(verification_key->hash()));
    set_template_param("CIRCUIT_SIZE", std::to_string(1 << log_circuit_size));
    set_template_param("LOG_CIRCUIT_SIZE", std::to_string(log_circuit_size));
    set_template_param("NUM_PUBLIC_INPUTS", std::to_string(verification_key->num_public_inputs));
    // REAL_NUM_PUBLIC_INPUTS excludes the 8 pairing point limbs that are part of the proof structure
    set_template_param("REAL_NUM_PUBLIC_INPUTS",
                       std::to_string(verification_key->num_public_inputs - bb::PAIRING_POINTS_SIZE));
    set_template_param("LOG_N_MINUS_ONE", std::to_string(log_circuit_size - 1));

    // ZK: BATCHED_RELATION_PARTIAL_LENGTH - 1 = 8 (constant for ZK, domain size is always 9)
    if (is_zk) {
        set_template_param("BATCHED_RELATION_PARTIAL_LENGTH_MINUS_ONE", "8");
        set_template_param("NUMBER_OF_LAGRANGE_BASES", std::to_string(log_circuit_size * 9));
        set_template_param("NUMBER_OF_LAGRANGE_BASES_PLUS_ONE", std::to_string(log_circuit_size * 9 + 1));
        // Libra batch scalar indices: placed after gemini fold scalars (38 + LOG_N-1 = 37 + LOG_N)
        set_template_param("LIBRA_BATCH_SCALAR_0", std::to_string(37 + log_circuit_size));
        set_template_param("LIBRA_BATCH_SCALAR_1", std::to_string(38 + log_circuit_size));
        set_template_param("LIBRA_BATCH_SCALAR_2", std::to_string(39 + log_circuit_size));
    }

    uint32_t gemini_fold_univariate_length = static_cast<uint32_t>((log_circuit_size - 1) * 0x40);
    uint32_t gemini_fold_univariate_hash_length = static_cast<uint32_t>(gemini_fold_univariate_length + 0x20);
    // ZK: gemini evals include log_n evals + 4 libra poly evals
    uint32_t gemini_evals_length =
        is_zk ? static_cast<uint32_t>((log_circuit_size + 4) * 0x20) : static_cast<uint32_t>(log_circuit_size * 0x20);
    uint32_t gemini_evals_hash_length = static_cast<uint32_t>(gemini_evals_length + 0x20);

    set_template_param("GEMINI_FOLD_UNIVARIATE_LENGTH", int_to_hex(gemini_fold_univariate_length));
    set_template_param("GEMINI_FOLD_UNIVARIATE_HASH_LENGTH", int_to_hex(gemini_fold_univariate_hash_length));
    set_template_param("GEMINI_EVALS_LENGTH", int_to_hex(gemini_evals_length));
    set_template_param("GEMINI_EVALS_HASH_LENGTH", int_to_hex(gemini_evals_hash_length));

    // Verification Key — use g1_to_xy_hex so identity-commitment selectors
    // (e.g. selectors that commit to identically-zero polynomials) emit the
    // EIP-196 canonical (0, 0) instead of the raw affine sentinel, which is
    // off-curve and rejected by the ecMul/ecAdd precompiles.
    auto set_g1_template_param = [&](const std::string& name_prefix, const auto& point) {
        const auto [x_hex, y_hex] = g1_to_xy_hex(point);
        set_template_param(name_prefix + "_X_LOC", x_hex);
        set_template_param(name_prefix + "_Y_LOC", y_hex);
    };
    set_g1_template_param("Q_L", verification_key->q_l());
    set_g1_template_param("Q_R", verification_key->q_r());
    set_g1_template_param("Q_O", verification_key->q_o());
    set_g1_template_param("Q_4", verification_key->q_4());
    set_g1_template_param("Q_M", verification_key->q_m());
    set_g1_template_param("Q_C", verification_key->q_c());
    set_g1_template_param("Q_LOOKUP", verification_key->q_lookup());
    set_g1_template_param("Q_ARITH", verification_key->q_arith());
    set_g1_template_param("Q_DELTA_RANGE", verification_key->q_delta_range());
    set_g1_template_param("Q_ELLIPTIC", verification_key->q_elliptic());
    set_g1_template_param("Q_MEMORY", verification_key->q_memory());
    set_g1_template_param("Q_NNF", verification_key->q_nnf());
    set_g1_template_param("Q_POSEIDON_2_EXTERNAL", verification_key->q_poseidon2_external());
    set_g1_template_param("Q_POSEIDON_2_INTERNAL", verification_key->q_poseidon2_internal());
    set_g1_template_param("SIGMA_1", verification_key->sigma_1());
    set_g1_template_param("SIGMA_2", verification_key->sigma_2());
    set_g1_template_param("SIGMA_3", verification_key->sigma_3());
    set_g1_template_param("SIGMA_4", verification_key->sigma_4());
    set_g1_template_param("TABLE_1", verification_key->table_1());
    set_g1_template_param("TABLE_2", verification_key->table_2());
    set_g1_template_param("TABLE_3", verification_key->table_3());
    set_g1_template_param("TABLE_4", verification_key->table_4());
    set_g1_template_param("ID_1", verification_key->id_1());
    set_g1_template_param("ID_2", verification_key->id_2());
    set_g1_template_param("ID_3", verification_key->id_3());
    set_g1_template_param("ID_4", verification_key->id_4());
    set_g1_template_param("LAGRANGE_FIRST", verification_key->lagrange_first());
    set_g1_template_param("LAGRANGE_LAST", verification_key->lagrange_last());
}
