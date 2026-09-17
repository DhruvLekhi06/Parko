import { useApp } from '../store.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { AuthForm } from '../components/AuthForm.jsx';

export default function Welcome() {
  const { finishWelcome, onAuthed, toast } = useApp();
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
              Live parking across Bengaluru, Mumbai, Delhi NCR, Hyderabad, Chennai and Pune. Book a slot before you leave, drive in on your FASTag, walk straight back to your car.
            </p>
          </div>
        </div>
        <div className="welcome-form">
          <AuthForm
            onDone={(token, user) => {
              onAuthed(token, user);
              finishWelcome();
            }}
            onCancel={finishWelcome}
            cancelLabel="Browse as guest"
            toast={toast}
          />
        </div>
      </div>
    </div>
  );
}
