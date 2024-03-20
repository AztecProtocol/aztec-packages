// #include <bitset> #include <iostream> #include <sstream> #include "barretenberg/honk/proof_system/types/proof.hpp"
// #include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp" #include "circuits/add_2_circuit.hpp"
// #include "circuits/blake_circuit.hpp" #include "circuits/ecdsa_circuit.hpp" #include "utils/utils.hpp" using
// bb::numeric::uint256_t; using namespace bb;

// template <template <typename> typename Circuit> void generate_proof(std::vector<uint256_t> inputs)
// {
//     // REMOVE _ JUST TO COMPILE
//     for (size_t i = 0; i < 6; i++) {
//         std::cout << inputs[i] << std::endl;
//     }

//     // auto circuit = Circuit<UltraComposer::CircuitBuilder>::generate(inputs);
//     // // auto circuit = Circuit<UltraSolidityComposer::CircuitBuilder>::generate(inputs);

//     // UltraComposer composer;
//     // // UltraSolidityComposer composer;

//     // auto instance = composer.create_instance(circuit);
//     // auto prover = composer.create_prover(instance);
//     // HonkProof proof = prover.construct_proof();
//     // {
//     //     auto verifier = composer.create_verifier(instance);

//     //     if (!verifier.verify_proof(proof)) {
//     //         throw_or_abort("Verification failed");
//     //     }

//     //     std::vector<uint8_t> proof_bytes = to_buffer(proof);
//     //     std::string p = bytes_to_hex_string(proof_bytes);
//     //     std::cout << p;
//     // }
// }

// std::string pad_left(std::string input, size_t length)
// {
//     return std::string(length - std::min(length, input.length()), '0') + input;
// }

// /**
//  * @brief Main entry point for the proof generator.
//  * Expected inputs:
//  * 1. plonk_flavour: ultra
//  * 2. circuit_flavour: blake, add2
//  * 3. public_inputs: comma separated list of public inputs
//  * 4. project_root_path: path to the solidity project root
//  * 5. srs_path: path to the srs db
//  */
// int main(int argc, char** argv)
// {
//     std::vector<std::string> args(argv, argv + argc);

//     if (args.size() < 5) {
//         info("usage: ", args[0], "[plonk flavour] [circuit flavour] [srs path] [public inputs]");
//         return 1;
//     }

//     const std::string plonk_flavour = args[1];
//     const std::string circuit_flavour = args[2];
//     const std::string srs_path = args[3];
//     const std::string string_input = args[4];

//     info("plonk_flavour: ", plonk_flavour);
//     info("circuit_flavour: ", circuit_flavour);
//     info("srs_path: ", srs_path);
//     info("public_inputs: ", string_input);

//     bb::srs::init_crs_factory(srs_path);

//     // @todo dynamically allocate this
//     uint256_t inputs[] = { 0, 0, 0, 0, 0, 0 };

//     size_t count = 0;
//     std::stringstream s_stream(string_input);
//     while (s_stream.good()) {
//         std::string sub;
//         getline(s_stream, sub, ',');
//         if (sub.substr(0, 2) == "0x") {
//             sub = sub.substr(2);
//         }
//         std::string padded = pad_left(sub, 64);
//         inputs[count++] = uint256_t(padded);
//     }

//     if (plonk_flavour != "honk") {
//         info("Only honk flavour allowed");
//         return 1;
//     }

//     if (circuit_flavour == "blake") {
//         generate_proof<BlakeCircuit>(inputs);
//     } else if (circuit_flavour == "add2") {
//         generate_proof<Add2Circuit>(inputs);
//     } else if (circuit_flavour == "ecdsa") {
//         generate_proof<EcdsaCircuit>(inputs);
//     } else {
//         info("Invalid circuit flavour: " + circuit_flavour);
//         return 1;
//     }
// }