// ============================================================
// ระบบสารบรรณ — 2 โหมด
//
//  command : ออกเลขที่ + วันที่
//            พิมพ์ข้อความ → preview ลอยบน PDF → ลากวางตำแหน่ง
//            ตัวเลขทุกตัวแปลงเป็นเลขไทยอัตโนมัติ, ฟอนต์ 16
//
//  memo    : ตรวจสอบบันทึกข้อความแล้วส่งผู้อำนวยการ
//            เปิด PDF → กดยืนยัน (ไม่ต้องพิมพ์อะไร)
//
// รองรับทั้ง Dashboard (login) และ Token Link (ไม่ login)
// ============================================================

let sarabanState = {
    pdfBytes:    null,
    docId:       null,
    docType:     'command',   // 'command' | 'memo' | 'dispatch'
    scale:       1.5,
    overlayNum:  null,        // DOM element ข้อความเลขที่
    overlayDate: null,        // DOM element ข้อความวันที่
    pdfUrl:      null,        // URL ดู PDF (ใช้ใน memo mode)
};

function sarabanNeedsNumbering(docType) {
    return docType === 'command' || docType === 'dispatch';
}

function getSarabanDocLabel(docType) {
    if (docType === 'dispatch') return 'หนังสือส่ง';
    if (docType === 'command') return 'คำสั่งไปราชการ';
    return 'บันทึกข้อความ';
}

function getSarabanNumberingLabels(docType) {
    if (docType === 'dispatch') {
        return {
            title: '📦 งานสารบรรณ: ออกเลขหนังสือส่งและวันที่',
            numLabel: 'เลขที่หนังสือส่ง:',
            numPlaceholder: 'เช่น ศธ 04001/1234',
            dateLabel: 'วันที่หนังสือส่ง:',
            datePlaceholder: 'เช่น 29 เมษายน 2569',
            instruction: '👉 พิมพ์เลขหนังสือส่งและวันที่ด้านบน — ข้อความจะปรากฏบน PDF ให้ลากวางตำแหน่งที่ต้องการ',
            previewButton: '👁️ ดูตัวอย่างหนังสือส่ง',
            successPrefix: 'ออกเลขหนังสือส่ง'
        };
    }

    return {
        title: '📝 งานสารบรรณ: ออกเลขคำสั่งและวันที่',
        numLabel: 'เลขที่คำสั่ง:',
        numPlaceholder: 'เช่น 123/2569',
        dateLabel: 'วันที่คำสั่ง:',
        datePlaceholder: 'เช่น 29 เมษายน 2569',
        instruction: '👉 พิมพ์เลขคำสั่งและวันที่ด้านบน — ข้อความจะปรากฏบน PDF ให้ลากวางตำแหน่งที่ต้องการ',
        previewButton: '👁️ ดูตัวอย่างคำสั่ง',
        successPrefix: 'ออกเลขคำสั่ง'
    };
}

function buildSarabanRequestUpdate(newPdfUrl, user, docNum = '', docDate = '') {
    const update = {
        docStatus:        'waiting_director',
        docType:          sarabanState.docType,
        activeApprovalDocType: sarabanState.docType,
        currentPdfUrl:    newPdfUrl,
        lastUpdated:      new Date().toISOString(),
    };

    if (docNum) update.sarabanDocNum = docNum;
    if (docDate) update.sarabanDocDate = docDate;

    if (sarabanNeedsNumbering(sarabanState.docType)) {
        update.sarabanStampedAt = new Date().toISOString();
        update.sarabanStampedBy = user?.name || user?.username || 'saraban';
    } else {
        update.sarabanVerifiedAt = new Date().toISOString();
        update.sarabanVerifiedBy = user?.name || user?.username || 'saraban';
    }

    if (sarabanState.docType === 'dispatch') {
        update.dispatchBookUrl = newPdfUrl;
        update.dispatchBookPdfUrl = newPdfUrl;
        update.dispatchStatus = 'waiting_director';
    } else if (sarabanState.docType === 'command') {
        update.commandPdfUrl = newPdfUrl;
        update.commandStatus = 'waiting_director';
    } else {
        update.pdfUrl = newPdfUrl;
        update.memoPdfUrl = newPdfUrl;
        update.completedMemoUrl = newPdfUrl;
    }

    return update;
}

