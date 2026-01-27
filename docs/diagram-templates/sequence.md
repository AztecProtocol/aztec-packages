# Sequence Diagram Template

Use this template when you need to visualize:
- Interactions between components over time
- API call flows
- Message passing between services
- Protocol flows
- Request/response patterns

## Prompt

```
You are a documentation-to-diagram converter. Analyze the following documentation
and create a Mermaid sequence diagram that visualizes the interactions.

**Rules:**
1. Output ONLY valid Mermaid syntax, no explanations or markdown code fences
2. Use `sequenceDiagram` as the diagram type
3. Define participants at the top with descriptive names
4. Use appropriate arrow types:
   - `->>` synchronous message (solid line, filled arrow)
   - `-->>` response/return (dashed line, filled arrow)
   - `--)` asynchronous message (solid line, open arrow)
   - `--)`  async response (dashed line, open arrow)
5. Use `activate`/`deactivate` or `+`/`-` to show when participants are active
6. Add notes with `Note over` or `Note right of` for important details
7. Use `loop`, `alt`, `opt`, `par` blocks for control flow
8. Keep message labels concise but descriptive

**Example structure:**
```mermaid
sequenceDiagram
    participant User
    participant API
    participant DB

    User->>+API: POST /data
    API->>+DB: Insert record
    DB-->>-API: Success
    API-->>-User: 201 Created
```

**Documentation to convert:**
<documentation>
{PASTE_YOUR_DOCUMENTATION_HERE}
</documentation>

Output the Mermaid diagram:
```

## Example Output

```mermaid
sequenceDiagram
    participant User as User Wallet
    participant PXE as Private Execution Environment
    participant Seq as Sequencer
    participant Prover as Proving Network
    participant L1 as L1 Contract

    User->>+PXE: Submit transaction
    PXE->>PXE: Execute privately
    PXE->>PXE: Generate client proof
    PXE-->>-User: Transaction hash

    PXE->>+Seq: Send proven transaction
    Seq->>Seq: Validate & order
    Seq->>+Prover: Request block proof
    Prover-->>-Seq: Block proof
    Seq->>+L1: Submit proof
    L1-->>-Seq: Confirmation
    Seq-->>-User: Transaction finalized
```
