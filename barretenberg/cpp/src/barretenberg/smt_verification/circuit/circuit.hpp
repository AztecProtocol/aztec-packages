#pragma once
#include <fstream>
#include <limits>
#include <sstream>
#include <string>
#include <unordered_map>

#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include "barretenberg/smt_verification/terms/bool.hpp"
#include "barretenberg/smt_verification/terms/ffiterm.hpp"
#include "barretenberg/smt_verification/terms/ffterm.hpp"

namespace smt_circuit {
using namespace smt_solver;
using namespace smt_terms;

struct CircuitSchema {
    std::string modulus;
    std::vector<uint32_t> public_inps;
    std::unordered_map<uint32_t, std::string> vars_of_interest;
    std::vector<bb::fr> variables;
    std::vector<std::vector<bb::fr>> selectors;
    std::vector<std::vector<uint32_t>> wires;
    MSGPACK_FIELDS(modulus, public_inps, vars_of_interest, variables, selectors, wires);
};

/**
 * @brief Symbolic Circuit class.
 *
 * @details Contains all the information about the circuit: gates, variables,
 * symbolic variables, specified names and global solver.
 *
 * @tparam FF FFTerm or FFITerm
 */
template <typename FF> class Circuit {
  private:
    void init();
    void init_graph();
    void add_gates();
    void prepare_gates();
    void quadratic_polynomial_handler(bb::fr q_m, bb::fr q_1, bb::fr q_2, bb::fr q_3, bb::fr q_c, uint32_t w);

  public:
    std::vector<bb::fr> variables;                          // circuit witness
    std::vector<uint32_t> public_inps;                                // public inputs from the circuit
    std::unordered_map<uint32_t, std::string> variable_names;         // names of the variables
    std::unordered_map<std::string, uint32_t> variable_names_inverse; // inverse map of the previous memeber
    std::vector<std::vector<bb::fr>> selectors;             // selectors from the circuit
    std::vector<std::vector<uint32_t>> wires_idxs;                    // values of the gates' wires
    std::vector<FF> symbolic_vars;                                    // all the symbolic variables from the circuit
    std::vector<std::vector<uint32_t>> graph;


    Solver* solver;  // pointer to the solver
    std::string tag; // tag of the symbolic circuit.
                     // If not empty, will be added to the names
                     // of symbolic variables to prevent collisions.

    explicit Circuit(CircuitSchema& circuit_info, Solver* solver, const std::string& tag = "");

    FF operator[](const std::string& name);
    FF operator[](const uint32_t& idx) { return symbolic_vars[idx]; };
    inline uint32_t get_num_gates() const { return static_cast<uint32_t>(selectors.size()); };
    inline uint32_t get_num_vars() const { return static_cast<uint32_t>(symbolic_vars.size()); };
};

/**
 * @brief Construct a new Circuit::Circuit object
 *
 * @param circuit_info CircuitShema object
 * @param solver pointer to the global solver
 * @param tag tag of the circuit. Empty by default.
 */
template <typename FF>
Circuit<FF>::Circuit(CircuitSchema& circuit_info, Solver* solver, const std::string& tag)
    : variables(circuit_info.variables)
    , public_inps(circuit_info.public_inps)
    , variable_names(circuit_info.vars_of_interest)
    , selectors(circuit_info.selectors)
    , wires_idxs(circuit_info.wires)
    , solver(solver)
    , tag(tag)
{
    if (!this->tag.empty()) {
        if (this->tag[0] != '_') {
            this->tag = "_" + this->tag;
        }
    }

    for (auto& x : variable_names) {
        variable_names_inverse.insert({ x.second, x.first });
    }

    variable_names.insert({ 0, "zero" });
    variable_names.insert({ 1, "one" });
    variable_names_inverse.insert({ "zero", 0 });
    variable_names_inverse.insert({ "one", 1 });
    this->graph = std::vector<std::vector<uint32_t>>(this->variables.size());
    this->init();
    this->init_graph();
    this->add_gates();
}

/**
 * Creates all the needed symbolic variables and constants
 * which are used in circuit.
 *
 */
template <typename FF> void Circuit<FF>::init()
{
    size_t num_vars = variables.size();

    symbolic_vars.push_back(FF::Var("zero" + this->tag, this->solver));
    symbolic_vars.push_back(FF::Var("one" + this->tag, this->solver));

    for (size_t i = 2; i < num_vars; i++) {
        if (variable_names.contains(static_cast<uint32_t>(i))) {
            std::string name = variable_names[static_cast<uint32_t>(i)];
            symbolic_vars.push_back(FF::Var(name + this->tag, this->solver));
        } else {
            symbolic_vars.push_back(FF::Var("var_" + std::to_string(i) + this->tag, this->solver));
            // TODO(alex): thinking on storing these names too.
        }
    }

    symbolic_vars[0] == bb::fr(0);
    symbolic_vars[1] == bb::fr(1);

    for (auto i : public_inps) {
        symbolic_vars[i] == variables[i];
    }
}

template <typename FF> void Circuit<FF>::init_graph(){
    for(uint32_t i = 0; i < this->get_num_vars(); i++){
        this->graph[i] = std::vector<uint32_t>(this->get_num_vars(), 0);
    }

    for(uint32_t i = 0; i < this->wires_idxs.size(); i++){
        uint32_t wl = this->wires_idxs[i][0];
        uint32_t wr = this->wires_idxs[i][1];
        uint32_t wo = this->wires_idxs[i][2];
        this->graph[wl][wo] = i; // TODO(alex): sometimes it's breaking the logic. I think I might need to use multigraph structure.
        this->graph[wr][wo] = i;
        this->graph[wo][wl] = -i;
        this->graph[wo][wr] = -i;
    }
}


/**
 * @brief Relaxes quadratic polynomial constraint.
 *
 * @param q_m multiplication selector
 * @param q_1 l selector
 * @param q_2 r selector
 * @param q_3 o selector
 * @param q_c constant
 * @param w   witness index
 */
template <typename FF>
void Circuit<FF>::quadratic_polynomial_handler(bb::fr q_m, bb::fr q_1, bb::fr q_2, bb::fr q_3, bb::fr q_c, uint32_t w){
    bb::fr b = q_1 + q_2 + q_3;

    if (q_m == 0){
        symbolic_vars[w] == -q_c / b;
        return;
    }

    std::pair<bool, bb::fr> d = (b*b - bb::fr(4) * q_m * q_c).sqrt();
    if(!d.first){
        throw std::invalid_argument("There're no roots of quadratic polynomial");
    }
    bb::fr x1 = (-b + d.second) / (bb::fr(2) * q_m);
    bb::fr x2 = (-b - d.second) / (bb::fr(2) * q_m);

    ((Bool(symbolic_vars[w]) == Bool(FF(x1, this->solver))) |
     (Bool(symbolic_vars[w]) == Bool(FF(x2, this->solver)))).assert_term();
}

template <typename FF> void Circuit<FF>::prepare_gates(){
    return;
}

/**
 * @brief Adds all the gate constraints to the solver.
 *
 */
template <typename FF> void Circuit<FF>::add_gates()
{
    this->prepare_gates();

    for (size_t i = 0; i < get_num_gates(); i++) {
        bb::fr q_m = selectors[i][0];
        bb::fr q_1 = selectors[i][1];
        bb::fr q_2 = selectors[i][2];
        bb::fr q_3 = selectors[i][3];
        bb::fr q_c = selectors[i][4];

        uint32_t w_l = wires_idxs[i][0];
        uint32_t w_r = wires_idxs[i][1];
        uint32_t w_o = wires_idxs[i][2];

        // Binary gate. Relaxes the solver. 
        // TODO(alex): Probably we can add other basic gates here too to relax the stuff.
        // TODO(alex): Theoretically this can be applyed after we ensure that the block of polynomial equations holds
        // and then simplify that block in future to relax the solver constraint system. Seems like a hard one to implement or actually to automate, but I'll think on it for a while.
        // it will probably require to split add_gates and init methods into more complex/generalized parts.
        if(w_l == w_r && w_r == w_o){
            if(q_m == 1 && q_1 == 0 && q_2 == 0 && q_3 == -1 && q_c == 0){
                (Bool(symbolic_vars[w_l]) == Bool(symbolic_vars[0]) | Bool(symbolic_vars[w_l]) == Bool(symbolic_vars[1])).assert_term();
            }else{
                quadratic_polynomial_handler(q_m, q_1, q_2, q_3, q_c, w_l);
            }
        }else{
            FF eq = symbolic_vars[0];

            // mult selector
            if (q_m != 0) {
                eq += symbolic_vars[w_l] * symbolic_vars[w_r] * q_m; // TODO(alex): Is there a way to do lmul?
            }
            // w_l selector
            if (q_1 != 0) {
                eq += symbolic_vars[w_l] * q_1;
            }
            // w_r selector
            if (q_2 != 0) {
                eq += symbolic_vars[w_r] * q_2;
            }
            // w_o selector
            if (q_3 != 0) {
                eq += symbolic_vars[w_o] * q_3;
            }
            // w_c selector
            if (q_c != 0) {
                eq += q_c;
            }
            eq.mod();
            eq == symbolic_vars[0];
        }
    }
}

/**
 * @brief Returns a previously named symbolic variable.
 *
 * @param name
 * @return FF
 */
template <typename FF> FF Circuit<FF>::operator[](const std::string& name)
{
    if (!this->variable_names_inverse.contains(name)) {
        throw std::length_error("No such an item `" + name + "` in vars or it vas not declared as interesting");
    }
    uint32_t idx = this->variable_names_inverse[name];
    return this->symbolic_vars[idx];
}

CircuitSchema unpack_from_buffer(const msgpack::sbuffer& buf);
CircuitSchema unpack_from_file(const std::string& filename);
void schema_to_python(CircuitSchema& cir);

template <typename FF>
std::pair<Circuit<FF>, Circuit<FF>> unique_witness_ext(CircuitSchema& circuit_info_ext,
                                                   Solver* s,
                                                   const std::vector<std::string>& equal = {},
                                                   const std::vector<std::string>& not_equal = {},
                                                   const std::vector<std::string>& equal_at_the_same_time = {},
                                                   const std::vector<std::string>& not_eqaul_at_the_same_time = {});

extern template std::pair<Circuit<FFTerm>, Circuit<FFTerm>> unique_witness_ext(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {},
    const std::vector<std::string>& not_equal = {},
    const std::vector<std::string>& equal_at_the_same_time = {},
    const std::vector<std::string>& not_eqaul_at_the_same_time = {});

extern template std::pair<Circuit<FFITerm>, Circuit<FFITerm>> unique_witness_ext(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {},
    const std::vector<std::string>& not_equal = {},
    const std::vector<std::string>& equal_at_the_same_time = {},
    const std::vector<std::string>& not_eqaul_at_the_same_time = {});

template <typename FF>
std::pair<Circuit<FF>, Circuit<FF>> unique_witness(CircuitSchema& circuit_info,
                                                   Solver* s,
                                                   const std::vector<std::string>& equal = {});

extern template std::pair<Circuit<FFTerm>, Circuit<FFTerm>> unique_witness(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {});

extern template std::pair<Circuit<FFITerm>, Circuit<FFITerm>> unique_witness(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {});

}; // namespace smt_circuit
