// --- CACHE SYSTEM ---
window.MAX_SIGNATURE_PLACEMENTS = 10;
window.userRequestsCache = null;      // เก็บข้อมูลคำขอของ User
window.userRequestsCacheTime = 0;     // เก็บ Timestamp ล่าสุดที่ดึงข้อมูล
window.userRequestsCacheYear = null;  // เก็บปีของข้อมูลที่ Cache ไว้
const CACHE_TTL_MS = 5 * 60 * 1000;   // อายุ Cache: 5 นาที (หน่วยเป็นมิลลิวินาที)

// ฟังก์ชันสำหรับเคลียร์ Cache (จะถูกเรียกใช้เวลา เพิ่ม/ลบ/แก้ไข ข้อมูล)
function clearRequestsCache() {
    window.userRequestsCache = null;
    window.userRequestsCacheTime = 0;
    window.userRequestsCacheYear = null;
    window.allRequestsCache = null;
    if (typeof allRequestsCache !== 'undefined') allRequestsCache = [];
    if (typeof allMemosCache !== 'undefined') allMemosCache = [];
    if (typeof userMemosCache !== 'undefined') userMemosCache = [];
    console.log("🧹 เคลียร์ Cache ข้อมูลเรียบร้อยแล้ว");
}
// ดึง Firebase ID Token สำหรับยืนยันตัวตนกับ GAS
// คืนค่า null ถ้า Firebase ยังไม่พร้อม หรือยังไม่ได้ login
// cache token 50 นาที (token จริงหมดอายุ 60 นาที)
let _cachedIdToken = null;
let _cachedIdTokenExp = 0;

async function getFirebaseIdToken() {
    try {
        if (typeof firebase === 'undefined') return null;

        // ใช้ cache ถ้ายังไม่หมดอายุ
        if (_cachedIdToken && Date.now() < _cachedIdTokenExp) {
            return _cachedIdToken;
        }

        const auth = firebase.auth();
        if (!auth.currentUser) {
            return null;
        }
        const token = await auth.currentUser.getIdToken();
        _cachedIdToken = token;
        _cachedIdTokenExp = Date.now() + 50 * 60 * 1000; // 50 นาที
        return token;
    } catch (e) {
        console.warn('⚠️ getIdToken failed:', e.message);
    }
    return null;
}

async function apiCall(method, action, payload = {}, retries = 2) {
    let url = SCRIPT_URL;
    const TIMEOUT_MS = 30000; // 30 วินาที (ถ้าเกินนี้ให้ตัด)

    // แนบ Firebase ID Token ทุก request ยกเว้น verifyCredentials (login)
    // GAS ฝั่งเซิร์ฟเวอร์จะยืนยัน token นี้ก่อนประมวลผล
    const idToken = (action !== 'verifyCredentials') ? await getFirebaseIdToken() : null;

    // ตั้งค่า Headers
    const options = {
        method: method,
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    };

    // จัดการ Parameter
    if (method === 'GET') {
        const params = new URLSearchParams({ action, ...payload, cacheBust: new Date().getTime() });
        if (idToken) params.set('idToken', idToken);
        url += `?${params}`;
    } else {
        options.body = JSON.stringify({ action, payload, idToken });
    }

    // ฟังก์ชันสำหรับรอเวลา (Backoff) ก่อนลองใหม่
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    // ลูปการทำงานเพื่อลองใหม่ (Retry Loop)
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        try {
            // เพิ่ม signal เพื่อรองรับ Timeout
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId); // ยกเลิกตัวจับเวลาถ้าโหลดเสร็จทัน

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const result = await response.json();
            if (result.status === 'error') throw new Error(result.message);
            
            return result; // ถ้าสำเร็จ ส่งค่ากลับทันที

        } catch (error) {
            clearTimeout(timeoutId); // เคลียร์เวลาเมื่อ error

            const isLastAttempt = attempt === retries;
            const isTimeout = error.name === 'AbortError';
            
            console.warn(`⚠️ API Call Failed (Attempt ${attempt + 1}/${retries + 1}):`, error.message);

            if (isLastAttempt) {
                // ถ้าครบโควตาลองใหม่แล้วยังไม่ได้ ให้แจ้ง Error จริงๆ
                console.error('❌ API Call Given Up:', error);
                
                if (isTimeout) {
                    showAlert('หมดเวลาการเชื่อมต่อ', 'ระบบใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง');
                } else if (error.message.includes('Failed to fetch')) {
                    showAlert('การเชื่อมต่อล้มเหลว', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาเช็คอินเทอร์เน็ต');
                } else {
                    showAlert('เกิดข้อผิดพลาด', `Server error: ${error.message}`);
                }
                throw error;
            }

            // ถ้ายังไม่ครบโควตา ให้รอแป๊บหนึ่งแล้วลองใหม่ (1 วินาที)
            await wait(1000);
        }
    }
}

