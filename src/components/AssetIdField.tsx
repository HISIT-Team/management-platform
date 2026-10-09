'use client';
/* Asset ID field of the device forms: type the ID, or scan the QR sticker
   on the back of the device. The sticker holds the Asset Manager URL
   (https://assetmanager.h-farm.com/hardware/20169): only the number at the
   end is kept. A QR with just the number is accepted too. */
import React, { useEffect, useRef, useState } from 'react';
import { type QrCamera, cameraErrorMessage, startQrCamera } from '@/lib/qrCamera';

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
  const camRef = useRef<QrCamera | null>(null);
  const [scanning, setScanning] = useState(false);
  const [torch, setTorch] = useState<boolean | null>(null); // null = no flashlight
  // Latest callbacks, so the camera effect doesn't restart on every render.
  const cb = useRef({ onChange, onError, onScanned });
  useEffect(() => {
    cb.current = { onChange, onError, onScanned };
  }, [onChange, onError, onScanned]);

  const stop = () => {
    camRef.current?.stop();
    camRef.current = null;
    setScanning(false);
    setTorch(null);
  };

  // The camera starts once the scanner box is visible (a hidden <video>
  // gets no frames on some phones).
  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;
    startQrCamera(
      videoRef.current,
      (raw) => {
        camRef.current = null;
        setScanning(false);
        setTorch(null);
        const id = assetIdFromQr(raw);
        if (!id) {
          cb.current.onError(`QR not recognised: "${raw.slice(0, 60)}" is not an Asset Manager code. / QR non riconosciuto.`);
          return;
        }
        cb.current.onChange(id);
        try {
          navigator.vibrate?.(60);
        } catch {
          /* ignore */
        }
        cb.current.onScanned?.(id);
      },
      { zoom: 2 },
    )
      .then((cam) => {
        if (cancelled) return cam.stop();
        camRef.current = cam;
        if (cam.setTorch) setTorch(false);
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

  const toggleTorch = async () => {
    if (!camRef.current?.setTorch || torch === null) return;
    await camRef.current.setTorch(!torch);
    setTorch(!torch);
  };

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
          onClick={() => (scanning ? stop() : setScanning(true))}
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
        <div className="qr-hint">Hold the sticker inside the square, about 10–15 cm away</div>
        {torch !== null ? (
          <button type="button" className={'qr-torch' + (torch ? ' on' : '')} onClick={toggleTorch} aria-label={torch ? 'Turn off the flashlight' : 'Turn on the flashlight'}>
            <svg viewBox="0 0 24 24">
              <path d="M9 2h6l-1 7h4l-8 13 2-9H7z" />
            </svg>
          </button>
        ) : null}
      </div>
    </>
  );
}
