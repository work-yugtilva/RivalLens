import Link from 'next/link';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>RivalLens foundation</h1>
      <p>The Phase 0 tenant and authorization foundation is ready for local development.</p>
      <Link href="/login">Sign in</Link>
    </main>
  );
}
