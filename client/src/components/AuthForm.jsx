import { useState } from 'react';
import { api } from '../api.js';
import { formatPlate } from '../lib/format.js';
import { Button } from './Primitives.jsx';

export function AuthForm({ mode: initialMode = 'signup', initialName = '', withVehicle = true, onDone, onCancel, cancelLabel = 'Not now', toast, autoFocus = true }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [plate, setPlate] = useState('');
  const [fastagId, setFastagId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let r;
      if (mode === 'signup') {
        r = await api.auth.signup({ name: name.trim(), email: email.trim(), password });
        if (withVehicle && plate.replace(/\s/g, '').length >= 4) {
          const v = await api.addVehicle({ plate, fastagId, kind: 'car' }).catch(() => null);
          if (v?.user) r.user = v.user;
        }
      } else {
        r = await api.auth.login({ email: email.trim(), password });
      }
      onDone?.(r.token, r.user);
    } catch (err) {
      setError(err.message || 'Something went wrong');
      if (err.code === 'EMAIL_TAKEN') setMode('login');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form authform" onSubmit={submit}>
      <div className="seg" role="tablist" aria-label="Sign in or create account" style={{ marginTop: 0 }}>
        <button type="button" role="tab" aria-selected={mode === 'signup'} className={`seg-btn ${mode === 'signup' ? 'is-active' : ''}`} onClick={() => setMode('signup')}>
          Create account
        </button>
        <button type="button" role="tab" aria-selected={mode === 'login'} className={`seg-btn ${mode === 'login' ? 'is-active' : ''}`} onClick={() => setMode('login')}>
          Log in
        </button>
      </div>
      {mode === 'signup' ? (
        <div className="field">
          <label className="field-label" htmlFor="au-name">
            Your name
          </label>
          <input id="au-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" autoComplete="name" autoFocus={autoFocus} required minLength={2} />
        </div>
      ) : null}
      <div className="field">
        <label className="field-label" htmlFor="au-email">
          Email
        </label>
        <input id="au-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" autoFocus={autoFocus && mode === 'login'} required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="au-pass">
          Password
        </label>
        <input id="au-pass" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} />
      </div>
      {mode === 'signup' && withVehicle ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="au-plate">
              Number plate (optional)
            </label>
            <input id="au-plate" className="input is-plate" value={plate} onChange={(e) => setPlate(formatPlate(e.target.value))} placeholder="KA 01 AB 1234" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={14} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="au-tag">
              FASTag ID (optional)
            </label>
            <input id="au-tag" className="input is-plate" value={fastagId} onChange={(e) => setFastagId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24))} placeholder="Printed on your windscreen tag" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          </div>
        </>
      ) : null}
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="form-actions">
        <Button type="submit" variant="primary" block loading={busy}>
          {mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
      </div>
      {onCancel ? (
        <Button type="button" variant="ghost" block onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
      ) : null}
    </form>
  );
}
