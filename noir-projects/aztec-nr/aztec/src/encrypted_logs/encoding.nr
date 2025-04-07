// TODO(#12750): don't make these values assume we're using AES.
use crate::{encrypted_logs::log_encryption::PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS, utils::array};

global MAX_MESSAGE_LEN: u32 = PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS;

/// The expanded message metadata takes up a single field.
global MESSAGE_EXPANDED_METADATA_LEN: u32 = 1;

/// The maximum length of a message's content, i.e. not including the expanded message metadata.
pub global MAX_MESSAGE_CONTENT_LEN: u32 = MAX_MESSAGE_LEN - MESSAGE_EXPANDED_METADATA_LEN;

/// Decodes a message following aztec-nr's standard message encoding.
///
/// The standard message layout is composed of:
///  - an initial field called the 'expanded metadata'
///  - an arbitrary number of fields following that called the 'message content'
///
/// ```
/// message: [ msg_expanded_metadata, ...msg_content ]
/// ```
///
/// The expanded metadata itself is interpreted as a u128, of which:
///  - the upper 64 bits are the message type id
///  - the lower 64 bits are called the 'message metadata'
///
/// ```
/// msg_expanded_metadata: [  msg_type_id    |  msg_metadata  ]
///                        <---  64 bits --->|<--- 64 bits --->
/// ```
///
/// The meaning of the message metadata and message content depend on the value of the message type id. Note that there
/// is nothing special about the message metadata, it _can_ be considered part of the content. It just has a different
/// name to make it distinct from the message content given that it is not a full field.
pub unconstrained fn decode_message(
    message: BoundedVec<Field, MAX_MESSAGE_LEN>,
) -> (u64, u64, BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>) {
    assert(
        message.len() >= MESSAGE_EXPANDED_METADATA_LEN,
        f"Invalid message: it must have least {MESSAGE_EXPANDED_METADATA_LEN} fields",
    );

    // If MESSAGE_EXPANDED_METADATA_LEN is changed, causing the assertion below to fail, then the destructuring of
    // the message encoding below must be updated as well.
    std::static_assert(
        MESSAGE_EXPANDED_METADATA_LEN == 1,
        "unexpected value for MESSAGE_EXPANDED_METADATA_LEN",
    );

    let msg_expanded_metadata = message.get(0);
    let (msg_type_id, msg_metadata) = from_expanded_metadata(msg_expanded_metadata);
    let msg_content = array::subbvec(message, MESSAGE_EXPANDED_METADATA_LEN);

    (msg_type_id, msg_metadata, msg_content)
}

global U64_SHIFT_MULTIPLIER: Field = 2.pow_32(64);

pub fn to_expanded_metadata(msg_type: u64, msg_metadata: u64) -> Field {
    // We use multiplication instead of bit shifting operations to shift the type bits as bit shift operations are
    // expensive in circuits.
    let type_field: Field = (msg_type as Field) * U64_SHIFT_MULTIPLIER;
    let msg_metadata_field = msg_metadata as Field;

    type_field + msg_metadata_field
}

fn from_expanded_metadata(input: Field) -> (u64, u64) {
    input.assert_max_bit_size::<128>();
    let msg_metadata = (input as u64);
    let msg_type = ((input - (msg_metadata as Field)) / U64_SHIFT_MULTIPLIER) as u64;
    // Use division instead of bit shift since bit shifts are expensive in circuits
    (msg_type, msg_metadata)
}

mod tests {
    use super::{from_expanded_metadata, to_expanded_metadata};

    global U64_MAX: u64 = (2.pow_32(64) - 1) as u64;
    global U128_MAX: Field = (2.pow_32(128) - 1);

    #[test]
    fn packing_metadata() {
        // Test case 1: All bits set
        let packed = to_expanded_metadata(U64_MAX, U64_MAX);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 2: Only log type bits set
        let packed = to_expanded_metadata(U64_MAX, 0);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, 0);

        // Test case 3: Only msg_metadata bits set
        let packed = to_expanded_metadata(0, U64_MAX);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 4: No bits set
        let packed = to_expanded_metadata(0, 0);
        let (msg_type, msg_metadata) = from_expanded_metadata(packed);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, 0);
    }

    #[test]
    fn unpacking_metadata() {
        // Test case 1: All bits set
        let input = U128_MAX as Field;
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 2: Only log type bits set
        let input = (U128_MAX - U64_MAX as Field);
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, U64_MAX);
        assert_eq(msg_metadata, 0);

        // Test case 3: Only msg_metadata bits set
        let input = U64_MAX as Field;
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, U64_MAX);

        // Test case 4: No bits set
        let input = 0;
        let (msg_type, msg_metadata) = from_expanded_metadata(input);
        assert_eq(msg_type, 0);
        assert_eq(msg_metadata, 0);
    }

    #[test]
    fn roundtrip_metadata(original_msg_type: u64, original_msg_metadata: u64) {
        let packed = to_expanded_metadata(original_msg_type, original_msg_metadata);
        let (unpacked_msg_type, unpacked_msg_metadata) = from_expanded_metadata(packed);

        assert_eq(original_msg_type, unpacked_msg_type);
        assert_eq(original_msg_metadata, unpacked_msg_metadata);
    }
}
