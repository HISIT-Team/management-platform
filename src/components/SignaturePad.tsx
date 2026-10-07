'use client';
/* Reusable canvas signature pad. Exposes hasSig()/toDataURL()/clear() to the
   parent via ref — a faithful port of the original initSignaturePad(). */
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface SignaturePadHandle {
  hasSig: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

interface SignaturePadProps {
  width?: number;
  height?: number;
  short?: boolean;
  /** Called when the pad goes from empty to signed and back (clear). */
  onChange?: (hasSig: boolean) => void;
}

/* A signature counts only after a real stroke (total ink length in canvas
   pixels): a tap or an accidental touch is not a signature. */
const MIN_INK = 80;

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { width = 640, height = 150, short = false, onChange },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hasSigRef = useRef(false);
  const inkRef = useRef(0);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useImperativeHandle(ref, () => ({
    hasSig: () => hasSigRef.current,
    toDataURL: () => canvasRef.current?.toDataURL('image/png') ?? '',
    clear: () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      inkRef.current = 0;
      if (hasSigRef.current) {
        hasSigRef.current = false;
        onChangeRef.current?.(false);
      }
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#8B1A2B';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let drawing = false;
    let lx = 0;
    let ly = 0;

    const pt = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      const sx = canvas.width / r.width;
      const sy = canvas.height / r.height;
      const t = (e as TouchEvent).touches;
      if (t && t.length) {
        return { x: (t[0].clientX - r.left) * sx, y: (t[0].clientY - r.top) * sy };
      }
      const m = e as MouseEvent;
      return { x: (m.clientX - r.left) * sx, y: (m.clientY - r.top) * sy };
    };

    const ink = (x: number, y: number) => {
      inkRef.current += Math.hypot(x - lx, y - ly);
      if (!hasSigRef.current && inkRef.current >= MIN_INK) {
        hasSigRef.current = true;
        onChangeRef.current?.(true);
      }
    };

    const down = (e: MouseEvent) => {
      drawing = true;
      const p = pt(e);
      lx = p.x;
      ly = p.y;
    };
    const move = (e: MouseEvent) => {
      if (!drawing) return;
      const p = pt(e);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ink(p.x, p.y);
      lx = p.x;
      ly = p.y;
    };
    const up = () => {
      drawing = false;
    };
    const tStart = (e: TouchEvent) => {
      e.preventDefault();
      drawing = true;
      const p = pt(e);
      lx = p.x;
      ly = p.y;
    };
    const tMove = (e: TouchEvent) => {
      e.preventDefault();
      if (!drawing) return;
      const p = pt(e);
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ink(p.x, p.y);
      lx = p.x;
      ly = p.y;
    };

    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', up);
    canvas.addEventListener('mouseleave', up);
    canvas.addEventListener('touchstart', tStart, { passive: false });
    canvas.addEventListener('touchmove', tMove, { passive: false });
    canvas.addEventListener('touchend', up);

    return () => {
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', up);
      canvas.removeEventListener('mouseleave', up);
      canvas.removeEventListener('touchstart', tStart);
      canvas.removeEventListener('touchmove', tMove);
      canvas.removeEventListener('touchend', up);
    };
  }, []);

  return <canvas ref={canvasRef} className={'sigpad' + (short ? ' short' : '')} width={width} height={height} />;
});

export default SignaturePad;
