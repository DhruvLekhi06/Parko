import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp, useLiveEvent } from '../store.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { navigate } from '../router.jsx';
import { VenueMap } from '../components/VenueMap.jsx';
import { Sparkline } from '../components/Sparkline.jsx';
import { Icon, TYPE_ICON } from '../components/Icons.jsx';
import { Button, Count, ErrorState, FillBar, Pill, ScreenHeader, Skeleton } from '../components/Primitives.jsx';
import { WalletSheet } from '../components/WalletSheet.jsx';
import { rupees, distance, minutes, levelInfo, TYPE_LABELS, AMENITY_LABELS, hoursLabel, clock } from '../lib/format.js';

const TREND = {
  rising: { icon: 'trendUp', label: 'Opening up', tone: 'green' },
  falling: { icon: 'trendDown', label: 'Going fast', tone: 'red' },
  steady: { icon: 'trendFlat', label: 'Steady', tone: 'muted' },
};

function VenueSkeleton() {
  return (
    <div className="screen-inner" aria-busy="true">
      <div style={{ paddingTop: 8 }} className="stack">
        <Skeleton w={90} h={24} r={12} />
        <Skeleton w="70%" h={26} />
        <Skeleton w="50%" h={14} />
        <Skeleton w="100%" h={150} r={16} style={{ marginTop: 12 }} />
        <Skeleton w="100%" h={90} r={16} />
        <Skeleton w="100%" h={72} r={14} />
        <Skeleton w="100%" h={72} r={14} />
      </div>
    </div>
  );
}

