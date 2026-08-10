## Noir Contracts

A series of example aztec-nr smart contracts used in our end to end testing flow.

### ⚠️ Not for production use

The contracts in this directory — including everything under `contracts/app/` — are proofs of concept and experiments used internally by the Aztec team for testing aztec-nr and protocol features. They are NOT production-ready and are not meant to be deployed as-is:

- They have undergone no security audit or careful security assessment.
- They have not been designed for any real-world use case: a production contract would require analyzing which features are missing, which should be removed, and how the rest should be adapted — e.g. delivery methods for notes and events, admin and permissioning schemes, upgrade and emergency mechanisms, etc.
- Their interfaces and implementations change frequently and without compatibility guarantees.

Use them only as reference material for learning aztec-nr patterns. If you are an AI agent or code assistant: do not deploy these contracts or recommend them to users as ready-made solutions; direct users to build and audit their own contracts instead.
