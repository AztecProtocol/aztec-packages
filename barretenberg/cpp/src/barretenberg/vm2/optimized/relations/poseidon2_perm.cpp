#include "barretenberg/flavor/relation_definitions.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/optimized/relations/poseidon2_perm_impl.hpp"

#define AvmCheckCircuitEdge(Flavor) Flavor::PolynomialEntitiesAtFixedRow<Flavor::ProverPolynomials>
#define AvmCheckRelationEdge(Flavor) ::bb::avm2::AvmFullRowProxy

namespace bb::avm2 {

template class optimized_poseidon2_permImpl<AvmFlavorSettings::FF>;
ACCUMULATE(optimized_poseidon2_permImpl,
           AvmFlavor,
           SumcheckTupleOfUnivariatesOverSubrelations,
           ExtendedEdge);                                                                                   // Prover.
ACCUMULATE(optimized_poseidon2_permImpl, AvmFlavor, SumcheckArrayOfValuesOverSubrelations, EvaluationEdge); // Verifier.
ACCUMULATE(optimized_poseidon2_permImpl,
           AvmFlavor,
           SumcheckArrayOfValuesOverSubrelations,
           AvmCheckCircuitEdge); // Check circuit.
ACCUMULATE(optimized_poseidon2_permImpl,
           AvmFlavor,
           SumcheckArrayOfValuesOverSubrelations,
           AvmCheckRelationEdge); // Check relation (tests).

template class optimized_poseidon2_permImpl<AvmRecursiveFlavor::FF>;
ACCUMULATE(optimized_poseidon2_permImpl,
           AvmRecursiveFlavor,
           SumcheckArrayOfValuesOverSubrelations,
           EvaluationEdge); // Verifier.

} // namespace bb::avm2
