---
title: Get started
description: A step-by-step path for new Aztec users - get a wallet, fund your account, make your first private transaction, and explore apps.
displayed_sidebar: participateSidebar
---

# Get started on Aztec

New to Aztec and want to use the network, not build on it? This page is the ordered path: get a wallet, fund your account, make your first private transaction, explore apps, and stay safe along the way.

:::caution Alpha network
Aztec is in its **Alpha** phase, a live mainnet where bugs, including critical ones, are expected. Use small amounts, and read the [Alpha Network](/participate/alpha) page before you start.
:::

## 1. Understand what you are using

Aztec is a privacy-first Layer 2 network on Ethereum. In practice that means:

- Your transactions are proven correct **on your own device**, so your private data never leaves it. The network only sees a proof.
- Apps and users choose what stays private (like balances, identities, and amounts) and what is public.
- Aztec settles to Ethereum, so it inherits Ethereum's security while transactions stay cheap and private.

For a 90-second explainer, watch the video on the [Participate overview](/participate). For more depth, the [Basics of Aztec](/participate/basics/transactions) pages explain how it all works.

## 2. Get a wallet

You need an Aztec wallet. Aztec wallets are different from Ethereum wallets: they manage your private state and generate proofs on your device, so an Ethereum-only wallet is not enough on its own.

- [**Azguard**](https://azguardwallet.io/) is a browser extension wallet, and currently the wallet to use for interacting with Aztec apps from your browser. It connects to Aztec apps the same way MetaMask connects to Ethereum apps: a website requests a connection, and you approve it in the extension.
- More wallets are appearing as the ecosystem grows. Find the current list in the Wallets category of the [Aztec ecosystem page](https://aztec.network/projects).

These are early-stage products on an early-stage network, so expect rough edges.

:::caution Install from official sources only
Fake wallet extensions are a common scam. Open wallet download pages from the [ecosystem page](https://aztec.network/projects) or the wallet team's official channels, never from search ads or links sent to you in chat. See [Staying safe](/participate/safety).
:::

The [Wallets](/participate/basics/wallets) page explains what makes Aztec wallets different and how to choose one.

## 3. Fund your account

Aztec is a Layer 2, so assets come in from Ethereum through bridges:

- **Bridge apps** walk you through depositing from Ethereum. [Shield](https://shield.human.tech/) bridges assets into Aztec, including converting $AZTEC into **Fee Juice**, the network's fee asset. Find the current list of bridges on the [ecosystem page](https://aztec.network/projects).
- **Some wallets and apps** include funding flows directly, so check your wallet first.

Transaction fees are paid in Fee Juice, which you get by bridging $AZTEC from Ethereum (bridge apps handle this for you). Many apps also sponsor fees for their users through fee-paying contracts, so you can often start transacting without any Fee Juice of your own. See [Fees](/participate/basics/fees) for how to get Fee Juice and [Bridging](/participate/basics/bridging) for what happens under the hood.

## 4. Make your first transaction

Once your wallet holds funds, try a private transfer:

1. **Receive**: share your Aztec address (or your wallet's payment link or QR code) with the sender. Incoming private transfers are visible only to you.
2. **Send**: enter the recipient's address and amount in your wallet and confirm. Your wallet generates a proof on your device before submitting, so the first transaction can take a little longer than you may be used to.
3. **Check the result**: your wallet shows the transaction status. You can also look it up on a block explorer like [Aztecscan](https://aztecscan.xyz), keeping in mind that private details (sender, recipient, amount) are not visible there, which is the point.

The [Transactions](/participate/basics/transactions) page explains what happens behind the scenes.

## 5. Explore apps

Payments, trading, collectibles, and more are live on Aztec, with new apps launching regularly. See [Explore apps](/participate/apps) for what you can try today and where to find the up-to-date list.

## Stay safe

Three rules cover most risks:

1. Never share your seed phrase or private keys with anyone, ever.
2. Only open wallets, bridges, and apps from links on the [official ecosystem page](https://aztec.network/projects) or other [official Aztec channels](/participate/safety#official-aztec-links).
3. Treat Alpha as early software: start with small amounts.

Read [Staying safe](/participate/safety) for the full list of official links and common scams to avoid.

## Get help

- The [Aztec Discord](https://discord.gg/aztec) is the fastest place to ask questions.
- The [Aztec forum](https://forum.aztec.network/) is best for longer discussions.
- For wallet or app issues, check that project's own support channels, linked from the [ecosystem page](https://aztec.network/projects).
- Found a security vulnerability? Report it privately following the [security disclosure process](/participate/alpha#security-disclosures), not in public channels.

## Key terms in plain language

| Term | Meaning |
|------|---------|
| **Layer 2 (L2) / rollup** | A network that runs on top of Ethereum (Layer 1), batching many transactions and posting proofs to Ethereum for security |
| **Mainnet vs testnet** | Mainnet uses real assets; testnet is a free practice network. Aztec's live mainnet phase is called Alpha |
| **Note** | A piece of private state, like a private "coin" only you can see and spend |
| **PXE** | Private eXecution Environment: the part of your wallet that runs private transactions and generates proofs on your device |
| **Mana** | Aztec's unit of computational work, like Ethereum's gas |
| **$AZTEC / Fee Juice** | $AZTEC is the network's token on Ethereum, used for fees, staking, and governance. Fee Juice is the non-transferable fee asset created on Aztec by bridging $AZTEC |
| **Sequencer** | A network operator that orders transactions into blocks |
| **Prover** | A network operator that generates the proofs posted to Ethereum |
| **Bridge / portal** | The mechanism that moves assets between Ethereum and Aztec |
| **Epoch** | A batch of blocks proven together before settling on Ethereum |

---

:::tip Want to go deeper?
Learn how the network operates in [Basics of Aztec](/participate/basics/addresses), or read about the [$AZTEC token](/participate/token) and [governance](/participate/governance).
:::
