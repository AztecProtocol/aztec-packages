// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

/**
 * @brief Include order of header-only field class is structured to ensure linter/language server can resolve paths.
 *        Declarations are defined in "field_declarations.hpp", definitions in "field_impl.hpp" (which includes
 *        declarations header) Spectialized definitions are in "field_impl_generic.hpp" and "field_impl_x64.hpp"
 *        (which include "field_impl.hpp")
 */
#include "./field_impl_generic.hpp"
#include "./field_impl_x64.hpp"
