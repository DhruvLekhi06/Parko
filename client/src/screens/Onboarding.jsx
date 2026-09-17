import { useEffect, useState } from 'react';
import { useApp } from '../store.jsx';
import { LogoMark, Wordmark } from '../components/Logo.jsx';
import { AuthForm } from '../components/AuthForm.jsx';
import { FastagForm } from '../components/FastagForm.jsx';
import { Button, ErrorState } from '../components/Primitives.jsx';
import { Icon } from '../components/Icons.jsx';

export function needsOnboarding(user) {
  return !user || user.isGuest || !user.fastagLinked;
}

export default function Onboarding() {
  const { user, userError, refreshUser, setUser, onAuthed, toast, signOut } = useApp();
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSplashDone(true), 1400);
    return () => window.clearTimeout(id);
  }, []);

  const step = !splashDone || (!user && !userError) ? 'splash' : userError && !user ? 'error' : user.isGuest ? 'auth' : 'fastag';

  return (
    <div className={`onboard is-${step}`} role="dialog" aria-modal="true" aria-label="Welcome to SpotOn">
      {step === 'splash' ? (
        <div className="splash">
          <LogoMark size={88} tile />
          <Wordmark size={30} />
          <div className="splash-tag">Your spot, sorted.</div>
        </div>
      ) : (
        <div className="onboard-inner">
          <div className="onboard-brand">
            <LogoMark size={40} tile />
            <Wordmark size={20} />
          </div>
          {step === 'error' ? (
            <ErrorState error={userError} onRetry={refreshUser} />
          ) : step === 'auth' ? (
            <>
              <h1 className="onboard-title">Your spot, sorted.</h1>
              <p className="onboard-body">Book a slot before you leave, drive in on your FASTag, walk straight back to your car. Live across six cities.</p>
              <div className="onboard-card">
                <AuthForm withVehicle={false} onDone={onAuthed} toast={toast} />
              </div>
            </>
          ) : (
            <>
              <div className="onboard-step">Step 2 of 2</div>
              <h1 className="onboard-title">Link your FASTag</h1>
              <p className="onboard-body">Bookings and parking are charged to your FASTag wallet, so you drive in and out without stopping at a counter.</p>
              <div className="onboard-card">
                <FastagForm vehicle={user.defaultVehicle} onDone={(u) => setUser(u)} toast={toast} />
                <div className="onboard-foot">
                  <span>
                    <Icon name="user" size={13} /> {user.email}
                  </span>
                  <Button variant="ghost" size="sm" onClick={signOut}>
                    Not you? Log out
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
