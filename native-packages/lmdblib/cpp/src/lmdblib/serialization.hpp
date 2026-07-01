#pragma once

// msgpack-c entrypoint for lmdblib. We use msgpack-c directly (no barretenberg
// serialization framework). The AztecProtocol msgpack-c fork expects the
// includer to provide THROW/RETHROW macros; define them to standard exception
// handling.
#ifndef THROW
#define THROW throw
#endif
#ifndef RETHROW
#define RETHROW throw
#endif

#include <msgpack.hpp>
