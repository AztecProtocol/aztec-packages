use crate::{
    delayed_public_mutable::{
        scheduled_delay_change::ScheduledDelayChange, scheduled_value_change::ScheduledValueChange,
    },
    hash::poseidon2_hash,
    traits::{Hash, Packable},
    utils::arrays,
};
use std::meta::derive;

mod test;

/// DelayedPublicMutableValues is just a wrapper around ScheduledValueChange and ScheduledDelayChange that then allows us
/// to wrap both of these values in WithHash. WithHash allows for efficient read of values in private.
///
/// Note that the WithHash optimization does not work in public (due to there being no unconstrained). But we also want
/// to be able to read the values efficiently in public and we want to be able to read each value separately. Reading
/// the values separately is tricky because ScheduledValueChange and ScheduledDelayChange are packed together (sdc and
/// svc.timestamp_of_change are stored in the same slot). For that reason we expose `unpack_value_change` and
/// `unpack_delay_change` functions that can be used to extract the values from the packed representation. This
/// is "hacky" but there is no way around it.
#[derive(Eq)]
pub struct DelayedPublicMutableValues<T, let INITIAL_DELAY: u64> {
    pub svc: ScheduledValueChange<T>,
    pub sdc: ScheduledDelayChange<INITIAL_DELAY>,
}

impl<T, let INITIAL_DELAY: u64> DelayedPublicMutableValues<T, INITIAL_DELAY> {
    pub fn new(svc: ScheduledValueChange<T>, sdc: ScheduledDelayChange<INITIAL_DELAY>) -> Self {
        DelayedPublicMutableValues { svc, sdc }
    }
}

/// Extracts a ScheduledValueChange struct from the packed representation of the full DelayedPublicMutable.
/// TODO: impl the packable trait for ScheduledValueChange
pub fn unpack_value_change<T, let M: u32>(packed: [Field; 2 * M + 1]) -> ScheduledValueChange<T>
where
    T: Packable<N = M>,
{
    let svc_pre_packed = arrays::subarray(packed, 1);
    let svc_post_packed = arrays::subarray(packed, M + 1);

    // We first cast to u32 as the timestamp_of_change is packed into the same field as the delay change and it
    // occupies the first 32 bits of the field.
    let timestamp_of_change = (packed[0] as u32) as u64;
    ScheduledValueChange::new(
        T::unpack(svc_pre_packed),
        T::unpack(svc_post_packed),
        timestamp_of_change,
    )
}

/// Extracts a ScheduledDelayChange struct from 0th field of the packed representation of the full DelayedPublicMutable.
/// This function expects to be called with just the first field of the packed representation, which contains sdc
/// and svc timestamp_of_change. We'll discard the svc component.
pub fn unpack_delay_change<let INITIAL_DELAY: u64>(
    packed: Field,
) -> ScheduledDelayChange<INITIAL_DELAY> {
    ScheduledDelayChange::unpack([packed])
}

// TODO: check whether this evaluates at comptime or runtime.
// global TWO_POW_32: Field = 2.pow_32(32);
// global TWO_POW_8: Field = 2.pow_32(8);

// We pack to `2 * N + 1` fields because ScheduledValueChange contains T twice (hence `2 * N`) and we need one extra
// field to store ScheduledDelayChange and the timestamp_of_change of ScheduledValueChange.
impl<T, let INITIAL_DELAY: u64> Packable for DelayedPublicMutableValues<T, INITIAL_DELAY>
where
    T: Packable,
{
    let N: u32 = 2 * <T as Packable>::N + 1;

    fn pack(self) -> [Field; Self::N] {
        let mut result = [0; Self::N];

        // We pack sdc.pre, sdc.post, sdc.timestamp_of_change and svc.timestamp_of_change into a single field as follows:
        // [ sdc.pre_inner: u32 | sdc.pre_is_some: u8 | sdc.post_inner: u32 | sdc.post_is_some: u8 | sdc.timestamp_of_change: u32 | svc.timestamp_of_change: u32 ]
        // Note that the code below no longer works after 2106 as by that time the timestamp will overflow u32. This is a tech debt that is not worth tackling.
        result[0] = self.svc.timestamp_of_change as Field
            + ((self.sdc.timestamp_of_change as Field) * 2.pow_32(32))
            + ((self.sdc.post.is_some() as Field) * 2.pow_32(64))
            + ((self.sdc.post.unwrap_unchecked() as Field) * 2.pow_32(72))
            + ((self.sdc.pre.is_some() as Field) * 2.pow_32(104))
            + ((self.sdc.pre.unwrap_unchecked() as Field) * 2.pow_32(112));

        // Pack the pre and post values from ScheduledValueChange
        let svc_pre_packed = self.svc.pre.pack();
        let svc_post_packed = self.svc.post.pack();
        for i in 0..<T as Packable>::N {
            result[i + 1] = svc_pre_packed[i];
            result[i + 1 + <T as Packable>::N] = svc_post_packed[i];
        }
        result
    }

    fn unpack(fields: [Field; Self::N]) -> Self {
        let svc = unpack_value_change::<T, _>(fields);
        let sdc = unpack_delay_change::<INITIAL_DELAY>(fields[0]);
        Self::new(svc, sdc)
    }
}

impl<T, let INITIAL_DELAY: u64> Hash for DelayedPublicMutableValues<T, INITIAL_DELAY>
where
    T: Packable,
{
    fn hash(self) -> Field {
        poseidon2_hash(self.pack())
    }
}
