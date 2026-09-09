import React from 'react'
import { useInstallPrompt } from '../../hooks/useInstallPrompt.jsx'
import { Download } from 'lucide-react'

export default function InstallAppButton({ variant = 'button' }) {
  const { isInstallable, isInstalled, installApp } = useInstallPrompt()

  // Mobile App (PWA): Do not render if already installed or unsupported
//   if (isInstalled || !isInstallable) return null

  const handleInstall = async () => {
    const result = await installApp()
    if (result.outcome === 'accepted') {
      console.log('Mobile App Installation Accepted')
    }
  }

  // Variant 1: Banner style for Settings or Dashboard Bottom
  if (variant === 'banner') {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl bg-sky-950/40 border border-sky-500/30 p-4 text-sky-100 backdrop-blur-sm shadow-md">
        <div>
          <p className="text-sm font-semibold text-white">Install School App</p>
          <p className="text-xs text-sky-300">Add to home screen for fast mobile access.</p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500 transition-colors cursor-pointer"
        >
          <Download size={15} />
          Install
        </button>
      </div>
    )
  }

  // Variant 2: Compact button for Navigation / Header bar
  return (
    <button
      onClick={handleInstall}
      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors cursor-pointer"
    >
      <Download size={14} />
      Install App
    </button>
  )
}