// Exercises the propagation rules of `set_sender_for_tags` across a three-level nested-call chain (parent -> middle ->
// leaf). The contract deploys once and calls itself at each level. The PXE supplies parent's initial sender-for-tags;
// every assertion below is checked at Noir runtime so any propagation bug surfaces as an assertion failure in the
// caller.
use aztec::macros::aztec;

#[aztec]
pub contract SenderForTagsTest {
    use aztec::{
        macros::functions::{external, internal},
        oracle::notes::{get_sender_for_tags, set_sender_for_tags},
        protocol::{address::AztecAddress, traits::FromField},
    };

    #[external("private")]
    fn parent(default_sender_for_tags: AztecAddress) {
        let before = self.internal.current_sender();
        assert(
            before == default_sender_for_tags,
            "parent did not receive the expected sender_for_tags from PXE",
        );
        self.call_self.middle(default_sender_for_tags);
        assert(
            self.internal.current_sender() == before,
            "parent sender_for_tags changed after middle returned",
        );
    }

    #[external("private")]
    fn middle(default_sender_for_tags: AztecAddress) {
        assert(
            self.internal.current_sender() == default_sender_for_tags,
            "middle did not inherit parent's default sender_for_tags",
        );
        let override_addr = AztecAddress::from_field(42);
        // Safety: we set a value we chose and immediately assert it took effect, so we are not trusting the oracle
        // blindly.
        unsafe { set_sender_for_tags(override_addr) };
        assert(
            self.internal.current_sender() == override_addr,
            "middle set_sender_for_tags did not take effect",
        );
        self.call_self.leaf(default_sender_for_tags);
        assert(
            self.internal.current_sender() == override_addr,
            "middle sender_for_tags was mutated by leaf",
        );
    }

    #[external("private")]
    fn leaf(default_sender_for_tags: AztecAddress) {
        assert(
            self.internal.current_sender() == default_sender_for_tags,
            "leaf inherited middle's override instead of parent's default",
        );
    }

    #[internal("private")]
    fn current_sender() -> AztecAddress {
        // Safety: the returned value is always immediately asserted against a known expected value by the caller, so
        // we are not trusting the oracle blindly.
        unsafe { get_sender_for_tags() }.expect(f"expected a sender_for_tags to be set")
    }
}
