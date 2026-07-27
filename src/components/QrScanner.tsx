'use client';
/* QR scanner section (camera + jsQR loop) used by the student device form.
   Calls onScan(rawText) for every decoded code; the parent decides what to do. */
import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  onScan: (raw: string) => boolean; // return true if handled/valid → scanner closes
  onError: (msg: string) => void;
  hint?: string;
  title?: string;
  banner?: string;
}

export default function QrScanner({ onScan, onError, hint = "Point camera at the QR code", title = 'Scan QR (optional)', banner }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);

  const stop = () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  };

  const scanFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const cx = c.getContext('2d');
    if (!cx) return;
    cx.drawImage(video, 0, 0);
    const img = cx.getImageData(0, 0, c.width, c.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (code) {
      const handled = onScan(code.data);
      if (handled) stop();
      else {
        onError('QR not recognised.');
        stop();
      }
    }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      intervalRef.current = window.setInterval(scanFrame, 250);
    } catch {
      onError('Camera not accessible.');
    }
  };

  useEffect(() => () => stop(), []);

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
      <button className={'qr-btn' + (scanning ? ' scanning' : '')} type="button" onClick={() => (scanning ? stop() : start())}>
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
