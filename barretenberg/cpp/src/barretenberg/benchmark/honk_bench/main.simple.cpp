/* Entry point for profiling with e.g. LLVM xray.
 * This provides a simple entrypoint to bypass artifacts with
 * TODO(AD): Consider if we can directly profile the bench executables.
 */
#include <cstdint>
#include <cstdlib>
#include <string>

#include "barretenberg/honk/composer/ultra_composer.hpp"
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

using namespace proof_system::plonk;

using UltraBuilder = proof_system::UltraCircuitBuilder;
using UltraHonk = proof_system::honk::UltraComposer;

template <typename Builder> void generate_sha256_test_circuit(Builder& builder, size_t num_iterations)
{
    std::string in;
    in.resize(32);
    proof_system::plonk::stdlib::packed_byte_array<Builder> input(&builder, in);
    for (size_t i = 0; i < num_iterations; i++) {
        input = proof_system::plonk::stdlib::sha256<Builder>(input);
    }
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void construct_proof_ultra() noexcept
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    // Constuct circuit and prover; don't include this part in measurement
    auto builder = typename UltraHonk::CircuitBuilder();
    generate_sha256_test_circuit<UltraBuilder>(builder, 1);

    auto composer = UltraHonk();
    auto instance = composer.create_instance(builder);
    auto ext_prover = composer.create_prover(instance);
    for (size_t i = 0; i < 10; i++) {
        auto proof = ext_prover.construct_proof();
    }
}

int main()
{
    construct_proof_ultra();
}
