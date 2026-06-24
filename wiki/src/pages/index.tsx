import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <main style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '80vh',
        gap: '1rem',
      }}>
        <h1>{siteConfig.title}</h1>
        <p style={{fontSize: '1.25rem', color: 'var(--ifm-color-emphasis-600)'}}>{siteConfig.tagline}</p>
        <Link className="button button--primary button--lg" to="/docs/product-research">
          Go to Docs
        </Link>
      </main>
    </Layout>
  );
}
