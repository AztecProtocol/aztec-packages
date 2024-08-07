---
title: References
sidebar_position: 0
---

# References

Welcome to the References section! In this section you will find reference material for developing on Aztec Protocol.

This page lists popular references. Please see the sidebar for them all.


## Popular 

### Smart contracts

<div className="card-container">

  <Card shadow='tl' link='/reference/developer_references/smart_contract_reference/storage/shared_state'>
    <CardHeader>
      <h3>Storage</h3>
    </CardHeader>
    <CardBody>
      A detailed reference for storage types
    </CardBody>
  </Card>

  <Card shadow='tl' link='/reference/developer_references/smart_contract_reference/portals/inbox'>
    <CardHeader>
      <h3>Portals</h3>
    </CardHeader>
    <CardBody>
      A detailed reference for working with portals and L1/L2 communication
    </CardBody>
  </Card>

</div>

### Others

<div className="card-container">

  <Card shadow='tl' link='/reference/developer_references/common_errors/sandbox-errors'>
    <CardHeader>
      <h3>Common Sandbox Errors</h3>
    </CardHeader>
    <CardBody>
      Help debug your sandbox environment
    </CardBody>
  </Card>

  <Card shadow='tl'  link='/reference/developer_references/sandbox_reference/cli_reference'>
    <CardHeader>
      <h3>CLI reference</h3>
    </CardHeader>
    <CardBody>
      A full list of commands for working with the Aztec CLI
    </CardBody>
  </Card>
</div>

<div className="view-all-link">
  <a href="/reference/developer_references/sandbox_reference/cheat_codes">View all references</a>
</div>

<style>
{`
  .card-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.card-container.full-width {
  grid-template-columns: 1fr;
}

@media (min-width: 769px) {
  .card-container:not(.full-width) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.card-link-wrapper {
  display: contents;
}

.card {
  display: flex;
  flex-direction: column;
  height: 100%;
  transition: all 0.3s ease;
}

.card:hover {
  transform: scale(1.02);
}

.card__body {
  flex: 1;
}

.view-all-link {
  text-align: right;
  margin-bottom: 2rem;
}

.view-all-link a {
  font-size: 0.9rem;
  color: var(--ifm-color-primary);
  text-decoration: none;
}
`}
</style>