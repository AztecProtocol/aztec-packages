---
title: Blobs
---

## Implementation

### Technical Background

Essentially, we replace publishing all a tx's effects in calldata with publishing in a blob. Any data inside a blob is *not available* to the EVM so we cannot simply hash the same data on L1 and in the rollup circuits, and check the hash matches, as we do now.

Instead, publishing a blob makes the `blobhash` available:

```solidity
/**
* blobhash(i) returns the versioned_hash of the i-th blob associated with _this_ transaction.
* bytes[0:1]: 0x01
* bytes[1:32]: the last 31 bytes of the sha256 hash of the kzg commitment C.
*/
bytes32 blobHash;
assembly {
    blobHash := blobhash(0)
}
```

Where the commitment $C$ is a KZG commitment to the data inside the blob over the BLS12-381 curve. There are more details [here](https://notes.ethereum.org/@vbuterin/proto_danksharding_faq#What-format-is-blob-data-in-and-how-is-it-committed-to) on exactly what this is, but briefly, given a set of 4096 data points inside a blob, $d_i$, we define the polynomial $p$ as:

$$p(\omega^i) = d_i.$$

In the background, this polynomial is found by interpolating the $d_i$ s (evaluations) against the $\omega^i$ s (points), where $\omega^{4096} = 1$ (i.e. is a 4096th root of unity).

This means our blob data $d_i$ is actually the polynomial $p$ given in evaluation form. Working in evaluation form, particularly when the polynomial is evaluated at roots of unity, gives us a [host of benefits](https://dankradfeist.de/ethereum/2021/06/18/pcs-multiproofs.html#evaluation-form). One of those is that we can commit to the polynomial (using a precomputed trusted setup for secret $s$ and BLS12-381 generator $G_1$) with a simple linear combination:

$$ C = p(s)G_1 = p(sG_1) = \sum_{i = 0}^{4095} d_i l_i(sG_1),$$

where $l_i(x)$ are the [Lagrange polynomials](https://dankradfeist.de/ethereum/2021/06/18/pcs-multiproofs.html#lagrange-polynomials). The details for us are not important - the important part is that we can commit to our blob by simply multiplying each data point by the corresponding element of the Lagrange-basis trusted setup and summing the result!

### Proving DA

So to prove that we are publishing the correct tx effects, we just do this sum in the circuit, and check the final output is the same $C$ given by the EVM, right? Wrong. The commitment is over BLS12-381, so we would be calculating hefty wrong-field elliptic curve operations.

Thankfully, there is a more efficient way, already implemented in the [`blob`](https://github.com/AztecProtocol/aztec-packages/tree/master/noir-projects/noir-protocol-circuits/crates/blob) crate in aztec-packages.

Our goal is to efficiently show that our tx effects accumulated in the rollup circuits are the same $d_i$ s in the blob committed to by $C$ on L1. To do this, we can provide an *opening proof* for $C$. In the circuit, we evaluate the polynomial at a challenge value $z$ and return the result: $p(z) = y$. We then construct a [KZG proof](https://dankradfeist.de/ethereum/2020/06/16/kate-polynomial-commitments.html#kate-proofs) in typescript of this opening (which is actually a commitment to the quotient polynomial $q(x)$), and verify it on L1 using the [point evaluation precompile](https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile) added as part of EIP-4844. It has inputs:

- `versioned_hash`: The `blobhash` for this $C$
- `z`: The challenge value
- `y`: The claimed evaluation value at `z`
- `commitment`: The commitment $C$
- `proof`: The KZG proof of opening

It checks:

- `assert kzg_to_versioned_hash(commitment) == versioned_hash`
- `assert verify_kzg_proof(commitment, z, y, proof)`

As long as we use our tx effect fields as the $d_i$ values inside the circuit, and use the same $y$ and $z$ in the public inputs of the Honk L1 verification as input to the precompile, we have shown that $C$ indeed commits to our data. Note: I'm glossing over some details here which are explained in the links above (particularly the 'KZG Proof' and 'host of benefits' links).

But isn't evaluating $p(z)$ in the circuit also a bunch of very slow wrong-field arithmetic? No! Well, yes, but not as much as you'd think!

To evaluate $p$ in evalulation form at some value not in its domain (i.e. not one of the $\omega^i$ s), we use the [barycentric formula](https://dankradfeist.de/ethereum/2021/06/18/pcs-multiproofs.html#evaluating-a-polynomial-in-evaluation-form-on-a-point-outside-the-domain):

$$p(z) = A(z)\sum_{i=0}^{4095} \frac{d_i}{A'(\omega^i)} \frac{1}{z - \omega^i}.$$

What's $A(x)$, you ask? Doesn't matter! One of the nice properties we get by defining $p$ as an interpolation over the roots of unity, is that the above formula is simplified to:

$$p(z) = \frac{z^{4096} - 1}{4096} \sum_{i=0}^{4095} \frac{d_i\omega^i}{z - \omega^i}.$$

We can precompute all the $\omega^i$, $-\omega^i$ s and $4096^{-1}$, the $d_i$ s are our tx effects, and $z$ is the challenge point (discussed more below). This means computing $p(z)$ is threoretically 4096 wrong-field multiplications and 4096 wrong-field divisions, far fewer than would be required for BLS12-381 elliptic curve operations.

### Rollup Circuits

#### Base

We need to pass up *something* encompassing the tx effects to the rollup circuits, so they can be used as $d_i$ s when we prove the blob opening. The simplest option would be to `poseidon2` hash the tx effects instead and pass those up, but that has some issues:

- If we have one hash per base rollup (i.e. per tx), we have an ever increasing list of hashes to manage.
- If we hash these in pairs, then we need to recreate the rollup structure when we prove the blob.

The latter is doable, but means encoding some maximum number of txs, `N`, to loop over and potentially wasting gates for blocks with fewer than `N` txs. For instance, if we chose `N = 96`, a block with only 2 txs would still have to loop 96 times. Plus, a block could never have more than 96 transactions without a fork.

Instead, we manage state in the vein of `PartialStateReference`, where we provide a `start` and `end` state in each base and subsequent merge rollup circuits check that they follow on from one another. The base circuits themselves simply prove that adding the data of its tx indeed moves the state from `start` to `end`.

To encompass all the tx effects, we use a `poseidon2` sponge and absorb each field. We also track the number of fields added to ensure we don't overflow the blobs (4096 BLS fields per blob, with configurable `BLOBS_PER_BLOCK`). Given that this struct is a sponge used for a blob, I have named it:

```rs
global IV: Field = (FIELDS_PER_BLOB as Field) * 18446744073709551616;

struct SpongeBlob {
    sponge: Poseidon2,
    fields: u32,
}

impl SpongeBlob {
    fn new() -> Self {
        Self {
            sponge: Poseidon2::new(IV),
            fields: 0,
        }
    }
    // Add fields to the sponge
    fn absorb<let N: u32>(&mut self, input: [Field; N], in_len: u32) {
        // in_len is all non-0 input
        for i in 0..in_len {
            self.sponge.absorb(input[i]);
        }
        self.fields += in_len;
    }
    // Finalise the sponge and output poseidon2 hash of all fields absorbed
    fn squeeze(&mut self) -> Field {
        self.sponge.squeeze()
    }
}
```

To summarise: each base circuit starts with a `start` `SpongeBlob` instance, which is either blank or from the preceding circuit, then calls `.absorb()` with the tx effects as input. Just like the output `BaseOrMergeRollupPublicInputs` has a `start` and `end` `PartialStateReference`, it will also have a `start` and `end` `SpongeBlob`.

#### Merge

We simply check that the `left`'s `end` `SpongeBlob` == the `right`'s `start` `SpongeBlob`, and assign the output's `start` `SpongeBlob` to be the `left`'s and the `end` `SpongeBlob` to be the `right`'s.

#### Block Root

The current route is to inline the blob functionality inside the block root circuit.
<!-- We would allow up to 3 blobs to be proven in one block root rollup. For simplicity, the below explanation will just summarise what happens for a single blob. -->

First, we must gather all our tx effects ($d_i$ s). These will be injected as private inputs to the circuit and checked against the `SpongeBlob`s from the pair of `BaseOrMergeRollupPublicInputs` that we know contain all the effects in the block's txs. Like the merge circuit, the block root checks that the `left`'s `end` `SpongeBlob` == the `right`'s `start` `SpongeBlob`.

It then calls `squeeze()` on the `right`'s `end` `SpongeBlob` to produce the hash of all effects that will be in the block. Let's call this `h`. The raw injected tx effects are `poseidon2` hashed and we check that the result matches `h`. We now have our set of $d_i$ s.

We now need to produce a challenge point `z`. This value must encompass the two 'commitments' used to represent the blob data: $C$ and `h` (see [here](https://notes.ethereum.org/@vbuterin/proto_danksharding_faq#Moderate-approach-works-with-any-ZK-SNARK) for more on the method). We simply provide $C$ as a public input to the block root circuit, and compute `z = poseidon2(h, C)`.

Note that with multiple blobs per block, each blob uses the same `h` but has a unique `C`. Since `h` does encompass all fields in the blob (plus some more) and the uniqueness of `C` ensures the uniqueness of `z`, this is acceptable.

The block root now has all the inputs required to call the blob functionality described above. Along with the usual `BlockRootOrBlockMergePublicInputs`, we also have `BlobPublicInputs`: $C$, $z$, and $y$.

Each blob in the block has its own set of `BlobPublicInputs`. Currently, each are propagated up to the Root circuit and verified on L1 against each blob. In future, we want to combine each insteance of `BlobPublicInputs` so the contract only has to call the precompile once per block.

<!-- TODO(Miranda): Add details of block merge and root here once we know how they will look with batching -->

### L1 Contracts

#### Rollup

The function `propose()` takes in these `BlobPublicInputs` and a ts generated `kzgProof` alongside its usual inputs for proposing a new L2 block. The transaction also includes our blob sidecar(s). We verify the `BlobPublicInputs` correspond to the sidecars by calling EVM's point evaluation precompile:

```solidity
        // input for the blob precompile
        bytes32[] input;
        // extract the blobhash from the one submitted earlier:
        input[0] = blobHashes[blockHash];
        input[1] = z;
        input[2] = y;
        input[3] = C;
        // the opening proof is computed in ts and inserted here
        input[4] = kzgProof;

        // Staticcall the point eval precompile https://eips.ethereum.org/EIPS/eip-4844#point-evaluation-precompile :
        (bool success, bytes memory data) = address(0x0a).staticcall(input);
        require(success, "Point evaluation precompile failed");
```

We have now linked the `BlobPublicInputs` ($C$, $z$, and $y$) to a published EVM blob. We still need to show that these inputs were generated in our rollup circuits corresponding to the blocks we claim. To avoid storing `BLOBS_PER_BLOCK * 4` fields per block, we hash all the `BlobPublicInputs` to `blobPublicInputsHash`.
For each proposed block, we store them:

```solidity
rollupStore.blobPublicInputsHashes[blockNumber] = blobPublicInputsHash;
```

Then, when the epoch proof is submitted in `submitEpochRootProof()`, we inject the raw `BlobPublicInputs`, hash them, and check this matches each block's `blobPublicInputsHash`. We use these to verify the ZKP:

```solidity
    // blob_public_inputs
    uint256 blobOffset = 0;
    for (uint256 i = 0; i < _epochSize; i++) {
      uint8 blobsInBlock = uint8(_blobPublicInputs[blobOffset++]);
      for (uint256 j = 0; j < Constants.BLOBS_PER_BLOCK; j++) {
        if (j < blobsInBlock) {
          // z
          publicInputs[offset++] = bytes32(_blobPublicInputs[blobOffset:blobOffset += 32]);
          // y
          (publicInputs[offset++], publicInputs[offset++], publicInputs[offset++]) =
            bytes32ToBigNum(bytes32(_blobPublicInputs[blobOffset:blobOffset += 32]));
          // c[0]
          publicInputs[offset++] =
            bytes32(uint256(uint248(bytes31(_blobPublicInputs[blobOffset:blobOffset += 31]))));
          // c[1]
          publicInputs[offset++] =
            bytes32(uint256(uint136(bytes17(_blobPublicInputs[blobOffset:blobOffset += 17]))));
        } else {
          offset += Constants.BLOB_PUBLIC_INPUTS;
        }
      }
    }
```

Notice that if a block needs less than `BLOBS_PER_BLOCK` blobs, we don't waste gas on calling the precompile or assigning public inputs for the unused blobs. If we incorrectly claim that (e.g.) the block used 2 blobs, when it actually used 3, the proof would not verify because `BlobPublicInputs` would exist for the third blob but they would not have been assigned in the above loop (see `offset += Constants.BLOB_PUBLIC_INPUTS`).

Note that we do not need to check that our $C$ matches the `blobhash` - the precompile does this for us.
