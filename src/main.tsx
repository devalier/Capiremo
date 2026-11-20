import { createRoot } from 'react-dom/client';
import { App } from './App';
import { localOnlyDelivery } from './services/mock';
import { indexedDbStore } from './storage/store';
import './styles.css';

const services = {
  store: indexedDbStore(),
  delivery: localOnlyDelivery,
};

// StrictMode is intentionally not used: its double-invoked effects would open the microphone twice.
createRoot(document.getElementById('root')!).render(<App services={services} />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
