#include "barretenberg/eccvm_recursion/eccvm_recursive_flavor.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <gtest/gtest.h>
namespace bb {

class EccRelationsConsistency : public testing::Test {
  public:
    template <typename InputElements> static InputElements get_input()
    {
        InputElements result;
        for (auto& element : result.get_all()) {
            element = 4;
        }
        return result;
    }
    template <template <typename> class Relation> static void validate_relation_execution()
    {
        using RecursiveFlavor = ECCVMRecursiveFlavor_<UltraCircuitBuilder>;
        using RecursiveRelation = Relation<typename RecursiveFlavor::FF>;
        const RelationParameters<typename RecursiveFlavor::FF> parameters;
        const auto input_elements = get_input<typename RecursiveFlavor::AllValues>();
        typename RecursiveRelation::SumcheckArrayOfValuesOverSubrelations accumulator;
        std::fill(accumulator.begin(), accumulator.end(), typename RecursiveRelation::FF(0));
        RecursiveRelation::accumulate(accumulator, input_elements, parameters, 1);

        using NativeFlavor = ECCVMFlavor;
        using NativeRelation = Relation<typename NativeFlavor::FF>;
        const RelationParameters<typename NativeFlavor::FF> native_parameters;
        const auto native_input_elements = get_input<typename NativeFlavor::AllValues>();
        typename NativeRelation::SumcheckArrayOfValuesOverSubrelations native_accumulator;
        std::fill(native_accumulator.begin(), native_accumulator.end(), typename NativeRelation::FF(0));
        NativeRelation::accumulate(native_accumulator, native_input_elements, native_parameters, 1);

        for (auto [val, native_val] : zip_view(accumulator, native_accumulator)) {
            EXPECT_EQ(val.get_value().lo, uint256_t(native_val));
        }
        // return accumulator;
    };
};

TEST_F(EccRelationsConsistency, ECCVMLookupRelation)
{

    validate_relation_execution<ECCVMMSMRelation>();

    // using NativeRelation = ECCVMLookupRelation<NativeFF>;
    // auto native_accumulator = validate_relation_execution<NativeRelation>();

    // for (auto [val, native_val] : zip_view(accumulator, native_accumulator)) {
    //     EXPECT_EQ(bb::fq((val.get_value() % uint512_t(bb::fq::modulus)).lo), native_val);
    // }

    // using ECCVMMSMRelation = ECCVMMSMRelation<FF>;
    // validate_relation_execution<ECCVMMSMRelation>();

    // using ECCVMPointTableRelation = ECCVMPointTableRelation<FF>;
    // validate_relation_execution<ECCVMPointTableRelation>();

    // using ECCVMSetRelation = ECCVMSetRelation<FF>;
    // validate_relation_execution<ECCVMSetRelation>();

    // using ECCVMTranscriptRelation = ECCVMTranscriptRelation<FF>;
    // validate_relation_execution<ECCVMTranscriptRelation>();

    // using ECCVMWnafRelation = ECCVMWnafRelation<FF>;
    // validate_relation_execution<ECCVMWnafRelation>();
}
} // namespace bb