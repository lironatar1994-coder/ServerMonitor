import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './theme.css'
import './workspace.css'

// The browser offers app installation once, at load; Settings shows the install button later.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  window.__monitorInstallPrompt = event
  window.dispatchEvent(new Event('monitor-installable'))
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
