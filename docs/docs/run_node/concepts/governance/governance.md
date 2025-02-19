---
id: governance
sidebar_position: 3
title: Governance Overview
---

import Image from "@theme/IdealImage";

This diagram outlines how governance works on Aztec:

<Image img={require("/img/governance.png")} />

Sequencers put forward, or “nominate”, proposals for voting by the Aztec citizens. To do this, sequencers interact with the Governance Proposer smart contract. Nominations are “signals” by sequencers that they wish to put up for vote the execution of certain code by the Governance smart contract. 

If the Governance Proposer smart contract records a certain number of nominations/signals from sequencers, then the Governance Proposer smart contract initiates a voting process where any holders of any Hypothetical Assets (as defined below) can participate. Holders of such Hypothetical Assets are called Aztec citizens. 

All voting and signalling happen on the L1. 
