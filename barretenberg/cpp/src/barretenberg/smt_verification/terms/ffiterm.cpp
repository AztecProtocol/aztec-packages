#include "ffiterm.hpp"

namespace smt_terms {

/**
 * Create an integer mod symbolic variable.
 *
 * @param name Name of the variable. Should be unique per variable.
 * @param slv  Pointer to the global solver.
 * @return Finite field symbolic variable.
 * */
FFITerm FFITerm::Var(const std::string& name, Solver* slv)
{
    return FFITerm(name, slv);
};

/**
 * Create an integer mod numeric member.
 *
 * @param val  String representation of the value.
 * @param slv  Pointer to the global solver.
 * @param base Base of the string representation. 16 by default.
 * @return Finite field constant.
 * */
FFITerm FFITerm::Const(const std::string& val, Solver* slv, uint32_t base)
{
    return FFITerm(val, slv, true, base);
};

FFITerm::FFITerm(const std::string& t, Solver* slv, bool isconst, uint32_t base)
    : solver(slv)
    , modulus(slv->s.mkInteger(slv->modulus))
{
    if (!isconst) {
        this->term = slv->s.mkConst(slv->s.getIntegerSort(), t);
        cvc5::Term ge = slv->s.mkTerm(cvc5::Kind::GEQ, { this->term, slv->s.mkInteger(0) });
        cvc5::Term lt = slv->s.mkTerm(cvc5::Kind::LT, { this->term, this->modulus });
        slv->s.assertFormula(ge);
        slv->s.assertFormula(lt);
    } else {
        std::string strvalue = slv->s.mkFiniteFieldElem(t, slv->fp, base).getFiniteFieldValue(); // TODO(alex): works for now
        this->term = slv->s.mkInteger(strvalue);
        this->mod();
    }
}

void FFITerm::mod(){
    this->term = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, {this->term, this->modulus});
}

FFITerm FFITerm::operator+(const FFITerm& other) const
{
    cvc5::Term res = this->solver->s.mkTerm(cvc5::Kind::ADD, { this->term, other.term });
    return { res, this->solver };
}

void FFITerm::operator+=(const FFITerm& other)
{
    this->term = this->solver->s.mkTerm(cvc5::Kind::ADD, { this->term, other.term });
}

FFITerm FFITerm::operator-(const FFITerm& other) const
{
    cvc5::Term res = this->solver->s.mkTerm(cvc5::Kind::SUB, { this->term, other.term });
    return { res, this->solver };
}

void FFITerm::operator-=(const FFITerm& other)
{
    this->term = this->solver->s.mkTerm(cvc5::Kind::SUB, { this->term, other.term });
}

FFITerm FFITerm::operator-() const{
    cvc5::Term res = this->solver->s.mkTerm(cvc5::Kind::NEG, { this->term });
    return { res, this-> solver};
}

FFITerm FFITerm::operator*(const FFITerm& other) const
{
    cvc5::Term res = solver->s.mkTerm(cvc5::Kind::MULT, { this->term, other.term });
    return { res, this->solver };
}

void FFITerm::operator*=(const FFITerm& other)
{
    this->term = this->solver->s.mkTerm(cvc5::Kind::MULT, { this->term, other.term });
}

/**
 * @brief Division operation
 *
 * @details Returns a result of the division by
 * creating a new symbolic variable and adding a new constraint
 * to the solver.
 *
 * @param other
 * @return FFITerm
 */
FFITerm FFITerm::operator/(const FFITerm& other) const
{
    cvc5::Term nz = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, { other.term, this->modulus });
    nz = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { nz, this->solver->s.mkInteger("0") });
    nz = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { nz, this->solver->s.mkBoolean(false) });
    this->solver->s.assertFormula(nz);

    cvc5::Term res = Var("fe0f65a52067384116dc1137d798e0ca00a7ed46950e4eab7db51e08481535f2_div_" + std::string(*this) + "_" + std::string(other), this->solver).term;
    cvc5::Term div = this->solver->s.mkTerm(cvc5::Kind::MULT, { res, other.term });
    div = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, { div, this->modulus });
    cvc5::Term eq = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { this->term, div });
    this->solver->s.assertFormula(eq);
    return { res, this->solver };
}

