#include "barretenberg/eccvm_recursion/eccvm_recursive_flavor.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_relation.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_relation.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <gtest/gtest.h>
namespace bb {

class EccRelationsConsistency : public testing::Test {
  public:
    using Flavor = ECCVMRecursiveFlavor_<UltraCircuitBuilder>;
    using FF = typename Flavor::FF;
    using NativeFF = bb::fq;
    using InputElements = typename Flavor::AllValues;

    InputElements get_random_input()
    {
        InputElements result;
        for (FF& element : result.get_all()) {
            element = FF(NativeFF::random_element());
        }
        return result;
    }
    template <typename Relation>
    static void validate_relation_execution(const InputElements& input_elements, const auto& parameters)
    {
        typename Relation::SumcheckArrayOfValuesOverSubrelations accumulator;
        std::fill(accumulator.begin(), accumulator.end(), FF(0));
        Relation::accumulate(accumulator, input_elements, parameters, 1);
    };
};

TEST_F(EccRelationsConsistency, ECCVMLookupRelation)
{
    using ECCVMLookupRelation = ECCVMLookupRelation<FF>;
    const RelationParameters<FF> parameters;
    const InputElements input_elements = get_random_input();
    validate_relation_execution<ECCVMLookupRelation>(input_elements, parameters);

    using ECCVMMSMRelation = ECCVMMSMRelation<FF>;
    validate_relation_execution<ECCVMMSMRelation>(input_elements, parameters);

    using ECCVMPointTableRelation = ECCVMPointTableRelation<FF>;
    validate_relation_execution<ECCVMPointTableRelation>(input_elements, parameters);

    using ECCVMSetRelation = ECCVMSetRelation<FF>;
    validate_relation_execution<ECCVMSetRelation>(input_elements, parameters);

    using ECCVMTranscriptRelation = ECCVMTranscriptRelation<FF>;
    validate_relation_execution<ECCVMTranscriptRelation>(input_elements, parameters);

    using ECCVMWnafRelation = ECCVMWnafRelation<FF>;
    validate_relation_execution<ECCVMWnafRelation>(input_elements, parameters);
}
} // namespace bb