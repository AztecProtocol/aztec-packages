use dep::types::{
    abis::{
        public_data_update_request::PublicDataUpdateRequest,
        public_data_write::OverridablePublicDataWrite,
    },
    data::OverridablePublicDataTreeLeaf,
    traits::Empty,
    utils::arrays::{array_length, find_index_hint},
};

pub struct LinkedIndexHint {
    is_first_write: bool,
    prev_index: u32,
}

impl Empty for LinkedIndexHint {
    fn empty() -> Self {
        LinkedIndexHint { is_first_write: false, prev_index: 0 }
    }
}

pub unconstrained fn generate_overridable_public_data_writes<let NUM_WRITES: u32, let NUM_LEAVES: u32>(
    public_data_writes: [PublicDataUpdateRequest; NUM_WRITES],
    public_data_leaves: [OverridablePublicDataTreeLeaf; NUM_LEAVES],
) -> ([OverridablePublicDataWrite; NUM_WRITES], [LinkedIndexHint; NUM_WRITES]) {
    let mut overridable_public_data_writes = [OverridablePublicDataWrite::empty(); NUM_WRITES];
    let mut hints = [LinkedIndexHint::empty(); NUM_WRITES];

    let writes_len = array_length(public_data_writes);
    for i in 0..writes_len {
        let write = public_data_writes[i];
        let mut override_counter = 0;
        let mut is_first_write = false;
        let mut prev_index = 0;
        let mut prev_counter = 0;

        for j in 0..writes_len {
            let other = public_data_writes[j];
            if (j != i) & (other.leaf_slot == write.leaf_slot) {
                if other.counter > write.counter {
                    if (override_counter == 0) | (other.counter < override_counter) {
                        override_counter = other.counter;
                    }
                } else if other.counter < write.counter {
                    if other.counter > prev_counter {
                        prev_counter = other.counter;
                        prev_index = j;
                    }
                }
            }
        }

        if prev_counter == 0 {
            is_first_write = true;
            prev_index = find_index_hint(
                public_data_leaves,
                |leaf: OverridablePublicDataTreeLeaf| leaf.leaf.slot == write.leaf_slot,
            );
        }

        overridable_public_data_writes[i] = OverridablePublicDataWrite { write, override_counter };
        hints[i] = LinkedIndexHint { is_first_write, prev_index };
    }

    (overridable_public_data_writes, hints)
}
