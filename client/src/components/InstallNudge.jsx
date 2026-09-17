import { useEffect, useState } from 'react';
import { useInstall } from '../hooks/useInstall.js';
import { LogoMark } from './Logo.jsx';
import { Button, IconButton } from './Primitives.jsx';
import { navigate } from '../router.jsx';

export function InstallNudge({ hidden = false }) {
  const { mode, dismissed, install, dismiss } = useInstall();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 3500);
    return () => window.clearTimeout(id);
  }, []);
  if (hidden || !ready || dismissed || mode === 'installed' || mode === 'none') return null;

  const onInstall = async () => {
    if (mode === 'ios') {
      dismiss();
      navigate('/profile');
      return;
    }
    setBusy(true);
    const r = await install();
    setBusy(false);
    if (r !== 'accepted') dismiss();
  };

  return (
    <div className="nudge" role="dialog" aria-label="Install SpotOn">
      <LogoMark size={32} tile />
      <div className="nudge-text">
        <div className="nudge-title">Get SpotOn on your phone</div>
        <div className="nudge-sub">{mode === 'ios' ? 'Add to Home Screen from Safari' : 'Full screen, faster, works offline'}</div>
      </div>
      <Button variant="primary" size="sm" onClick={onInstall} loading={busy}>
        {mode === 'ios' ? 'How' : 'Install'}
      </Button>
      <IconButton name="close" label="Not now" size="sm" onClick={dismiss} />
    </div>
  );
}
