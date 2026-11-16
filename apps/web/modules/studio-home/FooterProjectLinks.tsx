import styles from "./footer-project-links.module.css";

export function FooterProjectLinks({ replivyLabel }: { replivyLabel: string }) {
  return (
    <div className={styles.links}>
      <p>
        Built by <a href="https://dadakaev.com">DADAKAEV.COM</a>
      </p>
      <a href="https://replivy.com">{replivyLabel}</a>
    </div>
  );
}
