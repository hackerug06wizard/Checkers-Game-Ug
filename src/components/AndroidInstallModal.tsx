import React, { useState, useEffect } from 'react';
import { Smartphone, Download, CheckCircle, X, ExternalLink, RotateCw, ShieldCheck } from 'lucide-react';

interface AndroidInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AndroidInstallModal: React.FC<AndroidInstallModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      alert(
        'To install on Android:\n1. Open menu (⋮) in Chrome.\n2. Tap "Add to Home Screen" or "Install App".'
      );
    }
  };

  const handleDownloadManifest = () => {
    const element = document.createElement('a');
    const file = new Blob([
      JSON.stringify(
        {
          name: 'Checkers Online - Android App',
          short_name: 'Checkers',
          start_url: window.location.href,
          display: 'standalone',
          background_color: '#0f172a',
          theme_color: '#0f172a',
          orientation: 'any',
        },
        null,
        2
      )
    ], { type: 'application/json' });
    element.href = URL.createObjectURL(file);
    element.download = 'checkers-app-manifest.json';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-red-600 p-0.5 shadow-lg shadow-amber-950/40">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Smartphone className="w-8 h-8 text-amber-400" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-black text-white">
              Install Checkers Android App
            </h2>
            <p className="text-xs text-amber-400 font-semibold">
              Native Mobile Experience & Landscape Game Support
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 shrink-0">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">
                Landscape Mode Enabled
              </div>
              <div className="text-xs text-slate-400">
                Rotate your phone sideways for an expanded board view and split-screen multiplayer controls.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-200">
                Reliable AI & Offline/Online Sync
              </div>
              <div className="text-xs text-slate-400">
                Play against smart AI bot or online players with automatic move verification and sound effects.
              </div>
            </div>
          </div>
        </div>

        {/* Installation Instructions */}
        <div className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
            Installation Guide for Android Devices
          </h3>

          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                1
              </span>
              <span>Open this app in <strong>Google Chrome</strong> or Android Browser.</span>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                2
              </span>
              <span>Tap the <strong>Chrome Menu (⋮)</strong> at the top right corner.</span>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-xs">
                3
              </span>
              <span>Select <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install App&quot;</strong>.</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <a
            href={`https://www.pwabuilder.com/build?url=${encodeURIComponent(
              typeof window !== 'undefined' ? window.location.href : ''
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-500 hover:from-emerald-400 hover:to-amber-400 text-slate-950 font-black text-sm shadow-xl shadow-emerald-950/30 transition flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5 text-slate-950" />
            <span>Generate & Download APK File (PWABuilder)</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          {isInstalled ? (
            <div className="p-3 rounded-2xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-extrabold flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <span>App Installed! Check your Android home screen.</span>
            </div>
          ) : (
            <button
              onClick={handleInstallClick}
              className="w-full py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 border border-slate-700"
            >
              <Smartphone className="w-4 h-4 text-amber-400" />
              <span>{deferredPrompt ? 'Direct Install App on Android' : 'Add App to Home Screen'}</span>
            </button>
          )}

          <button
            onClick={handleDownloadManifest}
            className="w-full py-2.5 rounded-2xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-2 border border-slate-800"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span>Download APK Native Capacitor Config</span>
          </button>
        </div>
      </div>
    </div>
  );
};
