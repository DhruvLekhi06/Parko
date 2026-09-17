import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ADMIN_KEY, adminKey } from '../api.js';
import { useApp, useLiveEvent } from '../store.jsx';
import { Button, ErrorState, Pill, ScreenHeader, Skeleton, FillBar, Toggle } from '../components/Primitives.jsx';
import { FloorPlan, Legend } from '../components/FloorPlan.jsx';
import { Icon } from '../components/Icons.jsx';
import { rupees, clock, dateLabel, TYPE_LABELS, TXN_LABELS, AMENITY_LABELS, minutes as fmtMinutes } from '../lib/format.js';

const TABS = [
  ['overview', 'Overview'],
  ['venues', 'Venues'],
  ['floors', 'Floors'],
  ['activity', 'Activity'],
  ['users', 'Users'],
  ['transactions', 'Transactions'],
];

function Gate({ onEnter }) {
  const [v, setV] = useState('');
  return (
    <div className="screen-inner screen-enter">
      <form
        className="card card-pad form admin-gate"
        onSubmit={(e) => {
          e.preventDefault();
          if (!v.trim()) return;
          try {
            window.localStorage.setItem(ADMIN_KEY, v.trim());
          } catch {
            /* ignore */
          }
          onEnter(v.trim());
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor="a-key">
            Operator key
          </label>
          <input id="a-key" className="input" type="password" value={v} onChange={(e) => setV(e.target.value)} placeholder="Enter the operator key" autoFocus autoComplete="off" />
          <span className="field-hint">Set by ADMIN_KEY on the server. Default in development: spoton-admin.</span>
        </div>
        <Button type="submit" variant="primary" block>
          Open portal
        </Button>
      </form>
    </div>
  );
}

function Tile({ k, v, sub, tone }) {
  return (
    <div className={`tile ${tone ? `tone-${tone}` : ''}`}>
      <div className="tile-k">{k}</div>
      <div className="tile-v num">{v}</div>
      {sub ? <div className="tile-sub">{sub}</div> : null}
    </div>
  );
}

const AMENITY_KEYS = ['ev', 'accessible', 'covered', 'cctv', 'valet', 'restroom', '24x7', 'carwash'];

function VenueEditor({ venue, onSaved, toast }) {
  const [v, setV] = useState({
    name: venue.name, address: venue.address || '', opens: venue.opens || '10:00', closes: venue.closes || '23:00', is24h: !!venue.is24h, published: venue.published !== false,
    amenities: venue.amenities || [],
    holdFee: venue.rate.holdFee / 100, firstHour: venue.rate.firstHour / 100, perAdditionalHour: venue.rate.perAdditionalHour / 100, dailyCap: venue.rate.dailyCap / 100, freeMinutes: venue.rate.freeMinutes,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await api.admin.updateVenue(venue.id, {
        name: v.name, address: v.address, opens: v.opens, closes: v.closes, is24h: v.is24h, published: v.published, amenities: v.amenities,
        rate: {
          holdFee: Math.round(Number(v.holdFee) * 100), firstHour: Math.round(Number(v.firstHour) * 100), perAdditionalHour: Math.round(Number(v.perAdditionalHour) * 100),
          dailyCap: Math.round(Number(v.dailyCap) * 100), freeMinutes: Math.round(Number(v.freeMinutes)),
        },
      });
      onSaved(out);
      toast('Venue saved.', { kind: 'success' });
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const F = ({ k, label, type = 'text', inputMode }) => (
    <label className="rate-field">
      <span>{label}</span>
      <input className="input" type={type} inputMode={inputMode} value={v[k]} onChange={set(k)} />
    </label>
  );
  return (
    <form className="form" onSubmit={save}>
      <div className="rate-editor">
        <F k="name" label="Name" />
        <F k="address" label="Address" />
        <F k="opens" label="Opens (HH:MM)" />
        <F k="closes" label="Closes (HH:MM)" />
      </div>
      <div className="rate-editor">
        <F k="holdFee" label="Booking fee ₹" inputMode="decimal" />
        <F k="firstHour" label="First hour ₹" inputMode="decimal" />
        <F k="perAdditionalHour" label="Extra hour ₹" inputMode="decimal" />
        <F k="dailyCap" label="Daily cap ₹" inputMode="decimal" />
        <F k="freeMinutes" label="Free minutes" inputMode="numeric" />
      </div>
      <div className="amenity-picks">
        {AMENITY_KEYS.map((a) => (
          <label key={a} className={`chip ${v.amenities.includes(a) ? 'is-active' : ''}`}>
            <input type="checkbox" checked={v.amenities.includes(a)} onChange={(e) => setV((x) => ({ ...x, amenities: e.target.checked ? [...x.amenities, a] : x.amenities.filter((y) => y !== a) }))} />
            {AMENITY_LABELS[a] || a}
          </label>
        ))}
      </div>
      <Toggle id={`v-24h-${venue.id}`} label="Open 24 hours" hint="Ignores opening and closing times" checked={v.is24h} onChange={(c) => setV((x) => ({ ...x, is24h: c }))} />
      <Toggle id={`v-pub-${venue.id}`} label="Published" hint="Unpublished venues are hidden from drivers" checked={v.published} onChange={(c) => setV((x) => ({ ...x, published: c }))} />
      <div className="form-actions">
        <Button type="submit" variant="primary" loading={busy}>
          Save venue
        </Button>
      </div>
    </form>
  );
}

function FloorsManager({ venues, toast }) {
  const [venueId, setVenueId] = useState(venues[0]?.id || '');
  const [venue, setVenue] = useState(null);
  const [floorId, setFloorId] = useState('');
  const [floor, setFloor] = useState(null);
  const [count, setCount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!venueId) return undefined;
    let alive = true;
    api.venue(venueId).then((d) => {
      if (!alive) return;
      const vv = d?.venue ?? d;
      setVenue(vv);
      setFloorId((f) => (vv.floors?.some((x) => x.id === f) ? f : vv.floors?.[0]?.id || ''));
    });
    return () => {
      alive = false;
    };
  }, [venueId]);

  const loadFloor = useCallback(() => {
    if (!floorId) return;
    api.floor(floorId).then((d) => setFloor(d?.floor ?? d)).catch(() => {});
  }, [floorId]);
  useEffect(() => {
    loadFloor();
  }, [loadFloor]);

  useLiveEvent(
    (t, d) => {
      if (t === 'slot' && d.floorId === floorId) setFloor((f) => (f ? { ...f, slots: f.slots.map((s) => (s.id === d.slotId ? { ...s, status: d.status } : s)) } : f));
    },
    [floorId]
  );

  const toggle = async (id) => {
    const s = floor?.slots.find((x) => x.id === id);
    if (!s) return;
    if (s.status === 'reserved') {
      toast('That slot has an active booking.', { kind: 'warn' });
      return;
    }
    try {
      await api.admin.setSlot(id, s.status === 'free' ? 'occupied' : 'free');
    } catch (e) {
      toast(e.message, { kind: 'error' });
    }
  };
  const bulk = async (body) => {
    setBusy(true);
    try {
      const r = await api.admin.setFloor(floorId, body);
      toast(`${r.changed} slots updated.`, { kind: 'success' });
      loadFloor();
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const free = floor ? floor.slots.filter((s) => s.status === 'free').length : 0;
  return (
    <div>
      <div className="floors-bar">
        <select className="input" value={venueId} onChange={(e) => setVenueId(e.target.value)} aria-label="Venue">
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.city})
            </option>
          ))}
        </select>
        <div className="floortabs">
          {(venue?.floors || []).map((f) => (
            <button key={f.id} type="button" className={`floortab ${f.id === floorId ? 'is-active' : ''}`} onClick={() => setFloorId(f.id)}>
              {f.name}
              <span className="floortab-free num">{f.free ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="floors-actions">
        <span className="tbl-sub">
          {floor ? `${free} free of ${floor.slots.length}. Tap a slot to toggle it. Booked slots and parked cars cannot be changed.` : 'Loading floor'}
        </span>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" onClick={() => bulk({ status: 'free' })} loading={busy}>
            All free
          </Button>
          <Button variant="secondary" size="sm" onClick={() => bulk({ status: 'occupied' })} loading={busy}>
            All occupied
          </Button>
          <form
            className="row"
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (count !== '') bulk({ occupied: Number(count) });
            }}
          >
            <input className="input" style={{ width: 110, minHeight: 36 }} inputMode="numeric" placeholder="Occupied" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} aria-label="Occupied count" />
            <Button type="submit" variant="secondary" size="sm" loading={busy}>
              Set count
            </Button>
          </form>
        </div>
      </div>
      <Legend compact />
      <div className="admin-floor">
        {floor ? <FloorPlan floor={floor} slots={floor.slots} selectedId={null} onSelectSlot={toggle} mySlotId={null} recommendedId={null} route={null} /> : <Skeleton h={480} r={12} />}
      </div>
    </div>
  );
}

