
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include "circuits/add_2_circuit.hpp"
#include "circuits/blake_circuit.hpp"
#include "circuits/ecdsa_circuit.hpp"
#include "utils/utils.hpp"

#include <iostream>
#include <sstream>

using namespace bb;
using numeric::uint256_t;

// Get rid of the inner typename
template <typename Circuit, typename Flavor> void generate_proof(uint256_t inputs[])
{
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    UltraCircuitBuilder builder = Circuit::generate(inputs);
    stdlib::recursion::PairingPoints<UltraCircuitBuilder>::add_default_to_public_inputs(builder);

    auto instance = std::make_shared<DeciderProvingKey>(builder);
    Prover prover(instance);
    auto verification_key = std::make_shared<VerificationKey>(instance->proving_key);
    Verifier verifier(verification_key);

    HonkProof proof = prover.construct_proof();
    {
        if (!verifier.verify_proof(proof)) {
            throw_or_abort("Verification failed");
        }

        std::vector<uint8_t> proof_bytes = to_buffer(proof);
        std::string p = bytes_to_hex_string(proof_bytes);
        std::cout << p;
    }
}

std::string pad_left(std::string input, size_t length)
{
    return std::string(length - std::min(length, input.length()), '0') + input;
}

/**
 * @brief Main entry point for the proof generator.
 * Expected inputs:
 * 1. flavor: ultra_keccak
 * 2. circuit_type: blake, add2
 * 3. public_inputs: comma separated list of public inputs
 * 4. project_root_path: path to the solidity project root
 * 5. srs_path: path to the srs db
 */
int main(int argc, char** argv)
{
    std::vector<std::string> args(argv, argv + argc);

    if (args.size() < 5) {
        info("usage: ", args[0], "[honk flavor] [circuit type] [srs path] [public inputs]");
        return 1;
    }

    const std::string flavor = args[1];
    const std::string circuit_type = args[2];
    const std::string srs_path = args[3];
    const std::string string_input = args[4];

    bb::srs::init_file_crs_factory(srs_path);

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

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1227)
    if (flavor == "honk") {
        if (circuit_type == "blake") {
            generate_proof<BlakeCircuit, UltraKeccakFlavor>(inputs);
        } else if (circuit_type == "add2") {
            generate_proof<Add2Circuit, UltraKeccakFlavor>(inputs);
        } else if (circuit_type == "ecdsa") {
            generate_proof<EcdsaCircuit, UltraKeccakFlavor>(inputs);
        } else {
            info("Invalid circuit type: " + circuit_type);
            return 1;
        }

    } else if (flavor == "honk_zk") {
        if (circuit_type == "blake") {
            generate_proof<BlakeCircuit, UltraKeccakZKFlavor>(inputs);
        } else if (circuit_type == "add2") {
            generate_proof<Add2Circuit, UltraKeccakZKFlavor>(inputs);
        } else if (circuit_type == "ecdsa") {
            generate_proof<EcdsaCircuit, UltraKeccakZKFlavor>(inputs);
        } else {
            info("Invalid circuit type: " + circuit_type);
            return 1;
        }
    } else {
        info("Only honk flavor allowed");
        return 1;
    }
}
