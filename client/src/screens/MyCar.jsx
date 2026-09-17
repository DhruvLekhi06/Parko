import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useNow } from '../hooks/useNow.js';
import { useDesktop } from '../hooks/useMedia.js';
import { navigate, Link } from '../router.jsx';
import { HoldCard } from '../components/HoldCard.jsx';
import { VenueMap } from '../components/VenueMap.jsx';
import { ExitSheet } from '../components/ExitSheet.jsx';
import { ConfirmSheet } from '../components/ConfirmSheet.jsx';
import { Button, ScreenHeader } from '../components/Primitives.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { Icon } from '../components/Icons.jsx';
import { rupees, clock, duration, feeFor, maskTag } from '../lib/format.js';

export default function MyCar() {
  const desktop = useDesktop();
  const { session, setSession, hold, setHold, serverFee, setServerFee, refreshActive, user, setWalletBalance, toast, arrived, position } = useApp();
  const now = useNow(1000, !!session);
  const [exitOpen, setExitOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [drive, setDrive] = useState(null);
  const [pendingDelta, setPendingDelta] = useState(0);
  const posKey = position.source === 'gps' ? `${Math.round(position.lat * 200)},${Math.round(position.lng * 200)}` : 'none';

  useEffect(() => {
    if (!hold) {
      setDrive(null);
      return undefined;
    }
    let alive = true;
    api
      .directions(hold.venueId, position.source === 'gps' ? position : undefined)
      .then((d) => alive && setDrive(d))
      .catch(() => alive && setDrive(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold?.id, posKey]);

  useEffect(() => {
    refreshActive();
  }, [refreshActive]);

  useEffect(() => {
    if (!session || exitOpen) return undefined;
    const tick = async () => {
      try {
        const d = await api.activeSession();
        if (!d?.session) {
          setSession(null);
          setServerFee(null);
        } else {
          setSession(d.session);
          setServerFee({ feeNow: d.feeNow ?? 0, dueNow: d.dueNow ?? 0, holdCredit: d.holdCredit ?? 0, elapsedMinutes: d.elapsedMinutes ?? 0, at: Date.now() });
          setWalletBalance(d.walletBalance);
        }
      } catch {
        /* next poll */
      }
    };
    const id = window.setInterval(tick, 30000);
    return () => window.clearInterval(id);
  }, [session?.id, exitOpen, setSession, setServerFee, setWalletBalance]);

  const cancel = async () => {
    if (!hold) return;
    setBusy('cancel');
    try {
      const r = await api.cancelHold(hold.id);
      setHold(null);
      setWalletBalance(r?.walletBalance);
      toast(r?.refunded ? `Booking cancelled. ${rupees(r.refunded)} back in your wallet.` : 'Booking cancelled. No refund this close to the end.');
    } catch (e) {
      toast(e.message, { kind: 'error' });
      refreshActive();
    } finally {
      setBusy(null);
    }
  };

  const parked = async () => {
    if (!hold) return;
    setBusy('park');
    try {
      const r = await api.arrive(hold.id);
      setSession(r?.session ?? r);
      setHold(null);
      toast(`Parked at ${hold.slotCode}. Timer running.`, { kind: 'success' });
    } catch (e) {
      toast(e.message, { kind: 'error' });
      refreshActive();
    } finally {
      setBusy(null);
    }
  };

  const extend = async (delta = 15) => {
    if (!hold) return;
    setPendingDelta(0);
    setBusy('extend');
    try {
      const r = await api.extendHold(hold.id, delta);
      setHold(r?.hold ?? hold);
      setWalletBalance(r?.walletBalance);
      toast(delta > 0 ? `Added 15 min, held until ${clock(r?.hold?.expiresAt)}.` : `Shortened, held until ${clock(r?.hold?.expiresAt)}. Fee refunded.`, { kind: 'success' });
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const head = <ScreenHeader title="My Car" back={false} className="is-plain" />;

  const target = hold ? { id: hold.venueId, name: hold.venueName, lat: hold.venueLat, lng: hold.venueLng } : session?.venueLat != null ? { id: session.venueId, name: session.venueName, lat: session.venueLat, lng: session.venueLng } : null;
  const here = position.source === 'gps' ? [position.lat, position.lng] : null;
  const routePts = hold && drive?.coordinates?.length ? drive.coordinates : null;
  const fitPts = target ? [...(routePts ? [routePts[0], routePts[routePts.length - 1]] : [[target.lat, target.lng]]), ...(here && hold ? [here] : [])] : [];
  const mapEl = target ? (
    <VenueMap
      center={{ lat: target.lat, lng: target.lng }}
      zoom={14}
      venues={[{ ...target, level: 'open', free: hold ? hold.slotCode : session?.slotCode }]}
      user={here ? { lat: here[0], lng: here[1] } : null}
      route={routePts}
      fit={{ points: fitPts, key: `${target.id}-${routePts ? 'r' : 'n'}-${fitPts.length}`, maxZoom: 15 }}
    />
  ) : null;

  let body;
  if (session) {
    const started = new Date(session.startedAt).getTime();
    const elapsedMs = Math.max(0, now - started);
    const elapsedMin = elapsedMs / 60000;
    const localFee = session.rate ? feeFor(elapsedMin, session.rate) : null;
    const fee = localFee != null ? Math.max(localFee, serverFee?.feeNow ?? 0) : (serverFee?.feeNow ?? 0);
    const credit = Math.min(session.holdFee || 0, fee);
    const due = Math.max(0, fee - credit);
    const graceLeft = session.rate?.freeMinutes ? Math.ceil(session.rate.freeMinutes - elapsedMin) : 0;
    const tag = user?.defaultVehicle?.fastagId;
    body = (
      <div className="screen-inner screen-enter">
        <div className="carcard">
          <div className="carcard-venue">
            {session.venueName}, floor {session.floorName}
          </div>
          <div className="carcard-slot">{session.slotCode}</div>
          {session.plate || user?.plate ? <div className="carcard-plate">{session.plate || user.plate}</div> : null}
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
              <div className="carcard-k">To pay</div>
              <div className="carcard-v is-fee">{rupees(due)}</div>
            </div>
          </div>
          <div className="carcard-actions">
            <Button variant="secondary" icon="walk" onClick={() => navigate(`/floor/${encodeURIComponent(session.floorId)}?find=1`)}>
              Find my car
            </Button>
            <Button variant="primary" icon="ticket" onClick={() => setExitOpen(true)}>
              Exit
            </Button>
          </div>
        </div>
        <p className="feenote">
          {graceLeft > 0
            ? `Leave within ${graceLeft} min and it's free.`
            : session.rate
              ? `${rupees(session.rate.firstHour)} for the first hour, then ${rupees(session.rate.perAdditionalHour)} an hour, capped at ${rupees(session.rate.dailyCap)} a day.${credit ? ` Your ${rupees(credit)} hold fee is credited.` : ''}`
              : 'Fee updates every 30 seconds.'}
        </p>
        <div className="fastag-line">
          <Icon name="ticket" size={18} />
          <span>
            {tag ? (
              <>
                Exit is automatic. The fee goes to FASTag {maskTag(tag)}, wallet {rupees(user?.walletBalance ?? 0)}.
              </>
            ) : (
              <>
                <Link to="/profile">Link your FASTag</Link> to drive out without stopping. Wallet {rupees(user?.walletBalance ?? 0)}.
              </>
            )}
          </span>
        </div>
        <ExitSheet
          open={exitOpen}
          session={session}
          quote={{ feeNow: fee, holdCredit: credit, dueNow: due }}
          user={user}
          toast={toast}
          onWallet={setWalletBalance}
          onClose={() => setExitOpen(false)}
          onExited={() => {
            setExitOpen(false);
            setSession(null);
            setServerFee(null);
            navigate('/');
          }}
        />
      </div>
    );
  } else if (hold) {
    body = (
      <div className="screen-inner screen-enter">
        {!desktop && mapEl ? <div className="carmap">{mapEl}</div> : null}
        <HoldCard hold={hold} showRoute={false} onCancel={cancel} onArrived={parked} onExtend={(d) => setPendingDelta(d)} onOpenFloor={() => navigate(`/floor/${encodeURIComponent(hold.floorId)}`)} busy={busy} arrived={arrived} />
        <ConfirmSheet
          open={!!pendingDelta}
          icon={pendingDelta > 0 ? 'plus' : 'minus'}
          title={pendingDelta > 0 ? 'Add 15 minutes?' : 'Shorten by 15 minutes?'}
          body={pendingDelta > 0 ? 'The extra time is charged now and credited back at exit.' : 'The unused time goes straight back to your wallet.'}
          rows={[
            ['New end time', clock(new Date(new Date(hold.expiresAt).getTime() + pendingDelta * 60000).toISOString())],
            [pendingDelta > 0 ? 'Charged now' : 'Refunded now', rupees(Math.round(hold.holdFee / Math.max(1, Math.round(hold.minutes / 15)))), pendingDelta > 0 ? '' : 'is-credit'],
          ]}
          confirmLabel={pendingDelta > 0 ? 'Add 15 min' : 'Shorten'}
          busy={busy === 'extend'}
          onConfirm={() => extend(pendingDelta)}
          onClose={() => setPendingDelta(0)}
        />
        <p className="feenote">{arrived ? 'You have arrived. Park in your spot, then tap "I\'ve parked" to start the timer.' : 'Show the code at the gate, park in your spot, then tap "I\'ve parked".'}</p>
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

  if (desktop && mapEl) {
    return (
      <div className="split">
        <aside className="panel">
          {head}
          {body}
        </aside>
        <div className="stage">{mapEl}</div>
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
