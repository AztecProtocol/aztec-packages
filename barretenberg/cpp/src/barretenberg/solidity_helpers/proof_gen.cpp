#include <bitset>
#include <iostream>
#include <sstream>

#include "barretenberg/plonk/composer/standard_composer.hpp"
#include "barretenberg/plonk/composer/ultra_composer.hpp"

#include "circuits/add_2_circuit.hpp"
#include "circuits/blake_circuit.hpp"
#include "circuits/ecdsa_circuit.hpp"
#include "circuits/recursive_circuit.hpp"
#include "utils/utils.hpp"

using namespace bb::numeric;
using numeric::uint256_t;

template <typename Circuit> void generate_proof(uint256_t inputs[])
{
    UltraCircuitBuilder builder = Circuit::generate(inputs);

    UltraComposer composer;
    // @todo this only works for ultra! Why is ultra part of function name on ultra composer?
    auto prover = composer.create_ultra_with_keccak_prover(builder);
    auto proof = prover.construct_proof();
    {
        auto verifier = composer.create_ultra_with_keccak_verifier(builder);

        if (!verifier.verify_proof(proof)) {
            throw_or_abort("Verification failed");
        }

        std::string proof_bytes = bytes_to_hex_string(proof.proof_data);
        std::cout << proof_bytes;
    }
}

std::string pad_left(std::string input, size_t length)
{
    return std::string(length - std::min(length, input.length()), '0') + input;
}

/**
 * @brief Main entry point for the proof generator.
 * Expected inputs:
 * 1. plonk_flavor: ultra
 * 2. circuit_flavor: blake, add2, recursive
 * 3. public_inputs: comma separated list of public inputs
 * 4. project_root_path: path to the solidity project root
 * 5. srs_path: path to the srs db
 */
int main(int argc, char** argv)
{
    std::vector<std::string> args(argv, argv + argc);

    if (args.size() < 5) {
        info("usage: ", args[0], "[plonk flavor] [circuit flavor] [srs path] [public inputs]");
        return 1;
    }

    const std::string plonk_flavor = args[1];
    const std::string circuit_flavor = args[2];
    const std::string srs_path = args[3];
    const std::string string_input = args[4];

    bb::srs::init_crs_factory(srs_path);

    // @todo dynamically allocate this
    uint256_t inputs[] = { 0, 0, 0, 0, 0, 0 };

    size_t count = 0;
    std::stringstream s_stream(string_input);
    while (s_stream.good()) {
        std::string sub;
        getline(s_stream, sub, ',');
        if (sub.substr(0, 2) == "0x") {
            sub = sub.substr(2);
        }
        std::string padded = pad_left(sub, 64);
        inputs[count++] = uint256_t(padded);
    }

    if (plonk_flavor != "ultra") {
        info("Only ultra plonk flavor is supported at the moment");
        return 1;
    }

    if (circuit_flavor == "blake") {
        generate_proof<BlakeCircuit>(inputs);
    } else if (circuit_flavor == "add2") {
        generate_proof<Add2Circuit>(inputs);
    } else if (circuit_flavor == "ecdsa") {
        generate_proof<EcdsaCircuit>(inputs);
    } else if (circuit_flavor == "recursive") {
        generate_proof<RecursiveCircuit>(inputs);
    } else {
        info("Invalid circuit flavor: " + circuit_flavor);
        return 1;
    }
}
