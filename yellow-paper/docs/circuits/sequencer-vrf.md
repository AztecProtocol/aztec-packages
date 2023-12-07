# Sequencer VRF Circuit

The Sequencer VRF Circuit is intended to verify the VRF score submitted by the leading sequencer who built the block. It is executed during the proving phase and recursively verified by the root rollup circuit.

<!-- Q: Should this be a separate circuit, or should it be a constraint included in the root rollup circuit? -->

## Requirements

The sequencer VRF circuits constrains that the resulting score for a given sequencer with a given random seed, obtained from a RANDAO value, is equal to the reported score. The VRF is calculated as the Pedersen hash of the sequencer's identifier and the random seed.

## Private Inputs

None. All inputs to the circuit are public, as it is executed by a public prover.

## Public Inputs

- Sequencer address.
- Random seed.
- Reported VRF score.