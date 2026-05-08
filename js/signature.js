// ============================================================
// ระบบลงลายเซ็น — Drag-Drop Version
// วาดลายเซ็น → ลากวางบน PDF → คัดลอกหลายจุด → ยืนยันส่งต่อ
// รองรับทั้ง Dashboard (login) และ Token Link (ไม่ login)
// ============================================================

let sigState = {
    pdfBytes:        null,
    docId:           null,
    scale:           1.5,
    padInstance:     null,
    currentDocStatus: null,
    placements:      [],       // [{ el: HTMLElement, sigDataURL: string }]
    lastSigDataURL:  null,     // data URL ลายเซ็นล่าสุดที่วาด
    pageCanvases:    [],       // [HTMLCanvasElement] ทุกหน้า
};

// ============================================================
// Helper: ลำดับขั้นตอน docStatus
// ============================================================
function getNextDocStatus(currentStatus) {
    // ผู้อำนวยการลงนาม → ส่งกลับแอดมินเพื่อไฟนแลร์และส่งไป Google Drive
    if (currentStatus === 'waiting_director') return 'waiting_admin_final';
    // ขั้นตอนอื่นๆ วนกลับมาหาแอดมินเช่นเดิม
    if (currentStatus && currentStatus.startsWith('waiting_')) return 'waiting_admin_review';
    return null;
}

function getDocStatusLabel(status) {
    const labels = {
        'waiting_head_thai':      'หัวหน้ากลุ่มสาระภาษาไทย',
        'waiting_head_foreign':   'หัวหน้ากลุ่มสาระภาษาต่างประเทศ',
        'waiting_head_science':   'หัวหน้ากลุ่มสาระวิทยาศาสตร์ฯ',
        'waiting_head_art':       'หัวหน้ากลุ่มสาระศิลปะ',
        'waiting_head_social':    'หัวหน้ากลุ่มสาระสังคมศึกษาฯ',
        'waiting_head_health':    'หัวหน้ากลุ่มสาระสุขศึกษาฯ',
        'waiting_head_career':    'หัวหน้ากลุ่มสาระการงานอาชีพ',
        'waiting_head_math':      'หัวหน้ากลุ่มสาระคณิตศาสตร์',
        'waiting_head_guidance':  'หัวหน้างานแนะแนว',
        'waiting_head_general':   'หัวหน้ากลุ่มบริหารทั่วไป',
        'waiting_head_personnel': 'หัวหน้ากลุ่มบริหารงานบุคคล',
        'waiting_head_budget':    'หัวหน้ากลุ่มบริหารงบประมาณ',
        'waiting_head_acad':      'หัวหน้ากลุ่มบริหารวิชาการ',
        'waiting_deputy_personnel':  'รองผู้อำนวยการกลุ่มบริหารงานบุคคล',
        'waiting_deputy_acad':       'รองผู้อำนวยการกลุ่มบริหารวิชาการ',
        'waiting_deputy_general':    'รองผู้อำนวยการกลุ่มบริหารทั่วไป',
        'waiting_deputy_budget':     'รองผู้อำนวยการกลุ่มบริหารงบประมาณ',
        'waiting_admin_review':   'แอดมิน (รอตรวจสอบก่อนส่งสารบรรณ)',
        'waiting_saraban':        'งานสารบรรณ',
        'waiting_director':       'ผู้อำนวยการ',
        'waiting_admin_final': 'แอดมิน (ไฟนแลร์งานและส่งเก็บ Google Drive)',
        'อนุมัติ':                'อนุมัติแล้ว ✅',
        'เสร็จสิ้น':              'เสร็จสิ้น (อนุมัติแล้ว)',
    };
    return labels[status] || status || 'ขั้นตอนถัดไป';
}

