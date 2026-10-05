'use client';
/* Asset ID field of the device forms: type the ID, or scan the QR sticker
   on the back of the device. The sticker holds the Asset Manager URL
   (https://assetmanager.h-farm.com/hardware/20169): only the number at the
   end is kept. A QR with just the number is accepted too. */
import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/** "…/hardware/20169" (Asset Manager URL) or "20169" → "20169"; anything else → null. */
export function assetIdFromQr(raw: string): string | null {
  const text = raw.trim();
  if (/^\d{1,10}$/.test(text)) return text;
  try {
    const u = new URL(text);
    if (!/(^|\.)h-farm\.com$/i.test(u.hostname)) return null;
    const m = /\/hardware\/(\d{1,10})\/?$/.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  onError: (msg: string) => void;
  onScanned?: (id: string) => void;
  placeholder?: string;
}

export default function AssetIdField({ value, onChange, onError, onScanned, placeholder = 'Asset ID' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scanning, setScanning] = useState(false);

  const stop = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  };

  const scanFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) return;
    const c = (canvasRef.current ||= document.createElement('canvas'));
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (!cx) return;
    cx.drawImage(video, 0, 0);
    const img = cx.getImageData(0, 0, c.width, c.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (!code) return;
    const id = assetIdFromQr(code.data);
    stop();
    if (!id) {
      onError('QR not recognised: it is not an Asset Manager code. / QR non riconosciuto.');
      return;
    }
    onChange(id);
    try {
      navigator.vibrate?.(60);
    } catch {
      /* ignore */
    }
    onScanned?.(id);
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      timerRef.current = window.setInterval(scanFrame, 250);
    } catch {
      stop();
      onError('Camera not accessible. / Fotocamera non disponibile.');
    }
  };

  useEffect(() => () => stop(), []);

  return (
    <>
      <div className="asset-id-row">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={'asset-scan-btn' + (scanning ? ' scanning' : '')}
          onClick={() => (scanning ? stop() : start())}
          aria-label={scanning ? 'Close scanner' : 'Scan the asset QR code'}
          title={scanning ? 'Close scanner' : 'Scan the asset QR code'}
        >
          {scanning ? (
            <svg viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="3" height="3" />
              <rect x="18" y="18" width="3" height="3" />
            </svg>
          )}
          <span>{scanning ? 'Close' : 'Scan'}</span>
        </button>
      </div>
      <div className={'qr-scanner-wrap asset-scanner' + (scanning ? ' active' : '')}>
        <video ref={videoRef} className="qr-video" autoPlay playsInline muted />
        <div className="qr-overlay">
          <div className="qr-frame" />
        </div>
        <div className="qr-hint">Point the camera at the QR sticker on the device</div>
      </div>
    </>
  );
}
