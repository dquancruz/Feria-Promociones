import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminPanel } from './components/AdminPanel';
import { Header } from './components/Header';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';

const isAdminRoute = window.location.pathname === '/admin';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isAdminRoute ? (
      <>
        <Header />
        <AdminPanel />
      </>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
