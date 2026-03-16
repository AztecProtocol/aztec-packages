/// A type representing either success (`Ok`) or failure (`Err`), modeled after Rust's `std::result::Result`.
///
/// ## Examples
///
/// ```noir
/// let ok: Result<u32, Field> = Result::Ok(42);
/// assert(ok.is_ok());
/// assert_eq(ok.unwrap(), 42);
///
/// let err: Result<u32, Field> = Result::Err(1);
/// assert(err.is_err());
/// assert_eq(err.unwrap_err(), 1);
/// ```
pub struct Result<T, E> {
    _is_ok: bool,
    _value: T,
    _error: E,
}

impl<T, E> Result<T, E> {
    /// Constructs an Ok value.
    pub fn Ok(value: T) -> Self {
        Self { _is_ok: true, _value: value, _error: std::mem::zeroed() }
    }

    /// Constructs an Err value.
    pub fn Err(error: E) -> Self {
        Self { _is_ok: false, _value: std::mem::zeroed(), _error: error }
    }

    /// True if this Result is Ok.
    pub fn is_ok(self) -> bool {
        self._is_ok
    }

    /// True if this Result is Err.
    pub fn is_err(self) -> bool {
        !self._is_ok
    }

    /// Returns `true` if the result is Ok and the value matches the predicate.
    pub fn is_ok_and<Env>(self, f: fn[Env](T) -> bool) -> bool {
        if self._is_ok {
            f(self._value)
        } else {
            false
        }
    }

    /// Returns `true` if the result is Err and the error matches the predicate.
    pub fn is_err_and<Env>(self, f: fn[Env](E) -> bool) -> bool {
        if self._is_ok {
            false
        } else {
            f(self._error)
        }
    }

    /// Converts to `Option<T>`, discarding any error.
    pub fn ok(self) -> Option<T> {
        if self._is_ok {
            Option::some(self._value)
        } else {
            Option::none()
        }
    }

    /// Converts to `Option<E>`, discarding any ok value.
    pub fn err(self) -> Option<E> {
        if self._is_ok {
            Option::none()
        } else {
            Option::some(self._error)
        }
    }

    /// Asserts `self.is_ok()` and returns the wrapped value.
    pub fn unwrap(self) -> T {
        assert(self._is_ok);
        self._value
    }

    /// Asserts `self.is_err()` and returns the wrapped error.
    pub fn unwrap_err(self) -> E {
        assert(!self._is_ok);
        self._error
    }

    /// Returns the inner value without asserting `self.is_ok()`. If `self` is `Err`, there is no guarantee what
    /// value will be returned, only that it will be of type `T`.
    pub fn unwrap_unchecked(self) -> T {
        self._value
    }

    /// Returns the wrapped value if `self.is_ok()`. Otherwise, returns the given default value.
    pub fn unwrap_or(self, default: T) -> T {
        if self._is_ok {
            self._value
        } else {
            default
        }
    }

    /// Returns the wrapped value if `self.is_ok()`. Otherwise, calls the given function with the error to
    /// produce a default value.
    pub fn unwrap_or_else<Env>(self, default: fn[Env](E) -> T) -> T {
        if self._is_ok {
            self._value
        } else {
            default(self._error)
        }
    }

    /// Asserts `self.is_ok()` with a provided custom message and returns the contained Ok value.
    pub fn expect<let N: u32, MessageTypes>(self, message: fmtstr<N, MessageTypes>) -> T {
        assert(self.is_ok(), message);
        self._value
    }

    /// Asserts `self.is_err()` with a provided custom message and returns the contained Err value.
    pub fn expect_err<let N: u32, MessageTypes>(self, message: fmtstr<N, MessageTypes>) -> E {
        assert(self.is_err(), message);
        self._error
    }

    /// If self is `Ok(x)`, this returns `Ok(f(x))`. Otherwise, this returns the `Err` value unchanged.
    pub fn map<U, Env>(self, f: fn[Env](T) -> U) -> Result<U, E> {
        if self._is_ok {
            Result::Ok(f(self._value))
        } else {
            Result::Err(self._error)
        }
    }

    /// Applies a function to the Ok value or returns a default.
    pub fn map_or<U, Env>(self, default: U, f: fn[Env](T) -> U) -> U {
        if self._is_ok {
            f(self._value)
        } else {
            default
        }
    }

    /// Applies a function to the Ok value, or computes a default from the Err value.
    pub fn map_or_else<U, Env1, Env2>(self, default: fn[Env1](E) -> U, f: fn[Env2](T) -> U) -> U {
        if self._is_ok {
            f(self._value)
        } else {
            default(self._error)
        }
    }