function buildSarabanSheetPayload(newPdfUrl, docNum = '', docDate = '') {
    const payload = {
        requestId: sarabanState.docId,
        docStatus: 'waiting_director',
        docType: sarabanState.docType,
        activeApprovalDocType: sarabanState.docType,
        currentPdfUrl: newPdfUrl,
    };

    if (docNum) payload.refNumber = docNum;
    if (docDate) payload.sarabanDocDate = docDate;

    if (sarabanState.docType === 'dispatch') {
        payload.dispatchBookUrl = newPdfUrl;
        payload.dispatchBookPdfUrl = newPdfUrl;
        payload.dispatchStatus = 'waiting_director';
    } else if (sarabanState.docType === 'command') {
        payload.commandPdfUrl = newPdfUrl;
        payload.commandStatus = 'waiting_director';
    } else {
        payload.pdfUrl = newPdfUrl;
        payload.completedMemoUrl = newPdfUrl;
    }

    return payload;
}

// ============================================================
// 1. เปิด Modal
// ============================================================
async function openSarabanModal(pdfDataBytes, documentId, docType = 'command', pdfUrl = null) {
    sarabanState.pdfBytes    = pdfDataBytes;
    sarabanState.docId       = documentId;
    sarabanState.docType     = docType;
    sarabanState.pdfUrl      = pdfUrl;
    sarabanState.overlayNum  = null;
    sarabanState.overlayDate = null;

    // ล้าง overlays เก่า
    document.getElementById('saraban-pdf-container')
        .querySelectorAll('.saraban-overlay').forEach(el => el.remove());

    // รีเซ็ต input
    document.getElementById('saraban-doc-num').value  = '';
    document.getElementById('saraban-doc-date').value = '';

    // ตั้ง UI ตาม docType
    _setSarabanMode(docType, pdfUrl);

    // แสดง Modal
    document.getElementById('saraban-stamper-modal').classList.remove('hidden');

    // โหลด PDF
    const canvas = document.getElementById('saraban-pdf-canvas');
    const ctx    = canvas.getContext('2d');
    
    try {
        let loadingTask;

        // ตรวจสอบ magic bytes "%PDF" (ไม่ใช่แค่ขนาด เพราะ HTML จาก Drive viewer ใหญ่กว่า 100 bytes)
        let isValidPdf = false;
        if ((pdfDataBytes instanceof ArrayBuffer || pdfDataBytes instanceof Uint8Array) && pdfDataBytes.byteLength > 4) {
            const checkBuf = (pdfDataBytes instanceof ArrayBuffer) ? pdfDataBytes : pdfDataBytes.buffer;
            const magic    = String.fromCharCode(...new Uint8Array(checkBuf, 0, 4));
            isValidPdf     = (magic === '%PDF');
            if (!isValidPdf) console.warn('Buffer ไม่ใช่ PDF จริง magic:', magic, '→ fallback URL');
        }

        if (isValidPdf) {
            // ✅ มี binary PDF จริง — โหลดจาก Buffer
            const buf = (pdfDataBytes instanceof ArrayBuffer) ? pdfDataBytes : pdfDataBytes.buffer;
            loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        } else if (pdfUrl) {
            // ⚠️ Fallback: Buffer ไม่ใช่ PDF (HTML) หรือเป็น null
            // Google Drive URL → ใช้ GAS proxy (หลีกเลี่ยง CORS ที่บล็อก uc?export=download)
            const driveId = pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1]
                         || pdfUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];

            if (driveId) {
                console.log('sarabun: Drive URL fallback → GAS proxy, fileId:', driveId);
                const GAS_URL = "https://script.google.com/macros/s/AKfycbyyUHx5gy7SFow_xex1Jt8TorLaWpxIgoYausg9z8QuSfoL8g_1r5on104A2m-PbGIWpA/exec";
                const gasResp = await fetch(`${GAS_URL}?action=getPdfBase64&fileId=${driveId}`);
                const gasData = await gasResp.json();
                if (gasData.status !== 'success') throw new Error(gasData.message || 'GAS ดึง PDF ไม่สำเร็จ');
                const binary = window.atob(gasData.data);
                const bytes  = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== '%PDF')
                    throw new Error('GAS คืนข้อมูลที่ไม่ใช่ PDF (magic bytes ไม่ถูกต้อง)');
                loadingTask = pdfjsLib.getDocument({ data: bytes });
            } else {
                // Non-Drive URL (Firebase Storage ฯลฯ) → direct fetch ได้ปกติ
                console.log('sarabun: Non-Drive URL, fetching directly:', pdfUrl);
                const res  = await fetch(pdfUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const buf  = await res.arrayBuffer();
                loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
            }
        } else {
            throw new Error("ไม่มีข้อมูล PDF และไม่มีลิงก์สำหรับโหลดไฟล์");
        }

        const pdfDoc = await loadingTask.promise;
        const page   = await pdfDoc.getPage(1);
        const vp     = page.getViewport({ scale: sarabanState.scale });
        canvas.width  = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

    } catch (e) {
        console.error('openSarabanModal PDF error:', e);
        showAlert('ข้อผิดพลาด', 'ไม่สามารถเปิดไฟล์ PDF ได้ (อาจเกิดจากการจำกัดสิทธิ์ใน Google Drive)');
    }
}

