// Trait: is_empty
//
// The general is_empty trait checks if a data type is empty,
// and it defines empty for the basic data types as 0.
//
// If a Field is equal to zero, then it is regarded as zero.
// We will go with this definition for now, however it can be problematic
// if a value can actually be zero. In a future refactor, we can
// use the optional type for safety. Doing it now would lead to a worse devex
// and would make it harder to sync up with the cpp code.
// Preferred over Default trait to convey intent, as default doesn't necessarily mean empty.
pub trait Empty: Eq {
    fn empty() -> Self;

    fn is_empty(self) -> bool {
        self.eq(Self::empty())
    }

    // Requires this Noir fix: https://github.com/noir-lang/noir/issues/9002
    // fn assert_not_empty<let U: u32>(self, msg: str<U>) { // This msg version was failing with weird compiler errors.
    //     // We provide a default impl but it's likely inefficient.
    //     // The reason we include this function is because there's a lot of
    //     // opportunity for optimisation on a per-struct basis.
    //     // You only need to show one element is not empty to know that the whole thing
    //     // is not empty.
    //     // If you know an element of your struct which should always be nonempty,
    //     // you can write an impl that solely checks that that element is nonempty.
    //     assert(!self.is_empty(), msg);
    // }

    // This default impl is overwritten by types like arrays, because there's a much
    // more efficient approach.
    fn assert_empty<let S: u32>(self, msg: str<S>) {
        assert(self.is_empty(), msg);
    }
}

impl Empty for Field {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}

impl Empty for bool {
    #[inline_always]
    fn empty() -> Self {
        false
    }
}

impl Empty for u8 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}
impl Empty for u16 {
    fn empty() -> Self {
        0
    }
}
impl Empty for u32 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}
impl Empty for u64 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}
impl Empty for u128 {
    #[inline_always]
    fn empty() -> Self {
        0
    }
}

impl<T, let N: u32> Empty for [T; N]
where
    T: Empty,
{
    #[inline_always]
    fn empty() -> Self {
        [T::empty(); N]
    }

    fn is_empty(self) -> bool {
        self.all(|elem| elem.is_empty())
    }

    fn assert_empty<let S: u32>(self, msg: str<S>) -> () {
        self.for_each(|elem| elem.assert_empty(msg))
    }
}

impl<T> Empty for [T]
where
    T: Empty,
{
    #[inline_always]
    fn empty() -> Self {
        [T::empty()]
    }

    fn is_empty(self) -> bool {
        self.all(|elem| elem.is_empty())
    }

    fn assert_empty<let S: u32>(self, msg: str<S>) -> () {
        self.for_each(|elem| elem.assert_empty(msg))
    }
}
impl<A, B> Empty for (A, B)
where
    A: Empty,
    B: Empty,
{
    #[inline_always]
    fn empty() -> Self {
        (A::empty(), B::empty())
    }
}

impl<T> Empty for Option<T>
where
    T: Eq,
{
    #[inline_always]
    fn empty() -> Self {
        Option::none()
    }
}

// pub fn is_empty<T>(item: T) -> bool
// where
//     T: Empty,
// {
//     item.eq(T::empty())
// }

// pub fn is_empty_array<T, let N: u32>(array: [T; N]) -> bool
// where
//     T: Empty,
// {
//     array.all(|elem| is_empty(elem))
// }

// pub fn assert_empty<T>(item: T) -> ()
// where
//     T: Empty,
// {
//     assert(item.eq(T::empty()))
// }

// pub fn assert_empty_array<T, let N: u32>(array: [T; N]) -> ()
// where
//     T: Empty,
// {
//     // A cheaper option than `is_empty_array` for if you don't need to gracefully
//     // handle a bool result.
//     // Avoids the `&` operator of `is_empty_array`'s `.all()` call.
//     for i in 0..N {
//         assert(is_empty(array[i]));
//     }
// }
