import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp, useLiveEvent } from '../store.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { navigate } from '../router.jsx';
import { FloorPlan, Legend } from '../components/FloorPlan.jsx';
import { ReservationCard, RouteSteps } from '../components/ReservationCard.jsx';
import { Icon } from '../components/Icons.jsx';
import { Button, ErrorState, IconButton, Pill, ScreenHeader, Skeleton } from '../components/Primitives.jsx';
import { walkMeters, walkTime, reverseSteps } from '../lib/format.js';

const DURATIONS = [15, 30, 60];

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

function SlotCard({ slot, floor, minutes, setMinutes, onHold, onParkHere, onClose, busy, isBest }) {
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
          <div className="seg" role="radiogroup" aria-label="Hold duration">
            {DURATIONS.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} className={`seg-btn ${minutes === m ? 'is-active' : ''}`} onClick={() => setMinutes(m)}>
                {m} min
              </button>
            ))}
          </div>
          <div className="slotcard-actions">
            <Button variant="primary" size="lg" onClick={onHold} loading={busy === 'hold'} disabled={!!busy}>
              Hold this spot
            </Button>
          </div>
          <div className="slotcard-note">
            Free to hold for {minutes} minutes. Already parked here?{' '}
            <button type="button" className="linkbtn" onClick={onParkHere} disabled={!!busy}>
              Start the timer
            </button>
            .
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
  const { reservation, setReservation, session, setSession, toast, refreshActive } = useApp();
  const [floor, setFloor] = useState(null);
  const [error, setError] = useState(null);
  const [venue, setVenue] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [minutes, setMinutes] = useState(30);
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
  const myReservation = reservation && reservation.floorId === id ? reservation : null;
  const mySlotId = findMode ? session.slotId : myReservation ? myReservation.slotId : session?.floorId === id ? session.slotId : null;
  const routeSlotId = findMode ? session.slotId : myReservation?.slotId || null;
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

  const hold = async () => {
    if (!slot) return;
    setBusy('hold');
    try {
      const r = await api.reserve(slot.id, minutes);
      const res = r?.reservation ?? r;
      setReservation(res);
      setSlotStatus(res.slotId, 'reserved');
      setSelectedId(null);
      toast(`Spot ${res.slotCode} is yours for ${minutes} minutes.`, { kind: 'success' });
    } catch (e) {
      toast(e.status === 409 ? 'Someone just took that spot. Pick another.' : e.message, { kind: 'error' });
      setReload((n) => n + 1);
    } finally {
      setBusy(null);
    }
  };

  const parkHere = async () => {
    if (!slot) return;
    setBusy('park');
    try {
      const r = await api.startSession({ slotId: slot.id });
      setSession(r?.session ?? r);
      setSlotStatus(slot.id, 'occupied');
      setReservation(null);
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
    if (!myReservation) return;
    setBusy('cancel');
    try {
      await api.cancelReservation(myReservation.id);
      setSlotStatus(myReservation.slotId, 'free');
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
    if (!myReservation) return;
    setBusy('park');
    try {
      const r = await api.startSession({ reservationId: myReservation.id });
      setSession(r?.session ?? r);
      setSlotStatus(myReservation.slotId, 'occupied');
      setReservation(null);
      toast(`Parked at ${myReservation.slotCode}. Timer running.`, { kind: 'success' });
      navigate('/car');
    } catch (e) {
      toast(e.message, { kind: 'error' });
      refreshActive();
    } finally {
      setBusy(null);
    }
  };

  const venueName = floor?.venue?.name || venue?.name || '';
  const subtitle = floor ? `Floor ${floor.name}, ${counts.free} of ${counts.total} free` : '';
  const head = <ScreenHeader title={venueName || 'Floor plan'} subtitle={subtitle} fallback={venueId ? `/venue/${encodeURIComponent(venueId)}` : '/'} />;

  let card = null;
  if (findMode) card = <FindCard session={session} route={route} loading={routeLoading} onBack={() => navigate('/car')} />;
  else if (myReservation) card = <ReservationCard reservation={myReservation} route={route} routeLoading={routeLoading} onCancel={cancel} onParked={parked} busy={busy} />;
  else if (slot) card = <SlotCard slot={slot} floor={floor} minutes={minutes} setMinutes={setMinutes} onHold={hold} onParkHere={parkHere} onClose={() => setSelectedId(null)} busy={busy} isBest={slot.id === floor?.recommendedSlotId} />;

  const otherHold =
    reservation && reservation.floorId !== id ? (
      <div className="hint" style={{ margin: '0 12px 10px' }}>
        <Icon name="ticket" size={18} />
        <span>
          You're already holding {reservation.slotCode} on floor {reservation.floorName} at {reservation.venueName}.{' '}
          <button type="button" className="linkbtn" onClick={() => navigate(`/floor/${encodeURIComponent(reservation.floorId)}`)}>
            Open it
          </button>
        </span>
      </div>
    ) : null;

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
                  <span>Tap a green slot to hold it. The one marked "Best for you" is the closest free slot that matches your preferences.</span>
                </div>
              )}
              {floor ? (
                <div className="rates" aria-label="Free right now">
                  <div className="rate">
                    <div className="rate-v num">{counts.free}</div>
                    <div className="rate-k">free of {counts.total}</div>
                  </div>
                  <div className="rate">
                    <div className="rate-v num">{counts.ev}</div>
                    <div className="rate-k">EV free</div>
                  </div>
                  <div className="rate">
                    <div className="rate-v num">{counts.acc}</div>
                    <div className="rate-k">accessible free</div>
                  </div>
                  <div className="rate">
                    <div className="rate-v num">{slots.filter((s) => s.status === 'reserved').length}</div>
                    <div className="rate-k">on hold</div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </aside>
        <div className="stage floor-stage">{plan}</div>
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
          <div ref={sheetRef} className="slotsheet" role="dialog" aria-label={findMode ? 'Walking directions' : myReservation ? 'Your hold' : 'Slot details'}>
            <div className="bsheet-grip" aria-hidden="true">
              <span className="sheet-grab" />
            </div>
            {card}
          </div>
        ) : null}
      </div>
    </div>
  );
}
