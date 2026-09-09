import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'

// Mobile App (PWA): Install Hook Context
import { InstallPromptProvider } from './hooks/useInstallPrompt.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* Mobile App (PWA): Wrap app with install prompt provider */}
      <InstallPromptProvider>
        <App />
      </InstallPromptProvider>
    </BrowserRouter>
  </StrictMode>
)