#pragma once
#include "barretenberg/smt_verification/solver/solver.hpp"

namespace smt_terms {
using namespace smt_solver;

/**
 * @brief Integer Modulo element class.
 *
 * @details Can be a symbolic variable or a constant.
 * Both of them support basic arithmetic operations: +, -, *, /.
 * Check the satisfability of a system and get it's model.
 *
 * @todo TODO(alex): mayb.. Have to patch cvc5 to create integers from hex...
 */
class FFITerm {
  public:
    Solver* solver;
    cvc5::Term term;
    cvc5::Term modulus;

    FFITerm()
        : solver(nullptr)
        , term(cvc5::Term())
        , modulus(cvc5::Term()){};

    explicit FFITerm(const std::string& t, Solver* slv, bool isconst = false, uint32_t base = 16);
    FFITerm(cvc5::Term& term, Solver* s)
        : solver(s)
        , term(term)
<<<<<<< HEAD
        , modulus(s->s.mkInteger(s->modulus))
    {}
=======
        , modulus(s->s.mkInteger(s->modulus))
    {}
>>>>>>> 404ec34d38e1a9c3fbe7a3cdb6e88c28f62f72e4^

    FFITerm(const FFITerm& other) = default;
    FFITerm(FFITerm&& other) = default;

    static FFITerm Var(const std::string& name, Solver* slv);
    static FFITerm Const(const std::string& val, Solver* slv, uint32_t base = 16);

    FFITerm& operator=(const FFITerm& right) = default;
    FFITerm& operator=(FFITerm&& right) = default;

    FFITerm operator+(const FFITerm& other) const;
    void operator+=(const FFITerm& other);
    FFITerm operator-(const FFITerm& other) const;
    void operator-=(const FFITerm& other);
    FFITerm operator*(const FFITerm& other) const;
    void operator*=(const FFITerm& other);
    FFITerm operator/(const FFITerm& other) const;
    void operator/=(const FFITerm& other);

    void operator==(const FFITerm& other) const;
    void operator!=(const FFITerm& other) const;

<<<<<<< HEAD
    operator std::string() const { return term.isIntegerValue() ? term.getIntegerValue() : term.toString(); };
=======
    operator std::string() const { return term.isIntegerValue() ? term.getIntegerValue() : term.toString(); };
>>>>>>> 404ec34d38e1a9c3fbe7a3cdb6e88c28f62f72e4^
    operator cvc5::Term() const { return term; };

    ~FFITerm() = default;
    friend std::ostream& operator<<(std::ostream& out, const FFITerm& k) { return out << k.term; }

    friend FFITerm batch_add(const std::vector<FFITerm>& children)
    {
        Solver* slv = children[0].solver;
        std::vector<cvc5::Term> terms(children.begin(), children.end());
        cvc5::Term res = slv->s.mkTerm(cvc5::Kind::ADD, terms);
        res = slv->s.mkTerm(cvc5::Kind::INTS_MODULUS, { res, children[0].modulus });
        return { res, slv };
    }

    friend FFITerm batch_mul(const std::vector<FFITerm>& children)
    {
        Solver* slv = children[0].solver;
        std::vector<cvc5::Term> terms(children.begin(), children.end());
        cvc5::Term res = slv->s.mkTerm(cvc5::Kind::MULT, terms);
        res = slv->s.mkTerm(cvc5::Kind::INTS_MODULUS, { res, children[0].modulus });
        return { res, slv };
    }
};

} // namespace smt_terms
