import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

// Register service worker for PWA
serviceWorkerRegistration.register();

// Handle offline/online status
const updateOnlineStatus = () => {
  if (!navigator.onLine) {
    console.log('You are offline. Some features may be limited.');
  }
};

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus(); // Initial check

createRoot(document.getElementById("root")!).render(<App />);
