
#pragma once
#include "lmdb.h"
#include <cstring>
#include <sstream>
#include <string>
#include <vector>
namespace bb::lmdblib {
// Concatenate args into a string (replaces barretenberg's common `format`
// helper).
template <typename... Args> std::string format(Args &&...args) {
  std::ostringstream os;
  (os << ... << args);
  return os.str();
}

void throw_error(const std::string &errorString, int error);

int size_cmp(const MDB_val *a, const MDB_val *b);

std::vector<uint8_t> serialise_key(uint8_t key);
std::vector<uint8_t> serialise_key(uint64_t key);

void deserialise_key(void *data, uint8_t &key);
void deserialise_key(void *data, uint64_t &key);

// Fixed-width "field-like" keys (e.g. a 32-byte field element): serialised as
// the type's raw little-endian bytes. Templated so lmdblib needs no concrete
// big-int type from barretenberg; callers (e.g. the merkle trees) instantiate
// it with their own key type. The byte layout is unchanged from the old uint256
// overload.
template <typename T> std::vector<uint8_t> serialise_key(const T &key) {
  std::vector<uint8_t> buf(sizeof(T));
  std::memcpy(buf.data(), &key, sizeof(T));
  return buf;
}

template <typename T> void deserialise_key(void *data, T &key) {
  std::memcpy(&key, data, sizeof(T));
}

template <typename T> int value_cmp(const MDB_val *a, const MDB_val *b) {
  T lhs;
  T rhs;
  deserialise_key(a->mv_data, lhs);
  deserialise_key(b->mv_data, rhs);
  if (lhs < rhs) {
    return -1;
  }
  if (lhs > rhs) {
    return 1;
  }
  return 0;
}

std::vector<uint8_t> mdb_val_to_vector(const MDB_val &dbVal);
void copy_to_vector(const MDB_val &dbVal, std::vector<uint8_t> &target);

template <typename... TArgs>
bool call_lmdb_func(int (*f)(TArgs...), TArgs... args) {
  int error = f(args...);
  return error == 0;
}

template <typename... TArgs>
int call_lmdb_func_with_return(int (*f)(TArgs...), TArgs... args) {
  return f(args...);
}

template <typename... TArgs>
void call_lmdb_func(const std::string &errorString, int (*f)(TArgs...),
                    TArgs... args) {
  int error = f(args...);
  if (error != 0) {
    throw_error(errorString, error);
  }
}

template <typename... TArgs>
void call_lmdb_func(void (*f)(TArgs...), TArgs... args) {
  f(args...);
}
} // namespace bb::lmdblib