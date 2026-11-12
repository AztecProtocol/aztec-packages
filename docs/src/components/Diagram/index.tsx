import React from 'react';
import ThemedImage from '@theme/ThemedImage';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';

interface DiagramProps {
  /** Base file name under static/img/diagrams, without extension. */
  name: string;
  alt: string;
}

/**
 * Brand explainer diagram with light and dark variants
 * (static/img/diagrams/NAME.svg and NAME-dark.svg).
 */
export default function Diagram({ name, alt }: DiagramProps) {
  return (
    <ThemedImage
      className={styles.diagram}
      alt={alt}
      sources={{
        light: useBaseUrl(`/img/diagrams/${name}.svg`),
        dark: useBaseUrl(`/img/diagrams/${name}-dark.svg`),
      }}
    />
  );
}
