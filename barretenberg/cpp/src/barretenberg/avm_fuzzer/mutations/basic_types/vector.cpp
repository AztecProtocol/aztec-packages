/// This file contains mechanisms for deterministically mutating a given vector
/// Types of mutations applied:
/// 1. Insert a random element at a random index
/// 2. Delete a random element at a random index
/// 3. Swap two random elements at random indices
/// 4. Mutate a random element at a random index

#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"

#include <algorithm>
#include <array>
#include <functional>
#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

/// @brief Insert a random element at a random index
struct RandomInsertion {
    template <typename T>
    static void mutate(std::mt19937_64& rng,
                       std::vector<T>& vec,
                       std::function<T(std::mt19937_64&)> generate_random_element_function)
    {
        T element = generate_random_element_function(rng);
        if (!vec.empty()) {
            std::uniform_int_distribution<size_t> dist(0, vec.size());
            size_t index = dist(rng);
            vec.insert(vec.begin() + static_cast<std::ptrdiff_t>(index), element);
        } else {
            vec.push_back(element);
        }
    }
};

/// @brief Delete a random element at a random index
struct RandomDeletion {
    template <typename T> static void mutate(std::mt19937_64& rng, std::vector<T>& vec)
    {
        if (vec.size() >= 1) {
            std::uniform_int_distribution<size_t> dist(0, vec.size() - 1);
            size_t index = dist(rng);
            vec.erase(vec.begin() + static_cast<std::ptrdiff_t>(index));
        }
    }
};

/// @brief Swap two random elements at random indices
struct RandomSwap {
    template <typename T> static void mutate(std::mt19937_64& rng, std::vector<T>& vec)
    {
        if (!vec.empty()) {
            std::uniform_int_distribution<size_t> dist(0, vec.size() - 1);
            size_t index1 = dist(rng);
            size_t index2 = dist(rng);
            std::swap(vec[index1], vec[index2]);
        }
    }
};

/// @brief Mutate a random element at a random index
struct RandomElementMutation {
    template <typename T>
    static void mutate(std::mt19937_64& rng,
                       std::vector<T>& vec,
                       std::function<void(T&, std::mt19937_64&)> mutate_element_function)
    {
        if (!vec.empty()) {
            std::uniform_int_distribution<size_t> dist(0, vec.size() - 1);
            size_t index = dist(rng);
            mutate_element_function(vec[index], rng);
        }
    }
};

template <typename T>
void mutate_vec(std::vector<T>& vec,
                std::mt19937_64& rng,
                std::function<void(T&, std::mt19937_64&)> mutate_element_function,
                std::function<T(std::mt19937_64&)> generate_random_element_function,
                const VecMutationConfig& config)
{
    VecMutationOptions option = config.select(rng);
    switch (option) {
    case VecMutationOptions::Insertion:
        RandomInsertion::mutate(rng, vec, generate_random_element_function);
        break;
    case VecMutationOptions::Deletion:
        RandomDeletion::mutate(rng, vec);
        break;
    case VecMutationOptions::Swap:
        RandomSwap::mutate(rng, vec);
        break;
    case VecMutationOptions::ElementMutation:
        RandomElementMutation::mutate(rng, vec, mutate_element_function);
        break;
    }
}

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/control_flow/control_flow_vec.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

template void mutate_vec<CFGInstruction>(
    std::vector<CFGInstruction>& vec,
    std::mt19937_64& rng,
    std::function<void(CFGInstruction&, std::mt19937_64&)> mutate_element_function,
    std::function<CFGInstruction(std::mt19937_64&)> generate_random_element_function,
    const VecMutationConfig& config);

template void mutate_vec<FuzzInstruction>(
    std::vector<FuzzInstruction>& vec,
    std::mt19937_64& rng,
    std::function<void(FuzzInstruction&, std::mt19937_64&)> mutate_element_function,
    std::function<FuzzInstruction(std::mt19937_64&)> generate_random_element_function,
    const VecMutationConfig& config);

template void mutate_vec<std::vector<FuzzInstruction>>(
    std::vector<std::vector<FuzzInstruction>>& vec,
    std::mt19937_64& rng,
    std::function<void(std::vector<FuzzInstruction>&, std::mt19937_64&)> mutate_element_function,
    std::function<std::vector<FuzzInstruction>(std::mt19937_64&)> generate_random_element_function,
    const VecMutationConfig& config);
