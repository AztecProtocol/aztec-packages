#pragma once

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include <functional>
#include <random>
#include <vector>

template <typename T>
void mutate_vec(std::vector<T>& vec,
                std::mt19937_64& rng,
                std::function<void(T&, std::mt19937_64&)> mutate_element_function,
                std::function<T(std::mt19937_64&)> generate_random_element_function,
                const VecMutationConfig& config);
