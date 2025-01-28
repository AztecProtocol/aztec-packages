mod append;
mod collapse;
mod subarray;
mod subbvec;

pub use append::append;
pub use collapse::collapse;
pub use subarray::subarray;
pub use subbvec::subbvec;

pub unconstrained fn for_each_in_bounded_vec<T, let MaxLen: u32, Env>(
    vec: BoundedVec<T, MaxLen>,
    f: fn[Env](T, u32) -> (),
) {
    for i in 0..vec.len() {
        f(vec.get_unchecked(i), i);
    }
}