// --- UTILITY FUNCTIONS ---
function showAlert(title, message) {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
}

function showConfirm(title, message) {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    document.getElementById('confirm-modal').style.display = 'flex';

    return new Promise((resolve) => {
        const yesButton = document.getElementById('confirm-modal-yes-button');
        const noButton = document.getElementById('confirm-modal-no-button');
        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };
        
        const cleanup = () => {
            document.getElementById('confirm-modal').style.display = 'none';
            yesButton.removeEventListener('click', onYes);
            noButton.removeEventListener('click', onNo);
        };

        yesButton.addEventListener('click', onYes, { once: true });
        noButton.addEventListener('click', onNo, { once: true });
    });
}

function toggleLoader(buttonId, show) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    const isButtonLike = ['BUTTON', 'A'].includes(button.tagName);
    const loader = button.querySelector('.loader');
    const text = button.querySelector('span');
    if (show) {
        if (isButtonLike && !button.dataset.origHtml) button.dataset.origHtml = button.innerHTML;
        if (loader) {
            loader.classList.remove('hidden');
            if (text) text.classList.add('hidden');
        } else if (isButtonLike) {
            const loadingText = button.dataset.loadingText || 'กำลังดำเนินการ...';
            button.innerHTML = `<span class="loader-sm"></span> ${loadingText}`;
        } else if (button.tagName === 'TBODY') {
            const cols = button.closest('table')?.querySelectorAll('thead th').length || 1;
            button.innerHTML = `<tr><td colspan="${cols}" class="text-center py-10"><div class="loader mx-auto mb-2"></div><p class="text-gray-500 animate-pulse">กำลังโหลดข้อมูล...</p></td></tr>`;
        } else if (!button.dataset.loadingManaged) {
            button.dataset.loadingManaged = '1';
            button.innerHTML = `<div class="flex flex-col items-center justify-center py-10"><div class="loader mb-2"></div><p class="text-gray-500 animate-pulse">กำลังโหลดข้อมูล...</p></div>`;
        }
        if ('disabled' in button) button.disabled = true;
        button.classList.add('is-loading');
    } else {
        if (loader) loader.classList.add('hidden');
        if (text) text.classList.remove('hidden');
        if (isButtonLike && button.dataset.origHtml) {
            button.innerHTML = button.dataset.origHtml;
            delete button.dataset.origHtml;
        }
        if ('disabled' in button) button.disabled = false;
        button.classList.remove('is-loading');
    }
}

function renderInlineLoader(message = 'กำลังโหลดข้อมูล...') {
    return `<div class="flex flex-col items-center justify-center py-10"><div class="loader mb-2"></div><p class="text-gray-500 animate-pulse">${escapeHtml(message)}</p></div>`;
}

const DEFAULT_SIGNATURE_PAD_OPTIONS = Object.freeze({
    penColor: '#1f4ba8',
    minWidth: 0.7,
    maxWidth: 2.1,
    throttle: 8,
    minDistance: 0.35,
    velocityFilterWeight: 0.52
});

function getSignatureCanvasRatio(multiplier = 1.35) {
    const dpr = window.devicePixelRatio || 1;
    return Math.min(4, Math.max(2, dpr * multiplier));
}

