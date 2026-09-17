import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { useDesktop } from '../hooks/useMedia.js';
import { navigate } from '../router.jsx';
import { VenueMap } from '../components/VenueMap.jsx';
import { mapsUrl } from '../components/HoldCard.jsx';
import { Icon } from '../components/Icons.jsx';
import { Button, ErrorState, ScreenHeader, Skeleton } from '../components/Primitives.jsx';
import { distance, minutes, hoursLabel } from '../lib/format.js';

export default function Go({ id }) {
  const desktop = useDesktop();
  const { position, session, hold } = useApp();
  const [venue, setVenue] = useState(null);
  const [drive, setDrive] = useState(null);
  const [error, setError] = useState(null);
  const posKey = position.source === 'gps' ? `${Math.round(position.lat * 200)},${Math.round(position.lng * 200)}` : 'none';

  useEffect(() => {
    let alive = true;
    api
      .venue(id, { lat: position.lat, lng: position.lng })
      .then((d) => alive && setVenue(d?.venue ?? d))
      .catch((e) => alive && setError(e));
    api
      .directions(id, position.source === 'gps' ? position : undefined)
      .then((d) => alive && setDrive(d))
      .catch(() => alive && setDrive(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, posKey]);

  const here = position.source === 'gps' ? [position.lat, position.lng] : null;
  const routePts = drive?.coordinates?.length ? drive.coordinates : null;
  const bestFloor = (venue?.floors || []).reduce((a, f) => (!a || (f.free || 0) > (a.free || 0) ? f : a), null);
  const mapEl = venue ? (
    <VenueMap
      center={{ lat: venue.lat, lng: venue.lng }}
      zoom={13}
      venues={[venue]}
      user={here ? { lat: here[0], lng: here[1] } : null}
      route={routePts}
      fit={{ points: [...(routePts ? [routePts[0], routePts[routePts.length - 1]] : [[venue.lat, venue.lng]]), ...(here ? [here] : [])], key: `${venue.id}-${routePts ? 'r' : 'n'}-${here ? 'u' : 'x'}`, maxZoom: 15 }}
    />
  ) : null;

  const body = error ? (
    <ErrorState error={error} onRetry={() => navigate(`/go/${encodeURIComponent(id)}`, { replace: true })} />
  ) : !venue ? (
    <div className="screen-inner stack" aria-busy="true">
      <Skeleton h={240} r={16} />
      <Skeleton h={90} r={16} />
    </div>
  ) : (
    <div className="screen-inner screen-enter">
      {!desktop ? <div className="carmap is-tall">{mapEl}</div> : null}
      <div className="drivebar">
        <span className="drivebar-v num">{drive ? `${Math.max(1, Math.round(drive.seconds / 60))} min` : `${minutes(venue.etaMin)}`}</span>
        <span className="drivebar-k">{drive ? `${(drive.metres / 1000).toFixed(1)} km by road${drive.source === 'estimate' ? ', estimated' : ''}` : distance(venue.distanceM)}</span>
      </div>
      <div className="gocard">
        <div className="gocard-name">{venue.name}</div>
        <div className="gocard-sub">
          {venue.address}. {hoursLabel(venue)}.
        </div>
        <div className="gocard-free">
          <span className="num">{venue.free}</span> of {venue.total} spots free right now
        </div>
        <div className="gocard-actions">
          <Button variant="primary" size="lg" icon="navigate" onClick={() => window.open(mapsUrl(venue.lat, venue.lng), '_blank', 'noopener')}>
            Start navigation
          </Button>
          {bestFloor ? (
            <Button variant="secondary" size="lg" icon="map" onClick={() => navigate(`/floor/${encodeURIComponent(bestFloor.id)}`)}>
              Floor plan
            </Button>
          ) : null}
        </div>
      </div>
      <div className="hint" style={{ marginTop: 12 }}>
        <Icon name="info" size={18} />
        <span>
          No booking needed. When you get there, pick any green spot on the floor plan and tap "I've parked". The timer and fee start then.
        </span>
      </div>
      {bestFloor && !session ? (
        <div className="goalt">
          <Button variant="secondary" block icon="check" onClick={() => navigate(`/floor/${encodeURIComponent(bestFloor.id)}?park=1`)}>
            I've arrived, pick a spot
          </Button>
          {!hold ? (
            <button type="button" className="linkbtn" onClick={() => navigate(`/floor/${encodeURIComponent(bestFloor.id)}?book=1`)}>
              Want it guaranteed? Book a slot instead
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const head = <ScreenHeader title={venue ? 'Find parking' : ''} subtitle={venue?.name} fallback={`/venue/${encodeURIComponent(id)}`} titleAs="div" />;

  if (desktop) {
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
    <div className="screen">
      {head}
      {body}
    </div>
  );
}
