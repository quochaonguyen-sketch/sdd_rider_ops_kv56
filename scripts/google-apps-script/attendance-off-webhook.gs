/**
 * Set Script Properties before installing the trigger:
 * ATTENDANCE_WEBHOOK_URL = https://<your-domain>/api/attendance/schedule/google-webhook
 * ATTENDANCE_WEBHOOK_SECRET = same value as GOOGLE_SHEETS_WEBHOOK_SECRET on the web server
 *
 * Create an installable "From spreadsheet / On edit" trigger for this function.
 * The OFF tab columns must be: rider_code, rider_name, work_date, status.
 */
function syncAttendanceOffEdit(event) {
  const range = event.range;
  const sheet = range.getSheet();
  if (sheet.getName() !== 'OFF' || range.getRow() === 1) return;

  const startRow = range.getRow();
  const rows = sheet.getRange(startRow, 1, range.getNumRows(), 4).getValues();
  const records = rows.map(function (row) {
    return {
      rider_code: String(row[0] || '').trim(),
      work_date: toIsoDate(row[2]),
      status: toStatus(row[3]),
    };
  }).filter(function (record) { return record.rider_code && record.work_date && record.status; });
  if (!records.length) return;

  const properties = PropertiesService.getScriptProperties();
  UrlFetchApp.fetch(properties.getProperty('ATTENDANCE_WEBHOOK_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-attendance-sheet-secret': properties.getProperty('ATTENDANCE_WEBHOOK_SECRET') },
    payload: JSON.stringify({ spreadsheet_id: event.source.getId(), records: records }),
    muteHttpExceptions: true,
  });
}

function toIsoDate(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
  }
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/) || text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return '';
  return match[3].length === 4 ? match[3] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[1]).slice(-2) : match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2);
}

function toStatus(value) {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
  return { 'off': 'OFF_WEEKLY', 'off tuan': 'OFF_WEEKLY', 'off co xin phep': 'OFF_APPROVED', 'off dot xuat': 'OFF_UNEXPECTED', 'off nhung khong off': 'WORKING_REST_DAY', 'khong di pick': 'NO_PICKUP', 'khong di giao': 'NO_DELIVERY', 'on': 'ON' }[text] || '';
}
