#include "circuit.hpp"

namespace smt_circuit {

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

    fin.ignore(std::numeric_limits<std::streamsize>::max());
    std::streamsize fsize = fin.gcount();
    fin.clear();
    fin.seekg(0, std::ios_base::beg);

    CircuitSchema cir;
    char* encoded_data = (char*)aligned_alloc(64, static_cast<size_t>(fsize));
    fin.read(encoded_data, fsize);
    msgpack::unpack((const char*)encoded_data, static_cast<size_t>(fsize)).get().convert(cir);
    return cir;
}

void schema_to_python(CircuitSchema& cir){
    info("variables = [");
    for(uint32_t i = 0; i < static_cast<uint32_t>(cir.variables.size()); i++){
        if(cir.vars_of_interest.contains(i)){
            info('"', cir.vars_of_interest[i], "\",");
        }else{
            info("\"v", i, "\",");
        }
    }
    info("]");
    info("public = [");
    for(auto i: cir.public_inps){
        info("[", i, ", ", cir.variables[i], "],");
    }
    info("]");
    info("gates = [");

    for(size_t i = 0; i < cir.selectors.size(); i++){
        info("[", "[", cir.selectors[i][0], ", ", cir.selectors[i][1], ", ", cir.selectors[i][2], ", ", cir.selectors[i][3], ", ", cir.selectors[i][4], "], [", cir.wires[i][0], ", ", cir.wires[i][1], ", ", cir.wires[i][2],"]],");
    }
    info("]");
}

/**
 * @brief Get the CircuitSchema object
 * @details Initialize the CircuitSchema from the msgpack compatible buffer.
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
 * @param equal The list of names of variables which should be equal in both circuits(each is equal)
 * @param not_equal The list of names of variables which should not be equal in both circuits(each is not equal)
 * @param equal_at_the_same_time The list of variables, where at least one pair has to be equal
 * @param not_equal_at_the_same_time The list of variables, where at least one pair has to be distinct
 * @return std::pair<Circuit, Circuit>

 * TODO(alex): Maybe send here FFTerm or FFITerm instead of template since I would need them both inside the circuit.
 */
template <typename FF> 
std::pair<Circuit<FF>, Circuit<FF>> unique_witness_ext(CircuitSchema& circuit_info,
                                                   Solver* s,
                                                   const std::vector<std::string>& equal,
                                                   const std::vector<std::string>& not_equal,
                                                   const std::vector<std::string>& equal_at_the_same_time,
                                                   const std::vector<std::string>& not_equal_at_the_same_time) 
{
    Circuit<FF> c1(circuit_info, s, "circuit1");
    Circuit<FF> c2(circuit_info, s, "circuit2");

    for (const auto& term : equal) {
        c1[term] == c2[term];
    }
    for (const auto& term : not_equal) {
        c1[term] != c2[term];
    }

    std::vector<Bool> eqs;
    for (const auto& term : equal_at_the_same_time) {
        Bool tmp = Bool(c1[term]) == Bool(c2[term]);
        eqs.push_back(tmp);
    }

    if (eqs.size() > 1) {
        batch_or(eqs).assert_term();
    } else if (eqs.size() == 1) {
        eqs[0].assert_term();
    }

    std::vector<Bool> neqs;
    for (const auto& term : not_equal_at_the_same_time) {
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

template std::pair<Circuit<FFTerm>, Circuit<FFTerm>> unique_witness_ext(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {},
    const std::vector<std::string>& not_equal = {},
    const std::vector<std::string>& equal_at_the_same_time = {},
    const std::vector<std::string>& not_eqaul_at_the_same_time = {});

template std::pair<Circuit<FFITerm>, Circuit<FFITerm>> unique_witness_ext(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {},
    const std::vector<std::string>& not_equal = {},
    const std::vector<std::string>& equal_at_the_same_time = {},
    const std::vector<std::string>& not_eqaul_at_the_same_time = {});

/**
 * @brief Check your circuit for witness uniqness
 *
 * @details Creates two Circuit objects that represent the same
 * circuit, however you can choose which variables should be equal in both cases,
 * other witness members will be marked as not equal at the same time.
 *
 * @param circuit_info
 * @param s pointer to the global solver
 * @param equal The list of names of variables which should be equal in both circuits(each is equal)
 * @return std::pair<Circuit, Circuit>
 */
template <typename FF>
std::pair<Circuit<FF>, Circuit<FF>> unique_witness(CircuitSchema& circuit_info,
                                                   Solver* s,
                                                   const std::vector<std::string>& equal)
{
    Circuit<FF> c1(circuit_info, s, "circuit1");
    Circuit<FF> c2(circuit_info, s, "circuit2");

    for (const auto& term : equal) {
        c1[term] == c2[term];
    }

    std::vector<Bool> neqs;
    for (const auto &node: c1.symbolic_vars){
        uint32_t i = node.first;
        if(std::find(equal.begin(), equal.end(), std::string(c1.variable_names[i])) != equal.end()){
            continue;
        }
        Bool tmp = Bool(c1[i]) != Bool(c2[i]);
        neqs.push_back(tmp);
    }

    if (neqs.size() > 1) {
        batch_or(neqs).assert_term();
    } else if (neqs.size() == 1) {
        neqs[0].assert_term();
    }
    return { c1, c2 };
}

template std::pair<Circuit<FFTerm>, Circuit<FFTerm>> unique_witness(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {});

template std::pair<Circuit<FFITerm>, Circuit<FFITerm>> unique_witness(
    CircuitSchema& circuit_info,
    Solver* s,
    const std::vector<std::string>& equal = {});
}; // namespace smt_circuit