// ============================================================
// 1. เปิด Modal และโหลด PDF
// ============================================================
async function openSignatureSystem(pdfUrl, documentId, title = '✍️ ลงนามเอกสาร', currentDocStatus = null) {
    try {
        sigState.docId           = documentId;
        sigState.currentDocStatus = currentDocStatus;
        sigState.placements      = [];
        sigState.lastSigDataURL  = null;

        // ตั้งชื่อ modal
        document.getElementById('signature-modal-title').innerText = title;

        // ซ่อนปุ่มคัดลอก
        document.getElementById('btn-dup-sig').classList.add('hidden');

        // ล้าง overlays และ canvases หน้าก่อนหน้า
        const container = document.getElementById('signature-pdf-container');
        container.querySelectorAll('.sig-placement').forEach(el => el.remove());
        container.querySelectorAll('.pdf-page-canvas').forEach(el => el.remove());
        sigState.pageCanvases = [];

        // แสดง Modal
        document.getElementById('signature-modal').classList.remove('hidden');

        // ── โหลด PDF bytes ──
        // เส้นทาง 0 → 1 → 2 (เร็วสุด → ช้าสุด)
        const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyyUHx5gy7SFow_xex1Jt8TorLaWpxIgoYausg9z8QuSfoL8g_1r5on104A2m-PbGIWpA/exec";

        // Helper: ตรวจ magic bytes %PDF
        const isPdfBuffer = (buf) =>
            buf instanceof ArrayBuffer && buf.byteLength > 4 &&
            String.fromCharCode(...new Uint8Array(buf, 0, 4)) === '%PDF';

        // Helper: decode raw base64 → ArrayBuffer
        const decodeBase64ToBuf = (b64) => {
            const bin   = window.atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return bytes.buffer;
        };

        let pdfBytes = null;

        // 🚀 เส้นทาง 0: Firestore pdfBase64 (เร็วที่สุด — ไม่ต้อง network request ไป Drive)
        // ตรวจจาก window._approvalDocs cache ก่อน (dashboard flow)
        const _safeDocId  = documentId ? documentId.replace(/[\/\\:\.]/g, '-') : '';
        const _cachedDoc  = (documentId && window._approvalDocs?.[_safeDocId])
                         || (documentId && window._approvalDocs?.[documentId]);
        if (_cachedDoc?.pdfBase64) {
            try {
                const buf = decodeBase64ToBuf(_cachedDoc.pdfBase64);
                if (isPdfBuffer(buf)) {
                    pdfBytes = buf;
                    console.log('🚀 PDF loaded from Firestore cache (window._approvalDocs) — instant!');
                }
            } catch (e) { console.warn('Firestore cache decode error:', e.message); }
        }
        // ถ้ายังไม่ได้ → ลอง query Firestore โดยตรง (token flow หรือ reload page)
        if (!pdfBytes && typeof db !== 'undefined' && documentId) {
            try {
                const safeId = _safeDocId;
                const snap   = await db.collection('requests').doc(safeId).get();
                const fbBase64 = snap.exists ? snap.data()?.pdfBase64 : null;
                if (fbBase64) {
                    const buf = decodeBase64ToBuf(fbBase64);
                    if (isPdfBuffer(buf)) {
                        pdfBytes = buf;
                        console.log('🚀 PDF loaded from Firestore (direct query) — fast!');
                    }
                }
            } catch (e) { console.warn('Firestore direct query error:', e.message); }
        }

        // ⚠️ เส้นทาง 1: GAS base64 proxy (ถ้า Drive URL และไม่มี Firestore cache)
        if (!pdfBytes && pdfUrl && pdfUrl.includes('drive.google.com')) {
            const driveId = (pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || pdfUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/))?.[1];
            if (driveId) {
                try {
                    const resp   = await fetch(`${SCRIPT_URL}?action=getPdfBase64&fileId=${driveId}`);
                    const result = await resp.json();
                    if (result.status === 'success') {
                        const buf = decodeBase64ToBuf(result.data);
                        if (isPdfBuffer(buf)) pdfBytes = buf;
                        else console.warn('GAS base64 ไม่ใช่ PDF จริง');
                    }
                } catch (e) { console.warn('GAS base64 fallback error:', e.message); }
            }
        }

        // ⚠️ เส้นทาง 2: fetch ตรง (Non-Drive URL เช่น Firebase Storage)
        if (!pdfBytes && pdfUrl && !pdfUrl.includes('drive.google.com')) {
            try {
                const resp = await fetch(pdfUrl);
                if (resp.ok) {
                    const buf = await resp.arrayBuffer();
                    if (isPdfBuffer(buf)) pdfBytes = buf;
                    else console.warn('Direct fetch ไม่ใช่ PDF magic:', String.fromCharCode(...new Uint8Array(buf, 0, 4)));
                }
            } catch (e) { console.warn('Direct fetch error:', e.message); }
        }

        if (!pdfBytes) throw new Error('ไม่สามารถโหลดไฟล์ PDF ได้ (ลองทุกวิธีแล้วไม่พบข้อมูล PDF ที่ถูกต้อง)');
        sigState.pdfBytes = pdfBytes;

        // Render ทุกหน้าลง container (หน้า 1 = canvas เดิม, หน้าถัดไป = canvas ใหม่)
        const mainCanvas = document.getElementById('signature-pdf-canvas');
        const pdfTask    = pdfjsLib.getDocument({ data: new Uint8Array(sigState.pdfBytes) });
        const pdfDocView = await pdfTask.promise;
        const numPages   = pdfDocView.numPages;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const pg = await pdfDocView.getPage(pageNum);
            const vp = pg.getViewport({ scale: sigState.scale });

            let canvas;
            if (pageNum === 1) {
                canvas = mainCanvas;
            } else {
                canvas = document.createElement('canvas');
                canvas.className = 'pdf-page-canvas shadow-md bg-white';
                canvas.dataset.pageIndex = pageNum - 1;
                container.appendChild(canvas);
            }
            canvas.width  = vp.width;
            canvas.height = vp.height;
            await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            sigState.pageCanvases.push(canvas);
        }

        // เริ่มต้น SignaturePad (ต้อง delay เล็กน้อยเพื่อให้ canvas render เสร็จก่อน)
        setTimeout(_initSignaturePad, 100);

    } catch (err) {
        console.error('openSignatureSystem error:', err);
        alert('ไม่สามารถเปิดไฟล์ PDF ได้: ' + err.message);
    }
}

