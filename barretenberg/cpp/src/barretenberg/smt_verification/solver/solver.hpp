#pragma once
#include <string>
#include <unordered_map>

#include <cvc5/cvc5.h>

#include "barretenberg/ecc/curves/bn254/fr.hpp"
namespace smt_solver {

/**
 * @brief Solver configuration
 *
 * @param produce_model tells solver to actually compute the values of the variables in SAT case.
 * @param timeout tells solver to stop trying after `timeout` msecs.
 * @param debug set verbosity of cvc5: 0, 1, 2.
 *
 * @param ff_elim_disjunctive_bit tells solver to change all ((x = 0) | (x = 1)) to x*x = x.
 * @param ff_solver tells solver which finite field solver to use: "gb", "split".
 *
 * @param lookup_enabled tells solver to enable sets when we deal with lookups
 */
struct SolverConfiguration {
    bool produce_models;
    uint64_t timeout;
    uint32_t debug;

    bool ff_elim_disjunctive_bit;
    std::string ff_solver;

    bool lookup_enabled;
};

const SolverConfiguration default_solver_config = { true, 0, 0, false, "", false };
const SolverConfiguration ultra_solver_config = { true, 0, 0, false, "", true };

/**
 * @brief Class for the solver.
 *
 * @details Solver class that can be used to create
 * a solver, finite field terms and the circuit.
 * Check the satisfability of a system and get it's model.
 */
class Solver {
  public:
    cvc5::TermManager term_manager;
    cvc5::Solver solver;
    cvc5::Sort ff_sort;
    cvc5::Sort bv_sort;
    std::string modulus; // modulus in base 10
    bool res = false;
    cvc5::Result cvc_result;
    bool checked = false;

    std::unordered_map<cvc5::Term, size_t> tables;

    explicit Solver(const std::string& modulus,
                    const SolverConfiguration& config = default_solver_config,
                    uint32_t base = 16,
                    uint32_t bvsize = 254)
        : solver(term_manager)
    {
        this->ff_sort = term_manager.mkFiniteFieldSort(modulus, base);
        this->modulus = ff_sort.getFiniteFieldSize();
        this->bv_sort = term_manager.mkBitVectorSort(bvsize);
        if (config.produce_models) {
            solver.setOption("produce-models", "true");
        }
        if (config.timeout > 0) {
            solver.setOption("tlimit-per", std::to_string(config.timeout));
        }
        if (config.debug >= 1) {
            solver.setOption("verbosity", "5");
        }
        if (config.debug >= 2) {
            solver.setOption("output", "learned-lits");
            solver.setOption("output", "subs");
            solver.setOption("output", "post-asserts");
            solver.setOption("output", "trusted-proof-steps");
            solver.setOption("output", "deep-restart");
        }

        // Can be useful when split-gb is used as ff-solver.
        // Cause bit constraints are part of the split-gb optimization
        // and without them it will probably perform less efficient
        // TODO(alex): test this `probably` after finishing the pr sequence
        if (!config.ff_elim_disjunctive_bit) {
            solver.setOption("ff-elim-disjunctive-bit", "false");
        }
        // split-gb is an updated version of gb ff-solver
        // It basically SPLITS the polynomials in the system into subsets
        // and computes a Groebner basis for each of them.
        // According to the benchmarks, the new decision process in split-gb
        // brings a significant boost in solver performance
        if (!config.ff_solver.empty()) {
            solver.setOption("ff-solver", config.ff_solver);
        }

        if (lookup_enabled) {
            this->solver.setLogic("ALL");
            this->solver.setOption("finite-model-find", "true");
            this->solver.setOption("sets-ext", "true");
            lookup_enabled = true;
        }

        solver.setOption("output", "incomplete");
    }

    Solver(const Solver& other) = delete;
    Solver(Solver&& other) = delete;
    Solver& operator=(const Solver& other) = delete;
    Solver& operator=(Solver&& other) = delete;

    bool lookup_enabled = false;

    cvc5::Term create_lookup_table(std::vector<std::vector<cvc5::Term>>& table);
    cvc5::Term create_table(std::vector<cvc5::Term>& table);

    void assertFormula(const cvc5::Term& term) const { this->solver.assertFormula(term); }

    cvc5::Term getValue(const cvc5::Term& term) const { return this->solver.getValue(term); }

    bool check();

    [[nodiscard]] const char* getResult() const
    {
        if (!checked) {
            return "No result, yet";
        }
        return res ? "SAT" : "UNSAT";
    }

    std::unordered_map<std::string, std::string> model(std::unordered_map<std::string, cvc5::Term>& terms) const;
    std::unordered_map<std::string, std::string> model(std::vector<cvc5::Term>& terms) const;

    void print_assertions();
    std::string stringify_term(const cvc5::Term& term, bool parenthesis = false);

    ~Solver() = default;
};

}; // namespace smt_solver
