#include "barretenberg/flavor/get_by_index.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
#include <gtest/gtest.h>
#include <set>

namespace bb {

// Helper to test that get_by_index matches get_all() and has no duplicates
template <typename Flavor> void test_get_by_index_completeness()
{
    using FF = typename Flavor::FF;
    typename Flavor::template AllEntities<FF> entities;

    // Initialize each entity with a unique value via get_all()
    auto all_entities = entities.get_all();
    for (size_t i = 0; i < all_entities.size(); i++) {
        all_entities[i] = FF(i + 1); // Use i+1 to avoid zero
    }

    // Verify that get_by_index(i) returns the same entity as get_all()[i]
    std::set<uintptr_t> addresses_seen;
    for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; i++) {
        // Get entity via runtime-indexed get_by_index utility function
        const auto& entity_by_index = bb::get_by_index(entities, i);

        // Get entity via get_all()
        const auto& entity_from_get_all = all_entities[i];

        // They should be the same entity (same address)
        EXPECT_EQ(&entity_by_index, &entity_from_get_all)
            << "get_by_index(" << i << ") doesn't match get_all()[" << i << "] for " << typeid(Flavor).name();

        // Check that the entity address is unique
        uintptr_t addr = reinterpret_cast<uintptr_t>(&entity_by_index);
        EXPECT_TRUE(addresses_seen.find(addr) == addresses_seen.end())
            << "Duplicate entity at index " << i << " for " << typeid(Flavor).name();
        addresses_seen.insert(addr);
    }

    // Check that we saw exactly NUM_ALL_ENTITIES unique addresses
    EXPECT_EQ(addresses_seen.size(), Flavor::NUM_ALL_ENTITIES)
        << "Expected " << Flavor::NUM_ALL_ENTITIES << " unique entities for " << typeid(Flavor).name();
}

TEST(GetByIndexTest, UltraFlavorCompleteness)
{
    test_get_by_index_completeness<UltraFlavor>();
}

TEST(GetByIndexTest, MegaFlavorCompleteness)
{
    test_get_by_index_completeness<MegaFlavor>();
}

TEST(GetByIndexTest, ECCVMFlavorCompleteness)
{
    test_get_by_index_completeness<ECCVMFlavor>();
}

TEST(GetByIndexTest, TranslatorFlavorCompleteness)
{
    test_get_by_index_completeness<TranslatorFlavor>();
}

} // namespace bb