function closeSignatureModal() {
    document.getElementById('signature-modal').classList.add('hidden');
    sigState.placements.forEach(p => { try { p.el.remove(); } catch(e) {} });
    sigState.placements = [];
    // ลบ canvases หน้า 2+ ที่สร้างแบบ dynamic
    document.getElementById('signature-pdf-container')
        ?.querySelectorAll('.pdf-page-canvas').forEach(el => el.remove());
    sigState.pageCanvases = [];
}

// ============================================================
// 2. Signature Pad — เริ่มต้นและวาด
// ============================================================
function _initSignaturePad() {
    const canvas = document.getElementById('signature-pad-canvas');
    if (!canvas) return;
    const result = createSignaturePad(canvas, sigState.padInstance, {
        width: canvas.offsetWidth || 300,
        height: canvas.offsetHeight || 180
    });
    if (!result) return;
    sigState.padInstance = result.pad;
}

function clearSignaturePad() {
    if (sigState.padInstance) sigState.padInstance.clear();
}

// Legacy stubs (ไม่ใช้แล้วแต่ป้องกัน error ถ้าโค้ดเก่าเรียก)
function openSignaturePadModal()  {}
function closeSignaturePadModal() {}

// ============================================================
// 3. วางลายเซ็นบน PDF — สร้าง draggable overlay
// ============================================================
async function placeSignatureOnPdf() {
    if (!sigState.padInstance || sigState.padInstance.isEmpty()) {
        alert('กรุณาวาดลายเซ็นก่อนกดวาง');
        return;
    }
    const rawDataURL = sigState.padInstance.toDataURL('image/png');
    const dataURL = (typeof optimizeSignatureDataURL === 'function')
        ? await optimizeSignatureDataURL(rawDataURL)
        : rawDataURL;
    sigState.lastSigDataURL = dataURL;
    _createSignaturePlacement(dataURL);
    document.getElementById('btn-dup-sig').classList.remove('hidden');
}

