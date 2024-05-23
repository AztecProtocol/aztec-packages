mod types;

// Minimal token implementation that supports `AuthWit` accounts and private refunds

contract PrivateToken {
    use dep::compressed_string::FieldCompressedString;
    use dep::aztec::{
        hash::compute_secret_hash,
        prelude::{NoteGetterOptions, Map, PublicMutable, SharedImmutable, PrivateSet, AztecAddress},
        protocol_types::abis::function_selector::FunctionSelector, oracle::unsafe_rand::unsafe_rand,
        keys::getters::get_npk_m_hash
    };
    use dep::authwit::{auth::{assert_current_call_valid_authwit, assert_current_call_valid_authwit_public}};
    use crate::types::{token_note::{TokenNote, TOKEN_NOTE_LEN}, balances_map::BalancesMap};
    use dep::std::embedded_curve_ops::EmbeddedCurvePoint;

    #[aztec(storage)]
    struct Storage {
        balances: BalancesMap<TokenNote>,
    }

    #[aztec(private)]
    fn balance_of_private(owner: AztecAddress) -> pub Field {
        storage.balances.balance_of(owner).to_integer()
    }
}
