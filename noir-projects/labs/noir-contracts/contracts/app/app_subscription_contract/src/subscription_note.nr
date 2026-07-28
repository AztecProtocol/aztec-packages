use aztec::{macros::notes::note, protocol::traits::Packable};

#[derive(Eq)]
#[note]
pub struct SubscriptionNote {
    pub expiry_block_number: u32,
    pub remaining_txs: u32,
}

impl Packable for SubscriptionNote {
    let N: u32 = 1;

    fn pack(self) -> [Field; Self::N] {
        [(self.expiry_block_number as Field) * 2.pow_32(32) + (self.remaining_txs as Field)]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let remaining_txs = packed[0] as u32;
        let expiry_block_number = ((packed[0] - remaining_txs as Field) / 2.pow_32(32)) as u32;
        Self { expiry_block_number, remaining_txs }
    }
}

mod test {
    use super::{Packable, SubscriptionNote};

    #[test]
    fn test_pack_unpack_subscription_note() {
        let note = SubscriptionNote { expiry_block_number: 1000, remaining_txs: 5 };
        let unpacked = SubscriptionNote::unpack(note.pack());
        assert_eq(unpacked.expiry_block_number, note.expiry_block_number);
        assert_eq(unpacked.remaining_txs, note.remaining_txs);
    }

    #[test]
    fn test_pack_unpack_subscription_note_zeros() {
        let note = SubscriptionNote { expiry_block_number: 0, remaining_txs: 0 };
        let unpacked = SubscriptionNote::unpack(note.pack());
        assert_eq(unpacked.expiry_block_number, 0);
        assert_eq(unpacked.remaining_txs, 0);
    }

    #[test]
    fn test_pack_unpack_subscription_note_max() {
        let note = SubscriptionNote { expiry_block_number: 0xffffffff, remaining_txs: 0xffffffff };
        let unpacked = SubscriptionNote::unpack(note.pack());
        assert_eq(unpacked.expiry_block_number, note.expiry_block_number);
        assert_eq(unpacked.remaining_txs, note.remaining_txs);
    }
}
