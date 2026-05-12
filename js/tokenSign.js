// ==============================================================
// ระบบลงนามผ่านลิงก์เฉพาะ (Token-Based Signing)
// ผู้ลงนามไม่ต้องเข้าสู่ระบบ — เพียงเปิดลิงก์และเซ็นได้เลย
// ==============================================================

// ตัวแปร global สำหรับ token page
window._currentSignToken     = null;
window._currentSignTokenData = null;
window._currentSignReqData   = null;
window._tokenPdfUrl          = null;
window._tokenPdfBytes        = null;

function _escapeHtmlForTokenSign(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _getApprovalOriginalId(docMeta = {}) {
    return docMeta.id || docMeta.requestId || docMeta.refNumber || '';
}

function _getApprovalManagedDocType(docMeta = {}, currentStatus = '') {
    if (currentStatus === 'waiting_admin_review' && docMeta.activeApprovalDocType !== 'command' && docMeta.activeApprovalDocType !== 'dispatch') {
        return 'memo';
    }
    if (typeof getApprovalDocType === 'function') {
        return getApprovalDocType({ ...docMeta, docStatus: currentStatus || docMeta.docStatus });
    }
    if (docMeta.activeApprovalDocType) return docMeta.activeApprovalDocType;
    if (docMeta.docType === 'dispatch' || docMeta.completedDispatchBookUrl || docMeta.dispatchBookUrl || docMeta.dispatchBookPdfUrl) {
        return 'dispatch';
    }
    if (docMeta.docType === 'command' || docMeta.completedCommandUrl || docMeta.commandPdfUrl || docMeta.commandBookUrl) {
        return 'command';
    }
    return 'memo';
}

function _getApprovalDocTypeLabel(docType) {
    if (docType === 'dispatch') return 'หนังสือส่ง';
    if (docType === 'command') return 'คำสั่งไปราชการ';
    return 'บันทึกข้อความ';
}

function _getApprovalPdfUrlForType(req = {}, tokenData = {}) {
    const docType = _getApprovalManagedDocType(req, tokenData.docStatus || req.docStatus);
    if (docType === 'dispatch') {
        return req.currentPdfUrl || req.completedDispatchBookUrl || req.dispatchBookUrl || req.dispatchBookPdfUrl || req.pdfUrl || '';
    }
    if (docType === 'command') {
        return req.currentPdfUrl || req.completedCommandUrl || req.commandPdfUrl || req.commandBookUrl || req.pdfUrl || '';
    }
    return req.currentPdfUrl || req.completedMemoUrl || req.pdfUrl || req.memoPdfUrl || '';
}

function _buildApprovalNotifyMessage(url, recipientLabel, docMeta = {}, currentStatus = '') {
    const docType = _getApprovalManagedDocType(docMeta, currentStatus);
    const requestId = _getApprovalOriginalId(docMeta);
    const purpose = docMeta.purpose || docMeta.docTitle || 'เอกสารไปราชการ';
    const requester = docMeta.requesterName || docMeta.requester || '-';
    const docLabel = _getApprovalDocTypeLabel(docType);
    const lines = [
        `เรียน ${recipientLabel}`,
        `มี${docLabel}รอดำเนินการ`
    ];

    if (docType === 'memo' && requestId) {
        lines.push(`เลขบันทึก: ${requestId}`);
    }
    lines.push(`เรื่อง: ${purpose}`);
    lines.push(`ชื่อผู้ขอ: ${requester}`);
    lines.push(`ลิงก์ลงนาม: ${url}`);

    return {
        docType,
        docLabel,
        requestId,
        message: lines.join('\n')
    };
}

window.memoRequiresCommandBeforeSaraban = function(docMeta = {}, currentStatus = '') {
    const docType = _getApprovalManagedDocType(docMeta, currentStatus);
    if (docType !== 'memo') return false;
    if (currentStatus && currentStatus !== 'waiting_admin_review') return false;
    const hasCommand = !!(docMeta.completedCommandUrl || docMeta.commandPdfUrl || docMeta.commandBookUrl);
    return !hasCommand;
};

function _showCommandRequiredAlert(docMeta = {}) {
    const requestId = _getApprovalOriginalId(docMeta) || 'รายการนี้';
    const purpose = docMeta.purpose || 'ไม่ระบุเรื่อง';
    const message = `บันทึก "${requestId}" ยังไม่มีคำสั่งไปราชการ\n\nเรื่อง: ${purpose}\n\nกรุณาให้แอดมินสร้างคำสั่งก่อน แล้วจึงส่งต่อไปยังงานสารบรรณพร้อมกัน`;
    if (typeof showAlert === 'function') {
        showAlert('ต้องสร้างคำสั่งก่อน', message);
    } else {
        alert(message);
    }
}

// --- 1. สร้าง Token ID แบบสุ่ม ---
function _generateTokenId() {
    if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint8Array(16);
        window.crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- 2. สร้าง Approval Token ผ่าน GAS/Supabase และคืนค่า URL ---
async function generateApprovalToken(requestId, nextDocStatus, docMeta) {
    if (!requestId || !nextDocStatus) return null;

    const token  = _generateTokenId();
    const safeId = requestId.replace(/[\/\\:\.]/g, '-');
    const base = window.location.origin + window.location.pathname;
    const createViaGas = async () => {
        const result = await apiCall('POST', 'createApprovalLinkToken', {
            token,
            requestId,
            safeId,
            docStatus: nextDocStatus,
            docTitle: docMeta?.purpose || docMeta?.docTitle || '',
            requester: docMeta?.requesterName || '',
        });
        const tokenValue = result?.data?.token || token;
        return `${base}?sign=${tokenValue}`;
    };

    try {
        return await createViaGas();
    } catch (e) {
        console.warn("generateApprovalToken error:", e);
        return null;
    }
}

// --- 3. แสดง Dialog สำหรับคัดลอก Link ---
function showApprovalLinkDialog(url, recipientLabel, docMeta = {}, currentStatus = '') {
    const existing = document.getElementById('approval-link-dialog');
    if (existing) existing.remove();
    if (!url) return;

    const notifyPayload = _buildApprovalNotifyMessage(url, recipientLabel, docMeta, currentStatus);
    const escapedUrl = _escapeHtmlForTokenSign(url);
    const escapedMsg = _escapeHtmlForTokenSign(notifyPayload.message);
    const html = `
    <div id="approval-link-dialog"
         class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[300]"
         onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-2xl" onclick="event.stopPropagation()">
        <div class="text-center mb-5">
          <div class="text-4xl mb-2">🔗</div>
          <h3 class="font-bold text-xl text-gray-800">ลิงก์ขั้นตอนถัดไป</h3>
          <p class="text-sm text-gray-500 mt-1">
            ส่งให้ <span class="font-bold text-blue-700">${recipientLabel}</span>
            เพื่อลงนาม (หมดอายุใน 7 วัน)
          </p>
        </div>
        <div class="flex gap-2 mb-3">
          <input type="text" id="_ald_url" value="${escapedUrl}" readonly
            class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none"
            onclick="this.select()">
          <button id="_ald_btn"
            onclick="(function(){
              var u = document.getElementById('_ald_url').value;
              var b = document.getElementById('_ald_btn');
              if(navigator.clipboard){
                navigator.clipboard.writeText(u).then(function(){
                  b.textContent='✅ คัดลอกแล้ว!';
                  b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap';
                });
              } else {
                document.getElementById('_ald_url').select();
                document.execCommand('copy');
                b.textContent='✅ คัดลอกแล้ว!';
                b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap';
              }
            })()"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 whitespace-nowrap">
            📋 คัดลอก
          </button>
        </div>
        <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
          <div class="flex items-center justify-between gap-3 mb-2">
            <p class="text-sm font-bold text-slate-700">ข้อความพร้อมส่งแจ้ง</p>
            <button id="_ald_msg_btn"
              onclick="(function(){
                var u = document.getElementById('_ald_message').value;
                var b = document.getElementById('_ald_msg_btn');
                if(navigator.clipboard){
                  navigator.clipboard.writeText(u).then(function(){
                    b.textContent='✅ คัดลอกข้อความแล้ว';
                    b.className='bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap';
                  });
                } else {
                  document.getElementById('_ald_message').select();
                  document.execCommand('copy');
                  b.textContent='✅ คัดลอกข้อความแล้ว';
                  b.className='bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap';
                }
              })()"
              class="bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-800 whitespace-nowrap">
              📨 คัดลอกข้อความ
            </button>
          </div>
          <textarea id="_ald_message" readonly
            class="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none min-h-[140px]"
            onclick="this.select()">${escapedMsg}</textarea>
          <p class="text-xs text-slate-500 mt-2">ระบบใส่ข้อมูลเรื่องและชื่อผู้ขอให้แล้ว เพื่อให้ส่งต่อผ่าน Line หรือข้อความได้สะดวกขึ้น</p>
        </div>
        <p class="text-xs text-gray-400 text-center mb-4">
          ⚠️ ลิงก์ใช้ได้ครั้งเดียว ผู้รับไม่ต้องเข้าสู่ระบบ
        </p>
        <button onclick="document.getElementById('approval-link-dialog').remove()"
          class="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
          ปิด
        </button>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(() => { const i = document.getElementById('_ald_url'); if (i) i.select(); }, 100);
}

// --- 4. Mark token as used (เรียกหลังลงนามสำเร็จ) ---
async function markCurrentTokenUsed() {
    const token = window._currentSignToken;
    if (!token) return;
    try {
        await apiCall('POST', 'markApprovalLinkTokenUsed', { token });
    } catch (e) {
        console.warn("markCurrentTokenUsed error:", e);
    }
    window._currentSignToken     = null;
    window._currentSignTokenData = null;
    window._currentSignReqData   = null;
}

function _approvalTokenExpiryDate(tokenData) {
    if (!tokenData?.expiresAt) return null;
    if (typeof tokenData.expiresAt?.toDate === 'function') return tokenData.expiresAt.toDate();
    const raw = tokenData.expiresAtMs || tokenData.expiresAt;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function _fetchApprovalTokenData(token) {
    const result = await apiCall('GET', 'getApprovalLinkToken', { token });
    return result?.data || null;
}

async function _fetchApprovalRequestData(tokenData) {
    if (!tokenData) return null;

    if (tokenData.requestId) {
        try {
            const result = await apiCall('GET', 'getDraftRequest', { requestId: tokenData.requestId });
            if (result?.data) return result.data;
            if (result && !result.status) return result;
        } catch (e) {
            console.warn('fetchApprovalRequestData draft fallback error:', e);
        }

        try {
            const result = await apiCall('GET', 'getRequestById', { requestId: tokenData.requestId });
            if (result?.status === 'success' && result?.data) return result.data;
        } catch (e) {
            console.warn('fetchApprovalRequestData requestById fallback error:', e);
        }
    }
    return null;
}

// --- 5. แสดงผลสำเร็จบน Token Page พร้อมลิงก์ขั้นถัดไป ---
function showTokenSignSuccess(nextStatus, linkUrl) {
    const contentEl = document.getElementById('token-content');
    if (!contentEl) return;

    const nextLabel = (typeof getDocStatusLabel === 'function')
        ? getDocStatusLabel(nextStatus)
        : (nextStatus || '');

    let linkSection = '';
    if (linkUrl && nextStatus) {
        linkSection = `
        <div class="mt-4">
          <p class="text-sm text-gray-600 mb-2 font-semibold">🔗 ลิงก์สำหรับ ${nextLabel}:</p>
          <div class="flex gap-2">
            <input type="text" value="${linkUrl}" readonly id="_ts_link"
              class="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none"
              onclick="this.select()">
            <button onclick="(function(){
                var u=document.getElementById('_ts_link').value;
                var b=this;
                if(navigator.clipboard){navigator.clipboard.writeText(u).then(function(){b.textContent='✅';b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold';});}
                else{document.getElementById('_ts_link').select();document.execCommand('copy');b.textContent='✅';b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold';}
              }).call(this)"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">
              📋
            </button>
          </div>
        </div>`;
    }

    contentEl.innerHTML = `
      <div class="text-center p-5 bg-green-50 rounded-xl border border-green-200 mb-2">
        <div class="text-4xl mb-2">✅</div>
        <p class="font-bold text-green-800 text-lg">ดำเนินการสำเร็จ</p>
        ${nextStatus
            ? `<p class="text-sm text-green-600 mt-1">เอกสารส่งต่อไปยัง: <strong>${nextLabel}</strong></p>`
            : '<p class="text-sm text-green-600 mt-1">ขั้นตอนสุดท้ายเสร็จสิ้น</p>'}
      </div>
      ${linkSection}`;
    contentEl.classList.remove('hidden');
}

// --- 6. ตรวจสอบ Token และแสดง UI สำหรับลงนาม ---
async function handleTokenSignFlow(token) {
    const overlay   = document.getElementById('token-sign-overlay');
    const loginEl   = document.getElementById('login-screen');
    const mainAppEl = document.getElementById('main-app');

    if (overlay)   overlay.classList.remove('hidden');
    if (loginEl)   loginEl.classList.add('hidden');
    if (mainAppEl) mainAppEl.classList.add('hidden');

    const loadingEl = document.getElementById('token-loading');
    const infoEl    = document.getElementById('token-info');
    const contentEl = document.getElementById('token-content');
    const errorEl   = document.getElementById('token-error');

    try {
        const td = await _fetchApprovalTokenData(token);
        if (!td) throw new Error("ลิงก์ไม่ถูกต้อง หรือไม่พบในระบบ");
        if (td.used) throw new Error("ลิงก์นี้ถูกใช้งานไปแล้ว เอกสารได้รับการดำเนินการเรียบร้อยแล้ว");
        const expiryDate = _approvalTokenExpiryDate(td);
        if (expiryDate && new Date() > expiryDate) {
            throw new Error("ลิงก์หมดอายุแล้ว (เกิน 7 วัน) กรุณาขอลิงก์ใหม่จากผู้ส่ง");
        }

        // แจ้งเตือนถ้าลิงก์ใกล้หมดอายุ (น้อยกว่า 24 ชั่วโมง)
        if (expiryDate) {
            const msLeft = expiryDate - new Date();
            if (msLeft > 0 && msLeft < 24 * 60 * 60 * 1000) {
                const hoursLeft = Math.max(1, Math.floor(msLeft / (60 * 60 * 1000)));
                const warningBanner = document.createElement('div');
                warningBanner.className = 'bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-xl px-4 py-3 mb-3 flex items-center gap-2';
                warningBanner.innerHTML = `<span class="text-lg">⏰</span><span>ลิงก์นี้จะหมดอายุใน <strong>${hoursLeft} ชั่วโมง</strong> กรุณาดำเนินการโดยเร็ว</span>`;
                const infoContainer = document.getElementById('token-info');
                if (infoContainer) infoContainer.insertAdjacentElement('afterbegin', warningBanner);
            }
        }

        const req = await _fetchApprovalRequestData(td);
        if (!req) throw new Error("ไม่พบเอกสารในระบบ");
        const pdfUrl = _getApprovalPdfUrlForType(req, td);
        if (!pdfUrl) throw new Error("ไม่พบไฟล์ PDF ของเอกสาร");

        // แสดงข้อมูลเอกสาร
        document.getElementById('token-doc-title').textContent     = req.purpose       || 'เอกสารไปราชการ';
        document.getElementById('token-doc-requester').textContent = req.requesterName || '-';
        document.getElementById('token-doc-date').textContent      = req.startDate     || req.date || '-';
        document.getElementById('token-doc-step').textContent      =
            (typeof getDocStatusLabel === 'function') ? getDocStatusLabel(td.docStatus) : td.docStatus;

        // เก็บไว้ใช้ภายหลัง
        window._currentSignToken     = token;
        window._currentSignTokenData = td;
        window._currentSignReqData   = req;

        if (loadingEl) loadingEl.classList.add('hidden');
        if (infoEl)    infoEl.classList.remove('hidden');
        if (!contentEl) return;
        contentEl.classList.remove('hidden');

        // --- สร้างปุ่มตาม docStatus ---
        if (td.docStatus === 'waiting_saraban') {
            // สารบรรณ: โหลด PDF bytes แล้วเปิด saraban modal
            // ⚠️ ห้าม fetch(Drive URL) โดยตรง → CORS blocked
            // ใช้ pdfBase64 จาก Firestore (เร็วสุด) หรือ GAS proxy แทน
            const _GAS_SARABAN = "https://script.google.com/macros/s/AKfycbyyUHx5gy7SFow_xex1Jt8TorLaWpxIgoYausg9z8QuSfoL8g_1r5on104A2m-PbGIWpA/exec";
            const _b64ToBuf = (b64) => {
                const bin = window.atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                return bytes.buffer;
            };
            let pdfBuffer = null;

            // 🚀 เส้นทาง 0: pdfBase64 จาก Firestore (ดึงมาพร้อม reqDoc แล้ว — ไม่ต้อง fetch เพิ่ม)
            if (req.pdfBase64) {
                try {
                    const buf = _b64ToBuf(req.pdfBase64);
                    if (String.fromCharCode(...new Uint8Array(buf, 0, 4)) === '%PDF') {
                        pdfBuffer = buf;
                        console.log('🚀 saraban token: PDF loaded from Firestore cache — instant!');
                    }
                } catch (e) { console.warn('saraban pdfBase64 decode error:', e.message); }
            }
            // ⚠️ เส้นทาง 1: GAS proxy (Drive URL, ไม่มี Firestore cache)
            if (!pdfBuffer && pdfUrl.includes('drive.google.com')) {
                const driveId = (pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || pdfUrl.match(/id=([a-zA-Z0-9_-]+)/))?.[1];
                if (driveId) {
                    const gasResp = await fetch(`${_GAS_SARABAN}?action=getPdfBase64&fileId=${driveId}`);
                    const gasData = await gasResp.json();
                    if (gasData.status === 'success') {
                        pdfBuffer = _b64ToBuf(gasData.data);
                    } else {
                        throw new Error('GAS proxy: ' + (gasData.message || 'โหลด PDF ไม่สำเร็จ'));
                    }
                }
            }
            // ⚠️ เส้นทาง 2: direct fetch (non-Drive URL เช่น Firebase Storage — ไม่มี CORS)
            if (!pdfBuffer && pdfUrl && !pdfUrl.includes('drive.google.com')) {
                const resp = await fetch(pdfUrl);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                pdfBuffer = await resp.arrayBuffer();
            }
            if (!pdfBuffer) throw new Error('ไม่สามารถโหลดไฟล์ PDF ได้');

            window._tokenPdfBytes = pdfBuffer;
            window._tokenPdfUrl   = pdfUrl;

            const docType = _getApprovalManagedDocType(req, td.docStatus);

            if (docType === 'command' || docType === 'dispatch') {
                const buttonText = docType === 'dispatch'
                    ? '📦 เปิดระบบออกเลขหนังสือส่งและวันที่'
                    : '📝 เปิดระบบออกเลขที่และวันที่';
                contentEl.innerHTML = `
                  <button onclick="openSarabanModal(window._tokenPdfBytes, '${td.requestId}', '${docType}', '${pdfUrl}')"
                    class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 text-lg shadow-md">
                    ${buttonText}
                  </button>`;
            } else {
                contentEl.innerHTML = `
                  <div class="space-y-3">
                    <a href="${pdfUrl}" target="_blank"
                      class="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex justify-center items-center gap-2 font-medium">
                      📄 ดูเอกสาร PDF
                    </a>
                    <button onclick="openSarabanModal(window._tokenPdfBytes, '${td.requestId}', 'memo', '${pdfUrl}')"
                      class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 text-lg shadow-md">
                      ✅ ตรวจสอบแล้ว ส่งผู้อำนวยการ
                    </button>
                  </div>`;
            }

        } else if (td.docStatus === 'waiting_admin_review') {
            // แอดมิน: ไม่ต้องเซ็น แค่กด forward
            if (typeof memoRequiresCommandBeforeSaraban === 'function' && memoRequiresCommandBeforeSaraban(req, td.docStatus)) {
                contentEl.innerHTML = `
                  <div class="space-y-3">
                    <a href="${pdfUrl}" target="_blank"
                      class="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex justify-center items-center gap-2 font-medium">
                      📄 ดูเอกสาร PDF
                    </a>
                    <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
                      <p class="font-bold text-amber-900 mb-1">📝 ต้องสร้างคำสั่งไปราชการก่อน</p>
                      <p class="text-sm text-amber-800 leading-relaxed">
                        เรื่องนี้ยังไม่สามารถส่งไปงานสารบรรณได้ เพราะยังไม่มีไฟล์คำสั่งไปราชการ
                        กรุณาให้แอดมินกลับเข้าในระบบหลักเพื่อสร้างคำสั่ง แล้วจึงส่งเรื่องนี้พร้อมกันอีกครั้ง
                      </p>
                    </div>
                  </div>`;
            } else {
                contentEl.innerHTML = `
                  <div class="space-y-3">
                    <a href="${pdfUrl}" target="_blank"
                      class="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex justify-center items-center gap-2 font-medium">
                      📄 ดูเอกสาร PDF
                    </a>
                    <button onclick="tokenAdminForward()"
                      class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 text-lg shadow-md">
                      ✅ ตรวจสอบแล้ว ส่งไปงานสารบรรณ
                    </button>
                  </div>`;
            }

        } else {
            // ทุก role ที่ต้องเซ็น (หัวหน้า, รองบุคคล, รองวิชาการ, ผอ.)
            window._tokenPdfUrl = pdfUrl;
            contentEl.innerHTML = `
              <div class="space-y-3">
                <a href="${pdfUrl}" target="_blank"
                  class="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex justify-center items-center gap-2 font-medium">
                  📄 ดูเอกสาร PDF
                </a>
                <button onclick="openTokenSignatureSystem()"
                  class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 text-lg shadow-md">
                  ✍️ เปิดเอกสารและลงนาม
                </button>
              </div>`;
        }

    } catch (e) {
        console.error("Token sign error:", e);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errorEl) {
            errorEl.textContent = '❌ ' + e.message;
            errorEl.classList.remove('hidden');
        }
    }
}

// --- 7. เปิด Signature System จาก Token Page ---
function openTokenSignatureSystem() {
    const td = window._currentSignTokenData;
    if (!td || !window._tokenPdfUrl) return;
    openSignatureSystem(window._tokenPdfUrl, td.requestId, '✍️ ลงนามเอกสาร', td.docStatus);
}

// --- 8. Admin forward จาก Token Page (ไม่ต้องเซ็น) ---
async function tokenAdminForward() {
    const td  = window._currentSignTokenData;
    const req = window._currentSignReqData || {};
    if (!td) return;
    if (typeof memoRequiresCommandBeforeSaraban === 'function' && memoRequiresCommandBeforeSaraban(req, td.docStatus)) {
        _showCommandRequiredAlert(req);
        return;
    }
    try {
        showAlert('กำลังดำเนินการ', 'กำลังส่งเอกสารไปงานสารบรรณ...', false);
        await apiCall('POST', 'updateRequest', {
            requestId: td.requestId,
            docStatus: 'waiting_saraban',
            adminReviewedAt: new Date().toISOString(),
            adminReviewedBy: getCurrentUser()?.name || getCurrentUser()?.username || 'admin',
            lastUpdated: new Date().toISOString()
        });
        await markCurrentTokenUsed();

        document.getElementById('alert-modal').style.display = 'none';
        showTokenSignSuccess('waiting_saraban', null);
    } catch (e) {
        try {
            await apiCall('POST', 'updateRequest', {
                requestId: td.requestId,
                docStatus: 'waiting_saraban',
                adminReviewedAt: new Date().toISOString(),
                adminReviewedBy: getCurrentUser()?.name || getCurrentUser()?.username || 'admin',
                lastUpdated: new Date().toISOString()
            });
            await markCurrentTokenUsed();
            document.getElementById('alert-modal').style.display = 'none';
            showTokenSignSuccess('waiting_saraban', null);
            return;
        } catch (fallbackError) {
            console.warn('tokenAdminForward fallback error:', fallbackError);
        }
        document.getElementById('alert-modal').style.display = 'none';
        alert("เกิดข้อผิดพลาด: " + e.message);
    }
}

// ==============================================================
// ระบบจัดการลิงก์ลงนาม (สำหรับแอดมินเท่านั้น)
// ==============================================================

// Cache เอกสารสำหรับหน้าจัดการลิงก์
window._adminApprovalDocs = {};

function _getApprovalStatusOrder() {
    return [
        'waiting_head_thai',      'waiting_head_foreign',   'waiting_head_science',
        'waiting_head_art',       'waiting_head_social',    'waiting_head_health',
        'waiting_head_career',    'waiting_head_math',
        'waiting_head_guidance',  'waiting_head_general',
        'waiting_head_personnel', 'waiting_head_budget',    'waiting_head_acad',
        'waiting_deputy_personnel',  'waiting_deputy_acad',
        'waiting_deputy_general',    'waiting_deputy_budget',
        'waiting_admin_review',   'waiting_saraban',        'waiting_director',
        'waiting_admin_final',
    ];
}

function _getApprovalGroupMeta() {
    const O = 'border-orange-300 bg-orange-50';
    const Ob = 'bg-orange-100 text-orange-700';
    const B = 'border-blue-300 bg-blue-50';
    const Bb = 'bg-blue-100 text-blue-700';
    return {
        'waiting_head_thai':      { label: 'หัวหน้ากลุ่มสาระภาษาไทย',           color: O, badge: Ob },
        'waiting_head_foreign':   { label: 'หัวหน้ากลุ่มสาระภาษาต่างประเทศ',    color: O, badge: Ob },
        'waiting_head_science':   { label: 'หัวหน้ากลุ่มสาระวิทยาศาสตร์ฯ',      color: O, badge: Ob },
        'waiting_head_art':       { label: 'หัวหน้ากลุ่มสาระศิลปะ',             color: O, badge: Ob },
        'waiting_head_social':    { label: 'หัวหน้ากลุ่มสาระสังคมศึกษาฯ',       color: O, badge: Ob },
        'waiting_head_health':    { label: 'หัวหน้ากลุ่มสาระสุขศึกษาฯ',         color: O, badge: Ob },
        'waiting_head_career':    { label: 'หัวหน้ากลุ่มสาระการงานอาชีพ',       color: O, badge: Ob },
        'waiting_head_math':      { label: 'หัวหน้ากลุ่มสาระคณิตศาสตร์',        color: O, badge: Ob },
        'waiting_head_guidance':  { label: 'หัวหน้างานแนะแนว',                  color: O, badge: Ob },
        'waiting_head_general':   { label: 'หัวหน้ากลุ่มบริหารทั่วไป',           color: O, badge: Ob },
        'waiting_head_personnel': { label: 'หัวหน้ากลุ่มบริหารงานบุคคล',         color: O, badge: Ob },
        'waiting_head_budget':    { label: 'หัวหน้ากลุ่มบริหารงบประมาณ',         color: O, badge: Ob },
        'waiting_head_acad':      { label: 'หัวหน้ากลุ่มบริหารวิชาการ',          color: O, badge: Ob },
        'waiting_deputy_personnel':  { label: 'รองผู้อำนวยการ กลุ่มบริหารงานบุคคล', color: B, badge: Bb },
        'waiting_deputy_acad':       { label: 'รองผู้อำนวยการ กลุ่มบริหารวิชาการ',  color: B, badge: Bb },
        'waiting_deputy_general':    { label: 'รองผู้อำนวยการ กลุ่มบริหารทั่วไป',   color: B, badge: Bb },
        'waiting_deputy_budget':     { label: 'รองผู้อำนวยการ กลุ่มบริหารงบประมาณ', color: B, badge: Bb },
        'waiting_admin_review':   { label: 'แอดมิน (ตรวจสอบก่อนส่งสารบรรณ)',    color: 'border-yellow-300 bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700' },
        'waiting_saraban':        { label: 'งานสารบรรณ',                         color: 'border-indigo-300 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
        'waiting_director':       { label: 'ผู้อำนวยการ (ลงนาม)',                color: 'border-red-300 bg-red-50',       badge: 'bg-red-100 text-red-700' },
        'waiting_admin_final':    { label: 'แอดมิน (ไฟนอลงาน)',                  color: 'border-green-300 bg-green-50',   badge: 'bg-green-100 text-green-700' },
    };
}

function _cacheApprovalDocs(allDocs = []) {
    window._adminApprovalDocs = {};
    allDocs.forEach(doc => {
        const safeKey = String(doc.safeId || doc.safeKey || '').trim();
        const originalId = String(doc.id || doc.requestId || doc.refNumber || '').trim();
        if (safeKey) window._adminApprovalDocs[safeKey] = doc;
        if (originalId) window._adminApprovalDocs[originalId] = doc;
        if (doc.requestId) window._adminApprovalDocs[String(doc.requestId)] = doc;
    });
}

function _renderApprovalLinkManagementDocs(container, allDocs, sourceLabel = '') {
    _cacheApprovalDocs(allDocs);

    if (!allDocs.length) {
        container.innerHTML = `
          <div class="text-center py-12 text-gray-400">
            <div class="text-5xl mb-3">📭</div>
            <p class="text-lg font-medium">ไม่มีเอกสารรอดำเนินการ</p>
            <p class="text-sm mt-1">เอกสารทั้งหมดได้รับการดำเนินการเรียบร้อยแล้ว</p>
          </div>`;
        return;
    }

    const grouped = {};
    allDocs.forEach(doc => {
        const s = doc.docStatus || 'unknown';
        if (!grouped[s]) grouped[s] = [];
        grouped[s].push(doc);
    });

    const statusOrder = _getApprovalStatusOrder();
    const groupMeta = _getApprovalGroupMeta();
    let html = sourceLabel
        ? `<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">⚠️ กำลังใช้ข้อมูลสำรองจาก ${sourceLabel} เนื่องจากสิทธิ์ Firestore ไม่เพียงพอสำหรับการ query ตรง</div>`
        : '';

    statusOrder.forEach(status => {
        const items = grouped[status];
        if (!items || items.length === 0) return;
        const meta = groupMeta[status] || { label: status, color: 'border-gray-300 bg-gray-50', badge: 'bg-gray-100 text-gray-700' };

        html += `
        <div class="border-2 ${meta.color} rounded-xl p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-gray-700 flex items-center gap-2 text-sm sm:text-base">
              🔐 รอลงนาม: <span class="text-blue-700">${meta.label}</span>
            </h3>
            <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold ${meta.badge} whitespace-nowrap">${items.length} รายการ</span>
          </div>
          <div class="space-y-2">`;

        items.forEach(doc => {
            const purpose = String(doc.purpose || 'เอกสารไปราชการ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            const requester = String(doc.requesterName || '-').replace(/&/g,'&amp;').replace(/</g,'&lt;');
            const date = doc.startDate || doc.date || doc.docDate || '-';
            const docId = doc.safeId || doc.safeKey || doc.id;
            const docType = _getApprovalManagedDocType(doc, status);
            const docLabel = _getApprovalDocTypeLabel(docType);
            const needsCommandFirst = typeof memoRequiresCommandBeforeSaraban === 'function'
                && memoRequiresCommandBeforeSaraban(doc, status);
            const escapedDocId = String(docId || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const buttonDomId = `alm-btn-${String(docId || '').replace(/[^A-Za-z0-9_-]/g, '_')}`;
            const typeBadgeCls = docType === 'dispatch'
                ? 'bg-rose-100 text-rose-700'
                : (docType === 'command' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700');

            html += `
            <div class="bg-white rounded-lg border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${typeBadgeCls}">${docLabel}</span>
                  ${needsCommandFirst ? '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">ต้องสร้างคำสั่งก่อนส่งสารบรรณ</span>' : ''}
                </div>
                <p class="font-medium text-gray-800 text-sm truncate">${purpose}</p>
                <p class="text-xs text-gray-500 mt-0.5">ผู้ขอ: ${requester} &nbsp;|&nbsp; วันที่: ${date}</p>
              </div>
              <div class="flex flex-col sm:flex-row gap-1.5 flex-shrink-0">
                ${needsCommandFirst ? `
                <button
                  onclick="openAdminGenerateCommand('${escapedDocId}')"
                  class="w-full sm:w-auto px-4 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap">
                  📝 สร้างคำสั่งก่อน
                </button>` : `
                <button id="${buttonDomId}"
                  onclick="adminGenerateLink(this, '${escapedDocId}', '${status}')"
                  class="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                  🔗 สร้างลิงก์ส่งให้
                </button>`}
                ${status !== 'waiting_admin_review' ? `<button
                  onclick="adminSkipStep('${escapedDocId}', '${status}')"
                  class="w-full sm:w-auto px-3 py-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1 transition-colors whitespace-nowrap">
                  ⏭️ ข้ามขั้นตอนนี้
                </button>` : ''}
              </div>
            </div>`;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
}

async function _loadApprovalDocsFromGasFallback() {
    const statuses = _getApprovalStatusOrder();
    const approvalResults = await Promise.all(
        statuses.map(status =>
            apiCall('GET', 'getApprovalRequests', { docStatus: status }).catch(() => ({ status: 'error', data: [] }))
        )
    );

    const docs = [];
    const seen = new Set();

    const pushDoc = (raw, sourceType) => {
        const docStatus = raw.docStatus || raw.statusFlow || '';
        if (!statuses.includes(docStatus)) return;
        const originalId = raw.id || raw.requestId || raw.refNumber || '';
        const safeId = String(originalId).replace(/[\/\\:\.]/g, '-');
        const key = `${sourceType}:${safeId || originalId}`;
        if (!originalId || seen.has(key)) return;
        seen.add(key);
        docs.push({
            ...raw,
            sourceType,
            safeId,
            requestId: raw.requestId || raw.id || raw.refNumber || '',
            id: originalId,
            requesterName: raw.requesterName || raw.submittedBy || raw.username || '',
            purpose: raw.purpose || raw.subject || raw.docTitle || '',
            startDate: raw.startDate || raw.date || '',
            docDate: raw.docDate || raw.date || '',
        });
    };

    approvalResults.forEach(result => {
        (result?.data || []).forEach(item => pushDoc(item, 'request'));
    });
    return docs;
}

// --- 9. Admin: โหลดและแสดงหน้าจัดการลิงก์ลงนาม ---
async function loadApprovalLinkManagement() {
    if (typeof switchPage === 'function') switchPage('admin-approval-links-page');

    const container = document.getElementById('approval-links-container');
    if (!container) return;
    container.innerHTML = '<div class="flex justify-center py-10"><div class="loader"></div></div>';

    try {
        const result = await apiCall('GET', 'getApprovalManagementDocs').catch(() => ({ status: 'error', data: null, message: '' }));
        if (result.status === 'success' && Array.isArray(result.data)) {
            _renderApprovalLinkManagementDocs(container, result.data);
            return;
        }

        const message = String(result?.message || '');
        if (message && !message.includes('Invalid GET action specified')) {
            throw new Error(message);
        }

        const docs = await _loadApprovalDocsFromGasFallback();
        _renderApprovalLinkManagementDocs(container, docs, 'GAS เฉพาะสถานะอนุมัติ');
    } catch (e) {
        console.error("loadApprovalLinkManagement error:", e);
        const errP = document.createElement('p');
        errP.className = 'text-center text-red-500 py-8';
        errP.textContent = '⚠️ เกิดข้อผิดพลาด: ' + String(e?.message || e || '');
        container.innerHTML = '';
        container.appendChild(errP);
    }
}

// --- 10. Admin: สร้างลิงก์ส่งให้ผู้อนุมัติรายเอกสาร ---
async function adminGenerateLink(btn, requestId, docStatus) {
    if (!requestId || !docStatus) return;

    const origHTML  = btn.innerHTML;
    const origClass = btn.className;
    btn.disabled    = true;
    btn.innerHTML   = '⏳ กำลังสร้าง...';

    try {
        const docMeta = window._adminApprovalDocs[requestId] || {};
        if (typeof memoRequiresCommandBeforeSaraban === 'function' && memoRequiresCommandBeforeSaraban(docMeta, docStatus)) {
            _showCommandRequiredAlert(docMeta);
            btn.disabled  = false;
            btn.innerHTML = origHTML;
            btn.className = origClass;
            return;
        }
        const url     = await generateApprovalToken(requestId, docStatus, docMeta);
        if (!url) throw new Error('ไม่สามารถสร้างลิงก์ได้ กรุณาตรวจสอบการเชื่อมต่อ');

        const label = (typeof getDocStatusLabel === 'function')
            ? getDocStatusLabel(docStatus) : docStatus;
        showApprovalLinkDialog(url, label, docMeta, docStatus);

        btn.innerHTML = '✅ สร้างลิงก์แล้ว';
        btn.className = 'flex-shrink-0 w-full sm:w-auto px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5';

        setTimeout(() => {
            btn.disabled  = false;
            btn.innerHTML = origHTML;
            btn.className = origClass;
        }, 4000);

    } catch (e) {
        console.error("adminGenerateLink error:", e);
        alert("เกิดข้อผิดพลาดในการสร้างลิงก์: " + e.message);
        btn.disabled  = false;
        btn.innerHTML = origHTML;
        btn.className = origClass;
    }
}

// --- 11. Admin: ข้ามขั้นตอนการลงนาม ---
async function adminSkipStep(docId, currentStatus) {
    const label   = (typeof getDocStatusLabel === 'function')
        ? getDocStatusLabel(currentStatus) : currentStatus;
    const docMeta = window._adminApprovalDocs?.[docId] || {};
    const purpose = docMeta.purpose || docId;

    if (!confirm(
        `ยืนยันข้ามขั้นตอน:\n"${label}"\n\nเอกสาร: ${purpose}\n\n` +
        `เอกสารจะกลับมาหาแอดมินก่อน แล้วแอดมินเลือกส่งต่อได้เลย`
    )) return;

    const user      = getCurrentUser();
    // roleKey = waiting_head_thai → head_thai  (ตัดคำนำหน้า waiting_)
    const roleKey   = currentStatus.replace(/^waiting_/, '');
    // original ID (อาจมี / หรือ . ซึ่ง GAS ต้องการ) ดึงจาก cache
    const origDocId = docMeta.id || docMeta.requestId || docId;

    try {
        if (typeof showAlert === 'function')
            showAlert('กำลังดำเนินการ', 'กำลังข้ามขั้นตอน...', false);

        const updateData = {
            docStatus:                      'waiting_admin_review',
            [`skippedStep_${roleKey}`]:     true,
            [`skippedBy_${roleKey}`]:       user?.name || user?.username || 'admin',
            [`skippedAt_${roleKey}`]:       new Date().toISOString(),
            lastUpdated:                    new Date().toISOString(),
        };

        await apiCall('POST', 'updateRequest', {
            requestId: origDocId,
            docStatus: 'waiting_admin_review',
            ...updateData,
        });

        // sync ข้อมูลเข้า _approvalDocs เพื่อให้ adminRouteDocument อ่านได้
        window._approvalDocs = window._approvalDocs || {};
        window._approvalDocs[docId] = {
            ...docMeta,
            docStatus: 'waiting_admin_review',
            [`skippedStep_${roleKey}`]: true,
            [`skippedBy_${roleKey}`]:   user?.name || user?.username || 'admin',
        };

        // ปิด loading alert
        const alertEl = document.getElementById('alert-modal');
        if (alertEl) alertEl.style.display = 'none';

        // รีโหลดรายการในหน้าจัดการลิงก์ (background)
        setTimeout(() => loadApprovalLinkManagement(), 300);

        // เปิด route modal ให้แอดมินเลือกส่งต่อทันที
        if (typeof adminRouteDocument === 'function') {
            adminRouteDocument(docId);
        } else {
            if (typeof showAlert === 'function')
                showAlert('✅ ข้ามสำเร็จ',
                    `ข้ามขั้นตอน "${label}" แล้ว\nกรุณาไปที่หน้ารออนุมัติเพื่อส่งต่อ`);
        }

    } catch (e) {
        const alertEl = document.getElementById('alert-modal');
        if (alertEl) alertEl.style.display = 'none';
        if (typeof showAlert === 'function') showAlert('❌ ผิดพลาด', e.message);
        else alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}
