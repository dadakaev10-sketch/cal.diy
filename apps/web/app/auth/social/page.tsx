import styles from "../../../modules/auth/studio-auth.module.css";
import StudioSocialCompletion from "../../../modules/auth/studio-social-completion";
import StudioSocialDelete from "../../../modules/auth/studio-social-delete";
export const metadata = { title: "Sign in | Fixmit", robots: { index: false, follow: false } };
export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; link?: string; linked?: string; delete?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <a className={styles.brand} href="/">
          <img src="/api/logo?brand=fixmit" alt="Fixmit" width={210} height={70} />
        </a>
        {params.delete === "1" ? (
          <StudioSocialDelete />
        ) : (
          <StudioSocialCompletion
            error={
              params.error
                ? params.error === "account_link_required"
                  ? params.error
                  : "signin_failed"
                : undefined
            }
            link={params.link === "1"}
            linked={params.linked === "1"}
          />
        )}
      </section>
    </main>
  );
}
