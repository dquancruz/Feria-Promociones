import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminApp } from './components/admin/AdminApp';
import { isAdminPath } from './utils/routes';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';

const isAdminRoute = isAdminPath(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isAdminRoute ? <AdminApp /> : <App />}
  </React.StrictMode>,
);
