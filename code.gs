const SPREADSHEET_ID = "1qbZLB9tsumTwPuXZLXFdlwHKyl5g-rAsYvL1EsE_VN4";
const DOC_TEMPLATE_ID = "1gdx9k0Vbea_CIwOJwB4l0E_H-ePDSz3qN_jmBv9VW6c";

const COMMAND_TEMPLATE_SOLO_ID = "1tanbQgNp8NYCjUCDig0qvzpzZ4tFsT1Z_ru6qGn5O4g";
const COMMAND_TEMPLATE_GROUP_SMALL_ID =
  "1jzJg_qwRYNa8wjb32PVgnVmrzkO0bNVNcOECb2a6u6Y";
const COMMAND_TEMPLATE_GROUP_LARGE_ID =
  "10M8eolqah-8WXxHQ_q43NXiCOv0CkbnBxqq6AgfxtB0";

const DISPATCH_BOOK_TEMPLATE_ID =
  "1lYNnhsDCuCMlHKh4ui_MbivRV-OFJ6icQFLu8fJdYP8";

const PDF_FOLDER_ID = "1pGiVOigsZZqb-jOix2izMMl0AwzfS27Z";
const ARCHIVE_CACHE_TTL_SEC = 300;
const PUBLIC_WEEKLY_CACHE_TTL_SEC = 180;
const DATA_CACHE_VERSION = "v3";

function getScriptCache_() {
  return CacheService.getScriptCache();
}

function buildCacheKey_(parts) {
  return [DATA_CACHE_VERSION].concat(parts).join(":");
}

function readJsonCache_(key) {
  const raw = getScriptCache_().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function writeJsonCache_(key, value, ttlSec) {
  getScriptCache_().put(key, JSON.stringify(value), ttlSec);
  return value;
}

function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty("SUPABASE_URL") || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(props.getProperty("SUPABASE_SERVICE_ROLE_KEY") || "").trim();

  if (!url) {
    throw new Error("ยังไม่ได้ตั้งค่า Script Property: SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    throw new Error("ยังไม่ได้ตั้งค่า Script Property: SUPABASE_SERVICE_ROLE_KEY");
  }

  return {
    url: url,
    serviceRoleKey: serviceRoleKey,
  };
}

function supabaseFetch_(path, options) {
  const cfg = getSupabaseConfig_();
  const requestOptions = options || {};
  const headers = Object.assign(
    {
      apikey: cfg.serviceRoleKey,
      Authorization: "Bearer " + cfg.serviceRoleKey,
      Accept: "application/json",
    },
    requestOptions.headers || {},
  );

  const fetchOptions = Object.assign(
    {
      method: "get",
      muteHttpExceptions: true,
      headers: headers,
    },
    requestOptions,
  );

  delete fetchOptions.headers;
  fetchOptions.headers = headers;

  const response = UrlFetchApp.fetch(cfg.url + path, fetchOptions);
  const statusCode = response.getResponseCode();
  const bodyText = response.getContentText();

  let jsonBody = null;
  if (bodyText) {
    try {
      jsonBody = JSON.parse(bodyText);
    } catch (e) {}
  }

  return {
    statusCode: statusCode,
    bodyText: bodyText,
    jsonBody: jsonBody,
    headers: response.getAllHeaders(),
  };
}

function getSupabaseHeader_(headers, headerName) {
  const safeHeaders = headers || {};
  const target = String(headerName || "").trim().toLowerCase();
  if (!target) return "";
  const matchedKey = Object.keys(safeHeaders).find(
    (key) => String(key || "").trim().toLowerCase() === target,
  );
  return matchedKey ? safeHeaders[matchedKey] : "";
}

function assertSupabaseResponseOk_(response, actionLabel) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      (actionLabel || "เรียกใช้ Supabase ไม่สำเร็จ") +
        " (" +
        response.statusCode +
        "): " +
        (response.bodyText || "Unknown error"),
    );
  }
  return response;
}

function supabaseUpsert_(tableName, records, onConflict) {
  const rows = Array.isArray(records) ? records : [records];
  if (!rows.length) return;

  const query = onConflict
    ? "?on_conflict=" + encodeURIComponent(onConflict)
    : "";
  const response = supabaseFetch_("/rest/v1/" + tableName + query, {
    method: "post",
    payload: JSON.stringify(rows),
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
  });

  assertSupabaseResponseOk_(response, "อัปเดตตาราง " + tableName + " ไม่สำเร็จ");
}

function supabaseDeleteWhere_(tableName, filterQuery) {
  const response = supabaseFetch_("/rest/v1/" + tableName + "?" + filterQuery, {
    method: "delete",
    headers: {
      Prefer: "return=minimal",
    },
  });

  assertSupabaseResponseOk_(response, "ลบข้อมูลจาก " + tableName + " ไม่สำเร็จ");
}

function supabaseSelectSingle_(tableName, queryString) {
  const separator = queryString ? "&" : "";
  const response = supabaseFetch_(
    "/rest/v1/" + tableName + "?" + queryString + separator + "limit=1",
    {
      method: "get",
      headers: {
        Prefer: "count=exact",
      },
    },
  );
  assertSupabaseResponseOk_(response, "อ่านข้อมูล " + tableName + " จาก Supabase ไม่สำเร็จ");
  const rows = Array.isArray(response.jsonBody) ? response.jsonBody : [];
  return rows.length ? rows[0] : null;
}

function supabaseCount_(tableName, queryString) {
  const query = queryString ? queryString + "&select=*&limit=1" : "select=*&limit=1";
  const response = supabaseFetch_("/rest/v1/" + tableName + "?" + query, {
    method: "get",
    headers: {
      Range: "0-0",
      Prefer: "count=exact",
    },
  });
  assertSupabaseResponseOk_(
    response,
    "นับข้อมูล " + tableName + " จาก Supabase ไม่สำเร็จ",
  );

  const contentRange = String(
    getSupabaseHeader_(response.headers, "Content-Range") || "",
  );
  const matched = contentRange.match(/\/(\d+)$/);
  if (matched) {
    return parseInt(matched[1], 10) || 0;
  }

  const rows = Array.isArray(response.jsonBody) ? response.jsonBody : [];
  return rows.length;
}

function getAppSettingValue_(key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return null;
  const row = supabaseSelectSingle_(
    "app_settings",
    "select=*&key=eq." + encodeURIComponent(safeKey),
  );
  return row ? row.value || null : null;
}

function saveAppSettingValue_(key, value, updatedBy) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    throw new Error("ไม่พบ key สำหรับ app_settings");
  }
  supabaseUpsert_(
    "app_settings",
    {
      key: safeKey,
      value: value || {},
      updated_by: String(updatedBy || "").trim() || null,
    },
    "key",
  );
  return {
    key: safeKey,
    value: value || {},
  };
}

function getSystemConfigValue_(key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return null;
  const row = supabaseSelectSingle_(
    "system_config",
    "select=*&key=eq." + encodeURIComponent(safeKey),
  );
  return row ? row.value || null : null;
}

function saveSystemConfigValue_(key, value, updatedBy) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    throw new Error("ไม่พบ key สำหรับ system_config");
  }
  supabaseUpsert_(
    "system_config",
    {
      key: safeKey,
      value: value || {},
      updated_by: String(updatedBy || "").trim() || null,
    },
    "key",
  );
  return {
    key: safeKey,
    value: value || {},
  };
}

function parseBooleanParam_(value) {
  if (value === true || value === false) return value;
  const normalized = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "y"].includes(normalized);
}

