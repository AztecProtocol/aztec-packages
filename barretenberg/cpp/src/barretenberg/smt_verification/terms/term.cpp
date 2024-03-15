#include "barretenberg/smt_verification/terms/term.hpp"
#include "ffterm.hpp"

namespace smt_terms {

/**
 * Create a finite field symbolic variable.
 *
 * @param name Name of the variable. Should be unique per variable.
 * @param slv  Pointer to the global solver.
 * @return Finite field symbolic variable.
 * */
STerm STerm::Var(const std::string& name, Solver* slv, TermType type)
{
    return STerm(name, slv, false, 16, type);
};

/**
 * Create a finite field numeric member.
 *
 * @param val  String representation of the value.
 * @param slv  Pointer to the global solver.
 * @param base Base of the string representation. 16 by default.
 * @return Finite field constant.
 * */
STerm STerm::Const(const std::string& val, Solver* slv, uint32_t base, TermType type)
{
    return STerm(val, slv, true, base, type);
};

STerm::STerm(const std::string& t, Solver* slv, bool isconst, uint32_t base, TermType type)
    : solver(slv)
    , isFiniteField(type == TermType::FFTerm)
    , isInteger(type == TermType::FFITerm)
    , isBitVector(type == TermType::BVTerm)
    , type(type)
{
    if (!isconst) {
        cvc5::Term ge;
        cvc5::Term lt;
        cvc5::Term modulus;
        switch (type){
            case TermType::FFTerm:
                this->term = slv->term_manager.mkConst(slv->ff_sort, t);
                break;
            case TermType::FFITerm:
                this->term = slv->term_manager.mkConst(slv->term_manager.getIntegerSort(), t);
                ge = slv->term_manager.mkTerm(cvc5::Kind::GEQ, { this->term, slv->term_manager.mkInteger(0) });
                modulus = slv->term_manager.mkInteger(slv->modulus);
                lt = slv->term_manager.mkTerm(cvc5::Kind::LT, { this->term, modulus});
                slv->assertFormula(ge);
                slv->assertFormula(lt);
                break;
            case TermType::BVTerm:
                this->term = slv->term_manager.mkConst(slv->bv_sort);
                ge = slv->term_manager.mkTerm(cvc5::Kind::BITVECTOR_UGE ,{this->term, slv->term_manager.mkBitVector(slv->bv_sort.getBitVectorSize(), 0)});
                modulus = slv->term_manager.mkBitVector(slv->bv_sort.getBitVectorSize(), slv->modulus, 10);
                lt = slv->term_manager.mkTerm(cvc5::Kind::BITVECTOR_ULT, { this->term, modulus});
                slv->assertFormula(ge);
                slv->assertFormula(lt);
                break;
        }
    } else {
        std::string strvalue;
        switch (type){
            case TermType::FFTerm:
                this->term = slv->term_manager.mkFiniteFieldElem(t, slv->ff_sort, base);
                break;
            case TermType::FFITerm:
                // TODO(alex): CVC5 doesn't provide integer initialization from hex. Yet.
                strvalue = slv->term_manager.mkFiniteFieldElem(t, slv->ff_sort, base).getFiniteFieldValue();
                this->term = slv->term_manager.mkInteger(strvalue);
                this->mod();
                break;
            case TermType::BVTerm:
                this->term = slv->term_manager.mkBitVector(slv->bv_sort.getBitVectorSize(), t, 16);
                break;
        }
    }

    this->operations = {
        {OpType::ADD, cvc5::Kind::NULL_TERM},
        {OpType::SUB,cvc5::Kind::NULL_TERM},
        {OpType::MUL,cvc5::Kind::NULL_TERM},
        {OpType::NEG,cvc5::Kind::NULL_TERM},
        {OpType::XOR,cvc5::Kind::NULL_TERM},
        {OpType::AND,cvc5::Kind::NULL_TERM},
        {OpType::OR,cvc5::Kind::NULL_TERM},
        {OpType::GT,cvc5::Kind::NULL_TERM},
        {OpType::GE,cvc5::Kind::NULL_TERM},
        {OpType::LT,cvc5::Kind::NULL_TERM},
        {OpType::LE,cvc5::Kind::NULL_TERM},
        {OpType::MOD,cvc5::Kind::NULL_TERM},
        {OpType::ROTR,cvc5::Kind::NULL_TERM},
        {OpType::ROTL,cvc5::Kind::NULL_TERM},
        {OpType::RSH,cvc5::Kind::NULL_TERM},
        {OpType::LSH,cvc5::Kind::NULL_TERM},
    };

    switch(type){
        case TermType::FFTerm:
            this->operations[OpType::ADD] = cvc5::Kind::FINITE_FIELD_ADD;
            this->operations[OpType::MUL] = cvc5::Kind::FINITE_FIELD_MULT;
            this->operations[OpType::NEG] = cvc5::Kind::FINITE_FIELD_NEG;
            break;
        case TermType::FFITerm:
            this->operations[OpType::ADD] = cvc5::Kind::ADD;
            this->operations[OpType::SUB] = cvc5::Kind::SUB;
            this->operations[OpType::MUL] = cvc5::Kind::MULT;
            this->operations[OpType::NEG] = cvc5::Kind::NEG;
            this->operations[OpType::GT] = cvc5::Kind::GT;
            this->operations[OpType::GE] = cvc5::Kind::GEQ;
            this->operations[OpType::LT] = cvc5::Kind::LT;
            this->operations[OpType::LE] = cvc5::Kind::LEQ;
            this->operations[OpType::MOD] = cvc5::Kind::INTS_MODULUS;
            break;
        case TermType::BVTerm:
            this->operations[OpType::ADD] = cvc5::Kind::BITVECTOR_ADD;
            this->operations[OpType::SUB] = cvc5::Kind::BITVECTOR_SUB;
            this->operations[OpType::MUL] = cvc5::Kind::BITVECTOR_MULT;
            this->operations[OpType::NEG] = cvc5::Kind::BITVECTOR_NEG;
            this->operations[OpType::GT] = cvc5::Kind::BITVECTOR_UGT;
            this->operations[OpType::GE] = cvc5::Kind::BITVECTOR_UGE;
            this->operations[OpType::LT] = cvc5::Kind::BITVECTOR_ULT;
            this->operations[OpType::LE] = cvc5::Kind::BITVECTOR_ULE;
            this->operations[OpType::XOR] = cvc5::Kind::BITVECTOR_XOR;
            this->operations[OpType::AND] = cvc5::Kind::BITVECTOR_AND;
            this->operations[OpType::OR] = cvc5::Kind::BITVECTOR_OR;
            this->operations[OpType::RSH] = cvc5::Kind::BITVECTOR_LSHR;
            this->operations[OpType::LSH] = cvc5::Kind::BITVECTOR_SHL;
            this->operations[OpType::ROTL] = cvc5::Kind::BITVECTOR_ROTATE_LEFT;
            this->operations[OpType::ROTR] = cvc5::Kind::BITVECTOR_ROTATE_RIGHT;
            break;
    }
}

void STerm::mod(){
    if(this->type == TermType::FFITerm){
        cvc5::Term modulus = this->solver->term_manager.mkInteger(solver->modulus);
        this->term = this->solver->term_manager.mkTerm(this->operations.at(OpType::MOD), { this->term, modulus});
    }
}

STerm STerm::operator+(const STerm& other) const
{
    cvc5::Term res = this->solver->term_manager.mkTerm(this->operations.at(OpType::ADD), { this->term, other.term });
    return { res, this->solver };
}

void STerm::operator+=(const STerm& other)
{
    this->term = this->solver->term_manager.mkTerm(this->operations.at(OpType::ADD), { this->term, other.term });
}

STerm STerm::operator-(const STerm& other) const
{
    cvc5::Term res = this->solver->term_manager.mkTerm(this->operations.at(OpType::NEG), { other.term });
    res = solver->term_manager.mkTerm(this->operations.at(OpType::ADD), { this->term, res });
    return { res, this->solver };
}

void STerm::operator-=(const STerm& other)
{
    cvc5::Term tmp_term = this->solver->term_manager.mkTerm(this->operations.at(OpType::NEG), { other.term });
    this->term = this->solver->term_manager.mkTerm(cvc5::Kind::FINITE_FIELD_ADD, { this->term, tmp_term });
}

STerm STerm::operator-() const
{
    cvc5::Term res = this->solver->term_manager.mkTerm(this->operations.at(OpType::NEG), { this->term });
    return { res, this->solver };
}

STerm STerm::operator*(const STerm& other) const
{
    cvc5::Term res = solver->term_manager.mkTerm(this->operations.at(OpType::MUL), { this->term, other.term });
    return { res, this->solver };
}

void STerm::operator*=(const STerm& other)
{
    this->term = this->solver->term_manager.mkTerm(this->operations.at(OpType::MUL), { this->term, other.term });
}

/**
 * @brief Division operation
 *
 * @details Returns a result of the division by
 * creating a new symbolic variable and adding a new constraint
 * to the solver.
 *
 * @param other
 * @return STerm
 */
STerm STerm::operator/(const STerm& other) const
{
    if(this->operations.at(OpType::DIV) == cvc5::Kind::NULL_TERM){
        info("Division is not compatible with ", this->type);
        return *this;
    }
    other != bb::fr(0);
    STerm res = Var("df8b586e3fa7a1224ec95a886e17a7da_div_" + static_cast<std::string>(*this) + "_" +
                         static_cast<std::string>(other),
                     this->solver);
    res* other == *this;
    return res;
}

void STerm::operator/=(const STerm& other)
{
    if(this->operations.at(OpType::DIV) == cvc5::Kind::NULL_TERM){
        info("Division is not compatible with ", this->type);
        return;
    }
    other != bb::fr(0);
    STerm res = Var("df8b586e3fa7a1224ec95a886e17a7da_div_" + static_cast<std::string>(*this) + "_" +
                         static_cast<std::string>(other),
                     this->solver);
    res* other == *this;
    this->term = res.term;
}

/**
 * Create an equality constraint between two finite field elements.
 *
 */
void STerm::operator==(const STerm& other) const
{
    STerm tmp1 = *this;
    if (tmp1.term.getNumChildren() > 1) {
        tmp1.mod();
    }
    STerm tmp2 = other;
    if (tmp2.term.getNumChildren() > 1) {
        tmp2.mod();
    }
    cvc5::Term eq = this->solver->term_manager.mkTerm(cvc5::Kind::EQUAL, { tmp1.term, tmp2.term });
    this->solver->assertFormula(eq);
}

/**
 * Create an inequality constraint between two finite field elements.
 *
 */
void STerm::operator!=(const STerm& other) const
{
    STerm tmp1 = *this;
    if (tmp1.term.getNumChildren() > 1) {
        tmp1.mod();
    }
    STerm tmp2 = other;
    if (tmp2.term.getNumChildren() > 1) {
        tmp2.mod();
    }
    cvc5::Term eq = this->solver->term_manager.mkTerm(cvc5::Kind::EQUAL, { tmp1.term, tmp2.term });
    eq = this->solver->term_manager.mkTerm(cvc5::Kind::NOT, { eq });
    this->solver->assertFormula(eq);
}

void STerm::operator<(const bb::fr& other) const
{
    cvc5::Kind op = this->operations.at(OpType::LT);
    if(op == cvc5::Kind::NULL_TERM){
        info("LT is not compatible with ", this->type);
        return;
    }
 
    cvc5::Term lt = this->solver->term_manager.mkTerm(op, { this->term, STerm(other, this->solver, this->type) });
    this->solver->assertFormula(lt);
}

void STerm::operator<=(const bb::fr& other) const
{
    cvc5::Kind op = this->operations.at(OpType::LE);
    if(op == cvc5::Kind::NULL_TERM){
        info("LE is not compatible with ", this->type);
        return;
    }
    cvc5::Term le = this->solver->term_manager.mkTerm(op, { this->term, STerm(other, this->solver, this->type) });
    this->solver->assertFormula(le);
}

void STerm::operator>(const bb::fr& other) const
{
    cvc5::Kind op = this->operations.at(OpType::GT);
    if(op == cvc5::Kind::NULL_TERM){
        info("GT is not compatible with ", this->type);
        return;
    }
    cvc5::Term gt = this->solver->term_manager.mkTerm(op, { this->term, STerm(other, this->solver, this->type) });
    this->solver->assertFormula(gt);
}

void STerm::operator>=(const bb::fr& other) const
{
    cvc5::Kind op = this->operations.at(OpType::GE);
    if(op == cvc5::Kind::NULL_TERM){
        info("GE is not compatible with ", this->type);
        return;
    }
    cvc5::Term ge = this->solver->term_manager.mkTerm(op, { this->term, STerm(other, this->solver, this->type) });
    this->solver->assertFormula(ge);
}

STerm STerm::operator^(const STerm& other) const{
    cvc5::Kind op = this->operations.at(OpType::XOR);
    if(op == cvc5::Kind::NULL_TERM){
        info("XOR is not compatible with ", this->type);
        return *this;
    }
    cvc5::Term res = solver->term_manager.mkTerm(op, { this->term, other.term });
    return { res, this->solver };
}

void STerm::operator^=(const STerm& other){
    cvc5::Kind op = this->operations.at(OpType::XOR);
    if(op == cvc5::Kind::NULL_TERM){
        info("XOR is not compatible with ", this->type);
    }
    this->term = solver->term_manager.mkTerm(op, { this->term, other.term });
}

STerm STerm::operator&(const STerm& other) const{
    cvc5::Kind op = this->operations.at(OpType::AND);
    if(op == cvc5::Kind::NULL_TERM){
        info("AND is not compatible with ", this->type);
        return *this;
    }
    cvc5::Term res = solver->term_manager.mkTerm(op, { this->term, other.term });
    return { res, this->solver };
}

void STerm::operator&=(const STerm& other){
    cvc5::Kind op = this->operations.at(OpType::AND);
    if(op == cvc5::Kind::NULL_TERM){
        info("AND is not compatible with ", this->type);
    }
    this->term = solver->term_manager.mkTerm(op, { this->term, other.term });
}

STerm STerm::operator|(const STerm& other) const{
    cvc5::Kind op = this->operations.at(OpType::OR);
    if(op == cvc5::Kind::NULL_TERM){
        info("OR is not compatible with ", this->type);
    }
    cvc5::Term res = solver->term_manager.mkTerm(op, { this->term, other.term });
    return { res, this->solver };
}

void STerm::operator|=(const STerm& other){
    cvc5::Kind op = this->operations.at(OpType::OR);
    if(op == cvc5::Kind::NULL_TERM){
        info("OR is not compatible with ", this->type);
    }
    this->term = solver->term_manager.mkTerm(op, { this->term, other.term });
}

STerm STerm::operator<<(const uint32_t& n) const{
    cvc5::Kind op = this->operations.at(OpType::LSH);
    if(op == cvc5::Kind::NULL_TERM){
        info("SHIFT LEFT is not compatible with ", this->type);
        return *this;
    }
    cvc5::Term res = solver->term_manager.mkTerm(op, { this->term, this->solver->term_manager.mkInteger(n) });
    return { res, this->solver };
}

void STerm::operator<<=(const uint32_t& n){
    cvc5::Kind op = this->operations.at(OpType::LSH);
    if(op == cvc5::Kind::NULL_TERM){
        info("SHIFT LEFT is not compatible with ", this->type);
    }
    this->term = solver->term_manager.mkTerm(op, { this->term, this->solver->term_manager.mkInteger(n) });
}

STerm STerm::operator>>(const uint32_t& n) const{
    cvc5::Kind op = this->operations.at(OpType::RSH);
    if(op == cvc5::Kind::NULL_TERM){
        info("RIGHT LEFT is not compatible with ", this->type);
        return *this;
    }
    cvc5::Term res = solver->term_manager.mkTerm(op, { this->term, this->solver->term_manager.mkInteger(n) });
    return { res, this->solver };
}

void STerm::operator>>=(const uint32_t& n){
    cvc5::Kind op = this->operations.at(OpType::RSH);
    if(op == cvc5::Kind::NULL_TERM){
        info("RIGHT LEFT is not compatible with ", this->type);
    }
    this->term = solver->term_manager.mkTerm(op, { this->term, this->solver->term_manager.mkInteger(n) });
}

void STerm::rotr(const uint32_t& n){
    cvc5::Kind op = this->operations.at(OpType::ROTR);
    if(op == cvc5::Kind::NULL_TERM){
        info("ROTR is not compatible with ", this->type);
        return;
    }
    this->term = solver->term_manager.mkTerm(op, { this->term, this->solver->term_manager.mkInteger(n) });
}

void STerm::rotl(const uint32_t& n){
    cvc5::Kind op = this->operations.at(OpType::ROTL);
    if(op == cvc5::Kind::NULL_TERM){
        info("ROTL is not compatible with ", this->type);
        return;
    }
    this->term = solver->term_manager.mkTerm(op, { this->term, this->solver->term_manager.mkInteger(n) });
}

STerm operator+(const bb::fr& lhs, const STerm& rhs)
{
    return rhs + lhs;
}

STerm operator-(const bb::fr& lhs, const STerm& rhs)
{
    return (-rhs) + lhs;
}

STerm operator*(const bb::fr& lhs, const STerm& rhs)
{
    return rhs * lhs;
}

STerm operator^(const bb::fr& lhs, const STerm& rhs)
{
    return rhs ^ lhs;
}

STerm operator&(const bb::fr& lhs, const STerm& rhs)
{
    return rhs & lhs;
}

STerm operator|(const bb::fr& lhs, const STerm& rhs)
{
    return rhs | lhs;
}

STerm operator/(const bb::fr& lhs, const STerm& rhs)
{
    return STerm(lhs, rhs.solver, rhs.type) / rhs;
}

void operator==(const bb::fr& lhs, const STerm& rhs)
{
    rhs == lhs;
}

void operator!=(const bb::fr& lhs, const STerm& rhs)
{
    rhs != lhs;
}

std::ostream& operator<<(std::ostream& os, const TermType type){
    switch(type){
        case TermType::FFTerm:
            os << "FFTerm";
            break;
        case TermType::FFITerm:
            os << "FFITerm";
            break;
        case TermType::BVTerm:
            os << "BVTerm";
            break;
    };
    return os;
}


STerm FFVar(const std::string& name, Solver* slv){
    return STerm::Var(name, slv, TermType::FFTerm);
}

STerm FFConst(const std::string& val, Solver* slv, uint32_t base){
    return STerm::Const(val, slv, base, TermType::FFTerm);
}

STerm FFIVar(const std::string& name, Solver* slv){
    return STerm::Var(name, slv, TermType::FFITerm);
}

STerm FFIConst(const std::string& val, Solver* slv, uint32_t base){
    return STerm::Const(val, slv, base, TermType::FFITerm);
}

STerm BVVar(const std::string& name, Solver* slv){
    return STerm::Var(name, slv, TermType::BVTerm);
}

STerm BVConst(const std::string& val, Solver* slv, uint32_t base){
    return STerm::Const(val, slv, base, TermType::BVTerm);
}

} // namespace smt_terms