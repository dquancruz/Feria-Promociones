import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AdminPanel } from './components/AdminPanel';
import { Header } from './components/Header';
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
