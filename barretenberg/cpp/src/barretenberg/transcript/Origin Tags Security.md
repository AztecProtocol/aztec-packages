# Origin Tags Security Mechanism
## ⚠️ IMPORTANT DISCLAIMER

**The Origin Tags security mechanism is currently PARTIALLY DISABLED.** The mechanism operates in debug builds only (disabled completely in release builds via `AZTEC_NO_ORIGIN_TAGS`). Within debug builds, several critical security checks are currently disabled due to widespread violations of tag invariants throughout the codebase:

1. **Free Witness Checks** (`DISABLE_FREE_WITNESS_CHECK`): Disabled because free witness elements are incorrectly interacting with transcript-originated values throughout the system
2. **Different Transcript Checks** (`DISABLE_DIFFERENT_TRANSCRIPT_CHECKS`): Disabled because values from different transcript instances are mixing in computations
3. **Child Tag Checks** (`DISABLE_CHILD_TAG_CHECKS`): Disabled because submitted values from different rounds are mixing without proper challenge separation

These disables were implemented as a temporary measure to allow the codebase to function while the tag invariant violations are addressed. The basic origin tag tracking infrastructure remains active in debug builds, but the security enforcement is effectively neutered until these flags are removed and the underlying violations are fixed.



## Overview

The Origin Tag mechanism is a security feature designed to track the provenance and usage of cryptographic values within zero-knowledge proof circuits. It operates through a "tainting" system that adds metadata to track where values originate and how they interact, enabling detection of potentially dangerous behaviors in-circuit. It specifically targets common Fiat-Shamir vulnerabilities.

## Key Components

### OriginTag Structure

The `OriginTag` struct contains three main fields:

1. **parent_tag**: Identifies the transcript instance that generated the value
   - `CONSTANT` (-1): Value is a constant
   - `FREE_WITNESS` (-2): Value is a free witness (not constant, not from transcript)
   - Numeric index: Specific transcript instance

2. **child_tag**: 256-bit field tracking which submitted values and challenges were used
   - Lower 128 bits: Submitted values from corresponding rounds (bit position = round number)
   - Upper 128 bits: Challenge values from corresponding rounds (bit position = round number + 128)

3. **instant_death**: Boolean flag for "poisoning" values that should never be used in arithmetic

### Security Checks

The mechanism enforces several security invariants:

1. **Transcript Isolation**: Values from different transcript instances cannot interact
2. **Round Separation**: Submitted values from different rounds cannot mix without challenges (currently not enforced)
3. **Free Witness Isolation**: Free witness elements should not interact with transcript-originated values
4. **Poison Detection**: Any arithmetic on "poisoned" values triggers an abort

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


## TODOS
1. Ensure that all recursive verifiers pass the basic free witness check
2. Ensure that all recursive verifiers pass the basic different transcript check
3. Ensure that all recursive verifiers pass the basic child tag check
4. Add the mechanism for checking if a challenge and a submitted value from a following round meet (this can also create dangerous interactions)