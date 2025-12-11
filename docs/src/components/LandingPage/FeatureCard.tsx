import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  link?: string;
}

export default function FeatureCard({ title, description, icon, link }: FeatureCardProps) {
  const content = (
    <div className={styles.featureCard}>
      <div className={styles.featureCardIcon}>{icon}</div>
      <h4 className={styles.featureCardTitle}>{title}</h4>
      <p className={styles.featureCardDescription}>{description}</p>
    </div>
  );

  if (link) {
    return (
      <Link to={link} className={styles.featureCardLink}>
        {content}
      </Link>
    );
  }

  return content;
}
