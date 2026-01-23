#include "retrieved_bytecodes_tree.hpp"

#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2::simulation {

bool ClassIdLeafValue::is_updateable()
{
    return true;
}

bool ClassIdLeafValue::operator==(ClassIdLeafValue const& other) const
{
    return class_id == other.class_id;
}

std::ostream& operator<<(std::ostream& os, const ClassIdLeafValue& v)
{
    os << "slot = " << v.class_id;
    return os;
}

fr ClassIdLeafValue::get_key() const
{
    return class_id;
}

bool ClassIdLeafValue::is_empty() const
{
    return class_id.is_zero();
}

std::vector<fr> ClassIdLeafValue::get_hash_inputs(fr nextKey, fr nextIndex) const
{
    return std::vector<fr>({ class_id, nextKey, nextIndex });
}

ClassIdLeafValue::operator uint256_t() const
{
    return get_key();
}

ClassIdLeafValue ClassIdLeafValue::empty()
{
    return { fr::zero() };
}

ClassIdLeafValue ClassIdLeafValue::padding(index_t i)
{
    return { i };
}

std::string ClassIdLeafValue::name()
{
    return "ClassIdLeafValue";
}

RetrievedBytecodesTree build_retrieved_bytecodes_tree()
{
    return RetrievedBytecodesTree(AVM_RETRIEVED_BYTECODES_TREE_HEIGHT, AVM_RETRIEVED_BYTECODES_TREE_INITIAL_SIZE);
}

} // namespace bb::avm2::simulation
