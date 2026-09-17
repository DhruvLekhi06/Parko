import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { navigate } from '../router.jsx';
import { Icon } from '../components/Icons.jsx';
import { Button, EmptyState, ErrorState, Pill, ScreenHeader, Sheet, Skeleton } from '../components/Primitives.jsx';
import { rupees, clock, dateLabel, minutes as fmtMinutes, TXN_LABELS, maskTag } from '../lib/format.js';

const SEGMENTS = [
  ['parking', 'Parking'],
  ['wallet', 'Wallet'],
];

function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayTitle(iso) {
  const d = new Date(iso);
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}

function groupByDay(items) {
  const out = [];
  let cur = null;
  for (const it of items) {
    const k = dayKey(it.at);
    if (!cur || cur.key !== k) {
      cur = { key: k, title: dayTitle(it.at), items: [] };
      out.push(cur);
    }
    cur.items.push(it);
  }
  return out;
}

const HOLD_STATUS = {
  active: ['Booked', 'green'],
  arrived: ['Parked', 'muted'],
  expired: ['Expired', 'red'],
  cancelled: ['Cancelled', 'muted'],
};

function ParkingRow({ it, onOpen }) {
  const isSession = it.kind === 'session';
  const live = isSession ? !it.endedAt : it.status === 'active';
  const amount = isSession ? (it.endedAt ? Math.max(0, it.fee - (it.holdCredit || 0)) : null) : it.holdFee;
  return (
    <button type="button" className={`arow ${live ? 'is-live' : ''}`} onClick={onOpen}>
      <span className={`arow-icon ${isSession ? 'is-car' : 'is-ticket'}`} aria-hidden="true">
        <Icon name={isSession ? 'car' : 'ticket'} size={20} />
      </span>
      <span className="arow-main">
        <span className="arow-title">{it.venueName}</span>
        <span className="arow-sub">
          {clock(it.at)}, spot {it.slotCode}
          {isSession && it.endedAt ? `, ${fmtMinutes(it.durationMinutes)}` : ''}
          {!isSession ? `, ${HOLD_STATUS[it.status]?.[0] || it.status}` : ''}
        </span>
      </span>
      <span className="arow-side">
        {live ? (
          <Pill tone="green" dot>
            {isSession ? 'Parked' : 'Booked'}
          </Pill>
        ) : (
          <span className="arow-amt num">{amount != null ? rupees(amount) : ''}</span>
        )}
      </span>
    </button>
  );
}

function WalletRow({ t }) {
  const credit = t.amount >= 0;
  return (
    <div className="arow is-static">
      <span className={`arow-icon ${credit ? 'is-credit' : 'is-debit'}`} aria-hidden="true">
        <Icon name={t.kind === 'topup' ? 'plus' : t.kind === 'refund' ? 'refresh' : t.kind === 'hold_fee' ? 'ticket' : 'card'} size={20} />
      </span>
      <span className="arow-main">
        <span className="arow-title">{TXN_LABELS[t.kind] || t.kind}</span>
        <span className="arow-sub">
          {clock(t.createdAt)}
          {t.note ? `, ${t.note}` : ''}
        </span>
      </span>
      <span className="arow-side">
        <span className={`arow-amt num ${credit ? 'is-credit' : ''}`}>
          {credit ? '+' : '-'}
          {rupees(Math.abs(t.amount))}
        </span>
        <span className="arow-bal">{rupees(t.balanceAfter)}</span>
      </span>
    </div>
  );
}

