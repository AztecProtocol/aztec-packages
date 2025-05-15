#pragma once
#include "barretenberg/smt_verification/terms/term.hpp"

namespace smt_terms {
using namespace smt_solver;

/**
 * @brief Bool element class.
 *
 * @details Can be used to create non trivial constraints.
 * Supports basic boolean arithmetic: &, |.
 * Only compatible with STerm
 */
class Bool {
  public:
    Solver* solver;
    cvc5::Term term;
    TermType type = TermType::SBool;
    bool asserted = false;

    Bool(const cvc5::Term& t, Solver* slv, TermType type = TermType::SBool)
        : solver(slv)
        , term(t)
        , type(type){};

    explicit Bool(const STerm& t)
        : solver(t.solver)
        , term(t.normalize().term){};

    explicit Bool(const std::string& name, Solver* slv)
        : solver(slv)
    {
        this->term = this->solver->term_manager.mkConst(this->solver->term_manager.getBooleanSort(), name);
    }

    explicit Bool(bool t, Solver* slv)
        : solver(slv)
    {
        term = solver->term_manager.mkBoolean(t);
    }
    Bool(const Bool& other) = default;
    Bool(Bool&& other) = default;

    Bool& operator=(const Bool& right) = default;
    Bool& operator=(Bool&& right) = default;

    void assert_term()
    {
        if (!asserted) {
            solver->assertFormula(term);
            asserted = true;
        }
    }

    Bool operator|(const Bool& other) const;
    void operator|=(const Bool& other);
    Bool operator|(const bool& other) const;
    void operator|=(const bool& other) const;

    Bool operator&(const Bool& other) const;
    void operator&=(const Bool& other);
    Bool operator&(const bool& other) const;
    void operator&=(const bool& other);

    Bool operator!() const;

    Bool operator==(const Bool& other) const;
    Bool operator!=(const Bool& other) const;

    operator std::string() const { return this->solver->stringify_term(term); };
    operator cvc5::Term() const { return term; };

    friend std::ostream& operator<<(std::ostream& out, const Bool& term)
    {
        return out << static_cast<std::string>(term);
    };

    friend Bool batch_or(const std::vector<Bool>& children)
    {
        Solver* s = children[0].solver;
        std::vector<cvc5::Term> terms(children.begin(), children.end());
        cvc5::Term res = s->term_manager.mkTerm(cvc5::Kind::OR, terms);
        return { res, s };
    }

    friend Bool batch_and(const std::vector<Bool>& children)
    {
        Solver* s = children[0].solver;
        std::vector<cvc5::Term> terms(children.begin(), children.end());
        cvc5::Term res = s->term_manager.mkTerm(cvc5::Kind::AND, terms);
        return { res, s };
    }

    ~Bool() = default;
};
}; // namespace smt_terms