function prepareSignatureCanvas(canvas, options = {}) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(options.width || rect.width || canvas.offsetWidth || 300));
    const cssHeight = Math.max(1, Math.round(options.height || rect.height || canvas.offsetHeight || cssWidth));
    const ratio = getSignatureCanvasRatio(options.multiplier || 1.35);

    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);

    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    return { ctx, ratio, width: cssWidth, height: cssHeight };
}

function createSignaturePad(canvas, previousPad = null, options = {}) {
    if (!canvas || typeof SignaturePad === 'undefined') return null;
    const prepared = prepareSignatureCanvas(canvas, options);
    if (!prepared) return null;

    if (previousPad && typeof previousPad.off === 'function') previousPad.off();

    const pad = new SignaturePad(canvas, {
        ...DEFAULT_SIGNATURE_PAD_OPTIONS,
        ...(options.padOptions || {})
    });

    return { pad, ...prepared };
}

function getImageDimensionsFromDataURL(dataURL) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = dataURL;
    });
}

function optimizeSignatureDataURL(dataURL, options = {}) {
    if (!dataURL) return Promise.resolve(dataURL);
    const padding = Number.isFinite(options.padding) ? options.padding : 8;
    const minAlpha = Number.isFinite(options.minAlpha) ? options.minAlpha : 8;
    const targetHeight = Number.isFinite(options.targetHeight) ? options.targetHeight : 320;
    const maxScale = Number.isFinite(options.maxScale) ? options.maxScale : 2;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = img.width;
            srcCanvas.height = img.height;
            const srcCtx = srcCanvas.getContext('2d');
            srcCtx.drawImage(img, 0, 0);

            const pixels = srcCtx.getImageData(0, 0, img.width, img.height).data;
            let minX = img.width;
            let minY = img.height;
            let maxX = -1;
            let maxY = -1;

            for (let y = 0; y < img.height; y++) {
                for (let x = 0; x < img.width; x++) {
                    const alpha = pixels[(y * img.width + x) * 4 + 3];
                    if (alpha > minAlpha) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (maxX < minX || maxY < minY) {
                resolve(dataURL);
                return;
            }

            minX = Math.max(0, minX - padding);
            minY = Math.max(0, minY - padding);
            maxX = Math.min(img.width - 1, maxX + padding);
            maxY = Math.min(img.height - 1, maxY + padding);

            const cropWidth = Math.max(1, maxX - minX + 1);
            const cropHeight = Math.max(1, maxY - minY + 1);
            const scale = Math.min(maxScale, Math.max(1, targetHeight / cropHeight));
            const outWidth = Math.max(1, Math.round(cropWidth * scale));
            const outHeight = Math.max(1, Math.round(cropHeight * scale));

            const outCanvas = document.createElement('canvas');
            outCanvas.width = outWidth;
            outCanvas.height = outHeight;
            const outCtx = outCanvas.getContext('2d');
            outCtx.imageSmoothingEnabled = true;
            outCtx.imageSmoothingQuality = 'high';
            outCtx.drawImage(srcCanvas, minX, minY, cropWidth, cropHeight, 0, 0, outWidth, outHeight);
            resolve(outCanvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(dataURL);
        img.src = dataURL;
    });
}

let _downloadIndicatorActiveCount = 0;
let _downloadIndicatorHideTimer = null;

function ensureDownloadIndicator() {
    let indicator = document.getElementById('download-indicator');
    if (indicator) return indicator;

    indicator = document.createElement('div');
    indicator.id = 'download-indicator';
    indicator.className = 'download-indicator hidden';
    indicator.innerHTML = `
        <div class="download-indicator-card">
            <div class="loader"></div>
            <div class="download-indicator-text-wrap">
                <div class="download-indicator-title">กำลังดาวน์โหลดข้อมูล</div>
                <div id="download-indicator-message" class="download-indicator-message">กำลังเตรียมไฟล์ กรุณารอสักครู่...</div>
            </div>
        </div>
    `;
    document.body.appendChild(indicator);
    return indicator;
}

function showDownloadIndicator(message = 'กำลังเตรียมไฟล์ กรุณารอสักครู่...') {
    const indicator = ensureDownloadIndicator();
    const messageEl = document.getElementById('download-indicator-message');
    if (messageEl) messageEl.textContent = message;

    _downloadIndicatorActiveCount += 1;
    if (_downloadIndicatorHideTimer) {
        clearTimeout(_downloadIndicatorHideTimer);
        _downloadIndicatorHideTimer = null;
    }
    indicator.classList.remove('hidden');
}

function hideDownloadIndicator(force = false) {
    const indicator = document.getElementById('download-indicator');
    if (!indicator) return;

    if (force) {
        _downloadIndicatorActiveCount = 0;
    } else {
        _downloadIndicatorActiveCount = Math.max(0, _downloadIndicatorActiveCount - 1);
    }

    if (_downloadIndicatorActiveCount === 0) {
        indicator.classList.add('hidden');
    }
}

async function withDownloadIndicator(task, message = 'กำลังเตรียมไฟล์ กรุณารอสักครู่...', minDurationMs = 1200) {
    const startedAt = Date.now();
    showDownloadIndicator(message);
    try {
        return await task();
    } finally {
        const elapsed = Date.now() - startedAt;
        const waitMore = Math.max(0, minDurationMs - elapsed);
        if (waitMore > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMore));
        }
        hideDownloadIndicator();
    }
}

