'use client';
/* Toast hook shared by the form pages. Returns a showToast(msg, err) function
   and the toast node to render once at the bottom of the page. */
import React, { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [state, setState] = useState<{ msg: string; err: boolean; show: boolean }>({ msg: '', err: false, show: false });
  const timer = useRef<number | null>(null);

  const showToast = useCallback((msg: string, err = false) => {
    if (timer.current) window.clearTimeout(timer.current);
    setState({ msg, err, show: true });
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, show: false })), 4000);
  }, []);

  const toastNode = (
    <div className={'toast' + (state.show ? ' show' : '')} style={{ background: state.err ? '#A32D2D' : '#0F6E56' }} role="status" aria-live="polite">
      {state.msg}
    </div>
  );

  return { showToast, toastNode };
}
