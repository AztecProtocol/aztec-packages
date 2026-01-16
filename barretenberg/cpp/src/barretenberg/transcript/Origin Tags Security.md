# Origin Tags Security Mechanism
## ✅ CURRENT STATUS

**The Origin Tags security mechanism is FULLY ENABLED in debug builds.** The mechanism operates in debug builds only (disabled completely in release builds via `AZTEC_NO_ORIGIN_TAGS`). Within debug builds, ALL security checks are active:

1. **Different Transcript Checks**: ✅ **ACTIVE** - Values from different transcript instances cannot be mixed. Throws: "Tags from different transcripts were involved in the same computation"
2. **Free Witness Checks**: ✅ **ACTIVE** - Free witness elements cannot interact with transcript-originated values. Throws: "A free witness element should not interact with an element that has an origin"
3. **Child Tag Checks**: ✅ **ACTIVE** - Submitted values from different rounds cannot mix without challenges. Throws: "Submitted values from 2 different rounds are mixing without challenges"
4. **Poison Detection**: ✅ **ACTIVE** - Any arithmetic on poisoned values triggers abort. Throws: "Touched an element that should not have been touched"

All previously mentioned disable flags (`DISABLE_FREE_WITNESS_CHECK`, `DISABLE_CHILD_TAG_CHECKS`, `DISABLE_DIFFERENT_TRANSCRIPT_CHECKS`) have been removed. The OriginTag system now provides full security enforcement.



## Overview

The Origin Tag mechanism is a security feature designed to track the provenance and usage of cryptographic values within zero-knowledge proof circuits. It operates through a "tainting" system that adds metadata to track where values originate and how they interact, enabling detection of potentially dangerous behaviors in-circuit. It specifically targets common Fiat-Shamir vulnerabilities.

## Key Components

### OriginTag Structure

The `OriginTag` struct contains three main fields:

1. **transcript_index**: Identifies the transcript instance that generated the value
   - `CONSTANT` (-1): Value is a constant
   - `FREE_WITNESS` (-2): Value is a free witness (not constant, not from transcript)
   - Numeric index: Specific transcript instance

2. **round_provenance**: 256-bit field tracking which submitted values and challenges were used
   - Lower 128 bits: Submitted values from corresponding rounds (bit position = round number)
   - Upper 128 bits: Challenge values from corresponding rounds (bit position = round number + 128)

3. **instant_death**: Boolean flag for "poisoning" values that should never be used in arithmetic

### Security Checks

The mechanism enforces several security invariants (all active in debug builds):

1. **Transcript Isolation**: ✅ **ACTIVE** - Values from different transcript instances cannot interact. Throws exception on violation.
2. **Round Separation**: ✅ **ACTIVE** - Submitted values from different rounds cannot mix without challenges. Throws exception on violation.
3. **Free Witness Isolation**: ✅ **ACTIVE** - Free witness elements should not interact with transcript-originated values. Throws exception on violation.
4. **Poison Detection**: ✅ **ACTIVE** - Any arithmetic on "poisoned" values triggers an abort

### Integration with Transcript System

The origin tag mechanism is integrated into the transcript system at several key points:

#### In `send_to_verifier()` and `receive_from_prover()`:
- Values are automatically tagged with their transcript index and round
- The `is_submitted` flag distinguishes between prover submissions and verifier challenges
- Round tracking ensures proper sequencing of protocol phases

#### In `add_to_hash_buffer()`:
- Values added to the hash buffer receive appropriate origin tags
- Reception phase tracking ensures correct round indexing

#### Challenge Generation:
- Challenges derived from transcript data inherit appropriate provenance information
- The tagging system tracks which rounds contributed to challenge generation

## Debug vs Release Behavior

**Debug Builds (`#ifndef NDEBUG`)**:
- Full origin tag tracking and validation
- Runtime checks for security violations
- Detailed error messages for debugging

**Release Builds (`#else`)**:
- Origin tag operations become no-ops for performance
- Security checks are disabled
- Minimal memory footprint

## Security Benefits

1. **Prevents Cross-Transcript Contamination**: Ensures values from different proof instances don't mix
2. **Enforces Protocol Structure**: Validates that the Fiat-Shamir transform follows proper sequencing
3. **Detects Malicious Witness Construction**: Identifies attempts to use free witnesses inappropriately
4. **Debugging Aid**: Provides clear error messages when protocol violations occur

## Usage Patterns

### Standard Testing Tags
The codebase defines common tag patterns for testing:
- `submitted_value_origin_tag`: Values submitted in round 0
- `challenge_origin_tag`: Challenges derived in round 0
- `merged_tags`: Combinations of values from different sources
- `instant_death_tag`: Poisoned tag for testing error conditions

### Transcript Integration
Values automatically receive origin tags when:
- Sent by prover via `send_to_verifier()`
- Received by verifier via `receive_from_prover()`
- Added to hash buffer via `add_to_hash_buffer()`

## Implementation Notes

- The mechanism is only active in debug builds to avoid performance overhead in production
- Child tag checking can be enabled/disabled via `ENABLE_CHILD_TAG_CHECKS` preprocessor flag
- The system supports both individual values and iterable containers
- Origin tags are propagated through arithmetic operations on tagged values


## Status

All core OriginTag security checks are now fully enabled and active:

1. ✅ **Different Transcript Check** - COMPLETE and ACTIVE: Prevents cross-transcript contamination
2. ✅ **Free Witness Check** - COMPLETE and ACTIVE: Prevents free witness contamination
3. ✅ **Child Tag Check** - COMPLETE and ACTIVE: Prevents round-mixing without challenges
4. ✅ **Poison Detection** - COMPLETE and ACTIVE: Prevents use of poisoned values

## Future Enhancements

1. Add the mechanism for checking if a challenge and a submitted value from a following round meet (this can also create dangerous interactions)
2. Consider enabling OriginTag checks in release builds for critical production paths (currently only active in debug via `AZTEC_NO_ORIGIN_TAGS`)
3. Add more granular error messages to help developers identify the exact source of tag violations