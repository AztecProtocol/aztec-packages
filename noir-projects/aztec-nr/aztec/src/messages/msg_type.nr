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
