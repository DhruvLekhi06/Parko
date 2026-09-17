import { useState } from 'react';
import { useInstall } from '../hooks/useInstall.js';
import { LogoMark } from './Logo.jsx';
import { Button, IconButton } from './Primitives.jsx';
import { Icon } from './Icons.jsx';

export function InstallBanner({ compact = false, always = false }) {
  const { mode, dismissed, install, dismiss } = useInstall();
  const [busy, setBusy] = useState(false);
  const [showIos, setShowIos] = useState(false);
  if (mode === 'installed') return null;
  if (mode === 'none' && !always) return null;
  if (dismissed && !always) return null;

  const onInstall = async () => {
    if (mode === 'ios' || mode === 'none') {
      setShowIos((v) => !v);
      return;
    }
    setBusy(true);
    await install();
    setBusy(false);
  };

  return (
    <div className={`install ${compact ? 'is-compact' : ''}`} role="region" aria-label="Install SpotOn">
      <div className="install-row">
        <LogoMark size={compact ? 32 : 40} tile />
        <div className="install-text">
          <div className="install-title">Get SpotOn on your phone</div>
          <div className="install-sub">{mode === 'prompt' ? 'Installs in a second. Opens full screen, no browser bar.' : mode === 'ios' ? 'Add it to your Home Screen from Safari.' : 'Open this page on your phone to install it.'}</div>
        </div>
        <Button variant="primary" size="sm" onClick={onInstall} loading={busy} icon={mode === 'prompt' ? 'plus' : undefined}>
          {mode === 'prompt' ? 'Install' : 'How'}
        </Button>
        {!always ? <IconButton name="close" label="Not now" size="sm" onClick={dismiss} /> : null}
      </div>
      {showIos ? (
        <ol className="install-steps">
          <li>
            <Icon name="external" size={14} /> Tap the Share button in Safari (the square with an arrow).
          </li>
          <li>
            <Icon name="plus" size={14} /> Choose "Add to Home Screen".
          </li>
          <li>
            <Icon name="check" size={14} /> Tap Add. SpotOn appears with your other apps.
          </li>
        </ol>
      ) : null}
    </div>
  );
}
