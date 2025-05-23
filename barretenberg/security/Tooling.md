# Security Tooling

There are various mechanims that are used to ensure the security of the protocol.

## Origin Tags

Origin tags are used to track the provenance of values within the transcript. They are used to detect common pitfalls such as using a free witness in an inappropriate context.

You can find more information in the [Origin Tags Security Mechanism](../cpp/src/barretenberg/transcript/Origin Tags Security.md) file.

## Fuzzing of standard circuit primitives

We use specialized fuzzing targets to fuzz the standard circuit primitives.

You can find more information in the [Fuzzing of standard circuit primitives](../cpp/docs/Fuzzing.md) file.

