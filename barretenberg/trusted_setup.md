### Transcript files

Our setup produces 100,800,000 G1 points and 1 G2 point, over the BN254 curve.

These are all in one flat file that can be downloaded partially using range HTTP headers. The G2 point gets its own file for simplicity.

These points are not compressed as they are statistically similar to random data.

We have a Grumpkin SRS file as well, however there are no toxic waste trust assumptions there, it has `2**18` points only, and there is no corresponding G2 group. 

### Data format

The transcript file contains raw binary data, where data elements are located by knowing their precise byte-position in the file. We write our data as follows:

For big-integer numbers (g1, g2 coordinates), we describe each 256-bit field element as a uint64_t[4] array. The first entry is the least significant word of the field element. Each 'word' is written in big-endian form.

For other integers (in the manifest section), variables are directly written in big-endian form.

### Structure of a transcript file

The G1 points are laid out flat with 64 bytes per point.
The G2 point is a single 128 byte point. 

### G1 point structure

The first G1 point will be `x.[1]`, where `x` is the trusted setup toxic waste, and `[1]` is the bn254 G1 generator point (1, 2)

Structure is as follows: `x.[1]`, `x^{2}.[1]`, ..., `x^{100,800,000}.[1]`  

Each participant generates their own randomness `z` and exponentiates each point by `z^{i}`, where `i` is the G1 point index

### G2 point structure

The only G2 point is `x.[2]`, where `[2]` is the bn254 G2 generator point with coordinates:

```
{
    "x": {
        "c0": "10857046999023057135944570762232829481370756359578518086990519993285655852781",
        "c1": "11559732032986387107991004021392285783925812861821192530917403151452391805634"
    },
    "y": {
        "c0": "8495653923123431417604973247489272438418190587263600148770280649306958101930",
        "c1": "4082367875863433681332203403145435568316851327593401208105741076214120093531"
    }
}
```

### Citation
Adapted from https://github.com/AztecProtocol/ignition-verification/blob/master/Transcript_spec.md.