function scheduleDownloadIndicatorHide(delayMs = 2200) {
    if (_downloadIndicatorHideTimer) clearTimeout(_downloadIndicatorHideTimer);
    _downloadIndicatorHideTimer = setTimeout(() => {
        hideDownloadIndicator(true);
        _downloadIndicatorHideTimer = null;
    }, delayMs);
}

function openUrlWithDownloadIndicator(url, message = 'กำลังเปิดไฟล์ กรุณารอสักครู่...') {
    if (!url) return;
    showDownloadIndicator(message);
    window.open(url, '_blank');
    scheduleDownloadIndicatorHide();
}

function triggerBrowserDownload(url, filename, message = 'กำลังดาวน์โหลดไฟล์ กรุณารอสักครู่...') {
    if (!url) return;
    showDownloadIndicator(message);
    const a = document.createElement('a');
    a.href = url;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    scheduleDownloadIndicatorHide();
}

document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link || link.dataset.noDownloadIndicator === 'true') return;
    if (event.defaultPrevented) return;

    const href = (link.getAttribute('href') || '').trim();
    if (!href || href === '#' || href.startsWith('javascript:')) return;

    const looksLikeFileLink =
        link.hasAttribute('download') ||
        link.target === '_blank' ||
        /\.(pdf|docx|doc|xlsx|xls|csv|zip)(\?|#|$)/i.test(href) ||
        href.startsWith('blob:') ||
        href.includes('drive.google.com') ||
        href.includes('/uc?export=download');

    if (!looksLikeFileLink) return;

    showDownloadIndicator(link.dataset.downloadMessage || 'กำลังเปิดไฟล์/ดาวน์โหลดข้อมูล กรุณารอสักครู่...');
    scheduleDownloadIndicatorHide();
});

// ─── Saving Overlay ────────────────────────────────────────────────────────
let _isSaving = false;

function showSavingOverlay(message) {
    _isSaving = true;
    const overlay = document.getElementById('saving-overlay');
    if (!overlay) return;
    const msg = overlay.querySelector('#saving-overlay-message');
    if (msg) msg.textContent = message || 'กำลังบันทึกข้อมูล...';
    overlay.classList.remove('hidden');
}

function hideSavingOverlay() {
    _isSaving = false;
    const overlay = document.getElementById('saving-overlay');
    if (overlay) overlay.classList.add('hidden');
}

window.addEventListener('beforeunload', (e) => {
    if (_isSaving) {
        e.preventDefault();
        e.returnValue = 'กำลังบันทึกข้อมูลอยู่ กรุณาอย่าปิดหน้าต่างนี้';
    }
});

