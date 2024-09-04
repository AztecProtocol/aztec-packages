contract CapsulesTest {
    use dep::aztec::capsules::request_capsule;
    use std::hash::pedersen_hash;

    #[aztec(private)]
    fn test() {
        // This value is the ID of the NFT
        let nft_id = 0x0dc4ad5aad4aa851d4f628dd7986c578e675d2a5eee8962a6dad8d6d166a1a18;

        // We fetch metadata here
        let serialized_capsule: [Field; 5] = request_capsule(6969, [nft_id]);

        // We constrain that the hash of the serialized inputs are equal to the ID of the NFT
        assert_eq(pedersen_hash(serialized_capsule), nft_id);

        // We constrain that the "Clothes" (second attribute) === "sha256(Vietnam Jacket)"
        assert_eq(serialized_capsule[1], 0x0030a6b83c154094f66ffa1c694ae3ba131e6af13caed86324307e3612387696);

        // Do stuff !
    }

    #[aztec(private)]
    fn test_price_feed() {
        // This should be held in contract storage
        let public_key_x = 0x149084b03a2ba5b321c0fcb93eddaf19566f9ce3948ffbafaf184db0e7594efb;
        let public_key_y = 0x2c3a7f6b101422cdc22a05da22897d8c95ce7531077d6c735bbb346cfb4203d0;

        let topic = 1337;

        // Token ID 1, Token ID 2
        let input = [123, 456];

        // returned structure is Price1, Price2, Timestamp, Sign(Pedersen()) (3)
        let serialized_capsule: [Field; 6] = request_capsule(topic, input);

        let price1 = serialized_capsule[0];
        let price2 = serialized_capsule[1];
        let block_number = serialized_capsule[2];

        // Topic is input for the hash
        let message_hash = pedersen_hash([topic, price1, price2, block_number, input[0], input[1]]);

        let signature_high: [u8; 31] = serialized_capsule[3].to_be_bytes();
        let signature_low: [u8; 31] = serialized_capsule[4].to_be_bytes();
        let signature_overflow: [u8; 31] = serialized_capsule[5].to_be_bytes();

        let mut signature: [u8; 64] = [0; 64];
        for i in 0..31 {
            signature[i] = signature_high[i];
            signature[i + 31] = signature_low[i];
        }

        for i in 0..2 {
            signature[i + 62] = signature_overflow[i];
        }

        let verified_signature = std::schnorr::verify_signature(
            public_key_x,
            public_key_y,
            signature,
            message_hash.to_be_bytes::<32>()
        );

        assert_eq(verified_signature, true);

        // Do stuff !
    }
}
