import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rupees, minutes as fmtMinutes } from '../lib/format.js';
import { Button, Sheet } from './Primitives.jsx';
import { Icon } from './Icons.jsx';

const METHODS = [
  { id: 'upi', label: 'UPI', icon: 'phone' },
  { id: 'card', label: 'Card', icon: 'card' },
  { id: 'cash', label: 'Cash', icon: 'cash' },
];

export function PaymentSheet({ open, session, amount, onClose, onPaid, toast }) {
  const [method, setMethod] = useState('upi');
  const [step, setStep] = useState('choose');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setStep('choose');
      setResult(null);
    }
  }, [open]);

  const pay = async () => {
    setStep('processing');
    const wait = new Promise((r) => setTimeout(r, 1200));
    try {
      const [res] = await Promise.all([api.pay(session.id, method), wait]);
      setResult(res);
      setStep('receipt');
    } catch (e) {
      setStep('choose');
      toast?.(e.message || 'Payment did not go through. Try again.', { kind: 'error' });
    }
  };

  const done = () => {
    onPaid?.(result);
  };

  const paid = result?.session;
  const durationMin = paid?.durationMinutes ?? (paid?.startedAt && paid?.endedAt ? Math.round((new Date(paid.endedAt) - new Date(paid.startedAt)) / 60000) : null);
  const methodLabel = METHODS.find((m) => m.id === (paid?.paymentMethod || method))?.label;

  return (
    <Sheet open={open} onClose={step === 'processing' ? undefined : step === 'receipt' ? done : onClose} title={step === 'receipt' ? 'Receipt' : amount > 0 ? 'Pay and exit' : 'Exit'} dismissible={step !== 'processing'}>
      <div className="sheet-grab" aria-hidden="true" />
      {step === 'choose' ? (
        <>
          <div className="pay-amount">
            <div className="pay-amount-v num">{rupees(amount)}</div>
            <div className="pay-amount-k">
              {session?.venueName}, spot {session?.slotCode}
            </div>
          </div>
          {amount > 0 ? (
            <div className="seg" role="radiogroup" aria-label="Payment method">
              {METHODS.map((m) => (
                <button key={m.id} type="button" role="radio" aria-checked={method === m.id} className={`seg-btn ${method === m.id ? 'is-active' : ''}`} onClick={() => setMethod(m.id)}>
                  <Icon name={m.icon} size={17} />
                  {m.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="pay-free">You are inside the free window, so there is nothing to pay.</p>
          )}
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" size="lg" block onClick={pay}>
              {amount > 0 ? `Pay ${rupees(amount)} and exit` : 'Exit for free'}
            </Button>
          </div>
        </>
      ) : null}
      {step === 'processing' ? (
        <div className="pay-processing" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Confirming with {METHODS.find((m) => m.id === method)?.label}</span>
        </div>
      ) : null}
      {step === 'receipt' ? (
        <div className="receipt">
          <div className="receipt-check">
            <Icon name="check" size={30} />
          </div>
          <h2 className="receipt-title">Paid. Drive safe.</h2>
          <div className="receipt-sub">Receipt {result?.receiptNo}</div>
          <div className="receipt-rows">
            <div className="receipt-row">
              <span>Venue</span>
              <span>{paid?.venueName || session?.venueName}</span>
            </div>
            <div className="receipt-row">
              <span>Spot</span>
              <span>{paid?.slotCode || session?.slotCode}</span>
            </div>
            <div className="receipt-row">
              <span>Duration</span>
              <span>{durationMin != null ? fmtMinutes(durationMin) : ''}</span>
            </div>
            <div className="receipt-row">
              <span>Paid via</span>
              <span>{methodLabel}</span>
            </div>
            <div className="receipt-row is-total">
              <span>Total</span>
              <span>{rupees(paid?.fee ?? amount)}</span>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" size="lg" block onClick={done}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
