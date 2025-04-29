import releasePleaseManifest from '../../../.release-please-manifest.json';

export const VERSION = releasePleaseManifest['.'];


export const ContractDescriptions = {
    EasyPrivateVoting: 'Cast a vote privately without revealing who the voter is while maintaining the tally in public and preventing double voting - all without tracking the users. Display the results publicly.',
    SimpleToken: 'Create a simplified token contract that enables you to mint & transfer tokens either privately or publicly. Privately minted tokens will not reveal the recipient of the token, while updating the total supply publicly. Privately transferring doesn’t reveal anything!',
}

export const ContractMethodDescriptions = {
    EasyPrivateVoting: {
        cast_vote: 'Lets any account vote once (address is private but the vote is not). It enqueues call to a public function to update the tally with your vote. Uses nullifiers to prevent you from voting again.',
        get_vote: 'Get public vote result without seeing how accounts voted.',
        end_vote: 'Allows designated account to end the vote.',
        constructor: 'This initializes the contract with the admin and sets voting to be live. This will fail if you have already deployed your contract above.'
    },
    SimpleToken: {
        constructor: 'This initializes the contract with the token name, symbol, and decimals. This will fail if you have already deployed your contract above.',
        private_transfer: 'Send a token to an account without revealing who the sender is, the recipient  or the amount of tokens being transferred.',
        mint_privately: 'Allows anyone to increment the token supply without revealing the destination of the newly minted tokens.',
        transfer_from_private_to_public: 'Give tokens publicly to someone, while hiding the sender or their balance.',
        transfer_from_public_to_private: 'Reverse of the above. Take some of your public tokens and send them privately (hide the recipient) all in one transaction.',
        prepare_private_balance_increase: 'A two step version of the previous. Prepare to receive public tokens privately here. Later, another contract or user can finalize this by calling finalize_transfer_to_private or Finalize_mint_to_private',
        finalize_transfer_to_private: 'Second step of the previous function which finalizes the public to private transfer. Private functions are executed before public ones, so to get public tokens privately, you create a partial note in private while you wait for someone to finalize the partial note with the amount you wanted to receive',
        finalize_mint_to_private: 'Second step of the previous function which finalizes the private mint.',
        burn_private: 'Allows anyone to decrement the token supply by burning your token balance',
        mint_publicly: 'Mint tokens publicly like in other networks',
        public_transfer: 'Token transfer publicly, like in other networks',
        burn_public: 'Burn tokens publicly, like in other networks',
        cancel_authwit: 'Cancel your authwit (approval) to someone for doing a transaction on your behalf',
        private_balance_of: 'Query your private balance (public and private state are stored separately)',
        public_balance_of: 'Query your public balance (public and private state are stored separately)',
        public_get_name: 'Get name of the token, stored publicly',
        public_get_symbol: 'Get symbol of the token, stored publicly',
        public_get_decimals: 'Get decimals of the token, stored publicly',
        public_total_supply: 'Get total supply of the token, stored publicly'
    }
}

export const ContractDocumentationLinks = {
    EasyPrivateVoting: 'https://docs.aztec.network/developers/tutorials/codealong/contract_tutorials/private_voting_contract',
    SimpleToken: 'https://docs.aztec.network/developers/tutorials/codealong/contract_tutorials/private_voting_contract'
}

export const ContractMethodOrder = {
    EasyPrivateVoting: [
        'cast_vote',
        'get_vote',
        'end_vote',
        'constructor',
    ],
    SimpleToken: [
        'private_transfer',
        'mint_privately',
        'transfer_from_private_to_public',
        'transfer_from_public_to_private',
        'prepare_private_balance_increase',
        'finalize_transfer_to_private',
        'finalize_mint_to_private',
        'burn_private',
        'mint_publicly',
        'public_transfer',
        'burn_public',
        'cancel_authwit',
        'private_balance_of',
        'public_balance_of',
        'public_get_name',
        'public_get_symbol',
        'public_get_decimals',
        'public_total_supply',
        'constructor',
    ]
}
