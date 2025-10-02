import React from "react";
import Link from "@docusaurus/Link";
import useBaseUrl from "@docusaurus/useBaseUrl";
import { translate } from "@docusaurus/Translate";
import ThemedImage from "@theme/ThemedImage";
import styles from "./styles.module.css";

export default function HomeBreadcrumbItem() {
  const homeHref = useBaseUrl("/");
  const lightLogoSrc = useBaseUrl("img/Aztec Symbol_Light.png");
  const darkLogoSrc = useBaseUrl("img/Aztec_Symbol_Dark.png");
  return (
    <li className="breadcrumbs__item" itemProp="itemListElement">
      <Link
        aria-label={translate({
          id: "theme.docs.breadcrumbs.home",
          message: "Home page",
          description: "The ARIA label for the home page in the breadcrumbs",
        })}
        className="breadcrumbs__link"
        to={homeHref}
      >
        <ThemedImage
          className={styles.breadcrumbHomeIcon}
          alt="Home"
          sources={{ light: darkLogoSrc, dark: lightLogoSrc }}
        />
      </Link>
    </li>
  );
}
