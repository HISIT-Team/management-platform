'use client';
/* QR scanner section (shared camera, src/lib/qrCamera.ts) used by the student device form.
   Calls onScan(rawText) for every decoded code; the parent decides what to do. */
import React, { useEffect, useRef, useState } from 'react';
import { type QrCamera, cameraErrorMessage, startQrCamera } from '@/lib/qrCamera';

interface QrScannerProps {
  onScan: (raw: string) => boolean; // return true if handled/valid → scanner closes
  onError: (msg: string) => void;
  hint?: string;
  title?: string;
  banner?: string;
}

export default function QrScanner({ onScan, onError, hint = "Point camera at the QR code", title = 'Scan QR (optional)', banner }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<QrCamera | null>(null);
  const [scanning, setScanning] = useState(false);
  const cb = useRef({ onScan, onError });
  useEffect(() => {
    cb.current = { onScan, onError };
  }, [onScan, onError]);

  const stop = () => {
    camRef.current?.stop();
    camRef.current = null;
    setScanning(false);
  };

  // Started once the scanner box is visible (hidden videos get no frames on some phones).
  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;
    startQrCamera(videoRef.current, (raw) => {
      camRef.current = null;
      setScanning(false);
      if (!cb.current.onScan(raw)) cb.current.onError('QR not recognised.');
    })
      .then((cam) => {
        if (cancelled) return cam.stop();
        camRef.current = cam;
      })
      .catch((e) => {
        if (cancelled) return;
        setScanning(false);
        cb.current.onError(cameraErrorMessage(e));
      });
    return () => {
      cancelled = true;
      camRef.current?.stop();
      camRef.current = null;
    };
  }, [scanning]);

  return (
    <div className="section">
      <div className="section-title">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="3" height="3" />
          <rect x="18" y="14" width="3" height="3" />
          <rect x="14" y="18" width="3" height="3" />
          <rect x="18" y="18" width="3" height="3" />
        </svg>
        {title}
      </div>
      <button className={'qr-btn' + (scanning ? ' scanning' : '')} type="button" onClick={() => (scanning ? stop() : setScanning(true))}>
        {scanning ? (
          <>
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Close scanner
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Scan QR code
          </>
        )}
      </button>
      <div className={'qr-scanner-wrap' + (scanning ? ' active' : '')}>
        <video ref={videoRef} className="qr-video" autoPlay playsInline muted />
        <div className="qr-overlay">
          <div className="qr-frame" />
        </div>
        <div className="qr-hint">{hint}</div>
      </div>
      <div className={'qr-success-banner' + (banner ? ' show' : '')}>
        <svg viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span>{banner}</span>
      </div>
    </div>
  );
}