function parseIntegerParam_(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function getSupabaseDateRangeForPeriod_(yearBE, month) {
  const safeYear = parseIntegerParam_(yearBE);
  const safeMonth = parseIntegerParam_(month);
  if (!safeYear) return null;

  if (safeMonth) {
    const monthStart = new Date(safeYear - 543, safeMonth - 1, 1);
    const monthEnd = new Date(safeYear - 543, safeMonth, 0);
    return {
      yearBE: safeYear,
      month: safeMonth,
      start: Utilities.formatDate(monthStart, "Asia/Bangkok", "yyyy-MM-dd"),
      end: Utilities.formatDate(monthEnd, "Asia/Bangkok", "yyyy-MM-dd"),
    };
  }

  return {
    yearBE: safeYear,
    month: null,
    start: Utilities.formatDate(new Date(safeYear - 543, 0, 1), "Asia/Bangkok", "yyyy-MM-dd"),
    end: Utilities.formatDate(new Date(safeYear - 543, 11, 31), "Asia/Bangkok", "yyyy-MM-dd"),
  };
}

function getLatestRequestPeriodFromSupabase_(yearBE) {
  let query = "select=doc_date,request_id&doc_date=not.is.null&order=doc_date.desc&limit=1";
  const yearRange = getSupabaseDateRangeForPeriod_(yearBE, null);
  if (yearRange) {
    query += "&doc_date=gte." + yearRange.start + "&doc_date=lte." + yearRange.end;
  }

  const rows = supabaseSelectAll_("requests", query, 10);
  if (!rows.length || !rows[0].doc_date) {
    const now = new Date();
    return {
      yearBE: yearRange ? yearRange.yearBE : now.getFullYear() + 543,
      month: now.getMonth() + 1,
    };
  }

  const latestDate = new Date(rows[0].doc_date);
  return {
    yearBE: latestDate.getFullYear() + 543,
    month: latestDate.getMonth() + 1,
  };
}

function resolveSupabasePeriodOptions_(options) {
  const rawOptions = options || {};
  const scope = String(rawOptions.scope || "").trim().toLowerCase();
  let yearBE = parseIntegerParam_(rawOptions.year);
  let month = parseIntegerParam_(rawOptions.month);
  const latestMonth = parseBooleanParam_(rawOptions.latestMonth);

  if (latestMonth) {
    const latest = getLatestRequestPeriodFromSupabase_(yearBE);
    yearBE = latest.yearBE;
    month = latest.month;
  }

  if (scope === "year" && yearBE) {
    month = null;
  }

  const range = yearBE ? getSupabaseDateRangeForPeriod_(yearBE, month) : null;
  return {
    scope: scope,
    latestMonth: latestMonth,
    yearBE: yearBE,
    month: month,
    range: range,
  };
}

function buildSupabaseDateFilterQuery_(columnName, options) {
  const resolved = resolveSupabasePeriodOptions_(options);
  if (!resolved.range) return "";
  return (
    "&" +
    columnName +
    "=gte." +
    resolved.range.start +
    "&" +
    columnName +
    "=lte." +
    resolved.range.end
  );
}

function supabaseSelectByValues_(tableName, columnName, values, queryPrefix, pageSize) {
  const uniqueValues = Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  if (!uniqueValues.length) return [];

  const rows = [];
  const chunkSize = 50;
  for (let i = 0; i < uniqueValues.length; i += chunkSize) {
    const chunk = uniqueValues.slice(i, i + chunkSize);
    const inValues = "(" + chunk.map((value) => '"' + value.replace(/"/g, '\\"') + '"').join(",") + ")";
    const query =
      queryPrefix +
      "&" +
      columnName +
      "=in." +
      encodeURIComponent(inValues);
    rows.push.apply(rows, supabaseSelectAll_(tableName, query, pageSize || 1000));
  }

  return rows;
}

function supabaseDeleteWhereInValues_(tableName, columnName, values) {
  const uniqueValues = Array.from(
    new Set(
      (values || [])
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );
  if (!uniqueValues.length) return;

  const chunkSize = 50;
  for (let i = 0; i < uniqueValues.length; i += chunkSize) {
    const chunk = uniqueValues.slice(i, i + chunkSize);
    const inValues = "(" + chunk.map((value) => '"' + value.replace(/"/g, '\\"') + '"').join(",") + ")";
    supabaseDeleteWhere_(
      tableName,
      columnName + "=in." + encodeURIComponent(inValues),
    );
  }
}

function parseJsonSafely_(value, fallbackValue) {
  if (value === null || value === undefined || value === "") {
    return fallbackValue;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallbackValue;
  }
}

function toSupabaseNumericOrNull_(value) {
  if (value === null || value === undefined || value === "") return null;
  const numericValue = Number(value);
  return isNaN(numericValue) ? null : numericValue;
}

function toSupabaseBoolean_(value) {
  if (value === true || value === "true" || value === 1 || value === "1")
    return true;
  if (value === false || value === "false" || value === 0 || value === "0")
    return false;
  return null;
}

function buildSupabaseRequestRecordFromSheet_(requestRow) {
  const expenseItems = parseJsonSafely_(requestRow.expenseItems, []);
  const extra = {
    startTime: requestRow.starttime || requestRow.startTime || "",
    endTime: requestRow.endtime || requestRow.endTime || "",
    dispatchMonth: requestRow.dispatchmonth || requestRow.dispatchMonth || "",
    dispatchYear: requestRow.dispatchyear || requestRow.dispatchYear || "",
    studentCount: requestRow.studentcount || requestRow.studentCount || "",
    teacherCount: requestRow.teachercount || requestRow.teacherCount || "",
    qty1: requestRow.qty1 || "",
    qty2: requestRow.qty2 || "",
    qty3: requestRow.qty3 || "",
    qty4: requestRow.qty4 || "",
    qty5: requestRow.qty5 || "",
    qty6: requestRow.qty6 || "",
    qty7: requestRow.qty7 || "",
    activeApprovalDocType:
      requestRow.activeapprovaldoctype || requestRow.activeApprovalDocType || "",
    currentPdfUrl: requestRow.currentpdfurl || requestRow.currentPdfUrl || "",
    adminReviewedAt: requestRow.adminreviewedat || requestRow.adminReviewedAt || "",
    adminReviewedBy: requestRow.adminreviewedby || requestRow.adminReviewedBy || "",
    adminRoutedAt: requestRow.adminroutedat || requestRow.adminRoutedAt || "",
    adminRoutedBy: requestRow.adminroutedby || requestRow.adminRoutedBy || "",
    terminatedAt: requestRow.terminatedat || requestRow.terminatedAt || "",
    terminatedBy: requestRow.terminatedby || requestRow.terminatedBy || "",
    terminationReason:
      requestRow.terminationreason || requestRow.terminationReason || "",
    rejectedAt: requestRow.rejectedat || requestRow.rejectedAt || "",
    rejectedBy: requestRow.rejectedby || requestRow.rejectedBy || "",
    sarabanDocNum: requestRow.sarabandocnum || requestRow.sarabanDocNum || "",
    sarabanDocDate: requestRow.sarabandocdate || requestRow.sarabanDocDate || "",
    sarabanStampedAt:
      requestRow.sarabanstampedat || requestRow.sarabanStampedAt || "",
    sarabanStampedBy:
      requestRow.sarabanstampedby || requestRow.sarabanStampedBy || "",
    travelSchedule: parseJsonSafely_(
      requestRow.travelschedule || requestRow.travelSchedule,
      null,
    ),
    travelScheduleStatus:
      requestRow.travelschedulestatus || requestRow.travelScheduleStatus || "",
    travelScheduleUpdatedBy:
      requestRow.travelscheduleupdatedby ||
      requestRow.travelScheduleUpdatedBy ||
      "",
    travelScheduleUpdatedAt:
      requestRow.travelscheduleupdatedat ||
      requestRow.travelScheduleUpdatedAt ||
      "",
    travelSchedulePdfUrl:
      requestRow.travelschedulepdfurl || requestRow.travelSchedulePdfUrl || "",
    travelScheduleGeneratedAt:
      requestRow.travelschedulegeneratedat ||
      requestRow.travelScheduleGeneratedAt ||
      "",
    finalizedAt: requestRow.finalizedat || requestRow.finalizedAt || "",
    dispatchMeta: parseJsonSafely_(
      requestRow.dispatchmeta || requestRow.dispatchMeta,
      null,
    ),
  };

  return {
    request_id: requestRow.id || "",
    created_by: requestRow.username || "",
    doc_date: requestRow.docDate || null,
    requester_name: requestRow.requesterName || "",
    requester_position: requestRow.requesterPosition || "",
    location: requestRow.location || "",
    purpose: requestRow.purpose || "",
    start_date: requestRow.startDate || null,
    end_date: requestRow.endDate || null,
    duration: requestRow.duration || "",
    expense_option: requestRow.expenseOption || "",
    expense_items: expenseItems,
    total_expense: toSupabaseNumericOrNull_(requestRow.totalExpense),
    vehicle_option: requestRow.vehicleOption || "",
    license_plate: requestRow.licensePlate || "",
    department: requestRow.department || "",
    head_name: requestRow.headName || "",
    pdf_url: requestRow.pdfUrl || "",
    created_at_source: requestRow.timestamp || null,
    status: requestRow.status || "",
    command_pdf_url: requestRow.commandPdfUrl || "",
    command_status: requestRow.commandStatus || "",
    command_pdf_url_solo: requestRow.commandPdfUrlSolo || "",
    command_pdf_url_group_small: requestRow.commandPdfUrlGroupSmall || "",
    command_pdf_url_group_large: requestRow.commandPdfUrlGroupLarge || "",
    dispatch_book_pdf_url: requestRow.dispatchBookPdfUrl || "",
    qty_1: toSupabaseNumericOrNull_(requestRow.qty1),
    qty_2: toSupabaseNumericOrNull_(requestRow.qty2),
    qty_3: toSupabaseNumericOrNull_(requestRow.qty3),
    qty_4: toSupabaseNumericOrNull_(requestRow.qty4),
    qty_5: toSupabaseNumericOrNull_(requestRow.qty5),
    qty_6: toSupabaseNumericOrNull_(requestRow.qty6),
    qty_7: toSupabaseNumericOrNull_(requestRow.qty7),
    command_doc_url_solo: requestRow.commandDocUrlSolo || "",
    command_doc_url_group_large: requestRow.commandDocUrlGroupLarge || "",
    doc_url: requestRow.docUrl || "",
    command_doc_url_group_small: requestRow.commandDocUrlGroupSmall || "",
    province: requestRow.province || "",
    stay_at: requestRow.stayAt || "",
    dispatch_vehicle_type: requestRow.dispatchVehicleType || "",
    dispatch_vehicle_id: requestRow.dispatchVehicleId || "",
    completed_memo_url: requestRow.completedMemoUrl || "",
    completed_command_url: requestRow.completedCommandUrl || "",
    memo_status: requestRow.memoStatus || "",
    dispatch_book_url: requestRow.dispatchBookUrl || "",
    admin_memo_url: requestRow.adminMemoUrl || "",
    doc_status: requestRow.docStatus || "",
    was_rejected: toSupabaseBoolean_(requestRow.wasRejected),
    rejection_reason: requestRow.rejectionReason || "",
    command_template_type: requestRow.commandTemplateType || "",
    extra: extra,
  };
}

function getAttendeeRowsForRequestFromSheets_(requestId) {
  const attendeesSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Attendees");
  const attendeeRows = sheetToObject(attendeesSheet);
  return attendeeRows.filter(
    (row) => String(row.requestid || row.requestId || "").trim() === String(requestId || "").trim(),
  );
}

function syncRequestByIdToSupabase_(requestId, options) {
  const syncOptions = options || {};
  const requestSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Requests");
  const requestRows = sheetToObject(requestSheet);
  const requestRow = requestRows.find(
    (row) => String(row.id || "").trim() === String(requestId || "").trim(),
  );

  if (!requestRow) {
    throw new Error("ไม่พบคำขอ " + requestId + " ในชีต Requests เพื่อ sync ไป Supabase");
  }

  supabaseUpsert_(
    "requests",
    buildSupabaseRequestRecordFromSheet_(requestRow),
    "request_id",
  );

  if (!syncOptions.replaceAttendees) return;

  const safeRequestId = encodeURIComponent(String(requestId || "").trim());
  supabaseDeleteWhere_("attendees", "request_id=eq." + safeRequestId);

  const attendeeRows = getAttendeeRowsForRequestFromSheets_(requestId);
  if (!attendeeRows.length) return;

  const attendeeRecords = attendeeRows.map((row, index) => ({
    request_id: String(requestId || "").trim(),
    source_row_key: String(requestId || "").trim() + ":" + (index + 1),
    full_name: row.fullname || row.name || "",
    position: row.position || "",
    source_date_text: row.docdate || row.source_date_text || "",
  }));

  supabaseUpsert_("attendees", attendeeRecords, "source_row_key");
}

function buildSupabaseUserRecordFromSheet_(userRow) {
  return {
    username: userRow.username || "",
    login_name: userRow.loginName || userRow.loginname || "",
    full_name: userRow.fullName || userRow.fullname || "",
    position: userRow.position || "",
    department: userRow.department || "",
    role: userRow.role || "",
    email: userRow.email || "",
    special_position: userRow.specialPosition || userRow.specialposition || "",
    token: userRow.token || "",
    legacy_password: userRow.password || "",
  };
}

function buildSupabaseMemoRecordFromSheet_(memoRow) {
  return {
    memo_id: memoRow.id || memoRow.memoId || memoRow.memoid || "",
    submitted_by: memoRow.submittedBy || memoRow.submittedby || "",
    ref_number: memoRow.refNumber || memoRow.refnumber || "",
    status: memoRow.status || "",
    created_at_source: memoRow.timestamp || "",
    file_id: memoRow.fileId || memoRow.fileid || "",
    file_url: memoRow.fileURL || memoRow.fileUrl || memoRow.fileurl || "",
    completed_memo_url: memoRow.completedMemoUrl || memoRow.completedmemourl || "",
    completed_command_url: memoRow.completedCommandUrl || memoRow.completedcommandurl || "",
    dispatch_book_url: memoRow.dispatchBookUrl || memoRow.dispatchbookurl || "",
  };
}

function syncSheetsToSupabase(payload) {
  const syncOptions = payload || {};
  const yearBE = parseIntegerParam_(syncOptions.year);
  const requestSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Requests");
  const usersSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  const attendeesSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Attendees");
  const memosSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Memos");

  const allUsers = usersSheet ? sheetToObject(usersSheet) : [];
  const allRequests = requestSheet ? sheetToObject(requestSheet) : [];
  const allAttendees = attendeesSheet ? sheetToObject(attendeesSheet) : [];
  const allMemos = memosSheet ? sheetToObject(memosSheet) : [];

  const filteredRequests = filterRequestsByPeriod_(
    allRequests,
    yearBE ? { year: yearBE, scope: "year" } : {},
  );
  const requestIds = new Set(
    filteredRequests.map((row) => String(row.id || row.requestId || "").trim()).filter(Boolean),
  );

  const filteredAttendees = allAttendees.filter((row) =>
    requestIds.has(String(row.requestid || row.requestId || "").trim()),
  );
  const filteredMemos = allMemos.filter((row) =>
    requestIds.has(String(row.refNumber || row.refnumber || "").trim()),
  );

  const userRecords = allUsers
    .map(buildSupabaseUserRecordFromSheet_)
    .filter((row) => row.username);
  const requestRecords = filteredRequests
    .map(buildSupabaseRequestRecordFromSheet_)
    .filter((row) => row.request_id);
  const attendeeRecords = filteredAttendees
    .map((row, index) => ({
      request_id: String(row.requestid || row.requestId || "").trim(),
      source_row_key:
        "sheet-attendee:" +
        String(row.requestid || row.requestId || "").trim() +
        ":" +
        (index + 1),
      full_name: row.fullname || row.name || "",
      position: row.position || "",
      source_date_text: row.docdate || row.date || "",
      attended_at: row.date || "",
    }))
    .filter((row) => row.request_id && row.full_name);
  const memoRecords = filteredMemos
    .map(buildSupabaseMemoRecordFromSheet_)
    .filter((row) => row.memo_id);

  supabaseUpsert_("app_users", userRecords, "username");
  supabaseUpsert_("requests", requestRecords, "request_id");
  supabaseDeleteWhereInValues_("attendees", "request_id", Array.from(requestIds));
  if (attendeeRecords.length) {
    supabaseUpsert_("attendees", attendeeRecords, "source_row_key");
  }
  if (memoRecords.length) {
    supabaseUpsert_("memos", memoRecords, "memo_id");
  }

  return {
    status: "success",
    message:
      "ซิงก์ข้อมูลจาก Google Sheets ไปยัง Supabase เรียบร้อยแล้ว" +
      (yearBE ? " สำหรับปี " + yearBE : ""),
    counts: {
      users: userRecords.length,
      requests: requestRecords.length,
      attendees: attendeeRecords.length,
      memos: memoRecords.length,
    },
  };
}

function buildSupabaseDraftRecordFromPayload_(draftId, payload, timestamp) {
  const expenseItems = parseJsonSafely_(payload.expenseItems, []);
  const attendees = parseJsonSafely_(payload.attendees, []);

  return {
    draft_id: draftId,
    username: payload.username || "",
    doc_date: payload.docDate || null,
    requester_name: payload.requesterName || "",
    requester_position: payload.requesterPosition || "",
    location: payload.location || "",
    province: payload.province || "",
    purpose: payload.purpose || "",
    start_date: payload.startDate || null,
    end_date: payload.endDate || null,
    attendees: Array.isArray(attendees) ? attendees : [],
    expense_option: payload.expenseOption || "",
    expense_items: Array.isArray(expenseItems) ? expenseItems : [],
    total_expense: toSupabaseNumericOrNull_(payload.totalExpense),
    vehicle_option: payload.vehicleOption || "",
    license_plate: payload.licensePlate || "",
    department: payload.department || "",
    head_name: payload.headName || "",
    status: "draft",
    timestamp_source: timestamp || null,
    extra: {
      startTime: payload.startTime || "",
      endTime: payload.endTime || "",
      stayAt: payload.stayAt || "",
      dispatchVehicleType: payload.dispatchVehicleType || "",
      dispatchVehicleId: payload.dispatchVehicleId || "",
      dispatchMonth: payload.dispatchMonth || "",
      dispatchYear: payload.dispatchYear || "",
      studentCount: payload.studentCount || "",
      teacherCount: payload.teacherCount || "",
      qty1: payload.qty1 || "",
      qty2: payload.qty2 || "",
      qty3: payload.qty3 || "",
      qty4: payload.qty4 || "",
      qty5: payload.qty5 || "",
      qty6: payload.qty6 || "",
      qty7: payload.qty7 || "",
      dispatchBookUrl: payload.dispatchBookUrl || "",
      dispatchBookPdfUrl: payload.dispatchBookPdfUrl || "",
      commandTemplateType: payload.commandTemplateType || "",
    },
  };
}

function mapSupabaseDraftRow_(row) {
  const extra = row.extra || {};
  return {
    draftId: row.draft_id || "",
    username: row.username || "",
    docDate: formatSupabaseDateValue_(row.doc_date),
    requesterName: row.requester_name || "",
    requesterPosition: row.requester_position || "",
    location: row.location || "",
    province: row.province || "",
    purpose: row.purpose || "",
    startDate: formatSupabaseDateValue_(row.start_date),
    endDate: formatSupabaseDateValue_(row.end_date),
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    expenseOption: row.expense_option || "",
    expenseItems: Array.isArray(row.expense_items) ? row.expense_items : [],
    totalExpense: row.total_expense || 0,
    vehicleOption: row.vehicle_option || "",
    licensePlate: row.license_plate || "",
    department: row.department || "",
    headName: row.head_name || "",
    timestamp: row.timestamp_source || "",
    status: row.status || "draft",
    startTime: extra.startTime || "",
    endTime: extra.endTime || "",
    stayAt: extra.stayAt || "",
    dispatchVehicleType: extra.dispatchVehicleType || "",
    dispatchVehicleId: extra.dispatchVehicleId || "",
    dispatchMonth: extra.dispatchMonth || "",
    dispatchYear: extra.dispatchYear || "",
    studentCount: extra.studentCount || "",
    teacherCount: extra.teacherCount || "",
    qty1: extra.qty1 || "",
    qty2: extra.qty2 || "",
    qty3: extra.qty3 || "",
    qty4: extra.qty4 || "",
    qty5: extra.qty5 || "",
    qty6: extra.qty6 || "",
    qty7: extra.qty7 || "",
    dispatchBookUrl: extra.dispatchBookUrl || "",
    dispatchBookPdfUrl: extra.dispatchBookPdfUrl || "",
    commandTemplateType: extra.commandTemplateType || "",
  };
}

function saveDraftRequestToSupabase_(draftId, payload, timestamp) {
  supabaseUpsert_(
    "draft_requests",
    buildSupabaseDraftRecordFromPayload_(draftId, payload, timestamp),
    "draft_id",
  );
}

function getDraftRequestFromSupabase_(draftId) {
  const rows = supabaseSelectAll_(
    "draft_requests",
    "select=*&draft_id=eq." + encodeURIComponent(String(draftId || "").trim()),
    10,
  );
  if (!rows.length) return null;
  return mapSupabaseDraftRow_(rows[0]);
}

function getAllDraftRequestsFromSupabase() {
  const rows = supabaseSelectAll_(
    "draft_requests",
    "select=*&order=timestamp_source.desc",
    1000,
  );
  return rows.map(mapSupabaseDraftRow_);
}

function deleteDraftByIdFromSupabase_(draftId) {
  supabaseDeleteWhere_(
    "draft_requests",
    "draft_id=eq." + encodeURIComponent(String(draftId || "").trim()),
  );
}

function testSupabaseConnection() {
  const cfg = getSupabaseConfig_();
  const projectRefMatch = cfg.url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
  const projectRef = projectRefMatch ? projectRefMatch[1] : "";
  const response = supabaseFetch_("/rest/v1/", {
    method: "get",
    headers: {
      Accept: "application/openapi+json",
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      "เชื่อมต่อ Supabase ไม่สำเร็จ (" +
        response.statusCode +
        "): " +
        (response.bodyText || "Unknown error"),
    );
  }

  return {
    ok: true,
    projectRef: projectRef,
    supabaseUrl: cfg.url,
    statusCode: response.statusCode,
    message: "เชื่อมต่อ Supabase สำเร็จ",
  };
}

function testDraftRequestFlow(requestId) {
  const safeRequestId = String(requestId || "").trim();
  if (!safeRequestId) {
    throw new Error("กรุณาระบุ requestId");
  }

  const draft = getDraftRequest({ requestId: safeRequestId });
  if (!draft) {
    return {
      ok: false,
      requestId: safeRequestId,
      found: false,
      message: "ไม่พบ draft หรือ request ที่ระบุ",
    };
  }

  const attendees = Array.isArray(draft.attendees) ? draft.attendees : [];
  const expenseItems = Array.isArray(draft.expenseItems) ? draft.expenseItems : [];

  return {
    ok: true,
    requestId: safeRequestId,
    found: true,
    draftId: draft.draftId || "",
    username: draft.username || "",
    requesterName: draft.requesterName || "",
    requesterPosition: draft.requesterPosition || "",
    location: draft.location || "",
    province: draft.province || "",
    purpose: draft.purpose || "",
    startDate: draft.startDate || "",
    endDate: draft.endDate || "",
    attendeeCount: attendees.length,
    firstAttendee: attendees.length ? attendees[0] : null,
    expenseItemCount: expenseItems.length,
    totalExpense: draft.totalExpense || 0,
    vehicleOption: draft.vehicleOption || "",
    licensePlate: draft.licensePlate || "",
    dispatchBookUrl: draft.dispatchBookUrl || "",
    commandTemplateType: draft.commandTemplateType || "",
    message: "ทดสอบ getDraftRequest สำเร็จ",
  };
}

function supabaseSelectAll_(tableName, queryString, pageSize) {
  const size = pageSize || 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const response = supabaseFetch_(
      `/rest/v1/${tableName}?${queryString}`,
      {
        method: "get",
        headers: {
          Range: `${from}-${from + size - 1}`,
          Prefer: "count=exact",
        },
      },
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw new Error(
        `อ่านข้อมูล ${tableName} จาก Supabase ไม่สำเร็จ (${response.statusCode}): ` +
          (response.bodyText || "Unknown error"),
      );
    }

    const rows = Array.isArray(response.jsonBody) ? response.jsonBody : [];
    allRows = allRows.concat(rows);
    if (rows.length < size) break;
    from += size;
  }

  return allRows;
}

function formatSupabaseDateValue_(value) {
  if (!value) return "";
  try {
    return Utilities.formatDate(new Date(value), "Asia/Bangkok", "yyyy-MM-dd");
  } catch (e) {
    return String(value || "");
  }
}

function mapSupabaseRequestRow_(row, attendeeCount, memoRow) {
  return {
    id: row.request_id || "",
    username: row.created_by || "",
    refNumber: row.ref_number || "",
    docDate: formatSupabaseDateValue_(row.doc_date),
    requesterName: row.requester_name || "",
    requesterPosition: row.requester_position || "",
    location: row.location || "",
    purpose: row.purpose || "",
    startDate: formatSupabaseDateValue_(row.start_date),
    endDate: formatSupabaseDateValue_(row.end_date),
    duration: row.duration || "",
    expenseOption: row.expense_option || "",
    expenseItems:
      row.expense_items === null || row.expense_items === undefined
        ? ""
        : JSON.stringify(row.expense_items),
    totalExpense: row.total_expense || 0,
    vehicleOption: row.vehicle_option || "",
    licensePlate: row.license_plate || "",
    department: row.department || "",
    headName: row.head_name || "",
    pdfUrl: row.pdf_url || "",
    timestamp: row.created_at_source || "",
    status:
      row.status ||
      (memoRow && memoRow.status ? memoRow.status : "") ||
      "กำลังดำเนินการ",
    commandPdfUrl: row.command_pdf_url || "",
    commandStatus: row.command_status || "",
    commandPdfUrlSolo: row.command_pdf_url_solo || "",
    commandPdfUrlGroupSmall: row.command_pdf_url_group_small || "",
    commandPdfUrlGroupLarge: row.command_pdf_url_group_large || "",
    dispatchBookPdfUrl: row.dispatch_book_pdf_url || "",
    commandDocUrlSolo: row.command_doc_url_solo || "",
    commandDocUrlGroupLarge: row.command_doc_url_group_large || "",
    docUrl: row.doc_url || "",
    commandDocUrlGroupSmall: row.command_doc_url_group_small || "",
    province: row.province || "",
    stayAt: row.stay_at || "",
    dispatchVehicleType: row.dispatch_vehicle_type || "",
    dispatchVehicleId: row.dispatch_vehicle_id || "",
    completedMemoUrl:
      row.completed_memo_url ||
      (memoRow ? memoRow.completedMemoUrl || "" : ""),
    completedCommandUrl:
      row.completed_command_url ||
      (memoRow ? memoRow.completedCommandUrl || "" : ""),
    memoStatus: row.memo_status || "",
    dispatchBookUrl:
      row.dispatch_book_url || (memoRow ? memoRow.dispatchBookUrl || "" : ""),
    adminMemoUrl: row.admin_memo_url || (memoRow ? memoRow.adminMemoUrl || "" : ""),
    docStatus: row.doc_status || "",
    wasRejected: row.was_rejected === true,
    rejectionReason: row.rejection_reason || "",
    commandTemplateType: row.command_template_type || "",
    attendeeCount: attendeeCount,
    totalPeople: attendeeCount + 1,
    activeApprovalDocType: row.extra?.activeApprovalDocType || "",
    currentPdfUrl: row.extra?.currentPdfUrl || "",
    adminReviewedAt: row.extra?.adminReviewedAt || "",
    adminReviewedBy: row.extra?.adminReviewedBy || "",
    adminRoutedAt: row.extra?.adminRoutedAt || "",
    adminRoutedBy: row.extra?.adminRoutedBy || "",
    terminatedAt: row.extra?.terminatedAt || "",
    terminatedBy: row.extra?.terminatedBy || "",
    terminationReason: row.extra?.terminationReason || "",
    rejectedAt: row.extra?.rejectedAt || "",
    rejectedBy: row.extra?.rejectedBy || "",
    sarabanDocNum: row.extra?.sarabanDocNum || "",
    sarabanDocDate: row.extra?.sarabanDocDate || "",
    sarabanStampedAt: row.extra?.sarabanStampedAt || "",
    sarabanStampedBy: row.extra?.sarabanStampedBy || "",
    travelSchedule: row.extra?.travelSchedule || null,
    travelScheduleStatus: row.extra?.travelScheduleStatus || "",
    travelScheduleUpdatedBy: row.extra?.travelScheduleUpdatedBy || "",
    travelScheduleUpdatedAt: row.extra?.travelScheduleUpdatedAt || "",
    travelSchedulePdfUrl: row.extra?.travelSchedulePdfUrl || "",
    travelScheduleGeneratedAt: row.extra?.travelScheduleGeneratedAt || "",
    finalizedAt: row.extra?.finalizedAt || "",
    dispatchMeta: row.extra?.dispatchMeta || null,
  };
}

function mapSupabaseMemoRow_(row, requestRow) {
  return {
    id: row.memo_id || "",
    submittedBy: row.submitted_by || "",
    refNumber: row.ref_number || "",
    requestId: row.ref_number || "",
    status: row.status || "",
    timestamp: row.created_at_source || "",
    fileId: row.file_id || "",
    fileURL: row.file_url || "",
    completedMemoUrl: row.completed_memo_url || "",
    completedCommandUrl: row.completed_command_url || "",
    dispatchBookUrl:
      row.dispatch_book_url ||
      (requestRow ? requestRow.dispatchBookPdfUrl || requestRow.dispatchBookUrl || "" : ""),
    adminMemoUrl: row.admin_memo_url || "",
    memoPdfUrl: row.memo_pdf_url || "",
    currentPdfUrl: row.current_pdf_url || "",
    dispatchStatus: row.dispatch_status || "",
    completedDispatchBookUrl: row.completed_dispatch_book_url || "",
    docStatus: row.doc_status || "",
    rejectedAt: row.rejected_at || "",
    finalizedAt: row.finalized_at || "",
    lastUpdatedSource: row.last_updated_source || "",
    requesterName: requestRow ? requestRow.requesterName || requestRow.username || "" : "",
    requesterPosition: requestRow ? requestRow.requesterPosition || "" : "",
    purpose: requestRow ? requestRow.purpose || "" : "",
    location: requestRow ? requestRow.location || "" : "",
    province: requestRow ? requestRow.province || "" : "",
    startDate: requestRow ? requestRow.startDate || "" : "",
    endDate: requestRow ? requestRow.endDate || "" : "",
    docDate: requestRow ? requestRow.docDate || "" : "",
    department: requestRow ? requestRow.department || "" : "",
    headName: requestRow ? requestRow.headName || "" : "",
    vehicleOption: requestRow ? requestRow.vehicleOption || "" : "",
    licensePlate: requestRow ? requestRow.licensePlate || "" : "",
    attendeeCount: requestRow ? requestRow.attendeeCount || 0 : 0,
    totalPeople: requestRow ? requestRow.totalPeople || 0 : 0,
  };
}

function buildSupabaseRequestObjects_(requestRows) {
  const rows = Array.isArray(requestRows) ? requestRows : [];
  if (!rows.length) return [];

  const requestIds = rows
    .map((row) => String(row.request_id || "").trim())
    .filter(Boolean);

  const attendeeRows = supabaseSelectByValues_(
    "attendees",
    "request_id",
    requestIds,
    "select=request_id&order=id.asc",
    1000,
  );
  const memoRows = supabaseSelectByValues_(
    "memos",
    "ref_number",
    requestIds,
    "select=ref_number,status,completed_memo_url,completed_command_url,dispatch_book_url,admin_memo_url&order=memo_id.asc",
    1000,
  );

  const attendeeCountMap = {};
  attendeeRows.forEach((row) => {
    const requestId = String(row.request_id || "").trim();
    if (!requestId) return;
    attendeeCountMap[requestId] = (attendeeCountMap[requestId] || 0) + 1;
  });

  const memoMap = {};
  memoRows.forEach((row) => {
    const key = String(row.ref_number || "").trim();
    if (!key) return;
    memoMap[key] = {
      status: row.status || "",
      completedMemoUrl: row.completed_memo_url || "",
      completedCommandUrl: row.completed_command_url || "",
      dispatchBookUrl: row.dispatch_book_url || "",
      adminMemoUrl: row.admin_memo_url || "",
    };
  });

  return rows.map((row) =>
    mapSupabaseRequestRow_(
      row,
      attendeeCountMap[String(row.request_id || "").trim()] || 0,
      memoMap[String(row.request_id || "").trim()] || null,
    ),
  );
}

function getAllRequestsFromSupabase(options) {
  const queryFilter = buildSupabaseDateFilterQuery_("doc_date", options);
  return buildSupabaseRequestObjects_(
    supabaseSelectAll_(
      "requests",
      "select=*" + queryFilter + "&order=doc_date.desc",
      1000,
    ),
  );
}

function getRequestByIdFromSupabase_(requestId) {
  const safeRequestId = String(requestId || "").trim();
  if (!safeRequestId) return null;

  const requestRow = supabaseSelectSingle_(
    "requests",
    "select=*&request_id=eq." + encodeURIComponent(safeRequestId),
  );
  if (!requestRow) return null;
  const rows = buildSupabaseRequestObjects_([requestRow]);
  return rows.length ? rows[0] : null;
}

function getApprovalRequestsFromSupabase_(options) {
  const docStatus = String((options && options.docStatus) || "").trim();
  if (!docStatus) return [];

  const safeDocStatus = encodeURIComponent(docStatus);
  return buildSupabaseRequestObjects_(
    supabaseSelectAll_(
      "requests",
      "select=*&doc_status=eq." + safeDocStatus + "&order=updated_at.desc,doc_date.desc",
      500,
    ),
  );
}

function getApprovalStatusOrder_() {
  return [
    "waiting_head_thai",
    "waiting_head_foreign",
    "waiting_head_science",
    "waiting_head_art",
    "waiting_head_social",
    "waiting_head_health",
    "waiting_head_career",
    "waiting_head_math",
    "waiting_head_guidance",
    "waiting_head_general",
    "waiting_head_personnel",
    "waiting_head_budget",
    "waiting_head_acad",
    "waiting_deputy_personnel",
    "waiting_deputy_acad",
    "waiting_deputy_general",
    "waiting_deputy_budget",
    "waiting_admin_review",
    "waiting_saraban",
    "waiting_director",
    "waiting_admin_final",
  ];
}

function getApprovalManagementDocsFromSupabase_() {
  const requestRows = supabaseSelectByValues_(
    "requests",
    "doc_status",
    getApprovalStatusOrder_(),
    "select=*&order=updated_at.desc,doc_date.desc",
    500,
  );
  return buildSupabaseRequestObjects_(requestRows);
}

function getAllMemosFromSupabase(options) {
  const requests = getAllRequestsFromSupabase(options);
  const requestIds = requests.map((req) => String(req.id || "").trim()).filter(Boolean);
  const memoRows = supabaseSelectByValues_(
    "memos",
    "ref_number",
    requestIds,
    "select=*&order=created_at_source.desc",
    1000,
  );
  const requestMap = requests.reduce((map, req) => {
    map[req.id] = req;
    return map;
  }, {});

  return memoRows.map((row) =>
    mapSupabaseMemoRow_(row, requestMap[String(row.ref_number || "").trim()] || null),
  );
}

function getUserRequestsFromSupabase_(username, options) {
  const safeUsername = String(username || "").trim();
  if (!safeUsername) return [];
  const queryFilter = buildSupabaseDateFilterQuery_("doc_date", options);
  const requestRows = supabaseSelectAll_(
    "requests",
    "select=*&created_by=eq." +
      encodeURIComponent(safeUsername) +
      queryFilter +
      "&order=doc_date.desc",
    1000,
  );
  return buildSupabaseRequestObjects_(requestRows);
}

function getSentMemosFromSupabase_(username, options) {
  const safeUsername = String(username || "").trim();
  if (!safeUsername) return [];
  const memoRows = supabaseSelectAll_(
    "memos",
    "select=*&submitted_by=eq." +
      encodeURIComponent(safeUsername) +
      "&order=created_at_source.desc",
    1000,
  );
  const requestIds = memoRows
    .map((row) => String(row.ref_number || "").trim())
    .filter(Boolean);
  const requestRows = supabaseSelectByValues_(
    "requests",
    "request_id",
    requestIds,
    "select=*",
    1000,
  );
  const requestMap = buildSupabaseRequestObjects_(requestRows).reduce((map, req) => {
    map[req.id] = req;
    return map;
  }, {});
  return memoRows.map((row) =>
    mapSupabaseMemoRow_(row, requestMap[String(row.ref_number || "").trim()] || null),
  );
}

// ==================================================================
// === MAIN HANDLERS ===
// ==================================================================
function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu("Admin Menu")
    .addItem("Setup/Reset Sheets", "setupSpreadsheets")
    .addToUi();
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    const params = e.parameter;
    let data;

    switch (action) {
      case "getUserRequests":
        data = getUserRequests(params.username);
        break;
      case "getAllUsers":
        data = getAllUsers();
        break;
      case "getSentMemos":
        data = getSentMemos(params.username);
        break;
      case "getAllRequests":
        data = getAllRequests(params);
        break;
      case "getApprovalRequests":
        data = getApprovalRequests(params);
        break;
      case "getApprovalManagementDocs":
        data = getApprovalManagementDocs();
        break;
      case "getAllRequestsFromSupabase":
        data = getAllRequestsFromSupabase(params);
        break;
      case "getMaxRequestSeq":
        data = getMaxRequestSeq(
          params.year ? parseInt(params.year) : new Date().getFullYear() + 543,
        );
        break;
      case "getAllMemos":
        data = getAllMemos(params);
        break;
      case "getAllMemosFromSupabase":
        data = getAllMemosFromSupabase(params);
        break;
      case "getAttendeesForRequest":
        data = getAttendeesForRequest(params.requestId);
        break;
      case "getDraftRequest":
        data = getDraftRequest(params);
        break;
      case "getRequestById":
        data = getRequestById(params.requestId);
        break;
      case "getAllDraftRequests":
        data = getAllDraftRequests();
        break;
      case "getStatsSummary":
        data = getStatsSummary(params);
        break;
      case "getAnnouncementSetting":
        data = getAnnouncementSetting();
        break;
      case "getWorkflowSettings":
        data = getWorkflowSettings();
        break;
      case "getSignerPositions":
        data = getSignerPositionsSetting();
        break;
      case "getApprovalLinkToken":
        data = getApprovalLinkToken(params.token);
        break;

      // ★★★ เพิ่มส่วนนี้ (สำหรับดึงข้อมูลย้อนหลัง) ★★★
      case "getRequestsByYear":
        // รับค่าปี (พ.ศ.) และ Username
        data = getRequestsByYear(params.year, params.username);
        break;

      // ★ คลังข้อมูล: ดึงข้อมูลทั้งหมดตามปี (สำหรับ archive page — ไม่ต้อง login)
      case "getArchiveRequests":
        data = getArchiveRequests(params.year);
        break;
      case "getPublicWeeklySnapshot":
        data = getPublicWeeklySnapshot();
        break;
      case "testSupabaseConnection":
        data = testSupabaseConnection();
        break;
      case "testDraftRequestFlow":
        data = testDraftRequestFlow(params.requestId);
        break;

      // ★★★ เพิ่มส่วนนี้ (สำหรับดึงไฟล์ PDF จาก Google Drive เป็น Base64) ★★★
      case "getPdfBase64": {
        // ✅ แก้ไข GAS-BUG-006: เพิ่ม block braces เพื่อรองรับ const ภายใน switch-case
        if (!params.fileId) throw new Error("Missing fileId parameter");
        const file = DriveApp.getFileById(params.fileId);
        // แปลงไฟล์เป็น Base64 แล้วส่งกลับไปในตัวแปร data
        data = Utilities.base64Encode(file.getBlob().getBytes());
        break;
      }

      default:
        throw new Error("Invalid GET action specified.");
    }

    return createJsonResponse({
      status: "success",
      data: data,
    });
  } catch (error) {
    Logger.log(`doGet Error: ${error.message}\n${error.stack}`);
    return createJsonResponse({
      status: "error",
      message: `Server error: ${error.message}`,
    });
  }
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents)
      throw new Error("No data received in POST request.");

    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const payload = request.payload;

    if (!action) throw new Error("Invalid 'action' parameter.");

    let result;
    switch (action) {
      // --- User Management ---
      case "verifyCredentials":
        result = verifyUserCredentials(payload);
        break;
      case "registerUser":
        result = registerUser(payload);
        break;
      case "updateUserProfile":
        result = updateUserProfile(payload);
        break;
      case "updatePassword":
        result = updatePassword(payload);
        break;
      case "addUser":
        result = adminAddUser(payload);
        break;
      case "deleteUser":
        result = deleteUser(payload);
        break;
      case "importUsers":
        result = importUsers(payload);
        break;
      case "forgotPassword":
        result = handleForgotPassword(payload);
        break;
      case "adminUpdateUser":
        result = adminUpdateUser(payload);
        break;
      // --- Request Management ---
      case "createRequest":
        // สร้างใหม่ หรือ บันทึกพร้อมสร้าง PDF
        result = saveRequestAndGeneratePdf(payload);
        break;

      case "updateRequest":
        // อัปเดตข้อมูลลง Sheet (Lightweight) สำหรับ Sync จากหน้าเว็บ
        result = updateRequest(payload);
        break;

      case "saveRequestAndGeneratePdf":
        // บังคับสร้าง PDF ใหม่
        result = saveRequestAndGeneratePdf(payload);
        break;

      case "deleteRequest":
        result = deleteRequest(payload);
        break;
      case "softDeleteRequest":
        result = softDeleteRequest(payload);
        break;
      case "restoreRequest":
        result = restoreRequest(payload);
        break;
      case "getTrashItems":
        result = getTrashItems(payload);
        break;
      case "updateRequestStatusCommand":
        result = updateRequestStatusCommand(payload);
        break;

      // --- Draft Management ---
      case "saveDraftRequest":
        result = saveDraftRequest(payload);
        break;
      case "generateDocumentFromDraft":
        result = generateDocumentFromDraft(payload);
        break;

      // --- Memo Management ---
      case "deleteMemo":
        result = deleteMemo(payload);
        break;
      case "uploadMemo":
        result = uploadMemo(payload);
        break;
      case "updateMemoStatus":
        result = updateMemoStatus(payload);
        break;

      // --- Admin/Generation Actions ---
      case "approveCommand":
        result = approveCommand(payload);
        break;
      case "generateDispatchBook":
        result = generateDispatchBook(payload);
        break;

      // --- Hybrid / File Handling ---
      case "uploadGeneratedFile":
        result = uploadGeneratedFile(payload);
        break;
      case "generateCommand":
        result = generateCommand(payload);
        break;
      case "generateDispatch":
        result = generateDispatch(payload);
        break;
      case "createApprovalLinkToken":
        result = createApprovalLinkToken(payload);
        break;
      case "markApprovalLinkTokenUsed":
        result = markApprovalLinkTokenUsed(payload);
        break;
      case "saveAnnouncementSetting":
        result = saveAnnouncementSetting(payload);
        break;
      case "saveWorkflowSettings":
        result = saveWorkflowSettingsToSupabase(payload);
        break;
      case "saveSignerPositions":
        result = saveSignerPositionsSetting(payload);
        break;

      // --- System ---
      case "doSystemBackup":
        result = doSystemBackup();
        break;
      case "syncSheetsToSupabase":
        result = syncSheetsToSupabase(payload);
        break;
      case "sendCompletionEmail":
        sendCompletionEmail(
          payload.requestId,
          payload.username,
          payload.status,
        );
        result = {
          status: "success",
          message: "ส่งอีเมลแจ้งเตือนเรียบร้อยแล้ว",
        };
        break;
      // --- Primary Database → Sheets Batch Sync ---
      case "batchSyncFromFirestore":
        result = batchSyncFromFirestore(payload);
        break;
      case "batchSyncFromSupabase":
        result = batchSyncFromSupabase(payload);
        break;

      // --- Yearly Backup Email ---
      case "sendYearlyBackupEmail":
        result = sendYearlyBackupEmail(payload);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
    return createJsonResponse(result);
  } catch (error) {
    Logger.log(`doPost Error: ${error.message}\n${error.stack}`);
    return createJsonResponse({
      status: "error",
      message: `Server error: ${error.message}`,
    });
  }
}

function createJsonResponse(responseObject) {
  return ContentService.createTextOutput(
    JSON.stringify(responseObject),
  ).setMimeType(ContentService.MimeType.JSON);
}

const APPROVAL_LINK_PROPERTY_PREFIX = "approval_link:";

function _getApprovalLinkPropertyKey_(token) {
  return `${APPROVAL_LINK_PROPERTY_PREFIX}${String(token || "").trim()}`;
}

function _safeParseApprovalLinkRecord_(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(rawValue);
  } catch (e) {
    return null;
  }
}

