import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rupees, clock, maskTag } from '../lib/format.js';
import { Button, Sheet } from './Primitives.jsx';
import { SlideToConfirm } from './SlideToConfirm.jsx';
import { Icon } from './Icons.jsx';
import { Ticket } from './HoldCard.jsx';
import { useApp } from '../store.jsx';

export function BookSheet({ open, slot, floorName, venue, user, position, existingHold, onClose, onBooked, onWallet, toast }) {
  const { openAuth } = useApp();
  const [step, setStep] = useState('confirm');
  const [result, setResult] = useState(null);
  const [short, setShort] = useState(null);
  const [minutes, setMinutes] = useState(30);

  useEffect(() => {
    if (open) {
      setStep('confirm');
      setResult(null);
      setShort(null);
      setMinutes(30);
    }
  }, [open]);

  const block = venue?.holdFee ?? 2000;
  const fee = block * (minutes / 15);
  const until = new Date(Date.now() + minutes * 60000).toISOString();
  const tag = user?.defaultVehicle?.fastagId || '';
  const balance = user?.walletBalance ?? 0;

  const book = async () => {
    if (user?.isGuest) {
      openAuth(() => book());
      return;
    }
    setStep('processing');
    const wait = new Promise((r) => setTimeout(r, 900));
    try {
      const [r] = await Promise.all([api.holdSpot({ slotId: slot.id, minutes }), wait]);
      setResult(r);
      onWallet?.(r.walletBalance);
      setStep('done');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_BALANCE') {
        setShort(e.details || { shortfall: fee - balance, balance, required: fee });
        setStep('insufficient');
        return;
      }
      setStep('confirm');
      toast?.(e.status === 409 ? 'Someone just took that spot. Pick another.' : e.message, { kind: 'error' });
      if (e.status === 409) onClose?.();
    }
  };

  const topUpAndBook = async () => {
    const amount = Math.max(10000, Math.ceil((short?.shortfall || 0) / 10000) * 10000);
    setStep('processing');
    try {
      const r = await api.topUp(amount);
      onWallet?.(r.balance);
      toast?.(`Added ${rupees(amount)} to your wallet.`, { kind: 'success' });
      await book();
    } catch (e) {
      setStep('insufficient');
      toast?.(e.message, { kind: 'error' });
    }
  };

  if (!slot) return null;
  const topUpAmount = Math.max(10000, Math.ceil((short?.shortfall || 0) / 10000) * 10000);

  return (
    <Sheet open={open} onClose={step === 'processing' ? undefined : step === 'done' ? () => onBooked?.(result) : onClose} title={step === 'done' ? 'Booked' : `Book slot ${slot.code}`} dismissible={step !== 'processing'} desktopCenter>
      <div className="sheet-grab" aria-hidden="true" />
      {step === 'confirm' || step === 'insufficient' ? (
        <>
          <div className="pay-amount">
            <div className="pay-amount-k">
              {venue?.name}, spot {slot.code}, floor {floorName}
            </div>
          </div>
          <div className="durpick" role="radiogroup" aria-label="Hold for">
            {[15, 30, 60].map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`dur ${minutes === m ? 'is-active' : ''}`} onClick={() => setMinutes(m)}>
                <span className="dur-min num">{m}</span>
                <span className="dur-unit">min</span>
                <span className="dur-price num">{rupees(block * (m / 15))}</span>
              </button>
            ))}
          </div>
          <div className="exit-rows">
            <div className="receipt-row">
              <span>Held until</span>
              <span>{clock(until)}</span>
            </div>
            <div className="receipt-row">
              <span>Booking fee</span>
              <span>{rupees(fee)}</span>
            </div>
            <div className="receipt-row is-credit">
              <span>Credited at exit</span>
              <span>- {rupees(fee)}</span>
            </div>
            {existingHold ? (
              <div className="receipt-row">
                <span>Replaces {existingHold.slotCode}</span>
                <span className="tone-text-green">{rupees(existingHold.holdFee)} refunded</span>
              </div>
            ) : null}
          </div>
          {step === 'insufficient' ? (
            <div className="fastag-line is-short">
              <Icon name="alert" size={18} />
              <span>
                Wallet has {rupees(short?.balance ?? balance)}, you need {rupees(short?.shortfall ?? 0)} more.
              </span>
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            {step === 'insufficient' ? (
              <SlideToConfirm label={`Slide to top up ${rupees(topUpAmount)} and book`} icon="plus" onConfirm={topUpAndBook} />
            ) : user?.isGuest ? (
              <Button variant="primary" size="lg" block icon="ticket" onClick={book}>
                Create an account to book
              </Button>
            ) : (
              <SlideToConfirm label={`Slide to pay ${rupees(fee)} and book`} icon="ticket" onConfirm={book} />
            )}
          </div>
          <div className="policy">
            <span>{tag ? `FASTag ${maskTag(tag)}, wallet ${rupees(balance)}` : `Wallet ${rupees(balance)}`}</span>
            <span>Full refund within 5 min, 50% after, none in the last 10 min</span>
          </div>
        </>
      ) : null}
      {step === 'processing' ? (
        <div className="pay-processing" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Booking your spot</span>
        </div>
      ) : null}
      {step === 'done' && result?.hold ? (
        <div className="receipt">
          <div className="receipt-check">
            <Icon name="check" size={30} />
          </div>
          <h2 className="receipt-title">Spot {result.hold.slotCode} is yours</h2>
          <div className="receipt-sub">Held until {clock(result.hold.expiresAt)}. Show this at the gate.</div>
          <Ticket hold={result.hold} />
          <div style={{ marginTop: 16 }}>
            <Button variant="primary" size="lg" block onClick={() => onBooked?.(result)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
