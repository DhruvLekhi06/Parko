import { Button, Sheet } from './Primitives.jsx';
import { Icon } from './Icons.jsx';

export function ConfirmSheet({ open, title, body, rows = [], confirmLabel = 'Confirm', cancelLabel = 'Keep as is', tone = 'primary', icon = 'clock', busy = false, onConfirm, onClose }) {
  if (!open) return null;
  return (
    <Sheet open onClose={busy ? undefined : onClose} title={title} dismissible={!busy} desktopCenter>
      <div className="sheet-grab" aria-hidden="true" />
      <div className="confirm">
        <div className={`confirm-icon tone-${tone}`} aria-hidden="true">
          <Icon name={icon} size={22} />
        </div>
        <h2 className="confirm-title">{title}</h2>
        {body ? <p className="confirm-body">{body}</p> : null}
        {rows.length ? (
          <div className="receipt-rows" style={{ marginTop: 12 }}>
            {rows.map(([k, v, cls]) => (
              <div key={k} className={`receipt-row ${cls || ''}`}>
                <span>{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="confirm-actions">
          <Button variant="secondary" block onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'secondary' : 'primary'} block className={tone === 'danger' ? 'is-danger' : ''} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