function getAnnouncementSetting() {
  return (
    getAppSettingValue_("announcement") || {
      isActive: false,
      title: "",
      message: "",
      imageUrl: "",
    }
  );
}

function saveAnnouncementSetting(payload) {
  const announcement = {
    isActive: toSupabaseBoolean_(payload?.isActive) === true,
    title: String(payload?.title || "").trim(),
    message: String(payload?.message || "").trim(),
    imageUrl: String(payload?.imageUrl || "").trim(),
    updatedBy: String(payload?.updatedBy || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  saveAppSettingValue_("announcement", announcement, announcement.updatedBy);
  return {
    status: "success",
    data: announcement,
    message: "บันทึกประกาศเรียบร้อยแล้ว",
  };
}

function getWorkflowSettings() {
  return (
    getSystemConfigValue_("workflowSettings") || {
      forceMemoUploadForAll: false,
      requiredMemoUploads: {
        refDoc: true,
        exchange: false,
      },
    }
  );
}

function saveWorkflowSettingsToSupabase(payload) {
  const workflowSettings = {
    forceMemoUploadForAll:
      toSupabaseBoolean_(payload?.forceMemoUploadForAll) === true,
    requiredMemoUploads: {
      refDoc: payload?.requiredMemoUploads?.refDoc !== false,
      exchange:
        toSupabaseBoolean_(payload?.requiredMemoUploads?.exchange) === true,
    },
    updatedBy: String(payload?.updatedBy || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  saveSystemConfigValue_(
    "workflowSettings",
    workflowSettings,
    workflowSettings.updatedBy,
  );
  return {
    status: "success",
    data: workflowSettings,
    message: "บันทึกการตั้งค่า workflow เรียบร้อยแล้ว",
  };
}

function getSignerPositionsSetting() {
  return getSystemConfigValue_("signerPositions") || { names: {}, usernames: {} };
}

function saveSignerPositionsSetting(payload) {
  const names = payload?.names || {};
  const usernames = payload?.usernames || {};
  const signerPositions = {
    names: names,
    usernames: usernames,
    updatedBy: String(payload?.updatedBy || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  saveSystemConfigValue_(
    "signerPositions",
    signerPositions,
    signerPositions.updatedBy,
  );
  return {
    status: "success",
    data: signerPositions,
    message: "บันทึกข้อมูลหัวหน้าส่วนเรียบร้อยแล้ว",
  };
}

function createApprovalLinkToken(payload) {
  const token = String(payload?.token || Utilities.getUuid().replace(/-/g, "")).trim();
  const requestId = String(payload?.requestId || "").trim();
  const docStatus = String(payload?.docStatus || "").trim();
  if (!token || !requestId || !docStatus) {
    return { status: "error", message: "ข้อมูลลิงก์ลงนามไม่ครบถ้วน" };
  }

  const safeId = String(payload?.safeId || requestId).replace(/[\/\\:\.]/g, "-");
  const now = Date.now();
  const record = {
    token: token,
    requestId: requestId,
    safeId: safeId,
    docStatus: docStatus,
    docTitle: String(payload?.docTitle || "").trim(),
    requester: String(payload?.requester || "").trim(),
    createdAtMs: now,
    expiresAtMs: now + 7 * 24 * 60 * 60 * 1000,
    used: false,
    storage: "gas",
  };

  let savedToSupabase = false;
  try {
    supabaseUpsert_(
      "approval_links",
      {
        token: token,
        request_id: requestId,
        safe_id: safeId,
        role: docStatus,
        used: false,
        created_by: String(payload?.createdBy || "").trim() || null,
        created_at: new Date(now).toISOString(),
        used_at: null,
        expires_at: new Date(record.expiresAtMs).toISOString(),
        extra: {
          docStatus: docStatus,
          docTitle: record.docTitle,
          requester: record.requester,
          storage: "supabase",
        },
      },
      "token",
    );
    savedToSupabase = true;
  } catch (error) {
    Logger.log("createApprovalLinkToken fallback to ScriptProperties: " + error.message);
  }

  record.storage = savedToSupabase ? "supabase+gas" : "gas";
  PropertiesService.getScriptProperties().setProperty(
    _getApprovalLinkPropertyKey_(token),
    JSON.stringify(record),
  );

  return {
    status: "success",
    data: record,
    message: "สร้าง approval link token สำเร็จ",
  };
}

function getApprovalLinkToken(token) {
  const tokenValue = String(token || "").trim();
  if (!tokenValue) {
    return { status: "error", message: "ไม่พบ token" };
  }

  try {
    const row = supabaseSelectSingle_(
      "approval_links",
      "select=*&token=eq." + encodeURIComponent(tokenValue),
    );
    if (row) {
      const extra = row.extra || {};
      return {
        token: row.token,
        requestId: row.request_id || "",
        safeId: row.safe_id || "",
        docStatus: extra.docStatus || row.role || "",
        docTitle: extra.docTitle || "",
        requester: extra.requester || "",
        createdAtMs: row.created_at ? new Date(row.created_at).getTime() : null,
        expiresAtMs: row.expires_at ? new Date(row.expires_at).getTime() : null,
        used: row.used === true,
        usedAtMs: row.used_at ? new Date(row.used_at).getTime() : null,
        storage: extra.storage || "supabase",
      };
    }
  } catch (error) {
    Logger.log("getApprovalLinkToken fallback to ScriptProperties: " + error.message);
  }

  const fallbackRecord = _safeParseApprovalLinkRecord_(
    PropertiesService.getScriptProperties().getProperty(
      _getApprovalLinkPropertyKey_(tokenValue),
    ),
  );
  if (!fallbackRecord) {
    return { status: "error", message: "ไม่พบ approval link token" };
  }
  return fallbackRecord;
}

function markApprovalLinkTokenUsed(payload) {
  const tokenValue = String(payload?.token || "").trim();
  if (!tokenValue) {
    return { status: "error", message: "ไม่พบ token" };
  }

  const key = _getApprovalLinkPropertyKey_(tokenValue);
  const fallbackRecord = _safeParseApprovalLinkRecord_(
    PropertiesService.getScriptProperties().getProperty(key),
  );
  if (fallbackRecord) {
    fallbackRecord.used = true;
    fallbackRecord.usedAtMs = Date.now();
    PropertiesService.getScriptProperties().setProperty(
      key,
      JSON.stringify(fallbackRecord),
    );
  }

  try {
    supabaseUpsert_(
      "approval_links",
      {
        token: tokenValue,
        used: true,
        used_at: new Date().toISOString(),
      },
      "token",
    );
    const record = getApprovalLinkToken(tokenValue);
    return {
      status: "success",
      data: record,
      message: "อัปเดตสถานะ approval link token เรียบร้อยแล้ว",
    };
  } catch (error) {
    Logger.log("markApprovalLinkTokenUsed fallback to ScriptProperties: " + error.message);
  }

  const record = _safeParseApprovalLinkRecord_(
    PropertiesService.getScriptProperties().getProperty(key),
  );
  if (!record) {
    return { status: "error", message: "ไม่พบ approval link token" };
  }

  record.used = true;
  record.usedAtMs = Date.now();
  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(record));

  return {
    status: "success",
    data: record,
    message: "อัปเดตสถานะ approval link token เรียบร้อยแล้ว",
  };
}

// ==================================================================
// === USER MANAGEMENT FUNCTIONS ====================================
// ==================================================================

function verifyUserCredentials(payload) {
  try {
    const { username, password } = payload;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Users");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const usernameCol = findColumnIndex(headers, "Username");
    const loginNameCol = findColumnIndex(headers, "LoginName");
    const passwordCol = findColumnIndex(headers, "Password");
    const fullNameCol = findColumnIndex(headers, "FullName");
    const roleCol = findColumnIndex(headers, "Role");
    // เพิ่มการ Map คอลัมน์อื่นๆ ให้ครบ
    const positionCol = findColumnIndex(headers, "Position");
    const departmentCol = findColumnIndex(headers, "Department");

    const userInput = String(username).trim(); // ค่าที่ user พิมพ์มา

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const rowInternalId = String(row[usernameCol]).trim(); // ID หลัก
      const rowPassword = String(row[passwordCol]).trim();

      // ดึง LoginName (ถ้ามี)
      const rowLoginName =
        loginNameCol > -1 && String(row[loginNameCol]).trim() !== ""
          ? String(row[loginNameCol]).trim()
          : "";

      // ★★★ แก้ไข Logic: เช็คว่าตรงกับ "ID หลัก" หรือ "LoginName" อย่างใดอย่างหนึ่ง ★★★
      // และรหัสผ่านต้องถูกต้อง
      if (
        (userInput === rowInternalId ||
          (rowLoginName !== "" && userInput === rowLoginName)) &&
        rowPassword === password
      ) {
        return {
          status: "success",
          user: {
            username: rowInternalId, // ส่ง ID หลักกลับไปเสมอ (สำคัญมาก)
            loginName: rowLoginName || rowInternalId, // ส่งชื่อที่ใช้ล็อกอินกลับไปแสดงผล
            fullName: row[fullNameCol] || "",
            role: row[roleCol] || "user",
            position: positionCol > -1 ? row[positionCol] : "", // เพิ่มส่งค่าตำแหน่ง
            department: departmentCol > -1 ? row[departmentCol] : "", // เพิ่มส่งค่าสังกัด
          },
        };
      }
    }
    return { status: "error", message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };
  } catch (error) {
    return { status: "error", message: "Login Error: " + error.message };
  }
}
function registerUser(payload) {
  try {
    const { username, password, fullName, email, position, department, role } =
      payload;
    const sheet =
      SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const usernameCol = findColumnIndex(headers, "Username");

    if (usernameCol > -1) {
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][usernameCol]).trim() === username.trim()) {
          return { status: "error", message: "ชื่อผู้ใช้นี้มีอยู่แล้วในระบบ" };
        }
      }
    }

    sheet.appendRow([
      username,
      password,
      fullName,
      email,
      position,
      department,
      role || "user",
      "",
      username, // Use username as default LoginName
    ]);
    return { status: "success", message: "ลงทะเบียนสำเร็จ" };
  } catch (error) {
    return {
      status: "error",
      message: "เกิดข้อผิดพลาดในการลงทะเบียน: " + error.message,
    };
  }
}

// ในไฟล์ Code.gs ค้นหาและแทนที่ฟังก์ชัน updateUserProfile ด้วยอันนี้

function updateUserProfile(payload) {
  const { username, loginName, fullName, email, position, department } =
    payload;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const usernameCol = findColumnIndex(headers, "Username");
  const loginNameCol = findColumnIndex(headers, "LoginName");

  // เตรียมข้อมูลเปรียบเทียบ (แปลงเป็น String และตัดช่องว่างให้หมด)
  const targetUsername = String(username).trim();
  const targetLoginName = String(loginName).trim();

  // 1. ตรวจสอบชื่อซ้ำ (Validation)
  if (loginNameCol > -1) {
    for (let i = 1; i < data.length; i++) {
      const rowUsername = String(data[i][usernameCol]).trim();
      const rowLoginName = String(data[i][loginNameCol]).trim();

      // ★★★ จุดที่แก้ไข: ถ้าเจอแถวของตัวเอง ให้ข้ามไปเลย ไม่ต้องเช็ค ★★★
      if (rowUsername === targetUsername) {
        continue;
      }

      // เช็คว่าชื่อ LoginName ไปซ้ำกับคนอื่นไหม
      if (rowLoginName !== "" && rowLoginName === targetLoginName) {
        return {
          status: "error",
          message: "ชื่อสำหรับล็อกอิน (LoginName) นี้มีผู้ใช้อื่นใช้งานแล้ว",
        };
      }

      // (Option เสริม) เช็คว่า LoginName ไปซ้ำกับ Username (ID) ของคนอื่นไหม
      if (rowUsername === targetLoginName) {
        return {
          status: "error",
          message: "ชื่อสำหรับล็อกอินซ้ำกับรหัสผู้ใช้งานของผู้อื่น",
        };
      }
    }
  }

  // 2. บันทึกข้อมูล (Update)
  const userRowIndex = data.findIndex(
    (row) => String(row[usernameCol]).trim() === targetUsername,
  );

  if (userRowIndex > 0) {
    // บันทึก LoginName
    if (loginNameCol > -1)
      sheet
        .getRange(userRowIndex + 1, loginNameCol + 1)
        .setValue(targetLoginName);

    // บันทึกข้อมูลอื่นๆ
    const fullNameCol = findColumnIndex(headers, "FullName");
    const emailCol = findColumnIndex(headers, "Email");
    const positionCol = findColumnIndex(headers, "Position");
    const departmentCol = findColumnIndex(headers, "Department");

    if (fullNameCol > -1)
      sheet.getRange(userRowIndex + 1, fullNameCol + 1).setValue(fullName);
    if (emailCol > -1)
      sheet.getRange(userRowIndex + 1, emailCol + 1).setValue(email);
    if (positionCol > -1)
      sheet.getRange(userRowIndex + 1, positionCol + 1).setValue(position);
    if (departmentCol > -1)
      sheet.getRange(userRowIndex + 1, departmentCol + 1).setValue(department);

    return { status: "success", message: "อัปเดตข้อมูลสำเร็จ" };
  }

  return { status: "error", message: "ไม่พบข้อมูลผู้ใช้ในระบบ" };
}

function updatePassword(payload) {
  const { username, oldPassword, newPassword } = payload;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const usernameCol = findColumnIndex(headers, "Username");
  const userRowIndex = data.findIndex((row) => row[usernameCol] === username);

  if (userRowIndex > 0) {
    const passwordColIndex = findColumnIndex(headers, "Password");
    const currentPasswordInSheet = data[userRowIndex][passwordColIndex];
    if (currentPasswordInSheet !== oldPassword) {
      return { status: "error", message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
    }
    sheet
      .getRange(userRowIndex + 1, passwordColIndex + 1)
      .setValue(newPassword);
    return { status: "success", message: "เปลี่ยนรหัสผ่านสำเร็จ" };
  }
  return { status: "error", message: "ไม่พบผู้ใช้ในระบบ" };
}

function handleForgotPassword(payload) {
  const { email } = payload;
  if (!email) return { status: "error", message: "ไม่พบอีเมล" };

  try {
    const sheet =
      SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const emailCol = findColumnIndex(headers, "Email");
    const passwordCol = findColumnIndex(headers, "Password");
    const fullNameCol = findColumnIndex(headers, "FullName");

    if (emailCol === -1 || passwordCol === -1 || fullNameCol === -1) {
      return { status: "error", message: "การตั้งค่าชีตผู้ใช้ไม่ถูกต้อง" };
    }

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const userEmail = String(row[emailCol]).trim();

      if (userEmail.toLowerCase() === email.toLowerCase()) {
        const fullName = row[fullNameCol];
        const rowNumber = i + 1;
        const tempPassword = `WNY@${Math.floor(1000 + Math.random() * 9000)}`;

        sheet.getRange(rowNumber, passwordCol + 1).setValue(tempPassword);
        const subject = "[WNY App] คำขอรีเซ็ตรหัสผ่านของคุณ";
        const body = `
          <p>สวัสดีคุณ ${fullName},</p>
          <p>รหัสผ่านชั่วคราวของคุณคือ: <strong>${tempPassword}</strong></p>
          <p>กรุณาใช้รหัสผ่านนี้เพื่อเข้าสู่ระบบ และเปลี่ยนรหัสผ่านทันที</p>
        `;
        MailApp.sendEmail({
          to: email,
          subject: subject,
          htmlBody: body,
          name: "ระบบ WNY App",
        });
        return { status: "success", message: "ส่งรหัสผ่านใหม่ไปยังอีเมลแล้ว" };
      }
    }
    return { status: "error", message: "ไม่พบอีเมลนี้ในระบบ" };
  } catch (error) {
    return { status: "error", message: "เกิดข้อผิดพลาด: " + error.message };
  }
}

function adminAddUser(payload) {
  return registerUser(payload);
}

function deleteUser(payload) {
  const { username } = payload;
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const usernameCol = findColumnIndex(headers, "Username");
  // ✅ แก้ไข GAS-BUG-008: เพิ่ม String() เพื่อป้องกัน type mismatch ในการเปรียบเทียบ
  const userRowIndex = data.findIndex(
    (row) => String(row[usernameCol]).trim() === String(username).trim(),
  );
  if (userRowIndex > 0) {
    sheet.deleteRow(userRowIndex + 1);
    return { status: "success", message: "ลบผู้ใช้สำเร็จ" };
  }
  return { status: "error", message: "ไม่พบผู้ใช้ที่ต้องการลบ" };
}

function getAllUsers() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  return sheetToObject(sheet);
}

function getUsersCount_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  if (!sheet) return 0;
  return Math.max(0, sheet.getLastRow() - 1);
}

function isCompletedRequestStatus_(status, commandStatus) {
  const safeStatus = String(status || "").trim();
  const safeCommandStatus = String(commandStatus || "").trim();
  return (
    ["เสร็จสิ้น", "เสร็จสิ้น/รับไฟล์ไปใช้งาน", "Approved", "completed"].includes(
      safeStatus,
    ) || safeCommandStatus.indexOf("เสร็จสิ้น") !== -1
  );
}

function buildMonthlyStatsFromRows_(rows) {
  const monthlyStats = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const target = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthLabel = Utilities.formatDate(target, "Asia/Bangkok", "MMM yy");
    const count = (rows || []).filter((row) => {
      const dateValue = row.start_date || row.doc_date || row.created_at_source || "";
      if (!dateValue) return false;
      const parsed = new Date(dateValue);
      if (isNaN(parsed.getTime())) return false;
      return (
        parsed.getMonth() === target.getMonth() &&
        parsed.getFullYear() === target.getFullYear()
      );
    }).length;
    monthlyStats.push({ month: monthLabel, count: count });
  }
  return monthlyStats;
}

function getStatsSummaryFromSupabase_(options) {
  const safeOptions = options || {};
  const requestRows = supabaseSelectAll_(
    "requests",
    "select=request_id,purpose,status,command_status,start_date,doc_date,created_at_source&order=doc_date.desc",
    1000,
  );
  const recentRequests = requestRows.slice(0, 5).map((row) => ({
    id: row.request_id || "",
    purpose: row.purpose || "",
    status: row.status || "กำลังดำเนินการ",
    commandStatus: row.command_status || "",
    startDate: formatSupabaseDateValue_(row.start_date),
    docDate: formatSupabaseDateValue_(row.doc_date),
    timestamp: row.created_at_source || "",
  }));

  const requestStatus = {};
  let completedRequests = 0;
  requestRows.forEach((row) => {
    const status = String(row.status || "กำลังดำเนินการ").trim();
    requestStatus[status] = (requestStatus[status] || 0) + 1;
    if (isCompletedRequestStatus_(status, row.command_status || "")) {
      completedRequests++;
    }
  });

  return {
    totalRequests: requestRows.length,
    completedRequests: completedRequests,
    totalMemos: supabaseCount_("memos", ""),
    totalUsers: getUsersCount_(),
    requestStatus: requestStatus,
    monthlyStats: buildMonthlyStatsFromRows_(requestRows),
    recentRequests: recentRequests,
    generatedAt: new Date().toISOString(),
    scope: safeOptions.scope || "summary",
  };
}

function importUsers(payload) {
  const { users } = payload;
  if (!users || !Array.isArray(users) || users.length === 0) {
    return { status: "error", message: "No user data provided." };
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const usernameCol = findColumnIndex(headers, "Username");
  const lastRow = sheet.getLastRow();
  const existingUsernames =
    lastRow > 1
      ? sheet
          .getRange(2, usernameCol + 1, lastRow - 1, 1)
          .getValues()
          .flat()
          .map(String)
      : [];

  let importedCount = 0;
  const rowsToAdd = [];

  for (const user of users) {
    const username = String(user.Username).trim();
    if (!username || existingUsernames.includes(username)) continue;

    rowsToAdd.push([
      username,
      user.Password || "password123",
      user.FullName || "",
      user.Email || "",
      user.Position || "",
      user.Department || "",
      user.Role || "user",
      user.SpecialPosition || "",
      username, // LoginName default
    ]);
    existingUsernames.push(username);
    importedCount++;
  }

  if (rowsToAdd.length > 0) {
    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        rowsToAdd.length,
        rowsToAdd[0].length,
      )
      .setValues(rowsToAdd);
  }

  return {
    status: "success",
    message: `นำเข้าผู้ใช้สำเร็จ ${importedCount} คน`,
  };
}

// ==================================================================
// === DRAFT REQUEST MANAGEMENT =====================================
// ==================================================================

