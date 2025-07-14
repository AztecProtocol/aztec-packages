// Noir version of `txe_constants.ts`. These values need to stay in sync with the values in `txe_constants.ts`.

// Having these hardcoded values below is not ideal as they are not hardcoded anywhere else in the codebase other than
// in TestConstants.sol (they are loaded from config set at runtime). But loading these from oracles at this point
// seems like an overkill.

// Put here Thu Jan 01 2026 00:00:00 GMT+0000. If this file survives until mainnet launch, we would want to use the
// actual genesis time here.
pub global GENESIS_TIMESTAMP: u64 = 1767225600;
