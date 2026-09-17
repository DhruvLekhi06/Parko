import { useApp } from '../store.jsx';
import { Sheet } from './Primitives.jsx';
import { AuthForm } from './AuthForm.jsx';

export function AuthSheet() {
  const { authOpen, closeAuth, onAuthed, user, toast } = useApp();
  if (!authOpen) return null;
  return (
    <Sheet open onClose={closeAuth} title="Create an account" desktopCenter>
      <div className="sheet-grab" aria-hidden="true" />
      <div className="detail-head" style={{ margin: '4px 0 12px' }}>
        <div>
          <div className="detail-title">You need an account for this</div>
          <div className="detail-sub">Bookings, parking sessions and your wallet are tied to it. Takes 20 seconds.</div>
        </div>
      </div>
      <AuthForm initialName={user?.name || ''} withVehicle={!user?.vehicles?.length} onDone={onAuthed} onCancel={closeAuth} toast={toast} />
    </Sheet>
  );
}