function saveDraftRequest(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const draftSheet = ss.getSheetByName("DraftRequests");
  const timestamp = new Date();
  let draftId = payload.draftId;
  let savedToSupabase = false;
  let savedToSheets = false;

  if (!draftId) {
    draftId = `DRAFT-${Date.now()}`;
  } else {
    deleteDraftById(draftId);
  }

  const formatDate = (d) =>
    d ? Utilities.formatDate(new Date(d), "Asia/Bangkok", "yyyy-MM-dd") : "";

  try {
    saveDraftRequestToSupabase_(draftId, payload, timestamp);
    savedToSupabase = true;
  } catch (error) {
    Logger.log(
      "saveDraftRequest fallback to Sheets only: " +
        (error && error.message ? error.message : error),
    );
  }

  if (draftSheet) {
    ensureSheetColumns(draftSheet, [
      "DraftId",
      "Username",
      "DocDate",
      "RequesterName",
      "RequesterPosition",
      "Location",
      "Purpose",
      "StartDate",
      "EndDate",
      "Attendees",
      "ExpenseOption",
      "ExpenseItems",
      "TotalExpense",
      "VehicleOption",
      "LicensePlate",
      "Department",
      "HeadName",
      "Timestamp",
      "Status",
    ]);

    const rowData = [
      draftId,
      payload.username,
      formatDate(payload.docDate),
      payload.requesterName,
      payload.requesterPosition,
      payload.location,
      payload.purpose,
      formatDate(payload.startDate),
      formatDate(payload.endDate),
      JSON.stringify(payload.attendees || []),
      payload.expenseOption,
      JSON.stringify(payload.expenseItems || []),
      Number(payload.totalExpense) || 0,
      payload.vehicleOption,
      payload.licensePlate,
      payload.department,
      payload.headName,
      timestamp,
      "draft",
    ];
    draftSheet.appendRow(rowData);
    savedToSheets = true;
  }

  if (!savedToSupabase && !savedToSheets) {
    throw new Error("บันทึก draft ไม่สำเร็จ: ไม่พบทั้ง Supabase และชีต DraftRequests");
  }

  return {
    status: "success",
    data: { draftId: draftId },
    message: "บันทึกแบบร่างเรียบร้อยแล้ว",
  };
}

function getDraftRequest(payload) {
  const { requestId } = payload;
  try {
    const supabaseDraft = getDraftRequestFromSupabase_(requestId);
    if (supabaseDraft) return supabaseDraft;
  } catch (error) {
    Logger.log(
      "getDraftRequest fallback to Sheets draft: " +
        (error && error.message ? error.message : error),
    );
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const draftSheet = ss.getSheetByName("DraftRequests");
  if (draftSheet) {
    const draftData = sheetToObject(draftSheet);
    const draft = draftData.find(
      (d) => String(d.draftId) === String(requestId),
    );
    if (draft) {
      if (typeof draft.attendees === "string")
        try {
          draft.attendees = JSON.parse(draft.attendees);
        } catch (e) {
          draft.attendees = [];
        }
      if (typeof draft.expenseItems === "string")
        try {
          draft.expenseItems = JSON.parse(draft.expenseItems);
        } catch (e) {
          draft.expenseItems = [];
        }
      return draft;
    }
  }

  const originalRequest = getRequestById(requestId);
  if (originalRequest) {
    const attendees = getAttendeesForRequest(requestId);
    let expenseItems = [];
    if (typeof originalRequest.expenseItems === "string")
      try {
        expenseItems = JSON.parse(originalRequest.expenseItems);
      } catch (e) {}

    return {
      draftId: "",
      requestId: originalRequest.id,
      username: originalRequest.username,
      docDate: originalRequest.docDate,
      requesterName: originalRequest.requesterName,
      requesterPosition: originalRequest.requesterPosition,
      location: originalRequest.location,
      province: originalRequest.province || "",
      purpose: originalRequest.purpose,
      startDate: originalRequest.startDate,
      endDate: originalRequest.endDate,
      attendees: attendees,
      expenseOption: originalRequest.expenseOption,
      expenseItems: expenseItems,
      totalExpense: originalRequest.totalExpense,
      vehicleOption: originalRequest.vehicleOption,
      licensePlate: originalRequest.licensePlate,
      startTime: originalRequest.startTime || "",
      endTime: originalRequest.endTime || "",
      stayAt: originalRequest.stayAt || "",
      dispatchVehicleType: originalRequest.dispatchVehicleType || "",
      dispatchVehicleId: originalRequest.dispatchVehicleId || "",
      dispatchMonth: originalRequest.dispatchMonth || "",
      dispatchYear: originalRequest.dispatchYear || "",
      studentCount: originalRequest.studentCount || "",
      teacherCount: originalRequest.teacherCount || "",
      qty1: originalRequest.qty1 || "",
      qty2: originalRequest.qty2 || "",
      qty3: originalRequest.qty3 || "",
      qty4: originalRequest.qty4 || "",
      qty5: originalRequest.qty5 || "",
      qty6: originalRequest.qty6 || "",
      qty7: originalRequest.qty7 || "",
      dispatchBookUrl: originalRequest.dispatchBookUrl || "",
      dispatchBookPdfUrl: originalRequest.dispatchBookPdfUrl || "",
      commandTemplateType: originalRequest.commandTemplateType || "",
      department: originalRequest.department,
      headName: originalRequest.headName,
    };
  }
  return null;
}

function stripProvincePrefix_(provinceValue) {
  const rawValue = String(provinceValue || "").trim();
  if (!rawValue) return "";
  if (rawValue === "กรุงเทพมหานคร") return rawValue;
  return rawValue.replace(/^จังหวัด\s*/u, "").trim();
}

function normalizeProvinceLabel_(provinceValue) {
  const plainProvince = stripProvincePrefix_(provinceValue);
  if (!plainProvince) return "";
  if (plainProvince === "กรุงเทพมหานคร") return plainProvince;
  return `จังหวัด${plainProvince}`;
}

function getAllDraftRequests() {
  try {
    return getAllDraftRequestsFromSupabase();
  } catch (error) {
    Logger.log(
      "getAllDraftRequests fallback to Sheets: " +
        (error && error.message ? error.message : error),
    );
    const draftSheet =
      SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("DraftRequests");
    return draftSheet ? sheetToObject(draftSheet) : [];
  }
}

function generateDocumentFromDraft(payload) {
  const { draftId, requestId } = payload;
  const result = saveRequestAndGeneratePdf(payload);
  if (requestId) {
    deleteOldPdfFiles(requestId);
    deleteRequestById(requestId);
  }
  if (draftId) deleteDraftById(draftId);
  return result;
}

function deleteDraftById(draftId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const draftSheet = ss.getSheetByName("DraftRequests");
  if (draftSheet) {
    const data = draftSheet.getDataRange().getValues();
    const headers = data[0];
    const draftIdCol = findColumnIndex(headers, "DraftId");

    if (draftIdCol > -1) {
      const rowIndex = data.findIndex((row) => row[draftIdCol] === draftId);
      if (rowIndex > 0) draftSheet.deleteRow(rowIndex + 1);
    }
  }

  try {
    deleteDraftByIdFromSupabase_(draftId);
  } catch (error) {
    Logger.log(
      "deleteDraftById fallback to Sheets only: " +
        (error && error.message ? error.message : error),
    );
  }
}

// ==================================================================
// === REQUEST & COMMAND MANAGEMENT =================================
// ==================================================================

function getAllRequestsFromSheets_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const requestSheet = ss.getSheetByName("Requests");
  const attendeesSheet = ss.getSheetByName("Attendees");
  const memosSheet = ss.getSheetByName("Memos");

  const requests = sheetToObject(requestSheet);
  const attendees = sheetToObject(attendeesSheet);
  const attendeeCountMap = {};

  attendees.forEach((attendee) => {
    const requestId = String(attendee.requestid || attendee.requestId || "").trim();
    if (!requestId) return;
    attendeeCountMap[requestId] = (attendeeCountMap[requestId] || 0) + 1;
  });

  // สร้าง index จาก Memos sheet ตาม refNumber เพื่อ join URL ไฟล์ที่แอดมินอัพโหลด
  const memoIndex = {};
  if (memosSheet) {
    sheetToObject(memosSheet).forEach((memo) => {
      const key = String(memo.refNumber || memo.id || "").trim();
      if (key) memoIndex[key] = memo;
    });
  }

  requests.forEach((req) => {
    const reqId = String(req.id || req.requestid || "").trim();

    // Attendees count
    const attendeeCount = attendeeCountMap[reqId] || 0;
    req.attendeeCount = attendeeCount;
    req.totalPeople = attendeeCount + 1;

    // Join URL ไฟล์จาก Memos sheet — เติมเฉพาะ field ที่ยังว่างอยู่ใน Requests sheet
    // ทำให้ข้อมูลเก่าที่เก็บไว้ใน Memos ไหลมาแสดงในหน้า dashboard ผู้ใช้ด้วย
    const memo = memoIndex[reqId];
    if (memo) {
      // completedMemoUrl / adminMemoUrl — ไฟล์ที่แอดมินอัพโหลดให้ผู้ใช้นำไปใช้
      if (!req.adminMemoUrl && memo.completedMemoUrl)
        req.adminMemoUrl = memo.completedMemoUrl;
      if (!req.completedMemoUrl && memo.completedMemoUrl)
        req.completedMemoUrl = memo.completedMemoUrl;
      if (!req.completedCommandUrl && memo.completedCommandUrl)
        req.completedCommandUrl = memo.completedCommandUrl;
      if (!req.dispatchBookUrl && memo.dispatchBookUrl)
        req.dispatchBookUrl = memo.dispatchBookUrl;
      // status จาก Memos (ถ้า Requests ยังไม่มีค่าหรือยังเป็น default)
      if (!req.status || req.status === "กำลังดำเนินการ") {
        if (memo.status) req.status = memo.status;
      }
    }
  });

  return requests;
}

function filterRequestsByPeriod_(requests, options) {
  const rows = Array.isArray(requests) ? requests : [];
  const resolved = resolveSupabasePeriodOptions_(options);
  if (!resolved.range) return rows;

  const start = resolved.range.start;
  const end = resolved.range.end;
  return rows.filter((req) => {
    const dateValue = formatSupabaseDateValue_(req.docDate || req.docdate || req.startDate || "");
    if (!dateValue) return false;
    return dateValue >= start && dateValue <= end;
  });
}

function filterMemosByPeriod_(memos, requests, options) {
  const filteredRequests = filterRequestsByPeriod_(requests, options);
  const requestIds = new Set(
    filteredRequests.map((req) => String(req.id || req.requestId || "").trim()).filter(Boolean),
  );
  if (!requestIds.size) return [];
  return (Array.isArray(memos) ? memos : []).filter((memo) =>
    requestIds.has(String(memo.refNumber || memo.requestId || "").trim()),
  );
}

function getAllRequests(options) {
  try {
    return getAllRequestsFromSupabase(options);
  } catch (error) {
    Logger.log("getAllRequests fallback to Sheets: " + error.message);
    return filterRequestsByPeriod_(getAllRequestsFromSheets_(), options);
  }
}

function getApprovalRequests(options) {
  const docStatus = String((options && options.docStatus) || "").trim();
  if (!docStatus) {
    throw new Error("กรุณาระบุ docStatus ที่ต้องการ");
  }

  try {
    return getApprovalRequestsFromSupabase_(options);
  } catch (error) {
    Logger.log("getApprovalRequests fallback to Sheets: " + error.message);
    return getAllRequestsFromSheets_().filter(function (req) {
      return String(req.docStatus || "").trim() === docStatus;
    });
  }
}

function getApprovalManagementDocs() {
  try {
    return getApprovalManagementDocsFromSupabase_();
  } catch (error) {
    Logger.log(
      "getApprovalManagementDocs fallback to targeted approval requests: " +
        error.message,
    );
    const grouped = [];
    getApprovalStatusOrder_().forEach(function (docStatus) {
      const items = getApprovalRequests({ docStatus: docStatus });
      if (Array.isArray(items) && items.length) {
        grouped.push.apply(grouped, items);
      }
    });
    return grouped;
  }
}

function getUserRequests(username) {
  try {
    return getUserRequestsFromSupabase_(username, {});
  } catch (error) {
    Logger.log("getUserRequests fallback to Sheets: " + error.message);
    return getAllRequests().filter((req) => req.username === username);
  }
}

function getRequestById(requestId) {
  try {
    return getRequestByIdFromSupabase_(requestId);
  } catch (error) {
    Logger.log("getRequestById fallback to Sheets: " + error.message);
    const requestData = getAllRequests();
    return (
      requestData.find(
        (req) =>
          String(req.id || "").trim() === String(requestId || "").trim(),
      ) || null
    );
  }
}

function getPublicWeeklySnapshot() {
  const cacheKey = buildCacheKey_(["public-weekly-snapshot"]);
  const cached = readJsonCache_(cacheKey);
  if (cached) return cached;

  const requests = getAllRequests();
  const snapshot = requests.map((req) => ({
    id: req.id || "",
    requesterName: req.requesterName || req.username || "",
    purpose: req.purpose || "",
    location: req.location || "",
    startDate: req.startDate || "",
    endDate: req.endDate || "",
    attendees: req.attendees || [],
    attendeeCount: req.attendeeCount || 0,
    status: req.status || "",
    realStatus: req.status || "",
    completedCommandUrl: req.completedCommandUrl || "",
  }));

  return writeJsonCache_(cacheKey, snapshot, PUBLIC_WEEKLY_CACHE_TTL_SEC);
}

// คืนค่าเลขลำดับสูงสุดในปีนั้นจาก Requests sheet (ใช้ initialize Firestore counter)
function getMaxRequestSeq(yearBE) {
  const sheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Requests");
  if (!sheet) return { status: "success", maxSeq: 0 };
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: "success", maxSeq: 0 };
  const headers = data[0];
  const idCol = findColumnIndex(headers, "RequestId");
  if (idCol < 0) return { status: "success", maxSeq: 0 };
  let maxSeq = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idCol] || "");
    if (!id) continue;
    const parts = id.split("/");
    if (parts.length < 2) continue;
    if (parseInt(parts[1]) !== yearBE) continue;
    const seq = parseInt(parts[0].replace(/\D/g, ""));
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return { status: "success", maxSeq };
}

function getAttendeesForRequestFromSheets_(requestId) {
  const attendeesSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Attendees");
  if (!attendeesSheet) return [];
  const data = attendeesSheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  const headers = data[0];
  const idCol = findColumnIndex(headers, "RequestId");
  const nameCol = findColumnIndex(headers, "FullName");
  const posCol = findColumnIndex(headers, "Position");

  if (idCol === -1) return [];
  return data
    .filter((row) => String(row[idCol]) === String(requestId))
    .map((row) => ({
      name: row[nameCol],
      position: row[posCol],
    }));
}

function getAttendeesForRequestFromSupabase(requestId) {
  const safeRequestId = encodeURIComponent(String(requestId || "").trim());
  if (!safeRequestId) return [];

  const attendeeRows = supabaseSelectAll_(
    "attendees",
    "select=request_id,full_name,position&request_id=eq." +
      safeRequestId +
      "&order=id.asc",
    1000,
  );

  return attendeeRows.map((row) => ({
    name: row.full_name || "",
    position: row.position || "",
  }));
}

function getAttendeesForRequest(requestId) {
  try {
    return getAttendeesForRequestFromSupabase(requestId);
  } catch (error) {
    Logger.log(
      "getAttendeesForRequest fallback to Sheets: " + (error && error.message ? error.message : error),
    );
    return getAttendeesForRequestFromSheets_(requestId);
  }
}

function deleteRequest(payload) {
  const id = payload.id || payload.requestId;
  deleteRequestById(id);
  return { status: "success", message: "ลบคำขอสำเร็จ" };
}

function deleteRequestById(requestId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const requestSheet = ss.getSheetByName("Requests");
  const attendeesSheet = ss.getSheetByName("Attendees");
  // Delete from Requests
  const reqData = requestSheet.getDataRange().getValues();
  const reqIdCol = findColumnIndex(reqData[0], "RequestId");
  const reqRow = reqData.findIndex(
    (row) => String(row[reqIdCol]) === String(requestId),
  );
  if (reqRow > 0) requestSheet.deleteRow(reqRow + 1);
  // Delete from Attendees
  const attData = attendeesSheet.getDataRange().getValues();
  const attIdCol = findColumnIndex(attData[0], "RequestId");
  const rowsToDelete = [];
  for (let i = 1; i < attData.length; i++) {
    if (String(attData[i][attIdCol]) === String(requestId))
      rowsToDelete.push(i + 1);
  }
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    attendeesSheet.deleteRow(rowsToDelete[i]);
  }

  supabaseDeleteWhere_(
    "requests",
    "request_id=eq." + encodeURIComponent(String(requestId || "").trim()),
  );

  deleteOldPdfFiles(requestId);
}

// ─────────────────────────────────────────────────────────────
// SOFT DELETE & RESTORE (ถังขยะ 24 ชั่วโมง)
// ─────────────────────────────────────────────────────────────

function _getOrCreateTrashSheet(ss) {
  let trashSheet = ss.getSheetByName("Trash");
  if (!trashSheet) {
    const requestSheet = ss.getSheetByName("Requests");
    const reqHeaders = requestSheet
      .getRange(1, 1, 1, requestSheet.getLastColumn())
      .getValues()[0];
    trashSheet = ss.insertSheet("Trash");
    trashSheet
      .getRange(1, 1, 1, reqHeaders.length + 2)
      .setValues([[...reqHeaders, "DeletedAt", "DeletedBy"]]);
  }
  return trashSheet;
}

function softDeleteRequest(payload) {
  const id = payload.id || payload.requestId;
  const deletedBy = payload.username || "unknown";
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const requestSheet = ss.getSheetByName("Requests");
  const trashSheet = _getOrCreateTrashSheet(ss);

  const reqData = requestSheet.getDataRange().getValues();
  const headers = reqData[0];
  const reqIdCol = findColumnIndex(headers, "RequestId");
  const reqRow = reqData.findIndex(
    (row, i) => i > 0 && String(row[reqIdCol]) === String(id),
  );
  if (reqRow <= 0) return { status: "error", message: "ไม่พบคำขอ " + id };

  const trashHeaders = trashSheet
    .getRange(1, 1, 1, trashSheet.getLastColumn())
    .getValues()[0];
  const rowData = reqData[reqRow];
  const trashRow = trashHeaders.map((h) => {
    if (h === "DeletedAt") return new Date();
    if (h === "DeletedBy") return deletedBy;
    const idx = headers.indexOf(h);
    return idx >= 0 ? rowData[idx] : "";
  });
  trashSheet.appendRow(trashRow);
  requestSheet.deleteRow(reqRow + 1);
  supabaseDeleteWhere_(
    "requests",
    "request_id=eq." + encodeURIComponent(String(id || "").trim()),
  );
  return { status: "success", message: "ย้ายไปถังขยะแล้ว" };
}

function restoreRequest(payload) {
  const id = payload.id || payload.requestId;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const trashSheet = ss.getSheetByName("Trash");
  const requestSheet = ss.getSheetByName("Requests");

  if (!trashSheet) return { status: "error", message: "ถังขยะว่างเปล่า" };

  const trashData = trashSheet.getDataRange().getValues();
  if (trashData.length <= 1)
    return { status: "error", message: "ถังขยะว่างเปล่า" };

  const trashHeaders = trashData[0];
  const trashIdCol = findColumnIndex(trashHeaders, "RequestId");
  const trashRow = trashData.findIndex(
    (row, i) => i > 0 && String(row[trashIdCol]) === String(id),
  );
  if (trashRow <= 0) return { status: "error", message: "ไม่พบข้อมูลในถังขยะ" };

  const deletedAtCol = findColumnIndex(trashHeaders, "DeletedAt");
  if (deletedAtCol >= 0 && trashData[trashRow][deletedAtCol]) {
    const hoursSince =
      (new Date() - new Date(trashData[trashRow][deletedAtCol])) / 3600000;
    if (hoursSince > 24)
      return {
        status: "error",
        message: "หมดเวลากู้คืน (เกิน 24 ชั่วโมงแล้ว)",
      };
  }

  const reqHeaders = requestSheet
    .getRange(1, 1, 1, requestSheet.getLastColumn())
    .getValues()[0];
  const restoredRow = reqHeaders.map((h) => {
    const idx = trashHeaders.indexOf(h);
    return idx >= 0 ? trashData[trashRow][idx] : "";
  });
  requestSheet.appendRow(restoredRow);
  trashSheet.deleteRow(trashRow + 1);
  syncRequestByIdToSupabase_(id, { replaceAttendees: true });
  return { status: "success", message: "กู้คืนข้อมูลสำเร็จ" };
}

function getTrashItems(payload) {
  const username = payload ? payload.username : null; // null = admin (all items)
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const trashSheet = ss.getSheetByName("Trash");
  if (!trashSheet) return { status: "success", data: [] };

  const trashData = trashSheet.getDataRange().getValues();
  if (trashData.length <= 1) return { status: "success", data: [] };

  const headers = trashData[0];
  const idCol = findColumnIndex(headers, "RequestId");
  const nameCol = findColumnIndex(headers, "RequesterName");
  const purposeCol = findColumnIndex(headers, "Purpose");
  const deletedAtCol = findColumnIndex(headers, "DeletedAt");
  const deletedByCol = findColumnIndex(headers, "DeletedBy");
  const now = new Date();

  const items = [];
  for (let i = 1; i < trashData.length; i++) {
    const row = trashData[i];
    const reqId = String(row[idCol] || "");
    if (!reqId) continue;

    const deletedAt = deletedAtCol >= 0 ? new Date(row[deletedAtCol]) : null;
    const hoursSince = deletedAt ? (now - deletedAt) / 3600000 : 999;
    if (hoursSince > 24) continue; // เกิน 24 ชม. ไม่แสดง

    const deletedBy = deletedByCol >= 0 ? String(row[deletedByCol]) : "";
    if (username && deletedBy !== username) continue; // กรองตาม user

    items.push({
      id: reqId,
      requesterName: nameCol >= 0 ? String(row[nameCol]) : "",
      purpose: purposeCol >= 0 ? String(row[purposeCol]) : "",
      deletedAt: deletedAt ? deletedAt.toISOString() : "",
      deletedBy: deletedBy,
      hoursLeft: Math.max(0, 24 - hoursSince).toFixed(1),
    });
  }

  return { status: "success", data: items };
}

