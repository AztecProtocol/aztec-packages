/// Public functions that are also marked as unconstrained are not allowed.
///
use aztec::macros::aztec;


#[aztec]
contract MarkedPublicUnconstrained {
    use aztec::macros::functions::external;


    #[external("public")]
    unconstrained fn unconstrained_public_function() {}
}

