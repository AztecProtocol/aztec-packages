/// The minimum message type ID that custom message handlers may use.
///
/// IDs below this value are reserved for current and future aztec.nr built-in message types (notes, partial notes,
/// events, etc). If a message is received with a type ID below this threshold that aztec.nr doesn't recognize as its
/// own, processing will fail with an error instructing the developer to use a higher ID.
pub global MIN_CUSTOM_MSG_TYPE_ID: u64 = 2.pow_32(16) as u64;

/// Creates a custom message type ID from a local index.
///
/// Custom message handlers must use message type IDs >= `MIN_CUSTOM_MSG_TYPE_ID`. This function offsets the provided
/// `local_id` by that minimum, making it clear at the call site that a custom (non-built-in) message type is being
/// defined.
///
/// ## Examples
///
/// ```noir
/// global MY_MSG_TYPE_ID: u64 = custom_msg_type_id(0);
/// global MY_OTHER_MSG_TYPE_ID: u64 = custom_msg_type_id(1);
/// ```
pub comptime fn custom_msg_type_id(local_id: u64) -> u64 {
    MIN_CUSTOM_MSG_TYPE_ID + local_id
}

/// A message containing the information about a private note, i.e. one that has been created fully privately with no
/// public fields.
///
/// This message contains all information necessary in order to prove existence of the note.
pub global PRIVATE_NOTE_MSG_TYPE_ID: u64 = 0;

/// A message containing the private information of a partial note, i.e. one that has both private and public fields.
///
/// This message contains all information necessary in order to find the public note information once it is created,
/// and then prove existence of the note.
pub global PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID: u64 = 1;

/// A message containing the information about a private event, i.e. one that has been emitted privately.
///
/// This message contains all information necessary in order to prove existence of the event.
pub global PRIVATE_EVENT_MSG_TYPE_ID: u64 = 2;