function saveRequestAndGeneratePdf(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const requestSheet = ss.getSheetByName("Requests");
  // ตรวจสอบคอลัมน์ให้ครบ
  ensureSheetColumns(requestSheet, [
    "CommandPdfUrl",
    "CommandStatus",
    "PdfUrl",
    "DocUrl",
    "CommandPdfUrlSolo",
    "CommandDocUrlSolo",
    "CommandPdfUrlGroupSmall",
    "CommandDocUrlGroupSmall",
    "CommandPdfUrlGroupLarge",
    "CommandDocUrlGroupLarge",
    "DispatchBookPdfUrl",
    "DispatchBookUrl",
    "Province",
    "StayAt",
    "DispatchVehicleType",
    "DispatchVehicleId",
    "CompletedMemoUrl",
    "CompletedCommandUrl",
    "AdminMemoUrl",
    "DocStatus",
    "WasRejected",
    "RejectionReason",
  ]);
  const attendeesSheet = ss.getSheetByName("Attendees");

  const requestIdentifier = payload.id || payload.requestId || null;
  const isUpdate = !!requestIdentifier;
  let requestId = requestIdentifier,
    docNumber;

  // --- ส่วนจัดการ ID ---
  if (isUpdate) {
    requestId = requestIdentifier;
    docNumber = requestId.split("/")[0].replace("บค", "") || "";

    // ★★★ แก้ไขจุดที่ 1: ลบรายชื่อเฉพาะเมื่อมีการส่งรายชื่อใหม่มาเท่านั้น (ป้องกันรายชื่อหาย) ★★★
    if (payload.attendees !== undefined) {
      const attData = attendeesSheet.getDataRange().getValues();
      const attIdCol = findColumnIndex(attData[0], "RequestId");
      const rowsToDelete = [];
      for (let i = 1; i < attData.length; i++) {
        if (String(attData[i][attIdCol]) === String(requestId))
          rowsToDelete.push(i + 1);
      }
      for (let i = rowsToDelete.length - 1; i >= 0; i--) {
        attendeesSheet.deleteRow(rowsToDelete[i]);
      }
    }
  } else {
    // (Logic สร้าง ID ใหม่ เหมือนเดิม)
    const docDate = new Date(payload.docDate);
    const buddhistYear =
      parseInt(Utilities.formatDate(docDate, "Asia/Bangkok", "yyyy")) + 543;
    const reqData = requestSheet.getDataRange().getValues();
    const reqIdCol = findColumnIndex(reqData[0], "RequestId");
    let maxNumber = 0;
    for (let i = 1; i < reqData.length; i++) {
      const parts = String(reqData[i][reqIdCol]).split("/");
      if (parts.length > 1 && parts[1] === String(buddhistYear)) {
        const num = parseInt(parts[0].replace("บค", ""), 10);
        if (num > maxNumber) maxNumber = num;
      }
    }
    docNumber = String(maxNumber + 1).padStart(3, "0");
    requestId = `บค${docNumber}/${buddhistYear}`;
  }

  // --- บันทึกรายชื่อผู้ร่วมเดินทาง (ทำงานเฉพาะเมื่อมีข้อมูลส่งมา) ---
  const formatDate = (d) =>
    Utilities.formatDate(new Date(d), "Asia/Bangkok", "yyyy-MM-dd");

  if (
    payload.attendees &&
    Array.isArray(payload.attendees) &&
    payload.attendees.length > 0
  ) {
    payload.attendees.forEach((att) => {
      attendeesSheet.appendRow([
        requestId,
        att.name,
        att.position,
        formatDate(payload.docDate),
      ]);
    });
  }

  // --- จัดการไฟล์ PDF ---
  let pdfUrl = "";
  let docUrl = "";

  if (
    payload.preGeneratedPdfUrl &&
    payload.preGeneratedPdfUrl !== "SKIP_GENERATION"
  ) {
    pdfUrl = payload.preGeneratedPdfUrl;
    docUrl = payload.preGeneratedDocUrl || "";
  } else if (!payload.preGeneratedPdfUrl) {
    // ถ้าไม่มีการส่ง URL มา (และไม่ใช่โหมด SKIP) ให้สร้างใหม่
    const files = createPdfFromTemplate(
      payload,
      requestId,
      docNumber,
      DOC_TEMPLATE_ID,
      "บันทึกข้อความขอไปราชการ",
    );
    pdfUrl = files.pdfUrl;
    docUrl = files.docUrl;
  }

  // --- ส่วนบันทึกข้อมูลลง Sheet ---
  const headers = requestSheet
    .getRange(1, 1, 1, requestSheet.getLastColumn())
    .getValues()[0];
  let createdBy = payload.username;

  // กรณี Update: ต้องดึงข้อมูลเดิมมาด้วย เพื่อป้องกันการบันทึกทับด้วยค่าว่าง
  let currentData = {};
  let rowIndex = -1;

  if (isUpdate) {
    const data = requestSheet.getDataRange().getValues();
    const idCol = findColumnIndex(headers, "RequestId");
    rowIndex = data.findIndex(
      (row) => String(row[idCol]) === String(requestId),
    );
    // ✅ UPSERT: ถ้าพบแถว ให้อ่านข้อมูลเดิม; ถ้าไม่พบ ให้ appendRow ด้านล่าง (background sync จาก Firestore)
    if (rowIndex > 0) {
      const creatorCol = findColumnIndex(headers, "CreatedBy");
      if (creatorCol > -1) createdBy = data[rowIndex][creatorCol];

      // อ่านข้อมูลเดิมเก็บไว้ (Mapping)
      headers.forEach((h, i) => {
        currentData[h.toLowerCase().replace(/\s+/g, "")] = data[rowIndex][i];
      });
    }
  }

  // สร้าง Object ข้อมูลที่จะบันทึก
  // ★★★ แก้ไขจุดที่ 2: เพิ่มการ Mapping ตัวแปรใหม่ให้ครบถ้วน ★★★
  const rowObject = {
    requestid: requestId,
    createdby: createdBy,
    docdate: payload.docDate
      ? formatDate(payload.docDate)
      : currentData.docdate,
    requestername: payload.requesterName || currentData.requestername,
    requesterposition:
      payload.requesterPosition || currentData.requesterposition,
    location: payload.location || currentData.location,
    purpose: payload.purpose || currentData.purpose,
    startdate: payload.startDate
      ? formatDate(payload.startDate)
      : currentData.startdate,
    enddate: payload.endDate
      ? formatDate(payload.endDate)
      : currentData.enddate,
    expenseoption: payload.expenseOption || currentData.expenseoption,
    expenseitems: payload.expenseItems
      ? JSON.stringify(payload.expenseItems)
      : currentData.expenseitems,
    totalexpense:
      payload.totalExpense !== undefined
        ? Number(payload.totalExpense)
        : currentData.totalexpense,
    vehicleoption: payload.vehicleOption || currentData.vehicleoption,
    licenseplate: payload.licensePlate || currentData.licenseplate,
    department: payload.department || currentData.department,
    headname: payload.headName || currentData.headname,

    // คงค่าเดิมไว้ถ้าไม่มีการส่งมาใหม่ (สำคัญสำหรับ PDF หลัก)
    pdfurl: pdfUrl || currentData.pdfurl,
    docurl: docUrl || currentData.docurl,

    // ★★★ ฟิลด์ใหม่ที่เพิ่มเข้ามา (ต้องใส่ให้ครบไม่งั้นหาย) ★★★
    dispatchbookpdfurl:
      payload.dispatchBookPdfUrl || currentData.dispatchbookpdfurl,
    province: normalizeProvinceLabel_(payload.province || currentData.province),
    stayat: payload.stayAt || currentData.stayat,
    starttime: payload.startTime || currentData.starttime,
    endtime: payload.endTime || currentData.endtime,
    dispatchmonth: payload.dispatchMonth || currentData.dispatchmonth,
    dispatchyear: payload.dispatchYear || currentData.dispatchyear,
    studentcount: payload.studentCount || currentData.studentcount,
    teachercount: payload.teacherCount || currentData.teachercount,
    qty1: payload.qty1 || currentData.qty1,
    qty2: payload.qty2 || currentData.qty2,
    qty3: payload.qty3 || currentData.qty3,
    qty4: payload.qty4 || currentData.qty4,
    qty5: payload.qty5 || currentData.qty5,
    qty6: payload.qty6 || currentData.qty6,
    qty7: payload.qty7 || currentData.qty7,
    dispatchvehicletype:
      payload.dispatchVehicleType || currentData.dispatchvehicletype,
    dispatchvehicleid:
      payload.dispatchVehicleId || currentData.dispatchvehicleid,
    completedmemourl: payload.completedMemoUrl || currentData.completedmemourl,
    completedcommandurl:
      payload.completedCommandUrl || currentData.completedcommandurl,
    adminmemourl: payload.adminMemoUrl || currentData.adminmemourl,
    dispatchbookurl: payload.dispatchBookUrl || currentData.dispatchbookurl,

    timestamp: new Date(),
    status: isUpdate && rowIndex > 0 ? "แก้ไขแล้ว" : "กำลังดำเนินการ",
  };

  const finalRowData = headers.map((header) => {
    const key = header.toLowerCase().replace(/\s+/g, "");
    // ถ้ามีค่าใน rowObject ให้ใช้ ถ้าไม่มีให้ปล่อยว่าง
    return rowObject[key] !== undefined ? rowObject[key] : "";
  });

  if (isUpdate && rowIndex > 0) {
    requestSheet
      .getRange(rowIndex + 1, 1, 1, finalRowData.length)
      .setValues([finalRowData]);
  } else {
    requestSheet.appendRow(finalRowData);
    // (ส่วนส่งเมลแจ้งเตือนเดิม...)
  }

  syncRequestByIdToSupabase_(requestId, {
    replaceAttendees: payload.attendees !== undefined,
  });

  return {
    status: "success",
    message: isUpdate ? "อัปเดตคำขอสำเร็จ" : "สร้างคำขอสำเร็จ",
    data: { id: requestId, pdfUrl: pdfUrl, docUrl: docUrl },
  };
}

function updateRequestStatusCommand(payload) {
  const { requestId, status } = payload;
  const sheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Requests");
  const data = sheet.getDataRange().getValues();
  const idCol = findColumnIndex(data[0], "RequestId");
  const statusCol = findColumnIndex(data[0], "CommandStatus");
  const rowIndex = data.findIndex((row) => row[idCol] === requestId);
  if (rowIndex > 0) {
    sheet.getRange(rowIndex + 1, statusCol + 1).setValue(status);
    return { status: "success", message: "Status updated." };
  }
  return { status: "error", message: "Request ID not found." };
}

function approveCommand(payload) {
  const {
    requestId,
    templateType,
    requesterName,
    requesterPosition,
    location,
    province,
    purpose,
    startDate,
    endDate,
    docDate,
    attendees,
    expenseOption,
    expenseItems,
    totalExpense,
    vehicleOption,
    licensePlate,
    preGeneratedPdfUrl,
    preGeneratedDocUrl, // รับค่า URL ที่สร้างจาก Cloud Run (ถ้ามี)
    createdby,
    department,
    headName,
  } = payload;
  const normalizedProvince = normalizeProvinceLabel_(province);

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const requestSheet = ss.getSheetByName("Requests");
  const attendeesSheet = ss.getSheetByName("Attendees");
  ensureSheetColumns(requestSheet, ["Province", "CommandTemplateType"]);

  const data = requestSheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = findColumnIndex(headers, "RequestId");
  const rowIndex = data.findIndex(
    (row) => String(row[idCol]) === String(requestId),
  );

  if (rowIndex === -1) {
    return { status: "error", message: "ไม่พบรหัสคำขอนี้ในระบบ" };
  }

  // --- 1. อัปเดตข้อมูลคำขอลง Sheet (Requests) ---
  const updateCell = (colName, value) => {
    const col = findColumnIndex(headers, colName);
    if (col > -1) requestSheet.getRange(rowIndex + 1, col + 1).setValue(value);
  };

  updateCell("RequesterName", requesterName);
  updateCell("RequesterPosition", requesterPosition);
  updateCell("Location", location);
  updateCell("Province", normalizedProvince);
  updateCell("CommandTemplateType", templateType);
  updateCell("Purpose", purpose);
  updateCell("StartDate", startDate);
  updateCell("EndDate", endDate);
  updateCell("DocDate", docDate);
  updateCell("ExpenseOption", expenseOption);
  updateCell("TotalExpense", totalExpense);
  updateCell("VehicleOption", vehicleOption);
  updateCell("LicensePlate", licensePlate);

  if (expenseItems) {
    updateCell(
      "ExpenseItems",
      typeof expenseItems === "string"
        ? expenseItems
        : JSON.stringify(expenseItems),
    );
  }

  // --- 2. อัปเดตรายชื่อผู้ร่วมเดินทาง (Attendees) ---
  // ลบรายชื่อเก่าของ ID นี้ออกก่อน
  const attData = attendeesSheet.getDataRange().getValues();
  const attIdCol = findColumnIndex(attData[0], "RequestId");
  const rowsToDelete = [];
  for (let i = 1; i < attData.length; i++) {
    if (String(attData[i][attIdCol]) === String(requestId)) {
      rowsToDelete.push(i + 1);
    }
  }
  // ลบจากล่างขึ้นบนเพื่อไม่ให้ Index เพี้ยน
  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    attendeesSheet.deleteRow(rowsToDelete[i]);
  }

  // เพิ่มรายชื่อใหม่
  let newAttendees = attendees;
  if (typeof attendees === "string") {
    try {
      newAttendees = JSON.parse(attendees);
    } catch (e) {
      newAttendees = [];
    }
  }

  if (newAttendees && Array.isArray(newAttendees)) {
    newAttendees.forEach((att) => {
      attendeesSheet.appendRow([requestId, att.name, att.position, docDate]);
    });
  }

  // --- 3. จัดการไฟล์ PDF/Doc (รองรับ Cloud Run Hybrid) ---
  const docNumber = requestId.split("/")[0].replace("บค", "");

  let selectedUrl, selectedDocUrl;

  // กรณี A: มีลิงก์ส่งมาจากหน้าเว็บแล้ว (สร้างด้วย Cloud Run -> Drive เรียบร้อย)
  if (preGeneratedPdfUrl) {
    selectedUrl = preGeneratedPdfUrl;
    selectedDocUrl = preGeneratedDocUrl || "";
  }
  // กรณี B: ไม่มีลิงก์ (Fallback ให้ GAS สร้างเองแบบเดิม)
  else {
    let parsedExpenseItems = expenseItems;
    if (typeof expenseItems === "string") {
      try {
        parsedExpenseItems = JSON.parse(expenseItems);
      } catch (e) {
        parsedExpenseItems = [];
      }
    }

    // ✅ แก้ไข GAS-BUG-001: สร้าง requestDataObject จากข้อมูลในชีท (ก่อนใช้งาน)
    const requestDataRow = data[rowIndex];
    const requestDataObject = headers.reduce((obj, header, i) => {
      let val = requestDataRow[i];
      if (val instanceof Date)
        val = Utilities.formatDate(val, "Asia/Bangkok", "yyyy-MM-dd");
      obj[header] = val;
      return obj;
    }, {});

    // ✅ แก้ไข GAS-BUG-002: ลบ duplicate key "expenseOption" ออก (key ซ้ำ = value หลังทับ value แรก)
    const pdfPayload = {
      username: createdby || requestDataObject.CreatedBy,
      requesterName,
      requesterPosition,
      location,
      purpose,
      startDate,
      endDate,
      docDate,
      attendees: newAttendees,
      expenseOption: expenseOption || requestDataObject.ExpenseOption,
      expenseItems: parsedExpenseItems,
      totalExpense,
      vehicleOption,
      licensePlate,
      stayAt: requestDataObject.StayAt || "",
      dispatchVehicleType: requestDataObject.DispatchVehicleType || "",
      dispatchVehicleId: requestDataObject.DispatchVehicleId || "",
      department: department || requestDataObject.Department,
      headName: headName || requestDataObject.HeadName,
    };

    // ดึงข้อมูลขาดเหลือจาก Sheet ถ้า Payload ไม่มีส่งมา
    const userCol = findColumnIndex(headers, "CreatedBy");
    const deptCol = findColumnIndex(headers, "Department");
    const headCol = findColumnIndex(headers, "HeadName");

    if (!pdfPayload.username && userCol > -1)
      pdfPayload.username = data[rowIndex][userCol];
    if (!pdfPayload.department && deptCol > -1)
      pdfPayload.department = data[rowIndex][deptCol];
    if (!pdfPayload.headName && headCol > -1)
      pdfPayload.headName = data[rowIndex][headCol];

    const templateIdMap = {
      solo: COMMAND_TEMPLATE_SOLO_ID,
      groupSmall: COMMAND_TEMPLATE_GROUP_SMALL_ID,
      groupLarge: COMMAND_TEMPLATE_GROUP_LARGE_ID,
    };
    const selectedTemplateId = templateIdMap[templateType];

    const files = createPdfFromTemplate(
      pdfPayload,
      requestId,
      docNumber,
      selectedTemplateId,
      `คำสั่ง_${templateType}`,
    );
    if (files) {
      selectedUrl = files.pdfUrl;
      selectedDocUrl = files.docUrl;
    }
  }

  // --- 4. บันทึก URL และสถานะลง Sheet Requests ---
  if (selectedUrl) {
    const statusCol = findColumnIndex(headers, "CommandStatus");
    const finalUrlCol = findColumnIndex(headers, "CommandPdfUrl");

    // เลือกคอลัมน์ที่จะบันทึกตามประเภท Template
    const typeUrlColName =
      templateType === "solo"
        ? "CommandPdfUrlSolo"
        : templateType === "groupSmall"
          ? "CommandPdfUrlGroupSmall"
          : "CommandPdfUrlGroupLarge";
    const typeDocUrlColName =
      templateType === "solo"
        ? "CommandDocUrlSolo"
        : templateType === "groupSmall"
          ? "CommandDocUrlGroupSmall"
          : "CommandDocUrlGroupLarge";

    // ตรวจสอบว่ามีคอลัมน์หรือไม่ ถ้าไม่มีให้สร้าง
    ensureSheetColumns(requestSheet, [typeUrlColName, typeDocUrlColName]);

    // โหลด Headers ใหม่เพราะอาจมีการเพิ่มคอลัมน์
    const headersNew = requestSheet
      .getRange(1, 1, 1, requestSheet.getLastColumn())
      .getValues()[0];
    const typeUrlCol = findColumnIndex(headersNew, typeUrlColName);
    const typeDocUrlCol = findColumnIndex(headersNew, typeDocUrlColName);

    const rowNum = rowIndex + 1;

    // อัปเดตสถานะและ URL หลัก
    if (statusCol > -1)
      requestSheet
        .getRange(rowNum, statusCol + 1)
        .setValue("รอตรวจสอบและออกคำสั่งไปราชการ");
    if (finalUrlCol > -1)
      requestSheet.getRange(rowNum, finalUrlCol + 1).setValue(selectedUrl);

    // บันทึกลงคอลัมน์เฉพาะประเภท (แยกเก็บ)
    if (typeUrlCol > -1)
      requestSheet.getRange(rowNum, typeUrlCol + 1).setValue(selectedUrl);
    if (typeDocUrlCol > -1)
      requestSheet.getRange(rowNum, typeDocUrlCol + 1).setValue(selectedDocUrl);
    if (expenseOption === "partial") {
      // หรือเช็คเงื่อนไขอื่นตามที่คุณใช้
      createAutoMemoRecord(requestId, createdby);
    }
    // ส่งอีเมลแจ้งเตือนเจ้าของเรื่อง
    const userCol = findColumnIndex(headers, "CreatedBy");
    const username =
      createdby || (userCol > -1 ? data[rowIndex][userCol] : null);

    if (username) {
      sendNotificationEmail(
        username,
        `[WNY App] คำขอ ${requestId} อนุมัติและออกคำสั่งแล้ว`,
        `<p>คำขอ ${requestId} ได้รับการอนุมัติและออกคำสั่งเรียบร้อยแล้ว</p><p><a href="${selectedUrl}">คลิกเพื่อดูคำสั่ง</a></p>`,
      );
    }

    syncRequestByIdToSupabase_(requestId, { replaceAttendees: true });

    return {
      status: "success",
      message: "อนุมัติคำสั่งและสร้างรายการบันทึกข้อความอัตโนมัติเรียบร้อยแล้ว",
      data: { pdfUrl: selectedUrl, docUrl: selectedDocUrl },
    };
  }

  return { status: "error", message: "บันทึกข้อมูลไม่สำเร็จ (ไม่พบ URL ไฟล์)" };
}

function generateDispatchBook(payload) {
  const {
    requestId,
    dispatchMonth,
    dispatchYear,
    commandCount,
    memoCount,
    preGeneratedPdfUrl, // รับค่า URL ที่สร้างจาก Cloud Run (ถ้ามี)
    createdby,
  } = payload;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const requestSheet = ss.getSheetByName("Requests");

  const data = requestSheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = findColumnIndex(headers, "RequestId");
  const rowIndex = data.findIndex(
    (row) => String(row[idCol]) === String(requestId),
  );

  if (rowIndex === -1) return { status: "error", message: "ไม่พบคำขอ" };

  // --- Hybrid Logic: จัดการไฟล์ PDF ---
  let pdfUrl;

  // กรณี A: มีลิงก์ส่งมาจากหน้าเว็บแล้ว (สร้างด้วย Cloud Run -> Drive เรียบร้อย)
  if (preGeneratedPdfUrl) {
    pdfUrl = preGeneratedPdfUrl;
  }
  // กรณี B: ไม่มีลิงก์ (Fallback ให้ GAS สร้างเองแบบเดิม)
  else {
    // ดึงข้อมูลเดิมจาก Sheet มาเตรียมสร้างไฟล์
    const requestDataRow = data[rowIndex];
    const requestDataObject = headers.reduce((obj, header, i) => {
      let val = requestDataRow[i];
      if (val instanceof Date)
        val = Utilities.formatDate(val, "Asia/Bangkok", "yyyy-MM-dd");
      obj[header] = val;
      return obj;
    }, {});

    const attendeesData = getAttendeesForRequest(requestId);
    const docNumber = requestId.split("/")[0].replace("บค", "");

    const pdfPayload = {
        requesterName: requestDataObject.RequesterName,
        docDate: requestDataObject.DocDate,
        startDate: requestDataObject.StartDate,
        endDate: requestDataObject.EndDate,
        purpose: requestDataObject.Purpose,
        location: requestDataObject.Location,
        province: normalizeProvinceLabel_(requestDataObject.Province || ""),
        requesterPosition: requestDataObject.RequesterPosition,
        department: requestDataObject.Department,
        headName: requestDataObject.HeadName,
      vehicleOption: requestDataObject.VehicleOption,
      licensePlate: requestDataObject.LicensePlate,
      expenseOption: requestDataObject.ExpenseOption,
      expenseItems: requestDataObject.ExpenseItems,
      totalExpense: requestDataObject.TotalExpense,
      attendees: attendeesData || [],
      dispatchMonth: dispatchMonth,
      dispatchYear: dispatchYear,
      commandCount: commandCount,
      memoCount: memoCount,
      username: createdby || requestDataObject.CreatedBy,
    };

    // สร้างไฟล์ด้วย GAS Native
    const files = createPdfFromTemplate(
      pdfPayload,
      requestId,
      docNumber,
      DISPATCH_BOOK_TEMPLATE_ID,
      "หนังสือส่งเขต",
    );
    if (files) pdfUrl = files.pdfUrl;
  }

  // --- บันทึก URL ลง Sheet ---
  if (pdfUrl) {
    payload.preGeneratedPdfUrl = pdfUrl; // ใส่ URL เข้าไปใน Payload
    saveDispatchRecord(payload); // <--- เรียกใช้ฟังก์ชันที่เพิ่มไปในข้อ 1

    // โค้ดบันทึกลงชีท Requests เดิมเพื่อให้ Dashboard แสดงปุ่มดาวน์โหลดได้
    ensureSheetColumns(requestSheet, ["DispatchBookPdfUrl"]);
    const newHeaders = requestSheet
      .getRange(1, 1, 1, requestSheet.getLastColumn())
      .getValues()[0];
    const urlCol = findColumnIndex(newHeaders, "DispatchBookPdfUrl");
    if (urlCol > -1) {
      requestSheet.getRange(rowIndex + 1, urlCol + 1).setValue(pdfUrl);
    }

    syncRequestByIdToSupabase_(requestId, { replaceAttendees: false });

    return {
      status: "success",
      message: "สร้างหนังสือส่งและบันทึกข้อมูลเรียบร้อยแล้ว",
      data: { pdfUrl: pdfUrl },
    };
  }

  return { status: "error", message: "สร้างไฟล์ไม่สำเร็จ" };
}

// ==================================================================
// === PDF GENERATION (CRITICAL DATE FIXES & THAI NUMERALS) =========
// ==================================================================

/**
 * ฟังก์ชันสร้าง PDF จาก Google Docs Template
 * แก้ไขให้รองรับข้อมูล Hybrid และจัดการตัวเลขไทยครบถ้วน
 */
