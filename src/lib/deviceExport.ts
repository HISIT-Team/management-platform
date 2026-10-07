/* ═══════════════════════════════════════════════════════════════════
   Excel export of the student device history (/device-history).
   The xlsx library is loaded only when the user exports.
   ═══════════════════════════════════════════════════════════════════ */
import { type StudentDeviceLogRow, schoolShort } from './deviceLog';

export type ExportDevice = 'all' | 'macbook' | 'ipad';
export type ExportOperation = 'all' | 'Check-out' | 'Check-in';

export interface ExportOptions {
  device: ExportDevice;
  operation: ExportOperation;
  school: string; // 'all' or the legal-entity name
  from: string; // YYYY-MM-DD or ''
  to: string; // YYYY-MM-DD or ''
}

const OP_LABEL: Record<string, string> = { 'Check-out': 'Consegna', 'Check-in': 'Restituzione' };

/* Local calendar day of an ISO timestamp, as YYYY-MM-DD. */
function localDay(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function filterForExport(rows: StudentDeviceLogRow[], o: ExportOptions): StudentDeviceLogRow[] {
  return rows.filter((r) => {
    if (o.device === 'macbook' && !r.macbook_id) return false;
    if (o.device === 'ipad' && !r.ipad_id) return false;
    if (o.operation !== 'all' && r.operation !== o.operation) return false;
    if (o.school !== 'all' && r.school !== o.school) return false;
    const day = localDay(r.created_at);
    if (o.from && day < o.from) return false;
    if (o.to && day > o.to) return false;
    return true;
  });
}

/* Excel stores dates without a time zone: shift so the cell shows the
   Italian local time instead of UTC. */
const asLocal = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
};

export async function exportDeviceHistory(rows: StudentDeviceLogRow[], o: ExportOptions): Promise<number> {
  const data = filterForExport(rows, o).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const { default: writeXlsxFile } = await import('write-excel-file');

  type Col = { column: string; type: unknown; width: number; format?: string; value: (r: StudentDeviceLogRow) => unknown };
  const schema: Col[] = [
    { column: 'Data', type: Date, format: 'dd/mm/yyyy hh:mm', width: 18, value: (r) => asLocal(r.created_at) },
    { column: 'Operazione', type: String, width: 14, value: (r) => OP_LABEL[r.operation] ?? r.operation },
    { column: 'Email studente', type: String, width: 36, value: (r) => r.student_email },
  ];
  const yesNo = (v: boolean | null) => (v === true ? 'Sì' : v === false ? 'No' : '');
  if (o.device !== 'ipad')
    schema.push(
      { column: 'MacBook ID', type: String, width: 18, value: (r) => r.macbook_id ?? '' },
      { column: 'Caricatore MacBook', type: String, width: 12, value: (r) => yesNo(r.macbook_charger) },
      { column: 'Cavo MacBook', type: String, width: 10, value: (r) => yesNo(r.macbook_cable) },
    );
  if (o.device !== 'macbook')
    schema.push(
      { column: 'iPad ID', type: String, width: 18, value: (r) => r.ipad_id ?? '' },
      { column: 'Caricatore iPad', type: String, width: 12, value: (r) => yesNo(r.ipad_charger) },
      { column: 'Cavo iPad', type: String, width: 10, value: (r) => yesNo(r.ipad_cable) },
    );
  schema.push(
    { column: 'Scuola', type: String, width: 12, value: (r) => schoolShort(r.school) },
    { column: 'Firmato da', type: String, width: 13, value: (r) => r.signed_by ?? '' },
  );

  const parts = [
    'storico-assegnazioni',
    o.device === 'all' ? '' : o.device,
    o.operation === 'all' ? '' : OP_LABEL[o.operation].toLowerCase(),
    o.school === 'all' ? '' : schoolShort(o.school).toLowerCase(),
    localDay(new Date().toISOString()),
  ].filter(Boolean);

  await writeXlsxFile(data, {
    // The library's types are loose; the schema above follows its README.
    schema: schema as never,
    fileName: parts.join('_').replace(/[^a-z0-9_\-àèéìòù]/gi, '') + '.xlsx',
    sheet: 'Assegnazioni',
    stickyRowsCount: 1,
    headerStyle: { fontWeight: 'bold', backgroundColor: '#F3E3E6' },
  } as never);
  return data.length;
}
