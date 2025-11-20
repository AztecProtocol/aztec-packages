// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

// Include the implementation file to get template definitions
#include "barretenberg/eccvm/eccvm_verifier_.cpp"

namespace bb {

// Explicit template instantiation for recursive flavor
// This must be in stdlib_eccvm_verifier library to access the stdlib relation implementations
template class ECCVMVerifier_<ECCVMRecursiveFlavor>;

} // namespace bb
