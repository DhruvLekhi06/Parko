import { useCallback, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon } from './Icons.jsx';

const TONE = { open: 'green', filling: 'amber', almost_full: 'red', full: 'red' };

function pinHtml(v, selected) {
  const tone = TONE[v.level] || 'green';
  const count = v.level === 'full' ? 'Full' : String(v.free ?? 0);
  return `<div class="vpin tone-${tone} ${selected ? 'is-selected' : ''} ${v.level === 'full' ? 'is-full' : ''}">
    <svg viewBox="0 0 44 52" width="44" height="52" aria-hidden="true">
      <path class="vpin-shape" d="M22 50S5 35.5 5 22A17 17 0 0 1 39 22c0 13.5-17 28-17 28z"/>
    </svg>
    <span class="vpin-count">${count}</span>
  </div>`;
}

function pinIcon(v, selected) {
  return L.divIcon({ className: 'vpin-wrap', html: pinHtml(v, selected), iconSize: [44, 52], iconAnchor: [22, 50] });
}

function pinKey(v, selected) {
  return `${v.level}|${v.level === 'full' ? 'F' : v.free}|${selected ? 1 : 0}`;
}

export function VenueMap({ center, zoom = 12, venues = [], selectedId, onSelect, user, inset = { top: 0, bottom: 0 }, showZoom = false, className = '', focus, fit, route }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef(new Map());
  const userMarker = useRef(null);
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const pendingFocus = useRef(null);
  const pendingFit = useRef(null);
  const routeRef = useRef(null);

  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false, zoomSnap: 0.5 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      className: 'tiles-dark',
    }).addTo(map);
    L.control.attribution({ position: 'topright', prefix: false }).addTo(map);
    map.setView([center.lat, center.lng], zoom);
    map.on('click', () => onSelectRef.current?.(null));
    mapRef.current = map;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
      if (pendingFocus.current && applyFocus(map, pendingFocus.current)) pendingFocus.current = null;
      if (pendingFit.current && applyFit(map, pendingFit.current)) pendingFit.current = null;
    });
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      markers.current.clear();
      userMarker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set();
    venues.forEach((v) => {
      if (typeof v.lat !== 'number' || typeof v.lng !== 'number') return;
      seen.add(v.id);
      const selected = v.id === selectedId;
      const key = pinKey(v, selected);
      let entry = markers.current.get(v.id);
      if (!entry) {
        const marker = L.marker([v.lat, v.lng], { icon: pinIcon(v, selected), keyboard: true, title: v.name, riseOnHover: true });
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onSelectRef.current?.(v.id);
        });
        marker.addTo(map);
        entry = { marker, key };
        markers.current.set(v.id, entry);
      } else if (entry.key !== key) {
        entry.marker.setIcon(pinIcon(v, selected));
        entry.key = key;
      }
      entry.marker.setZIndexOffset(selected ? 1000 : v.level === 'full' ? -100 : 0);
    });
    markers.current.forEach((entry, id) => {
      if (!seen.has(id)) {
        entry.marker.remove();
        markers.current.delete(id);
      }
    });
  }, [venues, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!user) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    const ll = [user.lat, user.lng];
    if (!userMarker.current) {
      userMarker.current = L.marker(ll, {
        icon: L.divIcon({ className: 'userdot-wrap', html: '<div class="userdot"><span class="userdot-ring"></span><span class="userdot-core"></span></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: 600,
      }).addTo(map);
    } else {
      userMarker.current.setLatLng(ll);
    }
  }, [user]);

  const applyFocus = useCallback((map, f) => {
    if (!map || !f || typeof f.lat !== 'number' || typeof f.lng !== 'number') return true;
    const size = map.getSize();
    if (!size.x || !size.y) return false;
    const { top = 0, bottom = 0 } = insetRef.current;
    const z = f.zoom && map.getZoom() < f.zoom ? f.zoom : map.getZoom();
    const target = L.point(size.x / 2, top + (size.y - top - bottom) / 2);
    const centre = L.point(size.x / 2, size.y / 2);
    const focusPt = map.project([f.lat, f.lng], z);
    const newCentre = map.unproject(focusPt.add(centre.subtract(target)), z);
    if (!Number.isFinite(newCentre.lat) || !Number.isFinite(newCentre.lng)) return false;
    const current = map.latLngToContainerPoint([f.lat, f.lng]);
    if (z === map.getZoom() && Math.abs(current.x - target.x) < 6 && Math.abs(current.y - target.y) < 6) return true;
    map.flyTo(newCentre, z, { duration: 0.55, easeLinearity: 0.25 });
    return true;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    if (!applyFocus(map, focus)) pendingFocus.current = focus;
  }, [focus, applyFocus]);

  const applyFit = useCallback((map, f) => {
    if (!map || !f?.points?.length) return true;
    const size = map.getSize();
    if (!size.x || !size.y) return false;
    const { top = 0, bottom = 0 } = insetRef.current;
    const pad = f.padding ?? 48;
    map.flyToBounds(L.latLngBounds(f.points), { paddingTopLeft: [pad, top + pad], paddingBottomRight: [pad, bottom + pad], maxZoom: f.maxZoom || 15, duration: 0.6 });
    return true;
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fit) return;
    if (!applyFit(map, fit)) pendingFit.current = fit;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit?.key, applyFit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    routeRef.current?.forEach((l) => l.remove());
    routeRef.current = null;
    if (!route?.length) return;
    const under = L.polyline(route, { color: '#22d48a', weight: 14, opacity: 0.16, lineCap: 'round', lineJoin: 'round', interactive: false });
    const main = L.polyline(route, { color: '#22d48a', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false });
    under.addTo(map);
    main.addTo(map);
    routeRef.current = [under, main];
  }, [route]);

  const zoomBy = (d) => mapRef.current?.setZoom(mapRef.current.getZoom() + d);
  const recenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const to = user || center;
    const size = map.getSize();
    if (!size.x || !size.y) return;
    map.flyTo([to.lat, to.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
  };

  return (
    <div className={`vmap ${className}`}>
      <div ref={elRef} className="vmap-el" role="region" aria-label="Map of parking venues" />
      <div className="vmap-controls">
        {showZoom ? (
          <div className="vmap-zoom">
            <button type="button" className="mapbtn" aria-label="Zoom in" onClick={() => zoomBy(1)}>
              <Icon name="plus" size={18} />
            </button>
            <button type="button" className="mapbtn" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
              <Icon name="minus" size={18} />
            </button>
          </div>
        ) : null}
        <button type="button" className="mapbtn" aria-label="Centre on my location" onClick={recenter}>
          <Icon name="locate" size={18} />
        </button>
      </div>
    </div>
  );
}
