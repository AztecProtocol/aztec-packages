import Link from '@docusaurus/Link';
import styles from './styles.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <svg
        className={styles.heroSymbol}
        viewBox="0 0 207.161 207.161"
        aria-hidden="true"
        focusable="false"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M103.581 0L207.161 103.581L103.581 207.161L0 103.581L103.581 0ZM103.581 25.896L181.266 103.581L103.581 181.267L25.8951 103.581L103.581 25.896ZM155.371 103.579L103.581 51.7883L51.7903 103.579L103.581 155.369L155.371 103.579ZM129.476 103.579L103.581 77.6843L77.6854 103.579L103.581 129.475L129.476 103.579Z"
          fill="currentColor"
        />
      </svg>
      <div className={styles.heroContent}>
        <p className={styles.heroEyebrow}>Aztec documentation</p>
        <h1 className={styles.heroTitle}>Build unstoppable private apps.</h1>
        <p className={styles.heroSubtitle}>
          Aztec is a decentralized Ethereum L2 with fully programmable privacy.
          Private functions run and prove on the user's device, public functions
          run on the network, and you decide which is which. Build freely. Stay
          private.
        </p>
        <div className={styles.heroButtons}>
          <Link
            className={`button button--primary button--lg ${styles.primaryButton}`}
            to="/developers/getting_started_on_local_network"
          >
            Start building
          </Link>
          <Link
            className={`button button--secondary button--lg ${styles.secondaryButton}`}
            to="/operate/operators"
          >
            Run a node
          </Link>
        </div>
      </div>
    </section>
  );
}
