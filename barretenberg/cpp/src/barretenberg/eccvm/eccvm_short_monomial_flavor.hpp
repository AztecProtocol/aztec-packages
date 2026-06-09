// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/relations/ecc_vm/ecc_bools_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_lookup_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_msm_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_point_table_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_set_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_shiftable_init_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_msm_transition_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_transcript_short_relation_impl.hpp"
#include "barretenberg/relations/ecc_vm/ecc_wnaf_short_relation_impl.hpp"

namespace bb {

class ECCVMShortMonomialFlavor : public ECCVMFlavor {
  public:
    using FF = ECCVMFlavor::FF;
    using Curve = ECCVMFlavor::Curve;

    static constexpr bool USE_SHORT_MONOMIALS = true;

    using GrandProductRelations = std::tuple<ECCVMSetShortRelation<FF>>;
    // WARNING: this relation list is not free to reorder or regroup. Each short relation (or contiguous group of
    // split short relations) must occupy the same global subrelation index range as the legacy monolithic relation it
    // stands in for, because the verifier batches subrelations by alpha in that exact order. Changing the order or
    // splitting a relation without preserving the index layout silently breaks the batching and produces proofs the
    // legacy verifier rejects.
    //
    // ECCVMTranscriptMsmTransitionShortRelation immediately follows the main transcript relation: together they cover
    // the same global subrelation index range (0..30) as the verifier's monolithic ECCVMTranscriptRelation, so the
    // alpha batching is unchanged.
    template <typename FF_>
    using Relations_ = std::tuple<ECCVMTranscriptShortRelation<FF_>,
                                  ECCVMTranscriptMsmTransitionShortRelation<FF_>,
                                  ECCVMPointTableDoubleShortRelation<FF_>,
                                  ECCVMPointTableShortRelation<FF_>,
                                  ECCVMWnafShortRelation<FF_>,
                                  ECCVMMSMAddShortRelation<FF_>,
                                  ECCVMMSMDoubleShortRelation<FF_>,
                                  ECCVMMSMSkewShortRelation<FF_>,
                                  ECCVMMSMShortRelation<FF_>,
                                  ECCVMSetShortRelation<FF_>,
                                  ECCVMLookupShortRelation<FF_>,
                                  ECCVMBoolsTranscriptShortRelation<FF_>,
                                  ECCVMBoolsMsmShortRelation<FF_>,
                                  ECCVMShiftableInitRelation<FF_>>;
    using Relations = Relations_<FF>;
    using LookupRelation = ECCVMLookupShortRelation<FF>;

    static constexpr size_t NUM_SUBRELATIONS = compute_number_of_subrelations<Relations>();
    using SubrelationSeparators = std::array<FF, NUM_SUBRELATIONS - 1>;

    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = compute_max_partial_relation_length<Relations>();
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = MAX_PARTIAL_RELATION_LENGTH + 2;
    static constexpr size_t NUM_RELATIONS = std::tuple_size_v<Relations>;

    template <size_t LENGTH> using ProverUnivariates = ECCVMFlavor::ProverUnivariates<LENGTH>;
    using ExtendedEdges = ProverUnivariates<MAX_PARTIAL_RELATION_LENGTH>;

    static_assert(MAX_PARTIAL_RELATION_LENGTH == ECCVMFlavor::MAX_PARTIAL_RELATION_LENGTH);
    static_assert(BATCHED_RELATION_PARTIAL_LENGTH == ECCVMFlavor::BATCHED_RELATION_PARTIAL_LENGTH);
    static_assert(NUM_SUBRELATIONS == ECCVMFlavor::NUM_SUBRELATIONS);
};

} // namespace bb
