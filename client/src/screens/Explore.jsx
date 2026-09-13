import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp, useLiveEvent } from '../store.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { useDebounced } from '../hooks/useNow.js';
import { navigate } from '../router.jsx';
import { VenueMap } from '../components/VenueMap.jsx';
import { BottomSheet } from '../components/BottomSheet.jsx';
import { Icon, TYPE_ICON } from '../components/Icons.jsx';
import { Brand } from '../components/Nav.jsx';
import { Chip, Count, FillBar, Skeleton, EmptyState, ErrorState, Button, IconButton } from '../components/Primitives.jsx';
import { rupees, distance, minutes, levelInfo, TYPE_LABELS } from '../lib/format.js';

const TYPES = ['all', 'mall', 'hospital', 'metro', 'rail', 'stadium', 'airport', 'public'];
const TOP_INSET = 124;

function VenueItem({ v, selected, onOpen, itemRef }) {
  const lvl = levelInfo(v.level);
  const closed = v.isOpen === false;
  const occ = v.total ? 1 - (v.free || 0) / v.total : v.occupancy || 0;
  return (
    <li>
      <button ref={itemRef} type="button" className={`vitem ${selected ? 'is-selected' : ''} ${closed ? 'is-closed' : ''}`} onClick={onOpen}>
        <span className={`vitem-glyph type-${v.type}`} aria-hidden="true">
          <Icon name={TYPE_ICON[v.type] || 'public'} size={22} />
        </span>
        <span className="vitem-main">
          <span className="vitem-name">{v.name}</span>
          <span className="vitem-meta">
            {distance(v.distanceM)}, {minutes(v.etaMin)} drive{closed ? ', closed now' : ''}
          </span>
          <span className="vitem-avail">
            <span className={`tone-text-${lvl.tone}`}>
              {v.level === 'full' ? (
                'Full right now'
              ) : (
                <>
                  <Count value={v.free} /> {v.free === 1 ? 'spot' : 'spots'} free
                </>
              )}
            </span>
            <FillBar value={occ} tone={lvl.tone} />
          </span>
        </span>
        <span className="vitem-side">
          <span className="vitem-rate num">{rupees(v.rate?.firstHour)}</span>
          <span className="vitem-rate-sub">first hour</span>
        </span>
      </button>
    </li>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading venues">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="vitem-skel">
          <Skeleton w={44} h={44} r={14} />
          <div className="stack" style={{ gap: 8 }}>
            <Skeleton w="62%" h={14} />
            <Skeleton w="44%" h={11} />
            <Skeleton w="70%" h={11} />
          </div>
          <div className="stack" style={{ gap: 6, alignItems: 'flex-end' }}>
            <Skeleton w={38} h={14} />
            <Skeleton w={48} h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Explore() {
  const { position } = useApp();
  const desktop = useDesktop();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [ev, setEv] = useState(false);
  const [acc, setAcc] = useState(false);
  const [venues, setVenues] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [snap, setSnap] = useState('half');
  const [focus, setFocus] = useState(null);
  const [bannerGone, setBannerGone] = useState(false);
  const [reload, setReload] = useState(0);
  const dq = useDebounced(q.trim(), 250);
  const itemRefs = useRef(new Map());

  useEffect(() => {
    let alive = true;
    api
      .venues({ lat: position.lat, lng: position.lng, type: type === 'all' ? undefined : type, ev: ev ? 1 : undefined, accessible: acc ? 1 : undefined, q: dq || undefined })
      .then((d) => {
        if (!alive) return;
        setVenues(d?.venues || []);
        setError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e);
      });
    return () => {
      alive = false;
    };
  }, [position.lat, position.lng, type, ev, acc, dq, reload]);

  useEffect(() => {
    if (position.source === 'gps') setFocus({ lat: position.lat, lng: position.lng, zoom: 13, key: 'gps' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.source]);

  useLiveEvent((t, d) => {
    if (t !== 'venue') return;
    setVenues((vs) =>
      vs
        ? vs.map((v) => {
            if (v.id !== d.venueId) return v;
            const free = d.free ?? v.free;
            return { ...v, free, freeEv: d.freeEv ?? v.freeEv, freeAccessible: d.freeAccessible ?? v.freeAccessible, level: d.level ?? v.level, trend: d.trend ?? v.trend, occupancy: v.total ? 1 - free / v.total : v.occupancy };
          })
        : vs
    );
  });

  const onSelectPin = useCallback(
    (id) => {
      setSelected(id);
      if (!id) return;
      if (!desktop && snap === 'peek') setSnap('half');
      const v = venues?.find((x) => x.id === id);
      if (v) setFocus({ lat: v.lat, lng: v.lng, key: Date.now() });
      window.requestAnimationFrame(() => itemRefs.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    },
    [desktop, snap, venues]
  );

  const open = (id) => navigate(`/venue/${encodeURIComponent(id)}`);
  const clearFilters = () => {
    setQ('');
    setType('all');
    setEv(false);
    setAcc(false);
  };
  const hasFilters = q || type !== 'all' || ev || acc;

  const sheetH = typeof window !== 'undefined' ? window.innerHeight - 132 : 600;
  const bottomPx = desktop ? 0 : snap === 'full' ? sheetH : snap === 'half' ? Math.round(sheetH * 0.5) : 156;
  const inset = desktop ? { top: 0, bottom: 0 } : { top: TOP_INSET, bottom: bottomPx };

  const banner =
    position.source === 'default' && !bannerGone ? (
      <div className="banner" role="status">
        <Icon name="alert" size={18} />
        <span className="banner-text">
          {position.reason === 'denied'
            ? 'Location is off, so this is central Bengaluru. Turn it on to see spots near you.'
            : position.reason === 'far'
              ? "You're outside Bengaluru. Showing spots around MG Road."
              : "Couldn't get your location. Showing central Bengaluru."}
        </span>
        {position.reason !== 'far' ? (
          <Button variant="ghost" size="sm" onClick={position.locate}>
            Retry
          </Button>
        ) : null}
        <IconButton name="close" label="Dismiss" onClick={() => setBannerGone(true)} />
      </div>
    ) : null;

  const search = (
    <div className="searchbar" role="search">
      <Icon name="search" size={20} />
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search malls, hospitals, stations" aria-label="Search venues" autoComplete="off" enterKeyHint="search" />
      {q ? <IconButton name="close" label="Clear search" size="sm" onClick={() => setQ('')} /> : null}
    </div>
  );

  const chips = (
    <div className="chiprow" role="group" aria-label="Filters">
      {TYPES.map((t) => (
        <Chip key={t} active={type === t} onClick={() => setType(t)}>
          {t === 'all' ? 'All' : TYPE_LABELS[t]}
        </Chip>
      ))}
      <span className="chiprow-sep" aria-hidden="true" />
      <Chip className="chip-ev" active={ev} onClick={() => setEv((x) => !x)} icon="bolt">
        EV
      </Chip>
      <Chip className="chip-acc" active={acc} onClick={() => setAcc((x) => !x)} icon="accessible">
        Accessible
      </Chip>
    </div>
  );

  const header = (
    <div className="row-between">
      <div>
        <div className="sheet-title">{venues ? `${venues.length} ${venues.length === 1 ? 'place' : 'places'} ${position.source === 'gps' ? 'near you' : 'nearby'}` : 'Finding spots'}</div>
        <div className="sheet-sub">Closest first. Counts update live.</div>
      </div>
    </div>
  );

  const list = error ? (
    <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} compact />
  ) : !venues ? (
    <ListSkeleton />
  ) : venues.length === 0 ? (
    <EmptyState icon="search" title="No spots match" body={hasFilters ? 'Try clearing a filter or searching for a different place.' : 'Nothing here yet. Check back in a moment.'} action={hasFilters ? 'Clear filters' : undefined} onAction={clearFilters} />
  ) : (
    <ul className="vlist">
      {venues.map((v) => (
        <VenueItem
          key={v.id}
          v={v}
          selected={v.id === selected}
          onOpen={() => open(v.id)}
          itemRef={(el) => {
            if (el) itemRefs.current.set(v.id, el);
            else itemRefs.current.delete(v.id);
          }}
        />
      ))}
    </ul>
  );

  const map = <VenueMap center={position} venues={venues || []} selectedId={selected} onSelect={onSelectPin} user={position.source === 'gps' ? { lat: position.lat, lng: position.lng } : null} inset={inset} showZoom={desktop} focus={focus} />;

  if (desktop) {
    return (
      <div className="split">
        <aside className="panel explore-panel" aria-label="Nearby parking">
          <div className="explore-panel-head">
            <Brand />
            {search}
            {chips}
            {banner}
          </div>
          <div className="explore-panel-list">
            <div className="bsheet-head">{header}</div>
            {list}
          </div>
        </aside>
        <div className="stage">{map}</div>
      </div>
    );
  }

  return (
    <div className="explore" style={{ '--map-bottom': `${bottomPx}px` }}>
      {map}
      <div className="explore-top">
        {search}
        {chips}
        {banner}
      </div>
      <BottomSheet snap={snap} onSnap={setSnap} header={header}>
        {list}
      </BottomSheet>
    </div>
  );
}
