/* ═══════════════════════════════════════════════════════════════════
   Display preferences of this browser (My profile → Aspetto):
   - size: interface scale. "auto" picks it from the window width, so a
     34" ultrawide or a 4K monitor gets larger text and controls, while a
     MacBook stays at 100 %.
   - width: "full" uses all the screen, "centered" keeps the content in a
     comfortable column on very wide monitors.
   Stored in localStorage (per browser, a convenience only).
   ═══════════════════════════════════════════════════════════════════ */

export type UiSize = 'auto' | 'small' | 'normal' | 'large' | 'xlarge';
export type UiWidth = 'full' | 'centered';
export interface UiPrefs {
  size: UiSize;
  width: UiWidth;
}

const KEY = 'his:ui';
export const UI_EVENT = 'his:ui-change';
const DEFAULTS: UiPrefs = { size: 'auto', width: 'full' };

export const SIZE_OPTIONS: { value: UiSize; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automatica', hint: 'si adatta allo schermo' },
  { value: 'small', label: 'Compatta', hint: '90 %' },
  { value: 'normal', label: 'Normale', hint: '100 %' },
  { value: 'large', label: 'Grande', hint: '115 %' },
  { value: 'xlarge', label: 'Molto grande', hint: '130 %' },
];

export function readUiPrefs(): UiPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<UiPrefs> | null;
    return { ...DEFAULTS, ...(v ?? {}) };
  } catch {
    return DEFAULTS;
  }
}

export function saveUiPrefs(p: UiPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: applies to this page only */
  }
  window.dispatchEvent(new CustomEvent(UI_EVENT, { detail: p }));
}

/** Scale for a window `width` CSS px wide. */
export function autoZoom(width: number): number {
  if (width >= 3200) return 1.3;
  if (width >= 2500) return 1.2;
  if (width >= 1900) return 1.1;
  return 1;
}

export function zoomFor(p: UiPrefs, width: number): number {
  if (width < 768) return 1; // phones: always 100 %
  switch (p.size) {
    case 'small':
      return 0.9;
    case 'normal':
      return 1;
    case 'large':
      return 1.15;
    case 'xlarge':
      return 1.3;
    default:
      return autoZoom(width);
  }
}
