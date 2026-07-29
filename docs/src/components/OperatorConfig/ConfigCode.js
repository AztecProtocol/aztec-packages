import React from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import CodeBlock from '@theme/CodeBlock';
import { useOperatorConfig, substitute } from './context';

function ConfigCodeInner({ children, language = 'bash', title }) {
  const { values, track, sequencerCount, aztecPort, hydrated } = useOperatorConfig();

  const raw = typeof children === 'string' ? children : String(children ?? '');
  const trimmed = raw.replace(/^\n/, '').replace(/\n$/, '');

  // Rendered unmasked so the standard Docusaurus copy button (which copies the
  // displayed text) yields a runnable command. Secrets stay masked in the
  // configuration panel's inputs, not in code blocks.
  const display = hydrated
    ? substitute(trimmed, values, { mask: false, track, sequencerCount, aztecPort })
    : trimmed;

  return <CodeBlock language={language} title={title}>{display}</CodeBlock>;
}

export default function ConfigCode(props) {
  return <BrowserOnly fallback={<CodeBlock language={props.language || 'bash'}>{props.children}</CodeBlock>}>
    {() => <ConfigCodeInner {...props} />}
  </BrowserOnly>;
}
