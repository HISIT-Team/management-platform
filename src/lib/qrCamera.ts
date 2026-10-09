/* ═══════════════════════════════════════════════════════════════════
   Shared QR camera for the forms (asset sticker on the devices, student
   QR). Made for small stickers:
   - asks the camera for a high resolution (the default 640×480 makes a
     1–2 cm sticker unreadable) with continuous focus, and a light zoom
     where the phone supports it (Android);
   - uses the phone's native QR detector when available (Chrome on
     Android, much better on small/low-contrast codes);
   - otherwise jsQR, alternating the centre of the frame at full
     resolution (where the sticker is aimed) and the whole frame.
   ═══════════════════════════════════════════════════════════════════ */
import jsQR from 'jsqr';

export interface QrCameraOptions {
  /** Zoom factor to apply when the camera supports it (1 = none). */
  zoom?: number;
}

export interface QrCamera {
  stop: () => void;
  /** Present only when the camera has a flashlight. */
  setTorch?: (on: boolean) => Promise<void>;
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

async function nativeDetector(): Promise<Detector | null> {
  const BD = (window as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } })
    .BarcodeDetector;
  if (!BD) return null;
  try {
    const formats = (await BD.getSupportedFormats?.()) ?? ['qr_code'];
    return formats.includes('qr_code') ? new BD({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

async function openCamera(): Promise<MediaStream> {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) throw new Error('no-camera-api');
  try {
    return await md.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    if ((e as Error).name === 'NotAllowedError') throw e;
    // Some devices refuse the resolution hint: fall back to the defaults.
    return md.getUserMedia({ audio: false, video: { facingMode: 'environment' } });
  }
}

export async function startQrCamera(video: HTMLVideoElement, onCode: (text: string) => void, opts: QrCameraOptions = {}): Promise<QrCamera> {
  const stream = await openCamera();
  const track = stream.getVideoTracks()[0];
  let stopped = false;
  let timer: number | null = null;

  const stop = () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };

  // Continuous focus + zoom where supported (ignored elsewhere).
  type Caps = MediaTrackCapabilities & { focusMode?: string[]; zoom?: { min: number; max: number }; torch?: boolean };
  const caps = (track?.getCapabilities?.() ?? {}) as Caps;
  const adv: Record<string, unknown> = {};
  if (caps.focusMode?.includes('continuous')) adv.focusMode = 'continuous';
  if (opts.zoom && opts.zoom > 1 && caps.zoom && caps.zoom.max > 1) adv.zoom = Math.min(opts.zoom, caps.zoom.max);
  if (Object.keys(adv).length) {
    try {
      await track.applyConstraints({ advanced: [adv as MediaTrackConstraintSet] });
    } catch {
      /* not supported: keep going */
    }
  }

  video.muted = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    /* autoplay will start it */
  }

  const detector = await nativeDetector();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let pass = 0;

  const decodeJsQR = (): string | null => {
    if (!ctx) return null;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    const centre = pass++ % 2 === 0;
    if (centre) {
      // The square in the middle (where the on-screen frame is), at full resolution.
      const side = Math.round(Math.min(vw, vh) * 0.8);
      sx = Math.round((vw - side) / 2);
      sy = Math.round((vh - side) / 2);
      sw = sh = side;
    }
    const max = centre ? 900 : 1000;
    const scale = Math.min(1, max / Math.max(sw, sh));
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: centre ? 'attemptBoth' : 'dontInvert' });
    return code?.data ?? null;
  };

  const tick = async () => {
    if (stopped) return;
    let text: string | null = null;
    if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth) {
      if (detector) {
        try {
          const found = await detector.detect(video);
          text = found[0]?.rawValue ?? null;
        } catch {
          text = decodeJsQR();
        }
      } else {
        text = decodeJsQR();
      }
    }
    if (stopped) return;
    if (text) {
      stop();
      onCode(text);
      return;
    }
    timer = window.setTimeout(tick, detector ? 120 : 160);
  };
  timer = window.setTimeout(tick, 300);

  const cam: QrCamera = { stop };
  if (caps.torch) {
    cam.setTorch = async (on: boolean) => {
      try {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      } catch {
        /* ignore */
      }
    };
  }
  return cam;
}

/** Message for a camera that could not be opened. */
export function cameraErrorMessage(e: unknown): string {
  const name = (e as Error)?.name;
  if (name === 'NotAllowedError') return 'Camera permission denied: allow the camera for this site in the browser settings. / Permesso fotocamera negato.';
  if (name === 'NotFoundError') return 'No camera found on this device. / Nessuna fotocamera trovata.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. / Fotocamera occupata da un’altra app.';
  if (!window.isSecureContext) return 'The camera needs the HTTPS address of the platform. / Serve HTTPS.';
  return 'Camera not accessible. / Fotocamera non disponibile.';
}
