Historical Consistency: The GSE uses checkpointed history (via the OpenZeppelin Checkpoints library) to answer
questions about which rollup was "latest" at any given timestamp. Removing a rollup could break the ability to
reconstruct historical state, which is critical for governance and dispute resolution.
Attester State: Attesters may have staked on the rollup, and their stake, voting power, and withdrawal rights
are tied to the rollup's existence in the system. Removing the rollup could orphan these stakes or make them
inaccessible.
Bonus Instance Logic: The logic for the "bonus instance" depends on the sequence of rollups. Removing a rollup
could disrupt the correct assignment of attesters and voting power.



#  FULL FLOW
Only GovernanceProposer contract can propose in the Governance contract.
Only current block proposer can signal on a payload when he's the current signaler.
Only block producers can stake in the GSE, and only GSE can vote in Governance, hence only block producers are voting.







### BONUS_INSTANCE_ADDRESS
is a special address used by the latest rollup to access a shared pool of "bonus" attesters.
When a rollup is the latest, it gets access to both its own attesters and these bonus attesters.
When it's no longer the latest, it loses access to the bonus attesters which automatically transfer
to the new latest rollup.

Its purpose is to allow the most recently added rollup to immediately benefit from a pool of attesters
(and their voting power) without requiring those attesters to manually exit the old rollup and re-deposit
into the new one.

### ATTESTERS
are special participants who stake tokens to a rollup instance and play a critical role in the protocol’s
security and governance.


### The OpenZeppelin Checkpoints library
is a Solidity utility that allows you to efficiently record and query the value of a variable (such as a balance,
voting power, or supply) at different points in time—specifically, at different block numbers or timestamps.
This is especially useful for on-chain governance, voting, and historical queries.



# GSECore
- In the code docs mention that attester is the block proposer and ideally put that everywhere in attester argument
docs (helpful if a reader lands just on this one function and doesn't have wider context).
The fact that GSECore doesn't care about the concept of block proposer doesn't matter as the goal of docs is to
make the reader understand it.

- Would put a note in the docs on the attester/withdrawer address separation - readers might already know ethereum staking
so would mention that it's like staking and

- In the contract we have staking asset and we deposit deposit amount of staking asset into the contract.
Then when withdrawing the withdraw amount of the staking asset has to be bigger than MINIMUM_STAKE.
We are for no reason using here 2 terms (deposit and stake) to mean the same thing.
Would either altogether drop the word stake from the contract or the word deposit
(i.e. rename STAKING_ASSET to DEPOSIT_ASSET and MINIMUM_STAKE to MINIMUM_DEPOSIT)

BONUS_INSTANCE_ADDRESS
-> I don't really like the name as it's not descriptive.
-> Would rename this to LATEST_INSTANCE_POINTER_ADDRESS

## constructor

There is arg description that reads as:
"   * @param __owner - The owner of the GSE."

Who is typically the owner of the GSE in Aztec's mainnet deployment? Docs like this ^ are useless.

## setGovernance
## addRollup
- Sometimes the same thing is either called an instance or a rollup.
Using 2 names to mean point to the same things is unnecessary complexity.

## deposit
- in other place the _onBonus flag is still called _onCanonical. Look for all the occurrences
of _onCanonical and rename it. I would just rename it to `_pointToLatestInstance`

- I think it needs clarifying in the code docs what happens with the delegation here.
It is the case that deposit function will only ever be called once with a given [instance, attester] pair, right?
And for this reason the delegatee will always be zero in this function?

- what I also found a bit strange that in the function we first call DelegationLib.delegate and then right after increaseBalance
and internally `delegate(...)` moves all voting power and `increaseBalance` moves the `amount` of voting power.
Given that we have only 1 callsite of `increaseBalance` I think it would make sense to instead have increaseBalanceAndDelegate
that would move the voting power only once by internally calling delegate. Open to discussion here though. My it's just my taste.

## withdraw

TODO:
How is voting power in `delegation` handled?
Why is it fine to delegate the voting power to address zero when withdrawing?

## finaliseHelper
- would call this finaliseWithdraw instead as finaliseHelper is not really descriptive


## proposeWithLock

## delegate

TODO: What was the reasoning for having delegate function of GSE be callable by the withdrawer instead of attester?
My mental model of attester was that of Ethereum's validating keys which are expected to be hot and of withdrawer
to be cold storage keys to which you only withdraw.

## vote

## voteWithBonus
- Has it been considered that it's a quite cumbersome that the instance cannot vote with the full voting power
delegated to it? (e.g. bonus + the one associated to the instance directly)
Or is the idea that this is fine because it is expected that all the block proposers will basically choose
to follow the bonus instance?

If the instance wanting to use its full voting power than it would need to handle the calls to GSE::vote
and GSE::voteWithBonus on its own which feels like an incorrect complexity leak from GSE to the instance itself.



# DelegationLib.sol
Agree with the TODO in the beginning that the naming should be changed (there are 4 TODOs in the governance dir - should be addressed before audit)

Since it's inspired by OpenZeppelin's `Votes.sol` with the difference of our lib supporting multiple completely separate
voting sets maybe we could call it `MultiVotes` and explain why it's called "Multi" in the code docs (i.e. that we track voting per instance).

Functions and structs documentation.

## allowing for zero address in moveVotingPower feels strange (especially for "from" address)
Being able to call the function with zero "from" address is weird as it implies you are moving voting power from zero address.
It would improve readability if we had mintVotingPower, burnVotingPower and use those instead.


## Weird struct naming
We have there a few structs in which we use the User struct and then it looks e.g. something like `User supply` or `User votingPower`.
Why call something that is representing a user power a user? Just call it UserPower.

## What is a balance and what is a voting power
We have there `increaseBalance` function that increases the voting power and it also automatically delegates it.
We don't have there explained the difference between balance and a voting power.
Does it even make sense to have these as 2 separate concepts? And balance of what it even is?
This needs to be explained.

## usePower function

"Use power on a specific proposal and use its time as balance"

I don't understand this ^




# Governance

Broken comment in `proposeWithLock` function:
"""
   * @dev We don't actually need to check available power here, since if the msg.sender does not have
   * sufficient balance, the .
"""

The struct fields of IGovernance::ProposeConfiguration and IGovernance::Configuration are documented in code docs of Governance.sol instead of in the struct itself.
That makes the info hard to find.
