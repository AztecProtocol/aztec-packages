use crate::protocol::traits::{Deserialize, Serialize};

/// A tagging secret the app supplies explicitly to `get_pending_tagged_logs`.
///
/// These are app-supplied secrets PXE cannot enumerate on its own, e.g. handshake-derived ones.
#[derive(Serialize, Deserialize)]
pub(crate) struct ProvidedSecret {
    pub secret: Field,
}
