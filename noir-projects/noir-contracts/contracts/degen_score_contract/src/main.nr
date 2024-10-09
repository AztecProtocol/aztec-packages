mod test;
mod types;

use dep::aztec::macros::aztec;

#[aztec]
contract DegenScore {
    use dep::aztec::{
        prelude::{Map, AztecAddress, PrivateMutable},
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note_with_keys,
        keys::getters::get_public_keys,
        macros::{storage::storage, functions::{initializer, private}},
    };
    use crate::types::{DegenScoreNote::DegenScoreNote};
    use std::hash::pedersen_hash;

    struct DegenData {
        trading_volume: Field,
        leverage_score: Field,
        yield_farming_score: Field,
        nft_score: Field,
        risk_score: Field,
        token_diversity: Field,
    }

    #[storage]
    struct Storage<Context> {
        degen_scores: Map<AztecAddress, PrivateMutable<DegenScoreNote, Context>, Context>,
    }

    #[private]
    #[initializer]
    fn constructor(owner: AztecAddress) {
        let degen_scores = storage.degen_scores;
        let initial_score = 0;
        let owner_keys = get_public_keys(owner);
        let randomness = owner_keys.npk_m.hash();

        let mut initial_note = DegenScoreNote::new(
            initial_score,
            owner,
            randomness,
        );

        degen_scores.at(owner).initialize(&mut initial_note)
            .emit(encode_and_encrypt_note_with_keys(
                &mut context,
                owner_keys.ovpk_m,
                owner_keys.ivpk_m,
                owner
            ));
    }

    #[private]
    fn update_degen_score(
        user: AztecAddress,
        eth_signature: [Field; 65],
        trading_volume: Field,
        leverage_score: Field,
        yield_farming_score: Field,
        nft_score: Field,
        risk_score: Field,
        token_diversity: Field
    ) {
        // In a real implementation, we would verify the Ethereum signature here
        // For this PoC, we'll assume the signature is valid

        let degen_scores = storage.degen_scores;
        let updated_data = DegenData {
            trading_volume,
            leverage_score,
            yield_farming_score,
            nft_score,
            risk_score,
            token_diversity,
        };
        let new_score = calculate_degen_score(updated_data);
        let user_keys = get_public_keys(user);
        let randomness = user_keys.npk_m.hash();
        let mut new_note = DegenScoreNote::new(
            new_score,
            user,
            randomness, 
        );
        degen_scores.at(user).replace(&mut new_note)
            .emit(encode_and_encrypt_note_with_keys(
                &mut context,
                user_keys.ovpk_m,
                user_keys.ivpk_m,
                user
            ));
    }

    fn calculate_degen_score(data: DegenData) -> pub Field {
        // Simplified scoring algorithm
        data.trading_volume / 1000 +
        data.leverage_score * 10 +
        data.yield_farming_score * 5 +
        data.nft_score * 2 +
        data.risk_score * 15 +
        data.token_diversity * 3
    }

    unconstrained fn get_degen_score(user: AztecAddress) -> pub DegenScoreNote {
        let degen_scores = storage.degen_scores;
        degen_scores.at(user).view_note()
    }
}
