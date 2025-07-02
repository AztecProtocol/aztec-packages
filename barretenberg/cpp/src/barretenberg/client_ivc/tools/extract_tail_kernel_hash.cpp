#include "barretenberg/client_ivc/private_execution_steps.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <filesystem>
#include <fstream>
#include <iostream>

using namespace bb;

// This file extracts the hashes of the verification keys of the two types of
// tail circuits. To run, either do:
//  a.
//      export  AZTEC_CACHE_COMMIT=origin/master~3
//      export DOWNLOAD_ONLY=1
//  b.
//      bootstrap (from aztec-packages)
// Then run:
//      yarn-project/end-to-end/bootstrap.sh build_bench

int main()
{

    // Initialize CRS first
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    // we abbreviate: private_tail_kernel --> ptk and
    // private_tail_kernel_to_public --> ptktp

    // the transactions corresponding to input_path_ptk and input_path_ptktp
    // end with private_tail_kernel and private_tail_kernel_to_public respectively.

    // this may be seen by examining the `logs.json` files corresponding to each transaction.
    std::string input_path_ptk =
        "/mnt/user-data/raju/aztec-packages/yarn-project/end-to-end/example-app-ivc-inputs-out/"
        "ecdsar1+transfer_0_recursions+sponsored_fpc/ivc-inputs.msgpack";

    std::cout << "Processing first input: " << input_path_ptk << std::endl;
    PrivateExecutionSteps steps;
    steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path_ptk));
    auto first_hash = steps.extract_tail_kernel_hash();
    std::cout << "First input processed successfully" << std::endl;

    // Second input path, which corresponds to `private_tail_kernel_to_public`
    std::string input_path_ptktp =
        "/mnt/user-data/raju/aztec-packages/yarn-project/end-to-end/example-app-ivc-inputs-out/"
        "ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc/ivc-inputs.msgpack";

    assert(std::filesystem::exists(input_path_ptk) &&
           "First input file not found. Please make sure you have run the correct yarn projects");
    assert(std::filesystem::exists(input_path_ptktp) &&
           "Second input file not found. Please make sure you have run the correct yarn projects");

    std::cout << "Processing second input: " << input_path_ptktp << std::endl;
    PrivateExecutionSteps second_steps;
    second_steps.parse(PrivateExecutionStepRaw::load_and_decompress(input_path_ptktp));
    auto second_hash = second_steps.extract_tail_kernel_hash();
    std::cout << "Second input processed successfully" << std::endl;

    // Write hashes to file
    std::string output_file =
        "/mnt/user-data/raju/aztec-packages/barretenberg/cpp/src/barretenberg/client_ivc/tail_kernel_hashes.txt";
    std::ofstream file(output_file);

    assert(file.is_open() && ("Failed to open output file: " + output_file).c_str());

    file << "private_tail_kernel:" << first_hash << std::endl;
    file << "private_tail_kernel_to_public:" << second_hash << std::endl;
    file.close();

    std::cout << "VK extraction completed successfully!" << std::endl;
    std::cout << "Hashes written to: " << output_file << std::endl;

    // Also print to console for verification
    std::cout << "\nExtracted hashes:" << std::endl;
    std::cout << "private_tail_kernel: " << first_hash << std::endl;
    std::cout << "private_tail_kernel_to_public: " << second_hash << std::endl;
    std::cout.flush();

    return 0;
}
