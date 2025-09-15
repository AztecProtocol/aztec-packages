After having discussion with Mike, Sean and others I decided to go ahead with implementing the non-interactive handshaking contract approach because:
1. It's the solution that is the easiest to use for devs as it doesn't require offchain interaction (you just call a handshaking contract, pass in a specific flag to note/event emission functions and you are good),
2. it's also most likely the easiest solution to implement as it doesn't force us to somehow associate signing keys with an account.
3. This solution being the least scalable of all (it requires everyone to brute force handshaking logs) is fine as it will take time for the activity to pick up on the network and it's quite likely that once this becomes a problem we will have learnt a lot of new information that will make the tradeoff space much clearer.

Note that I decided to abandon the "hide sender from recipient" feature Mike described in his doc because it makes the solution easier to implement. This is because it allows us to re-use `pxe.addSender(...)` endpoint instead of needing to introduce `pxe.addSharedSecret(...)`  and it allows us to keep `ExecutionDataProvider::syncTaggedLogs` function unmodified. It will not be so hard to implement the "hidden sender" feature in the future if desired. This makes this a good stepping stone.

So how does it work?
### STEP 1: Emitting handshaking log and nullifier
1. A wallet figures out whether a sender needs to handshake with a recipient or if it already has been done --> if it hasn't been done it will insert a call to the `HandshakingContract::handshake(recipient)` as the first call in app payload (Very relevant for Grego, can this be done similar to how we collect authwit requests?)

```rust
TODO: insert pseudocode
```

### STEP 2.a: Tagging for the first time
1. We get the handshaking nullifier preimage by calling an oracle `get_handshake(sender, recipient)`
2. we prove the handshaking nullifier preimage: `prove_nullifier_inclusion(compute_siloed_nullifier(HANDSHAKING_CONTRACT_ADDRESS, poseidon2_hash(["AZTEC_NR::HANDSHAKE_SEPARATOR", handshaking_secret, sender, recipient])));`
3. we compute the tagging secret
4. we compute the tag based on `app_siloed_tagging_shared_secret` and index (0 in the first run), <span style="color:green;">TODO: ADD CONCRETE DERIVATION HERE</span>
5. we compute and emit `nullifier = h("hs", sender_nsk_app, recipient, app_siloed_tagging_shared_secret, app_siloed_encryption_shared_secret, handshake_expiry_timestamp, i = 0);`  *(--> the `sender_nsk_app` hides the contents of the nullifier, whilst keeping it deterministic)*
6. <span style="color:red;">we store these values in PXE</span>:`app_siloed_tagging_shared_secret` and `i` and `app_siloed_encryption_shared_secret` under (sender, recipient, contract address) key for later retrieval in subsequent rounds. --> <span style="color:cyan;">Note that i is currently incremented with the increment_app_tagging_secret_index_as_sender oracle and we will need to modify it to accept is_constrained flag on the input as the constrained and unconstrained indices need to be independent</span>

### STEP 2.b: Tagging for subsequent rounds
1. We get the values stored in step 5 above and prove the nullifier existence,
2. (no key validation request is needed now because the `app_siloed_tagging_shared_secret` has been loaded from the preimage),
3. the tag is computed `app_siloed_tagging_shared_secret`, with tagging index `i + 1`,
4. the tagging nullifier is emitted `nullifier = h("hs", sender_nsk_app, recipient, app_siloed_tagging_shared_secret, app_siloed_encryption_shared_secret, handshake_expiry_timestamp, i + 1);`,
5. `increment_app_tagging_secret_index_as_sender(sender, recipient, is_constrained = true)` is called


<span style="color:yellow;">Now we have a bit of a problem here that round 0 is way less efficient than round 1 and that if-elses are not real. It's very important to hyper-optimize this. How could that be done? Could we have some kind of hints, merge the 2 branches and make it efficient?</span>

### STEP 3: Recipient discovering notes
- We have this special handshaking contract and now we need everyone's PXE to load all the logs from it and brute force those to try to find new handshakes. This currently doesn't really fit into how logs are processed because log sync is triggered via the `aztec::messages::discovery::discover_new_messages(contract_address)` call for a given contract when a function is invoked.

What would be the output of this handshake sync?
--> We would have a new tagging secret stored in PXE under [contract_address, sender, recipient] pair and then obtainable via `this.#getIndexedTaggingSecretsForSenders(contract_address, recipient)`

1. A function is invoked and discover_new_messages is called,
2. in the oracle handler, before this.executionDataProvider.syncTaggedLogs is called we would call syncHandshakingSecrets that would:
3. obtain all the logs emitted from that contract (<span style="color:green;">TODO: how exactly? </span>),
4. trial decrypt the logs, if you succeed add the sender (pxe.addSender(...)) (<span style="color:green;">TODO: are we fine dropping the concealed-sender feature?</span>)




Currently the tagging secret is determined
```
const taggingSecretPoint = await computeTaggingSecretPoint(recipientCompleteAddress, recipientIvsk, sender);
return poseidon2Hash([taggingSecretPoint.x, taggingSecretPoint.y, app]);
```


Problem of this solution is that it allows anyone to effectively add a sender to PXE which is a DOS vector!

Potential solutions:
1. Enforcing strict handshaking secret expiration upon registration in the HandshakingContract,
 2. making the sender pay when registering a handshake in the HandshakingContract,
 3. somehow detecting spam in PXE (this seems unfeasible because we need this to be very reliable - otherwise you could just not find legitimate notes!),
4. when a new handshake is found have the user provide feedback whether he wants to add the sender to PXE (this could also be done at some point later).

--> we would want to expose this to the wallet that would decide! The wallet could know who is the potential handshaker. We can probably just afford not dealing with this now as it seems solvable.


<span style="color:green;"> TODO: Do we need the handshakes to be bidirectional?</span>

