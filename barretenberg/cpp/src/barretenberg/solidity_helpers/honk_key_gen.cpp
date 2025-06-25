
#include <iostream>
#include <memory>

#include "barretenberg/honk/utils/honk_key_gen.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include "circuits/add_2_circuit.hpp"
#include "circuits/blake_circuit.hpp"
#include "circuits/ecdsa_circuit.hpp"

using namespace bb;

using DeciderProvingKey = DeciderProvingKey_<UltraKeccakFlavor>;
using VerificationKey = UltraKeccakFlavor::VerificationKey;

template <typename Circuit> void generate_keys_honk(const std::string& output_path, std::string circuit_name)
{
    uint256_t public_inputs[4] = { 0, 0, 0, 0 };
    UltraCircuitBuilder builder = Circuit::generate(public_inputs);
    stdlib::recursion::PairingPoints<UltraCircuitBuilder>::add_default_to_public_inputs(builder);

    auto proving_key = std::make_shared<DeciderProvingKey>(builder);
    auto verification_key = std::make_shared<VerificationKey>(proving_key->proving_key);
    UltraKeccakProver prover(proving_key, verification_key);

    // Make verification key file upper case
    circuit_name.at(0) = static_cast<char>(std::toupper(static_cast<unsigned char>(circuit_name.at(0))));
    std::string flavor_prefix = "Honk";

    std::string vk_class_name = circuit_name + flavor_prefix + "VerificationKey";
    std::string base_class_name = "Base" + flavor_prefix + "Verifier";
    std::string instance_class_name = circuit_name + flavor_prefix + "Verifier";

    {
        auto vk_filename = output_path + "/keys/" + vk_class_name + ".sol";
        std::ofstream os(vk_filename);
        output_vk_sol_ultra_honk(os, verification_key, vk_class_name, true);
        info("VK contract written to: ", vk_filename);
    }
}

/*
 * @brief Main entry point for the honk verification key generator
 *
 * 1. project_root_path: path to the solidity project root
 * 2. srs_path: path to the srs db
 */
int main(int argc, char** argv)
{
    std::vector<std::string> args(argv, argv + argc);

    if (args.size() < 4) {
        info("usage: ", args[0], " [circuit type] [output path] [srs path]");
        return 1;
    }

    const std::string circuit_flavor = args[1];
    const std::string output_path = args[2];
    const std::string srs_path = args[3];

    bb::srs::init_file_crs_factory(srs_path);

    info("Generating keys for ", circuit_flavor, " circuit");

    if (circuit_flavor == "add2") {
        generate_keys_honk<Add2Circuit>(output_path, circuit_flavor);
    } else if (circuit_flavor == "blake") {
        generate_keys_honk<BlakeCircuit>(output_path, circuit_flavor);
    } else if (circuit_flavor == "ecdsa") {
        generate_keys_honk<bb::EcdsaCircuit>(output_path, circuit_flavor);
    } else {
        info("Unsupported circuit");
        return 1;
    }
    return 0;
} // namespace bb