function duplicateLastSignature() {
    if (!sigState.lastSigDataURL) return;
    _createSignaturePlacement(sigState.lastSigDataURL);
}

function clearAllSignaturePlacements() {
    sigState.placements.forEach(p => { try { p.el.remove(); } catch(e) {} });
    sigState.placements = [];
    document.getElementById('btn-dup-sig').classList.add('hidden');
}

function _createSignaturePlacement(dataURL) {
    const container   = document.getElementById('signature-pdf-container');
    const firstCanvas = (sigState.pageCanvases?.[0]) || document.getElementById('signature-pdf-canvas');
    if (!container || !firstCanvas) return; // modal ยังไม่ถูกเปิด

    // ตำแหน่งเริ่มต้น: กลางพื้นที่ที่มองเห็น
    const initLeft = firstCanvas.offsetLeft + Math.max(0, (firstCanvas.offsetWidth  - 120) / 2);
    const initTop  = container.scrollTop + Math.max(60, (container.clientHeight / 2) - 30);

    const el = document.createElement('div');
    el.className  = 'sig-placement';
    el.style.cssText = [
        'position:absolute',
        `left:${initLeft}px`,
        `top:${initTop}px`,
        'width:120px',
        'cursor:grab',
        'user-select:none',
        'z-index:20',
        'touch-action:none',
    ].join(';');

    el.innerHTML = `
        <img src="${dataURL}"
            style="width:100%;display:block;border:2px dashed #3b82f6;border-radius:4px;background:rgba(255,255,255,0.85);">
        <button
            style="position:absolute;top:-10px;right:-10px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.3);padding:0;">
            ✕
        </button>
        <div class="sig-resize-handle"
            style="position:absolute;bottom:-7px;right:-7px;width:16px;height:16px;background:#3b82f6;border-radius:3px;cursor:nwse-resize;z-index:21;touch-action:none;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.35);"
            title="ลากเพื่อปรับขนาด">
            <svg width="10" height="10" viewBox="0 0 10 10" style="pointer-events:none;">
                <line x1="2" y1="9" x2="9" y2="2" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="5" y1="9" x2="9" y2="5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
        </div>
    `;

    // ปุ่ม ✕ ลบตัวเอง
    el.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        sigState.placements = sigState.placements.filter(p => p.el !== el);
        el.remove();
        if (sigState.placements.length === 0) {
            document.getElementById('btn-dup-sig').classList.add('hidden');
        }
    });

    container.appendChild(el);
    _makeDraggable(el);
    _makeResizable(el);
    sigState.placements.push({ el, sigDataURL: dataURL });
}

