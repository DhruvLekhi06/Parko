import { useNow } from '../hooks/useNow.js';
import { countdown, distance, minutes, walkTime } from '../lib/format.js';
import { Button, Skeleton } from './Primitives.jsx';
import { Icon } from './Icons.jsx';

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

export function ReservationCard({ reservation, route, routeLoading, onCancel, onParked, onOpenFloor, busy, showRoute = true }) {
  if (!reservation) return null;
  return (
    <div className="rescard">
      <div className="rescard-top">
        <div>
          <div className="rescard-title">Holding {reservation.slotCode}</div>
          <div className="rescard-sub">
            {reservation.venueName}, floor {reservation.floorName}
          </div>
        </div>
        <Countdown expiresAt={reservation.expiresAt} />
      </div>
      <div className="gatecode">
        <div className="gatecode-k">Show at the gate</div>
        <div className="gatecode-v">{reservation.code}</div>
      </div>
      {showRoute ? <RouteSteps route={route} loading={routeLoading} title="Drive to your spot" /> : null}
      <div className="rescard-actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {onOpenFloor ? (
          <Button variant="secondary" icon="map" onClick={onOpenFloor} disabled={busy}>
            Floor plan
          </Button>
        ) : null}
        <Button variant="primary" icon="check" onClick={onParked} loading={busy === 'park'} disabled={!!busy}>
          I've parked
        </Button>
      </div>
    </div>
  );
}
