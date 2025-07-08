#pragma once

#include <memory>
#include <string_view>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_bitwise.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_p_decomposition.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/test_interaction_builder.hpp"

namespace bb::avm2::tracegen {

enum class InteractionType {
    LookupGeneric,
    LookupSequential,
    LookupIntoBitwise,
    LookupIntoIndexedByClk,
    LookupIntoPDecomposition,
    Permutation,
};

class InteractionDefinition {
  public:
    InteractionDefinition() = default;

    template <typename InteractionSettings, InteractionType type> InteractionDefinition& add()
    {
        interactions[InteractionSettings::NAME] = get_interaction_factory<InteractionSettings, type>();
        return *this;
    }

    // Jobs for production.
    std::vector<std::unique_ptr<InteractionBuilderInterface>> get_all_jobs() const;
    // Stricter/more assertive jobs for testing.
    std::vector<std::unique_ptr<InteractionBuilderInterface>> get_all_test_jobs() const;

    std::unique_ptr<InteractionBuilderInterface> get_job(std::string_view interaction_name) const;
    std::unique_ptr<InteractionBuilderInterface> get_test_job(std::string_view interaction_name) const;
    template <typename InteractionSettings> std::unique_ptr<InteractionBuilderInterface> get_test_job() const
    {
        return get_test_job(InteractionSettings::NAME);
    }

  private:
    using Factory = std::function<std::unique_ptr<InteractionBuilderInterface>(bool strict)>;
    std::unordered_map<std::string_view, Factory> interactions;

    template <typename InteractionSettings, InteractionType type> static Factory get_interaction_factory()
    {
        if constexpr (type == InteractionType::LookupGeneric) {
            return [](bool) {
                // This class always checks.
                return std::make_unique<LookupIntoDynamicTableGeneric<InteractionSettings>>();
            };
        } else if constexpr (type == InteractionType::LookupIntoBitwise) {
            return [](bool strict) {
                return strict ? std::make_unique<AddChecksToBuilder<LookupIntoBitwise<InteractionSettings>>>()
                              : std::make_unique<LookupIntoBitwise<InteractionSettings>>();
            };
        } else if constexpr (type == InteractionType::LookupIntoIndexedByClk) {
            return [](bool strict) {
                return strict ? std::make_unique<AddChecksToBuilder<LookupIntoIndexedByClk<InteractionSettings>>>()
                              : std::make_unique<LookupIntoIndexedByClk<InteractionSettings>>();
            };
        } else if constexpr (type == InteractionType::LookupIntoPDecomposition) {
            return [](bool strict) {
                return strict ? std::make_unique<AddChecksToBuilder<LookupIntoPDecomposition<InteractionSettings>>>()
                              : std::make_unique<LookupIntoPDecomposition<InteractionSettings>>();
            };
        } else if constexpr (type == InteractionType::LookupSequential) {
            return [](bool) {
                // This class always checks.
                return std::make_unique<LookupIntoDynamicTableSequential<InteractionSettings>>();
            };
        } else if constexpr (type == InteractionType::Permutation) {
            return [](bool strict) {
                return strict ? std::make_unique<CheckingPermutationBuilder<InteractionSettings>>()
                              : std::make_unique<PermutationBuilder<InteractionSettings>>();
            };
        } else {
            throw std::runtime_error("Interaction type not supported: " + std::to_string(static_cast<int>(type)));
        }
    }

    const Factory& get_job_internal(std::string_view interaction_name) const;
};

} // namespace bb::avm2::tracegen
