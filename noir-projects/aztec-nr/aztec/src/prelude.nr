use dep::protocol_types::{
    address::{
        AztecAddress, 
        EthAddress,
    },
};
use crate::{
    state_vars::{
        map::Map, 
        public_state::PublicState, 
        singleton::Singleton,
        immutable_singleton::ImmutableSingleton,
        set::Set,
        stable_public_state::StablePublicState,
    },
    log::{
        emit_unencrypted_log,
        emit_encrypted_log,
    },
    context::PrivateContext,
    note::{
        note_header::NoteHeader,
        note_interface::NoteInterface,
        note_getter_options::NoteGetterOptions, 
        note_viewer_options::NoteViewerOptions,
        utils::compute_note_hash_and_nullifier as utils_compute_note_hash_and_nullifier,
    }
};