// ตั้ง UI ตาม docType
function _setSarabanMode(docType, pdfUrl) {
    const needsNumbering = sarabanNeedsNumbering(docType);
    const numberingUi = getSarabanNumberingLabels(docType);
    const numLabelEl = document.getElementById('saraban-doc-num-label');
    const numInputEl = document.getElementById('saraban-doc-num');
    const dateLabelEl = document.getElementById('saraban-doc-date-label');
    const dateInputEl = document.getElementById('saraban-doc-date');
    const instructionEl = document.getElementById('saraban-instruction');
    const memoTextEl = document.getElementById('saraban-memo-panel-text');

    document.getElementById('saraban-command-panel').classList.toggle('hidden', !needsNumbering);
    document.getElementById('saraban-memo-panel').classList.toggle('hidden',  needsNumbering);
    document.getElementById('saraban-cmd-buttons').classList.toggle('hidden', !needsNumbering);
    document.getElementById('saraban-memo-buttons').classList.toggle('hidden', needsNumbering);

    const modalTitle = needsNumbering
        ? numberingUi.title
        : '📄 งานสารบรรณ: ตรวจสอบบันทึกข้อความ';
    document.getElementById('saraban-modal-title').textContent = modalTitle;

    if (numLabelEl) numLabelEl.textContent = numberingUi.numLabel;
    if (numInputEl) numInputEl.placeholder = numberingUi.numPlaceholder;
    if (dateLabelEl) dateLabelEl.textContent = numberingUi.dateLabel;
    if (dateInputEl) dateInputEl.placeholder = numberingUi.datePlaceholder;
    if (instructionEl) instructionEl.textContent = numberingUi.instruction;
    if (memoTextEl) memoTextEl.textContent = '📄 บันทึกข้อความ — ตรวจสอบเอกสารแล้วกดยืนยันส่งผู้อำนวยการ';

    document.getElementById('btn-saraban-confirm').textContent = needsNumbering
        ? numberingUi.previewButton
        : '✅ ยืนยันส่งผู้อำนวยการ';

    // memo mode: ตั้ง link ดู PDF
    if (!needsNumbering && pdfUrl) {
        const link = document.getElementById('saraban-memo-view-link');
        if (link) link.href = pdfUrl;
    }
}

function closeSarabanModal() {
    document.getElementById('saraban-stamper-modal').classList.add('hidden');
}