    /// If self is `Err(e)`, this returns `Err(f(e))`. Otherwise, this returns the `Ok` value unchanged.
    pub fn map_err<F, Env>(self, f: fn[Env](E) -> F) -> Result<T, F> {
        if self._is_ok {
            Result::Ok(self._value)
        } else {
            Result::Err(f(self._error))
        }
    }

    /// Calls `f` on the contained Ok value (if any), returning self unchanged.
    pub fn inspect<Env>(self, f: fn[Env](T) -> ()) -> Self {
        if self._is_ok {
            f(self._value);
        }
        self
    }

    /// Calls `f` on the contained Err value (if any), returning self unchanged.
    pub fn inspect_err<Env>(self, f: fn[Env](E) -> ()) -> Self {
        if !self._is_ok {
            f(self._error);
        }
        self
    }

    /// If self is `Ok(x)`, this returns `f(x)`. Otherwise, this returns the `Err` value unchanged.
    ///
    /// In some languages this function is called `flat_map` or `bind`.
    pub fn and_then<U, Env>(self, f: fn[Env](T) -> Result<U, E>) -> Result<U, E> {
        if self._is_ok {
            f(self._value)
        } else {
            Result::Err(self._error)
        }
    }

    /// Returns `other` if self is `Ok`, otherwise returns the `Err` value of self.
    pub fn and<U>(self, other: Result<U, E>) -> Result<U, E> {
        if self._is_ok {
            other
        } else {
            Result::Err(self._error)
        }
    }

    /// If self is `Err(e)`, this returns `f(e)`. Otherwise, this returns the `Ok` value unchanged.
    pub fn or_else<F, Env>(self, f: fn[Env](E) -> Result<T, F>) -> Result<T, F> {
        if self._is_ok {
            Result::Ok(self._value)
        } else {
            f(self._error)
        }
    }

    /// Returns self if it is `Ok`, otherwise returns `other`.
    pub fn or<F>(self, other: Result<T, F>) -> Result<T, F> {
        if self._is_ok {
            Result::Ok(self._value)
        } else {
            other
        }
    }

    /// Creates a `Result` from an `Option`, using the provided error if `None`.
    pub fn from_option(option: Option<T>, error: E) -> Self {
        if option.is_some() {
            Result::Ok(option.unwrap_unchecked())
        } else {
            Result::Err(error)
        }
    }

    /// Creates a `Result` from an `Option`, using a lazily-evaluated error if `None`.
    pub fn from_option_or_else<Env>(option: Option<T>, error: fn[Env]() -> E) -> Self {
        if option.is_some() {
            Result::Ok(option.unwrap_unchecked())
        } else {
            Result::Err(error())
        }
    }
}

impl<T, E> Result<Result<T, E>, E> {
    /// Converts `Result<Result<T, E>, E>` to `Result<T, E>`.
    pub fn flatten(self) -> Result<T, E> {
        if self._is_ok {
            self._value
        } else {
            Result::Err(self._error)
        }
    }
}

impl<T, E> Result<Option<T>, E> {
    /// Transposes a `Result<Option<T>, E>` into an `Option<Result<T, E>>`.
    pub fn transpose(self) -> Option<Result<T, E>> {
        if self._is_ok {
            if self._value.is_some() {
                Option::some(Result::Ok(self._value.unwrap_unchecked()))
            } else {
                Option::none()
            }
        } else {
            Option::some(Result::Err(self._error))
        }
    }
}

impl<T, E> Eq for Result<T, E>
where
    T: Eq,
    E: Eq,
{
    fn eq(self, other: Self) -> bool {
        if self._is_ok == other._is_ok {
            if self._is_ok {
                self._value == other._value
            } else {
                self._error == other._error
            }
        } else {
            false
        }
    }
}

mod tests {
    use super::Result;

