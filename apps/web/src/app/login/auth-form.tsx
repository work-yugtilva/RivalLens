'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export function AuthForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData, mode: 'signIn' | 'signUp') {
    setPending(true);
    setError(undefined);
    setNotice(undefined);

    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const supabase = createBrowserSupabaseClient();
    const result =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });

    setPending(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    if (mode === 'signUp' && !result.data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
      return;
    }

    router.replace('/onboarding');
    router.refresh();
  }

  return (
    <form
      action={(formData: FormData) => submit(formData, 'signIn')}
      style={{ display: 'grid', gap: 12, maxWidth: 360 }}
    >
      <label>
        Email
        <input required name="email" type="email" autoComplete="email" style={{ display: 'block', width: '100%' }} />
      </label>
      <label>
        Password
        <input
          required
          minLength={8}
          name="password"
          type="password"
          autoComplete="current-password"
          style={{ display: 'block', width: '100%' }}
        />
      </label>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <Button disabled={pending} type="submit">
        {pending ? 'Working…' : 'Sign in'}
      </Button>
      <Button disabled={pending} formAction={(formData: FormData) => submit(formData, 'signUp')} type="submit">
        Create account
      </Button>
    </form>
  );
}
