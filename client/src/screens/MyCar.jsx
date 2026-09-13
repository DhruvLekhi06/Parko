import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useNow } from '../hooks/useNow.js';
import { useDesktop } from '../hooks/useMedia.js';
import { navigate } from '../router.jsx';
import { ReservationCard } from '../components/ReservationCard.jsx';
import { PaymentSheet } from '../components/PaymentSheet.jsx';
import { Button, EmptyState, ScreenHeader } from '../components/Primitives.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { rupees, clock, duration, feeFor, formatPlate } from '../lib/format.js';

export default function MyCar() {
  const desktop = useDesktop();
  const { session, setSession, reservation, setReservation, serverFee, setServerFee, refreshActive, user, toast } = useApp();
  const now = useNow(1000, !!session);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    refreshActive();
  }, [refreshActive]);

  useEffect(() => {
    if (!session) return undefined;
    const tick = async () => {
      try {
        const d = await api.activeSession();
        if (!d?.session) {
          setSession(null);
          setServerFee(null);
        } else {
          setSession(d.session);
          setServerFee({ feeNow: d.feeNow ?? 0, elapsedMinutes: d.elapsedMinutes ?? 0, at: Date.now() });
        }
      } catch {
        /* next poll */
      }
    };
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [session?.id, setSession, setServerFee]);

  const cancel = async () => {
    if (!reservation) return;
    setBusy('cancel');
    try {
      await api.cancelReservation(reservation.id);
      setReservation(null);
      toast('Hold released.');
    } catch (e) {
      toast(e.message, { kind: 'error' });
      refreshActive();
    } finally {
      setBusy(null);
    }
  };

  const parked = async () => {
    if (!reservation) return;
    setBusy('park');
    try {
      const r = await api.startSession({ reservationId: reservation.id });
      setSession(r?.session ?? r);
      setReservation(null);
      toast(`Parked at ${reservation.slotCode}. Timer running.`, { kind: 'success' });
    } catch (e) {
      toast(e.message, { kind: 'error' });
      refreshActive();
    } finally {
      setBusy(null);
    }
  };

  const head = <ScreenHeader title="My Car" back={false} className="is-plain" />;

  let body;
  if (session) {
    const started = new Date(session.startedAt).getTime();
    const elapsedMs = Math.max(0, now - started);
    const elapsedMin = elapsedMs / 60000;
    const localFee = session.rate ? feeFor(elapsedMin, session.rate) : null;
    const fee = localFee != null ? Math.max(localFee, serverFee?.feeNow ?? 0) : (serverFee?.feeNow ?? 0);
    const graceLeft = session.rate?.freeMinutes ? Math.ceil(session.rate.freeMinutes - elapsedMin) : 0;
    body = (
      <div className="screen-inner screen-enter">
        <div className="carcard">
          <div className="carcard-venue">
            {session.venueName}, floor {session.floorName}
          </div>
          <div className="carcard-slot">{session.slotCode}</div>
          {user?.plate ? <div className="carcard-plate">{formatPlate(user.plate)}</div> : null}
          <div className="carcard-grid">
            <div>
              <div className="carcard-k">Parked at</div>
              <div className="carcard-v">{clock(session.startedAt)}</div>
            </div>
            <div>
              <div className="carcard-k">Time so far</div>
              <div className="carcard-v">{duration(elapsedMs)}</div>
            </div>
            <div>
              <div className="carcard-k">Fee so far</div>
              <div className="carcard-v is-fee">{rupees(fee)}</div>
            </div>
          </div>
          <div className="carcard-actions">
            <Button variant="secondary" icon="walk" onClick={() => navigate(`/floor/${encodeURIComponent(session.floorId)}?find=1`)}>
              Find my car
            </Button>
            <Button variant="primary" icon="card" onClick={() => setPayOpen(true)}>
              Pay & exit
            </Button>
          </div>
        </div>
        <p className="feenote">
          {graceLeft > 0
            ? `Leave within ${graceLeft} min and it's free.`
            : session.rate
              ? `${rupees(session.rate.firstHour)} for the first hour, then ${rupees(session.rate.perAdditionalHour)} an hour, capped at ${rupees(session.rate.dailyCap)} a day.`
              : 'Fee updates every 30 seconds.'}
        </p>
        <PaymentSheet
          open={payOpen}
          session={session}
          amount={fee}
          toast={toast}
          onClose={() => setPayOpen(false)}
          onPaid={() => {
            setPayOpen(false);
            setSession(null);
            setServerFee(null);
            navigate('/');
          }}
        />
      </div>
    );
  } else if (reservation) {
    body = (
      <div className="screen-inner screen-enter">
        <ReservationCard reservation={reservation} showRoute={false} onCancel={cancel} onParked={parked} onOpenFloor={() => navigate(`/floor/${encodeURIComponent(reservation.floorId)}`)} busy={busy} />
        <p className="feenote">Once you're in, tap "I've parked" to start the timer.</p>
      </div>
    );
  } else {
    body = (
      <div className="screen-inner screen-enter">
        <div className="empty" style={{ paddingTop: 56 }}>
          <div className="empty-icon" style={{ background: 'var(--green-soft)' }}>
            <LogoMark size={30} />
          </div>
          <h2 className="empty-title">Nothing parked yet</h2>
          <p className="empty-body">Hold a spot before you leave, then we'll time your stay and walk you back to your car.</p>
          <Button variant="primary" icon="compass" onClick={() => navigate('/')}>
            Find a spot
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`screen ${desktop ? 'is-narrow' : ''}`}>
      {head}
      {body}
    </div>
  );
}
