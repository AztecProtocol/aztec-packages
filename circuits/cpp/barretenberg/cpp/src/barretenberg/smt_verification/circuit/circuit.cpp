#include "circuit.hpp"
namespace smt_circuit {

/**
 * @brief Construct a new Circuit::Circuit object
 * 
 * @param circuit_info CircuitShema object
 * @param solver pointer to the global solver
 * @param tag tag of the circuit. Empty by default.
 */
Circuit::Circuit(CircuitSchema& circuit_info, Solver* solver, const std::string& tag)
    : public_inps(circuit_info.public_inps)
    , vars_of_interest(circuit_info.vars_of_interest)
    , wit_idxs(circuit_info.wits)
    , solver(solver)
    , tag(tag)
{
    if (!this->tag.empty()) {
        if (this->tag[0] != '_') {
            this->tag = "_" + this->tag;
        }
    }

    for (auto var : circuit_info.variables) {
        std::stringstream buf; // TODO(alex): looks bad. Would be great to create tostring() converter
        buf << var;
        std::string tmp = buf.str();
        tmp[1] = '0'; // avoiding x in 0x part
        variables.push_back(tmp);
    }

    for (auto& x : vars_of_interest) {
        terms.insert({ x.second, x.first });
    }

    // I hope they are still at these idxs
    vars_of_interest.insert({ 0, "zero" });
    vars_of_interest.insert({ 1, "one" });
    terms.insert({ "zero", 0 });
    terms.insert({ "one", 1 });

    for (auto sel : circuit_info.selectors) {
        std::vector<std::string> tmp_sel;
        for (size_t j = 0; j < 5; j++) {
            std::stringstream buf; // TODO(alex): #2
            buf << sel[j];
            std::string q_i = buf.str();
            q_i[1] = '0'; // avoiding x in 0x part
            tmp_sel.push_back(q_i);
        }
        selectors.push_back(tmp_sel);
    }

    this->init();
    this->add_gates();
}

/**
 * Creates all the needed symbolic variables and constants
 * which are used in circuit.
 * 
 */
void Circuit::init()
{
    size_t num_vars = variables.size();

    vars.push_back(Var("zero" + this->tag, this->solver));
    vars.push_back(Var("one" + this->tag, this->solver));

    for (size_t i = 2; i < num_vars; i++) {
        if (vars_of_interest.contains(static_cast<uint32_t>(i))) {
            std::string name = vars_of_interest[static_cast<uint32_t>(i)];
            vars.push_back(Var(name + this->tag, this->solver));
        } else {
            vars.push_back(Var("var_" + std::to_string(i) + this->tag, this->solver));
        }
    }

    vars[0] == Const("0", this->solver);
    vars[1] == Const("1", this->solver);

    for (auto i : public_inps) {
        vars[i] == Const(variables[i], this->solver);
    }
}

/**
 * @brief Adds all the gate constraints to the solver.
 * 
 */
void Circuit::add_gates()
{
    for (size_t i = 0; i < get_num_gates(); i++) {
        FFTerm q_m = Const(selectors[i][0], this->solver);
        FFTerm q_1 = Const(selectors[i][1], this->solver);
        FFTerm q_2 = Const(selectors[i][2], this->solver);
        FFTerm q_3 = Const(selectors[i][3], this->solver);
        FFTerm q_c = Const(selectors[i][4], this->solver);

        uint32_t w_l = wit_idxs[i][0];
        uint32_t w_r = wit_idxs[i][1];
        uint32_t w_o = wit_idxs[i][2];

        FFTerm eq = vars[0];

        // mult selector
        if (std::string(q_m) != "0") {
            eq += q_m * vars[w_l] * vars[w_r];
        }
        // w_l selector
        if (std::string(q_1) != "0") {
            eq += q_1 * vars[w_l];
        }
        // w_r selector
        if (std::string(q_2) != "0") {
            eq += q_2 * vars[w_r];
        }
        // w_o selector
        if (std::string(q_3) != "0") {
            eq += q_3 * vars[w_o];
        }
        // w_c selector
        if (std::string(q_c) != "0") {
            eq += q_c;
        }
        eq == vars[0];
    }
}

/**
 * @brief Returns a previously named symbolic variable.
 * 
 * @param name 
 * @return FFTerm 
 */
FFTerm Circuit::operator[](const std::string& name)
{
    if (!this->terms.contains(name)) {
        throw std::length_error("No such an item " + name + " in vars or it vas not declared as interesting");
    }
    uint32_t idx = this->terms[name];
    return this->vars[idx];
}

/**
 * @brief Get the CircuitSchema object
 * @details Initialize the CircuitSchmea from the binary file
 * that contains an msgpack compatible buffer.
 * 
 * @param filename 
 * @return CircuitSchema 
 */
CircuitSchema unpack_from_file(const std::string& filename)
{
    std::ifstream fin;
    fin.open(filename, std::ios::in | std::ios::binary);
    if (!fin.is_open()) {
        throw std::invalid_argument("file not found");
    }
    if (fin.tellg() == -1) {
        throw std::invalid_argument("something went wrong");
    }

    fin.ignore(std::numeric_limits<std::streamsize>::max()); // ohboy
    std::streamsize fsize = fin.gcount();
    fin.clear();
    fin.seekg(0, std::ios_base::beg);
    info("File size: ", fsize);

    CircuitSchema cir;
    char* encoded_data = (char*)aligned_alloc(64, static_cast<size_t>(fsize));
    fin.read(encoded_data, fsize);
    msgpack::unpack((const char*)encoded_data, static_cast<size_t>(fsize)).get().convert(cir);
    return cir;
}

/**
 * @brief Get the CircuitSchema object
 * @details Initialize the CircuitSchmea from the msgpack compatible buffer.
 * 
 * @param buf 
 * @return CircuitSchema 
 */
CircuitSchema unpack_from_buffer(const msgpack::sbuffer& buf)
{
    CircuitSchema cir;
    msgpack::unpack(buf.data(), buf.size()).get().convert(cir);
    return cir;
}

/**
 * @brief Check your circuit for witness uniqness
 * 
 * @details Creates two Circuit objects that represent the same
 * circuit, however you can choose which variables should be (not) equal in both cases,
 * and also the variables that should (not) be equal at the same time.
 *  
 * @param circuit_info 
 * @param s pointer to the global solver
 * @param equal all the variables that should be equal in both circuits
 * @param nequal all the variables that should be different in both circuits
 * @param eqall all the variables that should not be equal at the same time
 * @param neqall all the variables that should not be different at the same time
 * @return std::pair<Circuit, Circuit>
 */
std::pair<Circuit, Circuit> unique_witness(CircuitSchema& circuit_info,
                                           Solver* s,
                                           const std::vector<std::string>& equal,
                                           const std::vector<std::string>& nequal,
                                           const std::vector<std::string>& eqall,
                                           const std::vector<std::string>& neqall)
{
    Circuit c1(circuit_info, s, "circuit1");
    Circuit c2(circuit_info, s, "circuit2");

    for (const auto& term : equal) {
        c1[term] == c2[term];
    }
    for (const auto& term : nequal) {
        c1[term] != c2[term];
    }

    std::vector<Bool> eqs;
    for (const auto& term : eqall) {
        Bool tmp = Bool(c1[term]) == Bool(c2[term]);
        eqs.push_back(tmp);
    }

    if (eqs.size() > 1) {
        batch_or(eqs).assert_term();
    } else if (eqs.size() == 1) {
        eqs[0].assert_term();
    }

    std::vector<Bool> neqs;
    for (const auto& term : neqall) {
        Bool tmp = Bool(c1[term]) != Bool(c2[term]);
        neqs.push_back(tmp);
    }

    if (neqs.size() > 1) {
        batch_or(neqs).assert_term();
    } else if (neqs.size() == 1) {
        neqs[0].assert_term();
    }
    return { c1, c2 };
}

}; // namespace smt_circuit