import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ADMIN_KEY, adminKey } from '../api.js';
import { useApp, useLiveEvent } from '../store.jsx';
import { Button, ErrorState, Pill, ScreenHeader, Skeleton, FillBar } from '../components/Primitives.jsx';
import { Icon } from '../components/Icons.jsx';
import { rupees, clock, dateLabel, TYPE_LABELS, TXN_LABELS, minutes as fmtMinutes } from '../lib/format.js';

const TABS = [
  ['overview', 'Overview'],
  ['venues', 'Venues'],
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

function RateEditor({ venue, onSaved, toast }) {
  const [r, setR] = useState({ holdFee: venue.rate.holdFee / 100, firstHour: venue.rate.firstHour / 100, perAdditionalHour: venue.rate.perAdditionalHour / 100, dailyCap: venue.rate.dailyCap / 100, freeMinutes: venue.rate.freeMinutes });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setR((x) => ({ ...x, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const out = await api.admin.updateRate(venue.id, {
        holdFee: Math.round(Number(r.holdFee) * 100), firstHour: Math.round(Number(r.firstHour) * 100), perAdditionalHour: Math.round(Number(r.perAdditionalHour) * 100),
        dailyCap: Math.round(Number(r.dailyCap) * 100), freeMinutes: Math.round(Number(r.freeMinutes)),
      });
      onSaved(out.rate);
      toast('Rates saved.', { kind: 'success' });
    } catch (err) {
      toast(err.message, { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const F = ({ k, label }) => (
    <label className="rate-field">
      <span>{label}</span>
      <input className="input" inputMode="decimal" value={r[k]} onChange={set(k)} />
    </label>
  );
  return (
    <form className="rate-editor" onSubmit={save}>
      <F k="holdFee" label="Booking fee ₹" />
      <F k="firstHour" label="First hour ₹" />
      <F k="perAdditionalHour" label="Extra hour ₹" />
      <F k="dailyCap" label="Daily cap ₹" />
      <F k="freeMinutes" label="Free minutes" />
      <Button type="submit" variant="primary" size="sm" loading={busy}>
        Save
      </Button>
    </form>
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
        const d = await api.admin[t]();
        setData((x) => ({ ...x, [t]: d }));
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
                    <div className="tbl-name">{v.name}</div>
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
                      {editing === v.id ? 'Close' : 'Rates'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editing && shownVenues.find((v) => v.id === editing) ? (
          <div className="card card-pad" style={{ marginTop: 12 }}>
            <div className="section-title">Rates for {shownVenues.find((v) => v.id === editing).name}</div>
            <RateEditor
              venue={shownVenues.find((v) => v.id === editing)}
              toast={toast}
              onSaved={(rate) => {
                setData((x) => ({ ...x, venues: { venues: x.venues.venues.map((v) => (v.id === editing ? { ...v, rate } : v)) } }));
              }}
            />
          </div>
        ) : null}
      </>
    );
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