// ============================================================
// 2. Live preview overlay — command mode
//    เรียกจาก input event ที่ผูกไว้ใน DOMContentLoaded
// ============================================================
function _updateSarabanOverlay(type) {
    if (!sarabanNeedsNumbering(sarabanState.docType)) return;

    const inputId  = type === 'num' ? 'saraban-doc-num' : 'saraban-doc-date';
    const rawText  = document.getElementById(inputId).value.trim();
    // แปลงตัวเลขเป็นเลขไทย
    const thaiText = rawText.replace(/\d/g, d => '๐๑๒๓๔๕๖๗๘๙'[d]);
    const stateKey = type === 'num' ? 'overlayNum' : 'overlayDate';

    if (!rawText) {
        // ถ้าลบข้อความออก ให้ลบ overlay ด้วย
        if (sarabanState[stateKey]) {
            sarabanState[stateKey].remove();
            sarabanState[stateKey] = null;
        }
        return;
    }

    if (!sarabanState[stateKey]) {
        // สร้าง overlay ใหม่
        sarabanState[stateKey] = _createSarabanTextOverlay(type, thaiText);
    } else {
        // อัปเดตข้อความ
        const span = sarabanState[stateKey].querySelector('.saraban-text');
        if (span) span.textContent = thaiText;
    }
}

function _createSarabanTextOverlay(type, text) {
    const container   = document.getElementById('saraban-pdf-container');
    const canvas      = document.getElementById('saraban-pdf-canvas');
    const isNum       = (type === 'num');
    const color       = isNum ? '#1d4ed8' : '#15803d';
    const borderColor = isNum ? '#60a5fa' : '#4ade80';

    // ตำแหน่งเริ่มต้น: ห่างกันเพื่อไม่ทับกัน
    const initLeft = canvas.offsetLeft + 40 + (isNum ? 0 : 180);
    const initTop  = container.scrollTop + 80;

    const el = document.createElement('div');
    el.className = 'saraban-overlay';
    el.style.cssText = [
        'position:absolute',
        `left:${initLeft}px`,
        `top:${initTop}px`,
        'background:transparent',
        `border:2px dashed ${borderColor}`,
        'border-radius:4px',
        'padding:1px 4px',
        'cursor:grab',
        'user-select:none',
        'z-index:20',
        'touch-action:none',
        'white-space:nowrap',
        'box-shadow:none',
    ].join(';');

    el.innerHTML = `
        <span class="saraban-text"
            style="font-size:16px;font-weight:bold;color:${color};font-family:'TH Sarabun New',sans-serif;">
            ${text}
        </span>
        <small style="font-size:9px;color:#888;display:block;line-height:1.2;margin-top:1px;">
            ${isNum ? '📌 เลขที่' : '📌 วันที่'} — ลากเพื่อย้าย
        </small>
    `;

    container.appendChild(el);
    _makeSarabanDraggable(el);
    return el;
}

// ============================================================
// 3. Draggable helper สำหรับ saraban overlays
// ============================================================
function _makeSarabanDraggable(el) {
    let startX, startY, startLeft, startTop;

    function onStart(e) {
        e.preventDefault();
        const pt  = e.touches ? e.touches[0] : e;
        startX    = pt.clientX;
        startY    = pt.clientY;
        startLeft = parseFloat(el.style.left) || 0;
        startTop  = parseFloat(el.style.top)  || 0;
        el.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend',  onEnd);
    }

    function onMove(e) {
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        el.style.left = `${startLeft + (pt.clientX - startX)}px`;
        el.style.top  = `${startTop  + (pt.clientY - startY)}px`;
    }

    function onEnd() {
        el.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend',  onEnd);
    }

    el.addEventListener('mousedown',  onStart);
    el.addEventListener('touchstart', onStart, { passive: false });
}

// รีเซ็ต overlays ทั้งหมด
function resetSarabanOverlays() {
    if (sarabanState.overlayNum)  { sarabanState.overlayNum.remove();  sarabanState.overlayNum  = null; }
    if (sarabanState.overlayDate) { sarabanState.overlayDate.remove(); sarabanState.overlayDate = null; }
    document.getElementById('saraban-doc-num').value  = '';
    document.getElementById('saraban-doc-date').value = '';
}

// Legacy alias
function resetSarabanMarkers() { resetSarabanOverlays(); }

// ============================================================
// 4. ยืนยัน — router ตาม docType
// ============================================================
async function applySarabanAction() {
    if (sarabanNeedsNumbering(sarabanState.docType)) {
        await _previewSarabanCommand(); // Phase 1: แสดงตัวอย่างก่อน
    } else {
        await _applySarabanMemoForward();
    }
}

