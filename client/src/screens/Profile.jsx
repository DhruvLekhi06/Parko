import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { Button, ErrorState, ScreenHeader, Skeleton, Toggle, EmptyState } from '../components/Primitives.jsx';
import { rupees, formatPlate, dateLabel, clock, minutes as fmtMinutes } from '../lib/format.js';

export function UserForm({ initial, onSaved, submitLabel = 'Save changes', extra = null, autoFocus = false }) {
  const [name, setName] = useState(initial?.name || '');
  const [plate, setPlate] = useState(formatPlate(initial?.plate || ''));
  const [needsEv, setNeedsEv] = useState(!!initial?.prefs?.needsEv);
  const [needsAccessible, setNeedsAccessible] = useState(!!initial?.prefs?.needsAccessible);
  const [state, setState] = useState('idle');
  const { toast } = useApp();

  useEffect(() => {
    if (!initial) return;
    setName(initial.name || '');
    setPlate(formatPlate(initial.plate || ''));
    setNeedsEv(!!initial.prefs?.needsEv);
    setNeedsAccessible(!!initial.prefs?.needsAccessible);
  }, [initial]);

  const submit = async (e) => {
    e.preventDefault();
    setState('saving');
    try {
      const u = await api.updateMe({ name: name.trim(), plate: plate.trim(), prefs: { ...(initial?.prefs || {}), needsEv, needsAccessible, vehicle: initial?.prefs?.vehicle || 'car' } });
      setState('saved');
      onSaved?.(u || { ...(initial || {}), name, plate, prefs: { needsEv, needsAccessible } });
      window.setTimeout(() => setState('idle'), 1800);
    } catch (err) {
      setState('idle');
      toast(err.message, { kind: 'error' });
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="f-name">
          Your name
        </label>
        <input id="f-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" autoComplete="name" autoFocus={autoFocus} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="f-plate">
          Number plate
        </label>
        <input id="f-plate" className="input is-plate" value={plate} onChange={(e) => setPlate(formatPlate(e.target.value))} placeholder="KA 01 AB 1234" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={14} />
        <span className="field-hint">Shown on your parking ticket.</span>
      </div>
      <div>
        <div className="field-label">Preferences</div>
        <Toggle id="f-ev" label="I need EV charging" hint="We'll pick a charging slot for you" checked={needsEv} onChange={setNeedsEv} />
        <Toggle id="f-acc" label="I need an accessible slot" hint="Closest to the entrance, extra room" checked={needsAccessible} onChange={setNeedsAccessible} />
      </div>
      <div className="form-actions">
        <Button type="submit" variant="primary" block loading={state === 'saving'} icon={state === 'saved' ? 'check' : undefined}>
          {state === 'saved' ? 'Saved' : submitLabel}
        </Button>
      </div>
      {extra}
    </form>
  );
}

export default function Profile() {
  const desktop = useDesktop();
  const { user, setUser, userError, refreshUser } = useApp();
  const [history, setHistory] = useState(null);
  const [histError, setHistError] = useState(null);

  useEffect(() => {
    let alive = true;
    api
      .sessions()
      .then((d) => alive && setHistory((d?.sessions || []).filter((s) => s.endedAt)))
      .catch((e) => alive && setHistError(e));
    return () => {
      alive = false;
    };
  }, []);

  const initials = (user?.name || 'You')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`screen ${desktop ? 'is-narrow' : ''}`}>
      <ScreenHeader title="Profile" back={false} className="is-plain" />
      <div className="screen-inner screen-enter">
        <div className="profile-top">
          <div className="avatar" aria-hidden="true">
            {initials || 'Y'}
          </div>
          <div>
            <div className="profile-name">{user?.name || 'Welcome'}</div>
            <div className="profile-plate">{user?.plate ? formatPlate(user.plate) : 'Add your number plate'}</div>
          </div>
        </div>
        {userError && !user ? (
          <ErrorState error={userError} onRetry={refreshUser} compact />
        ) : (
          <section className="section card card-pad" aria-label="Your details">
            <UserForm initial={user} onSaved={setUser} />
          </section>
        )}
        <section className="section" aria-label="Parking history">
          <div className="section-title">History</div>
          {histError ? (
            <ErrorState error={histError} compact />
          ) : !history ? (
            <div className="stack">
              <Skeleton h={60} r={14} />
              <Skeleton h={60} r={14} />
            </div>
          ) : history.length === 0 ? (
            <EmptyState icon="history" title="No parking yet" body="Your past visits and what you paid will show up here." />
          ) : (
            <div className="history">
              {history.map((s) => (
                <div key={s.id} className="hitem">
                  <div>
                    <div className="hitem-name">
                      {s.venueName}, {s.slotCode}
                    </div>
                    <div className="hitem-sub">
                      {dateLabel(s.startedAt)}, {clock(s.startedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="hitem-fee">{rupees(s.fee)}</div>
                    <div className="hitem-dur">{s.durationMinutes != null ? fmtMinutes(s.durationMinutes) : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
