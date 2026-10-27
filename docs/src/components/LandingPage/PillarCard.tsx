import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

interface PillarCardProps {
  index: string;
  title: string;
  description: string;
  link: string;
  linkLabel?: string;
}

export default function PillarCard({
  index,
  title,
  description,
  link,
  linkLabel = 'Learn more',
}: PillarCardProps) {
  return (
    <Link to={link} className={styles.pillarCardLink}>
      <div className={styles.pillarCard}>
        <span className={styles.pillarIndex}>{index}</span>
        <h3 className={styles.pillarTitle}>{title}</h3>
        <p className={styles.pillarDescription}>{description}</p>
        <span className={styles.pillarAction}>
          {linkLabel}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
