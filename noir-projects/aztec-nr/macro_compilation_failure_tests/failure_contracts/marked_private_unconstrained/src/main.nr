/// Private functions that are also marked as unconstrained are not allowed.
///
use aztec::macros::aztec;


#[aztec]
contract MarkedPrivateUnconstrained {
    use aztec::macros::functions::private;


    #[private]
    unconstrained fn unconstrained_private_function() {}
}

