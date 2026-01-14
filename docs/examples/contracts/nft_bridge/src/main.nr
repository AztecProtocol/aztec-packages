// docs:start:bridge_setup
use aztec::macros::aztec;

#[aztec]
pub contract NFTBridge {
    use dep::aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        protocol_types::{address::{AztecAddress, EthAddress}, hash::sha256_to_field},
        state_vars::PublicImmutable,
    };
    use dep::NFTPunk::NFTPunk;

    #[storage]
    struct Storage<Context> {
        nft: PublicImmutable<AztecAddress, Context>,
        portal: PublicImmutable<EthAddress, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(nft: AztecAddress) {
        self.storage.nft.initialize(nft);
    }

    #[external("public")]
    fn set_portal(portal: EthAddress) {
        self.storage.portal.initialize(portal);
    }
    // docs:end:bridge_setup

    // docs:start:claim
    #[external("private")]
    fn claim(to: AztecAddress, token_id: Field, secret: Field, message_leaf_index: Field) {
        // Compute the message hash that was sent from L1
        let token_id_bytes: [u8; 32] = (token_id as Field).to_be_bytes();
        let content_hash = sha256_to_field(token_id_bytes);

        // Consume the L1 -> L2 message
        self.context.consume_l1_to_l2_message(
            content_hash,
            secret,
            self.storage.portal.read(),
            message_leaf_index,
        );

        // Mint the NFT on L2
        let nft: AztecAddress = self.storage.nft.read();
        self.call(NFTPunk::at(nft).mint(to, token_id));
    }
    // docs:end:claim

    // docs:start:exit
    #[external("private")]
    fn exit(token_id: Field, recipient: EthAddress) {
        // Create L2->L1 message to unlock NFT on L1
        let token_id_bytes: [u8; 32] = token_id.to_be_bytes();
        let recipient_bytes: [u8; 20] = recipient.to_be_bytes();
        let content = sha256_to_field(token_id_bytes.concat(recipient_bytes));
        self.context.message_portal(self.storage.portal.read(), content);

        // Burn the NFT on L2
        let nft: AztecAddress = self.storage.nft.read();
        self.call(NFTPunk::at(nft).burn(self.msg_sender(), token_id));
    }
    // docs:end:exit
}
