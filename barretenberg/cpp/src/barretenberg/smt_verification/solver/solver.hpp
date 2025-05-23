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
 * @param ff_bitsum tells solver to identify bitsums
 *
 * @param ff_solver tells solver which finite field solver to use: "gb", "split".
 *
 * @param lookup_enabled tells solver to enable sets when we deal with lookups
 */
struct SolverConfiguration {
    bool produce_models;
    uint64_t timeout;
    uint32_t debug;

    bool ff_elim_disjunctive_bit;
    bool ff_bitsum;
    std::string ff_solver;

    bool lookup_enabled;
};

const SolverConfiguration default_solver_config = {
    /*produce_models=*/true,
    /*timeout=*/0,
    /*debug=*/0,
    /*ff_elim_disjunctive_bit=*/false,
    /*ff_bitsum=*/false,
    /*ff_solver=*/"gb",
    /*lookup_enabled=*/true
};

const SolverConfiguration ultra_solver_config = {
    /*produce_models=*/true,
    /*timeout=*/0,
    /*debug=*/0,
    /*ff_elim_disjunctive_bit=*/false,
    /*ff_bitsum=*/false,
    /*ff_solver=*/"gb",
    /*lookup_enabled=*/true
};

const SolverConfiguration split_gb_solver_config = {
    /*produce_models=*/true,          /*timeout=*/0,      /*debug=*/0,
    /*ff_elim_disjunctive_bit=*/true, /*ff_bitsum=*/true, /*ff_solver=*/"split",
    /*lookup_enabled=*/true
};

const SolverConfiguration debug_solver_config = {
    /*produce_models=*/true,
    /*timeout=*/0,
    /*debug=*/2,
    /*ff_elim_disjunctive_bit=*/false,
    /*ff_bitsum=*/false,
    /*ff_solver=*/"gb",
    /*lookup_enabled=*/true
};

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
    bool lookup_enabled = false;

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
            solver.setOption("stats", "true");
        }
        if (config.debug >= 2) {
            solver.setOption("output", "inst");
            solver.setOption("output", "learned-lits");
            solver.setOption("output", "subs");
            solver.setOption("output", "post-asserts");
            solver.setOption("output", "trusted-proof-steps");
            solver.setOption("output", "deep-restart");
            solver.setOption("output", "timeout-core-benchmark");
            solver.setOption("output", "unsat-core-benchmark");
            solver.setOption("stats-all", "true");
            solver.setOption("stats-internal", "true");
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

        if (config.lookup_enabled) {
            this->solver.setLogic("ALL");
            this->solver.setOption("finite-model-find", "true");
            this->solver.setOption("sets-exp", "true");
            this->solver.setOption("arrays-exp", "true");
            this->solver.setOption("arrays-optimize-linear", "true");
            this->lookup_enabled = true;
        }

        solver.setOption("output", "incomplete");
    }

    Solver(const Solver& other) = delete;
    Solver(Solver&& other) = delete;
    Solver& operator=(const Solver& other) = delete;
    Solver& operator=(Solver&& other) = delete;

    void assertFormula(const cvc5::Term& term) const { this->solver.assertFormula(term); }

    bool check();

    [[nodiscard]] const char* getResult() const
    {
        if (!checked) {
            return "No result, yet";
        }
        return res ? "SAT" : "UNSAT";
    }

    cvc5::Term get_symbolic_value(const cvc5::Term& term) const { return this->solver.getValue(term); };

    std::string get(const cvc5::Term& term) const;
    std::string operator[](const cvc5::Term& term) const { return this->get(term); };

    std::unordered_map<std::string, std::string> model(std::unordered_map<std::string, cvc5::Term>& terms) const;
    std::unordered_map<std::string, std::string> model(std::vector<cvc5::Term>& terms) const;

    void print_assertions();
    std::string stringify_term(const cvc5::Term& term, bool parenthesis = false);

    std::string get_array_name(const cvc5::Term& term);
    // TODO(alex): Keep track of terms names instead of depth. Should cut the recursion
    std::pair<std::string, size_t> print_array_trace(const cvc5::Term& term, bool is_head = true);
    std::unordered_map<std::string, size_t> cached_array_traces;

    std::string get_set_name(const cvc5::Term& term);
    // TODO(alex): Keep track of terms names instead of depth. Should cut the recursion
    std::pair<std::string, size_t> print_set_trace(const cvc5::Term& term, bool is_head = true);
    std::unordered_map<std::string, size_t> cached_set_traces;

    ~Solver() = default;
};

}; // namespace smt_solver
