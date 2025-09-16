# Implementing onchain non-interactive handshaking approach

After having discussion with Mike, Sean and others I decided to go ahead with implementing the onchain non-interactive handshaking approach because:

1. It's the solution that is the easiest to use for devs as it doesn't require offchain interaction (you just call a tagging contract, pass in a specific flag to note/event emission functions and you are good),
2. it's also most likely the easiest solution to implement as it doesn't force us to somehow associate signing keys with an account.
3. This solution being the least scalable of all (it requires everyone to brute force handshaking logs) is fine as it will take time for the activity to pick up on the network and it's quite likely that once this becomes a problem we will have learnt a lot of new information that will make the tradeoff space much clearer.

So how does it work?

### STEP 1: Emitting handshaking log and nullifier

1. A wallet figures out whether a sender needs to handshake with a recipient or if it already has been done --> if it hasn't been done it will insert a call to the `Handshaker::handshake(recipient, true/false)` as the first call in the app payload (Very relevant for Grego, can this be done similar to how we collect authwit requests?)

### STEP 2: Recipient and sender discovering handshake

1. A contract function is being simulated and and a `aztec::messages::discovery::discover_new_messages(contract_address)` is called,
2. in the oracle handler, before `this.executionDataProvider.syncTaggedLogs(contractAddress)` is called we would call <span style="color:red;">syncTaggingSecrets()</span> that would:
3. load last_synced_tagging_secrets_block and get all the public logs since that block until the latest synced PXE block node.getPublicLogs(from: last_synced_tagging_secrets_block, last_block_synced_by_pxe, HANDSHAKER_CONTRACT_ADDRESS),
4. we would brute force decrypt both sender and recipient ciphertexts in the logs in TS and add the resulting master tagging secrets to PXE. (I am aware decrypting in TS here is ugly but we need it to be fast and it's fine to enshrine the encryption because the tagging contract is enshrined as well.)

### STEP 3

See the `get_next_tag` in `noir-projects/noir-contracts/contracts/protocol/tagging_contract/src/util.nr` for semi pseudo-code.

#### STEP 3.a: Tagging for the first time

1. We get the master tagging public key by calling a <span style="color:red;">newly introduced oracle</span> `get_master_tagging_public_key(sender, recipient, hidden_sender)`
2. we sort the addresses (just like in the Handshaker) and prove the handshake commitment exists: `prove_nullifier_inclusion(compute_siloed_nullifier(HANDSHAKER_CONTRACT_ADDRESS, poseidon2_hash(["AZTEC_NR::HANDSHAKE_SEPARATOR", master_tagging_public_key.x, master_tagging_public_key.y, address_0, address_1])));`
3. we get the app-siloed secret with `let app_tagging_secret = context.request_tsk(master_tagging_public_key.hash())` <span style="color:red;">This requires implementing the request_tsk method on context and modifying PXE such that it feeds the correct master_tagging_secret_key to the kernel circuits for the key validation request</span>,
4. we compute the directional app tagging secret as `let directional_app_tagging_secret = poseidon2_hash([app_tagging_secret, recipient]);`,
5. we compute the tag as `poseidon2_hash([directional_app_tagging_secret, 0])`
6. we compute and emit the `tag_nullifier = poseidon2_hash("AZTEC_NR::TAG_SEPARATOR", sender_nsk_app, recipient, directional_app_tagging_secret, i = 0);` _(--> the `sender_nsk_app` hides the contents of the nullifier, whilst keeping it deterministic)_
7. ~~we increment the index in PXE by calling <span style="color:red;">newly introduced oracle</span> `increment_app_tagging_secret_index(app_tagging_secret)`~~ (realized this is not necessary, nor desirable, because we can brute force the index in PXE in step 3.b --> this will also makes it resistant to "vicious Mike throws your laptop into the ocean" attack)

#### STEP 3.b: Tagging for subsequent rounds

1. We call a <span style="color:red;">newly introduced `let [directional_app_tagging_secret, index] = get_tag_nullifier_preimage(sender, recipient, hidden_sender)` oracle</span> that brute forces the index (no key validation request is needed now because the `app_siloed_tagging_shared_secret` has been loaded from the preimage) and we prove its inclusion,
2. we compute the tag as `poseidon2_hash([directional_app_tagging_secret, index])`
3. the tag nullifier is computed and emitted `tag_nullifier = poseidon2_hash("AZTEC_NR::TAG_SEPARATOR", sender_nsk_app, recipient, directional_app_tagging_secret, index);`,

### STEP 4: Recipient discovering notes

It works the same as until now with the difference that `this.executionDataProvider.syncTaggedLogs(contractAddress)` sync logs also based on the constrained tags. Note that this will <span style="color:red;">require us to modify this function</span>. The constrained tags code block of the function will not have to deal with ugly window approach as the tags are guaranteed to be continuous!

## DOS attack

Problem of this solution is that it allows anyone to effectively add a sender to PXE which is a DOS vector!

Potential solutions:

1. Enforcing strict handshaking secret expiration upon registration in the HandshakingContract,
2. making the sender pay when registering a handshake in the HandshakingContract,
3. somehow detecting spam in PXE (this seems unfeasible because we need this to be very reliable - otherwise you could just not find legitimate notes!),
4. when a new handshake is found have the user provide feedback whether he wants to add the sender to PXE (this could also be done at some point later).

We will want to expose this the wallet as the wallet will most likely have a valuable info of who is a legitimate sender as that's where the interaction starts. I think we can afford not thinking about this now as it seems solvable.
