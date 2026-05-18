// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"

#include <unordered_map>

namespace bb::plookup {

struct LookupHashTable::State {
    struct HashFunction {
        FF mult_const;
        FF const_sqr;

        HashFunction()
            : mult_const(FF(uint256_t(0x1337, 0x1336, 0x1335, 0x1334)))
            , const_sqr(mult_const.sqr())
        {}

        size_t operator()(const Key& entry) const
        {
            FF result = entry[0] + mult_const * entry[1] + const_sqr * entry[2];
            return static_cast<size_t>(result.reduce_once().data[0]);
        }
    };

    std::unordered_map<Key, Value, HashFunction> index_map;
};

LookupHashTable::LookupHashTable()
    : state(new State)
{}

LookupHashTable::~LookupHashTable()
{
    delete state;
}

LookupHashTable::LookupHashTable(const LookupHashTable& other)
    : state(other.state ? new State(*other.state) : nullptr)
{}

LookupHashTable::LookupHashTable(LookupHashTable&& other) noexcept
    : state(other.state)
{
    other.state = nullptr;
}

LookupHashTable& LookupHashTable::operator=(const LookupHashTable& other)
{
    if (this != &other) {
        State* new_state = other.state ? new State(*other.state) : nullptr;
        delete state;
        state = new_state;
    }
    return *this;
}

LookupHashTable& LookupHashTable::operator=(LookupHashTable&& other) noexcept
{
    if (this != &other) {
        delete state;
        state = other.state;
        other.state = nullptr;
    }
    return *this;
}

void LookupHashTable::initialize(std::vector<FF>& column_1, std::vector<FF>& column_2, std::vector<FF>& column_3)
{
    BB_ASSERT_DEBUG(column_1.size() == column_2.size() && column_2.size() == column_3.size());
    for (size_t i = 0; i < column_1.size(); ++i) {
        state->index_map[{ column_1[i], column_2[i], column_3[i] }] = i;
    }
}

LookupHashTable::Value LookupHashTable::operator[](const Key& key) const
{
    auto it = state->index_map.find(key);
    BB_ASSERT_DEBUG(it != state->index_map.end(), "LookupHashTable: Key not found!");
    return it->second;
}

bool LookupHashTable::operator==(const LookupHashTable& other) const
{
    if (!state || !other.state) {
        return state == other.state;
    }
    return state->index_map == other.state->index_map;
}

} // namespace bb::plookup
