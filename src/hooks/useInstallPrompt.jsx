import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const InstallPromptContext = createContext(null)

export function InstallPromptProvider({ children }) {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Mobile App (PWA): Check if app is already installed/running in standalone mode
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
      setIsInstalled(standalone)
    }
    checkStandalone()

    // Mobile App (PWA): Capture browser's install event
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setDeferredPrompt(event)
      setIsInstallable(true)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setIsInstallable(false)
      setDeferredPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  // Mobile App (PWA): Function to trigger native install prompt dialog
  const installApp = useCallback(async () => {
    if (!deferredPrompt) return { outcome: 'unavailable' }

    deferredPrompt.prompt()
    const choiceResult = await deferredPrompt.userChoice

    setDeferredPrompt(null)
    setIsInstallable(false)

    return choiceResult
  }, [deferredPrompt])

  const value = {
    isInstallable,
    isInstalled,
    installApp
  }

  return (
    <InstallPromptContext.Provider value={value}>
      {children}
    </InstallPromptContext.Provider>
  )
}

export function useInstallPrompt() {
  const context = useContext(InstallPromptContext)
  if (!context) {
    throw new Error('useInstallPrompt must be used within an InstallPromptProvider')
  }
  return context
}