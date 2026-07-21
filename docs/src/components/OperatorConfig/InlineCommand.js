import React, { useState } from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import CodeBlock from '@theme/CodeBlock';
import { useOperatorConfig, substitute } from './context';
import styles from './styles.module.css';

/**
 * <InlineCommand> renders one or more labelled inline inputs plus a code block
 * whose {{TOKEN}} placeholders are filled with whatever the operator types.
 *
 * The values are *not* persisted to the global panel — they live only in this
 * component's local state. Use for one-shot pairings (tx hash → cast receipt
 * extraction, etc.) where keeping the value in the panel would be clutter.
 *
 * Props:
 *   token       — the {{TOKEN}} placeholder name (e.g. 'TX_HASH').
 *   label       — visible input label.
 *   placeholder — input placeholder text.
 *   fields      — alternative to token/label/placeholder: an array of
 *                 { token, label, placeholder } for commands needing more
 *                 than one inline value. A field left empty falls back to
 *                 the panel-backed value for that token, if any.
 *   children    — the command template containing {{TOKEN}} (and any other
 *                 panel-backed tokens like {{ETH_RPC}}, which are still
 *                 substituted from the global config).
 *   language    — code block language tag, default 'bash'.
 */
function InlineCommandInner({ token, label, placeholder, fields, children, language = 'bash' }) {
  const { values, track, sequencerCount, aztecPort, hydrated } = useOperatorConfig();
  const fieldDefs = fields || (token ? [{ token, label, placeholder }] : []);
  const [localValues, setLocalValues] = useState({});

  const raw = typeof children === 'string' ? children : String(children ?? '');
  const trimmed = raw.replace(/^\n/, '').replace(/\n$/, '');

  // Merge filled-in local values into the values dict for this substitution
  // call only. Empty fields are skipped so panel-backed tokens keep their
  // configured value instead of being blanked out.
  const mergedValues = { ...values };
  for (const f of fieldDefs) {
    if (localValues[f.token]) mergedValues[f.token] = localValues[f.token];
  }

  // Rendered unmasked so the standard Docusaurus copy button (which copies the
  // displayed text) yields a runnable command.
  const display = hydrated
    ? substitute(trimmed, mergedValues, { mask: false, track, sequencerCount, aztecPort })
    : trimmed;

  return (
    <div className={styles.inlineCommand}>
      {fieldDefs.map((f) => (
        <div key={f.token} className={styles.inlineCommandField}>
          <label htmlFor={`inline-${f.token}`}>{f.label}</label>
          <input
            id={`inline-${f.token}`}
            type="text"
            value={localValues[f.token] || ''}
            onChange={(e) => setLocalValues((prev) => ({ ...prev, [f.token]: e.target.value }))}
            placeholder={f.placeholder}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ))}
      <CodeBlock language={language}>{display}</CodeBlock>
    </div>
  );
}

export default function InlineCommand(props) {
  return (
    <BrowserOnly fallback={<CodeBlock language={props.language || 'bash'}>{props.children}</CodeBlock>}>
      {() => <InlineCommandInner {...props} />}
    </BrowserOnly>
  );
}
