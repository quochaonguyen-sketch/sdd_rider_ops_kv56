/**
 * Fetch off-schedule data directly from the Google Sheet "Khu 5- Khu 6",
 * tab "Lịch Rider".  This is the **source of truth** for rider OFF schedules.
 *
 * Sheet structure (starting from row 19):
 *   Row 19: date headers in M/D/YYYY format, columns K+ (index 10+)
 *   Row 20: day-of-week / date sub-headers
 *   Row 21+: rider data
 *     Col C (2): Rider ID (rider_code)
 *     Col K+ (10+): status per day — "ON", "OFF tuần", "OFF đột xuất",
 *                   "OFF có xin phép", …
 *
 * Environment variable required: GOOGLE_SHEETS_API_KEY
 */

const SHEET_ID = "1nc-jsQGOdUHIGjmIWQf01HUXJGS82XYglj46eXSzp8c";
const TAB_NAME = "Lịch Rider";
const DATE_COL_START = 10; // column K

export type SheetOffEntry = {
  rider_code: string;
  work_date: string; // YYYY-MM-DD
  off_status: string; // OFF_WEEKLY | OFF_APPROVED | OFF_UNEXPECTED
};

export type SheetOffResult = {
  /** OFF entries extracted from the sheet. */
  offEntries: SheetOffEntry[];
  /**
   * Set of "riderCode|YYYY-MM-DD" keys for every rider+date cell present in
   * the sheet (both ON and OFF).  Used to suppress stale Supabase OFF data for
   * any rider+date the sheet already covers.
   */
  coveredKeys: Set<string>;
};

const STATUS_MAP: Record<string, string> = {
  "OFF tuần": "OFF_WEEKLY",
  "OFF đột xuất": "OFF_UNEXPECTED",
  "OFF có xin phép": "OFF_APPROVED",
};

/**
 * Fetch off-schedule entries from the Google Sheet for a date range.
 * Returns an empty result (with a console warning) when the API key is missing
 * or the request fails — callers fall back to Supabase data seamlessly.
 */
export async function fetchOffScheduleFromSheet(
  startDate: string,
  endDate: string,
): Promise<SheetOffResult> {
  const empty: SheetOffResult = { offEntries: [], coveredKeys: new Set() };

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) {
    console.warn(
      "[sheets-off-schedule] GOOGLE_SHEETS_API_KEY not set — skipping Google Sheet OFF data",
    );
    return empty;
  }

  try {
    const range = encodeURIComponent(`${TAB_NAME}!A19:AZ300`);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}` +
      `?key=${apiKey}&valueRenderOption=FORMATTED_VALUE`;

    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) {
      console.error(
        `[sheets-off-schedule] Sheets API ${response.status} ${response.statusText}`,
      );
      return empty;
    }

    const json = (await response.json()) as { values?: string[][] };
    return parseSheetData(json.values ?? [], startDate, endDate);
  } catch (error) {
    console.error("[sheets-off-schedule] fetch failed:", error);
    return empty;
  }
}

/* ------------------------------------------------------------------ */

function parseSheetData(
  rows: string[][],
  startDate: string,
  endDate: string,
): SheetOffResult {
  const empty: SheetOffResult = { offEntries: [], coveredKeys: new Set() };
  if (rows.length < 3) return empty;

  // Row 0 = date headers (M/D/YYYY) starting at column K
  const dateRow = rows[0];
  const dateCols: { col: number; dateStr: string }[] = [];

  for (let col = DATE_COL_START; col < dateRow.length; col++) {
    const raw = dateRow[col]?.trim();
    if (!raw) continue;
    const parsed = parseSheetDate(raw);
    if (parsed && parsed >= startDate && parsed <= endDate) {
      dateCols.push({ col, dateStr: parsed });
    }
  }

  if (dateCols.length === 0) return empty;

  const offEntries: SheetOffEntry[] = [];
  const coveredKeys = new Set<string>();

  // Rider data starts at row index 2 (row 21 in the spreadsheet)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const riderCode = row[2]?.trim();
    if (!riderCode || !/^\d+$/.test(riderCode)) continue;

    for (const { col, dateStr } of dateCols) {
      const cellValue = row[col]?.trim() ?? "";
      if (!cellValue) continue; // empty cell — no data for this rider+date

      // Mark this rider+date as covered by the sheet
      coveredKeys.add(`${riderCode}|${dateStr}`);

      const offStatus = STATUS_MAP[cellValue];
      if (offStatus) {
        offEntries.push({
          rider_code: riderCode,
          work_date: dateStr,
          off_status: offStatus,
        });
      }
    }
  }

  return { offEntries, coveredKeys };
}

/** Parse "M/D/YYYY" → "YYYY-MM-DD" */
function parseSheetDate(raw: string): string | null {
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}