// ปุ่มแบบ inline (ไม่มี id) — ส่ง element โดยตรง เช่น onclick="setButtonLoading(this,true)"
function setButtonLoading(el, loading) {
    if (!el) return;
    if (loading) {
        el.disabled = true;
        el.dataset.origHtml = el.innerHTML;
        el.innerHTML = `<span class="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin align-middle"></span>`;
    } else {
        el.disabled = false;
        if (el.dataset.origHtml) {
            el.innerHTML = el.dataset.origHtml;
            delete el.dataset.origHtml;
        }
    }
}

function getCurrentUser() {
    const userJson = sessionStorage.getItem('currentUser');
    return userJson ? JSON.parse(userJson) : null;
}

function fileToObject(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const parts = reader.result ? reader.result.toString().split(',') : [];
            const data = parts.length > 1 ? parts[1] : '';
            resolve({ filename: file.name, mimeType: file.type, data: data });
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const parts = reader.result ? reader.result.split(',') : [];
        const base64String = parts.length > 1 ? parts[1] : '';
        resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDisplayDate(dateString) {
    if (!dateString) return 'ไม่ระบุ';
    try {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('th-TH', options);
    } catch (e) {
        return 'ไม่ระบุ';
    }
}

// clearRequestsCache ถูกรวมไว้ที่ด้านบนของไฟล์แล้ว

function checkAdminAccess() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

async function loadSpecialPositions() {
    return new Promise(resolve => {
        console.log('Special positions loaded:', Object.keys(specialPositionMap).length);
        resolve();
    });
}

function getStatusColor(status) {
    const statusColors = {
        'เสร็จสิ้น': 'text-green-600 font-semibold',
        'Approved': 'text-green-600 font-semibold',
        'กำลังดำเนินการ': 'text-yellow-600',
        'Pending': 'text-yellow-600',
        'Submitted': 'text-blue-600',
        'รอเอกสาร (เบิก)': 'text-orange-600',
        'นำกลับไปแก้ไข': 'text-red-600',
        'ถูกตีกลับ':      'text-red-700 font-bold',
    };
    return statusColors[status] || 'text-gray-600';
}
// --- PDF MERGE UTILITIES ---

/**
 * ฟังก์ชันรวมไฟล์ PDF (Main PDF + Attachments)
 * @param {Blob} mainPdfBlob - ไฟล์ PDF หลักที่ระบบสร้างขึ้น
 * @param {Array} attachmentFiles - รายการไฟล์แนบ (URL string หรือ File object)
 * @returns {Promise<Blob>} - ไฟล์ PDF ที่รวมเสร็จแล้ว
 */
async function mergePDFs(mainPdfBlob, attachmentFiles = []) {
    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        
        // Helper: โหลดไฟล์ PDF เป็น ArrayBuffer
        const loadPdfBytes = async (source) => {
            if (source instanceof Blob || source instanceof File) {
                return await source.arrayBuffer();
            } else if (typeof source === 'string' && source.startsWith('http')) {
                const res = await fetch(source);
                if (!res.ok) throw new Error(`Cannot fetch PDF: ${source}`);
                return await res.arrayBuffer();
            }
            return null;
        };

        // 1. ใส่ไฟล์หลักก่อน
        const mainBytes = await loadPdfBytes(mainPdfBlob);
        const mainDoc = await PDFDocument.load(mainBytes);
        const copiedPagesMain = await mergedPdf.copyPages(mainDoc, mainDoc.getPageIndices());
        copiedPagesMain.forEach((page) => mergedPdf.addPage(page));

        // 2. วนลูปใส่ไฟล์แนบ
        for (const file of attachmentFiles) {
            try {
                const bytes = await loadPdfBytes(file);
                if (bytes) {
                    const doc = await PDFDocument.load(bytes);
                    const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
            } catch (err) {
                console.warn("Skipping invalid attachment:", err);
            }
        }

        // 3. บันทึกและคืนค่าเป็น Blob
        const mergedBytes = await mergedPdf.save();
        return new Blob([mergedBytes], { type: 'application/pdf' });

    } catch (error) {
        console.error("Merge PDF Error:", error);
        // ถ้า error ให้คืนค่าไฟล์หลักเดิมไปแทน (กันระบบพัง)
        return mainPdfBlob;
    }
}
