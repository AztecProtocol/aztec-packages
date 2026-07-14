import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";

if (ExecutionEnvironment.canUseDOM) {
  const React = require("react");
  const ReactDOM = require("react-dom/client");
  const AztecDocsWidget =
    require("@site/src/components/AztecDocsWidget").default;

  const container = document.createElement("div");
  container.id = "docsgpt-widget";
  document.body.appendChild(container);

  const root = ReactDOM.createRoot(container);
  root.render(
    React.createElement(AztecDocsWidget, {
      apiHost: "https://aztec.adjacentpossible.dev",
      apiKey: "44420ab5-6be3-4b30-af35-559c38bfce6d",
      title: "Ask about Aztec",
      heroTitle: "Aztec Docs Assistant",
      heroDescription:
        "Searches Aztec v5.0.0 developer docs, Aztec.nr, aztec.js SDK, protocol circuits, and more.",
      theme: "ink",
      accent: "chartreuse",
      buttonStyle: "symbol",
      size: "roomy",
      position: "br",
      motif: true,
    }),
  );
}
