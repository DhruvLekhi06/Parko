import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rupees } from '../lib/format.js';
import { Button, Sheet } from './Primitives.jsx';
import { Icon } from './Icons.jsx';

const AMOUNTS = [10000, 20000, 50000, 100000];

export function WalletSheet({ open, onClose, onDone, balance, needed = 0, toast }) {
  const [amount, setAmount] = useState(20000);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const min = Math.max(10000, Math.ceil(needed / 10000) * 10000);
    setAmount(AMOUNTS.find((a) => a >= min) || min);
    setBusy(false);
  }, [open, needed]);

  const topUp = async () => {
    setBusy(true);
    try {
      const r = await api.topUp(amount);
      toast?.(`Added ${rupees(amount)} to your wallet.`, { kind: 'success' });
      onDone?.(r.balance);
    } catch (e) {
      toast?.(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={busy ? undefined : onClose} title="Top up wallet" dismissible={!busy} desktopCenter>
      <div className="sheet-grab" aria-hidden="true" />
      <div className="pay-amount">
        <div className="pay-amount-k">FASTag wallet balance</div>
        <div className="pay-amount-v num">{rupees(balance)}</div>
        {needed > 0 ? <div className="pay-need">You need {rupees(needed)} more for this.</div> : null}
      </div>
      <div className="topup-grid" role="radiogroup" aria-label="Amount">
        {AMOUNTS.map((a) => (
          <button key={a} type="button" role="radio" aria-checked={amount === a} className={`topup ${amount === a ? 'is-active' : ''}`} onClick={() => setAmount(a)}>
            {rupees(a)}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <Button variant="primary" size="lg" block onClick={topUp} loading={busy}>
          Add {rupees(amount)}
        </Button>
      </div>
      <p className="pay-free">
        <Icon name="info" size={14} /> Demo wallet. A real FASTag recharges through your bank or UPI app.
      </p>
    </Sheet>
  );
}
