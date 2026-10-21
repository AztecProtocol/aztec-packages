import React from "react";
import Link from "@docusaurus/Link";
import styles from "./styles.module.css";

const svgProps = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ICONS = {
  // Full node: stacked servers.
  "full-node": (
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <line x1="7" y1="7" x2="7" y2="7" />
      <line x1="7" y1="17" x2="7" y2="17" />
    </svg>
  ),
  // Solo sequencer: a single hexagon (the Aztec motif).
  "solo-sequencer": (
    <svg {...svgProps}>
      <path d="M12 2.5 20 7v10l-8 4.5L4 17V7z" />
    </svg>
  ),
  // Staking provider: linked hexagons standing for delegated nodes.
  provider: (
    <svg {...svgProps}>
      <path d="M8 3 13 5.8v5.4L8 14 3 11.2V5.8z" />
      <path d="M16 10 21 12.8v5.4L16 21l-5-2.8v-5.4z" />
    </svg>
  ),
  // Prover: a processor / proving chip.
  prover: (
    <svg {...svgProps}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" rx="0.5" />
      <line x1="9" y1="3" x2="9" y2="6" />
      <line x1="15" y1="3" x2="15" y2="6" />
      <line x1="9" y1="18" x2="9" y2="21" />
      <line x1="15" y1="18" x2="15" y2="21" />
      <line x1="3" y1="9" x2="6" y2="9" />
      <line x1="3" y1="15" x2="6" y2="15" />
      <line x1="18" y1="9" x2="21" y2="9" />
      <line x1="18" y1="15" x2="21" y2="15" />
    </svg>
  ),
};

const ROLES = [
  {
    id: "full-node",
    title: "Full node",
    badge: "No stake",
    badgeKind: "neutral",
    tagline: "Sync the chain. Read state. Submit txs. Foundation for every other role.",
    facts: [
      { label: "Stake", value: "None" },
      { label: "Hardware", value: "8 core / 8 GB / 1 TB", numeric: true },
      { label: "Reliability", value: "24/7 uptime, stable connection" },
      { label: "Earns", value: "No rewards" },
      { label: "Slashing", value: "No" },
    ],
    bullets: [
      "Trustless local source of network data",
      "Useful for app developers, indexers, and explorers",
      "No on-chain registration required",
    ],
    cta: "Read setup guide",
    href: "/operate/operators/full-node/overview",
  },
  {
    id: "solo-sequencer",
    title: "Solo sequencer",
    badge: "Own stake only",
    badgeKind: "good",
    tagline: "Run a sequencer with your own stake. Earn rewards, attest blocks, signal governance.",
    facts: [
      { label: "Stake", value: "200,000 AZTEC", numeric: true },
      { label: "Hardware", value: "8 core / 8 GB / 1 TB", numeric: true },
      { label: "Reliability", value: "24/7 uptime, stable connection" },
      { label: "Earns", value: "Block rewards" },
      { label: "Slashing", value: "Yes (own stake)" },
    ],
    bullets: [
      "Self-custodied stake",
      "Guided playbook walks you from blank server to attesting",
      "Personalised commands: paste keys / RPCs once, every step auto-fills",
    ],
    cta: "Start guided setup",
    href: "/operate/operators/solo-sequencer/",
  },
  {
    id: "provider",
    title: "Staking provider",
    badge: "For pros",
    badgeKind: "warn",
    tagline: "Run sequencers on behalf of delegators. Manage keys, commission, reward distribution.",
    facts: [
      { label: "Stake", value: "From delegators" },
      { label: "Hardware", value: "8 core / 8 GB / 1 TB per node", numeric: true },
      { label: "Reliability", value: "24/7 uptime, stable connection" },
      { label: "Earns", value: "Commission" },
      { label: "Slashing", value: "Yes (delegator stake)" },
    ],
    bullets: [
      "Accept delegated stake from token holders",
      "Earn a commission percentage on rewards you produce",
      "Adds key-management and commission-tooling complexity",
    ],
    cta: "Start guided setup",
    href: "/operate/operators/provider/",
  },
  {
    id: "prover",
    title: "Prover",
    badge: "Heavy compute",
    badgeKind: "alt",
    tagline: "Generate cryptographic proofs for L2 epochs. Different hardware profile and economics from sequencers.",
    facts: [
      { label: "Stake", value: "None" },
      { label: "Hardware", value: "32+ core / 128+ GB", numeric: true },
      { label: "Reliability", value: "Available during proving" },
      { label: "Earns", value: "Proof rewards" },
      { label: "Slashing", value: "No" },
    ],
    bullets: [
      "Generates the epoch-level proofs the rollup posts to L1",
      "CPU + RAM heavy",
      "Earnings depend on epoch activity, gas, and prover-pool competition",
    ],
    cta: "Read setup guide",
    href: "/operate/operators/prover/overview",
  },
];

function badgeClass(kind) {
  return `${styles.badge} ${styles["badge_" + kind] || ""}`;
}

export default function RolePicker() {
  return (
    <div className={styles.grid}>
      {ROLES.map((role) => (
        <Link
          key={role.id}
          to={role.href}
          className={styles.card}
          aria-label={`${role.title}: ${role.cta}`}
        >
          <div className={styles.head}>
            <div className={styles.icon} aria-hidden>
              {ICONS[role.id]}
            </div>
            <span className={badgeClass(role.badgeKind)}>{role.badge}</span>
          </div>
          <h3 className={styles.title}>{role.title}</h3>
          <p className={styles.tagline}>{role.tagline}</p>

          <dl className={styles.facts}>
            {role.facts.map((f) => (
              <React.Fragment key={f.label}>
                <dt className={styles.factLabel}>{f.label}</dt>
                <dd
                  className={`${styles.factValue} ${f.numeric ? styles.factValueNum : ""}`}
                >
                  {f.value}
                </dd>
              </React.Fragment>
            ))}
          </dl>

          <ul className={styles.bullets}>
            {role.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          <span className={styles.cta}>{role.cta} →</span>
        </Link>
      ))}
    </div>
  );
}
