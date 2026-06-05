/**
 * Serialize the flat ChonkProof field elements into the single binary buffer that the
 * native `bb verify --scheme chonk` reads.
 *
 * The native proof file is written as `to_buffer(proof.to_field_elements())` — the
 * concatenation of each field's 32-byte serialization with NO length prefix
 * (see `barretenberg/cpp/src/barretenberg/common/serialize.hpp`, `to_buffer<std::vector<T>>`
 * defaults `include_size = false`), and read back via `many_from_buffer<fr>`.
 *
 * `proofFields` returned by `AztecClientBackend.prove()` is already in
 * `ChonkProof::to_field_elements()` order (hiding-oink, merge, eccvm, ipa, joint —
 * see `flattenChonkProofFields` in bb.js and `chonk_proof.cpp`), so this is a plain
 * concatenation. Browser-safe: no Node imports, so it can be bundled into the page.
 */
export function concatChonkProofFields(proofFields: Uint8Array[]): Uint8Array {
  const total = proofFields.reduce((n, f) => n + f.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const field of proofFields) {
    out.set(field, offset);
    offset += field.length;
  }
  return out;
}
