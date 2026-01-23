import React from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

interface ProductCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  link: string;
  features?: string[];
}

export default function ProductCard({ title, description, icon, link, features }: ProductCardProps) {
  return (
    <Link to={link} className={styles.productCardLink}>
      <div className={styles.productCard}>
        <div className={styles.productCardIcon}>{icon}</div>
        <div className={styles.productCardContent}>
          <h3 className={styles.productCardTitle}>{title}</h3>
          <p className={styles.productCardDescription}>{description}</p>
          {features && features.length > 0 && (
            <ul className={styles.productCardFeatures}>
              {features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          )}
        </div>
        <div className={styles.productCardArrow}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