void FFITerm::operator/=(const FFITerm& other)
{
    cvc5::Term nz = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, { other.term, this->modulus });
    nz = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { nz, this->solver->s.mkInteger("0") });
    nz = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { nz, this->solver->s.mkBoolean(false) });
    this->solver->s.assertFormula(nz);

    cvc5::Term res = Var("fe0f65a52067384116dc1137d798e0ca00a7ed46950e4eab7db51e08481535f2_div_" + std::string(*this) + "_" + std::string(other), this->solver).term;
    cvc5::Term div = this->solver->s.mkTerm(cvc5::Kind::MULT, { res, other.term });
    div = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, { div, this->modulus });
    cvc5::Term eq = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { this->term, div });
    this->solver->s.assertFormula(eq);
    this->term = res;
}

/**
 * Create an equality constraint between two integer mod elements.
 *
 */
void FFITerm::operator==(const FFITerm& other) const
{
    cvc5::Term eq = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { this->term, other.term });
    this->solver->s.assertFormula(eq);
}

/**
 * Create an inequality constraint between two integer mod elements.
 *
 */
void FFITerm::operator!=(const FFITerm& other) const
{
    cvc5::Term eq = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { this->term, other.term });
    eq = this->solver->s.mkTerm(cvc5::Kind::EQUAL, { eq, this->solver->s.mkBoolean(false) });
    this->solver->s.assertFormula(eq);
}

FFITerm FFITerm::operator^(const FFITerm& other) const
{
    cvc5::Term res = this->solver->s.mkTerm(cvc5::Kind::XOR, {this->term, other.term});
    return {res, this->solver};
}

void FFITerm::operator^=(const FFITerm& other)
{
    this->term = this->solver->s.mkTerm(cvc5::Kind::XOR, {this->term, other.term});
}

FFITerm operator+(const bb::fr& lhs, const FFITerm& rhs){
    return rhs + lhs;
}

FFITerm operator-(const bb::fr& lhs, const FFITerm& rhs){
    return (-rhs) + lhs;
}

FFITerm operator*(const bb::fr& lhs, const FFITerm& rhs){
    return rhs * lhs;
}

FFITerm operator/(const bb::fr& lhs, const FFITerm& rhs){
    return FFITerm(lhs, rhs.solver) / rhs;
}

FFITerm operator^(const bb::fr& lhs, const FFITerm& rhs){
    return rhs ^ lhs;
}
void operator==(const bb::fr& lhs, const FFITerm& rhs){
    rhs == lhs;
}

void operator!=(const bb::fr& lhs, const FFITerm& rhs){
    rhs != lhs;
}

void FFITerm::operator<(const bb::fr& other) const{
    cvc5::Term lt = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, {this->term, this->modulus});
    lt = this->solver->s.mkTerm(cvc5::Kind::LT, {this->term, FFITerm(other, this->solver)});
    this->solver->s.assertFormula(lt);
}
void FFITerm::operator<=(const bb::fr& other) const{
    cvc5::Term le = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, {this->term, this->modulus});
    le = this->solver->s.mkTerm(cvc5::Kind::LEQ, {this->term, FFITerm(other, this->solver)});
    this->solver->s.assertFormula(le);
}
void FFITerm::operator>(const bb::fr& other) const{
    cvc5::Term gt = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, {this->term, this->modulus});
    gt = this->solver->s.mkTerm(cvc5::Kind::GT, {this->term, FFITerm(other, this->solver)});
    this->solver->s.assertFormula(gt);
}
void FFITerm::operator>=(const bb::fr& other) const{
    cvc5::Term ge = this->solver->s.mkTerm(cvc5::Kind::INTS_MODULUS, {this->term, this->modulus});
    ge = this->solver->s.mkTerm(cvc5::Kind::GEQ, {this->term, FFITerm(other, this->solver)});
    this->solver->s.assertFormula(ge);
}

} // namespace smt_terms