// ============================================================
// 4. Draggable helper (mouse + touch)
// ============================================================
function _makeDraggable(el) {
    let startX, startY, startLeft, startTop;

    function onStart(e) {
        if (e.target.tagName === 'BUTTON') return;            // ไม่ drag เมื่อกด ✕
        if (e.target.closest?.('.sig-resize-handle')) return; // ไม่ drag เมื่อ resize
        e.preventDefault();
        const pt    = e.touches ? e.touches[0] : e;
        startX      = pt.clientX;
        startY      = pt.clientY;
        startLeft   = parseFloat(el.style.left) || 0;
        startTop    = parseFloat(el.style.top)  || 0;
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

// ============================================================
// 4b. Resizable helper (mouse + touch) — ย่อ-ขยายลายเซ็น
// ============================================================
function _makeResizable(el) {
    const handle = el.querySelector('.sig-resize-handle');
    if (!handle) return;

    let startX, startW;

    function onStart(e) {
        e.stopPropagation();
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        startX   = pt.clientX;
        startW   = el.offsetWidth;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend',  onEnd);
    }

    function onMove(e) {
        e.preventDefault();
        const pt   = e.touches ? e.touches[0] : e;
        const dx   = pt.clientX - startX;
        const newW = Math.min(400, Math.max(40, startW + dx));
        el.style.width = `${newW}px`;
    }

    function onEnd() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend',  onEnd);
    }

    handle.addEventListener('mousedown',  onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
}

// ============================================================
// 5. ยืนยัน: ฝังลายเซ็นทุกจุดลง PDF → อัปโหลด → อัปเดตสถานะ
// ============================================================
async function applySignatureToPdf() {
    if (sigState.placements.length === 0) {
        alert('กรุณาวางลายเซ็นบน PDF อย่างน้อย 1 จุดก่อนยืนยัน');
        return;
    }
    try {
        toggleLoader('btn-confirm-signature', true);
        if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();

        // ── 1. คำนวณตำแหน่งและฝังลายเซ็นลง PDF ──
        // Snapshot bounding rects ก่อน await เพื่อป้องกัน scroll เปลี่ยนค่า
        const pageCanvases  = sigState.pageCanvases?.length
            ? sigState.pageCanvases
            : [document.getElementById('signature-pdf-canvas')];
        const pageRects = pageCanvases.map(c => c.getBoundingClientRect());

        const placementSnapshots = sigState.placements.map(({ el, sigDataURL }) => {
            const elRect    = el.getBoundingClientRect();
            const elCenterY = elRect.top + elRect.height / 2;

            // หาว่า placement อยู่บนหน้าไหน
            let pageIdx = pageRects.length - 1;
            for (let i = 0; i < pageRects.length; i++) {
                if (elCenterY <= pageRects[i].bottom) { pageIdx = i; break; }
            }

            const cr = pageRects[pageIdx];
            return {
                sigDataURL,
                pageIdx,
                xInCanvas: elRect.left - cr.left,
                yInCanvas: elRect.top  - cr.top,
                sigCssW:   elRect.width,
                sigCssH:   elRect.height,
                canvasW:   cr.width,
                canvasH:   cr.height,
            };
        });

        const pdfDoc  = await PDFLib.PDFDocument.load(sigState.pdfBytes);
        const pdfPages = pdfDoc.getPages();

        for (const { sigDataURL, pageIdx, xInCanvas, yInCanvas, sigCssW, sigCssH, canvasW, canvasH } of placementSnapshots) {
            const pg     = pdfPages[pageIdx] || pdfPages[0];
            const pdfW   = pg.getWidth();
            const pdfH   = pg.getHeight();
            const ratioX = pdfW / canvasW;
            const ratioY = pdfH / canvasH;

            const sigPdfW = sigCssW  * ratioX;
            const sigPdfH = sigCssH  * ratioY;
            const pdfX    = xInCanvas * ratioX;
            const pdfY    = pdfH - (yInCanvas * ratioY) - sigPdfH;
            const img     = await pdfDoc.embedPng(sigDataURL);
            pg.drawImage(img, { x: pdfX, y: pdfY, width: sigPdfW, height: sigPdfH });
        }

        const finalBytes  = await pdfDoc.save();
        const signedBlob  = new Blob([finalBytes], { type: 'application/pdf' });

        // ── 2. ปิด Modal ก่อนอัปโหลด ──
        closeSignatureModal();
        showAlert('กำลังดำเนินการ', 'กำลังบันทึกเอกสารที่ลงนามแล้ว... กรุณารอสักครู่', false);

        const user   = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const docId  = sigState.docId;
        const safeId = docId ? docId.replace(/[\/\\:\.]/g, '-') : 'unknown';

        const newPdfUrl = await uploadPdfToFirebaseStorage(
            signedBlob, user?.username || 'approver',
            `signed_${safeId}.pdf`
        );
        const nextStatus  = getNextDocStatus(sigState.currentDocStatus);

        // ── 3. อ่าน docType เพื่อแยกการอัพเดตบันทึก vs คำสั่ง ──
        let existingDocType = 'memo';
        if (typeof db !== 'undefined') {
            try {
                const snap = await db.collection('requests').doc(safeId).get();
                existingDocType = snap.data()?.activeApprovalDocType || snap.data()?.docType || 'memo';
            } catch(_) {}
        }
        const isCommandDoc = existingDocType === 'command';
        const isDispatchDoc = existingDocType === 'dispatch';
        
        // Handle waiting_admin_final: director signed, send back to admin
        if (nextStatus === 'waiting_admin_final') {
            const updateForAdminFinal = {
                currentPdfUrl: newPdfUrl,
                docStatus: 'waiting_admin_final',
                activeApprovalDocType: existingDocType,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            };

            if (isCommandDoc) {
                updateForAdminFinal.commandPdfUrl = newPdfUrl;
                updateForAdminFinal.commandStatus = 'waiting_admin_final';
            } else if (isDispatchDoc) {
                updateForAdminFinal.dispatchBookUrl = newPdfUrl;
                updateForAdminFinal.dispatchBookPdfUrl = newPdfUrl;
                updateForAdminFinal.dispatchStatus = 'waiting_admin_final';
            } else {
                updateForAdminFinal.pdfUrl = newPdfUrl;
                updateForAdminFinal.memoPdfUrl = newPdfUrl;
                updateForAdminFinal.completedMemoUrl = newPdfUrl;
            }

            // Update Firestore with Firebase Storage URL
            await db.collection('requests').doc(safeId).set(updateForAdminFinal, { merge: true });

            // Sync กลับ Google Sheets ด้วย เพื่อไม่ให้ docStatus ระหว่าง Firestore/Sheets หลุดกัน
            const adminFinalPayload = {
                requestId:        docId,
                docStatus:        'waiting_admin_final',
                activeApprovalDocType: existingDocType,
            };
            if (isCommandDoc) {
                adminFinalPayload.commandPdfUrl = newPdfUrl;
                adminFinalPayload.commandStatus = 'waiting_admin_final';
            } else if (isDispatchDoc) {
                adminFinalPayload.dispatchBookUrl = newPdfUrl;
                adminFinalPayload.dispatchBookPdfUrl = newPdfUrl;
                adminFinalPayload.dispatchStatus = 'waiting_admin_final';
            } else {
                adminFinalPayload.pdfUrl = newPdfUrl;
                adminFinalPayload.completedMemoUrl = newPdfUrl;
            }
            apiCall('POST', 'updateRequest', adminFinalPayload).catch(e => console.warn('Sheet update error:', e));

            // Notify
            if (window._currentSignToken) {
                await markCurrentTokenUsed();
                showTokenSignSuccess('waiting_admin_final', null);
            } else {
                showAlert('✅ ลงนามสำเร็จ', 'เอกสารถูกส่งกลับมาหาแอดมินเพื่อไฟนแลร์งานแล้ว');
                if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
            }
            return; // End processing, not final approval yet
        }

        // ── 4. อัปเดต Firestore ──
        if (typeof db !== 'undefined') {
            const effectiveRole = user?._approverRole || user?.role || '';
            const update = {
                currentPdfUrl:    newPdfUrl,
                activeApprovalDocType: existingDocType,
                lastUpdated:      firebase.firestore.FieldValue.serverTimestamp(),
            };
            if (isCommandDoc) {
                update.commandPdfUrl = newPdfUrl;
            } else if (isDispatchDoc) {
                update.dispatchBookUrl = newPdfUrl;
                update.dispatchBookPdfUrl = newPdfUrl;
            } else {
                update.pdfUrl = newPdfUrl;
                update.memoPdfUrl = newPdfUrl;
                update.completedMemoUrl = newPdfUrl;   // sync ให้ผู้อนุมัติถัดไปเห็นไฟล์รวมล่าสุด
            }
            if (nextStatus) update.docStatus = nextStatus;
            if (effectiveRole) {
                update[`signedBy_${effectiveRole}`] = user?.name || user?.username || '';
                update[`signedAt_${effectiveRole}`] = firebase.firestore.FieldValue.serverTimestamp();
            }

            // 💾 อัปเดต pdfBase64 ใน Firestore (PDF ล่าสุดหลังลงนาม)
            if (nextStatus === 'อนุมัติ') {
                // ✅ ขั้นตอนสุดท้าย: ลบ cache ออก (ประหยัด Firestore space, Drive ยังเก็บครบ)
                update.pdfBase64 = firebase.firestore.FieldValue.delete();
                // ★ แยก field ตามประเภทเอกสาร ไม่ปนกัน
                if (isCommandDoc) {
                    update.commandStatus       = 'รับไฟล์กลับไปใช้งาน';
                    update.completedCommandUrl = newPdfUrl;
                } else if (isDispatchDoc) {
                    update.dispatchStatus = 'รับไฟล์กลับไปใช้งาน';
                    update.completedDispatchBookUrl = newPdfUrl;
                    update.dispatchBookUrl = newPdfUrl;
                    update.dispatchBookPdfUrl = newPdfUrl;
                } else {
                    update.status           = 'รับไฟล์กลับไปใช้งาน';
                    update.completedMemoUrl = newPdfUrl;
                }
                console.log(`✅ ${(isDispatchDoc ? 'Dispatch' : (isCommandDoc ? 'Command' : 'Memo'))} fully approved — file URL returned to user`);
            } else {
                // 📦 ขั้นตอนกลาง: cache PDF ที่มีลายเซ็นแล้วเพื่อให้ผู้ลงนามคนถัดไปโหลดได้เร็ว
                try {
                    const base64Data = btoa(
                        finalBytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '')
                    );
                    if (base64Data.length <= 900_000) {
                        update.pdfBase64 = base64Data;
                    }
                } catch (_) { /* ถ้า convert ไม่ได้ก็ไม่ cache — ยังทำงานได้จาก Storage */ }
            }

            await db.collection('requests').doc(safeId).set(update, { merge: true });
        }

        // ── 5. อัปเดต Google Sheet (non-blocking) ──
        const sheetPayload = {
            requestId: docId,
            docStatus: nextStatus || sigState.currentDocStatus,
            activeApprovalDocType: existingDocType,
        };
        if (isCommandDoc) {
            sheetPayload.commandPdfUrl = newPdfUrl;
        } else if (isDispatchDoc) {
            sheetPayload.dispatchBookUrl = newPdfUrl;
            sheetPayload.dispatchBookPdfUrl = newPdfUrl;
        } else {
            sheetPayload.pdfUrl = newPdfUrl;
        }
        if (nextStatus === 'อนุมัติ') {
            if (isCommandDoc) {
                sheetPayload.commandStatus      = 'รับไฟล์กลับไปใช้งาน';
                sheetPayload.completedCommandUrl = newPdfUrl;
            } else if (isDispatchDoc) {
                sheetPayload.dispatchStatus = 'รับไฟล์กลับไปใช้งาน';
                sheetPayload.completedDispatchBookUrl = newPdfUrl;
                sheetPayload.dispatchBookUrl = newPdfUrl;
                sheetPayload.dispatchBookPdfUrl = newPdfUrl;
            } else {
                sheetPayload.status           = 'รับไฟล์กลับไปใช้งาน';
                sheetPayload.completedMemoUrl = newPdfUrl;
            }
        }
        apiCall('POST', 'updateRequest', sheetPayload).catch(e => console.warn('Sheet update error:', e));

        document.getElementById('alert-modal').style.display = 'none';

        // ── 5. แจ้งผลลัพธ์ ──
        if (window._currentSignToken) {
            // Token Page: mark used + แสดงสำเร็จ
            await markCurrentTokenUsed();
            if (typeof showTokenSignSuccess === 'function') {
                showTokenSignSuccess(nextStatus, null);
            }
        } else {
            // Dashboard: alert + reload inbox
            showAlert(
                '✅ ลงนามสำเร็จ',
                nextStatus
                    ? `เอกสารถูกส่งต่อไปยัง: ${getDocStatusLabel(nextStatus)} เรียบร้อยแล้ว`
                    : 'ลงนามเอกสารเรียบร้อยแล้ว'
            );
            if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
        }

    } catch (e) {
        console.error('applySignatureToPdf error:', e);
        try { document.getElementById('alert-modal').style.display = 'none'; } catch(_) {}
        alert('เกิดข้อผิดพลาดในการประทับลายเซ็น: ' + e.message);
    } finally {
        toggleLoader('btn-confirm-signature', false);
    }
}
