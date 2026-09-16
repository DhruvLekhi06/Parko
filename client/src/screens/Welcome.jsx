import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { Button, Toggle } from '../components/Primitives.jsx';
import { formatPlate } from '../lib/format.js';

export default function Welcome() {
  const { user, setUser, finishWelcome, toast } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [plate, setPlate] = useState('');
  const [fastagId, setFastagId] = useState('');
  const [needsEv, setNeedsEv] = useState(false);
  const [needsAccessible, setNeedsAccessible] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let u = await api.updateMe({ name: name.trim(), prefs: { needsEv, needsAccessible } });
      if (plate.replace(/\s/g, '').length >= 4) {
        const r = await api.addVehicle({ plate, fastagId, kind: 'car' });
        u = r?.user ?? u;
      }
      setUser(u);
      finishWelcome();
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <div className="welcome-brand">
          <LogoMark size={56} tile />
          <div>
            <h1 id="welcome-title" className="welcome-title">
              Your spot, sorted.
            </h1>
            <p className="welcome-body" style={{ marginTop: 10 }}>
              Live parking across Bengaluru, Mumbai, Delhi NCR, Hyderabad, Chennai and Pune. Hold a spot before you leave, drive in on your FASTag, walk straight back to your car.
            </p>
          </div>
        </div>
        <div className="welcome-form">
          <form className="form" onSubmit={submit}>
            <div className="field">
              <label className="field-label" htmlFor="w-name">
                Your name
              </label>
              <input id="w-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" autoComplete="name" autoFocus />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="w-plate">
                Number plate
              </label>
              <input id="w-plate" className="input is-plate" value={plate} onChange={(e) => setPlate(formatPlate(e.target.value))} placeholder="KA 01 AB 1234" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={14} />
              <span className="field-hint">Shown at the gate and on receipts.</span>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="w-tag">
                FASTag ID (optional)
              </label>
              <input id="w-tag" className="input is-plate" value={fastagId} onChange={(e) => setFastagId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24))} placeholder="34161FA820328E9A" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
              <span className="field-hint">Link it to drive in and out without stopping. You start with a ₹500 wallet.</span>
            </div>
            <div>
              <div className="field-label">Preferences</div>
              <Toggle id="w-ev" label="I need EV charging" hint="We'll pick a charging slot for you" checked={needsEv} onChange={setNeedsEv} />
              <Toggle id="w-acc" label="I need an accessible slot" hint="Closest to the entrance, extra room" checked={needsAccessible} onChange={setNeedsAccessible} />
            </div>
            <div className="form-actions">
              <Button type="submit" variant="primary" block loading={busy}>
                Let's go
              </Button>
            </div>
            <Button type="button" variant="ghost" block onClick={finishWelcome} disabled={busy}>
              Skip for now
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
