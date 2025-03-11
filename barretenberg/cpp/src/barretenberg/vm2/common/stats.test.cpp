// This is a hack needed to be able to use files that use stats (e.g., constraining/polynomials.cpp) in testing in vm2
// It can be removed once VM1 is removed and stats are moved to VM2.
#include "barretenberg/vm/stats.cpp"