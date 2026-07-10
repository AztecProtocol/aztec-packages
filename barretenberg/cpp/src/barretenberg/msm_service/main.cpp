#include "barretenberg/bb/deps/cli11.hpp"
#include "barretenberg/msm_service/msm_ipc_server.hpp"

#include <cstdlib>
#include <iostream>
#include <string>

int main(int argc, char* argv[])
{
    CLI::App app{ "bb-msm: box-local MSM offload server (single resident BN254 SRS)" };
    app.require_subcommand(1);

    CLI::App* msgpack_command = app.add_subcommand("msgpack", "Msgpack API interface.");
    CLI::App* run_command = msgpack_command->add_subcommand("run", "Start the MSM IPC server.");

    std::string input_path;
    run_command->add_option("-i,--input", input_path, "IPC socket/shm path (.sock for UDS, .shm for shared memory)")
        ->required();

    std::string crs_path;
    run_command->add_option("-c,--crs-path", crs_path, "CRS directory (default: ~/.bb-crs, downloads if missing)");

    size_t num_points = size_t{ 1 } << 24;
    run_command->add_option("-n,--num-points", num_points, "Resident BN254 SRS prefix size (default: 2^24)");

    bool no_gpu = false;
    run_command->add_flag("--no-gpu", no_gpu, "Force the CPU MSM path even when GPU support is linked");

    // SHM only: a message must fit in half a ring (minus the 4-byte length prefix), and
    // MSM request chunks run to 128 MiB, so the request ring defaults to 512 MiB.
    size_t request_ring_size = size_t{ 512 } << 20;
    run_command
        ->add_option("--request-ring-size", request_ring_size, "SHM request ring size in bytes (default: 512 MiB)")
        ->check(CLI::PositiveNumber);

    size_t response_ring_size = size_t{ 1 } << 20;
    run_command
        ->add_option("--response-ring-size", response_ring_size, "SHM response ring size in bytes (default: 1 MiB)")
        ->check(CLI::PositiveNumber);

    try {
        app.parse(argc, argv);
    } catch (const CLI::ParseError& e) {
        return app.exit(e);
    }

    if (!no_gpu) {
        // Enable the facade's GPU dispatch when ecc_gpu is linked; harmless otherwise.
        setenv("BB_MSM_GPU", "1", /*overwrite=*/0);
    } else {
        unsetenv("BB_MSM_GPU");
    }

    try {
        return bb::msm_service::execute_msm_server(
            input_path, crs_path, num_points, request_ring_size, response_ring_size);
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << '\n';
        return 1;
    }
}
