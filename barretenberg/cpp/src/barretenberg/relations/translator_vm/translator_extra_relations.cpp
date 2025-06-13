// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/relations/translator_vm/translator_extra_relations.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations_impl.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {
template class TranslatorOpcodeConstraintRelationImpl<fr>;
template class TranslatorAccumulatorTransferRelationImpl<fr>;
template class TranslatorZeroConstraintsRelationImpl<fr>;

DEFINE_SUMCHECK_RELATION_CLASS(TranslatorOpcodeConstraintRelationImpl, TranslatorFlavor);
DEFINE_SUMCHECK_RELATION_CLASS(TranslatorAccumulatorTransferRelationImpl, TranslatorFlavor);
DEFINE_SUMCHECK_RELATION_CLASS(TranslatorZeroConstraintsRelationImpl, TranslatorFlavor);
} // namespace bb
