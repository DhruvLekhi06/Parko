import { useState } from 'react';
import { api } from '../api.js';
import { formatPlate } from '../lib/format.js';
import { Button } from './Primitives.jsx';
import { Icon } from './Icons.jsx';

export const ISSUERS = ['ICICI Bank', 'HDFC Bank', 'Axis Bank', 'State Bank of India', 'Kotak Mahindra Bank', 'IDFC FIRST Bank', 'Paytm Payments Bank', 'Airtel Payments Bank', 'Bank of Baroda', 'IndusInd Bank', 'Federal Bank', 'Equitas Small Finance Bank', 'Other'];

export function FastagForm({ vehicle, onDone, onSkip, submitLabel = 'Verify and link', toast, autoFocus = true }) {
  const [plate, setPlate] = useState(formatPlate(vehicle?.rawPlate || vehicle?.plate || ''));
  const [issuer, setIssuer] = useState(vehicle?.issuer || '');
  const [tag, setTag] = useState(vehicle?.fastagId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (plate.replace(/\s/g, '').length < 4) return setError('Enter your number plate as printed on the RC, like KA 01 AB 1234.');
    if (!issuer) return setError('Pick the bank or wallet that issued your FASTag.');
    if (tag.length < 10) return setError('The FASTag ID is the long number printed on the tag on your windscreen.');
    setBusy(true);
    try {
      const r = vehicle?.id ? await api.updateVehicle(vehicle.id, { plate, issuer, fastagId: tag, isDefault: true }) : await api.addVehicle({ plate, issuer, fastagId: tag, kind: 'car', isDefault: true });
      onDone?.(r?.user ?? r);
    } catch (err) {
      setError(err.message || 'Could not link the tag');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="ft-plate">
          Vehicle number
        </label>
        <input id="ft-plate" className="input is-plate" value={plate} onChange={(e) => setPlate(formatPlate(e.target.value))} placeholder="KA 01 AB 1234" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={14} autoFocus={autoFocus} required />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ft-issuer">
          FASTag issued by
        </label>
        <select id="ft-issuer" className="input" value={issuer} onChange={(e) => setIssuer(e.target.value)} required>
          <option value="">Choose your bank or wallet</option>
          {ISSUERS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="ft-tag">
          FASTag ID
        </label>
        <input id="ft-tag" className="input is-plate" value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24))} placeholder="34161FA820328E9A" autoCapitalize="characters" autoCorrect="off" spellCheck={false} inputMode="text" required />
        <span className="field-hint">
          <Icon name="info" size={13} /> Printed on the tag stuck to your windscreen, also in your bank's FASTag app under tag details.
        </span>
      </div>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="form-actions">
        <Button type="submit" variant="primary" block loading={busy} icon="ticket">
          {submitLabel}
        </Button>
      </div>
      {onSkip ? (
        <Button type="button" variant="ghost" block onClick={onSkip} disabled={busy}>
          I'll do this later
        </Button>
      ) : null}
    </form>
  );
}
