#pragma once
#include <fstream>
#include <limits>
#include <sstream>
#include <string>
#include <unordered_map>

#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include "barretenberg/smt_verification/terms/bool.hpp"
#include "barretenberg/smt_verification/terms/ffterm.hpp"

namespace smt_circuit {
using namespace smt_solver;
using namespace smt_terms;

const std::string p = "21888242871839275222246405745257275088548364400416034343698204186575808495617";

struct CircuitSchema {
    std::string modulus;
    std::vector<uint32_t> public_inps;
    std::unordered_map<uint32_t, std::string> vars_of_interest;
    std::vector<barretenberg::fr> variables;
    std::vector<std::vector<barretenberg::fr>> selectors;
    std::vector<std::vector<uint32_t>> wits;
    MSGPACK_FIELDS(public_inps, vars_of_interest, variables, selectors, wits);
};

/**
 * @brief Symbolic Circuit class.
 *
 * @details Contains all the information about the circuit: gates, variables,
 * symbolic variables, specified names and global solver.
 *
 * @todo TODO(alex): think on the partial value assertion inside the circuit.
 * @todo TODO(alex): class SymCircuit?
 */
class Circuit {
  private:
    void init();
    void add_gates();

  public:
    std::vector<std::string> variables;                         // circuit witness
    std::vector<uint32_t> public_inps;                          // public inputs from the circuit
    std::unordered_map<uint32_t, std::string> vars_of_interest; // names of the variables
    std::unordered_map<std::string, uint32_t> terms;            // inverse map of the previous memeber
    std::vector<std::vector<std::string>> selectors;            // selectors from the circuit
    std::vector<std::vector<uint32_t>> wit_idxs;                // values used in gates from the circuit
    std::vector<FFTerm> vars;                                   // all the symbolic variables in the circuit

    Solver* solver;  // pointer to the solver
    std::string tag; // tag of the symbolic circuit.
                     // If not empty, will be added to the names
                     // of symbolic variables to prevent collisions.

    explicit Circuit(CircuitSchema& circuit_info, Solver* solver, const std::string& tag = "");

    FFTerm operator[](const std::string& name);
    inline uint32_t get_num_gates() const { return static_cast<uint32_t>(selectors.size()); };
    inline uint32_t get_num_vars() const { return static_cast<uint32_t>(vars.size()); };
};

CircuitSchema unpack_from_buffer(const msgpack::sbuffer& buf);
CircuitSchema unpack_from_file(const std::string& fname);

std::pair<Circuit, Circuit> unique_witness(CircuitSchema& circuit_info,
                                           Solver* s,
                                           const std::vector<std::string>& equal,
                                           const std::vector<std::string>& nequal,
                                           const std::vector<std::string>& eqall = {},
                                           const std::vector<std::string>& neqall = {});

// TODO(alex): Do we need the function that will do recheck based on the current model to consequently find all the
// solutions?
// void get_all_solutions(std::unordered_map<std::string, cvc5::Term>, std::unordered_map)

}; // namespace smt_circuit