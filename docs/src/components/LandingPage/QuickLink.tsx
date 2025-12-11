import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

interface QuickLinkProps {
  title: string;
  description: string;
  link: string;
  icon?: React.ReactNode;
}

export default function QuickLink({ title, description, link, icon }: QuickLinkProps) {
  return (
    <Link to={link} className={styles.quickLinkWrapper}>
      <div className={styles.quickLink}>
        {icon && <div className={styles.quickLinkIcon}>{icon}</div>}
        <div className={styles.quickLinkContent}>
          <span className={styles.quickLinkTitle}>{title}</span>
          <span className={styles.quickLinkDescription}>{description}</span>
        </div>
        <svg className={styles.quickLinkArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