    #[test]
    fn ok_is_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert(r.is_ok());
        assert(!r.is_err());
        assert_eq(r.unwrap(), 42);
    }

    #[test]
    fn err_is_err() {
        let r: Result<u32, u8> = Result::Err(1);
        assert(r.is_err());
        assert(!r.is_ok());
        assert_eq(r.unwrap_err(), 1);
    }

    #[test(should_fail)]
    fn unwrap_on_err_panics() {
        let r: Result<u32, u8> = Result::Err(1);
        let _ = r.unwrap();
    }

    #[test(should_fail)]
    fn unwrap_err_on_ok_panics() {
        let r: Result<u32, u8> = Result::Ok(42);
        let _ = r.unwrap_err();
    }

    #[test]
    fn unwrap_or_returns_default_on_err() {
        let r: Result<u32, u8> = Result::Err(1);
        assert_eq(r.unwrap_or(99), 99);
    }

    #[test]
    fn unwrap_or_returns_value_on_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert_eq(r.unwrap_or(99), 42);
    }

    #[test]
    fn map_transforms_ok() {
        let r: Result<u32, u8> = Result::Ok(2);
        let mapped = r.map(|x| x * 3);
        assert_eq(mapped.unwrap(), 6);
    }

    #[test]
    fn map_preserves_err() {
        let r: Result<u32, u8> = Result::Err(1);
        let mapped = r.map(|x| x * 3);
        assert(mapped.is_err());
        assert_eq(mapped.unwrap_err(), 1);
    }

    #[test]
    fn map_err_transforms_err() {
        let r: Result<u32, u8> = Result::Err(1);
        let mapped = r.map_err(|e| e + 10);
        assert_eq(mapped.unwrap_err(), 11);
    }

    #[test]
    fn map_err_preserves_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        let mapped = r.map_err(|e| e + 10);
        assert_eq(mapped.unwrap(), 42);
    }

    #[test]
    fn and_then_chains_ok() {
        let r: Result<u32, u8> = Result::Ok(2);
        let chained = r.and_then(|x| Result::Ok(x * 3));
        assert_eq(chained.unwrap(), 6);
    }

    #[test]
    fn and_then_short_circuits_on_err() {
        let r: Result<u32, u8> = Result::Err(1);
        let chained = r.and_then(|x| Result::Ok(x * 3));
        assert(chained.is_err());
        assert_eq(chained.unwrap_err(), 1);
    }

    #[test]
    fn or_else_chains_err() {
        let r: Result<u32, u8> = Result::Err(1);
        let chained: Result<u32, u8> = r.or_else(|_e| Result::Ok(99));
        assert_eq(chained.unwrap(), 99);
    }

    #[test]
    fn or_else_preserves_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        let chained: Result<u32, u8> = r.or_else(|_e| Result::Ok(99));
        assert_eq(chained.unwrap(), 42);
    }

    #[test]
    fn ok_converts_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert_eq(r.ok().unwrap(), 42);
    }

    #[test]
    fn ok_converts_err() {
        let r: Result<u32, u8> = Result::Err(1);
        assert(r.ok().is_none());
    }

    #[test]
    fn err_converts_err() {
        let r: Result<u32, u8> = Result::Err(7);
        assert_eq(r.err().unwrap(), 7);
    }

    #[test]
    fn err_converts_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert(r.err().is_none());
    }

    #[test]
    fn from_option_some() {
        let o: Option<u32> = Option::some(42);
        let r: Result<u32, u8> = Result::from_option(o, 1);
        assert_eq(r.unwrap(), 42);
    }

    #[test]
    fn from_option_none() {
        let o: Option<u32> = Option::none();
        let r: Result<u32, u8> = Result::from_option(o, 1);
        assert_eq(r.unwrap_err(), 1);
    }

    #[test]
    fn eq_ok_values() {
        let a: Result<u32, u8> = Result::Ok(42);
        let b: Result<u32, u8> = Result::Ok(42);
        assert_eq(a, b);
    }

    #[test]
    fn eq_err_values() {
        let a: Result<u32, u8> = Result::Err(1);
        let b: Result<u32, u8> = Result::Err(1);
        assert_eq(a, b);
    }

    #[test]
    fn neq_ok_vs_err() {
        let a: Result<u32, u8> = Result::Ok(42);
        let b: Result<u32, u8> = Result::Err(1);
        assert(a != b);
    }

    #[test]
    fn is_ok_and_true() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert(r.is_ok_and(|v| v == 42));
    }

    #[test]
    fn is_ok_and_false_on_predicate() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert(!r.is_ok_and(|v| v == 0));
    }

    #[test]
    fn is_ok_and_false_on_err() {
        let r: Result<u32, u8> = Result::Err(1);
        assert(!r.is_ok_and(|_v| true));
    }

    #[test]
    fn is_err_and_true() {
        let r: Result<u32, u8> = Result::Err(1);
        assert(r.is_err_and(|e| e == 1));
    }

    #[test]
    fn is_err_and_false_on_predicate() {
        let r: Result<u32, u8> = Result::Err(1);
        assert(!r.is_err_and(|e| e == 0));
    }

    #[test]
    fn is_err_and_false_on_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert(!r.is_err_and(|_e| true));
    }

    #[test]
    fn expect_err_returns_error() {
        let r: Result<u32, u8> = Result::Err(5);
        assert_eq(r.expect_err(f"should be err"), 5);
    }

    #[test(should_fail)]
    fn expect_err_panics_on_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        let _ = r.expect_err(f"was ok");
    }

    #[test]
    fn map_or_returns_mapped_on_ok() {
        let r: Result<u32, u8> = Result::Ok(2);
        assert_eq(r.map_or(0, |x| x * 3), 6);
    }

    #[test]
    fn map_or_returns_default_on_err() {
        let r: Result<u32, u8> = Result::Err(1);
        assert_eq(r.map_or(99, |x| x * 3), 99);
    }

    #[test]
    fn map_or_else_returns_mapped_on_ok() {
        let r: Result<u32, u8> = Result::Ok(2);
        assert_eq(r.map_or_else(|_e| 0, |x| x * 3), 6);
    }

    #[test]
    fn map_or_else_returns_default_on_err() {
        let r: Result<u32, u8> = Result::Err(1);
        assert_eq(r.map_or_else(|e| e as u32 + 10, |x| x * 3), 11);
    }

    #[test]
    fn and_returns_other_on_ok() {
        let a: Result<u32, u8> = Result::Ok(2);
        let b: Result<u64, u8> = Result::Ok(100);
        assert_eq(a.and(b).unwrap(), 100);
    }

    #[test]
    fn and_returns_err_on_err() {
        let a: Result<u32, u8> = Result::Err(1);
        let b: Result<u64, u8> = Result::Ok(100);
        assert_eq(a.and(b).unwrap_err(), 1);
    }

    #[test]
    fn or_returns_self_on_ok() {
        let a: Result<u32, u8> = Result::Ok(42);
        let b: Result<u32, u16> = Result::Err(999);
        assert_eq(a.or(b).unwrap(), 42);
    }

    #[test]
    fn or_returns_other_on_err() {
        let a: Result<u32, u8> = Result::Err(1);
        let b: Result<u32, u16> = Result::Ok(99);
        assert_eq(a.or(b).unwrap(), 99);
    }

    #[test]
    fn inspect_calls_fn_on_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert_eq(r.inspect(|v| { assert_eq(v, 42); }).unwrap(), 42);
    }

    #[test]
    fn inspect_preserves_err() {
        let r: Result<u32, u8> = Result::Err(1);
        assert_eq(r.inspect(|_v| panic(f"should not be called")).unwrap_err(), 1);
    }

    #[test]
    fn inspect_err_calls_fn_on_err() {
        let r: Result<u32, u8> = Result::Err(5);
        assert_eq(r.inspect_err(|e| { assert_eq(e, 5); }).unwrap_err(), 5);
    }

    #[test]
    fn inspect_err_preserves_ok() {
        let r: Result<u32, u8> = Result::Ok(42);
        assert_eq(r.inspect_err(|_e| panic(f"should not be called")).unwrap(), 42);
    }

    #[test]
    fn flatten_ok_ok() {
        let r: Result<Result<u32, u8>, u8> = Result::Ok(Result::Ok(42));
        assert_eq(r.flatten().unwrap(), 42);
    }

    #[test]
    fn flatten_ok_err() {
        let r: Result<Result<u32, u8>, u8> = Result::Ok(Result::Err(1));
        assert_eq(r.flatten().unwrap_err(), 1);
    }

    #[test]
    fn flatten_err() {
        let r: Result<Result<u32, u8>, u8> = Result::Err(2);
        assert_eq(r.flatten().unwrap_err(), 2);
    }

    #[test]
    fn transpose_ok_some() {
        let r: Result<Option<u32>, u8> = Result::Ok(Option::some(42));
        let t = r.transpose();
        assert(t.is_some());
        assert_eq(t.unwrap().unwrap(), 42);
    }

    #[test]
    fn transpose_ok_none() {
        let r: Result<Option<u32>, u8> = Result::Ok(Option::none());
        assert(r.transpose().is_none());
    }

    #[test]
    fn transpose_err() {
        let r: Result<Option<u32>, u8> = Result::Err(1);
        let t = r.transpose();
        assert(t.is_some());
        assert_eq(t.unwrap().unwrap_err(), 1);
    }
}
