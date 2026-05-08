const fs = require("node:fs/promises");
const path = require("node:path");

const FIREBASE_API_KEY = "AIzaSyDy_ucbp_8R_o3O4cZY_TPesbkptUERn2E";
const MAIN_GAS_URL =
  "https://script.google.com/macros/s/AKfycbxRK-XX8Kk4TdMPRSa1Wy9fu9obubLQ1uPmBmd-S4QTQiAe2zKgU6v3_i1UtTpIjpJW/exec";
const PDF_PROXY_GAS_URL =
  "https://script.google.com/macros/s/AKfycbyyUHx5gy7SFow_xex1Jt8TorLaWpxIgoYausg9z8QuSfoL8g_1r5on104A2m-PbGIWpA/exec";
const PDF_ENGINE_URL =
  "https://wny-pdf-engine-660310608742.asia-southeast1.run.app/forms/libreoffice/convert";
const PUBLIC_SITE_URL = "https://wnyxmanagementgroup.github.io/wnyhq2/";
const APP_URL = "https://wnyxmanagementgroup.github.io/wnyhq2/app/";
const ARCHIVE_URL = "https://wnyxmanagementgroup.github.io/wnyhq2/archive/?year=2569";
const DOC_TEMPLATE_ID = "1gdx9k0Vbea_CIwOJwB4l0E_H-ePDSz3qN_jmBv9VW6c";

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

function formatMs(ms) {
  return `${Math.round(ms)}ms`;
}

async function timedStep(name, fn) {
  const started = Date.now();
  try {
    const details = await fn();
    return {
      name,
      status: "PASS",
      elapsedMs: Date.now() - started,
      details,
    };
  } catch (error) {
    return {
      name,
      status: "FAIL",
      elapsedMs: Date.now() - started,
      details: error.message,
    };
  }
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  ok(response.ok, `HTTP ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url, options) {
  const response = await fetch(url, options);
  ok(response.ok, `HTTP ${response.status} ${response.statusText}`);
  return response.text();
}

async function checkPage(url, expectedText) {
  const html = await fetchText(url);
  ok(html.includes(expectedText), `missing expected text: ${expectedText}`);
  return `found "${expectedText}"`;
}

async function main() {
  const templatePath = path.join(process.cwd(), "template_command_solo.docx");
  const results = [];

  results.push(await timedStep("GitHub Pages main", async () => {
    return checkPage(PUBLIC_SITE_URL, "WNY");
  }));

  results.push(await timedStep("GitHub Pages app", async () => {
    return checkPage(APP_URL, "เข้าสู่ระบบ");
  }));

  results.push(await timedStep("GitHub Pages archive", async () => {
    return checkPage(ARCHIVE_URL, "คลังข้อมูลไปราชการ");
  }));

  results.push(await timedStep("GAS getMaxRequestSeq", async () => {
    const json = await fetchJson(
      `${MAIN_GAS_URL}?action=getMaxRequestSeq&year=2569`,
    );
    ok(json.status === "success", "unexpected GAS status");
    ok(json.data && json.data.status === "success", "missing nested success");
    return `maxSeq=${json.data.maxSeq}`;
  }));

  results.push(await timedStep("GAS getArchiveRequests", async () => {
    const json = await fetchJson(
      `${MAIN_GAS_URL}?action=getArchiveRequests&year=2569`,
    );
    ok(json.status === "success", "unexpected GAS status");
    ok(Array.isArray(json.data), "archive data is not an array");
    ok(json.data.length > 0, "archive returned no rows");
    return `items=${json.data.length}`;
  }));

  results.push(await timedStep("GAS public weekly snapshot", async () => {
    const response = await fetch(
      `${MAIN_GAS_URL}?action=getPublicWeeklySnapshot`,
    );
    if (response.ok) {
      const json = await response.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        return `items=${json.data.length} (optimized endpoint)`;
      }
    }

    const [requestsJson, memosJson] = await Promise.all([
      fetchJson(`${MAIN_GAS_URL}?action=getAllRequests`),
      fetchJson(`${MAIN_GAS_URL}?action=getAllMemos`),
    ]);
    ok(requestsJson.status === "success", "legacy getAllRequests failed");
    ok(Array.isArray(requestsJson.data), "legacy requests data is not an array");
    ok(memosJson.status === "success", "legacy getAllMemos failed");
    ok(Array.isArray(memosJson.data), "legacy memos data is not an array");
    return `requests=${requestsJson.data.length}, memos=${memosJson.data.length} (legacy fallback)`;
  }));

  results.push(await timedStep("GAS PDF proxy", async () => {
    const json = await fetchJson(
      `${PDF_PROXY_GAS_URL}?action=getPdfBase64&fileId=${DOC_TEMPLATE_ID}`,
    );
    ok(json.status === "success", "unexpected GAS status");
    ok(typeof json.data === "string" && json.data.length > 1000, "base64 payload too small");
    return `base64Length=${json.data.length}`;
  }));

  results.push(await timedStep("Cloud Run PDF convert", async () => {
    const bytes = await fs.readFile(templatePath);
    const form = new FormData();
    form.append(
      "files",
      new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "template_command_solo.docx",
    );

    const response = await fetch(PDF_ENGINE_URL, {
      method: "POST",
      body: form,
    });
    ok(response.ok, `HTTP ${response.status} ${response.statusText}`);
    const pdfBytes = new Uint8Array(await response.arrayBuffer());
    ok(
      String.fromCharCode(...pdfBytes.slice(0, 4)) === "%PDF",
      "response is not a PDF",
    );
    return `pdfBytes=${pdfBytes.length}`;
  }));

  let anonIdToken = null;

  results.push(await timedStep("Firebase anonymous auth", async () => {
    const json = await fetchJson(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    );
    ok(json.idToken, "missing idToken");
    anonIdToken = json.idToken;
    return `localId=${json.localId}`;
  }));

  results.push(await timedStep("Firestore settings read", async () => {
    const json = await fetchJson(
      "https://firestore.googleapis.com/v1/projects/wny-hq/databases/(default)/documents/settings?pageSize=1",
    );
    ok(Array.isArray(json.documents) && json.documents.length > 0, "no settings documents");
    return `docs=${json.documents.length}`;
  }));

  results.push(await timedStep("Firebase Storage auth path", async () => {
    ok(anonIdToken, "anonymous auth token unavailable");
    const response = await fetch(
      "https://firebasestorage.googleapis.com/v0/b/wny-hq/o/memos%2Fconnectivity-check%2Fnope.pdf",
      {
        headers: {
          Authorization: `Bearer ${anonIdToken}`,
        },
      },
    );
    ok(response.status === 404, `expected 404 for missing test object, got ${response.status}`);
    return "storage endpoint reachable";
  }));

  let hasFailure = false;
  console.log("Smoke check results");
  for (const result of results) {
    console.log(
      `${result.status.padEnd(4)} ${result.name} (${formatMs(result.elapsedMs)}) - ${result.details}`,
    );
    if (result.status === "FAIL") hasFailure = true;
  }

  if (hasFailure) {
    process.exitCode = 1;
    return;
  }

  console.log("All smoke checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
