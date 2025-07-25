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

// Source code for the Ultrahonk Solidity verifier.
// It's expected that the AcirComposer will inject a library which will load the verification key into memory.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-c-arrays)
static const char HONK_CONTRACT_OPT_SOURCE[] = R"(
)";

inline std::string get_optimized_honk_solidity_verifier(auto const& verification_key)
{

    // Reaf temp.sol in this directory and return it
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

    return template_str;
}
