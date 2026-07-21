/// #[external("utility")] functions must be unconstrained.
use aztec::macros::aztec;

#[aztec]
contract UtilityNotUnconstrained {
    use aztec::macros::functions::external;

    #[external("utility")]
    fn constrained_utility_function() {}
}
