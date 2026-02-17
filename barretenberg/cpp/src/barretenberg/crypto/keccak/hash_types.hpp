// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 5be53b6f75bac06d6d0132220044b28777021f0f }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

/* ethash: C/C++ implementation of Ethash, the Ethereum Proof of Work algorithm.
 * Copyright 2018-2019 Pawel Bylica.
 * Licensed under the Apache License, Version 2.0.
 */

#pragma once

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum {
    KECCAKF1600_LANES = 25,
    KECCAKF1600_ROUNDS = 24,
    KECCAK256_OUTPUT_BYTES = 32,
    KECCAK256_OUTPUT_WORDS = 4 // 4 * 64 = 256 bits
};
struct keccak256 {
    uint64_t word64s[KECCAK256_OUTPUT_WORDS];
};

#ifdef __cplusplus
}
#endif