function Detail({ it, user, onClose }) {
  if (!it) return null;
  const isSession = it.kind === 'session';
  const rows = isSession
    ? [
        ['Venue', it.venueName],
        ['Spot', `${it.slotCode}, floor ${it.floorName}`],
        ['Vehicle', it.plate || user?.plate || ''],
        ['In', `${dateLabel(it.startedAt)}, ${clock(it.startedAt)}`],
        ['Out', it.endedAt ? `${dateLabel(it.endedAt)}, ${clock(it.endedAt)}` : 'Still parked'],
        ['Duration', fmtMinutes(it.durationMinutes)],
        ['Parking fee', rupees(it.fee)],
        ...(it.holdCredit ? [['Booking credit', `- ${rupees(it.holdCredit)}`]] : []),
        ['Paid', it.endedAt ? rupees(Math.max(0, it.fee - (it.holdCredit || 0))) : 'At exit'],
        ...(it.paymentMethod ? [['Via', it.paymentMethod === 'fastag' ? `FASTag ${maskTag(user?.defaultVehicle?.fastagId || '')}` : it.paymentMethod]] : []),
        ...(it.receiptNo ? [['Receipt', it.receiptNo]] : []),
      ]
    : [
        ['Venue', it.venueName],
        ['Spot', `${it.slotCode}, floor ${it.floorName}`],
        ['Vehicle', it.plate || user?.plate || ''],
        ['Booked', `${dateLabel(it.createdAt)}, ${clock(it.createdAt)}`],
        ['Held until', clock(it.expiresAt)],
        ['Status', HOLD_STATUS[it.status]?.[0] || it.status],
        ['Booking fee', rupees(it.holdFee)],
        ['Gate code', it.code],
      ];
  return (
    <Sheet open onClose={onClose} title={isSession ? 'Parking' : 'Booking'} desktopCenter>
      <div className="sheet-grab" aria-hidden="true" />
      <div className="detail-head">
        <span className={`arow-icon ${isSession ? 'is-car' : 'is-ticket'}`} aria-hidden="true">
          <Icon name={isSession ? 'car' : 'ticket'} size={22} />
        </span>
        <div>
          <div className="detail-title">{it.venueName}</div>
          <div className="detail-sub">{isSession ? (it.endedAt ? 'Parking session' : 'Parked now') : 'Slot booking'}</div>
        </div>
      </div>
      <div className="receipt-rows">
        {rows.map(([k, v]) => (
          <div key={k} className={`receipt-row ${k === 'Paid' ? 'is-total' : ''}`}>
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        <Button variant="secondary" block onClick={() => navigate(`/venue/${encodeURIComponent(it.venueId)}`)}>
          Open venue
        </Button>
        <Button variant="primary" block onClick={onClose}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

export default function Activity({ query }) {
  const desktop = useDesktop();
  const { user } = useApp();
  const [seg, setSeg] = useState(query?.tab === 'wallet' ? 'wallet' : 'parking');
  const [parking, setParking] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.sessions(), api.holds()])
      .then(([s, h]) => {
        if (!alive) return;
        const sessions = (s?.sessions || []).map((x) => ({ ...x, kind: 'session', at: x.startedAt }));
        const holds = (h?.holds || []).filter((x) => x.status !== 'arrived').map((x) => ({ ...x, kind: 'hold', at: x.createdAt }));
        setParking([...sessions, ...holds].sort((a, b) => new Date(b.at) - new Date(a.at)));
      })
      .catch((e) => alive && setError(e));
    api
      .wallet()
      .then((d) => alive && setWallet(d))
      .catch(() => alive && setWallet({ balance: user?.walletBalance ?? 0, transactions: [] }));
    return () => {
      alive = false;
    };
  }, [user?.walletBalance]);

  const groups = useMemo(() => (parking ? groupByDay(parking) : []), [parking]);
  const wgroups = useMemo(() => (wallet ? groupByDay(wallet.transactions.map((t) => ({ ...t, at: t.createdAt }))) : []), [wallet]);
  const spent = useMemo(() => (parking || []).reduce((a, it) => a + (it.kind === 'session' && it.endedAt ? Math.max(0, it.fee - (it.holdCredit || 0)) : 0), 0), [parking]);

  let body;
  if (error) body = <ErrorState error={error} compact />;
  else if (seg === 'parking') {
    body = !parking ? (
      <div className="stack">
        <Skeleton h={64} r={14} />
        <Skeleton h={64} r={14} />
        <Skeleton h={64} r={14} />
      </div>
    ) : parking.length === 0 ? (
      <EmptyState icon="history" title="No parking yet" body="Your bookings and parking sessions will show up here." action="Find a spot" onAction={() => navigate('/')} />
    ) : (
      <>
        <div className="asummary">
          <div>
            <div className="asummary-k">Sessions</div>
            <div className="asummary-v num">{parking.filter((x) => x.kind === 'session').length}</div>
          </div>
          <div>
            <div className="asummary-k">Spent on parking</div>
            <div className="asummary-v num">{rupees(spent)}</div>
          </div>
        </div>
        {groups.map((g) => (
          <section key={g.key} className="agroup" aria-label={g.title}>
            <div className="agroup-title">{g.title}</div>
            <div className="alist">
              {g.items.map((it) => (
                <ParkingRow key={`${it.kind}-${it.id}`} it={it} onOpen={() => setOpen(it)} />
              ))}
            </div>
          </section>
        ))}
      </>
    );
  } else {
    body = !wallet ? (
      <div className="stack">
        <Skeleton h={64} r={14} />
        <Skeleton h={64} r={14} />
      </div>
    ) : (
      <>
        <div className="asummary">
          <div>
            <div className="asummary-k">Wallet balance</div>
            <div className="asummary-v num">{rupees(wallet.balance)}</div>
          </div>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => navigate('/profile')}>
            Top up
          </Button>
        </div>
        {wallet.transactions.length === 0 ? (
          <EmptyState icon="card" title="No wallet activity" body="Top-ups, booking fees, parking fees and refunds will show up here." />
        ) : (
          wgroups.map((g) => (
            <section key={g.key} className="agroup" aria-label={g.title}>
              <div className="agroup-title">{g.title}</div>
              <div className="alist">
                {g.items.map((t) => (
                  <WalletRow key={t.id} t={t} />
                ))}
              </div>
            </section>
          ))
        )}
      </>
    );
  }

  return (
    <div className={`screen ${desktop ? 'is-narrow' : ''}`}>
      <ScreenHeader title="Activity" back={false} className="is-plain" />
      <div className="screen-inner screen-enter">
        <div className="seg" role="tablist" aria-label="Activity type" style={{ marginTop: 0 }}>
          {SEGMENTS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={seg === id} className={`seg-btn ${seg === id ? 'is-active' : ''}`} onClick={() => setSeg(id)}>
              {label}
            </button>
          ))}
        </div>
        {body}
      </div>
      {open ? <Detail it={open} user={user} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
