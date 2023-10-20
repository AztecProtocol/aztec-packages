/* Entry point for profiling with e.g. LLVM xray.
 * This provides a simple entrypoint to bypass artifacts with
 * TODO(AD): Consider if we can directly profile the bench executables.
 */
#include <cstdint>
#include <cstdlib>
#include <string>

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

template <typename Builder> void generate_keccak_test_circuit(Builder& builder, size_t num_iterations)
{
    std::string in = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";

    proof_system::plonk::stdlib::byte_array<Builder> input(&builder, in);
    for (size_t i = 0; i < num_iterations; i++) {
        input = proof_system::plonk::stdlib::keccak<Builder>::hash(input);
    }
}

BBERG_INSTRUMENT BBERG_NOINLINE void prover_profiling(auto& ext_prover)
{
    for (size_t i = 0; i < 1; i++) {
        ext_prover.construct_proof();
    }
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void construct_honk_proof_ultra() noexcept
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    // Constuct circuit and prover; don't include this part in measurement

    for (int i = 0; i < 10; i++) {
        honk::UltraComposer::CircuitBuilder builder;
        generate_keccak_test_circuit(builder, 1);
        std::cout << "gates: " << builder.get_total_circuit_size() << std::endl;
        honk::UltraComposer composer;
        std::shared_ptr<honk::UltraComposer::Instance> instance = composer.create_instance(builder);
        std::cout << "gates: " << builder.get_total_circuit_size() << std::endl;
        honk::UltraProver ext_prover = composer.create_prover(instance);
        prover_profiling(ext_prover);
    }
}

void construct_plonk_proof_ultra() noexcept
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    for (int i = 0; i < 10; i++) {
        plonk::UltraComposer::CircuitBuilder builder;
        generate_keccak_test_circuit(builder, 1);
        plonk::UltraComposer composer;
        plonk::UltraProver ext_prover = composer.create_prover(builder);
        std::cout << "gates: " << builder.get_total_circuit_size() << std::endl;
        prover_profiling(ext_prover);
    }
}
int main()
{
    construct_honk_proof_ultra();
    // construct_plonk_proof_ultra();
}
