use dep::protocol_types::{hash::pedersen_hash};

use crate::context::{PrivateContext, PublicContext, Context};
use crate::state_vars::storage::Storage;

use crate::history::public_value_inclusion::prove_public_value_inclusion;

struct SharedMutable<T, Delay> {
    context: Option<&mut PrivateContext>,
    storage_slot: Field
}

impl<T, Delay> Storage<T> for SharedMutable<T, Delay> {}

impl<T, Delay> SharedMutable<T, Delay> {
    fn get_current_value(historical_block_number: u32, block_of_change: u32) {}
}
