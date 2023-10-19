#pragma once
#include "aztec3/constants.hpp"

#include <barretenberg/barretenberg.hpp>
namespace aztec3::utils::types {

struct NativeTypes {
    using boolean = bool;

    using uint8 = uint8_t;
    using uint16 = uint16_t;
    using uint32 = uint32_t;
    using uint64 = uint64_t;
    using uint256 = uint256_t;

    using fr = barretenberg::fr;
    using address = proof_system::plonk::stdlib::address;

    using fq = barretenberg::fq;

    // typedef fq grumpkin_fr;
    // typedef fr grumpkin_fq;
    using grumpkin_point = grumpkin::g1::affine_element;
    // typedef grumpkin::g1::element grumpkin_jac_point;

    using bn254_point = barretenberg::g1::affine_element;
    // typedef barretenberg::g1::element bn254_jac_point;
    // typedef barretenberg::g1 bn254_group;

    using bit_array = std::vector<bool>;
    using byte_array = std::vector<uint8_t>;
    using packed_byte_array = std::string;

    using schnorr_signature = crypto::schnorr::signature;
    using ecdsa_signature = crypto::ecdsa::signature;

    using AggregationObject = proof_system::plonk::stdlib::recursion::native_aggregation_state;
    using VKData = plonk::verification_key_data;
    using VK = plonk::verification_key;
    using Proof = plonk::proof;

    static crypto::GeneratorContext<curve::Grumpkin> get_generator_context(const size_t hash_index)
    {
        crypto::GeneratorContext<curve::Grumpkin> result;
        result.offset = hash_index;
        return result;
    }

    // Define the 'native' version of the function `hash`, with the name `hash`:
    static fr hash(const std::vector<fr>& inputs, const size_t hash_index = 0)
    {
        // TODO(kev): This is a janky way to get a "hash" without adding pedersen hash
        // opcode to Noir.
        auto input_size = fr(inputs.size());
        std::vector<fr> modified_inputs = inputs;
        modified_inputs.insert(modified_inputs.begin(), input_size);
        return crypto::pedersen_commitment::commit_native(modified_inputs, get_generator_context(hash_index)).x;
    }

    /**
     * @brief Compute the hash for a pair of left and right nodes in a merkle tree.
     *
     * @details Compress the two nodes using the default/0-generator which is reserved
     * for internal merkle hashing.
     *
     * @param left The left child node
     * @param right The right child node
     * @return The computed Merkle tree hash for the given pair of nodes
     */
    static fr merkle_hash(fr left, fr right)
    {
        // use 0-generator for internal merkle hashing
        // use lookup namespace since we now use ultraplonk
        auto input_size = fr(2);
        return crypto::pedersen_commitment::commit_native({ input_size, left, right }, 0).x;
    }

    static grumpkin_point commit(const std::vector<fr>& inputs, const size_t hash_index = 0)
    {
        return crypto::pedersen_commitment::commit_native(inputs, get_generator_context(hash_index));
    }

    static byte_array blake2s(const byte_array& input)
    {
        auto res = blake2::blake2s(input);
        return byte_array(res.begin(), res.end());
    }

    static byte_array blake3s(const byte_array& input) { return blake3::blake3s(input); }

    // These two methods both exist in plonk::stdlib::merkle_tree.
    // We've moved them here temporarily so that we can call pedersen_commitment::commit_native
    // instead of pedersen_hash. So that the code can match Noir.
    //
    // We cannot implement pedersen hash in Noir with only pedersen_commitment::commit
    // because there is a special length's generator that is not exposed.
    //
    // We will need to add a pedersen_hash::hash blackbox function.
    static inline std::vector<barretenberg::fr> compute_tree_native(std::vector<barretenberg::fr> const& input)
    {
        // Check if the input vector size is a power of 2.
        ASSERT(input.size() > 0);
        ASSERT(numeric::is_power_of_two(input.size()));
        auto layer = input;
        std::vector<barretenberg::fr> tree(input);
        while (layer.size() > 1) {
            std::vector<barretenberg::fr> next_layer(layer.size() / 2);
            for (size_t i = 0; i < next_layer.size(); ++i) {
                // TODO(kev): janky way to get a hash without adding
                // pedersen hash opcode to Noir.
                auto input_size = fr(2);
                next_layer[i] =
                    crypto::pedersen_commitment::commit_native({ input_size, layer[i * 2], layer[i * 2 + 1] }).x;
                tree.push_back(next_layer[i]);
            }
            layer = std::vector(next_layer);
        }
        return tree;
    }
    static inline barretenberg::fr compute_tree_root_native(std::vector<barretenberg::fr> const& input)
    {
        // Check if the input vector size is a power of 2.
        ASSERT(input.size() > 0);
        ASSERT(numeric::is_power_of_two(input.size()));
        auto layer = input;
        while (layer.size() > 1) {
            std::vector<barretenberg::fr> next_layer(layer.size() / 2);
            for (size_t i = 0; i < next_layer.size(); ++i) {
                // TODO(kev): janky way to get a hash without adding
                // pedersen hash opcode to Noir.
                auto input_size = fr(2);
                next_layer[i] =
                    crypto::pedersen_commitment::commit_native({ input_size, layer[i * 2], layer[i * 2 + 1] }).x;
            }
            layer = std::move(next_layer);
        }

        return layer[0];
    }
};

}  // namespace aztec3::utils::types