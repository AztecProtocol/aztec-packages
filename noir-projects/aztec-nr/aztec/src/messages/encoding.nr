// TODO(#12750): don't make these values assume we're using AES.
use crate::{
    messages::encryption::log_encryption::PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS, utils::array,
};

pub global MAX_MESSAGE_LEN: u32 = PRIVATE_LOG_PLAINTEXT_SIZE_IN_FIELDS;

global MESSAGE_EXPANDED_METADATA_LEN: u32 = 1;

// The standard message layout is composed of:
//  - an initial field called the 'expanded metadata'
//  - an arbitrary number of fields following that called the 'message content'
//
// ```
// message: [ msg_expanded_metadata, ...msg_content ]
// ```
//
// The expanded metadata itself is interpreted as a u128, of which:
//  - the upper 64 bits are the message type id
//  - the lower 64 bits are called the 'message metadata'
//
// ```
// msg_expanded_metadata: [  msg_type_id    |  msg_metadata  ]
//                        <---  64 bits --->|<--- 64 bits --->
// ```
//
// The meaning of the message metadata and message content depend on the value of the message type id. Note that there
// is nothing special about the message metadata, it _can_ be considered part of the content. It just has a different
// name to make it distinct from the message content given that it is not a full field.

/// The maximum length of a message's content, i.e. not including the expanded message metadata.
pub global MAX_MESSAGE_CONTENT_LEN: u32 = MAX_MESSAGE_LEN - MESSAGE_EXPANDED_METADATA_LEN;

/// Encodes a message following aztec-nr's standard message encoding. This message can later be decoded with
/// `decode_message` to retrieve the original values.
///
/// - The `msg_type` is an identifier that groups types of messages that are all processed the same way, e.g. private
/// notes or events. Possible values are defined in `aztec::messages::msg_type`.
/// - The `msg_metadata` and `msg_content` are the values stored in the message, whose meaning depends on the
///  `msg_type`. The only special thing about `msg_metadata` that separates it from `msg_content` is that it is a u64
/// instead of a full Field (due to details of how messages are encoded), allowing applications that can fit values into
/// this smaller variable to achieve higher data efficiency.
pub fn encode_message<let N: u32>(
    msg_type: u64,
    msg_metadata: u64,
    msg_content: [Field; N],
) -> [Field; (N + MESSAGE_EXPANDED_METADATA_LEN)] {
    std::static_assert(
        msg_content.len() <= MAX_MESSAGE_CONTENT_LEN,
        "Invalid message content: it must have a length of at most MAX_MESSAGE_CONTENT_LEN",
    );

    // If MESSAGE_EXPANDED_METADATA_LEN is changed, causing the assertion below to fail, then the destructuring of
    // the message encoding below must be updated as well.
    std::static_assert(
        MESSAGE_EXPANDED_METADATA_LEN == 1,
        "unexpected value for MESSAGE_EXPANDED_METADATA_LEN",
    );
    let mut message: [Field; (N + MESSAGE_EXPANDED_METADATA_LEN)] = std::mem::zeroed();

    message[0] = to_expanded_metadata(msg_type, msg_metadata);
    for i in 0..msg_content.len() {
        message[MESSAGE_EXPANDED_METADATA_LEN + i] = msg_content[i];
    }

    message
}

/// Decodes a standard aztec-nr message, i.e. one created via `encode_message`, returning the original encoded values.
///
/// Note that `encode_message` returns a fixed size array while this function takes a `BoundedVec`: this is because
/// prior to decoding the message type is unknown, and consequentially not known at compile time. If working with
/// fixed-size messages, consider using `BoundedVec::from_array` to convert them.
pub unconstrained fn decode_message(
    message: BoundedVec<Field, MAX_MESSAGE_LEN>,
) -> (u64, u64, BoundedVec<Field, MAX_MESSAGE_CONTENT_LEN>) {
    assert(
        message.len() >= MESSAGE_EXPANDED_METADATA_LEN,
        f"Invalid message: it must have at least {MESSAGE_EXPANDED_METADATA_LEN} fields",
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

fn to_expanded_metadata(msg_type: u64, msg_metadata: u64) -> Field {
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
    use crate::utils::array::subarray::subarray;
    use super::{
        decode_message, encode_message, from_expanded_metadata, MAX_MESSAGE_CONTENT_LEN,
        to_expanded_metadata,
    };

    global U64_MAX: u64 = (2.pow_32(64) - 1) as u64;
    global U128_MAX: Field = (2.pow_32(128) - 1);

    #[test]
    unconstrained fn encode_decode_empty_message(msg_type: u64, msg_metadata: u64) {
        let encoded = encode_message(msg_type, msg_metadata, []);
        let (decoded_msg_type, decoded_msg_metadata, decoded_msg_content) =
            decode_message(BoundedVec::from_array(encoded));

        assert_eq(decoded_msg_type, msg_type);
        assert_eq(decoded_msg_metadata, msg_metadata);
        assert_eq(decoded_msg_content.len(), 0);
    }

    #[test]
    unconstrained fn encode_decode_short_message(
        msg_type: u64,
        msg_metadata: u64,
        msg_content: [Field; MAX_MESSAGE_CONTENT_LEN / 2],
    ) {
        let encoded = encode_message(msg_type, msg_metadata, msg_content);
        let (decoded_msg_type, decoded_msg_metadata, decoded_msg_content) =
            decode_message(BoundedVec::from_array(encoded));

        assert_eq(decoded_msg_type, msg_type);
        assert_eq(decoded_msg_metadata, msg_metadata);
        assert_eq(decoded_msg_content.len(), msg_content.len());
        assert_eq(subarray(decoded_msg_content.storage(), 0), msg_content);
    }

    #[test]
    unconstrained fn encode_decode_full_message(
        msg_type: u64,
        msg_metadata: u64,
        msg_content: [Field; MAX_MESSAGE_CONTENT_LEN],
    ) {
        let encoded = encode_message(msg_type, msg_metadata, msg_content);
        let (decoded_msg_type, decoded_msg_metadata, decoded_msg_content) =
            decode_message(BoundedVec::from_array(encoded));

        assert_eq(decoded_msg_type, msg_type);
        assert_eq(decoded_msg_metadata, msg_metadata);
        assert_eq(decoded_msg_content.len(), msg_content.len());
        assert_eq(subarray(decoded_msg_content.storage(), 0), msg_content);
    }

    #[test]
    unconstrained fn to_expanded_metadata_packing() {
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
    unconstrained fn from_expanded_metadata_packing() {
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
    unconstrained fn to_from_expanded_metadata(original_msg_type: u64, original_msg_metadata: u64) {
        let packed = to_expanded_metadata(original_msg_type, original_msg_metadata);
        let (unpacked_msg_type, unpacked_msg_metadata) = from_expanded_metadata(packed);

        assert_eq(original_msg_type, unpacked_msg_type);
        assert_eq(original_msg_metadata, unpacked_msg_metadata);
    }
}