function createPdfFromTemplate(
  data,
  requestId,
  docNumber,
  templateId,
  filePrefix = "Memo",
) {
  const username = data.username || data.CreatedBy;
  const userFolder = getOrCreateUserFolder(username);

  // 1. จัดการวันที่ให้เป็น Object ที่ถูกต้อง
  let startDate, endDate, docDate;
  try {
    startDate = new Date(data.startDate);
    endDate = new Date(data.endDate);
    docDate = new Date(data.docDate);
  } catch (e) {
    startDate = new Date();
    endDate = new Date();
    docDate = new Date();
  }

  // 2. คัดลอกไฟล์จาก Template
  const templateFile = DriveApp.getFileById(templateId);
  const newFileName = `${filePrefix}_${data.requesterName}_${requestId.replace(/\//g, "-")}`;
  const tempFile = templateFile.makeCopy(newFileName, userFolder);
  const tempDoc = DocumentApp.openById(tempFile.getId());
  const body = tempDoc.getBody();

  // 3. คำนวณข้อมูลพื้นฐาน
  const duration =
    Math.round(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;
  const buddhistYear =
    parseInt(Utilities.formatDate(docDate, "Asia/Bangkok", "yyyy")) + 543;
  const thaiMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  const thaiMonth = thaiMonths[docDate.getMonth()];

  // 4. จัดการรายชื่อผู้ร่วมเดินทาง (รวมผู้ขอและผู้ติดตาม)
  let attendeesList = [];
  try {
    attendeesList =
      typeof data.attendees === "string"
        ? JSON.parse(data.attendees)
        : data.attendees || [];
  } catch (e) {
    attendeesList = [];
  }

  const allPeople = [
    { name: data.requesterName, position: data.requesterPosition },
  ];
  attendeesList.forEach((att) => {
    const attName = (att.name || "").trim();
    if (attName && !allPeople.some((p) => p.name === attName)) {
      allPeople.push({ name: attName, position: att.position || "" });
    }
  });

  // 5. แทนที่ข้อความทั่วไป (Text Replacement)
  const replace = (tag, val) =>
    body.replaceText(`{{${tag}}}`, toThaiNumerals(val || ""));

  replace("id", requestId);
  replace("doc_number", docNumber);
  replace("YYYY", buddhistYear);
  replace("MMMM", thaiMonth);
  replace("doc_date", thaiDateFormat(data.docDate));
  replace("start_date", thaiDateFormat(data.startDate));
  replace("end_date", thaiDateFormat(data.endDate));
  replace("requester_name", data.requesterName);
  replace("requester_position", data.requesterPosition);
  replace("location", data.location);
  replace("province", normalizeProvinceLabel_(data.province || ""));
  replace("purpose", data.purpose);
  replace("date_range", formatDateRangeThai(data.startDate, data.endDate));
  replace("duration", duration);
  replace("total_count", allPeople.length);
  replace("license_plate", data.licensePlate);
  replace("learning_area", data.department);
  replace("head_name", data.headName || "...................................");

  // ข้อมูลสำหรับหนังสือส่ง
  replace("dispatch_month", data.dispatchMonth);
  replace("dispatch_year", data.dispatchYear);
  replace("command_count", data.commandCount || "๐");
  replace("memo_count", data.memoCount || "๐");
  replace("stay_at", data.stayAt || "-");
  replace("vehicle_type", data.dispatchVehicleType || data.vehicleType || "-");
  replace("vehicle_id", data.dispatchVehicleId || data.licensePlate || "-");

  // 6. จัดการ Checkbox (ค่าใช้จ่ายและยานพาหนะ)
  const checked = "✓";
  const unchecked = " ";
  const check = (opt, val) => (opt === val ? checked : unchecked);

  body.replaceText("{{expense_no}}", check(data.expenseOption, "no"));
  body.replaceText("{{expense_partial}}", check(data.expenseOption, "partial"));
  body.replaceText("{{vehicle_gov}}", check(data.vehicleOption, "gov"));
  body.replaceText("{{vehicle_private}}", check(data.vehicleOption, "private"));
  body.replaceText("{{vehicle_public}}", check(data.vehicleOption, "public"));

  // รายการค่าใช้จ่าย
  let expenseItems = [];
  try {
    expenseItems =
      typeof data.expenseItems === "string"
        ? JSON.parse(data.expenseItems)
        : data.expenseItems || [];
  } catch (e) {
    expenseItems = [];
  }

  const hasItem = (name) =>
    expenseItems.some((item) => (item.name || item) === name)
      ? checked
      : unchecked;
  body.replaceText("{{expense_allowance}}", hasItem("ค่าเบี้ยเลี้ยง"));
  body.replaceText("{{expense_food}}", hasItem("ค่าอาหาร"));
  body.replaceText("{{expense_accommodation}}", hasItem("ค่าที่พัก"));
  body.replaceText("{{expense_transport}}", hasItem("ค่าพาหนะ"));
  body.replaceText("{{expense_fuel}}", hasItem("ค่าน้ำมัน"));

  const otherItem = expenseItems.find(
    (i) => (i.name || i) === "ค่าใช้จ่ายอื่นๆ",
  );
  body.replaceText("{{expense_other_check}}", otherItem ? checked : unchecked);
  body.replaceText(
    "{{expense_other_text}}",
    otherItem ? toThaiNumerals(otherItem.detail || "") : "",
  );
  body.replaceText(
    "{{expense_total}}",
    toThaiNumerals(formatThaiCurrency(data.totalExpense)),
  );

  // 7. จัดการตารางรายชื่อผู้เดินทาง
  const tables = body.getTables();
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const rowCount = table.getNumRows();
    if (rowCount > 0) {
      const firstCellText = table.getRow(0).getCell(0).getText();
      // ค้นหาตารางที่มี Tag {{att_index}}
      if (firstCellText.includes("{{att_index}}")) {
        table.removeRow(0); // ลบแถว Template
        allPeople.forEach((p, idx) => {
          const row = table.appendTableRow();
          // ✅ แก้ไข GAS-BUG-004: TableCell ใน GAS ไม่มี method setPaddingTop/setPaddingBottom
          row.appendTableCell(toThaiNumerals(idx + 1));
          row.appendTableCell(p.name);
          row.appendTableCell(p.position);
        });
      }
    }
  }

  tempDoc.saveAndClose();
  const pdfBlob = tempFile.getAs(MimeType.PDF);
  const pdfFile = userFolder.createFile(pdfBlob).setName(newFileName + ".pdf");

  return { pdfUrl: pdfFile.getUrl(), docUrl: tempFile.getUrl() };
}

// ==================================================================
// === HELPER FUNCTIONS (DATE FORMATTING & UTILS) ===================
// ==================================================================

