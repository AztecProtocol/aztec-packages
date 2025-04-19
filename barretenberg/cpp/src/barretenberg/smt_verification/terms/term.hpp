#pragma once
#include "barretenberg/smt_verification/solver/solver.hpp"

namespace smt_terms {
using namespace smt_solver;

/**
 * @brief Allows to define three types of symbolic terms
 * STerm - Symbolic Variables acting like a Finte Field elements
 * FFITerm - Symbolic Variables acting like integers modulo prime
 * ITerm - Symbolic Variables acting like integers
 * BVTerm - Symbolic Variables acting like bitvectors modulo prime
 *
 */
enum class TermType { FFTerm, FFITerm, BVTerm, ITerm, SBool, STuple, SymArray, SymSet };
std::ostream& operator<<(std::ostream& os, TermType type);

enum class OpType : int32_t {
    ADD,
    SUB,
    MUL,
    DIV,
    NEG,
    XOR,
    AND,
    OR,
    GT,
    GE,
    LT,
    LE,
    MOD,
    RSH,
    LSH,
    ROTR,
    ROTL,
    NOT,
    EXTRACT,
    BITVEC_PAD,
    BIT_SUM
};

/**
 * @brief precomputed map that contains allowed
 * operations for each of three symbolic types
 *
 */
const std::unordered_map<TermType, std::unordered_map<OpType, cvc5::Kind>> typed_operations = {
    { TermType::FFTerm,
      { { OpType::ADD, cvc5::Kind::FINITE_FIELD_ADD },
        { OpType::MUL, cvc5::Kind::FINITE_FIELD_MULT },
        { OpType::NEG, cvc5::Kind::FINITE_FIELD_NEG },
        // Just a placeholder that marks it supports division
        { OpType::DIV, cvc5::Kind::FINITE_FIELD_MULT } } },
    { TermType::FFITerm,
      {

          { OpType::ADD, cvc5::Kind::ADD },
          { OpType::SUB, cvc5::Kind::SUB },
          { OpType::MUL, cvc5::Kind::MULT },
          { OpType::NEG, cvc5::Kind::NEG },
          { OpType::GT, cvc5::Kind::GT },
          { OpType::GE, cvc5::Kind::GEQ },
          { OpType::LT, cvc5::Kind::LT },
          { OpType::LE, cvc5::Kind::LEQ },
          { OpType::MOD, cvc5::Kind::INTS_MODULUS },
          // Just a placeholder that marks it supports division
          { OpType::DIV, cvc5::Kind::MULT } } },
    { TermType::ITerm,
      { { OpType::ADD, cvc5::Kind::ADD },
        { OpType::SUB, cvc5::Kind::SUB },
        { OpType::MUL, cvc5::Kind::MULT },
        { OpType::NEG, cvc5::Kind::NEG },
        { OpType::GT, cvc5::Kind::GT },
        { OpType::GE, cvc5::Kind::GEQ },
        { OpType::LT, cvc5::Kind::LT },
        { OpType::LE, cvc5::Kind::LEQ },
        { OpType::MOD, cvc5::Kind::INTS_MODULUS },
        { OpType::DIV, cvc5::Kind::INTS_DIVISION } } },
    { TermType::BVTerm,
      {

          { OpType::ADD, cvc5::Kind::BITVECTOR_ADD },
          { OpType::SUB, cvc5::Kind::BITVECTOR_SUB },
          { OpType::MUL, cvc5::Kind::BITVECTOR_MULT },
          { OpType::NEG, cvc5::Kind::BITVECTOR_NEG },
          { OpType::GT, cvc5::Kind::BITVECTOR_UGT },
          { OpType::GE, cvc5::Kind::BITVECTOR_UGE },
          { OpType::LT, cvc5::Kind::BITVECTOR_ULT },
          { OpType::LE, cvc5::Kind::BITVECTOR_ULE },
          { OpType::XOR, cvc5::Kind::BITVECTOR_XOR },
          { OpType::AND, cvc5::Kind::BITVECTOR_AND },
          { OpType::OR, cvc5::Kind::BITVECTOR_OR },
          { OpType::RSH, cvc5::Kind::BITVECTOR_LSHR },
          { OpType::LSH, cvc5::Kind::BITVECTOR_SHL },
          { OpType::ROTL, cvc5::Kind::BITVECTOR_ROTATE_LEFT },
          { OpType::ROTR, cvc5::Kind::BITVECTOR_ROTATE_RIGHT },
          { OpType::MOD, cvc5::Kind::BITVECTOR_UREM },
          { OpType::DIV, cvc5::Kind::BITVECTOR_UDIV },
          { OpType::NOT, cvc5::Kind::BITVECTOR_NOT },
          { OpType::EXTRACT, cvc5::Kind::BITVECTOR_EXTRACT },
          { OpType::BITVEC_PAD, cvc5::Kind::BITVECTOR_ZERO_EXTEND },
      } }
};

/**
 * @brief Symbolic term element class.
 *
 * @details Can be a Finite Field/Integer Mod/BitVector symbolic variable or a constant.
 * Supports basic arithmetic operations: +, -, *, /.
 * Additionally
 * FFITerm and ITerm support inequalities: <, <=, >, >= and %
 * BVTerm further supports bitwise operations: ~,^, &, |, >>, <<, ror, rol, truncate, extract_bit
 */
class STerm {
  private:
    STerm mod() const;
    STerm normalize() const;

