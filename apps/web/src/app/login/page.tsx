import { AuthForm } from './auth-form';

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 720, margin: '4rem auto', padding: '0 1.5rem' }}>
      <h1>Sign in to RivalLens</h1>
      <AuthForm />
    </main>
  );
}
