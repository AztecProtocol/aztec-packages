# State Diagram Template

Use this template when you need to visualize:
- State machines
- Object lifecycle
- Status transitions
- Workflow states
- Protocol states

## Prompt

```
You are a documentation-to-diagram converter. Analyze the following documentation
and create a Mermaid state diagram that visualizes the states and transitions.

**Rules:**
1. Output ONLY valid Mermaid syntax, no explanations or markdown code fences
2. Use `stateDiagram-v2` as the diagram type
3. Define states with meaningful names
4. Use `[*]` for start and end states
5. Label transitions with the triggering event/action
6. Use composite states for nested state machines
7. Use `note` to add important context
8. Use `<<choice>>` for decision points
9. Use `<<fork>>` and `<<join>>` for parallel states

**Example structure:**
```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Processing: submit
    Processing --> Success: complete
    Processing --> Failed: error
    Success --> [*]
    Failed --> Idle: retry
```

**Documentation to convert:**
<documentation>
{PASTE_YOUR_DOCUMENTATION_HERE}
</documentation>

Output the Mermaid diagram:
```

## Example Output

```mermaid
stateDiagram-v2
    [*] --> Pending: Transaction created

    state Pending {
        [*] --> Simulating
        Simulating --> Proven: simulation passed
        Simulating --> Rejected: simulation failed
        Proven --> [*]
    }

    Pending --> InMempool: submitted to network

    state InMempool {
        [*] --> Waiting
        Waiting --> Selected: picked by sequencer
    }

    InMempool --> InBlock: included in block
    InMempool --> Dropped: expired/replaced

    state InBlock {
        [*] --> Proving
        Proving --> Verified: proof valid
    }

    InBlock --> Finalized: block proven on L1

    Finalized --> [*]
    Dropped --> [*]
    Rejected --> [*]

    note right of Pending: Client-side processing
    note right of InMempool: Network processing
    note right of InBlock: Block production
```
