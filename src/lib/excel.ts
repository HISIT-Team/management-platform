/* ═══════════════════════════════════════════════════════════════════
   Generic Excel export for the platform's lists (budget, audit log,
   users, tasks…). write-excel-file v2 is loaded only on click and needs
   no worker, so it fits the site's CSP (see public/_headers).
   ═══════════════════════════════════════════════════════════════════ */

export interface ExcelColumn<T> {
  header: string;
  width?: number;
  type?: 'string' | 'number' | 'date' | 'datetime' | 'euro';
  value: (row: T) => string | number | Date | null | undefined;
}

/* Excel stores dates without a time zone: shift so the cell shows the
   Italian local time instead of UTC. */
export function asLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return null;
  return iso.length === 10 ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : new Date(d.getTime() - d.getTimezoneOffset() * 60000);
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Builds and downloads `<baseName>_<YYYY-MM-DD>.xlsx`. Returns the number of rows. */
export async function exportExcel<T>(baseName: string, sheet: string, columns: ExcelColumn<T>[], rows: T[]): Promise<number> {
  const { default: writeXlsxFile } = await import('write-excel-file');
  const schema = columns.map((c) => {
    const base = { column: c.header, width: c.width ?? Math.max(12, c.header.length + 2) };
    switch (c.type) {
      case 'number':
        return { ...base, type: Number, value: (r: T) => (c.value(r) === '' || c.value(r) == null ? undefined : Number(c.value(r))) };
      case 'euro':
        return { ...base, type: Number, format: '#,##0.00 €', value: (r: T) => (c.value(r) == null ? undefined : Number(c.value(r))) };
      case 'date':
        return { ...base, type: Date, format: 'dd/mm/yyyy', value: (r: T) => (c.value(r) as Date | null) ?? undefined };
      case 'datetime':
        return { ...base, type: Date, format: 'dd/mm/yyyy hh:mm', value: (r: T) => (c.value(r) as Date | null) ?? undefined };
      default:
        return { ...base, type: String, value: (r: T) => (c.value(r) == null ? '' : String(c.value(r))) };
    }
  });
  const safe = baseName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_\-àèéìòù]/g, '');
  await writeXlsxFile(rows, {
    // The library's types are loose; the schema follows its README (v2).
    schema: schema as never,
    fileName: `${safe}_${today()}.xlsx`,
    sheet: sheet.slice(0, 31),
    stickyRowsCount: 1,
    headerStyle: { fontWeight: 'bold', backgroundColor: '#F3E3E6' },
  } as never);
  return rows.length;
}
