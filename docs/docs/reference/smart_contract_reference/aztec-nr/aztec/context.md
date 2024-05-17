# Context

## Fields
| Field | Type |
| --- | --- |
| private | Option&lt;&mut PrivateContext&gt; |
| public | Option&lt;&mut PublicContext&gt; |
| avm | Option&lt;&mut AvmContext&gt; |

## Methods

### private

```rust
Context::private(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PrivateContext |

### public

```rust
Context::public(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut PublicContext |

### avm

```rust
Context::avm(context);
```

#### Parameters
| Name | Type |
| --- | --- |
| context | &mut AvmContext |

### none

```rust
Context::none();
```

Takes no parameters.

