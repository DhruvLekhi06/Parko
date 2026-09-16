import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { rupees, minutes as fmtMinutes, maskTag } from '../lib/format.js';
import { Button, Sheet } from './Primitives.jsx';
import { Icon } from './Icons.jsx';

export function ExitSheet({ open, session, quote, user, onClose, onExited, onWallet, toast }) {
  const [step, setStep] = useState('confirm');
  const [result, setResult] = useState(null);
  const [short, setShort] = useState(null);

  useEffect(() => {
    if (open) {
      setStep('confirm');
      setResult(null);
      setShort(null);
    }
  }, [open]);

  const fee = quote?.feeNow ?? 0;
  const credit = quote?.holdCredit ?? 0;
  const due = quote?.dueNow ?? Math.max(0, fee - credit);
  const tag = user?.defaultVehicle?.fastagId || '';
  const balance = user?.walletBalance ?? 0;

  const exit = async () => {
    setStep('processing');
    const wait = new Promise((r) => setTimeout(r, 1000));
    try {
      const [res] = await Promise.all([api.exitSession(session.id), wait]);
      setResult(res);
      onWallet?.(res.walletBalance);
      setStep('receipt');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_BALANCE') {
        setShort(e.details || { shortfall: due - balance, balance, required: due });
        setStep('insufficient');
        return;
      }
      setStep('confirm');
      toast?.(e.message || 'Could not complete the exit. Try again.', { kind: 'error' });
    }
  };

  const topUpAndExit = async () => {
    const amount = Math.max(10000, Math.ceil((short?.shortfall || 0) / 10000) * 10000);
    setStep('processing');
    try {
      const r = await api.topUp(amount);
      onWallet?.(r.balance);
      toast?.(`Added ${rupees(amount)} to your wallet.`, { kind: 'success' });
      await exit();
    } catch (e) {
      setStep('insufficient');
      toast?.(e.message, { kind: 'error' });
    }
  };

  const paid = result?.session;
  const done = () => onExited?.(result);
  const title = step === 'receipt' ? 'Receipt' : due > 0 ? 'Exit and pay' : 'Exit';

  return (
    <Sheet open={open} onClose={step === 'processing' ? undefined : step === 'receipt' ? done : onClose} title={title} dismissible={step !== 'processing'} desktopCenter>
      <div className="sheet-grab" aria-hidden="true" />
      {step === 'confirm' || step === 'insufficient' ? (
        <>
          <div className="pay-amount">
            <div className="pay-amount-v num">{rupees(due)}</div>
            <div className="pay-amount-k">
              {session?.venueName}, spot {session?.slotCode}
            </div>
          </div>
          <div className="exit-rows">
            <div className="receipt-row">
              <span>Parking fee</span>
              <span>{rupees(fee)}</span>
            </div>
            {credit > 0 ? (
              <div className="receipt-row is-credit">
                <span>Hold fee already paid</span>
                <span>- {rupees(credit)}</span>
              </div>
            ) : null}
            <div className="receipt-row is-total">
              <span>To pay now</span>
              <span>{rupees(due)}</span>
            </div>
          </div>
          <div className={`fastag-line ${step === 'insufficient' ? 'is-short' : ''}`}>
            <Icon name={step === 'insufficient' ? 'alert' : 'ticket'} size={18} />
            <span>
              {step === 'insufficient'
                ? `Wallet has ${rupees(short?.balance ?? balance)}, you need ${rupees(short?.shortfall ?? 0)} more.`
                : due === 0
                  ? 'Inside the free window, nothing to pay. The gate opens on your FASTag.'
                  : tag
                    ? `Charged to FASTag ${maskTag(tag)}. Wallet ${rupees(balance)}.`
                    : `Charged to your SpotOn wallet, ${rupees(balance)}.`}
            </span>
          </div>
          <div style={{ marginTop: 16 }}>
            {step === 'insufficient' ? (
              <Button variant="primary" size="lg" block onClick={topUpAndExit} icon="plus">
                Top up {rupees(Math.max(10000, Math.ceil((short?.shortfall || 0) / 10000) * 10000))} and exit
              </Button>
            ) : (
              <Button variant="primary" size="lg" block onClick={exit}>
                {due > 0 ? `Exit and pay ${rupees(due)}` : 'Exit for free'}
              </Button>
            )}
          </div>
        </>
      ) : null}
      {step === 'processing' ? (
        <div className="pay-processing" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>Opening the gate</span>
        </div>
      ) : null}
      {step === 'receipt' ? (
        <div className="receipt">
          <div className="receipt-check">
            <Icon name="check" size={30} />
          </div>
          <h2 className="receipt-title">{(result?.charge?.due ?? 0) > 0 ? 'Paid. Drive safe.' : 'You are out. Drive safe.'}</h2>
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
              <span>{paid?.durationMinutes != null ? fmtMinutes(paid.durationMinutes) : ''}</span>
            </div>
            <div className="receipt-row">
              <span>Parking fee</span>
              <span>{rupees(result?.charge?.parkingFee ?? paid?.fee ?? 0)}</span>
            </div>
            {(result?.charge?.holdCredit ?? 0) > 0 ? (
              <div className="receipt-row is-credit">
                <span>Hold fee credit</span>
                <span>- {rupees(result.charge.holdCredit)}</span>
              </div>
            ) : null}
            {(result?.charge?.due ?? 0) > 0 ? (
              <div className="receipt-row">
                <span>Paid via</span>
                <span>{tag ? `FASTag ${maskTag(tag)}` : 'Wallet'}</span>
              </div>
            ) : null}
            <div className="receipt-row is-total">
              <span>Total</span>
              <span>{rupees(result?.charge?.due ?? 0)}</span>
            </div>
            <div className="receipt-row">
              <span>Wallet balance</span>
              <span>{rupees(result?.walletBalance ?? balance)}</span>
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
