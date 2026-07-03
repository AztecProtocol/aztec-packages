#pragma once

#include "log.hpp"

// Minimal assertion helpers for wsdb, replacing barretenberg's common/assert.hpp with no bb
// dependency. Assertions throw (the wsdb service turns these into error responses rather than
// aborting the process). Unlike barretenberg there is no throw_or_abort indirection — that exists
// to support wasm (which cannot throw); wsdb is a native server, so it just throws.
#define BB_ASSERT_BINOP(a, op, b)                                                                                      \
    do {                                                                                                               \
        if (!((a)op(b))) {                                                                                             \
            throw std::runtime_error(                                                                                  \
                azteclabs::wsdb::detail::log_concat("assertion failed: ", #a, " ", #op, " ", #b));                     \
        }                                                                                                              \
    } while (0)

#define BB_ASSERT_GT(a, b, ...) BB_ASSERT_BINOP(a, >, b)
#define BB_ASSERT_GTE(a, b, ...) BB_ASSERT_BINOP(a, >=, b)
#define BB_ASSERT_LT(a, b, ...) BB_ASSERT_BINOP(a, <, b)
#define BB_ASSERT_LTE(a, b, ...) BB_ASSERT_BINOP(a, <=, b)
#define BB_ASSERT_EQ(a, b, ...) BB_ASSERT_BINOP(a, ==, b)
#define BB_ASSERT(cond, ...)                                                                                           \
    do {                                                                                                               \
        if (!(cond)) {                                                                                                 \
            throw std::runtime_error(azteclabs::wsdb::detail::log_concat("assertion failed: ", #cond));                \
        }                                                                                                              \
    } while (0)
#define BB_ASSERT_DEBUG(...) ((void)0)
