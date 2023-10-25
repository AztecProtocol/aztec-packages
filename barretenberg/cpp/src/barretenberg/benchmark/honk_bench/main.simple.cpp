/* Entry point for profiling with e.g. LLVM xray.
 * This provides a simple entrypoint to bypass artifacts with
 * TODO(AD): Consider if we can directly profile the bench executables.
 */
#include <cstdint>
#include <cstdlib>
#include <string>

#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/honk/composer/ultra_composer.hpp"
#include "barretenberg/plonk/composer/ultra_composer.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/types/circuit_type.hpp"
#include "barretenberg/stdlib/encryption/ecdsa/ecdsa.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/stdlib/hash/sha256/sha256.hpp"
#include "barretenberg/stdlib/merkle_tree/membership.hpp"
#include "barretenberg/stdlib/merkle_tree/memory_store.hpp"
#include "barretenberg/stdlib/merkle_tree/memory_tree.hpp"
#include "barretenberg/stdlib/merkle_tree/merkle_tree.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"

using namespace proof_system;

template <typename Builder> void generate_sha256_test_circuit(Builder& builder, size_t num_iterations)
{
    std::string in;
    in.resize(32);
    plonk::stdlib::packed_byte_array<Builder> input(&builder, in);
    for (size_t i = 0; i < num_iterations; i++) {
        input = plonk::stdlib::sha256<Builder>(input);
    }
}

BBERG_PROFILE void honk_profiling(honk::UltraProver& ext_prover)
{
    for (size_t i = 0; i < 200; i++) {
        ext_prover.construct_proof();
    }
}

BBERG_PROFILE void plonk_profiling(plonk::UltraProver& ext_prover)
{
    for (size_t i = 0; i < 200; i++) {
        ext_prover.construct_proof();
    }
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void construct_proof_ultrahonk() noexcept
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    // Constuct circuit and prover; don't include this part in measurement
    honk::UltraComposer::CircuitBuilder builder;
    generate_sha256_test_circuit(builder, 1);
    std::cout << "gates: " << builder.get_total_circuit_size() << std::endl;

    honk::UltraComposer composer;
    std::shared_ptr<honk::UltraComposer::Instance> instance = composer.create_instance(builder);
    honk::UltraProver ext_prover = composer.create_prover(instance);
    honk_profiling(ext_prover);
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void construct_proof_ultraplonk() noexcept
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    // Constuct circuit and prover; don't include this part in measurement
    plonk::UltraComposer::CircuitBuilder builder;
    generate_sha256_test_circuit(builder, 1);
    std::cout << "gates: " << builder.get_total_circuit_size() << std::endl;

    plonk::UltraComposer composer;
    plonk::UltraProver ext_prover = composer.create_prover(builder);
    plonk_profiling(ext_prover);
}

int main()
{
    construct_proof_ultraplonk();
}