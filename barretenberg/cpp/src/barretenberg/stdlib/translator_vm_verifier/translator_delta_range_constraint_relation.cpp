// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_relation_impl.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib/translator_vm_verifier/translator_recursive_flavor.hpp"

namespace bb {
template class TranslatorDeltaRangeConstraintRelationImpl<stdlib::field_t<UltraCircuitBuilder>>;
DEFINE_SUMCHECK_VERIFIER_RELATION_CLASS(TranslatorDeltaRangeConstraintRelationImpl, TranslatorRecursiveFlavor);

} // namespace bb