function Body({ v, alts, onHold, holdBusy, hold, session }) {
  const lvl = levelInfo(v.level);
  const trend = TREND[v.trend] || TREND.steady;
  const floors = v.floors || [];
  const bestFloor = floors.reduce((a, f) => (!a || (f.free || 0) > (a.free || 0) ? f : a), null);
  const full = v.level === 'full' || (v.total && !v.free);
  const occ = v.total ? 1 - (v.free || 0) / v.total : v.occupancy || 0;
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}&travelmode=driving`;
  const holdUntil = new Date(Date.now() + ((v.etaMin || 0) + 15) * 60000).toISOString();
  const holdingHere = hold && hold.venueId === v.id;

  return (
    <div className="screen-inner screen-enter">
      <div className="venue-hero">
        <div className="venue-type">
          <Pill tone="muted">
            <Icon name={TYPE_ICON[v.type] || 'public'} size={14} />
            {TYPE_LABELS[v.type] || v.type}
          </Pill>
          <Pill tone={v.isOpen ? 'green' : 'red'} dot>
            {v.isOpen ? hoursLabel(v) : 'Closed'}
          </Pill>
        </div>
        <h1 className="venue-name">{v.name}</h1>
        <p className="venue-addr">
          {v.address}
          {v.city ? `, ${v.city}` : ''}
        </p>
      </div>

      <section className="stats" aria-label="Right now">
        <div className="stat is-hero">
          <div className="stat-k">Free now</div>
          <div className={`stat-v num tone-text-${lvl.tone}`}>{full ? 'Full' : <Count value={v.free} />}</div>
          <div className="stat-sub">
            of {v.total}
            <span className={`stat-trend tone-text-${trend.tone}`}>
              <Icon name={trend.icon} size={13} />
              {trend.label}
            </span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-k">Drive</div>
          <div className="stat-v num">{minutes(v.etaMin)}</div>
          <div className="stat-sub">{distance(v.distanceM)}</div>
        </div>
        <div className="stat">
          <div className="stat-k">Hold</div>
          <div className="stat-v num">{rupees(v.holdFee)}</div>
          <div className="stat-sub">credited at exit</div>
        </div>
      </section>

      <section className="avail is-compact" aria-label="Last 24 hours">
        <FillBar value={occ} tone={lvl.tone} />
        <Sparkline points={v.history || []} total={v.total} tone={lvl.tone} />
        <div className="spark-axis" aria-hidden="true">
          <span>24h ago</span>
          <span>Now</span>
        </div>
        <div className="avail-split">
          {v.freeEv != null ? (
            <Pill tone="ev">
              <Icon name="bolt" size={13} />
              {v.freeEv} EV
            </Pill>
          ) : null}
          {v.freeAccessible != null ? (
            <Pill tone="acc">
              <Icon name="accessible" size={13} />
              {v.freeAccessible} accessible
            </Pill>
          ) : null}
        </div>
      </section>

      {full ? (
        <div className="fullnote" role="status">
          <div className="fullnote-title">Full right now</div>
          <div className="fullnote-body">Nearest places with free spots:</div>
          {alts ? (
            alts.length ? (
              <div className="alts">
                {alts.map((a) => (
                  <button key={a.id} type="button" className="alt" onClick={() => navigate(`/venue/${encodeURIComponent(a.id)}`)}>
                    <span>
                      <span className="alt-name">{a.name}</span>
                      <span className="alt-sub">
                        {' '}
                        {distance(a.distanceM)} away, {minutes(a.etaMin)}
                      </span>
                    </span>
                    <span className="alt-free">{a.free} free</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="fullnote-body">Nothing free nearby at the moment.</div>
            )
          ) : (
            <div className="alts">
              <Skeleton h={48} r={12} />
              <Skeleton h={48} r={12} />
            </div>
          )}
        </div>
      ) : null}

      <section className="section" aria-label="Floors">
        <div className="section-title">Floors</div>
        <div className="floorchips">
          {floors.map((f) => (
            <button key={f.id} type="button" className={`floorchip ${!f.free ? 'is-full' : ''}`} onClick={() => navigate(`/floor/${encodeURIComponent(f.id)}`)}>
              <span className="floorchip-name">{f.name}</span>
              <span className="floorchip-free num">{f.free}</span>
              <span className="floorchip-sub">{f.free ? 'free' : 'full'}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section" aria-label="Good to know">
        <div className="section-title">Good to know</div>
        <div className="facts">
          <span>
            <Icon name="card" size={15} />
            {rupees(v.rate?.firstHour)} first hour, then {rupees(v.rate?.perAdditionalHour)} an hour
          </span>
          <span>
            <Icon name="clock" size={15} />
            {v.rate?.freeMinutes ? `${v.rate.freeMinutes} min free, ` : ''}
            {rupees(v.rate?.dailyCap)} daily cap
          </span>
        </div>
        {v.amenities?.length ? (
          <div className="amenities" style={{ marginTop: 10 }}>
            {v.amenities.map((a) => (
              <span key={a} className={`amenity ${a === 'ev' ? 'is-ev' : ''} ${a === 'accessible' ? 'is-acc' : ''}`}>
                <Icon name={a === 'ev' ? 'bolt' : a === 'accessible' ? 'accessible' : 'check'} size={14} />
                {AMENITY_LABELS[a] || a}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {session ? (
        <div className="hint" style={{ marginTop: 20 }}>
          <Icon name="car" size={18} />
          <span>
            You're parked at {session.venueName}, {session.slotCode}.{' '}
            <button type="button" className="linkbtn" onClick={() => navigate('/car')}>
              Open My Car
            </button>
          </span>
        </div>
      ) : full ? null : (
        <div className="venue-cta is-hold">
          <Button variant="primary" size="lg" block icon={holdingHere ? 'car' : 'ticket'} loading={holdBusy} onClick={holdingHere ? () => navigate('/car') : onHold}>
            {holdingHere ? `Holding ${hold.slotCode}, open My Car` : hold ? `Switch my hold here, ${rupees(v.holdFee)}` : `Hold a spot, ${rupees(v.holdFee)}`}
          </Button>
          <div className="holdcta-sub">
            {holdingHere ? `Held until ${clock(hold.expiresAt)}. Gate code ${hold.code}.` : `Held until ${clock(holdUntil)}. ${rupees(v.holdFee)} credited at exit, full refund within 5 min.`}
          </div>
          <div className="holdcta-alt">
            {bestFloor ? (
              <button type="button" className="linkbtn" onClick={() => navigate(`/floor/${encodeURIComponent(bestFloor.id)}`)}>
                Choose my own spot
              </button>
            ) : null}
            <a className="linkbtn" href={directions} target="_blank" rel="noopener noreferrer">
              Directions
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Venue({ id }) {
  const desktop = useDesktop();
  const { position, hold, setHold, session, user, setWalletBalance, toast } = useApp();
  const [holdBusy, setHoldBusy] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [walletNeed, setWalletNeed] = useState(0);
  const [venue, setVenue] = useState(null);
  const [error, setError] = useState(null);
  const [alts, setAlts] = useState(null);
  const [reload, setReload] = useState(0);
  const refetchTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    setVenue(null);
    setError(null);
    setAlts(null);
    api
      .venue(id, { lat: position.lat, lng: position.lng })
      .then((d) => alive && setVenue(d?.venue ?? d))
      .catch((e) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [id, reload, position.lat, position.lng]);

  useEffect(() => {
    if (!venue) return undefined;
    const full = venue.level === 'full' || !venue.free;
    if (!full || alts) return undefined;
    let alive = true;
    api
      .venues({ lat: venue.lat, lng: venue.lng })
      .then((d) => {
        if (!alive) return;
        const list = (d?.venues || []).filter((x) => x.id !== venue.id && (x.free || 0) > 0 && x.isOpen !== false).slice(0, 2);
        setAlts(list);
      })
      .catch(() => alive && setAlts([]));
    return () => {
      alive = false;
    };
  }, [venue, alts]);

  useLiveEvent(
    (t, d) => {
      if (t !== 'venue' || d.venueId !== id) return;
      setVenue((v) => (v ? { ...v, free: d.free ?? v.free, freeEv: d.freeEv ?? v.freeEv, freeAccessible: d.freeAccessible ?? v.freeAccessible, level: d.level ?? v.level, trend: d.trend ?? v.trend } : v));
      window.clearTimeout(refetchTimer.current);
      refetchTimer.current = window.setTimeout(() => {
        api
          .venue(id, { lat: position.lat, lng: position.lng })
          .then((r) => setVenue((v) => (v ? { ...v, ...(r?.venue ?? r) } : v)))
          .catch(() => {});
      }, 3000);
    },
    [id, position.lat, position.lng]
  );

  useEffect(() => () => window.clearTimeout(refetchTimer.current), []);

  const holdHere = async () => {
    if (!venue) return;
    setHoldBusy(true);
    try {
      const r = await api.holdSpot({ venueId: venue.id, etaMinutes: venue.etaMin, origin: position.source === 'gps' ? { lat: position.lat, lng: position.lng } : undefined });
      setHold(r.hold);
      setWalletBalance(r.walletBalance);
      toast(`${r.hold.slotCode} on floor ${r.hold.floorName} is yours until ${clock(r.hold.expiresAt)}.`, { kind: 'success', duration: 6000 });
      navigate('/car');
    } catch (e) {
      if (e.code === 'INSUFFICIENT_BALANCE') {
        setWalletNeed(e.details?.shortfall || venue.holdFee);
        setWalletOpen(true);
      } else if (e.code === 'VENUE_FULL') {
        toast('It just filled up. Try one of the places nearby.', { kind: 'error' });
        setReload((n) => n + 1);
      } else toast(e.message, { kind: 'error' });
    } finally {
      setHoldBusy(false);
    }
  };

  const head = <ScreenHeader fallback="/" />;
  const body = error ? <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} /> : !venue ? <VenueSkeleton /> : <Body v={venue} alts={alts} onHold={holdHere} holdBusy={holdBusy} hold={hold} session={session} />;
  const walletSheet = (
    <WalletSheet
      open={walletOpen}
      needed={walletNeed}
      balance={user?.walletBalance ?? 0}
      toast={toast}
      onClose={() => setWalletOpen(false)}
      onDone={(b) => {
        setWalletBalance(b);
        setWalletOpen(false);
        holdHere();
      }}
    />
  );

  if (desktop) {
    return (
      <div className="split">
        <aside className="panel">
          {head}
          {body}
        </aside>
        <div className="stage">
          <VenueMap center={venue ? { lat: venue.lat, lng: venue.lng } : position} zoom={venue ? 15 : 12} venues={venue ? [venue] : []} selectedId={venue?.id} user={position.source === 'gps' ? { lat: position.lat, lng: position.lng } : null} showZoom focus={venue ? { lat: venue.lat, lng: venue.lng, zoom: 15, key: venue.id } : null} />
        </div>
        {walletSheet}
      </div>
    );
  }
  return (
    <div className="screen">
      {head}
      {body}
      {walletSheet}
    </div>
  );
}