function formatDateRangeThai(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return "";
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  const get = (d, fmt) => Utilities.formatDate(d, "Asia/Bangkok", fmt);
  const startDay = parseInt(get(startDate, "d"));
  const endDay = parseInt(get(endDate, "d"));
  const thaiMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  const startMonthIdx = parseInt(get(startDate, "M")) - 1;
  const endMonthIdx = parseInt(get(endDate, "M")) - 1;
  const startMonth = thaiMonths[startMonthIdx];
  const endMonth = thaiMonths[endMonthIdx];
  const startYear = parseInt(get(startDate, "yyyy")) + 543;
  const endYear = parseInt(get(endDate, "yyyy")) + 543;
  // ✅ แก้ไข GAS-BUG-003: ลบ null check ซ้ำที่อยู่ผิดตำแหน่ง (มีอยู่แล้วบรรทัดแรก)
  if (startDateStr.substring(0, 10) === endDateStr.substring(0, 10)) {
    return `${startDay} ${startMonth} ${startYear}`; // ลบคำว่า "วันที่"
  }
  if (startMonthIdx === endMonthIdx && startYear === endYear) {
    return `${startDay} - ${endDay} ${startMonth} ${startYear}`; // ลบคำว่า "วันที่"
  }
  return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`; // ลบคำว่า "ระหว่างวันที่"
}

function thaiDateFormat(isoDate) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";

  const thaiMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];
  const day = parseInt(Utilities.formatDate(date, "Asia/Bangkok", "d"));
  const monthIdx =
    parseInt(Utilities.formatDate(date, "Asia/Bangkok", "M")) - 1;
  const year =
    parseInt(Utilities.formatDate(date, "Asia/Bangkok", "yyyy")) + 543;

  // คืนค่าเฉพาะตัวเลขและชื่อเดือน (ลบคำว่า "วันที่" ออก)
  return `${day} ${thaiMonths[monthIdx]} ${year}`;
}

function sheetToObject(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data.shift();
  const sheetName = sheet.getName();
  return data.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      if (!header) return;
      let key = header.toLowerCase().replace(/\s+/g, "");
      let value = row[index];

      if (value instanceof Date) {
        value = Utilities.formatDate(value, "Asia/Bangkok", "yyyy-MM-dd");
      }

      if (sheetName === "Requests") {
        if (key === "requestid") key = "id";
        if (key === "createdby") key = "username";
        if (key === "docdate") key = "docDate";
        if (key === "requestername") key = "requesterName";
        if (key === "requesterposition") key = "requesterPosition";
        if (key === "startdate") key = "startDate";
        if (key === "enddate") key = "endDate";
        if (key === "expenseoption") key = "expenseOption";
        if (key === "expenseitems") key = "expenseItems";
        if (key === "totalexpense") key = "totalExpense";
        if (key === "vehicleoption") key = "vehicleOption";
        if (key === "licenseplate") key = "licensePlate";
        if (key === "headname") key = "headName";
        if (key === "pdfurl") key = "pdfUrl";
        if (key === "docurl") key = "docUrl";
        if (key === "commandpdfurl") key = "commandPdfUrl";
        if (key === "commandstatus") key = "commandStatus";
        if (key === "commandtemplatetype") key = "commandTemplateType";
        if (key === "commandpdfurlsolo") key = "commandPdfUrlSolo";
        if (key === "commanddocurlsolo") key = "commandDocUrlSolo";
        // URL ไฟล์ที่สำคัญ — ต้อง map camelCase ให้ตรงกับที่ frontend อ่าน
        if (key === "completedmemourl") key = "completedMemoUrl";
        if (key === "completedcommandurl") key = "completedCommandUrl";
        if (key === "adminmemourl") key = "adminMemoUrl";
        if (key === "dispatchbookurl") key = "dispatchBookUrl";
        if (key === "docstatus") key = "docStatus";
        if (key === "wasrejected") key = "wasRejected";
        if (key === "rejectionreason") key = "rejectionReason";
        if (key === "commandpdfurlgroupsmall") key = "commandPdfUrlGroupSmall";
        if (key === "commanddocurlgroupsmall") key = "commandDocUrlGroupSmall"; // Add docUrl mapping
        if (key === "commandpdfurlgrouplarge") key = "commandPdfUrlGroupLarge";
        if (key === "commanddocurlgrouplarge") key = "commandDocUrlGroupLarge"; // Add docUrl mapping
        if (key === "dispatchbookpdfurl") key = "dispatchBookPdfUrl";
      } else if (sheetName === "Memos") {
        if (key === "memoid") key = "id";
        if (key === "submittedby") key = "submittedBy";
        if (key === "refnumber") key = "refNumber";
        if (key === "fileid") key = "fileId";
        if (key === "fileurl") key = "fileURL";
        if (key === "completedmemourl") key = "completedMemoUrl";
        if (key === "completedcommandurl") key = "completedCommandUrl";
        if (key === "dispatchbookurl") key = "dispatchBookUrl";
      } else if (sheetName === "Users") {
        if (key === "loginname") key = "loginName"; // ← เพิ่มบรรทัดนี้
        if (key === "fullname") key = "fullName";
        if (key === "email") key = "email";
        if (key === "specialposition") key = "specialPosition";
      } else if (sheetName === "DraftRequests") {
        if (key === "draftid") key = "draftId";
        if (key === "createdby") key = "username";
        if (key === "docdate") key = "docDate";
        if (key === "requestername") key = "requesterName";
        if (key === "requesterposition") key = "requesterPosition";
        if (key === "startdate") key = "startDate";
        if (key === "enddate") key = "endDate";
        if (key === "expenseoption") key = "expenseOption";
        if (key === "expenseitems") key = "expenseItems";
        if (key === "totalexpense") key = "totalExpense";
        if (key === "vehicleoption") key = "vehicleOption";
        if (key === "licenseplate") key = "licensePlate";
        if (key === "headname") key = "headName";
      }

      obj[key] = value;
    });
    return obj;
  });
}

function findColumnIndex(headers, columnName) {
  const lowerCaseColumnName = columnName.toLowerCase().replace(/\s+/g, "");
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase().replace(/\s+/g, "") === lowerCaseColumnName) {
      return i;
    }
  }
  return -1;
}

function ensureSheetColumns(sheet, requiredColumns) {
  if (!sheet) return;
  const lastColumn = sheet.getLastColumn();
  const headers =
    lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  const columnsToAdd = [];
  requiredColumns.forEach((col) => {
    if (!headers.some((h) => h.toLowerCase() === col.toLowerCase())) {
      columnsToAdd.push(col);
    }
  });
  if (columnsToAdd.length > 0) {
    sheet
      .getRange(1, headers.length + 1, 1, columnsToAdd.length)
      .setValues([columnsToAdd]);
  }
}

function toThaiNumerals(input) {
  if (input === null || input === undefined) return "";
  const arabicNumerals = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
  const thaiNumerals = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
  let str = String(input);
  for (let i = 0; i < 10; i++) {
    str = str.replace(new RegExp(arabicNumerals[i], "g"), thaiNumerals[i]);
  }
  return str;
}

function formatThaiCurrency(num) {
  if (num === null || num === undefined || isNaN(num)) return "๐.๐๐";
  let formattedNum = Number(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // The caller will handle toThaiNumerals
  return formattedNum;
}

// ==================================================================
// === OTHER UTILS (EMAIL, FILES) ===================================
// ==================================================================

function uploadMemo(payload) {
  // รับ fileUrl (ลิงก์ที่อัปโหลดแล้ว) เพิ่มเข้ามา
  const { refNumber, file, username, memoType, fileUrl, isAdminBypass } =
    payload;

  const memoSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Memos");
  if (!memoSheet) throw new Error("Sheet 'Memos' not found.");

  const memoId = `MEMO-${Date.now()}`;
  const timestamp = new Date();
  let status = "กำลังดำเนินการ";
  let fileId = "",
    finalFileUrl = "";
  let updateRequestCommandStatus = false;

  if (memoType === "reimburse") {
    status = "เสร็จสิ้นรอออกคำสั่งไปราชการ";
    updateRequestCommandStatus = true;
  } else {
    // --- ส่วนที่แก้ไข: รองรับทั้งไฟล์แนบ (เก่า) และ ลิงก์ (ใหม่) ---
    if (file) {
      // กรณี A: ส่งไฟล์มาเป็น Base64 (ระบบเดิม) -> สร้างไฟล์ลง Drive
      const decodedData = Utilities.base64Decode(
        file.data,
        Utilities.Charset.UTF_8,
      );
      const blob = Utilities.newBlob(decodedData, file.mimeType, file.filename);
      const userFolder = getOrCreateUserFolder(username);
      const newFile = userFolder.createFile(blob);
      fileId = newFile.getId();
      finalFileUrl = newFile.getUrl();
    } else if (fileUrl) {
      // กรณี B: ส่งลิงก์มา (ระบบใหม่แนบ 3 ไฟล์) -> ใช้ลิงก์นั้นเลย
      finalFileUrl = fileUrl;
      // พยายามแกะ ID จากลิงก์ (ถ้าทำได้)
      try {
        const match = fileUrl.match(/\/d\/(.*?)\//);
        if (match) fileId = match[1];
      } catch (e) {}
    } else if (isAdminBypass) {
      // กรณี Admin bypass ส่งบันทึกโดยไม่มีไฟล์แนบ
      finalFileUrl = "";
    } else {
      throw new Error("File data is required."); // ยังคงแจ้งเตือนถ้าไม่มีอะไรส่งมาเลย
    }
  }

  // บันทึกลง Sheet
  memoSheet.appendRow([
    memoId,
    username,
    refNumber,
    status,
    timestamp,
    fileId,
    finalFileUrl, // ใช้ URL ที่ได้ (ไม่ว่าจะจากไฟล์ใหม่ หรือลิงก์ที่ส่งมา)
    "",
    "",
    "",
  ]);

  // อัปเดตสถานะใน Sheet Requests
  const requestSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Requests");
  const data = requestSheet.getDataRange().getValues();
  const reqIdCol = findColumnIndex(data[0], "RequestId");
  const statusCol = findColumnIndex(data[0], "Status");
  const cmdStatusCol = findColumnIndex(data[0], "CommandStatus");
  const rowIndex = data.findIndex(
    (row) => String(row[reqIdCol]) === String(refNumber),
  );

  if (rowIndex > 0) {
    if (statusCol > -1)
      requestSheet.getRange(rowIndex + 1, statusCol + 1).setValue("Submitted");
    if (updateRequestCommandStatus && cmdStatusCol > -1) {
      requestSheet
        .getRange(rowIndex + 1, cmdStatusCol + 1)
        .setValue("เสร็จสิ้นรอออกคำสั่งไปราชการ");
    }
    // อัปเดต docStatus ถ้ามีการส่งมา
    if (payload.forwardToStatus) {
      const docStatusCol = findColumnIndex(data[0], "DocStatus");
      if (docStatusCol > -1)
        requestSheet
          .getRange(rowIndex + 1, docStatusCol + 1)
          .setValue(payload.forwardToStatus);
    }
  }

  // แจ้งเตือน Admin (ถ้ามีฟังก์ชันนี้)
  try {
    if (typeof notifyAdmins === "function") {
      notifyAdmins(
        `ผู้ใช้ส่งบันทึกข้อความเข้าระบบ: ${refNumber}`,
        `
            <p>ผู้ใช้ <strong>${username}</strong> ได้ส่งไฟล์บันทึกข้อความเข้าระบบ</p>
            <p><strong>สำหรับคำขอเลขที่:</strong> ${refNumber}</p>
            <p>กรุณาตรวจสอบในระบบ</p>
          `,
      );
    }
  } catch (e) {
    Logger.log("Email notify error: " + e.message);
  }

  return {
    status: "success",
    message: "อัปโหลดบันทึกข้อความสำเร็จ",
    data: { fileUrl: finalFileUrl },
  };
}

function getAllMemosFromSheets_() {
  const memoSheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Memos");
  if (!memoSheet) return [];
  const memos = sheetToObject(memoSheet);
  const requests = getAllRequestsFromSheets_();
  const requestMap = requests.reduce((map, req) => {
    map[req.id] = req;
    return map;
  }, {});
  return memos.map((memo) => {
    const req = requestMap[memo.refNumber];
    memo.dispatchBookUrl = req ? req.dispatchBookPdfUrl || "" : "";
    return memo;
  });
}

function getAllMemos(options) {
  try {
    return getAllMemosFromSupabase(options);
  } catch (error) {
    Logger.log("getAllMemos fallback to Sheets: " + error.message);
    return filterMemosByPeriod_(
      getAllMemosFromSheets_(),
      getAllRequestsFromSheets_(),
      options,
    );
  }
}

function getSentMemos(username) {
  try {
    return getSentMemosFromSupabase_(username, {});
  } catch (error) {
    Logger.log("getSentMemos fallback to Sheets: " + error.message);
    return getAllMemos().filter((m) => m.submittedBy === username);
  }
}

function getStatsSummary(options) {
  try {
    return getStatsSummaryFromSupabase_(options);
  } catch (error) {
    Logger.log("getStatsSummary fallback to legacy aggregation: " + error.message);
    const requests = getAllRequests();
    const memos = getAllMemos();
    const users = getAllUsers();
    const requestStatus = {};
    let completedRequests = 0;
    requests.forEach(function (req) {
      const status = String(req.status || "กำลังดำเนินการ").trim();
      requestStatus[status] = (requestStatus[status] || 0) + 1;
      if (isCompletedRequestStatus_(status, req.commandStatus || "")) {
        completedRequests++;
      }
    });
    return {
      totalRequests: requests.length,
      completedRequests: completedRequests,
      totalMemos: memos.length,
      totalUsers: users.length,
      requestStatus: requestStatus,
      monthlyStats: buildMonthlyStatsFromRows_(
        requests.map(function (req) {
          return {
            start_date: req.startDate || "",
            doc_date: req.docDate || "",
            created_at_source: req.timestamp || "",
          };
        }),
      ),
      recentRequests: requests.slice(0, 5).map(function (req) {
        return {
          id: req.id || "",
          purpose: req.purpose || "",
          status: req.status || "กำลังดำเนินการ",
          commandStatus: req.commandStatus || "",
          startDate: req.startDate || "",
          docDate: req.docDate || "",
          timestamp: req.timestamp || "",
        };
      }),
      generatedAt: new Date().toISOString(),
      scope: "legacy-fallback",
    };
  }
}

function updateMemoStatus(payload) {
  const {
    id,
    status,
    completedMemoFile,
    completedCommandFile,
    dispatchBookFile,
  } = payload;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Memos");

  // ตรวจสอบและสร้างคอลัมน์เก็บลิงก์ถ้ายังไม่มี
  ensureSheetColumns(sheet, [
    "CompletedMemoUrl",
    "CompletedCommandUrl",
    "DispatchBookUrl",
  ]);

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = findColumnIndex(headers, "MemoID");

  // ค้นหาแถวที่ตรงกับ MemoID
  const rowIndex = data.findIndex((row) => String(row[idCol]) === String(id));

  if (rowIndex > -1) {
    const rowNum = rowIndex + 1;
    const rowData = data[rowIndex];

    const userCol = findColumnIndex(headers, "SubmittedBy");
    const refCol = findColumnIndex(headers, "RefNumber");
    const fileUrlCol = findColumnIndex(headers, "FileURL");

    const username = userCol > -1 ? rowData[userCol] : null;
    const refNumber = refCol > -1 ? rowData[refCol] : "N/A";

    // --- กรณีที่ 1: ส่งคืน/แก้ไข (ลบข้อมูลเดิม) ---
    if (status === "นำกลับไปแก้ไข") {
      if (fileUrlCol > -1) {
        const fileUrl = rowData[fileUrlCol];
        deleteFileByUrl(fileUrl); // ลบไฟล์ต้นฉบับ
      }

      // อัปเดตสถานะใน Sheet "Requests" ด้วย
      const reqSheet = ss.getSheetByName("Requests");
      const reqData = reqSheet.getDataRange().getValues();
      const reqIdCol = findColumnIndex(reqData[0], "RequestId");
      const reqStatusCol = findColumnIndex(reqData[0], "Status");
      const reqRowIndex = reqData.findIndex(
        (r) => String(r[reqIdCol]) === String(refNumber),
      );

      if (reqRowIndex > 0 && reqStatusCol > -1) {
        reqSheet
          .getRange(reqRowIndex + 1, reqStatusCol + 1)
          .setValue("นำกลับไปแก้ไข");
      }

      if (username) {
        sendNotificationEmail(
          username,
          `[WNY App] แจ้งแก้ไขคำขอ ${refNumber}`,
          `<p>คำขอ ${refNumber} ถูกส่งคืนเพื่อแก้ไข<br>กรุณาตรวจสอบและส่งบันทึกข้อความใหม่อีกครั้ง</p>`,
        );
      }

      // ลบแถวออกจาก Memos
      sheet.deleteRow(rowNum);
      return {
        status: "success",
        message: "ลบไฟล์เดิมและส่งกลับไปแก้ไขเรียบร้อยแล้ว",
      };
    }

    // --- กรณีที่ 2: อัปเดตสถานะปกติ / เสร็จสิ้น ---
    const statusCol = findColumnIndex(headers, "Status");
    if (statusCol > -1) sheet.getRange(rowNum, statusCol + 1).setValue(status);

    const userFolder = getOrCreateUserFolder(username);

    // ตัวแปรสำหรับเก็บ URL เพื่อส่งกลับไปหน้าเว็บ
    let returnUrls = {};

    // ฟังก์ชันย่อยสำหรับอัปโหลดไฟล์
    const upload = (file, colName, keyName) => {
      if (!file) return;
      const col = findColumnIndex(headers, colName);
      if (col === -1) return;

      // สร้างไฟล์ใน Google Drive
      const blob = Utilities.newBlob(
        Utilities.base64Decode(file.data, Utilities.Charset.UTF_8),
        file.mimeType,
        file.filename,
      );
      const newFile = userFolder.createFile(blob);
      const url = newFile.getUrl();

      // บันทึก URL ลง Google Sheet
      sheet.getRange(rowNum, col + 1).setValue(url);

      // เก็บ URL ลงตัวแปรเพื่อส่งกลับ
      if (keyName) returnUrls[keyName] = url;
    };

    if (status === "เสร็จสิ้น/รับไฟล์ไปใช้งาน") {
      // อัปโหลดไฟล์และเก็บ URL
      upload(completedMemoFile, "CompletedMemoUrl", "completedMemoUrl");
      upload(
        completedCommandFile,
        "CompletedCommandUrl",
        "completedCommandUrl",
      );
      upload(dispatchBookFile, "DispatchBookUrl", "dispatchBookUrl");

      if (username) sendCompletionEmail(refNumber, username, status);
    } else if (username) {
      sendNotificationEmail(
        username,
        `[WNY App] อัปเดตสถานะ ${refNumber}`,
        `<p>สถานะใหม่: ${status}</p>`,
      );
    }

    // ★ ส่ง URLs กลับไปให้หน้าเว็บเพื่อบันทึกลง Firestore ★
    return {
      status: "success",
      message: "อัปเดตเรียบร้อยแล้ว",
      data: returnUrls,
    };
  }

  return { status: "error", message: "ไม่พบบันทึกข้อความ" };
}

function getUserEmail(username) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
  const data = sheet.getDataRange().getValues();
  const userCol = findColumnIndex(data[0], "Username");
  const emailCol = findColumnIndex(data[0], "Email");
  if (userCol === -1 || emailCol === -1) return null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userCol]).trim() === String(username).trim())
      return data[i][emailCol];
  }
  return null;
}

// New Admin Notification Logic
function getAdminEmails() {
  try {
    const sheet =
      SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Users");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const emailCol = findColumnIndex(headers, "Email");
    const roleCol = findColumnIndex(headers, "Role");

    if (emailCol === -1 || roleCol === -1) return [];

    const adminEmails = [];
    for (let i = 1; i < data.length; i++) {
      const email = data[i][emailCol];
      const role = data[i][roleCol];
      if (String(role).toLowerCase() === "admin" && email) {
        adminEmails.push(email);
      }
    }
    return adminEmails;
  } catch (e) {
    Logger.log("Error fetching admin emails: " + e.message);
    return [];
  }
}

function notifyAdmins(subject, htmlBody) {
  const admins = getAdminEmails();
  if (admins.length === 0) return;

  admins.forEach((email) => {
    try {
      MailApp.sendEmail({
        to: email,
        subject: `[Admin Alert] ${subject}`,
        htmlBody: htmlBody,
        name: "ระบบ WNY App (Admin Alert)",
      });
    } catch (e) {
      Logger.log(`Failed to send email to ${email}: ${e.message}`);
    }
  });
}

function sendNotificationEmail(username, subject, body) {
  const email = getUserEmail(username);
  if (email) {
    try {
      MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: body,
        name: "ระบบแจ้งเตือน WNY App",
      });
    } catch (e) {
      Logger.log("Email failed: " + e.message);
    }
  }
}

function sendCompletionEmail(requestId, username, status) {
  const subject = `[WNY App] คำขอ ${requestId} เสร็จสมบูรณ์`;
  const body = `<p>คำขอ ${requestId} เสร็จสมบูรณ์แล้ว (สถานะ: ${status})<br>กรุณาตรวจสอบไฟล์ในระบบ</p>`;
  sendNotificationEmail(username, subject, body);
}

function getOrCreateUserFolder(username) {
  try {
    if (!username) return DriveApp.getFolderById(PDF_FOLDER_ID);
    const parent = DriveApp.getFolderById(PDF_FOLDER_ID);
    const folders = parent.getFoldersByName(username);
    return folders.hasNext() ? folders.next() : parent.createFolder(username);
  } catch (e) {
    Logger.log("getOrCreateUserFolder error: " + e.message);
    throw new Error("ไม่สามารถเข้าถึงโฟลเดอร์ Drive ได้: " + e.message);
  }
}

function deleteFileByUrl(url) {
  if (!url) return;
  try {
    const id = url.match(/\/d\/(.*?)\//)?.[1] || url.match(/id=([^&]+)/)?.[1];
    if (id) DriveApp.getFileById(id).setTrashed(true);
  } catch (e) {
    Logger.log("Delete file error: " + e.message);
  }
}

function deleteOldPdfFiles(requestId) {
  const sheet =
    SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Requests");
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = findColumnIndex(headers, "RequestId");
  const rowIndex = data.findIndex(
    (row) => String(row[idCol]) === String(requestId),
  );

  if (rowIndex > 0) {
    const row = data[rowIndex];
    // Clean up all related files (PDF & Docs)
    [
      "PdfUrl",
      "DocUrl",
      "CommandPdfUrl",
      "CommandPdfUrlSolo",
      "CommandDocUrlSolo",
      "CommandPdfUrlGroupSmall",
      "CommandDocUrlGroupSmall",
      "CommandPdfUrlGroupLarge",
      "CommandDocUrlGroupLarge",
      "DispatchBookPdfUrl",
    ].forEach((colName) => {
      const colIdx = findColumnIndex(headers, colName);
      if (colIdx > -1) deleteFileByUrl(row[colIdx]);
    });
  }
}
// ==================================================================
// === HYBRID DOC & PDF GENERATION FUNCTIONS (แก้ไขแล้ว) ===========
// ==================================================================

function generateCommand(data) {
  try {
    // ✅ แก้ไข GAS-BUG-005: ตรวจสอบ data.id ก่อนใช้ .split() เพื่อป้องกัน TypeError
    if (!data || !data.id)
      return {
        status: "error",
        message: "ไม่พบรหัสเอกสาร (data.id is required)",
      };

    // 1. เลือก Template ID
    let templateId = COMMAND_TEMPLATE_SOLO_ID;
    if (data.templateType === "groupSmall")
      templateId = COMMAND_TEMPLATE_GROUP_SMALL_ID;
    if (data.templateType === "groupLarge")
      templateId = COMMAND_TEMPLATE_GROUP_LARGE_ID;

    const docNumber = data.id.split("/")[0].replace("บค", "");
    const filePrefix = `คำสั่ง_${data.templateType}`;

    // 2. เรียกฟังก์ชันสร้างไฟล์
    const result = createPdfFromTemplate(
      data,
      data.id,
      docNumber,
      templateId,
      filePrefix,
    );

    // 3. ✅ คืนค่าโดยห่อใส่ object "data" (เพื่อให้หน้าเว็บอ่านเจอ)
    return {
      status: "success",
      data: {
        docUrl: result.docUrl,
        pdfUrl: result.pdfUrl,
      },
    };
  } catch (error) {
    Logger.log("generateCommand Error: " + error.message);
    return {
      status: "error",
      message: "ไม่สามารถสร้างคำสั่งได้: " + error.message,
    };
  }
}

function generateDispatch(data) {
  try {
    // ✅ แก้ไข GAS-BUG-005: ตรวจสอบ data.id ก่อนใช้ .split() เพื่อป้องกัน TypeError
    if (!data || !data.id)
      return {
        status: "error",
        message: "ไม่พบรหัสเอกสาร (data.id is required)",
      };

    const templateId = DISPATCH_BOOK_TEMPLATE_ID;
    const docNumber = data.id.split("/")[0].replace("บค", "");
    const filePrefix = "หนังสือส่ง";

    const result = createPdfFromTemplate(
      data,
      data.id,
      docNumber,
      templateId,
      filePrefix,
    );

    // ✅ คืนค่าโดยห่อใส่ object "data"
    return {
      status: "success",
      data: {
        docUrl: result.docUrl,
        pdfUrl: result.pdfUrl,
      },
    };
  } catch (error) {
    Logger.log("generateDispatch Error: " + error.message);
    return {
      status: "error",
      message: "ไม่สามารถสร้างหนังสือส่งได้: " + error.message,
    };
  }
}
// --- ฟังก์ชันสำหรับดึงข้อมูลตามปีงบประมาณ ---
function getRequestsByYear(yearBE, username) {
  var allData = getAllRequests({ year: yearBE, scope: "year" });

  var filteredData = allData.filter(function (item) {
    var userMatch = username === "ADMIN_ALL" || item.username === username;
    return userMatch;
  });

  return filteredData;
}
// --- ส่วนที่ต้องเพิ่มใน Google Apps Script (Code.gs) ---

// ⚠️ สำคัญ: ให้ไปสร้างโฟลเดอร์ใน Google Drive สำหรับเก็บ Backup แล้วเอา ID มาใส่ตรงนี้
const BACKUP_FOLDER_ID = "1CmVTM6_kkp7mXs2AsHYP3sECxDonNcT-";

function doSystemBackup() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const timeStamp = Utilities.formatDate(
      new Date(),
      "GMT+7",
      "yyyy-MM-dd_HH-mm",
    );
    const backupName = `Backup_WNY_Data_${timeStamp}`;

    if (!BACKUP_FOLDER_ID) {
      throw new Error("ยังไม่ได้ตั้งค่า BACKUP_FOLDER_ID ใน Code.gs");
    }

    // 2. เข้าถึงโฟลเดอร์ปลายทาง
    const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);

    // 3. สร้างสำเนาไฟล์ Google Sheet ไปเก็บไว้
    const backupFile = DriveApp.getFileById(ss.getId()).makeCopy(
      backupName,
      folder,
    );

    return {
      status: "success",
      message: `สำรองข้อมูลเรียบร้อยแล้ว: ${backupName}`,
      url: backupFile.getUrl(),
    };
  } catch (error) {
    Logger.log("Backup Error: " + error.toString());
    return { status: "error", message: error.toString() };
  }
}
// --- ฟังก์ชันลบบันทึกข้อความ (Memos) ---
function deleteMemo(payload) {
  const id = payload.id;
  if (!id) throw new Error("Missing Memo ID");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Memos"); // ตรวจสอบชื่อ Sheet ให้ตรง
  if (!sheet) throw new Error("Sheet 'Memos' not found");

  const data = sheet.getDataRange().getValues();
  let rowIndex = -1;

  // ค้นหาแถวที่ ID ตรงกัน (สมมติ ID อยู่คอลัมน์ A หรือ index 0)
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      rowIndex = i + 1; // แปลงเป็นเลขแถว (1-based)
      break;
    }
  }

  if (rowIndex > -1) {
    sheet.deleteRow(rowIndex);
    return { status: "success", message: "ลบบันทึกข้อความเรียบร้อยแล้ว" };
  } else {
    return { status: "error", message: "ไม่พบ ID ที่ต้องการลบ" };
  }
}
// ฟังก์ชันสำหรับรับไฟล์จาก Cloud Run มาบันทึกลง Google Drive
// ค้นหาฟังก์ชัน uploadGeneratedFile แล้วแก้เป็นแบบนี้ครับ

function uploadGeneratedFile(payload) {
  try {
    const { data, filename, mimeType, username } = payload;
    const userFolder = getOrCreateUserFolder(username || "admin");

    const blob = Utilities.newBlob(
      Utilities.base64Decode(data),
      mimeType,
      filename,
    );
    const file = userFolder.createFile(blob);

    try {
      file.setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW,
      );
    } catch (shareError) {
      Logger.log("setSharing skipped: " + shareError.message);
    }

    return {
      status: "success",
      url: file.getUrl(),
      id: file.getId(),
    };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

/**
 * ฟังก์ชันบันทึกข้อมูลหนังสือส่งแยกชีท โดยใช้ RequestId เป็นเลขอ้างอิง
 */
function saveDispatchRecord(payload) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName("DispatchRecords");

    // 1. ถ้ายังไม่มีชีท ให้สร้างอัตโนมัติพร้อมหัวข้อ
    if (!sheet) {
      sheet = ss.insertSheet("DispatchRecords");
      sheet.appendRow([
        "RequestId",
        "DispatchMonth",
        "DispatchYear",
        "StudentCount",
        "TeacherCount",
        "StayAt",
        "VehicleType",
        "VehicleId",
        "Qty1",
        "Qty2",
        "Qty3",
        "Qty4",
        "Qty5",
        "Qty6",
        "Qty7",
        "PdfUrl",
        "Timestamp",
        "CreatedBy",
      ]);
      sheet
        .getRange(1, 1, 1, 18)
        .setFontWeight("bold")
        .setBackground("#f3f3f3");
    }

    // 2. เตรียมข้อมูลบันทึก (Mapping ตามหัวข้อ)
    const rowData = [
      payload.requestId || payload.id, // ใช้ ID เดียวกันเพื่อเชื่อมโยงข้อมูล
      payload.dispatchMonth || "",
      payload.dispatchYear || "",
      payload.studentCount || 0,
      payload.teacherCount || 0,
      payload.stayAt || "-",
      payload.vehicleType || "-",
      payload.vehicleId || "-",
      payload.qty1 || "๑",
      payload.qty2 || "๑",
      payload.qty3 || "๑",
      payload.qty4 || "๑",
      payload.qty5 || "๑",
      payload.qty6 || "๑",
      payload.qty7 || "๑",
      payload.preGeneratedPdfUrl || payload.pdfUrl || "",
      new Date(),
      payload.createdby || "admin",
    ];

    sheet.appendRow(rowData);
    return {
      status: "success",
      message: "บันทึกข้อมูลลงชีท DispatchRecords สำเร็จ",
    };
  } catch (error) {
    Logger.log("Error in saveDispatchRecord: " + error.message);
    return { status: "error", message: error.message };
  }
}
function setupSpreadsheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // เพิ่ม "DispatchRecords" เข้าไปในรายการนี้
  const sheets = [
    "Users",
    "Requests",
    "Attendees",
    "Memos",
    "DraftRequests",
    "DispatchRecords",
  ];
  sheets.forEach((name) => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  Logger.log("Setup complete");
}
function adminUpdateUser(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // ป้องกันการบันทึกชนกัน

    // รับค่าจาก Frontend
    const {
      username,
      loginName,
      fullName,
      position,
      department,
      role,
      newPassword,
    } = payload;
    // username = Internal ID (ใช้ค้นหาแถว)
    // loginName = ชื่อล็อกอินใหม่ (ใช้บันทึก)

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("Users");
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const usernameCol = findColumnIndex(headers, "Username");
    const loginNameCol = findColumnIndex(headers, "LoginName");

    // 1. ตรวจสอบความซ้ำซ้อนของ Login Name ใหม่
    // (ต้องไม่ซ้ำกับ LoginName ของคนอื่น และไม่ซ้ำกับ Username ของคนอื่นด้วย เพื่อความปลอดภัย)
    for (let i = 1; i < data.length; i++) {
      const rowId = String(data[i][usernameCol]);
      const rowLogin = loginNameCol > -1 ? String(data[i][loginNameCol]) : "";

      // ข้ามแถวของตัวเอง (ถ้าเจอตัวเองให้ข้ามไป)
      if (rowId === username) continue;

      // เช็คซ้ำ
      if (rowLogin === loginName || rowId === loginName) {
        return {
          status: "error",
          message: "ชื่อล็อกอิน '" + loginName + "' มีผู้อื่นใช้งานแล้ว",
        };
      }
    }

    // 2. หาแถวและอัปเดต
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][usernameCol]) === String(username)) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1)
      return { status: "error", message: "ไม่พบข้อมูลผู้ใช้ในระบบ" };

    // ฟังก์ชันช่วยบันทึก
    const setVal = (colName, val) => {
      const col = findColumnIndex(headers, colName);
      if (col > -1) sheet.getRange(rowIndex, col + 1).setValue(val);
    };

    // บันทึกข้อมูล
    setVal("LoginName", loginName); // อัปเดตชื่อล็อกอิน
    setVal("FullName", fullName);
    setVal("Position", position);
    setVal("Department", department);
    setVal("Role", role);

    if (newPassword && newPassword.trim() !== "") {
      setVal("Password", newPassword.trim());
    }

    return { status: "success", message: "อัปเดตข้อมูลสำเร็จ" };
  } catch (error) {
    return { status: "error", message: "Update Error: " + error.message };
  } finally {
    lock.releaseLock();
  }
}
/**
 * ฟังก์ชันสำหรับอัปเดตข้อมูลใน Google Sheets
 * รองรับการ Sync ข้อมูลจากหน้าเว็บ, การอัปเดตสถานะ, และการแนบลิงก์ไฟล์
 */
function updateRequest(payload) {
  Logger.log("📥 Update Request Payload: " + JSON.stringify(payload));

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Requests");

  if (!sheet) return { status: "error", message: "ไม่พบชีต Requests" };

  // 1. ค้นหาแถวที่ต้องอัปเดตจาก RequestId
  const requestId = payload.id || payload.requestId;
  if (!requestId)
    return { status: "error", message: "Payload ไม่ระบุ RequestId" };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idColIndex = findColumnIndex(headers, "RequestId");

  if (idColIndex === -1)
    return { status: "error", message: "ไม่พบคอลัมน์ RequestId ใน Sheet" };

  const rowIndex = data.findIndex(
    (row) => String(row[idColIndex]) === String(requestId),
  );

  if (rowIndex === -1) {
    return {
      status: "error",
      message: "ไม่พบรหัสคำขอ " + requestId + " ในระบบ",
    };
  }

  const rowNum = rowIndex + 1;
  const serializedPayload = Object.assign({}, payload);
  ["travelSchedule", "dispatchMeta"].forEach((key) => {
    if (
      serializedPayload[key] !== undefined &&
      serializedPayload[key] !== null &&
      typeof serializedPayload[key] === "object"
    ) {
      serializedPayload[key] = JSON.stringify(serializedPayload[key]);
    }
  });

  // 2. สร้าง Map ของ Headers เพื่อความแม่นยำ (Key เป็นตัวเล็กหมด)
  const headerMap = {};
  headers.forEach(
    (h, i) => (headerMap[h.toLowerCase().replace(/\s+/g, "")] = i + 1),
  );

  // ฟังก์ชันช่วยเขียนข้อมูล (เช็คว่ามี Column นี้จริงไหม)
  const setVal = (key, val) => {
    const col = headerMap[key.toLowerCase().replace(/\s+/g, "")];
    if (col && val !== undefined && val !== null) {
      sheet.getRange(rowNum, col).setValue(val);
    }
  };

  const skipDynamicColumns = new Set([
    "id",
    "requestId",
    "action",
    "pdfUrl",
    "docUrl",
    "fileUrl",
    "skipPdfUrlUpdate",
    "preGeneratedPdfUrl",
    "preGeneratedDocUrl",
    "attendees",
  ]);
  const dynamicColumnsToEnsure = Object.keys(serializedPayload).filter((key) => {
    if (skipDynamicColumns.has(key)) return false;
    const val = serializedPayload[key];
    return val !== undefined && val !== null && typeof val !== "object";
  });
  if (dynamicColumnsToEnsure.length) {
    ensureSheetColumns(sheet, dynamicColumnsToEnsure);
    const refreshedHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    refreshedHeaders.forEach((h, i) => {
      headerMap[h.toLowerCase().replace(/\s+/g, "")] = i + 1;
    });
  }

  // --- 3. อัปเดตข้อมูลตาม Payload ---

  // A. ข้อมูลทั่วไป (วนลูป Key ใน Payload เพื่อความยืดหยุ่น)
  // วิธีนี้จะช่วยให้อัปเดตฟิลด์ไหนก็ได้ที่ส่งมา ถ้าชื่อตรงกับ Header
  for (const key in serializedPayload) {
    if (serializedPayload.hasOwnProperty(key)) {
      // ข้าม keys พิเศษที่จัดการแยกด้านล่าง
      if (
        ["id", "requestId", "action", "pdfUrl", "docUrl", "fileUrl"].includes(
          key,
        )
      )
        continue;

      // ✅ แก้ไข GAS-BUG-007: ข้าม Array/Object เพื่อป้องกันการบันทึก "[object Object]" ลงชีท
      let val = serializedPayload[key];
      if (typeof val === "object" && val !== null) continue;
      if (key.toLowerCase() === "province") {
        val = normalizeProvinceLabel_(val);
      }

      setVal(key, val);
    }
  }

  // --- แก้ไขช่วง B. จัดการลิงก์ไฟล์ ---
  const shouldSkipPdfUrlUpdate =
    payload.skipPdfUrlUpdate === true ||
    payload.skipPdfUrlUpdate === "true" ||
    payload.preGeneratedPdfUrl === "SKIP_GENERATION";
  const pdfUrlValue =
    payload.pdfUrl ||
    payload.fileUrl ||
    (shouldSkipPdfUrlUpdate ? "" : payload.preGeneratedPdfUrl);

  if (pdfUrlValue) {
    setVal("PdfUrl", pdfUrlValue); // ช่องหลัก
    setVal("FileUrl", pdfUrlValue); // เผื่อ Dashboard ใช้ช่องนี้
    setVal("MemoPdfUrl", pdfUrlValue); // เผื่อ Dashboard ใช้ช่องนี้

    // อัปเดต DocUrl ด้วยถ้ามี
    const docUrlValue = payload.docUrl || payload.preGeneratedDocUrl;
    if (docUrlValue) setVal("DocUrl", docUrlValue);
  }
  // C. จัดการลิงก์เฉพาะเจาะจง
  // ตรวจสอบให้แน่ใจว่าคอลัมน์ URL มีอยู่ก่อนเขียน (สำหรับแถวเก่าที่ไม่มีคอลัมน์เหล่านี้)
  const urlCols = [];
  if (payload.completedMemoUrl) urlCols.push("CompletedMemoUrl");
  if (payload.completedCommandUrl) urlCols.push("CompletedCommandUrl");
  if (payload.adminMemoUrl) urlCols.push("AdminMemoUrl");
  if (payload.dispatchBookUrl) urlCols.push("DispatchBookUrl");
  if (payload.dispatchBookPdfUrl) urlCols.push("DispatchBookPdfUrl");
  if (urlCols.length) {
    ensureSheetColumns(sheet, urlCols);
    // โหลด headerMap ใหม่หลังจาก ensureSheetColumns เผื่อมีคอลัมน์ใหม่เพิ่มเข้ามา
    const newHeaders = sheet
      .getRange(1, 1, 1, sheet.getLastColumn())
      .getValues()[0];
    newHeaders.forEach((h, i) => {
      headerMap[h.toLowerCase().replace(/\s+/g, "")] = i + 1;
    });
  }
  if (payload.completedMemoUrl)
    setVal("CompletedMemoUrl", payload.completedMemoUrl);
  if (payload.completedCommandUrl)
    setVal("CompletedCommandUrl", payload.completedCommandUrl);
  if (payload.adminMemoUrl) setVal("AdminMemoUrl", payload.adminMemoUrl);

  // หนังสือส่ง (รองรับทั้ง key: dispatchBookPdfUrl และ dispatchBookUrl)
  if (payload.dispatchBookPdfUrl)
    setVal("DispatchBookPdfUrl", payload.dispatchBookPdfUrl);
  if (payload.dispatchBookUrl)
    setVal("DispatchBookUrl", payload.dispatchBookUrl);

  // D. อัปเดตสถานะ (ถ้ามี)
  if (payload.status) setVal("Status", payload.status);
  if (payload.commandStatus) setVal("CommandStatus", payload.commandStatus);
  if (payload.docStatus) setVal("DocStatus", payload.docStatus);
  if (payload.wasRejected !== undefined)
    setVal("WasRejected", payload.wasRejected);
  if (payload.rejectionReason)
    setVal("RejectionReason", payload.rejectionReason);

  // E. อัปเดต Timestamp การแก้ไข
  setVal("Timestamp", new Date());

  syncRequestByIdToSupabase_(requestId, {
    replaceAttendees: payload.attendees !== undefined,
  });

  return {
    status: "success",
    message: "อัปเดตข้อมูล " + requestId + " เรียบร้อยแล้ว",
  };
}
function createAutoMemoRecord(requestId, username) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const memoSheet = ss.getSheetByName("Memos");
  const requestSheet = ss.getSheetByName("Requests");

  // 1. ตรวจสอบว่ามี Memo ของ Request นี้อยู่แล้วหรือยัง?
  const memoData = memoSheet.getDataRange().getValues();
  const refCol = findColumnIndex(memoData[0], "RefNumber");

  for (let i = 1; i < memoData.length; i++) {
    if (String(memoData[i][refCol]) === String(requestId)) {
      return; // มีอยู่แล้ว ไม่สร้างซ้ำ
    }
  }

  // 2. ถ้ายังไม่มี ให้สร้างใหม่
  const memoId = `MEMO-AUTO-${Date.now()}`;
  const timestamp = new Date();

  // ตั้งสถานะเป็น "รอการตรวจสอบ" หรือ "Submitted" เพื่อให้เด้งในหน้า Admin
  // แต่ไม่มี FileURL เพราะเป็น Auto
  memoSheet.appendRow([
    memoId,
    username,
    requestId,
    "รอการตรวจสอบ", // Status ที่จะทำให้ Admin เห็นปุ่มจัดการ
    timestamp,
    "", // FileID (ว่างไว้)
    "", // FileURL (ว่างไว้ เพราะรอ Admin อัปโหลดไฟล์สมบูรณ์)
    "",
    "",
    "", // ช่อง URL ไฟล์สมบูรณ์ (ว่างไว้)
  ]);

  // 3. อัปเดตสถานะใน Requests ให้รู้ว่ามีการส่ง Memo แล้ว (User จะได้ไม่ต้องกดซ้ำ)
  const reqData = requestSheet.getDataRange().getValues();
  const reqIdCol = findColumnIndex(reqData[0], "RequestId");
  const reqStatusCol = findColumnIndex(reqData[0], "Status");

  const reqRowIndex = reqData.findIndex(
    (row) => String(row[reqIdCol]) === String(requestId),
  );
  if (reqRowIndex > 0 && reqStatusCol > -1) {
    requestSheet
      .getRange(reqRowIndex + 1, reqStatusCol + 1)
      .setValue("Submitted"); // หรือ "รอการตรวจสอบ"
  }
}

// ==================================================================
// === PRIMARY DATABASE → SHEETS BATCH SYNC (สำรองข้อมูลรายเดือน) =====
// ==================================================================

/**
 * รับข้อมูล batch จากฐานข้อมูลหลักแล้วเขียนลง Google Sheets
 * เรียกผ่าน POST action: "batchSyncFromSupabase"
 * payload: { requests: [...], memos: [...], year: 2568, syncedAt: "..." }
 */
function batchSyncPrimaryDataToSheets_(payload) {
  try {
    const { requests, memos, year, syncedAt } = payload;
    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return { status: "success", message: "ไม่มีข้อมูลที่จะ sync", count: 0 };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const requestSheet = ss.getSheetByName("Requests");
    const attendeesSheet = ss.getSheetByName("Attendees");
    const memosSheet = ss.getSheetByName("Memos");
    ensureSheetColumns(requestSheet, [
      "RequestId",
      "CreatedBy",
      "DocDate",
      "RequesterName",
      "RequesterPosition",
      "Location",
      "Purpose",
      "StartDate",
      "EndDate",
      "ExpenseOption",
      "ExpenseItems",
      "TotalExpense",
      "VehicleOption",
      "LicensePlate",
      "Department",
      "HeadName",
      "PdfUrl",
      "DocUrl",
      "CommandPdfUrl",
      "CommandStatus",
      "Status",
      "DispatchBookPdfUrl",
      "Province",
      "StayAt",
      "CompletedMemoUrl",
      "Timestamp",
      "SyncedFromPrimaryStore",
      "PrimaryStoreSyncedAt",
    ]);
    ensureSheetColumns(attendeesSheet, ["RequestId", "FullName", "Position", "DocDate"]);
    ensureSheetColumns(memosSheet, [
      "MemoID",
      "SubmittedBy",
      "RefNumber",
      "Status",
      "Timestamp",
      "FileID",
      "FileURL",
      "CompletedMemoUrl",
      "CompletedCommandUrl",
      "DispatchBookUrl",
    ]);

    const headers = requestSheet
      .getRange(1, 1, 1, requestSheet.getLastColumn())
      .getValues()[0];
    const idCol = findColumnIndex(headers, "RequestId");

    // อ่านข้อมูลที่มีอยู่ใน Sheet ทั้งหมด (เพื่อเช็คว่ามีแถวนี้แล้วหรือยัง)
    const existingData = requestSheet.getDataRange().getValues();
    const existingIds = new Set();
    for (let i = 1; i < existingData.length; i++) {
      if (existingData[i][idCol])
        existingIds.add(String(existingData[i][idCol]).trim());
    }

    let upsertedCount = 0;
    let insertedCount = 0;
    let attendeeCount = 0;
    let memoUpsertedCount = 0;
    const syncedRequestIds = new Set();

    for (const req of requests) {
      const requestId = req.id || req.requestId;
      if (!requestId) continue;
      syncedRequestIds.add(String(requestId).trim());

      const formatDate = (d) => {
        if (!d) return "";
        try {
          return Utilities.formatDate(
            new Date(d),
            "Asia/Bangkok",
            "yyyy-MM-dd",
          );
        } catch (e) {
          return d;
        }
      };

      const rowObject = {
        requestid: requestId,
        createdby: req.username || req.createdby || "",
        docdate: formatDate(req.docDate),
        requestername: req.requesterName || "",
        requesterposition: req.requesterPosition || "",
        location: req.location || "",
        purpose: req.purpose || "",
        startdate: formatDate(req.startDate),
        enddate: formatDate(req.endDate),
        expenseoption: req.expenseOption || "",
        expenseitems:
          typeof req.expenseItems === "object"
            ? JSON.stringify(req.expenseItems)
            : req.expenseItems || "",
        totalexpense: Number(req.totalExpense) || 0,
        vehicleoption: req.vehicleOption || "",
        licenseplate: req.licensePlate || "",
        department: req.department || "",
        headname: req.headName || "",
        pdfurl: req.pdfUrl || req.fileUrl || req.memoPdfUrl || "",
        docurl: req.docUrl || req.gasDocUrl || "",
        commandpdfurl: req.commandPdfUrl || req.commandBookUrl || "",
        commandstatus: req.commandStatus || "",
        status: req.status || "กำลังดำเนินการ",
        dispatchbookpdfurl: req.dispatchBookUrl || req.dispatchBookPdfUrl || "",
        province: normalizeProvinceLabel_(req.province || ""),
        stayat: req.stayAt || "",
        completedmemourl: req.completedMemoUrl || "",
        timestamp: formatDate(req.timestamp || req.docDate),
        syncedfromprimarystore: "TRUE",
        primarystoresyncedat: syncedAt || new Date().toISOString(),
      };

      let existingRowMap = {};
      if (existingIds.has(requestId)) {
        const existingRowIdx = existingData.findIndex(
          (r) => String(r[idCol]).trim() === requestId,
        );
        if (existingRowIdx > 0) {
          headers.forEach((header, index) => {
            existingRowMap[header.toLowerCase().replace(/\s+/g, "")] =
              existingData[existingRowIdx][index];
          });
        }
      }

      const rowData = headers.map((h) => {
        const key = h.toLowerCase().replace(/\s+/g, "");
        const incoming = rowObject[key];
        const current = existingRowMap[key];

        if (incoming === undefined || incoming === null || incoming === "") {
          return current !== undefined ? current : "";
        }
        return incoming;
      });

      if (existingIds.has(requestId)) {
        // Update แถวที่มีอยู่แล้ว
        const rowIdx = existingData.findIndex(
          (r) => String(r[idCol]).trim() === requestId,
        );
        if (rowIdx > 0) {
          requestSheet
            .getRange(rowIdx + 1, 1, 1, rowData.length)
            .setValues([rowData]);
          upsertedCount++;
        }
      } else {
        // Insert แถวใหม่
        requestSheet.appendRow(rowData);
        existingIds.add(requestId);
        insertedCount++;
      }
    }

    if (attendeesSheet && syncedRequestIds.size > 0) {
      const attendeeData = attendeesSheet.getDataRange().getValues();
      const attendeeHeaders = attendeeData[0] || [];
      const attendeeRequestIdCol = findColumnIndex(attendeeHeaders, "RequestId");

      if (attendeeRequestIdCol > -1) {
        const rowsToDelete = [];
        for (let i = 1; i < attendeeData.length; i++) {
          const rowRequestId = String(attendeeData[i][attendeeRequestIdCol] || "").trim();
          if (syncedRequestIds.has(rowRequestId)) rowsToDelete.push(i + 1);
        }
        for (let i = rowsToDelete.length - 1; i >= 0; i--) {
          attendeesSheet.deleteRow(rowsToDelete[i]);
        }
      }

      const formatDate = (d) => {
        if (!d) return "";
        try {
          return Utilities.formatDate(new Date(d), "Asia/Bangkok", "yyyy-MM-dd");
        } catch (e) {
          return "";
        }
      };

      const attendeeRows = [];
      requests.forEach((req) => {
        const requestId = String(req.id || req.requestId || "").trim();
        if (!requestId) return;

        let attendees = req.attendees || [];
        if (typeof attendees === "string") {
          try {
            attendees = JSON.parse(attendees);
          } catch (e) {
            attendees = [];
          }
        }
        if (!Array.isArray(attendees)) return;

        attendees.forEach((att) => {
          const fullName = String(att?.name || att?.fullName || att?.["ชื่อ-นามสกุล"] || "").trim();
          const position = String(att?.position || att?.["ตำแหน่ง"] || "").trim();
          if (!fullName) return;
          attendeeRows.push([requestId, fullName, position, formatDate(req.docDate)]);
        });
      });

      if (attendeeRows.length > 0) {
        attendeesSheet
          .getRange(attendeesSheet.getLastRow() + 1, 1, attendeeRows.length, attendeeRows[0].length)
          .setValues(attendeeRows);
      }
      attendeeCount = attendeeRows.length;
    }

    if (memosSheet && Array.isArray(memos) && memos.length > 0) {
      const memoHeaders = memosSheet.getRange(1, 1, 1, memosSheet.getLastColumn()).getValues()[0];
      const memoData = memosSheet.getDataRange().getValues();
      const refNumberCol = findColumnIndex(memoHeaders, "RefNumber");
      const memoIndex = new Map();

      if (refNumberCol > -1) {
        for (let i = 1; i < memoData.length; i++) {
          const refNumber = String(memoData[i][refNumberCol] || "").trim();
          if (refNumber) memoIndex.set(refNumber, i + 1);
        }
      }

      const formatDateTime = (d) => {
        if (!d) return "";
        try {
          return Utilities.formatDate(new Date(d), "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ss");
        } catch (e) {
          return d;
        }
      };

      memos.forEach((memo) => {
        const refNumber = String(memo.refNumber || memo.id || "").trim();
        if (!refNumber) return;

        const rowObject = {
          memoid: memo.memoId || memo.id || `MEMO-${refNumber}`,
          submittedby: memo.submittedBy || memo.username || "",
          refnumber: refNumber,
          status: memo.status || "",
          timestamp: formatDateTime(memo.timestamp || memo.lastUpdated || syncedAt),
          fileid: memo.fileId || "",
          fileurl: memo.fileURL || memo.fileUrl || memo.pdfUrl || memo.completedMemoUrl || "",
          completedmemourl: memo.completedMemoUrl || "",
          completedcommandurl: memo.completedCommandUrl || "",
          dispatchbookurl: memo.dispatchBookUrl || "",
        };

        const rowData = memoHeaders.map((h) => {
          const key = h.toLowerCase().replace(/\s+/g, "");
          return rowObject[key] !== undefined ? rowObject[key] : "";
        });

        const existingRow = memoIndex.get(refNumber);
        if (existingRow) {
          memosSheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
        } else {
          memosSheet.appendRow(rowData);
        }
        memoUpsertedCount++;
      });
    }

    Logger.log(
      `✅ Batch sync complete: ${insertedCount} inserted, ${upsertedCount} updated, ${attendeeCount} attendees, ${memoUpsertedCount} memos`,
    );
    return {
      status: "success",
      message: `Sync เสร็จสิ้น: Requests เพิ่มใหม่ ${insertedCount} รายการ, อัปเดต ${upsertedCount} รายการ, Attendees ${attendeeCount} รายการ, Memos ${memoUpsertedCount} รายการ`,
      inserted: insertedCount,
      updated: upsertedCount,
      attendees: attendeeCount,
      memos: memoUpsertedCount,
      total: insertedCount + upsertedCount,
    };
  } catch (error) {
    Logger.log("batchSyncPrimaryDataToSheets_ Error: " + error.message);
    return { status: "error", message: error.message };
  }
}

function batchSyncFromSupabase(payload) {
  return batchSyncPrimaryDataToSheets_(payload);
}

function batchSyncFromFirestore(payload) {
  return batchSyncPrimaryDataToSheets_(payload);
}

/**
 * ตั้งค่า Time Trigger สำรองข้อมูลอัตโนมัติทุกเดือน (ทุกวันที่ 1 เวลา 02:00)
 * รัน setupMonthlyBackupTrigger() ครั้งเดียวใน GAS Editor เพื่อติดตั้ง Trigger
 */
function setupMonthlyBackupTrigger() {
  // ลบ trigger เก่าที่มีชื่อเดียวกัน (ป้องกัน duplicate)
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === "runMonthlyBackupEmail") {
      ScriptApp.deleteTrigger(t);
    }
  }
  // สร้าง trigger ใหม่: ทุกวันที่ 1 ของเดือน เวลา 02:00-03:00
  ScriptApp.newTrigger("runMonthlyBackupEmail")
    .timeBased()
    .onMonthDay(1)
    .atHour(2)
    .create();
  Logger.log(
    "✅ Monthly backup trigger created (runs on 1st of each month at 2am)",
  );
}

/**
 * ส่งอีเมลแจ้งเตือน Admin ให้กด "สำรองข้อมูล" ทุกต้นเดือน
 * (ระบบใช้ฐานข้อมูลหลักผ่าน Web App แล้วค่อยสำรองกลับมา Sheets ตามรอบ)
 */
function runMonthlyBackupEmail() {
  try {
    const admins = getAdminEmails();
    if (admins.length === 0) {
      Logger.log("No admin emails found for monthly backup notification");
      return;
    }
    const monthNames = [
      "มกราคม",
      "กุมภาพันธ์",
      "มีนาคม",
      "เมษายน",
      "พฤษภาคม",
      "มิถุนายน",
      "กรกฎาคม",
      "สิงหาคม",
      "กันยายน",
      "ตุลาคม",
      "พฤศจิกายน",
      "ธันวาคม",
    ];
    const now = new Date();
    const monthTH = monthNames[now.getMonth()];
    const yearBE = now.getFullYear() + 543;

    const subject = `[WNY App] แจ้งเตือน: กรุณาสำรองข้อมูลประจำเดือน ${monthTH} ${yearBE}`;
    const body = `
      <div style="font-family: 'Sarabun', sans-serif; max-width: 600px;">
        <h2 style="color: #4f46e5;">แจ้งเตือนสำรองข้อมูลรายเดือน</h2>
        <p>ถึงผู้ดูแลระบบ WNY App,</p>
        <p>ถึงเวลาสำรองข้อมูลประจำเดือน <strong>${monthTH} ${yearBE}</strong> แล้ว</p>
        <p>กรุณาเข้าสู่ระบบและคลิกปุ่ม <strong>"สำรองข้อมูลจาก Supabase → Sheets"</strong> ในหน้า Admin เพื่อบันทึกข้อมูลล่าสุดกลับไปยัง Google Sheets</p>
        <p style="color: #6b7280; font-size: 0.9em;">อีเมลนี้ส่งอัตโนมัติทุกวันที่ 1 ของเดือน</p>
      </div>
    `;
    admins.forEach((email) => {
      try {
        MailApp.sendEmail({
          to: email,
          subject,
          htmlBody: body,
          name: "ระบบ WNY App",
        });
      } catch (e) {
        Logger.log("Email failed for " + email + ": " + e.message);
      }
    });
    Logger.log(
      "✅ Monthly backup reminder emails sent to: " + admins.join(", "),
    );
  } catch (error) {
    Logger.log("runMonthlyBackupEmail Error: " + error.message);
  }
}
// ==================================================================
// === ARCHIVE & YEARLY BACKUP EMAIL ================================
// ==================================================================

/**
 * ดึงข้อมูลทั้งหมดในปี (พ.ศ.) จาก Google Sheets สำหรับ archive page
 * ไม่ต้อง login — ข้อมูลเฉพาะ field ที่จำเป็น (ไม่ส่ง personal data เกิน)
 */
function getArchiveRequests(yearParam) {
  const yearBE = yearParam
    ? parseInt(yearParam)
    : new Date().getFullYear() + 543;
  const cacheKey = buildCacheKey_(["archive-requests", String(yearBE)]);
  const cached = readJsonCache_(cacheKey);
  if (cached) return cached;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName("Requests");
  if (!sheet) return [];

  const yearAD = yearBE - 543;
  const yearStr = String(yearBE);

  // --- JOIN กับ Memos sheet เหมือน getAllRequests() ---
  // เพื่อดึง URL ไฟล์ที่แอดมินอัพโหลด (adminMemoUrl / completedCommandUrl / dispatchBookUrl)
  // ที่อาจเก็บอยู่ใน Memos sheet แต่ยังไม่ sync ไปยัง Requests sheet
  const memoIndex = {};
  const memosSheet = ss.getSheetByName("Memos");
  if (memosSheet) {
    sheetToObject(memosSheet).forEach((memo) => {
      const key = String(memo.refNumber || memo.id || "").trim();
      if (key) memoIndex[key] = memo;
    });
  }

  const rows = sheetToObject(sheet);
  const result = rows
    .filter((r) => {
      // กรองตามปี พ.ศ. จาก id (บค001/2568) หรือ docDate (2025-xx-xx)
      if (r.id && String(r.id).includes("/" + yearStr)) return true;
      if (r.docDate && String(r.docDate).startsWith(String(yearAD)))
        return true;
      return false;
    })
    .map((r) => {
      // --- เติม URL จาก Memos sheet ถ้า Requests sheet ยังไม่มี ---
      const memo = memoIndex[String(r.id || "").trim()];
      if (memo) {
        if (!r.adminMemoUrl && memo.completedMemoUrl)
          r.adminMemoUrl = memo.completedMemoUrl;
        if (!r.completedMemoUrl && memo.completedMemoUrl)
          r.completedMemoUrl = memo.completedMemoUrl;
        if (!r.completedCommandUrl && memo.completedCommandUrl)
          r.completedCommandUrl = memo.completedCommandUrl;
        if (!r.dispatchBookUrl && memo.dispatchBookUrl)
          r.dispatchBookUrl = memo.dispatchBookUrl;
        // status จาก Memos ถ้า Requests ยังไม่มี
        if (!r.status || r.status === "กำลังดำเนินการ") {
          if (memo.status) r.status = memo.status;
        }
      }
      return {
        id: r.id || "",
        requesterName: r.requesterName || r.username || "",
        purpose: r.purpose || "",
        location: r.location || "",
        docDate: r.docDate || "",
        startDate: r.startDate || "",
        endDate: r.endDate || "",
        status: r.status || "",
        commandStatus: r.commandStatus || "",
        pdfUrl: r.pdfUrl || "",
        completedMemoUrl: r.completedMemoUrl || "",
        completedCommandUrl: r.completedCommandUrl || "",
        adminMemoUrl: r.adminMemoUrl || "",
        dispatchBookUrl: r.dispatchBookUrl || "",
      };
    });

  return writeJsonCache_(cacheKey, result, ARCHIVE_CACHE_TTL_SEC);
}

/**
 * ส่ง Email สรุปข้อมูลประจำปี พร้อม link ดาวน์โหลดไฟล์ทุกรายการ
 * รับ payload: { year, email, requests: [...] }
 */
function sendYearlyBackupEmail(payload) {
  const year = payload.year || new Date().getFullYear() + 543;
  const toEmail = payload.email;
  const requests = payload.requests || [];

  if (!toEmail) throw new Error("ไม่ระบุ email ปลายทาง");
  if (!requests.length)
    return { status: "success", message: "ไม่มีข้อมูลในปี " + year };

  // --- สร้าง CSV attachment ---
  const csvHeader =
    "เลขที่,ชื่อผู้ขอ,วัตถุประสงค์,สถานที่,วันที่,สถานะ,บันทึก (URL),คำสั่ง (URL),หนังสือส่ง (URL)";
  const csvRows = requests.map((r) =>
    [
      r.id,
      r.requesterName,
      r.purpose,
      r.location,
      r.docDate,
      r.status,
      r.completedMemoUrl || r.adminMemoUrl || r.pdfUrl,
      r.completedCommandUrl,
      r.dispatchBookUrl,
    ]
      .map((v) => '"' + String(v || "").replace(/"/g, '""') + '"')
      .join(","),
  );
  const csvContent = "\uFEFF" + csvHeader + "\n" + csvRows.join("\n"); // BOM สำหรับ Excel ภาษาไทย
  const csvBlob = Utilities.newBlob(
    csvContent,
    "text/csv",
    "backup_" + year + ".csv",
  );

  // --- สร้าง HTML email ---
  const statsTotal = requests.length;
  const statsComplete = requests.filter(
    (r) =>
      r.status &&
      (r.status.includes("เสร็จสิ้น") || r.status.includes("รับไฟล์")),
  ).length;
  const statsFiles = requests.filter(
    (r) =>
      r.completedMemoUrl ||
      r.adminMemoUrl ||
      r.completedCommandUrl ||
      r.dispatchBookUrl,
  ).length;

  const tableRows = requests
    .map((r, i) => {
      const fileLinks = [];
      if (r.pdfUrl)
        fileLinks.push(
          '<a href="' + r.pdfUrl + '" style="color:#2563eb">📄 บันทึก</a>',
        );
      if (r.completedMemoUrl && r.completedMemoUrl !== r.pdfUrl)
        fileLinks.push(
          '<a href="' +
            r.completedMemoUrl +
            '" style="color:#2563eb">📄 บันทึก (ส่ง)</a>',
        );
      if (r.adminMemoUrl)
        fileLinks.push(
          '<a href="' +
            r.adminMemoUrl +
            '" style="color:#16a34a">📩 แอดมินส่งให้</a>',
        );
      if (r.completedCommandUrl)
        fileLinks.push(
          '<a href="' +
            r.completedCommandUrl +
            '" style="color:#7c3aed">📋 คำสั่ง</a>',
        );
      if (r.dispatchBookUrl)
        fileLinks.push(
          '<a href="' +
            r.dispatchBookUrl +
            '" style="color:#b45309">📦 หนังสือส่ง</a>',
        );

      const rowBg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      return (
        '<tr style="background:' +
        rowBg +
        '">' +
        '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap">' +
        escapeHtmlGAS(r.id) +
        "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">' +
        escapeHtmlGAS(r.requesterName) +
        "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;max-width:220px">' +
        escapeHtmlGAS(r.purpose) +
        "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap">' +
        escapeHtmlGAS(r.docDate) +
        "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">' +
        escapeHtmlGAS(r.status) +
        "</td>" +
        '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-size:12px;line-height:1.8">' +
        (fileLinks.length
          ? fileLinks.join("<br>")
          : '<span style="color:#94a3b8">ไม่มีไฟล์</span>') +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  const archiveUrl =
    "https://wnyxmanagementgroup.github.io/wnyhq2/archive/?year=" + year;

  const htmlBody = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Sarabun,Arial,sans-serif;background:#f1f5f9;margin:0;padding:20px">
<div style="max-width:860px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);overflow:hidden">
  <div style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:28px 32px;color:#fff">
    <h1 style="margin:0;font-size:22px">💾 สำรองข้อมูลไปราชการ ปี พ.ศ. ${year}</h1>
    <p style="margin:8px 0 0;opacity:.85;font-size:14px">จัดทำโดยระบบบริหารงานบุคคล — ส่งอัตโนมัติเมื่อ Admin กดสำรองข้อมูล</p>
  </div>
  <div style="padding:24px 32px">
    <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 20px;flex:1;min-width:120px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#1d4ed8">${statsTotal}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">รายการทั้งหมด</div>
      </div>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 20px;flex:1;min-width:120px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#16a34a">${statsComplete}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">เสร็จสิ้น</div>
      </div>
      <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px 20px;flex:1;min-width:120px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#7c3aed">${statsFiles}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">รายการที่มีไฟล์</div>
      </div>
    </div>
    <p style="margin:0 0 8px;font-size:14px;color:#374151">
      ไฟล์ CSV แนบมาด้วยในอีเมลนี้ — สามารถเปิดใน Excel หรือ Google Sheets ได้ทันที
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#374151">
      หรือเปิด <a href="${archiveUrl}" style="color:#2563eb;font-weight:600">หน้าค้นหาคลังข้อมูล ↗</a> เพื่อค้นหาและดาวน์โหลดไฟล์แต่ละรายการ
    </p>
    <div style="overflow-x:auto;border-radius:8px;border:1px solid #e2e8f0">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8fafc">
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;white-space:nowrap">เลขที่</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">ชื่อ</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">วัตถุประสงค์</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;white-space:nowrap">วันที่เอกสาร</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">สถานะ</th>
            <th style="padding:10px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0">ดาวน์โหลดไฟล์</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>
  <div style="background:#f8fafc;padding:16px 32px;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0">
    สร้างโดยระบบบริหารงานบุคคลอัตโนมัติ | ข้อมูล ณ วันที่ ${Utilities.formatDate(new Date(), "Asia/Bangkok", "dd/MM/yyyy HH:mm")} น.
  </div>
</div>
</body></html>`;

  MailApp.sendEmail({
    to: toEmail,
    subject:
      "[สำรองข้อมูล] รายการไปราชการประจำปี พ.ศ. " +
      year +
      " (" +
      requests.length +
      " รายการ)",
    htmlBody: htmlBody,
    attachments: [csvBlob],
    name: "ระบบบริหารงานบุคคล",
  });

  Logger.log(
    "📧 Backup email sent to: " +
      toEmail +
      " | year: " +
      year +
      " | count: " +
      requests.length,
  );
  return {
    status: "success",
    message:
      "ส่ง Email สำรองข้อมูลปี " +
      year +
      " จำนวน " +
      requests.length +
      " รายการเรียบร้อยแล้ว",
  };
}

/** escape HTML สำหรับใช้ใน email body */
function escapeHtmlGAS(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
