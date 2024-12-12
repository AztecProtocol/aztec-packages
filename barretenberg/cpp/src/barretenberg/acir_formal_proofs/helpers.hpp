#include "barretenberg/smt_verification/circuit/ultra_circuit.hpp"
#include "barretenberg/smt_verification/solver/solver.hpp"
#include "barretenberg/smt_verification/terms/term.hpp"

// reurns a << b
// b 8 bit
// result is truncated to 64 bit
smt_circuit::STerm shl64(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

// reurns a << b
// b 8 bit
// result is truncated to 32 bit
smt_circuit::STerm shl32(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

// retuns 2^v0, v0 8 bit
smt_circuit::STerm pow2_8(smt_circuit::STerm v0, smt_solver::Solver* solver);

// returns a >> b
// b 8 bit
smt_circuit::STerm shr(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);

// returns a << b
// b 8 bit
// result is NOT truncated
smt_circuit::STerm shl(smt_circuit::STerm v0, smt_circuit::STerm v1, smt_solver::Solver* solver);