  public:
    Solver* solver;
    cvc5::Term term;

    TermType type;
    std::unordered_map<OpType, cvc5::Kind> operations;

    STerm()
        : solver(nullptr)
        , term(cvc5::Term())
        , type(TermType::FFTerm){};

    STerm(const cvc5::Term& term, Solver* s, TermType type)
        : solver(s)
        , term(term)
        , type(type)
        , operations(typed_operations.at(type)){};

    explicit STerm(
        const std::string& t, Solver* slv, bool isconst = false, uint32_t base = 16, TermType type = TermType::FFTerm);

    STerm(const STerm& other) = default;
    STerm(STerm&& other) = default;

    static STerm Var(const std::string& name, Solver* slv, TermType type = TermType::FFTerm);
    static STerm Const(const std::string& val, Solver* slv, uint32_t base = 16, TermType type = TermType::FFTerm);
    static STerm Const(const bb::fr& val, Solver* slv, TermType type = TermType::FFTerm);

    STerm(bb::fr value, Solver* s, TermType type = TermType::FFTerm) { *this = Const(value, s, type); }

    STerm& operator=(const STerm& right) = default;
    STerm& operator=(STerm&& right) = default;

    STerm operator+(const STerm& other) const;
    void operator+=(const STerm& other);
    STerm operator-(const STerm& other) const;
    void operator-=(const STerm& other);
    STerm operator-() const;

    STerm operator*(const STerm& other) const;
    void operator*=(const STerm& other);
    STerm operator/(const STerm& other) const;
    void operator/=(const STerm& other);
    // NOTE: this is not the same as .mod(). The modulus here can be arbitrary
    STerm operator%(const STerm& other) const;

    void operator<(const STerm& other) const;
    void operator<=(const STerm& other) const;
    void operator>(const STerm& other) const;
    void operator>=(const STerm& other) const;

    void operator==(const STerm& other) const;
    void operator!=(const STerm& other) const;

    STerm operator^(const STerm& other) const;
    void operator^=(const STerm& other);
    STerm operator&(const STerm& other) const;
    void operator&=(const STerm& other);
    STerm operator|(const STerm& other) const;
    void operator|=(const STerm& other);
    STerm operator~() const;

    /**
     * @brief Returns last `to_size` bits of variable
     * @param to_size number of bits to be extracted
     */
    STerm truncate(const uint32_t& to_size);
    /**
     * @brief Returns ith bit of variable
     * @param bit_index index of bit to be extracted
     */
    STerm extract_bit(const uint32_t& bit_index);

    operator std::string() const { return this->solver->stringify_term(term); };
    operator cvc5::Term() const { return term; };

    ~STerm() = default;

    friend std::ostream& operator<<(std::ostream& out, const STerm& term)
    {
        return out << static_cast<std::string>(term);
    };

    static STerm batch_add(const std::vector<STerm>& children)
    {
        if (children.size() == 0) {
            throw std::invalid_argument("Can't use batch_add on empty vector");
        }
        Solver* slv = children[0].solver;
        std::vector<cvc5::Term> terms(children.begin(), children.end());
        cvc5::Term res = slv->term_manager.mkTerm(children[0].operations.at(OpType::ADD), terms);
        return { res, slv, children[0].type };
    }

