// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
// Compatibility shim.
// Old include path: "barretenberg/stdlib/transcript/transcript.hpp"
// New     include:  "barretenberg/transcript/transcript.hpp"
// Please migrate new code to the new include; this file just re-exports.

#include "barretenberg/transcript/transcript.hpp"

namespace bb::stdlib {
// Back-compat aliases (optional, but handy if any code used bb::stdlib::Transcript)
template <typename Builder> using Transcript = ::bb::StdlibTranscript<Builder>;

using UltraStdlibTranscript = ::bb::UltraStdlibTranscript;
using MegaStdlibTranscript = ::bb::MegaStdlibTranscript;
} // namespace bb::stdlib
