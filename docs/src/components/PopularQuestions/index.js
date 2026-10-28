import React from "react";
import Link from "@docusaurus/Link";
import styles from "./styles.module.css";

const QUESTIONS = [
  {
    id: "identity-model",
    title: "Identity model",
    subText: "Which keys earn rewards, which are slashable, which can be rotated",
    href: "/operate/operators/concepts/identity-model",
  },
  {
    id: "l1-rpc",
    title: "L1 RPC requirements",
    subText: "Supernode flags, hosted vs self-hosted, polling tuning",
    href: "/operate/operators/concepts/l1-rpc",
  },
  {
    id: "hardware",
    title: "Hardware spec",
    subText: "Per-role minimums plus the operator-community gotchas",
    href: "/operate/operators/concepts/hardware",
  },
  {
    id: "claiming-rewards",
    title: "Claiming rewards",
    subText: "Where rewards live, when they show up, the multi-rollup case",
    href: "/operate/operators/concepts/claiming-rewards",
  },
  {
    id: "slashing",
    title: "Slashing",
    subText: "What gets you slashed, thresholds, the veto council, recovery",
    href: "/operate/operators/concepts/slashing",
  },
  {
    id: "monitoring",
    title: "Monitoring and metrics",
    subText: "The five metrics that matter and what to alert on",
    href: "/operate/operators/concepts/monitoring",
  },
];

export default function PopularQuestions() {
  return (
    <div className={styles.grid}>
      {QUESTIONS.map((q) => (
        <Link
          key={q.id}
          to={q.href}
          className={styles.card}
          aria-label={`${q.title}: read more`}
        >
          <h3 className={styles.title}>{q.title}</h3>
          <p className={styles.subText}>{q.subText}</p>
          <span className={styles.cta}>Read more →</span>
        </Link>
      ))}
    </div>
  );
}
