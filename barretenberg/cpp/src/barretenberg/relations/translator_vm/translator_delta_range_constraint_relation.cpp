// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_relation_impl.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"
namespace bb {
template class TranslatorDeltaRangeConstraintRelationImpl<fr>;
DEFINE_SUMCHECK_RELATION_CLASS(TranslatorDeltaRangeConstraintRelationImpl, TranslatorFlavor);
} // namespace bb