    static STerm batch_mul(const std::vector<STerm>& children)
    {
        if (children.size() == 0) {
            throw std::invalid_argument("Can't use batch_mul on empty vector");
        }
        Solver* slv = children[0].solver;
        std::vector<cvc5::Term> terms(children.begin(), children.end());
        cvc5::Term res = slv->term_manager.mkTerm(children[0].operations.at(OpType::MUL), terms);
        return { res, slv, children[0].type };
    }

    // arithmetic compatibility with Fr

    STerm operator+(const bb::fr& other) const { return *this + STerm(other, this->solver, this->type); }
    void operator+=(const bb::fr& other) { *this += STerm(other, this->solver, this->type); }
    STerm operator-(const bb::fr& other) const { return *this - STerm(other, this->solver, this->type); }
    void operator-=(const bb::fr& other) { *this -= STerm(other, this->solver, this->type); }

    STerm operator*(const bb::fr& other) const { return *this * STerm(other, this->solver, this->type); }
    void operator*=(const bb::fr& other) { *this *= STerm(other, this->solver, this->type); }
    STerm operator/(const bb::fr& other) const { return *this * STerm(other.invert(), this->solver, this->type); }
    void operator/=(const bb::fr& other) { *this *= STerm(other.invert(), this->solver, this->type); }
    // NOTE: this is not the same as .mod(). The modulus here can be arbitrary
    STerm operator%(const bb::fr& other) const { return *this % STerm(other, this->solver, this->type); }

    void operator<(const bb::fr& other) const { *this < STerm(other, this->solver, this->type); };
    void operator<=(const bb::fr& other) const { *this <= STerm(other, this->solver, this->type); };
    void operator>(const bb::fr& other) const { *this > STerm(other, this->solver, this->type); };
    void operator>=(const bb::fr& other) const { *this >= STerm(other, this->solver, this->type); };

    void operator==(const bb::fr& other) const { *this == STerm(other, this->solver, this->type); };
    void operator!=(const bb::fr& other) const { *this != STerm(other, this->solver, this->type); };

    STerm operator^(const bb::fr& other) const { return *this ^ STerm(other, this->solver, this->type); };
    void operator^=(const bb::fr& other) { *this ^= STerm(other, this->solver, this->type); };
    STerm operator&(const bb::fr& other) const { return *this & STerm(other, this->solver, this->type); };
    void operator&=(const bb::fr& other) { *this &= STerm(other, this->solver, this->type); };
    STerm operator|(const bb::fr& other) const { return *this | STerm(other, this->solver, this->type); };
    void operator|=(const bb::fr& other) { *this |= STerm(other, this->solver, this->type); };

    STerm operator<<(const uint32_t& n) const;
    void operator<<=(const uint32_t& n);
    STerm operator>>(const uint32_t& n) const;
    void operator>>=(const uint32_t& n);

    STerm rotr(const uint32_t& n) const;
    STerm rotl(const uint32_t& n) const;

    friend class Bool;
};

STerm operator+(const bb::fr& lhs, const STerm& rhs);
STerm operator-(const bb::fr& lhs, const STerm& rhs);
STerm operator*(const bb::fr& lhs, const STerm& rhs);
STerm operator/(const bb::fr& lhs, const STerm& rhs);
void operator==(const bb::fr& lhs, const STerm& rhs);
void operator!=(const bb::fr& lhs, const STerm& rhs);
STerm operator^(const bb::fr& lhs, const STerm& rhs);
STerm operator&(const bb::fr& lhs, const STerm& rhs);
STerm operator|(const bb::fr& lhs, const STerm& rhs);

STerm FFVar(const std::string& name, Solver* slv);
STerm FFConst(const std::string& val, Solver* slv, uint32_t base = 16);
STerm FFConst(const bb::fr& val, Solver* slv);

STerm FFIVar(const std::string& name, Solver* slv);
STerm FFIConst(const std::string& val, Solver* slv, uint32_t base = 16);
STerm FFIConst(const bb::fr& val, Solver* slv);

STerm IVar(const std::string& name, Solver* slv);
STerm IConst(const std::string& val, Solver* slv, uint32_t base = 16);
STerm IConst(const bb::fr& val, Solver* slv);

STerm BVVar(const std::string& name, Solver* slv);
STerm BVConst(const std::string& val, Solver* slv, uint32_t base = 16);
STerm BVConst(const bb::fr& val, Solver* slv);

} // namespace smt_terms