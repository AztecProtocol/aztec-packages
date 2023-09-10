#pragma once

#include "barretenberg/proof_system/relations/relation_types.hpp"

#define ExtendedEdge(Flavor) Flavor::ExtendedEdges<Flavor::MAX_RELATION_LENGTH>
#define EvaluationEdge(Flavor) Flavor::ClaimedEvaluations
#define EntityEdge(Flavor) Flavor::AllEntities<Flavor::FF, Flavor::FF>

#define ADD_EDGE_CONTRIBUTION(...) _ADD_EDGE_CONTRIBUTION(__VA_ARGS__)
#define _ADD_EDGE_CONTRIBUTION(Preface, Relation, Flavor, AccumulatorType, EdgeType)                                   \
    Preface template void                                                                                              \
    Relation<Flavor::FF>::add_edge_contribution_impl<RelationWrapper<Flavor::FF, Relation>::AccumulatorType,           \
                                                     EdgeType(Flavor)>(                                                \
        RelationWrapper<Flavor::FF, Relation>::AccumulatorType::Accumulators&,                                         \
        EdgeType(Flavor) const&,                                                                                       \
        RelationParameters<Flavor::FF> const&,                                                                         \
        Flavor::FF const&) const;

#define PERMUTATION_METHOD(...) _PERMUTATION_METHOD(__VA_ARGS__)
#define _PERMUTATION_METHOD(Preface, MethodName, Relation, Flavor, AccumulatorType, EdgeType)                          \
    Preface template Relation<Flavor::FF>::template Accumulator<                                                       \
        RelationWrapper<Flavor::FF, Relation>::AccumulatorType>                                                        \
    Relation<Flavor::FF>::MethodName<RelationWrapper<Flavor::FF, Relation>::AccumulatorType, EdgeType(Flavor)>(        \
        EdgeType(Flavor) const&, RelationParameters<Flavor::FF> const&, size_t const);

#define SUMCHECK_RELATION_CLASS(...) _SUMCHECK_RELATION_CLASS(__VA_ARGS__)
#define _SUMCHECK_RELATION_CLASS(Preface, Relation, Flavor)                                                            \
    ADD_EDGE_CONTRIBUTION(Preface, Relation, Flavor, UnivariateAccumTypes, ExtendedEdge)                               \
    ADD_EDGE_CONTRIBUTION(Preface, Relation, Flavor, ValueAccumTypes, EvaluationEdge)                                  \
    ADD_EDGE_CONTRIBUTION(Preface, Relation, Flavor, ValueAccumTypes, EntityEdge)

#define DECLARE_SUMCHECK_RELATION_CLASS(Relation, Flavor) SUMCHECK_RELATION_CLASS(extern, Relation, Flavor)
#define DEFINE_SUMCHECK_RELATION_CLASS(Relation, Flavor) SUMCHECK_RELATION_CLASS(, Relation, Flavor)

#define SUMCHECK_PERMUTATION_CLASS(...) _SUMCHECK_PERMUTATION_CLASS(__VA_ARGS__)
#define _SUMCHECK_PERMUTATION_CLASS(Preface, Relation, Flavor)                                                         \
    PERMUTATION_METHOD(Preface, compute_permutation_numerator, Relation, Flavor, UnivariateAccumTypes, ExtendedEdge)   \
    PERMUTATION_METHOD(Preface, compute_permutation_numerator, Relation, Flavor, ValueAccumTypes, EvaluationEdge)      \
    PERMUTATION_METHOD(Preface, compute_permutation_numerator, Relation, Flavor, ValueAccumTypes, EntityEdge)          \
    PERMUTATION_METHOD(Preface, compute_permutation_denominator, Relation, Flavor, UnivariateAccumTypes, ExtendedEdge) \
    PERMUTATION_METHOD(Preface, compute_permutation_denominator, Relation, Flavor, ValueAccumTypes, EvaluationEdge)    \
    PERMUTATION_METHOD(Preface, compute_permutation_denominator, Relation, Flavor, ValueAccumTypes, EntityEdge)

#define DECLARE_SUMCHECK_PERMUTATION_CLASS(Relation, Flavor) SUMCHECK_PERMUTATION_CLASS(extern, Relation, Flavor)
#define DEFINE_SUMCHECK_PERMUTATION_CLASS(Relation, Flavor) SUMCHECK_PERMUTATION_CLASS(, Relation, Flavor)
