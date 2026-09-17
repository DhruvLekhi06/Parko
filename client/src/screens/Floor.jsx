import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp, useLiveEvent } from '../store.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { navigate } from '../router.jsx';
import { FloorPlan, Legend } from '../components/FloorPlan.jsx';
import { HoldCard, RouteSteps } from '../components/HoldCard.jsx';
import { BookSheet } from '../components/BookSheet.jsx';
import { Icon } from '../components/Icons.jsx';
import { Button, ErrorState, IconButton, Pill, ScreenHeader, Skeleton } from '../components/Primitives.jsx';
import { walkMeters, walkTime, reverseSteps, rupees, minutes as fmtMinutes } from '../lib/format.js';

function FloorTabs({ floors, activeId }) {
  if (!floors?.length) return null;
  return (
    <div className="floortabs" role="tablist" aria-label="Floors">
      {floors.map((f) => (
        <button key={f.id} type="button" role="tab" aria-selected={f.id === activeId} className={`floortab ${f.id === activeId ? 'is-active' : ''} ${!f.free ? 'is-full' : ''}`} onClick={() => f.id !== activeId && navigate(`/floor/${encodeURIComponent(f.id)}`, { replace: true })}>
          {f.name}
          <span className="floortab-free num">{f.free ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

function SlotCard({ slot, holdFee, etaMin, onHold, onParkHere, onClose, busy, isBest, parkMode }) {
  const meters = walkMeters(slot.distToEntrance);
  const free = slot.status === 'free';
  const note = slot.status === 'occupied' ? 'Taken right now. Pick a green one.' : slot.status === 'reserved' ? 'Held by another driver for now.' : null;
  return (
    <div className="slotcard">
      <div className="slotcard-head">
        <div>
          <div className="slotcard-code">{slot.code}</div>
          <div className="slotcard-sub">
            <span>
              <Icon name="walk" size={14} /> {meters} m from the entrance, {walkTime(meters)}
            </span>
          </div>
          <div className="slotcard-tags">
            {isBest ? (
              <Pill tone="green" dot>
                Best for you
              </Pill>
            ) : null}
            {slot.type === 'ev' ? (
              <Pill tone="ev">
                <Icon name="bolt" size={12} /> EV charging
              </Pill>
            ) : slot.type === 'accessible' ? (
              <Pill tone="acc">
                <Icon name="accessible" size={12} /> Accessible
              </Pill>
            ) : (
              <Pill tone="muted">Standard</Pill>
            )}
            <Pill tone={free ? 'green' : slot.status === 'reserved' ? 'amber' : 'muted'}>{free ? 'Free' : slot.status === 'reserved' ? 'Reserved' : 'Occupied'}</Pill>
          </div>
        </div>
        <IconButton name="close" label="Close" onClick={onClose} />
      </div>
      {free ? (
        <>
          <div className="slotcard-actions">
            {parkMode ? (
              <Button variant="primary" size="lg" icon="check" onClick={onParkHere} loading={busy === 'park'} disabled={!!busy}>
                I've parked here
              </Button>
            ) : (
              <Button variant="primary" size="lg" icon="ticket" onClick={onHold} disabled={!!busy}>
                Book slot, from {rupees(holdFee)}
              </Button>
            )}
          </div>
          <div className="slotcard-note">
            {parkMode ? (
              <>
                Timer and fee start now. Want it held instead?{' '}
                <button type="button" className="linkbtn" onClick={onHold} disabled={!!busy}>
                  Book this slot
                </button>
                .
              </>
            ) : (
              <>
                Hold it for 15, 30 or 60 min, {rupees(holdFee)} per 15 min, credited at exit. Already parked here?{' '}
                <button type="button" className="linkbtn" onClick={onParkHere} disabled={!!busy}>
                  Start the timer
                </button>
                .
              </>
            )}
          </div>
        </>
      ) : (
        <div className="slotcard-note">{note}</div>
      )}
    </div>
  );
}

function FindCard({ session, route, loading, onBack }) {
  const steps = route ? reverseSteps(route.steps) : null;
  return (
    <div className="rescard">
      <div className="rescard-top">
        <div>
          <div className="rescard-title">Your car is at {session.slotCode}</div>
          <div className="rescard-sub">Follow the path back from the entrance.</div>
        </div>
      </div>
      <RouteSteps route={route} loading={loading} steps={steps} reversed title="Walking directions" />
      <div className="rescard-actions">
        <Button variant="secondary" icon="car" onClick={onBack}>
          Back to My Car
        </Button>
      </div>
    </div>
  );
}

export default function Floor({ id, query }) {
  const desktop = useDesktop();
  const { hold: activeHold, setHold, session, setSession, toast, refreshActive, position, user, setWalletBalance, openAuth } = useApp();
  const [floor, setFloor] = useState(null);
  const [error, setError] = useState(null);
  const [venue, setVenue] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [focus, setFocus] = useState(null);
  const [reload, setReload] = useState(0);
  const [sheetH, setSheetH] = useState(0);
  const venueTimer = useRef(null);
  const sheetRef = useCallback((el) => {
    if (!el) {
      setSheetH(0);
      return;
    }
    const ro = new ResizeObserver(() => setSheetH(el.getBoundingClientRect().height));
    ro.observe(el);
    setSheetH(el.getBoundingClientRect().height);
  }, []);

  const findMode = query?.find === '1' && session && session.floorId === id;
  const parkMode = query?.park === '1' && !session;
  const bookMode = query?.book === '1';
  const myHold = activeHold && activeHold.floorId === id ? activeHold : null;
  const mySlotId = findMode ? session.slotId : myHold ? myHold.slotId : session?.floorId === id ? session.slotId : null;
  const routeSlotId = findMode ? session.slotId : myHold?.slotId || null;
  const routeKey = routeSlotId ? `${routeSlotId}-${findMode ? 'find' : 'res'}` : null;

  useEffect(() => {
    let alive = true;
    setFloor(null);
    setError(null);
    setSelectedId(null);
    api
      .floor(id)
      .then((d) => alive && setFloor(d?.floor ?? d))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [id, reload]);

  const venueId = floor?.venue?.id || floor?.venueId;
  const loadVenue = useCallback(() => {
    if (!venueId) return;
    api
      .venue(venueId)
      .then((d) => setVenue(d?.venue ?? d))
      .catch(() => {});
  }, [venueId]);

  useEffect(() => {
    loadVenue();
  }, [loadVenue]);

  useLiveEvent(
    (t, d) => {
      if (t === 'slot' && d.floorId === id) {
        setFloor((f) => (f ? { ...f, slots: f.slots.map((s) => (s.id === d.slotId ? { ...s, status: d.status } : s)) } : f));
      }
      if (t === 'venue' && d.venueId === venueId) {
        window.clearTimeout(venueTimer.current);
        venueTimer.current = window.setTimeout(loadVenue, 2500);
      }
    },
    [id, venueId, loadVenue]
  );

  useEffect(() => () => window.clearTimeout(venueTimer.current), []);

  useEffect(() => {
    if (!routeSlotId) {
      setRoute(null);
      return undefined;
    }
    let alive = true;
    setRouteLoading(true);
    api
      .route(routeSlotId)
      .then((r) => {
        if (!alive) return;
        setRoute(r?.route ?? r);
        setRouteLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setRoute(null);
        setRouteLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [routeSlotId]);

  useEffect(() => {
    if (mySlotId && floor) setFocus({ id: mySlotId, key: `${mySlotId}-${findMode ? 'find' : 'res'}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mySlotId, floor?.id, findMode]);

  const setSlotStatus = useCallback((sid, status) => {
    setFloor((f) => (f ? { ...f, slots: f.slots.map((s) => (s.id === sid ? { ...s, status } : s)) } : f));
  }, []);

  const slots = floor?.slots || [];
  const slot = useMemo(() => slots.find((s) => s.id === selectedId) || null, [slots, selectedId]);
  const counts = useMemo(() => {
    const free = slots.filter((s) => s.status === 'free');
    return { free: free.length, ev: free.filter((s) => s.type === 'ev').length, acc: free.filter((s) => s.type === 'accessible').length, total: slots.length };
  }, [slots]);

  const onSelectSlot = useCallback(
    (sid) => {
      if (!sid) {
        setSelectedId(null);
        return;
      }
      if (sid === mySlotId) {
        setSelectedId(null);
        return;
      }
      setSelectedId(sid);
    },
    [mySlotId]
  );

  useEffect(() => {
    if (!bookMode || !floor?.recommendedSlotId || myHold || session) return;
    setSelectedId(floor.recommendedSlotId);
    setFocus({ id: floor.recommendedSlotId, key: `${floor.recommendedSlotId}-book` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor?.id, bookMode]);

  const onBooked = (r) => {
    const h = r?.hold;
    setBooking(null);
    if (!h) return;
    setHold(h);
    setSlotStatus(h.slotId, 'reserved');
    setSelectedId(null);
    toast(`${h.slotCode} is booked until ${new Date(h.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`, { kind: 'success' });
  };

  const parkHere = async () => {
    if (!slot) return;
    if (user?.isGuest) {
      openAuth(() => parkHere());
      return;
    }
    setBusy('park');
    try {
      const r = await api.startSession({ slotId: slot.id });
      setSession(r?.session ?? r);
      setSlotStatus(slot.id, 'occupied');
      setHold(null);
      toast(`Parked at ${slot.code}. Timer running.`, { kind: 'success' });
      navigate('/car');
    } catch (e) {
      toast(e.status === 409 ? 'That spot is not available any more.' : e.message, { kind: 'error' });
      setReload((n) => n + 1);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!myHold) return;
    setBusy('cancel');
    try {
      const r = await api.cancelHold(myHold.id);
      setSlotStatus(myHold.slotId, 'free');
      setHold(null);
      setWalletBalance(r?.walletBalance);
      toast(r?.refunded ? `Booking cancelled. ${rupees(r.refunded)} back.` : 'Booking cancelled.');
    } catch (e) {
      toast(e.message, { kind: 'error' });
      refreshActive();
    } finally {
      setBusy(null);
    }
  };

  const parked = async () => {
    if (!myHold) return;
    setBusy('park');
    try {
      const r = await api.arrive(myHold.id);
      setSession(r?.session ?? r);
      setSlotStatus(myHold.slotId, 'occupied');
      setHold(null);
      toast(`Parked at ${myHold.slotCode}. Timer running.`, { kind: 'success' });
      navigate('/car');
    } catch (e) {
      toast(e.message, { kind: 'error' });
      refreshActive();
    } finally {
      setBusy(null);
    }
  };

  const extend = async (delta = 15) => {
    if (!myHold) return;
    setBusy('extend');
    try {
      const r = await api.extendHold(myHold.id, delta);
      setHold(r?.hold ?? myHold);
      setWalletBalance(r?.walletBalance);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const venueName = floor?.venue?.name || venue?.name || '';
  const subtitle = floor ? `Floor ${floor.name}, ${counts.free} of ${counts.total} free` : '';
  const head = <ScreenHeader title={venueName || 'Floor plan'} subtitle={subtitle} fallback={venueId ? `/venue/${encodeURIComponent(venueId)}` : '/'} />;

  let card = null;
  if (findMode) card = <FindCard session={session} route={route} loading={routeLoading} onBack={() => navigate('/car')} />;
  else if (myHold) card = <HoldCard hold={myHold} route={route} routeLoading={routeLoading} onCancel={cancel} onArrived={parked} onExtend={extend} busy={busy} />;
  else if (slot) card = <SlotCard slot={slot} holdFee={venue?.holdFee ?? 2000} etaMin={venue?.etaMin ?? 30} onHold={() => setBooking(slot)} onParkHere={parkHere} onClose={() => setSelectedId(null)} busy={busy} isBest={slot.id === floor?.recommendedSlotId} parkMode={parkMode} />;

  const otherHold =
    activeHold && activeHold.floorId !== id ? (
      <div className="hint" style={{ margin: '0 12px 10px' }}>
        <Icon name="ticket" size={18} />
        <span>
          You're already holding {activeHold.slotCode} on floor {activeHold.floorName} at {activeHold.venueName}. Holding a spot here moves it (your fee carries over).{' '}
          <button type="button" className="linkbtn" onClick={() => navigate(`/floor/${encodeURIComponent(activeHold.floorId)}`)}>
            Open it
          </button>
        </span>
      </div>
    ) : null;

  const walletSheet = (
    <BookSheet
      open={!!booking}
      slot={booking}
      floorName={floor?.name}
      venue={venue ? { ...venue, holdFee: venue.holdFee ?? 2000 } : { name: venueName, holdFee: 2000, etaMin: 30 }}
      user={user}
      position={position}
      existingHold={activeHold && activeHold.slotId !== booking?.id ? activeHold : null}
      toast={toast}
      onWallet={setWalletBalance}
      onClose={() => setBooking(null)}
      onBooked={onBooked}
    />
  );

  const plan = error ? (
    <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />
  ) : !floor ? (
    <div className="floor-loading" aria-busy="true">
      <Skeleton w="86%" h="70%" r={16} style={{ margin: '8% auto' }} />
    </div>
  ) : (
    <FloorPlan floor={floor} slots={slots} selectedId={selectedId} onSelectSlot={onSelectSlot} mySlotId={mySlotId} recommendedId={floor.recommendedSlotId} route={route} routeKey={routeKey} entranceId={route?.entranceId} focusSlotId={focus?.id} focusKey={focus?.key} />
  );

  if (desktop) {
    return (
      <div className="split">
        <aside className="panel">
          {head}
          <div className="screen-inner">
            <FloorTabs floors={venue?.floors} activeId={id} />
            <Legend />
            {otherHold}
            <div className="stack" style={{ marginTop: 8 }}>
              {card || (
                <div className="hint">
                  <Icon name="info" size={18} />
                  <span>Tap a green slot to book it. "Best for you" is the closest free spot for you.</span>
                </div>
              )}
              {floor ? (
                <div className="stats is-grid2" aria-label="Free right now">
                  <div className="stat">
                    <div className="stat-k">Free</div>
                    <div className="stat-v num">{counts.free}</div>
                    <div className="stat-sub">of {counts.total}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-k">EV free</div>
                    <div className="stat-v num">{counts.ev}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-k">Accessible</div>
                    <div className="stat-v num">{counts.acc}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-k">Booked</div>
                    <div className="stat-v num">{slots.filter((s) => s.status === 'reserved').length}</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
        <div className="stage floor-stage">{plan}</div>
        {walletSheet}
      </div>
    );
  }

  return (
    <div className="floor-screen" style={{ '--stage-bottom': `${card ? sheetH : 0}px` }}>
      <div className="floor-head">
        {head}
        <FloorTabs floors={venue?.floors} activeId={id} />
        <Legend compact />
        {otherHold}
      </div>
      <div className="floor-stage">
        {plan}
        {card ? (
          <div ref={sheetRef} className="slotsheet" role="dialog" aria-label={findMode ? 'Walking directions' : myHold ? 'Your hold' : 'Slot details'}>
            <div className="bsheet-grip" aria-hidden="true">
              <span className="sheet-grab" />
            </div>
            {card}
          </div>
        ) : null}
      </div>
      {walletSheet}
    </div>
  );
}
