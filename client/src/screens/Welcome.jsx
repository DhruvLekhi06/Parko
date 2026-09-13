import { useApp } from '../store.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { Button } from '../components/Primitives.jsx';
import { UserForm } from './Profile.jsx';

export default function Welcome() {
  const { user, setUser, finishWelcome } = useApp();
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome-inner">
        <div className="welcome-brand">
          <LogoMark size={56} tile />
          <div>
            <h1 id="welcome-title" className="welcome-title">
              Your spot, sorted.
            </h1>
            <p className="welcome-body" style={{ marginTop: 10 }}>
              Live parking for Bengaluru's malls, hospitals and stations. Hold a spot before you leave, then walk straight back to your car.
            </p>
          </div>
        </div>
        <div className="welcome-form">
          <UserForm
            initial={user}
            submitLabel="Let's go"
            autoFocus
            onSaved={(u) => {
              setUser(u);
              finishWelcome();
            }}
            extra={
              <Button type="button" variant="ghost" block onClick={finishWelcome}>
                Skip for now
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
