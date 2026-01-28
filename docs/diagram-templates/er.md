# Entity-Relationship Diagram Template

Use this template when you need to visualize:
- Data models
- Database schemas
- Entity relationships
- Domain models
- Data structures

## Prompt

```
You are a documentation-to-diagram converter. Analyze the following documentation
and create a Mermaid ER diagram that visualizes the data relationships.

**Rules:**
1. Output ONLY valid Mermaid syntax, no explanations or markdown code fences
2. Use `erDiagram` as the diagram type
3. Define entities in UPPERCASE or PascalCase
4. Use proper cardinality notation:
   - `||--||` one to one
   - `||--o{` one to zero or more
   - `||--|{` one to one or more
   - `o{--o{` zero or more to zero or more
5. Add attributes to entities when relevant:
   ```
   ENTITY {
       type attribute_name PK "comment"
       type attribute_name FK
       type attribute_name
   }
   ```
6. Label relationships with descriptive verbs
7. Group related entities logically

**Attribute types:** string, int, bool, date, timestamp, uuid, etc.
**Key indicators:** PK (primary key), FK (foreign key), UK (unique key)

**Example structure:**
```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "is in"

    USER {
        uuid id PK
        string email UK
        string name
    }
```

**Documentation to convert:**
<documentation>
{PASTE_YOUR_DOCUMENTATION_HERE}
</documentation>

Output the Mermaid diagram:
```

## Example Output

```mermaid
erDiagram
    CONTRACT ||--o{ NOTE : contains
    NOTE ||--|| NOTE_HASH : "hashes to"
    NOTE }o--|| NULLIFIER : "nullified by"
    CONTRACT ||--o{ PUBLIC_STATE : stores
    TRANSACTION ||--|{ NOTE : creates
    TRANSACTION ||--o{ NULLIFIER : produces

    CONTRACT {
        bytes32 address PK
        bytes32 class_id FK
        bytes32 portal_address
    }

    NOTE {
        bytes32 commitment PK
        bytes32 contract_address FK
        int storage_slot
        bytes content
    }

    NOTE_HASH {
        bytes32 hash PK
        int block_number
        int leaf_index
    }

    NULLIFIER {
        bytes32 value PK
        int block_number
    }

    PUBLIC_STATE {
        bytes32 contract_address PK
        int slot PK
        bytes32 value
    }

    TRANSACTION {
        bytes32 hash PK
        int block_number
        bytes32 origin
    }
```
