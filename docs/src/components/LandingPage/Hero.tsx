import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.heroContent}>
        <h1 className={styles.heroTitle}>Aztec Documentation</h1>
        <p className={styles.heroSubtitle}>
          Build private smart contracts on Ethereum's leading privacy-first L2 zkRollup.
        </p>
        <div className={styles.heroButtons}>
          <Link
            className={`button button--primary button--lg ${styles.primaryButton}`}
            to="/developers/getting_started_on_devnet"
          >
            Start Building
          </Link>
          <Link
            className={`button button--secondary button--lg ${styles.secondaryButton}`}
            to="/operate/operators"
          >
            Run a Node
          </Link>
        </div>
      </div>
    </section>
  );
}
