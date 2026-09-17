import { StrictMode, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './store.jsx';
import { useRoute } from './router.jsx';
import { BottomNav, Rail } from './components/Nav.jsx';
import { LivePill, Toasts, EmptyState, ErrorBoundary } from './components/Primitives.jsx';
import { InstallNudge } from './components/InstallNudge.jsx';
import { AuthSheet } from './components/AuthSheet.jsx';
import Explore from './screens/Explore.jsx';
import Venue from './screens/Venue.jsx';
import Floor from './screens/Floor.jsx';
import MyCar from './screens/MyCar.jsx';
import Profile from './screens/Profile.jsx';
import Activity from './screens/Activity.jsx';
import Welcome from './screens/Welcome.jsx';
import Go from './screens/Go.jsx';
import Admin from './screens/Admin.jsx';
import { navigate } from './router.jsx';

function Shell() {
  const route = useRoute();
  const { welcomed } = useApp();
  const mainRef = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [route.pathname]);

  let screen = null;
  if (route.name === 'venue') screen = <Venue key={route.params.id} id={route.params.id} />;
  else if (route.name === 'floor') screen = <Floor key={route.params.id} id={route.params.id} query={route.query} />;
  else if (route.name === 'car') screen = <MyCar />;
  else if (route.name === 'activity') screen = <Activity query={route.query} />;
  else if (route.name === 'profile') screen = <Profile />;
  else if (route.name === 'go') screen = <Go key={route.params.id} id={route.params.id} />;
  else if (route.name === 'admin') screen = <Admin />;
  else if (route.name === 'notfound')
    screen = (
      <div className="screen">
        <EmptyState icon="map" title="That page doesn't exist" body="Let's get you back to the map." action="Go to Explore" onAction={() => navigate('/', { replace: true })} />
      </div>
    );

  return (
    <div className="app">
      <Rail />
      <main ref={mainRef} className="main" tabIndex={-1}>
        <ErrorBoundary resetKey={route.pathname}>
          <div className="route-keep" hidden={route.name !== 'explore'}>
            <Explore />
          </div>
          {screen}
        </ErrorBoundary>
      </main>
      <BottomNav />
      <Toasts />
      <LivePill />
      <InstallNudge hidden={!welcomed || route.name === 'admin'} />
      <AuthSheet />
      {!welcomed ? <Welcome /> : null}
    </div>
  );
}

export default function App() {
  return (
    <StrictMode>
      <AppProvider>
        <Shell />
      </AppProvider>
    </StrictMode>
  );
}
