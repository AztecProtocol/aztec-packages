Major TODOS
acir_format::Composer (and other types) become GUH
? stretch update create_circuit to use Goblin gates (build_contraints and circuit_buf_to_acir_format in particular?)
Update AcirComposer
 - Wrap a GUH builder
 - ? update create_circuit to populate that builder
 - Wrap a GUH composer
 - Wrap a Goblin
 - ? init_proving_key 
 - create_proof proxies to goblin.create_proof that we wrote
 - proving and verification keys become GUH keys
 - Serialization of proof 

 Update Goblin: 
  - Flesh out what we already did
  - Add constructor from a GUH pk-vk pair (maybe no pk needed?)

  Make acir_format and acir_proofs tests work

  Stetch: try to understand what is_recursive flag should do