'use client';
/* Cloudflare Turnstile widget (explicit render), wrapped as a React component.
   Parents grab the token imperatively at submit time, exactly like the original
   turnstile.getResponse(id) / turnstile.reset(id) calls. */
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '@/lib/supabase';

interface TurnstileApi {
  render: (el: HTMLElement, opts: { sitekey: string }) => string;
  getResponse: (id: string) => string | undefined;
  reset: (id: string) => void;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  getResponse: () => string;
  reset: () => void;
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function ensureScript(): void {
  if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return;
  const s = document.createElement('script');
  s.src = SCRIPT_SRC;
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}

const Turnstile = forwardRef<TurnstileHandle, { className?: string; style?: React.CSSProperties }>(
  function Turnstile({ className, style }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
      getResponse: () => (widgetId.current && window.turnstile ? window.turnstile.getResponse(widgetId.current) || '' : ''),
      reset: () => {
        if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
      },
    }));

    useEffect(() => {
      let cancelled = false;
      ensureScript();

      const tryRender = () => {
        if (cancelled) return;
        if (window.turnstile && containerRef.current && widgetId.current === null) {
          widgetId.current = window.turnstile.render(containerRef.current, { sitekey: TURNSTILE_SITE_KEY });
          return;
        }
        if (widgetId.current === null) window.setTimeout(tryRender, 120);
      };
      tryRender();

      return () => {
        cancelled = true;
        if (widgetId.current && window.turnstile) {
          try {
            window.turnstile.remove(widgetId.current);
          } catch {
            /* ignore */
          }
          widgetId.current = null;
        }
      };
    }, []);

    return <div ref={containerRef} className={className} style={style} />;
  },
);

export default Turnstile;
