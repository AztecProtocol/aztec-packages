// Domain separator values for Poseidon2 hashing.
// Ported from yarn-project/constants/src/constants.gen.ts (DomainSeparator enum).
//
// Each separator is a u32 that gets prepended to the Poseidon2 input to create
// domain separation between different hash uses (preventing cross-context collisions).

pub const NOTE_HASH: u32 = 116_501_019;
pub const SILOED_NOTE_HASH: u32 = 3_361_878_420;
pub const UNIQUE_NOTE_HASH: u32 = 226_850_429;
pub const NOTE_HASH_NONCE: u32 = 1_721_808_740;
pub const SINGLE_USE_CLAIM_NULLIFIER: u32 = 1_465_998_995;
pub const NOTE_NULLIFIER: u32 = 50_789_342;
pub const SILOED_NULLIFIER: u32 = 57_496_191;
pub const MESSAGE_NULLIFIER: u32 = 3_754_509_616;
pub const EVENT_LOG_TAG: u32 = 926_040_838;
pub const NOTE_COMPLETION_LOG_TAG: u32 = 3_372_669_888;
pub const UNCONSTRAINED_MSG_LOG_TAG: u32 = 1_485_357_192;
pub const PRIVATE_LOG_FIRST_FIELD: u32 = 2_769_976_252;
pub const PUBLIC_LEAF_SLOT: u32 = 1_247_650_290;
pub const PUBLIC_STORAGE_MAP_SLOT: u32 = 4_015_149_901;
pub const PRIVATE_FUNCTION_LEAF: u32 = 1_389_398_688;
pub const PUBLIC_BYTECODE: u32 = 260_313_585;
pub const CONTRACT_CLASS_ID: u32 = 3_923_495_515;
pub const INITIALIZER: u32 = 385_396_519;
pub const NHK_M: u32 = 242_137_788;
pub const IVSK_M: u32 = 2_747_825_907;
pub const OVSK_M: u32 = 4_272_201_051;
pub const TSK_M: u32 = 1_546_190_975;
pub const PUBLIC_KEYS_HASH: u32 = 777_457_226;
pub const PARTIAL_ADDRESS: u32 = 2_103_633_018;
pub const CONTRACT_ADDRESS_V1: u32 = 1_788_365_517;
pub const BLOCK_HEADER_HASH: u32 = 4_195_546_849;
pub const TX_REQUEST: u32 = 3_763_737_512;
pub const PUBLIC_TX_HASH: u32 = 1_630_108_851;
pub const PRIVATE_TX_HASH: u32 = 1_971_680_439;
pub const PUBLIC_CALLDATA: u32 = 2_760_353_947;
pub const FUNCTION_ARGS: u32 = 3_576_554_347;
pub const PROTOCOL_CONTRACTS: u32 = 3_904_434_327;
pub const EVENT_COMMITMENT: u32 = 2_517_418_573;
pub const AUTHWIT_INNER: u32 = 221_354_163;
pub const AUTHWIT_OUTER: u32 = 3_283_595_782;
pub const AUTHWIT_NULLIFIER: u32 = 1_239_150_694;
pub const APP_SILOED_ECDH_SHARED_SECRET: u32 = 1_707_851_664;
pub const ECDH_SUBKEY: u32 = 4_277_646_631;
pub const ECDH_FIELD_MASK: u32 = 190_532_684;
pub const PARTIAL_NOTE_VALIDITY_COMMITMENT: u32 = 623_934_423;
pub const INITIALIZATION_NULLIFIER: u32 = 1_653_084_894;
pub const PUBLIC_INITIALIZATION_NULLIFIER: u32 = 3_342_006_647;
pub const PRIVATE_INITIALIZATION_NULLIFIER: u32 = 3_990_889_078;
pub const SECRET_HASH: u32 = 4_199_652_938;
pub const TX_NULLIFIER: u32 = 1_025_801_951;
pub const SIGNATURE_PAYLOAD: u32 = 463_525_807;
