use crate::context::PrivateContext;

struct Map<V> {
    context: &mut PrivateContext,
    storage_slot: Field,
    state_var_constructor: fn (&mut PrivateContext, Field) -> V,
}

impl<V> Map<V> {
    fn new(context: &mut PrivateContext, storage_slot: Field, state_var_constructor: fn (&mut PrivateContext, Field) -> V) -> Map<V> {
        assert(storage_slot != 0); // Storage slot 0 not allowed. Storage slots must start from 1.
        Map { context, storage_slot, state_var_constructor }
    }

    fn at(self, key: Field) -> V {
        // TODO(#1204): use a generator index for the storage slot
        let derived_storage_slot = dep::std::hash::pedersen([
            self.storage_slot, 
            key,
        ])[0];

        let state_var_constructor = self.state_var_constructor; 
        state_var_constructor(self.context, derived_storage_slot)
    }
}
