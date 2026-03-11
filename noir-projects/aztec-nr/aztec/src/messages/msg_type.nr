/// A message containing the information about a private note, i.e. one that has been created fully privately with no
/// public fields.
///
/// This message contains all information necessary in order to prove existence of the note.
pub global PRIVATE_NOTE_MSG_TYPE_ID: u64 = 0;

/// A message containing the private informatio of a partial note, i.e. one that has both private and public fields.
///
/// This message contains all information necessary in order to find the public note information once it is created,
/// and then prove existence of the note.
pub global PARTIAL_NOTE_PRIVATE_MSG_TYPE_ID: u64 = 1;

/// A message containing the information about a private event, i.e. one that has been emitted privately.
///
/// This message contains all information necessary in order to prove existence of the event.
pub global PRIVATE_EVENT_MSG_TYPE_ID: u64 = 2;

pub global MIN_CUSTOM_MSG_TYPE_ID: u64 = 2.pow_32(16) as u64;

/// Custom message handlers must use message type IDs >= `MIN_CUSTOM_MSG_TYPE_ID`. This function offsets the provided
/// local ID by `MIN_CUSTOM_MSG_TYPE_ID` so that users can define simple sequential IDs starting from 0 without
/// worrying about collisions with the built-in IDs.
///
/// ## Example
///
/// ```noir
/// global MY_MSG_TYPE: u64 = custom_msg_type_id(0);
/// global ANOTHER_MSG_TYPE: u64 = custom_msg_type_id(1);
/// ```
pub fn custom_msg_type_id(local_id: u64) -> u64 {
    MIN_CUSTOM_MSG_TYPE_ID + local_id
}