// ──────────────────────────────────────────────────────────
// Phase 1: สร้าง PDF จริง → render preview → แสดง confirm bar
// ──────────────────────────────────────────────────────────
async function _previewSarabanCommand() {
    const docNum  = document.getElementById('saraban-doc-num').value.trim();
    const docDate = document.getElementById('saraban-doc-date').value.trim();

    if (!docNum || !docDate) {
        alert('กรุณากรอกเลขที่และวันที่ให้ครบก่อนดูตัวอย่าง');
        return;
    }
    if (!sarabanState.overlayNum || !sarabanState.overlayDate) {
        alert('ยังไม่พบข้อความบน PDF\nกรุณาพิมพ์เลขที่และวันที่ด้านบนเพื่อให้ข้อความปรากฏ แล้วลากไปวางตำแหน่งที่ต้องการ');
        return;
    }

    try {
        toggleLoader('btn-saraban-confirm', true);

        // ── Snapshot ตำแหน่งก่อน await ทุกตัว เพื่อป้องกัน scroll เปลี่ยนค่า ──
        const canvas     = document.getElementById('saraban-pdf-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const numEl      = sarabanState.overlayNum.querySelector('.saraban-text')  || sarabanState.overlayNum;
        const dateEl     = sarabanState.overlayDate.querySelector('.saraban-text') || sarabanState.overlayDate;
        const numRect    = numEl.getBoundingClientRect();
        const dateRect   = dateEl.getBoundingClientRect();

        // ── สร้าง PDF พร้อมตัวเลขที่ประทับ (เหมือน phase confirm ทุกอย่าง) ──
        const pdfDoc = await PDFLib.PDFDocument.load(sarabanState.pdfBytes);
        pdfDoc.registerFontkit(window.fontkit);

        let customFont;
        try {
            const fontRes = await fetch('/fonts/THSarabunNew.ttf');
            if (!fontRes.ok) throw new Error(`HTTP ${fontRes.status}`);
            customFont = await pdfDoc.embedFont(await fontRes.arrayBuffer());
        } catch (fontErr) {
            throw new Error('ไม่สามารถโหลดฟอนต์ได้ กรุณาตรวจสอบไฟล์ /fonts/THSarabunNew.ttf');
        }

        const page   = pdfDoc.getPages()[0];
        const pdfW   = page.getWidth();
        const pdfH   = page.getHeight();
        const scaleX = pdfW / canvasRect.width;
        const scaleY = pdfH / canvasRect.height;

        // คำนวณตำแหน่งจาก snapshots (ไม่ต้อง getBoundingClientRect อีกครั้ง)
        const getPos = (rect) => ({
            x: (rect.left - canvasRect.left) * scaleX,
            y: pdfH - (rect.top  - canvasRect.top)  * scaleY - 12,
        });

        let boldFont = customFont;
        try {
            const boldRes = await fetch('/fonts/THSarabunNew Bold.ttf');
            if (boldRes.ok) boldFont = await pdfDoc.embedFont(await boldRes.arrayBuffer());
        } catch (_) {}

        const toThai   = (s) => s.replace(/\d/g, d => '๐๑๒๓๔๕๖๗๘๙'[d]);
        const thaiNum  = toThai(docNum);
        const thaiDate = toThai(docDate);
        const posNum   = getPos(numRect);
        const posDate  = getPos(dateRect);

        page.drawText(thaiNum,  { x: posNum.x,  y: posNum.y,  size: 16, font: boldFont,   color: PDFLib.rgb(0,0,0) });
        page.drawText(thaiDate, { x: posDate.x, y: posDate.y, size: 16, font: customFont, color: PDFLib.rgb(0,0,0) });

        const previewBytes = await pdfDoc.save();
        sarabanState.previewBlob       = new Blob([previewBytes], { type: 'application/pdf' });
        sarabanState.previewDocNum     = docNum;
        sarabanState.previewDocDate    = docDate;

        // ── render PDF ที่ประทับแล้วลงบน canvas เพื่อดูตัวอย่าง ──
        const ctx       = canvas.getContext('2d');
        const previewTask = pdfjsLib.getDocument({ data: new Uint8Array(previewBytes) });
        const previewPdf  = await previewTask.promise;
        const previewPage = await previewPdf.getPage(1);
        const vp          = previewPage.getViewport({ scale: sarabanState.scale });
        canvas.width  = vp.width;
        canvas.height = vp.height;
        await previewPage.render({ canvasContext: ctx, viewport: vp }).promise;

        // ── ซ่อน overlays (ไม่ต้องการในโหมด preview) ──
        [sarabanState.overlayNum, sarabanState.overlayDate].forEach(el => {
            if (el) el.style.visibility = 'hidden';
        });

        // ── สลับ footer: ซ่อนแถว edit → แสดง preview bar ──
        document.getElementById('saraban-edit-footer').classList.add('hidden');
        document.getElementById('saraban-preview-bar').classList.remove('hidden');
        document.getElementById('saraban-command-panel').classList.add('hidden');

    } catch (e) {
        console.error('_previewSarabanCommand error:', e);
        alert('เกิดข้อผิดพลาดในการสร้างตัวอย่าง: ' + e.message);
    } finally {
        toggleLoader('btn-saraban-confirm', false);
    }
}

// ──────────────────────────────────────────────────────────
// ยกเลิก preview → กลับโหมดแก้ไข
// ──────────────────────────────────────────────────────────
async function _cancelSarabanPreview() {
    // แสดง overlays คืน
    [sarabanState.overlayNum, sarabanState.overlayDate].forEach(el => {
        if (el) el.style.visibility = 'visible';
    });

    // re-render PDF ต้นฉบับ (ก่อนประทับ)
    const canvas = document.getElementById('saraban-pdf-canvas');
    const ctx    = canvas.getContext('2d');
    try {
        const task   = pdfjsLib.getDocument({ data: new Uint8Array(sarabanState.pdfBytes) });
        const pdfDoc = await task.promise;
        const page   = await pdfDoc.getPage(1);
        const vp     = page.getViewport({ scale: sarabanState.scale });
        canvas.width  = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
    } catch (e) { console.warn('re-render error:', e); }

    // สลับ footer กลับ
    document.getElementById('saraban-preview-bar').classList.add('hidden');
    document.getElementById('saraban-edit-footer').classList.remove('hidden');
    document.getElementById('saraban-command-panel').classList.remove('hidden');

    // ล้าง preview state
    sarabanState.previewBlob = null;
}

// ──────────────────────────────────────────────────────────
// Phase 2: ยืนยัน → อัปโหลด + Firestore (ใช้ blob จาก preview)
// ──────────────────────────────────────────────────────────
async function _confirmSarabanUpload() {
    if (!sarabanState.previewBlob) {
        alert('ไม่พบข้อมูล preview กรุณากดดูตัวอย่างใหม่อีกครั้ง');
        return;
    }

    const docNum  = sarabanState.previewDocNum;
    const docDate = sarabanState.previewDocDate;

    try {
        toggleLoader('btn-saraban-confirm-send', true);
        showAlert('กำลังดำเนินการ', 'กำลังบันทึกและส่งเอกสารไปยังผู้อำนวยการ...', false);

        const user   = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const safeId = sarabanState.docId.replace(/[\/\\:\.]/g, '-');

        const newPdfUrl = await uploadPdfToFirebaseStorage(
            sarabanState.previewBlob, user?.username || 'saraban',
            `saraban_${safeId}.pdf`
        );

        const sarabanUpdate = buildSarabanRequestUpdate(newPdfUrl, user, docNum, docDate);
        await apiCall('POST', 'updateRequest', {
            requestId: sarabanState.docId,
            ...sarabanUpdate,
            ...buildSarabanSheetPayload(newPdfUrl, docNum, docDate),
        });

        document.getElementById('alert-modal').style.display = 'none';
        closeSarabanModal();

        if (window._currentSignToken) {
            if (typeof markCurrentTokenUsed === 'function') await markCurrentTokenUsed();
            if (typeof showTokenSignSuccess === 'function')
                showTokenSignSuccess('waiting_director', null);
        } else {
            showAlert('✅ สำเร็จ',
                `${getSarabanNumberingLabels(sarabanState.docType).successPrefix} ${sarabanState.previewDocNum} เรียบร้อย เอกสารส่งไปยังผู้อำนวยการแล้ว`);
            if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
        }

    } catch (e) {
        console.error('_confirmSarabanUpload error:', e);
        try { document.getElementById('alert-modal').style.display = 'none'; } catch(_) {}
        alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
        toggleLoader('btn-saraban-confirm-send', false);
    }
}

// Legacy alias
async function applySarabanStamps() { await applySarabanAction(); }

// ──────────────────────────────────────────────────────────
// 4a. Command mode: ประทับเลขที่ + วันที่ ลง PDF
// ──────────────────────────────────────────────────────────
async function _applySarabanCommandStamps() {
    const docNum  = document.getElementById('saraban-doc-num').value.trim();
    const docDate = document.getElementById('saraban-doc-date').value.trim();

    if (!docNum || !docDate) {
        alert('กรุณากรอกเลขที่และวันที่ให้ครบก่อนยืนยัน');
        return;
    }
    if (!sarabanState.overlayNum || !sarabanState.overlayDate) {
        alert('ยังไม่พบข้อความบน PDF\nกรุณาพิมพ์เลขที่และวันที่ด้านบนเพื่อให้ข้อความปรากฏ แล้วลากไปวางตำแหน่งที่ต้องการ');
        return;
    }

    try {
        toggleLoader('btn-saraban-confirm', true);

        // ── Snapshot ตำแหน่งก่อน await ทุกตัว เพื่อป้องกัน scroll เปลี่ยนค่า ──
        const canvas     = document.getElementById('saraban-pdf-canvas');
        const canvasRect = canvas.getBoundingClientRect();
        const numEl      = sarabanState.overlayNum.querySelector('.saraban-text')  || sarabanState.overlayNum;
        const dateEl     = sarabanState.overlayDate.querySelector('.saraban-text') || sarabanState.overlayDate;
        const numRect    = numEl.getBoundingClientRect();
        const dateRect   = dateEl.getBoundingClientRect();

        // โหลด PDF
        const pdfDoc = await PDFLib.PDFDocument.load(sarabanState.pdfBytes);
        pdfDoc.registerFontkit(window.fontkit);

        // โหลดฟอนต์ THSarabunNew
        let customFont;
        try {
            const fontRes = await fetch('/fonts/THSarabunNew.ttf');
            if (!fontRes.ok) throw new Error(`HTTP ${fontRes.status}`);
            customFont = await pdfDoc.embedFont(await fontRes.arrayBuffer());
        } catch (fontErr) {
            console.error('Font error:', fontErr);
            throw new Error('ไม่สามารถโหลดฟอนต์ได้ กรุณาตรวจสอบไฟล์ /fonts/THSarabunNew.ttf');
        }

        const page   = pdfDoc.getPages()[0];
        const pdfW   = page.getWidth();
        const pdfH   = page.getHeight();
        const scaleX = pdfW / canvasRect.width;
        const scaleY = pdfH / canvasRect.height;

        // แปลง overlay position → PDF coordinates (ใช้ snapshots ที่บันทึกก่อน await)
        // วัดจาก .saraban-text span โดยตรง (ไม่ใช่ outer div) → ไม่มี border/padding offset
        const getPos = (rect) => ({
            x: (rect.left - canvasRect.left) * scaleX,
            // PDF y นับจากล่าง: flip + ลบ cap-height (~12pt สำหรับ 16pt THSarabunNew)
            // เพื่อให้ยอดตัวอักษรตรงกับจุดที่คลิ๊กบนหน้าจอ
            y: pdfH - (rect.top - canvasRect.top) * scaleY - 12,
        });

        // โหลดฟอนต์ตัวหนาสำหรับเลขที่คำสั่ง
        let boldFont = customFont; // fallback ถ้าโหลด bold ไม่ได้
        try {
            const boldRes = await fetch('/fonts/THSarabunNew Bold.ttf');
            if (boldRes.ok) boldFont = await pdfDoc.embedFont(await boldRes.arrayBuffer());
        } catch (_) { /* ใช้ regular font แทน */ }

        // แปลงเลขอาราบิก → เลขไทย
        const toThai   = (s) => s.replace(/\d/g, d => '๐๑๒๓๔๕๖๗๘๙'[d]);
        const thaiNum  = toThai(docNum);
        const thaiDate = toThai(docDate);

        const posNum  = getPos(numRect);
        const posDate = getPos(dateRect);

        // เลขที่คำสั่ง → ตัวหนา (boldFont), วันที่ → regular
        page.drawText(thaiNum,  { x: posNum.x,  y: posNum.y,  size: 16, font: boldFont,   color: PDFLib.rgb(0,0,0) });
        page.drawText(thaiDate, { x: posDate.x, y: posDate.y, size: 16, font: customFont, color: PDFLib.rgb(0,0,0) });

        const modBlob = new Blob([await pdfDoc.save()], { type: 'application/pdf' });

        showAlert('กำลังดำเนินการ', 'กำลังบันทึกและส่งเอกสารไปยังผู้อำนวยการ...', false);

        const user   = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const safeId = sarabanState.docId.replace(/[\/\\:\.]/g, '-');

        const sarabanBase64 = await blobToBase64(modBlob); // ยังต้องใช้ใน Firestore ด้านล่าง
        const newPdfUrl = await uploadPdfToFirebaseStorage(
            modBlob, user?.username || 'saraban',
            `saraban_${safeId}.pdf`
        );

        await apiCall('POST', 'updateRequest', {
            requestId: sarabanState.docId,
            ...buildSarabanRequestUpdate(newPdfUrl, user, docNum, docDate),
            ...buildSarabanSheetPayload(newPdfUrl, docNum, docDate),
        });

        document.getElementById('alert-modal').style.display = 'none';
        closeSarabanModal();

        if (window._currentSignToken) {
            if (typeof markCurrentTokenUsed === 'function') await markCurrentTokenUsed();
            if (typeof showTokenSignSuccess === 'function')
                showTokenSignSuccess('waiting_director', null);
        } else {
            showAlert('✅ สำเร็จ',
                `${getSarabanNumberingLabels(sarabanState.docType).successPrefix} ${thaiNum} เรียบร้อย เอกสารส่งไปยังผู้อำนวยการแล้ว`);
            if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
        }

    } catch (e) {
        console.error('_applySarabanCommandStamps error:', e);
        try { document.getElementById('alert-modal').style.display = 'none'; } catch(_) {}
        alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
        toggleLoader('btn-saraban-confirm', false);
    }
}

// ──────────────────────────────────────────────────────────
// 4b. Memo mode: ส่งผู้อำนวยการโดยตรง (ไม่ต้องประทับ)
// ──────────────────────────────────────────────────────────
async function _applySarabanMemoForward() {
    try {
        toggleLoader('btn-saraban-confirm', true);
        showAlert('กำลังดำเนินการ', 'กำลังส่งเอกสารไปยังผู้อำนวยการ...', false);

        const user   = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const safeId = sarabanState.docId.replace(/[\/\\:\.]/g, '-');

        await apiCall('POST', 'updateRequest', {
            requestId: sarabanState.docId,
            docStatus: 'waiting_director',
            docType: 'memo',
            activeApprovalDocType: 'memo',
            sarabanVerifiedAt: new Date().toISOString(),
            sarabanVerifiedBy: user?.name || user?.username || 'saraban',
            lastUpdated: new Date().toISOString(),
        });

        document.getElementById('alert-modal').style.display = 'none';
        closeSarabanModal();

        if (window._currentSignToken) {
            if (typeof markCurrentTokenUsed === 'function') await markCurrentTokenUsed();
            if (typeof showTokenSignSuccess === 'function')
                showTokenSignSuccess('waiting_director', null);
        } else {
            showAlert('✅ สำเร็จ', 'ส่งบันทึกข้อความไปยังผู้อำนวยการเรียบร้อยแล้ว');
            if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
        }

    } catch (e) {
        console.error('_applySarabanMemoForward error:', e);
        try { document.getElementById('alert-modal').style.display = 'none'; } catch(_) {}
        alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
        toggleLoader('btn-saraban-confirm', false);
    }
}

// ============================================================
// 5. ผูก input events เมื่อ DOM พร้อม
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const numInput  = document.getElementById('saraban-doc-num');
    const dateInput = document.getElementById('saraban-doc-date');
    if (numInput)  numInput.addEventListener('input',  () => _updateSarabanOverlay('num'));
    if (dateInput) dateInput.addEventListener('input', () => _updateSarabanOverlay('date'));
});
