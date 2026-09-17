import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Link } from '../router.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { Button, ErrorState, ScreenHeader, Skeleton, Toggle, EmptyState, Pill, IconButton } from '../components/Primitives.jsx';
import { WalletSheet } from '../components/WalletSheet.jsx';
import { Icon } from '../components/Icons.jsx';
import { rupees, formatPlate, dateLabel, clock, minutes as fmtMinutes, maskTag, VEHICLE_KINDS, TXN_LABELS } from '../lib/format.js';

export function DetailsForm({ initial, onSaved, submitLabel = 'Save changes', autoFocus = false }) {
  const [name, setName] = useState(initial?.name || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [needsEv, setNeedsEv] = useState(!!initial?.prefs?.needsEv);
  const [needsAccessible, setNeedsAccessible] = useState(!!initial?.prefs?.needsAccessible);
  const [state, setState] = useState('idle');
  const { toast } = useApp();

  useEffect(() => {
    if (!initial) return;
    setName(initial.name || '');
    setPhone(initial.phone || '');
    setNeedsEv(!!initial.prefs?.needsEv);
    setNeedsAccessible(!!initial.prefs?.needsAccessible);
  }, [initial]);

  const submit = async (e) => {
    e.preventDefault();
    setState('saving');
    try {
      const u = await api.updateMe({ name: name.trim(), phone: phone.trim(), prefs: { ...(initial?.prefs || {}), needsEv, needsAccessible } });
      setState('saved');
      onSaved?.(u);
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
        <label className="field-label" htmlFor="f-phone">
          Mobile number
        </label>
        <input id="f-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98765 43210" inputMode="numeric" autoComplete="tel-national" />
        <span className="field-hint">Only used for your parking receipts.</span>
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
    </form>
  );
}

export function VehicleForm({ initial, onSaved, onCancel, submitLabel = 'Save vehicle', compact = false }) {
  const [plate, setPlate] = useState(formatPlate(initial?.rawPlate || initial?.plate || ''));
  const [label, setLabel] = useState(initial?.label || '');
  const [kind, setKind] = useState(initial?.kind || 'car');
  const [fastagId, setFastagId] = useState(initial?.fastagId || '');
  const [busy, setBusy] = useState(false);
  const { toast } = useApp();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { plate, label, kind, fastagId };
      const r = initial?.id ? await api.updateVehicle(initial.id, body) : await api.addVehicle(body);
      onSaved?.(r?.user ?? r);
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="v-plate">
          Number plate
        </label>
        <input id="v-plate" className="input is-plate" value={plate} onChange={(e) => setPlate(formatPlate(e.target.value))} placeholder="KA 01 AB 1234" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={14} required />
      </div>
      {!compact ? (
        <div className="field">
          <label className="field-label" htmlFor="v-label">
            Name it (optional)
          </label>
          <input id="v-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My Creta" maxLength={40} />
        </div>
      ) : null}
      <div className="field">
        <div className="field-label">Type</div>
        <div className="seg" role="radiogroup" aria-label="Vehicle type">
          {Object.entries(VEHICLE_KINDS).map(([k, lbl]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={`seg-btn ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="v-tag">
          FASTag ID {compact ? '(optional, you can add it later)' : '(optional)'}
        </label>
        <input id="v-tag" className="input is-plate" value={fastagId} onChange={(e) => setFastagId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24))} placeholder="34161FA820328E9A" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
        <span className="field-hint">Printed on the tag on your windscreen. Linking it lets you drive out without stopping.</span>
      </div>
      <div className="form-actions" style={{ display: 'flex', gap: 10 }}>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" block loading={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function VehicleRow({ v, onEdit, onRemove, onDefault }) {
  return (
    <div className={`vehicle ${v.isDefault ? 'is-default' : ''}`}>
      <div className="vehicle-main">
        <div className="vehicle-plate">{v.plate}</div>
        <div className="vehicle-sub">
          {v.label ? `${v.label}, ` : ''}
          {VEHICLE_KINDS[v.kind] || v.kind}
        </div>
        <div className="vehicle-tags">
          {v.fastagLinked ? (
            <Pill tone="green" dot>
              FASTag {maskTag(v.fastagId)}
            </Pill>
          ) : (
            <button type="button" className="linkbtn" onClick={onEdit}>
              Link FASTag
            </button>
          )}
          {v.isDefault ? <Pill tone="ink">Default</Pill> : (
            <button type="button" className="linkbtn" onClick={onDefault}>
              Make default
            </button>
          )}
        </div>
      </div>
      <div className="vehicle-actions">
        <IconButton name="refresh" label="Edit vehicle" size="sm" onClick={onEdit} />
        <IconButton name="close" label="Remove vehicle" size="sm" onClick={onRemove} />
      </div>
    </div>
  );
}

export default function Profile() {
  const desktop = useDesktop();
  const { user, setUser, userError, refreshUser, setWalletBalance, toast } = useApp();
  const [history, setHistory] = useState(null);
  const [histError, setHistError] = useState(null);
  const [txns, setTxns] = useState(null);
  const [txnsOpen, setTxnsOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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

  useEffect(() => {
    if (!txnsOpen) return undefined;
    let alive = true;
    api
      .wallet()
      .then((d) => alive && setTxns(d?.transactions || []))
      .catch(() => alive && setTxns([]));
    return () => {
      alive = false;
    };
  }, [txnsOpen, user?.walletBalance]);

  const initials = (user?.name || 'You')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const removeVehicle = async (v) => {
    try {
      setUser(await api.deleteVehicle(v.id));
      toast(`${v.plate} removed.`);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };
  const makeDefault = async (v) => {
    try {
      setUser(await api.updateVehicle(v.id, { isDefault: true }));
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };

  const vehicles = user?.vehicles || [];

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
            <div className="profile-plate">{user?.defaultVehicle?.plate || 'Add your vehicle below'}</div>
          </div>
        </div>

        <section className="walletcard" aria-label="FASTag wallet">
          <div className="walletcard-top">
            <div>
              <div className="walletcard-k">FASTag wallet</div>
              <div className="walletcard-v num">{rupees(user?.walletBalance ?? 0)}</div>
            </div>
            <Button variant="primary" size="sm" icon="plus" onClick={() => setWalletOpen(true)}>
              Top up
            </Button>
          </div>
          <div className="walletcard-sub">
            {user?.defaultVehicle?.fastagLinked ? `Auto-debits on FASTag ${maskTag(user.defaultVehicle.fastagId)} for holds and parking.` : 'Pays your hold fees and parking. Link a FASTag to drive out without stopping.'}
          </div>
          <button type="button" className="walletcard-toggle" onClick={() => setTxnsOpen((o) => !o)} aria-expanded={txnsOpen}>
            {txnsOpen ? 'Hide transactions' : 'Transactions'}
            <Icon name="chevron" size={16} className={txnsOpen ? 'is-up' : ''} />
          </button>
          {txnsOpen ? (
            <div className="txns">
              {!txns ? (
                <Skeleton h={44} r={10} />
              ) : txns.length === 0 ? (
                <div className="txn-empty">No transactions yet.</div>
              ) : (
                txns.map((t) => (
                  <div key={t.id} className="txn">
                    <div>
                      <div className="txn-name">{TXN_LABELS[t.kind] || t.kind}</div>
                      <div className="txn-sub">
                        {t.note ? `${t.note}, ` : ''}
                        {dateLabel(t.createdAt)}, {clock(t.createdAt)}
                      </div>
                    </div>
                    <div className={`txn-amt num ${t.amount >= 0 ? 'is-credit' : ''}`}>
                      {t.amount >= 0 ? '+' : '-'}
                      {rupees(Math.abs(t.amount))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </section>

        <section className="section" aria-label="Vehicles">
          <div className="section-title">Vehicles</div>
          {vehicles.length === 0 && editing !== 'new' ? (
            <div className="hint">
              <Icon name="car" size={18} />
              <span>Add your car so holds and receipts carry your number plate.</span>
            </div>
          ) : null}
          <div className="vehicles">
            {vehicles.map((v) =>
              editing === v.id ? (
                <div key={v.id} className="card card-pad">
                  <VehicleForm
                    initial={v}
                    onSaved={(u) => {
                      setUser(u);
                      setEditing(null);
                      toast('Vehicle updated.', { kind: 'success' });
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : (
                <VehicleRow key={v.id} v={v} onEdit={() => setEditing(v.id)} onRemove={() => removeVehicle(v)} onDefault={() => makeDefault(v)} />
              )
            )}
            {editing === 'new' ? (
              <div className="card card-pad">
                <VehicleForm
                  submitLabel="Add vehicle"
                  onSaved={(u) => {
                    setUser(u);
                    setEditing(null);
                    toast('Vehicle added.', { kind: 'success' });
                  }}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <Button variant="secondary" icon="plus" block onClick={() => setEditing('new')}>
                Add a vehicle
              </Button>
            )}
          </div>
        </section>

        {userError && !user ? (
          <ErrorState error={userError} onRetry={refreshUser} compact />
        ) : (
          <section className="section card card-pad" aria-label="Your details">
            <DetailsForm initial={user} onSaved={setUser} />
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
                      {s.plate ? `, ${s.plate}` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="hitem-fee">{rupees(Math.max(0, (s.fee || 0) - (s.holdCredit || 0)))}</div>
                    <div className="hitem-dur">{s.durationMinutes != null ? fmtMinutes(s.durationMinutes) : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="admin-link">
          <Link to="/admin" className="linkbtn">
            Operator portal
          </Link>
        </div>
      </div>
      <WalletSheet
        open={walletOpen}
        balance={user?.walletBalance ?? 0}
        toast={toast}
        onClose={() => setWalletOpen(false)}
        onDone={(b) => {
          setWalletBalance(b);
          setWalletOpen(false);
        }}
      />
    </div>
  );
}
