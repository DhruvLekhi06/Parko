import { useNow } from '../hooks/useNow.js';
import { countdown, distance, minutes, walkTime, clock, rupees } from '../lib/format.js';
import { Button, Skeleton } from './Primitives.jsx';
import { Icon } from './Icons.jsx';
import { Barcode } from './Barcode.jsx';

export function Countdown({ expiresAt }) {
  const now = useNow(1000, !!expiresAt);
  const left = new Date(expiresAt).getTime() - now;
  const low = left < 120000;
  const over = left <= 0;
  return (
    <span className={`countdown ${over ? 'is-over' : low ? 'is-low' : ''}`} aria-live="off">
      <Icon name="clock" size={16} />
      {over ? 'Expired' : countdown(left)}
    </span>
  );
}

export function RouteSteps({ route, loading, steps, title, reversed = false }) {
  if (loading) {
    return (
      <div className="steps-skel" aria-busy="true">
        <Skeleton w="70%" h={12} />
        <Skeleton w="55%" h={12} />
        <Skeleton w="62%" h={12} />
      </div>
    );
  }
  const list = steps || route?.steps || [];
  if (!list.length) return null;
  const meters = route?.distanceM;
  const walk = route?.walkSeconds;
  return (
    <>
      {title ? <div className="section-title" style={{ margin: '14px 16px 0' }}>{title}</div> : null}
      <ol className="steps">
        {list.map((s, i) => (
          <li key={`${i}-${s}`} className="step">
            <span className="step-dot" aria-hidden="true">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {meters != null ? (
        <div className="steps-meta">
          <span>{distance(meters)}</span>
          {walk != null ? <span>{reversed ? walkTime(meters) : `${Math.max(1, Math.round(walk / 60))} min walk`}</span> : null}
          {!reversed && route?.driveSeconds != null ? <span>{minutes(Math.max(1, Math.round(route.driveSeconds / 60)))} drive</span> : null}
        </div>
      ) : null}
    </>
  );
}

export function Ticket({ hold, compact = false }) {
  if (!hold) return null;
  return (
    <div className={`ticket ${compact ? 'is-compact' : ''}`}>
      <div className="ticket-head">
        <span>Show at the gate</span>
        {hold.plate ? <span className="ticket-plate">{hold.plate}</span> : null}
      </div>
      <div className="ticket-code">{hold.code}</div>
      <Barcode value={hold.code} height={compact ? 36 : 46} />
      <div className="ticket-foot">
        <span>{hold.venueName}</span>
        <span>
          Spot {hold.slotCode}, floor {hold.floorName}
        </span>
      </div>
    </div>
  );
}

export function mapsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function HoldCard({ hold, route, routeLoading, onCancel, onArrived, onExtend, onOpenFloor, busy, showRoute = true, distanceM, arrived }) {
  const now = useNow(15000, !!hold);
  if (!hold) return null;
  const refundable = now < new Date(hold.refundableUntil).getTime();
  return (
    <div className="rescard">
      <div className="rescard-top">
        <div>
          <div className="rescard-eyebrow">{arrived ? "You're here" : 'On the way to'}</div>
          <div className="rescard-title">{hold.venueName}</div>
          <div className="rescard-sub">
            Spot {hold.slotCode}, floor {hold.floorName}
            {hold.plate ? `, ${hold.plate}` : ''}
          </div>
        </div>
        <Countdown expiresAt={hold.expiresAt} />
      </div>
      <div className="holdmeta">
        <span>
          <Icon name="clock" size={14} /> Held until {clock(hold.expiresAt)}
        </span>
        {distanceM != null ? (
          <span>
            <Icon name="navigate" size={14} /> {distance(distanceM)} away
          </span>
        ) : null}
        <span>
          <Icon name="ticket" size={14} /> {rupees(hold.holdFee)} hold, adjusted at exit
        </span>
      </div>
      <Ticket hold={hold} />
      {showRoute ? <RouteSteps route={route} loading={routeLoading} title="Inside the car park" /> : null}
      <div className="rescard-actions">
        <Button variant="secondary" icon="navigate" onClick={() => window.open(mapsUrl(hold.venueLat, hold.venueLng), '_blank', 'noopener')} disabled={!!busy}>
          Navigate
        </Button>
        {onOpenFloor ? (
          <Button variant="secondary" icon="map" onClick={onOpenFloor} disabled={!!busy}>
            Floor plan
          </Button>
        ) : null}
        <Button variant="primary" icon="check" onClick={onArrived} loading={busy === 'park'} disabled={!!busy}>
          I've parked
        </Button>
      </div>
      <div className="rescard-foot">
        <button type="button" className="linkbtn" onClick={onExtend} disabled={!!busy}>
          Need more time? +15 min
        </button>
        <button type="button" className="linkbtn is-danger" onClick={onCancel} disabled={!!busy}>
          {refundable ? `Cancel, ${rupees(hold.holdFee)} refunded` : 'Cancel hold'}
        </button>
      </div>
    </div>
  );
}
