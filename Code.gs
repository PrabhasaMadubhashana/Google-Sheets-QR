
// ==================================
// CONFIG
// ==================================
const REG_SPREADSHEET_ID   = "Your_Regitrations_Sheet_ID_Here";
const STAFF_SPREADSHEET_ID = "Your Staff_Sheet_ID_Here";

const REG_SHEET   = "Registrations";
const STAFF_SHEET = "Staff";

const YES = "YES";

// ==================================
// HELPERS
// ==================================
function getRegSheet() {
  return SpreadsheetApp.openById(REG_SPREADSHEET_ID).getSheetByName(REG_SHEET);
}

function getStaffSheet() {
  return SpreadsheetApp.openById(STAFF_SPREADSHEET_ID).getSheetByName(STAFF_SHEET);
}

function text(msg) {
  return HtmlService.createHtmlOutput(String(msg));
}

// ==================================
// ENTRY POINT — QR SCAN
// (NO auto "already checked" logic here)
// ==================================
function doGet(e) {
  if (!e || !e.parameter || !e.parameter.t) {
    return text("Invalid QR");
  }

  const token = String(e.parameter.t).trim();
  const sheet = getRegSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const tokenCol = headers.indexOf("QR Token");
  if (tokenCol === -1) return text("QR Token column missing");

  let row = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][tokenCol]).trim() === token) {
      row = data[i];
      break;
    }
  }
  if (!row) return text("QR not found");

  const record = {};
  headers.forEach((h, i) => record[h] = row[i]);

  const tpl = HtmlService.createTemplateFromFile("page");
  tpl.p = record;

  return tpl.evaluate()
    .setTitle("Participant Verification")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ==================================
// STAFF LOGIN
// Columns: Staff_Name | Staff_Code | Enabled
// ==================================
function validateStaff(code) {
  code = String(code || "").trim();
  if (!code) return null;

  const data = getStaffSheet().getDataRange().getValues();
  data.shift();

  for (const r of data) {
    const enabled = String(r[2] || "").toLowerCase();
    if (
      (enabled === "yes" || enabled === "true" || enabled === "1") &&
      String(r[1]).trim().toLowerCase() === code.toLowerCase()
    ) {
      return r[0] || "Staff";
    }
  }
  return null;
}

// ==================================
// CONFIRM ATTENDANCE (SINGLE SOURCE OF TRUTH)
// ==================================
function markAction(token, staffName) {
  if (!token || !staffName) return "Unauthorized";

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return "System busy";

  try {
    const sheet = getRegSheet();
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const tokenCol = headers.indexOf("QR Token");
    const timeCol  = headers.indexOf("Attendance_Time") + 1;
    const attCol   = headers.indexOf("Attendance") + 1;
    const issueCol = headers.indexOf("TShirt_Issued") + 1;
    const byCol    = headers.indexOf("Issued_By") + 1;

    let rowNum = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][tokenCol]).trim() === token) {
        rowNum = i + 1;
        break;
      }
    }
    if (rowNum === -1) return "Record not found";

    // 🔒 TRUE already-checked check
    if (sheet.getRange(rowNum, timeCol).getValue()) {
      return "ALREADY";
    }

    sheet.getRange(rowNum, attCol).setValue(YES);
    sheet.getRange(rowNum, issueCol).setValue(YES);
    sheet.getRange(rowNum, timeCol).setValue(new Date());
    sheet.getRange(rowNum, byCol).setValue(staffName);

    return "CONFIRMED";
  } finally {
    lock.releaseLock();
  }
}

// ==================================
// QR GENERATOR — ONLY NEW ENTRIES
// ==================================
function generateQRCodes() {
  const sheet = getRegSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const tokenCol = headers.indexOf("QR Token");
  const serialCol = headers.indexOf("Serial_No");

  const baseUrl = ScriptApp.getService().getUrl();
  const folder = getOrCreateFolder("QR_Codes");

  for (let i = 1; i < data.length; i++) {

    // ✅ keep existing QRs
    if (String(data[i][tokenCol]).trim()) continue;

    const token = Utilities.getUuid().slice(0, 8);
    sheet.getRange(i + 1, tokenCol + 1).setValue(token);

    const serial = String(data[i][serialCol]).padStart(3, "0");
    const qrUrl = baseUrl + "?t=" + token;

    const blob = UrlFetchApp.fetch(
      "https://api.qrserver.com/v1/create-qr-code/?size=204x204&data=" +
      encodeURIComponent(qrUrl)
    ).getBlob().setName(`Techfest25_${serial}.png`);

    folder.createFile(blob);
  }
}

function getOrCreateFolder(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}



