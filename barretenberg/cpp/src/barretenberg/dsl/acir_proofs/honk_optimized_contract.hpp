// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/honk/utils/honk_key_gen.hpp"
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <vector>

// Source code for the Ultrahonk Solidity verifier.
// It's expected that the AcirComposer will inject a library which will load the verification key into memory.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
static const char HONK_CONTRACT_OPT_SOURCE[] = R"(
)";

static const int max_log_n = 28;

// Standalone function to generate memory slot constants string for Solidity, parameterized by log_n
inline std::string get_memory_slots_string(int log_n)
{
    std::ostringstream out;
    int pointer = 0x380;

    // Helper lambdas
    auto print_loc = [&](int pointer, const std::string& name) {
        out << "uint256 internal constant " << name << " = " << std::showbase << std::hex << pointer << ";\n";
    };
    auto print_fr = print_loc;
    auto print_small_g1 = [&](int pointer, const std::string& name) {
        print_loc(pointer, name + "_X_LOC");
        print_loc(pointer + 32, name + "_Y_LOC");
    };
    auto print_g1 = [&](int pointer, const std::string& name) {
        print_loc(pointer, name + "_X0_LOC");
        print_loc(pointer + 32, name + "_X1_LOC");
        print_loc(pointer + 64, name + "_Y0_LOC");
        print_loc(pointer + 96, name + "_Y1_LOC");
    };

    // Data from Python script
    const std::vector<std::string> vk_fr = { "VK_CIRCUIT_SIZE_LOC",
                                             "VK_NUM_PUBLIC_INPUTS_LOC",
                                             "VK_PUB_INPUTS_OFFSET_LOC" };
    const std::vector<std::string> vk_g1 = { "Q_M",
                                             "Q_C",
                                             "Q_L",
                                             "Q_R",
                                             "Q_O",
                                             "Q_4",
                                             "Q_ARITH",
                                             "Q_DELTA_RANGE",
                                             "Q_ELLIPTIC",
                                             "Q_AUX",
                                             "Q_LOOKUP",
                                             "Q_POSEIDON_2_EXTERNAL",
                                             "Q_POSEIDON_2_INTERNAL",
                                             "SIGMA_1",
                                             "SIGMA_2",
                                             "SIGMA_3",
                                             "SIGMA_4",
                                             "ID_1",
                                             "ID_2",
                                             "ID_3",
                                             "ID_4",
                                             "TABLE_1",
                                             "TABLE_2",
                                             "TABLE_3",
                                             "TABLE_4",
                                             "LAGRANGE_FIRST",
                                             "LAGRANGE_LAST" };
    const std::vector<std::string> pairing_points = { "PAIRING_POINT_0",  "PAIRING_POINT_1",  "PAIRING_POINT_2",
                                                      "PAIRING_POINT_3",  "PAIRING_POINT_4",  "PAIRING_POINT_5",
                                                      "PAIRING_POINT_6",  "PAIRING_POINT_7",  "PAIRING_POINT_8",
                                                      "PAIRING_POINT_9",  "PAIRING_POINT_10", "PAIRING_POINT_11",
                                                      "PAIRING_POINT_12", "PAIRING_POINT_13", "PAIRING_POINT_14",
                                                      "PAIRING_POINT_15" };
    const std::vector<std::string> proof_g1 = {
        "W_L", "W_R", "W_O", "LOOKUP_READ_COUNTS", "LOOKUP_READ_TAGS", "W_4", "LOOKUP_INVERSES", "Z_PERM"
    };
    const std::vector<std::string> entities = { "QM",
                                                "QC",
                                                "QL",
                                                "QR",
                                                "QO",
                                                "Q4",
                                                "QLOOKUP",
                                                "QARITH",
                                                "QRANGE",
                                                "QELLIPTIC",
                                                "QAUX",
                                                "QPOSEIDON2_EXTERNAL",
                                                "QPOSEIDON2_INTERNAL",
                                                "SIGMA1",
                                                "SIGMA2",
                                                "SIGMA3",
                                                "SIGMA4",
                                                "ID1",
                                                "ID2",
                                                "ID3",
                                                "ID4",
                                                "TABLE1",
                                                "TABLE2",
                                                "TABLE3",
                                                "TABLE4",
                                                "LAGRANGE_FIRST",
                                                "LAGRANGE_LAST",
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
                                                  "BETA",
                                                  "GAMMA",
                                                  "RHO",
                                                  "GEMINI_R",
                                                  "SHPLONK_NU",
                                                  "SHPLONK_Z",
                                                  "PUBLIC_INPUTS_DELTA_NUMERATOR",
                                                  "PUBLIC_INPUTS_DELTA_DENOMINATOR" };
    const int BATCHED_RELATION_PARTIAL_LENGTH = 8;
    const int NUMBER_OF_ALPHAS = 26;
    const int NUMBER_OF_SUBRELATIONS = 27;
    const int BARYCENTRIC_DOMAIN_SIZE = 8;
    const std::vector<std::string> subrelation_intermediates = { "AUX_NON_NATIVE_FIELD_IDENTITY",
                                                                 "AUX_LIMB_ACCUMULATOR_IDENTITY",
                                                                 "AUX_RAM_CONSISTENCY_CHECK_IDENTITY",
                                                                 "AUX_ROM_CONSISTENCY_CHECK_IDENTITY",
                                                                 "AUX_MEMORY_CHECK_IDENTITY" };
    const std::vector<std::string> general_intermediates = { "FINAL_ROUND_TARGET_LOC", "POW_PARTIAL_EVALUATION_LOC" };

    // Print VK
    out << "// Verification key indicies\n";
    for (const auto& item : vk_fr) {
        print_fr(pointer, item);
        pointer += 32;
    }
    for (const auto& item : vk_g1) {
        print_small_g1(pointer, item);
        pointer += (4 * 32);
    }
    out << "\n// Proof indicies\n";
    for (const auto& item : pairing_points) {
        print_fr(pointer, item);
        pointer += 32;
    }
    for (const auto& item : proof_g1) {
        print_g1(pointer, item);
        pointer += (4 * 32);
    }
    out << "\n// Sumcheck univariates\n";
    for (int relation_len = 0; relation_len < BATCHED_RELATION_PARTIAL_LENGTH; ++relation_len) {
        for (int size = 0; size < log_n; ++size) {
            print_fr(pointer,
                     "SUMCHECK_UNIVARIATE_" + std::to_string(relation_len) + "_" + std::to_string(size) + "_LOC");
            pointer += 32;
        }
    }
    out << "\n// Entities\n";
    for (const auto& entity : entities) {
        print_fr(pointer, entity + "_EVAL_LOC");
        pointer += 32;
    }
    out << "\n// Shplemini\n";
    for (int size = 0; size < max_log_n - 1; ++size) {
        print_g1(pointer, "GEMINI_FOLD_UNIVARIATE_" + std::to_string(size));
        pointer += (4 * 32);
    }
    for (int size = 0; size < log_n; ++size) {
        print_fr(pointer, "GEMINI_A_EVAL_" + std::to_string(size));
        pointer += 32;
    }
    print_g1(pointer, "SHPLONK_Q");
    pointer += (4 * 32);
    print_g1(pointer, "KZG_QUOTIENT");
    pointer += (4 * 32);
    out << "\n// Challenges\n";
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
    for (int sum_u = 0; sum_u < log_n; ++sum_u) {
        print_fr(pointer, "SUM_U_CHALLENGE_" + std::to_string(sum_u));
        pointer += 32;
    }
    out << "\n// Barycentric domain\n";
    for (int i = 0; i < BARYCENTRIC_DOMAIN_SIZE; ++i) {
        print_fr(pointer, "BARYCENTRIC_LAGRANGE_DENOMINATOR_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    for (int i = 0; i < BARYCENTRIC_DOMAIN_SIZE; ++i) {
        print_fr(pointer, "BARYCENTRIC_DOMAIN_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    for (int i = 0; i < BARYCENTRIC_DOMAIN_SIZE; ++i) {
        print_fr(pointer, "BARYCENTRIC_DENOMINATOR_INVERSES_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Subrelation evaluations\n";
    for (int i = 0; i < NUMBER_OF_SUBRELATIONS; ++i) {
        print_fr(pointer, "SUBRELATION_EVAL_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Subrelation intermediates\n";
    for (const auto& item : general_intermediates) {
        print_fr(pointer, item);
        pointer += 32;
    }
    for (const auto& item : subrelation_intermediates) {
        print_fr(pointer, item);
        pointer += 32;
    }
    out << "\n// Powers of evaluation challenge\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "POWERS_OF_EVALUATION_CHALLENGE_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// 29 Inverted gemini denominators\n";
    for (int i = 0; i < log_n + 1; ++i) {
        print_fr(pointer, "INVERTED_GEMINI_DENOMINATOR_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Batch accumulators\n";
    for (int i = 0; i < 9; ++i) {
        print_fr(pointer, "BATCH_ACCUMULATOR_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Batch scalars\n";
    for (int i = 0; i < 70; ++i) {
        print_fr(pointer, "BATCH_SCALAR_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Batched evaluation accumulator inversions\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "BATCH_EVALUATION_ACCUMULATOR_INVERSION_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    print_fr(pointer, "BATCHED_EVALUATION_LOC");
    pointer += 32;
    print_fr(pointer, "CONSTANT_TERM_ACCUMULATOR_LOC");
    pointer += 32;

    // Additional memory slots for shplemini runtime memory (log_n)
    out << "\n// Inverted challenge pow minus u\n";
    for (int i = 0; i < log_n + 1; ++i) {
        print_fr(pointer, "INVERTED_CHALLENEGE_POW_MINUS_U_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Pos inverted denom\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "POS_INVERTED_DENOM_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Neg inverted denom\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "NEG_INVERTED_DENOM_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }
    out << "\n// Fold pos evaluations\n";
    for (int i = 0; i < log_n; ++i) {
        print_fr(pointer, "FOLD_POS_EVALUATIONS_" + std::to_string(i) + "_LOC");
        pointer += 32;
    }

    print_fr(pointer, "LATER_SCRATCH_SPACE");

    return out.str();
}

inline std::string get_optimized_honk_solidity_verifier(auto const& verification_key)
{
    // Read temp.sol in this directory and return it
    std::filesystem::path source_dir = std::filesystem::path(__FILE__).parent_path();
    std::filesystem::path template_path = source_dir / "temp.sol";
    std::ifstream file(template_path);
    std::stringstream buffer;
    buffer << file.rdbuf();
    std::string template_str = buffer.str();

    // Helper function to replace template variables
    auto replace_template = [&template_str](const std::string& key, const std::string& value) {
        std::string::size_type pos = template_str.find(key);
        if (pos != std::string::npos) {
            template_str.replace(pos, key.length(), value);
        }
    };

    // Fill in the circuit constants
    std::ostringstream circuit_constants_stream;
    const auto print_u256_const = [&](const std::string& name, const auto& value) {
        circuit_constants_stream << "uint256 constant " << name << " = " << value << ";" << std::endl;
    };
    print_u256_const("CIRCUIT_SIZE", verification_key->circuit_size);
    print_u256_const("LOG_N", verification_key->log_circuit_size);
    print_u256_const("NUMBER_PUBLIC_INPUTS", verification_key->num_public_inputs);
    print_u256_const("REAL_NUMBER_PUBLIC_INPUTS", verification_key->num_public_inputs - 16);
    replace_template("{{ CIRCUIT_CONSTANT }}", circuit_constants_stream.str());

    // Fill in the verification key
    std::ostringstream load_vk_stream;
    output_vk_sol_ultra_honk_opt(load_vk_stream, verification_key);
    replace_template("{{ VERIFICATION_KEY }}", load_vk_stream.str());

    // Fill in the memory layout
    std::ostringstream memory_layout_stream;
    // TODO(saleel/md): Optimize this to use the actual log_n instead of max_log_n
    memory_layout_stream << get_memory_slots_string(static_cast<int>(max_log_n));
    replace_template("{{ MEMORY_LAYOUT }}", memory_layout_stream.str());

    return template_str;
}
