---
title: Private Escrow Kit
sidebar_position: 4
tags: [escrow, privacy, tooling, ai]
description: Build private peer-to-peer marketplaces and escrows on Aztec with secret contracts, shared private state, lifecycle phases, and conditional release.
---

The Private Escrow Kit is a set of AI agent skills that scaffold a complete private escrow project on Aztec: Noir contracts plus a TypeScript SDK, ready to build, test, and deploy. You describe the escrow you want in plain language, and the skill generates a working starting point built around the privacy patterns this page explains.

An escrow holds an asset until an agreed condition is met, then either releases it to the counterparty or refunds it to the creator. On a transparent chain, every deposit, match, and release is public. On Aztec, the escrow's terms, balances, and participants stay private by default, and you choose exactly what to disclose and to whom. That makes Aztec a natural foundation for **conditional private escrow**: the building block behind peer-to-peer marketplaces, over-the-counter (OTC) swaps, intent and request-for-quote (RFQ) flows, milestone payments, and private orderbooks.

This guide is a conceptual overview of how private escrows work on Aztec and how the kit assembles them. It is the recommended way to start an escrow project, but the patterns stand on their own: even if you write every line by hand, the privacy model, lifecycle, and handoff mechanics below are what a correct private escrow needs.

:::info Sources
The kit is delivered as the [aztec-private-escrow-skills](https://github.com/aztec-pioneers/aztec-private-escrow-skills) repository, and the [Escrow Kit landing page](https://github.com/AztecProtocol/escrow-landing) shows the broader vision and the BAZaar marketplace demo. The skills target **Aztec v4.2.0**. The repository is the source of truth for the exact, current API; the code on this page is illustrative and may differ from the version you install.
:::

## When to use it

Reach for the kit when two parties (or a maker and many potential takers) need to exchange value under a condition, and the terms or identities should stay private. Common shapes:

| Shape                   | Use when                                                    | What the escrow holds                                      |
| ----------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| OTC atomic swap         | Two parties swap fixed assets in one atomic settlement      | Terms, the maker's funded asset, a receive-side commitment |
| RFQ or intent escrow    | A maker publishes private terms that any taker can satisfy  | Terms, an optional bound acceptor, an expiry               |
| Milestone escrow        | Funds unlock after a private proof or an approver signs off | Deposits, milestone state, approver roles                  |
| Private orderbook entry | Many takers can discover and fill a private listing         | A listing commitment, an optional encrypted handoff        |
| Claim or ticket escrow  | A claimant redeems against a private entitlement            | A claim note, a verifier role                              |

The default the kit scaffolds is the OTC atomic swap. It is the smallest shape that protects both sides, and the other shapes extend it rather than replace it.

## How the kit is delivered

The kit ships as three [agent skills](../../ai_tooling.md), each scoped to one job:

| Skill                     | What it does                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `scaffold-escrow-project` | Creates the project: Noir sources, generated artifacts, the TypeScript SDK, and a Bun localnet test harness |
| `write-escrow-contract`   | Designs and adapts the Noir contract: storage, roles, lifecycle, token calls, and SDK helpers               |
| `build-escrow-contract`   | Compiles the Noir contract and regenerates the TypeScript bindings                                          |

To use them, add the skills to your coding agent (for Claude Code, place the skill folders under `.claude/skills/`; for Codex, reference them from your `AGENTS.md`), then ask the agent to run `scaffold-escrow-project`. See [AI Tooling](../../ai_tooling.md) for how to set up an agent for Aztec and Noir development.

A typical session looks like this:

1. **Describe the escrow.** Give your agent a one-sentence use case, for example "an OTC desk where a maker swaps a fixed amount of token A for token B, cancelable until filled."
2. **Confirm the design.** For a fresh project the skill runs a short [design intake](#design-intake) to pin down phases, timing windows, and which terms are config versus state. Plan mode is preferred here so design decisions are explicit.
3. **Scaffold and refine.** The skill generates the contract and SDK. You review and adjust the protocol logic, trigger conditions, and privacy decisions.
4. **Build, test, deploy.** Compile the contract, run the localnet tests, and deploy.

:::warning Treat generated code as a starting point
The skill produces a working scaffold, not an audited protocol.
:::

## Prerequisites

- Aztec CLI `4.2.0` (see [AI Tooling](../../ai_tooling.md) for installation and the recommended `aztec`-CLI-first workflow)
- [Bun](https://bun.sh)
- A local Aztec network for tests, running on `http://localhost:8080`:

```bash
aztec start --local-network
```

- A coding agent that supports skills (Claude Code or Codex), with the [Aztec and Noir context configured](../../ai_tooling.md)
- Familiarity with [private state and notes](../foundational-topics/state_management.md), [authwits](../foundational-topics/advanced/authwit.md), and [account keys](../foundational-topics/accounts/keys.md)

## The privacy model

The kit is built on the patterns below which, together, let a small group of participants share a private view of one escrow without making it publicly discoverable.

### Secret contracts

A normal Aztec deployment publishes the contract class and instance so any node can look them up by address (see [contract creation](../foundational-topics/contract_creation.md)). What the kit calls a **secret contract** is a deployment that skips both, using `skipClassPublication` and `skipInstancePublication`. Its functions and state are known only to participants, who receive the contract artifact and instance material out of band and register it locally.

Because there is no public bytecode to look up, you prove a secret escrow exists from its deployment and initialization effects (such as the initialization nullifier), not from a node lookup. Publish the class or instance only when public functions, public discovery, upgrades, or non-participant callers need it.

### Contract-owned shared private state

Participants who must agree on the same private facts (the terms, the current phase) read **contract-owned notes**: notes stored under the contract's own address (`self.address`) rather than any participant's address. Anyone who registers the contract instance with its secret key can read them; nobody else can.

The kit splits this state in two:

- **`ConfigNote`** holds immutable terms, set once at construction, in a `SinglePrivateImmutable`.
- **`StateNote`** holds the mutable lifecycle phase, in a `SinglePrivateMutable` owned by `self.address`.

```rust
#[storage]
struct Storage<Context> {
    config: SinglePrivateImmutable<ConfigNote, Context>,
    state: SinglePrivateMutable<StateNote, Context>,
}
```

Private calls that read or nullify these notes must include the contract address in `additionalScopes`, so the caller's [PXE](../foundational-topics/pxe/index.md) can discover them.

### Capability boundaries

Reading shared state and being allowed to act on the escrow are deliberately separate. The contract secret key lets you _see_ the escrow's notes; it does not, by itself, grant any business authority. Authority comes from role checks in Noir.

| Material                | Enables                                                   | Does not enable                                       |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Artifact + instance     | Reconstructing and registering the wrapper, forming calls | Reading encrypted contract-owned notes                |
| Contract secret key     | Reading and potentially nullifying contract-owned notes   | Business authority, unless Noir grants it             |
| Participant account key | Sending and proving as that account                       | Reading contract-owned notes without the contract key |
| Role secret             | Proving a caller-bound maker/taker/filler pseudonym       | Reading shared state, or authorizing another address  |
| Authwit                 | One specific cross-contract action                        | General escrow authority                              |

### Role-secret pseudonyms

Storing a participant's address in shared config would leak who they are to every reader. Instead, roles use **caller-sampled pseudonyms**. The caller picks a random secret offchain, and the contract stores only a hash that binds that secret to the caller's address:

```rust
let pseudonym = Poseidon2::hash([caller.to_field(), role_secret], 2);
```

The contract emits the secret back to the caller as a private event so they can recover it later, and never stores the raw secret:

```rust
self.emit(RoleAdded { secret: role_secret })
    .deliver_to(caller, MessageDelivery.ONCHAIN_UNCONSTRAINED);
```

Later, a role-gated call takes the same `role_secret`, recomputes `Poseidon2::hash([caller, secret])` inline, and asserts it matches the stored pseudonym. Because the hash binds the caller's address, a different account cannot reuse a leaked secret to impersonate the role. The TypeScript SDK exposes `retrieveRoleSecret(...)` to scan for the caller's `RoleAdded` event and recover the secret.

For an atomic one-shot escrow, only the creator gets a role secret by default. Bind a taker or filler pseudonym only when a phase such as `ACCEPTED` needs to remember a specific runtime caller.

### Encrypted manifest handoff

To bring a counterparty into a secret escrow, you hand them an **escrow manifest**: the minimum data needed to register the wrapper and read shared state. Nothing more.

```typescript
export type EscrowManifestData = {
  address: string;
  contractInstance: unknown; // serialized ContractInstanceWithAddress
  contractSecretKey: string;
  createdBlockNumber: number; // where event scans start
  txHash?: string;
};
```

The manifest is a transport object, not contract state. The SDK's `EscrowManifest` class exposes `manifest.encrypt(recipientPublicKey)` and `EscrowManifest.decrypt(...)` for encrypted transport (ephemeral ECDH key exchange). On the receiving side, `manifest.register(wallet)` returns the typed escrow contract after registering the instance, the secret key, and the sender.

A recipient who does not get the contract secret key does not have a complete manifest and cannot read shared private state.

### Sensitive-term commitments

Some terms are recoverable from a small search space: usernames, email addresses, payment handles, shipping addresses, locker codes. These are poor candidates for any onchain log, even an encrypted one, because they invite capture-now-decrypt-later attacks. Store only a **salted commitment** onchain and deliver the plaintext offchain through the same secure channel as the contract secret key.

Domain-separate commitments so a payment-handle commitment cannot be replayed as a shipping-address commitment, and keep non-sensitive context (such as a `platform` tag) in plain config.

## Lifecycle phases

An escrow's lifecycle is **protocol state**, not a UI label, so it lives in the contract-owned `StateNote`. Authorized participants share one private view of where the order stands; the public sees nothing. The kit models lifecycle with up to five phases:

| Phase                    | Meaning                                                                                                                                          | Typical next phases                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `OPEN`                   | Constructor wrote config, funded the escrow with the maker's offered asset, and initialized state. The order can be filled, accepted, or voided. | `ACCEPTED`, `FILLED`, `VOID`                         |
| `ACCEPTED`               | Optional reservation. The accepting caller's pseudonym is bound in state so the maker cannot void while that caller works to fill.               | `FILLED`, `SETTLEMENT_IN_PROGRESS`, timeout recovery |
| `SETTLEMENT_IN_PROGRESS` | Optional delayed settlement. The taker proved an action or began delivery, but final release awaits later proof, delivery, or timeout.           | `FILLED`, timeout or dispute recovery                |
| `FILLED`                 | Terminal success. Delivery was proven or performed and assets were released per the terms.                                                       | terminal                                             |
| `VOID`                   | Terminal cancellation. The escrow returns what it holds to the creator.                                                                          | terminal                                             |

Choose the smallest phase graph that protects both sides:

- **Atomic settlement** uses `OPEN -> FILLED`, with `VOID` available before a fill. Constructor funding makes `OPEN` the initial actionable state.
- Add **`ACCEPTED`** when filling requires offchain work and the taker needs protection from cancellation. The default fill window is 1 hour.
- Add **`SETTLEMENT_IN_PROGRESS`** when proof of initiation is not proof of final delivery (cancelable orders, locker-style handoffs). The default settlement window is 7 days.

A few invariants keep the state machine sound:

- Terminal phases are exclusive: an order cannot be both `VOID` and `FILLED`.
- Phase transitions consume and replace the prior `StateNote` rather than relying on custom nullifiers.
- A `VOID` after `ACCEPTED` or `SETTLEMENT_IN_PROGRESS` must follow an explicit timeout or recovery rule, not act as a maker escape hatch.
- Timing windows are immutable contract configuration once deployed.
- Deadline checks use the anchor block timestamp (`self.context.get_anchor_block_header().timestamp()`), so keep windows coarse.

:::note BAZaar's phases are an example, not a constraint
The BAZaar marketplace demo labels its phases Listed, Locked, Released, and Refunded. Those map onto `OPEN`, `ACCEPTED`, `FILLED`, and `VOID`. The kit does not bind to any particular names; name phases to fit your protocol.
:::

## Conditional release: triggers as a design dimension

What makes a `FILLED` transition fire is the escrow's **release condition**, sometimes called a trigger. This is a design decision, not a fixed feature. The kit gives you the lifecycle and privacy scaffolding; you choose what proves the condition and wire it into the transition. Always give the escrow an exit so funds are never permanently stuck: the OTC default lets the creator `VOID` an unfilled order, and delayed or offchain flows should add a time-based fallback.

| Release condition                          | What it proves                                                                                        | Status in the kit                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Atomic token settlement                    | The taker's asset entered escrow, so the escrow can pay both sides in one transaction                 | **Shipped** as the default OTC fill                                                                             |
| Proof of an offchain fact (zkTLS, zkEmail) | A web or email event occurred (a marketplace trade landed, a PR merged) without revealing the session | **Design pattern.** Verifier integration is a stub you implement                                                |
| Signature or arbiter                       | A designated party or multisig signed off on delivery                                                 | Pattern you implement with a role-gated call                                                                    |
| Oracle feed                                | A published value crossed a threshold                                                                 | Pattern you implement against an onchain feed                                                                   |
| Time lock                                  | A deadline passed                                                                                     | Recommended fallback for delayed or offchain flows; the OTC default instead lets the creator void before a fill |
| Onchain event                              | Another contract on Aztec or Ethereum L1 fired                                                        | Pattern you implement                                                                                           |

:::caution Proof-based triggers are patterns, not a plug-in interface
The landing page presents pluggable triggers, with zkTLS (via Primus) as the marquee unlock for pulling verified web facts onchain. In the current kit, proof-based release conditions are **design patterns with stubbed verifiers**, not a finished interface. Generated tests mark zkTLS, zkEmail, payment, and locker-code flows as skipped, naming the missing verifier and the expected phase transition. Treat conditional release as something you design and implement on top of the lifecycle, and verify the integration end to end before relying on it.
:::

Proof-only delivery often does not move a token into escrow at all: the taker submits a proof that matches the config, and the escrow pays out from its own funds. When a release proof needs to carry data, prefer a salted commitment in the event or state and deliver the plaintext offchain, rather than emitting recoverable identifiers onchain.

## The generated project

The scaffold is intentionally a contracts package plus a TypeScript SDK, with Bun tests. There is no bundled API, CLI, or frontend; those belong in your application layer.

```text
aztec-otc-desk/
├── package.json
├── deps/aztec-standards/        # token contract dependency (git submodule)
├── scripts/token.ts
└── packages/
    └── contracts/
        ├── Nargo.toml
        ├── src/main.nr           # the escrow contract
        ├── src/types/config_note.nr
        ├── src/types/state_note.nr
        └── ts/src/
            ├── contract.ts        # deploy, fill, void, event readers
            ├── manifest.ts        # EscrowManifest class
            ├── fees.ts
            ├── constants.ts
            ├── utils.ts
            └── artifacts/         # generated bindings
```

Token amounts use `u128` and the contract is decimal-agnostic: any display or denomination logic belongs in your app, never baked into the contract.

The kit uses [`defi-wonderland/aztec-standards`](https://github.com/defi-wonderland/aztec-standards) as the token implementation. The Noir contract calls that token's concrete methods (`transfer_private_to_private`, `initialize_transfer_commitment`, `transfer_private_to_commitment`), and the SDK exposes capability-named helpers around them: `deployEscrowContract`, `fillOTCOrder`, `voidEscrow`, and `getPrivateTransferAuthwit`. If you switch token standards, inspect the binding and remap both the Noir calls and the helpers.

## Quickstart

With the skills added to your agent and a localnet running, scaffold and build:

```bash
# Your agent runs scaffold-escrow-project, which (after the design intake) creates
# the project, registers the aztec-standards submodule, and installs dependencies.

cd aztec-otc-desk/packages/contracts
bun run build
```

`bun run build` runs the full contract build:

```bash
aztec compile
aztec codegen target --outdir ts/src/artifacts/escrow -f && rm ts/src/artifacts/escrow/Token.ts
bun run scripts/add_artifacts.ts
```

If a build failure needs changes to the Noir, notes, events, token calls, or lifecycle, switch your agent to the `write-escrow-contract` skill.

### Deploying a funded escrow

The default constructor both creates the escrow and funds it with the maker's offered asset in one private transaction. Because the funding authwit must name the escrow as the caller, the SDK computes the final contract instance _before_ creating the authwit, then sends the deployment with that authwit and `additionalScopes` so the deployer can read the escrow's own notes back:

```typescript
const { contract, manifest, creatorRoleSecret } = await deployEscrowContract(
  wallet,
  maker.address,
  sellTokenAddress,
  sellTokenAmount,
  buyTokenAddress,
  buyTokenAmount
);
// `manifest` is the (unencrypted) handoff object; encrypt it before sharing.
// `creatorRoleSecret` is recoverable later from the RoleAdded event.
```

The maker encrypts the `manifest` to the counterparty's public key and shares it. The counterparty registers it and can then read the shared config and state and fill the order.

## The default contract

The OTC contract is a compact illustration of every pattern above. The constructor funds the escrow, records the creator's pseudonym, and opens the order:

```rust
#[external("private")]
#[initializer]
fn constructor(
    sell_token_address: AztecAddress,
    sell_token_amount: u128,
    buy_token_address: AztecAddress,
    buy_token_amount: u128,
    creator_role_secret: Field,
    _nonce: Field,
) {
    let creator = self.msg_sender();
    let creator_pseudonym = Poseidon2::hash([creator.to_field(), creator_role_secret], 2);

    // Maker's receive-side commitment; the escrow itself is the filler,
    // so neither participant's address appears on the receive path.
    let partial_note = self.call(Token::at(buy_token_address)
        .initialize_transfer_commitment(self.address, self.address));

    // Fund the offered asset into escrow-owned private state.
    self.call(Token::at(sell_token_address)
        .transfer_private_to_private(creator, self.address, sell_token_amount, _nonce));

    self.storage.config
        .initialize(ConfigNote::new(
            creator_pseudonym, partial_note,
            sell_token_address, sell_token_amount,
            buy_token_address, buy_token_amount,
        ))
        .deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

    self.storage.state
        .initialize(StateNote::open(), self.address)
        .deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

    self.emit(RoleAdded { secret: creator_role_secret })
        .deliver_to(creator, MessageDelivery.ONCHAIN_UNCONSTRAINED);
}
```

`fill_order` is open to any caller who satisfies the terms. It advances the phase first, then settles atomically: the taker's asset moves into escrow, the escrow completes the maker's receive commitment, and only then does the escrow release the offered asset to the taker. A receipt event records the fill.

```rust
#[external("private")]
fn fill_order(_nonce: Field) {
    let config = self.storage.config.get_note();
    let caller = self.msg_sender();

    self.storage.state
        .replace(|state| state.transition(PHASE_OPEN, PHASE_FILLED), self.address)
        .deliver(MessageDelivery.ONCHAIN_CONSTRAINED);

    self.call(Token::at(config.buy_token_address)
        .transfer_private_to_private(caller, self.address, config.buy_token_amount, _nonce));
    self.call(Token::at(config.buy_token_address)
        .transfer_private_to_commitment(self.address, config.partial_note, config.buy_token_amount, 0));
    self.call(Token::at(config.sell_token_address)
        .transfer_private_to_private(self.address, caller, config.sell_token_amount, 0));

    self.emit(OrderFilled { filled: true })
        .deliver_to(self.address, MessageDelivery.ONCHAIN_CONSTRAINED);
}
```

`void_order` is role-gated: it recomputes the caller's pseudonym from the supplied secret, asserts it matches the stored creator pseudonym, moves the phase to `VOID`, and refunds the offered asset. Possessing the contract key alone is not enough to void.

Deliver contract-owned notes and the escrow-addressed fill receipt with `ONCHAIN_CONSTRAINED`, so a malicious caller cannot brick future readers by withholding the replacement message. Deliver the caller's own `RoleAdded` recovery event with `ONCHAIN_UNCONSTRAINED`.

## Adapting to other escrow shapes

To move beyond the OTC default, change four things together and let the `write-escrow-contract` skill keep them consistent:

- **Phases:** add `ACCEPTED` and/or `SETTLEMENT_IN_PROGRESS` for offchain or delayed flows.
- **Roles:** bind a taker or arbiter pseudonym in `StateNote` when a runtime caller must be remembered.
- **Release condition:** replace atomic token settlement with the proof, signature, oracle, or event check your protocol needs, and add a fallback.
- **Terms:** keep immutable terms and commitments in `ConfigNote`; keep phase, deadlines, and runtime pseudonyms in `StateNote`.

### Design intake

Before scaffolding a fresh project or changing the lifecycle, the skill runs a short intake to avoid wrong protocol assumptions. It confirms:

- the **phase set** (a preset such as Atomic, Accept, or Delayed settlement, or your own list);
- **timing windows** for any accept, settlement, or recovery phases;
- the **config-versus-state split** for any ambiguous fields;
- whether **`OrderFilled`** needs any payload beyond its `filled: true` receipt marker.

Running this in Plan mode keeps the decisions explicit and reviewable.

## Testing

Generated projects use Bun tests against a local Aztec node, with `EmbeddedWallet` and the standard test accounts. Wallets are created ephemeral with proving off by default for speed:

```typescript
const wallet = await EmbeddedWallet.create(node, {
  ephemeral: true,
  pxeConfig: { proverEnabled: false },
});
```

Localnet runs in one terminal, and the contracts package builds and tests in another. `localnet` is a root script; `build`, `typecheck`, and `test` are contracts-package scripts:

```bash
# terminal 1, from the project root
bun run localnet

# terminal 2
cd packages/contracts
bun run build
bun run typecheck
bun run test
```

Full localnet runs take minutes, so iterate with a targeted test (`bun test ... -t "atomic happy path"`) before one full pass. The suite should cover the security-critical paths:

- **Manifest handoff:** a counterparty cannot read shared state until they receive and register the encrypted manifest, and can afterward.
- **Role recovery:** every role-creating call's secret is recoverable from the caller's `RoleAdded` event.
- **Atomic happy path:** funding, fill, balances move correctly, the escrow empties, the phase becomes `FILLED`, and `OrderFilled` carries `filled: true`.
- **Void and refund:** the creator can void an open order and is refunded; filling after a void fails.
- **Negative cases:** a non-creator cannot void even with the contract key; a wrong or reused-by-another-caller role secret fails; duplicate fills fail; voiding after a fill fails; insufficient balance fails.

For offchain delivery flows (zkTLS, zkEmail, payment, locker-code), the kit's testing strategy uses skipped stubs that name the missing verifier and the expected transition. Implement the verifier, then turn the stub into a real test.

## Security and limitations

- **Not audited.** The kit scaffolds a starting point. Review the protocol logic, release conditions, and privacy decisions, and get an independent audit before holding real value. The BAZaar demo is an unaudited proof of concept.
- **Evolving API.** The skills target Aztec v4.2.0 and the code samples here are illustrative. Check the [repository](https://github.com/aztec-pioneers/aztec-private-escrow-skills) for the current API.
- **Keep sensitive plaintexts offchain.** Commit them onchain and deliver them with the same care as key material. Never emit recoverable identifiers in onchain logs.
- **Reading is not authority.** Anyone with the contract secret key can read shared state. Gate every privileged action with a Noir role check.
- **Always provide an exit.** Pair every release condition with a fallback so funds cannot be stranded if a trigger never fires.

## Next steps

- Set up your agent with Aztec context: [AI Tooling](../../ai_tooling.md)
- Learn the underlying primitives: [private state](../foundational-topics/state_management.md), [authwits](../foundational-topics/advanced/authwit.md), and [account keys](../foundational-topics/accounts/keys.md)
- Build a token to escrow against: [Private Token Contract tutorial](../tutorials/contract_tutorials/token_contract.md)
- Drive contracts from TypeScript: [Aztec.js getting started](../tutorials/js_tutorials/aztecjs-getting-started.md)
- Explore the kit: [aztec-private-escrow-skills](https://github.com/aztec-pioneers/aztec-private-escrow-skills) and the [Escrow Kit landing page](https://github.com/AztecProtocol/escrow-landing)
