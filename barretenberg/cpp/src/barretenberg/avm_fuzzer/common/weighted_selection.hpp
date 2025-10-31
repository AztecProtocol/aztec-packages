#pragma once

#include <array>
#include <random>
#include <stdexcept>
#include <vector>

template <typename T, size_t N> class WeightedSelectionConfig {
  private:
    std::array<std::pair<T, size_t>, N> options_with_weights;
    size_t total_weight = 0;

  public:
    constexpr WeightedSelectionConfig(const std::array<std::pair<T, size_t>, N>& options_with_weights)
        : options_with_weights(options_with_weights)
    {
        for (const auto& [option, weight] : options_with_weights) {
            total_weight += weight;
        }
    }

    constexpr WeightedSelectionConfig(std::initializer_list<std::pair<T, size_t>> options_with_weights)
        : options_with_weights()
    {
        size_t i = 0;
        for (const auto& [option, weight] : options_with_weights) {
            this->options_with_weights[i] = { option, weight };
            total_weight += weight;
            ++i;
        }
    }

    T select(std::mt19937_64& rng) const
    {
        std::uniform_int_distribution<size_t> dist(0, total_weight - 1);
        size_t selector = dist(rng);

        for (const auto& [option, weight] : options_with_weights) {
            if (selector < weight) {
                return option;
            }
            selector -= weight;
        }

        throw std::runtime_error("Should have returned by now");
    }
};
