use crate::context::{Context};
use dep::protocol_types::traits::{Deserialize, Serialize};

trait Store<T> where T: Serialize<N> + Deserialize<N> {
    fn get_storage_slot(self) -> Field {
        self.storage_slot
    }
}