export default function Admin() {
  const { toast } = useApp();
  const [key, setKey] = useState(adminKey());
  const [tab, setTab] = useState('overview');
  const [data, setData] = useState({});
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [cityFilter, setCityFilter] = useState('');
  const timer = useRef(null);

  const load = useCallback(
    async (t = tab) => {
      if (!key) return;
      try {
        const name = t === 'floors' ? 'venues' : t;
        const d = await api.admin[name]();
        setData((x) => ({ ...x, [name]: d }));
        setError(null);
      } catch (e) {
        if (e.status === 401) {
          setKey('');
          try {
            window.localStorage.removeItem(ADMIN_KEY);
          } catch {
            /* ignore */
          }
        } else setError(e);
      }
    },
    [key, tab]
  );

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  useLiveEvent(
    (t) => {
      if (t !== 'venue' || (tab !== 'overview' && tab !== 'venues')) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => load(tab), 4000);
    },
    [tab, load]
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const signOut = () => {
    try {
      window.localStorage.removeItem(ADMIN_KEY);
    } catch {
      /* ignore */
    }
    setKey('');
  };

  if (!key) {
    return (
      <div className="screen admin">
        <ScreenHeader title="Operator portal" back fallback="/profile" className="is-plain" />
        <Gate onEnter={setKey} />
      </div>
    );
  }

  const ov = data.overview;
  const venues = data.venues?.venues;
  const cities = ov?.cities?.map((c) => c.city) || [];
  const shownVenues = venues?.filter((v) => !cityFilter || v.city === cityFilter);

  let body;
  if (error) body = <ErrorState error={error} onRetry={() => load(tab)} compact />;
  else if (tab === 'overview') {
    body = !ov ? (
      <div className="tiles">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} h={96} r={12} />
        ))}
      </div>
    ) : (
      <>
        <div className="tiles">
          <Tile k="Occupancy" v={`${Math.round(ov.occupancy * 100)}%`} sub={`${ov.slots.total - ov.slots.free} of ${ov.slots.total} slots in use`} tone={ov.occupancy > 0.9 ? 'red' : ov.occupancy > 0.6 ? 'amber' : 'green'} />
          <Tile k="Free now" v={ov.slots.free} sub={`${ov.slots.reserved} booked, ${ov.slots.occupied} occupied`} />
          <Tile k="Active bookings" v={ov.activeHolds} sub={`${ov.today.holds} today, ${ov.today.expired} expired, ${ov.today.cancelled} cancelled`} />
          <Tile k="Parked now" v={ov.activeSessions} sub={`${ov.today.sessions} sessions today`} />
          <Tile k="Revenue today" v={rupees(ov.today.revenue)} sub={`${rupees(ov.today.holdRevenue)} bookings, ${rupees(ov.today.parkingRevenue)} parking`} tone="green" />
          <Tile k="Drivers" v={ov.users} sub={`${ov.venues} venues in ${ov.cities.length} cities`} />
        </div>
        <div className="section-title" style={{ marginTop: 20 }}>
          By city
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>City</th>
                <th>Venues</th>
                <th>Slots</th>
                <th>Free</th>
                <th>Occupancy</th>
              </tr>
            </thead>
            <tbody>
              {ov.cities.map((c) => (
                <tr key={c.city}>
                  <td>{c.city}</td>
                  <td className="num">{c.venues}</td>
                  <td className="num">{c.slots}</td>
                  <td className="num">{c.free}</td>
                  <td style={{ minWidth: 140 }}>
                    <FillBar value={c.slots ? 1 - c.free / c.slots : 0} tone={c.slots && 1 - c.free / c.slots > 0.9 ? 'red' : 1 - c.free / c.slots > 0.6 ? 'amber' : 'green'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="admin-foot">Updated {clock(ov.at)}. Counts refresh live.</div>
      </>
    );
  } else if (tab === 'venues') {
    body = !venues ? (
      <Skeleton h={300} r={12} />
    ) : (
      <>
        <div className="chiprow" style={{ marginBottom: 10 }}>
          <button type="button" className={`chip ${!cityFilter ? 'is-active' : ''}`} onClick={() => setCityFilter('')}>
            All
          </button>
          {cities.map((c) => (
            <button key={c} type="button" className={`chip ${cityFilter === c ? 'is-active' : ''}`} onClick={() => setCityFilter(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Venue</th>
                <th>Type</th>
                <th>Free / total</th>
                <th>Occupancy</th>
                <th>Booked</th>
                <th>Parked</th>
                <th>Revenue today</th>
                <th>Booking fee</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shownVenues.map((v) => (
                <tr key={v.id} className={editing === v.id ? 'is-editing' : ''}>
                  <td>
                    <div className="tbl-name">
                      {v.name}
                      {v.published === false ? <Pill tone="muted"> hidden</Pill> : null}
                    </div>
                    <div className="tbl-sub">{v.city}</div>
                  </td>
                  <td>{TYPE_LABELS[v.type] || v.type}</td>
                  <td className="num">
                    {v.free} / {v.total}
                  </td>
                  <td style={{ minWidth: 120 }}>
                    <FillBar value={v.occupancy} tone={v.occupancy > 0.9 ? 'red' : v.occupancy > 0.6 ? 'amber' : 'green'} />
                  </td>
                  <td className="num">{v.activeHolds}</td>
                  <td className="num">{v.activeSessions}</td>
                  <td className="num">{rupees(v.revenueToday)}</td>
                  <td className="num">{rupees(v.rate.holdFee)}</td>
                  <td>
                    <button type="button" className="linkbtn" onClick={() => setEditing(editing === v.id ? null : v.id)}>
                      {editing === v.id ? 'Close' : 'Edit'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && shownVenues.find((v) => v.id === editing) ? (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="section-title">Edit {shownVenues.find((v) => v.id === editing).name}</div>
            <VenueEditor
              venue={shownVenues.find((v) => v.id === editing)}
              toast={toast}
              onSaved={(out) => {
                setData((x) => ({ ...x, venues: { venues: x.venues.venues.map((v) => (v.id === editing ? { ...v, ...out } : v)) } }));
              }}
            />
          </div>
        ) : null}
      </>
    );
  } else if (tab === 'floors') {
    body = !venues ? <Skeleton h={300} r={12} /> : <FloorsManager venues={venues} toast={toast} />;
  } else if (tab === 'activity') {
    const items = data.activity?.items;
    body = !items ? (
      <Skeleton h={300} r={12} />
    ) : (
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Driver</th>
              <th>Venue</th>
              <th>Spot</th>
              <th>Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={`${it.kind}-${it.id}`}>
                <td className="tbl-sub">
                  {dateLabel(it.at)}, {clock(it.at)}
                </td>
                <td>{it.kind === 'hold' ? 'Booking' : 'Parking'}</td>
                <td>
                  <div className="tbl-name">{it.userName || it.userId}</div>
                  <div className="tbl-sub">{it.plate}</div>
                </td>
                <td>{it.venueName}</td>
                <td className="num">{it.slotCode}</td>
                <td>
                  <Pill tone={it.status === 'active' || it.status === 'parked' ? 'green' : it.status === 'expired' || it.status === 'cancelled' ? 'red' : 'muted'}>{it.status}</Pill>
                </td>
                <td className="num">{it.kind === 'hold' ? rupees(it.holdFee) : it.endedAt ? rupees(Math.max(0, it.fee - it.holdCredit)) : `${fmtMinutes(it.durationMinutes)} so far`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (tab === 'users') {
    const users = data.users?.users;
    body = !users ? (
      <Skeleton h={300} r={12} />
    ) : (
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Driver</th>
              <th>Vehicles</th>
              <th>Wallet</th>
              <th>Bookings</th>
              <th>Sessions</th>
              <th>Spent</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="tbl-name">{u.name || 'Unnamed'}</div>
                  <div className="tbl-sub">{u.phone || u.id}</div>
                </td>
                <td>
                  {u.vehicles.length ? (
                    u.vehicles.map((v) => (
                      <div key={v.plate} className="tbl-sub">
                        {v.plate} {v.fastag ? <Icon name="ticket" size={12} /> : null}
                      </div>
                    ))
                  ) : (
                    <span className="tbl-sub">none</span>
                  )}
                </td>
                <td className="num">{rupees(u.walletBalance)}</td>
                <td className="num">{u.holds}</td>
                <td className="num">{u.sessions}</td>
                <td className="num">{rupees(u.spent)}</td>
                <td className="tbl-sub">{dateLabel(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (tab === 'transactions') {
    const txns = data.transactions?.transactions;
    body = !txns ? (
      <Skeleton h={300} r={12} />
    ) : (
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>When</th>
              <th>Driver</th>
              <th>Type</th>
              <th>Note</th>
              <th>Amount</th>
              <th>Balance after</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => (
              <tr key={t.id}>
                <td className="tbl-sub">
                  {dateLabel(t.createdAt)}, {clock(t.createdAt)}
                </td>
                <td>{t.userName || t.userId}</td>
                <td>{TXN_LABELS[t.kind] || t.kind}</td>
                <td className="tbl-sub">{t.note}</td>
                <td className={`num ${t.amount >= 0 ? 'tone-text-green' : ''}`}>
                  {t.amount >= 0 ? '+' : '-'}
                  {rupees(Math.abs(t.amount))}
                </td>
                <td className="num">{rupees(t.balanceAfter)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="screen admin">
      <ScreenHeader
        title="Operator portal"
        back
        fallback="/profile"
        className="is-plain"
        right={
          <div className="row" style={{ gap: 6 }}>
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => load(tab)}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        }
      />
      <div className="screen-inner">
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        {body}
      </div>
    </div>
  );
}
