import { useCallback, useEffect, useState } from 'react';
import { hasStoredSession, isConfigured } from '../lib/supabase';
import { savedCount } from '../lib/store';

type Phase =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'signed-out' }
  | { kind: 'sending' }
  | { kind: 'sent'; email: string }
  | { kind: 'signed-in'; email: string; count: number }
  | { kind: 'error'; message: string };

export default function AuthPanel() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [email, setEmail] = useState('');

  const runSync = useCallback(async () => {
    const { syncNow } = await import('../lib/sync');
    const result = await syncNow();

    if (result.state === 'synced') {
      setPhase({
        kind: 'signed-in',
        email: result.email ?? '',
        count: result.count ?? 0,
      });
    } else if (result.state === 'error') {
      setPhase({ kind: 'error', message: result.message ?? '알 수 없는 오류' });
    } else {
      setPhase({ kind: 'signed-out' });
    }
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setPhase({ kind: 'off' });
      return;
    }

    // 매직 링크로 돌아오면 주소에 토큰이 담겨 있다. 그 경우에도 세션을 확인해야 한다.
    const returning = window.location.hash.includes('access_token');

    if (!hasStoredSession() && !returning) {
      setPhase({ kind: 'signed-out' });
      return;
    }
    void runSync();
  }, [runSync]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const address = email.trim();
      if (!address) return;

      setPhase({ kind: 'sending' });
      const { sendMagicLink } = await import('../lib/sync');
      const { error } = await sendMagicLink(address);

      if (error) setPhase({ kind: 'error', message: error });
      else setPhase({ kind: 'sent', email: address });
    },
    [email]
  );

  const onSignOut = useCallback(async () => {
    const { signOut } = await import('../lib/sync');
    await signOut();
    setPhase({ kind: 'signed-out' });
  }, []);

  // 로그인 설정이 없으면 아무것도 그리지 않는다. 사이트는 로컬 저장만으로 동작한다.
  if (phase.kind === 'off') return null;

  if (phase.kind === 'loading') {
    return <div className="auth-box auth-quiet">계정 확인 중…</div>;
  }

  if (phase.kind === 'signed-in') {
    return (
      <div className="auth-box auth-in">
        <div>
          <p className="auth-title">{phase.email}</p>
          <p className="auth-sub">
            개념 {phase.count}개가 계정에 저장되어 있습니다. 다른 기기에서도 같은
            목록이 보입니다.
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={onSignOut}>
          로그아웃
        </button>
      </div>
    );
  }

  if (phase.kind === 'sent') {
    return (
      <div className="auth-box auth-quiet" role="status">
        <p className="auth-title">{phase.email}로 링크를 보냈습니다.</p>
        <p className="auth-sub">
          메일함에서 링크를 누르면 로그인됩니다. 지금 이 브라우저에 저장된 기록은
          로그인할 때 계정으로 합쳐집니다. 메일이 안 보이면 스팸함도 확인해 주세요.
        </p>
      </div>
    );
  }

  const local = typeof window === 'undefined' ? 0 : savedCount();

  return (
    <form className="auth-box" onSubmit={onSubmit}>
      <div className="auth-copy">
        <p className="auth-title">여러 기기에서 이어 보려면</p>
        <p className="auth-sub">
          {local > 0
            ? `지금 이 브라우저에 저장된 ${local}개는 로그인하면 계정으로 옮겨집니다. 사라지지 않습니다.`
            : '이메일만 넣으면 됩니다. 비밀번호는 만들지 않습니다.'}
        </p>
      </div>

      <div className="auth-row">
        <input
          type="email"
          className="auth-input"
          placeholder="이메일 주소"
          value={email}
          required
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          aria-label="이메일 주소"
        />
        <button
          type="submit"
          className="btn-save"
          disabled={phase.kind === 'sending'}
        >
          {phase.kind === 'sending' ? '보내는 중…' : '로그인 링크 받기'}
        </button>
      </div>

      {phase.kind === 'error' && (
        <p className="auth-error" role="alert">
          {phase.message}
        </p>
      )}
    </form>
  );
}
