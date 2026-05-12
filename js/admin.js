// --- ADMIN FUNCTIONS ---

// ตรวจสอบสิทธิ์ Admin (Client-side check)
function checkAdminAccess() {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
        return false;
    }
    return true;
}

// --- FETCH DATA ---
// --- แก้ไข: ดึงข้อมูลเนื้อหาจาก Google Sheet เป็นหลัก 100% ---
// --- แก้ไข: เรียงลำดับจาก เลขที่เอกสาร (ล่าสุดขึ้นก่อน) และกรองปีงบประมาณ ---
// --- FETCH DATA (Admin) ---
// ดึงข้อมูลคำขอทั้งหมด (สำหรับหน้าออกคำสั่ง) แบบโหลดเฉพาะเดือนล่าสุดของปีที่เลือกก่อน
async function fetchAllRequestsForCommand() {
    try {
        // 1. ตรวจสอบสิทธิ์ Admin เบื้องต้น (Client-side)
        if (!checkAdminAccess()) return;
        
        // 2. แสดง Loader
        const container = isCompactAdminCardView()
            ? document.getElementById('admin-requests-cards')
            : document.getElementById('admin-requests-table-list');
        if (container) {
            container.innerHTML = isCompactAdminCardView()
                ? `<div class="admin-card-loading"><span class="loader"></span><p class="text-gray-500 animate-pulse mt-2">กำลังโหลดข้อมูลคำขอของเดือนล่าสุด...</p></div>`
                : `<tr><td colspan="9" class="text-center py-12"><div class="flex flex-col items-center justify-center gap-2"><span class="loader"></span><p class="text-gray-500 animate-pulse mt-2">กำลังโหลดข้อมูลคำขอของเดือนล่าสุด...</p></div></td></tr>`;
        }

        // 3. ดึงปีงบประมาณที่เลือกจาก Dropdown
        const yearSelect = document.getElementById('admin-year-select');
        const currentYear = new Date().getFullYear() + 543;
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;
        
        console.log(`📥 Fetching latest-month admin requests for year: ${selectedYear}`);

        // ── 4. ดึงข้อมูลจาก Supabase ผ่าน GAS เฉพาะเดือนล่าสุดของปีที่เลือก ──
        const gasResult = await apiCall('GET', 'getAllRequests', {
            year: selectedYear,
            latestMonth: 'true'
        });
        if (gasResult.status !== 'success') {
            throw new Error(gasResult.message || 'ไม่สามารถดึงข้อมูลจาก Supabase ได้');
        }
        let requests = gasResult.data || [];
        console.log(`📋 Admin loaded ${requests.length} requests from Supabase`);

        // 8. เรียงลำดับ (Sort): เลขที่เอกสารมาก -> น้อย (ล่าสุดขึ้นก่อน)
        requests.sort((a, b) => {
            const parseId = (id) => {
                if (!id) return 0;
                try {
                    // แยกเลขหน้าเครื่องหมาย / (เช่น "บค005/2569" -> 5)
                    const parts = id.split('/');
                    const numberPart = parseInt(parts[0].replace(/\D/g, '')) || 0;
                    return numberPart;
                } catch (e) { return 0; }
            };

            const idNumA = parseId(a.id);
            const idNumB = parseId(b.id);

            if (idNumA !== idNumB) return idNumB - idNumA; // เลขมากขึ้นก่อน

            // ถ้าเลขเท่ากัน หรือไม่มีเลข ให้ใช้วันที่
            const getTime = (val) => {
                if (!val) return 0;
                if (val.seconds) return val.seconds * 1000; // Firestore Timestamp
                return new Date(val).getTime();
            };
            return getTime(b.timestamp || b.docDate) - getTime(a.timestamp || a.docDate);
        });

        console.log(`✅ Loaded ${requests.length} admin requests.`);

        // 9. อัปเดต Cache และแสดงผล
        allRequestsCache = requests; 
        window.allRequestsCacheScope = 'latest-month-admin';
        _applyRequestFilterAndSearch();

    } catch (error) { 
        console.error("❌ fetchAllRequestsForCommand Error:", error);
        
        const container = isCompactAdminCardView()
            ? document.getElementById('admin-requests-cards')
            : document.getElementById('admin-requests-table-list');
        if (container) {
            container.innerHTML = isCompactAdminCardView()
                ? `<div class="admin-card-empty"><p class="text-red-500 font-medium">ไม่สามารถโหลดข้อมูลได้</p><p class="text-sm text-gray-500 mt-2">${error.message}</p><button onclick="fetchAllRequestsForCommand()" class="btn btn-sm bg-gray-200 hover:bg-gray-300 mt-4">ลองใหม่อีกครั้ง</button></div>`
                : `<tr><td colspan="9" class="text-center py-10"><p class="text-red-500 font-medium">ไม่สามารถโหลดข้อมูลได้</p><p class="text-sm text-gray-500 mt-2">${error.message}</p><button onclick="fetchAllRequestsForCommand()" class="btn btn-sm bg-gray-200 hover:bg-gray-300 mt-4">ลองใหม่อีกครั้ง</button></td></tr>`;
        }
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้: ' + error.message); 
    }
}
async function fetchAllMemos() {
    try {
        if (!checkAdminAccess()) return;
        const yearSelect = document.getElementById('admin-year-select');
        const currentYear = new Date().getFullYear() + 543;
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;

        const result = await apiCall('GET', 'getAllMemos', {
            year: selectedYear,
            latestMonth: 'true'
        });

        if (result.status === 'success') {
            let memos = result.data || [];

            // เรียงลำดับล่าสุดก่อน
            memos.sort((a, b) => {
                const tA = new Date(a.timestamp || 0).getTime();
                const tB = new Date(b.timestamp || 0).getTime();
                return tB - tA;
            });

            allMemosCache = memos;
            window.allMemosCacheScope = 'latest-month-admin';
            filterAdminMemos(typeof _currentMemoFilter !== 'undefined' ? _currentMemoFilter : 'all');
        }
    } catch (error) {
        console.error('fetchAllMemos error:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลบันทึกข้อความได้');
    }
}

let usersSearchDebounceTimer = null;

async function fetchAllUsers(query = '') {
    try {
        if (!checkAdminAccess()) return;
        const trimmedQuery = String(query || '').trim();
        window.currentUsersDirectoryQuery = trimmedQuery;
        const result = await apiCall('GET', 'getUsersDirectory', {
            q: trimmedQuery,
            limit: trimmedQuery ? 100 : 40,
            offset: 0
        });
        if (result.status === 'success') {
            const payload = result.data || {};
            allUsersCache = payload.items || [];
            window.signerUserCandidatesCache = null;
            renderUsersList(allUsersCache, payload);
        }
    } catch (error) { showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้'); }
}

// --- HELPER FUNCTIONS ---

function getPlainProvinceValue(provinceValue) {
    if (typeof stripProvincePrefix === 'function') {
        return stripProvincePrefix(provinceValue);
    }
    const rawValue = String(provinceValue || '').trim();
    if (!rawValue) return '';
    if (rawValue === 'กรุงเทพมหานคร') return rawValue;
    return rawValue.replace(/^จังหวัด\s*/u, '').trim();
}

function getStoredProvinceValue(provinceValue) {
    if (typeof formatProvinceLabel === 'function') {
        return formatProvinceLabel(provinceValue);
    }
    const plainProvince = getPlainProvinceValue(provinceValue);
    if (!plainProvince) return '';
    if (plainProvince === 'กรุงเทพมหานคร') return plainProvince;
    return `จังหวัด${plainProvince}`;
}

function getThaiMonth(dateStr) {
    if (!dateStr) return '.......';
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const d = new Date(dateStr);
    return months[d.getMonth()];
}

function getThaiYear(dateStr) {
    if (!dateStr) return '.......';
    const d = new Date(dateStr);
    return (d.getFullYear() + 543).toString();
}

// --- GENERATE COMMAND FUNCTIONS ---

async function handleAdminGenerateCommand() {
    const requestId = document.getElementById('admin-command-request-id').value;
    const commandType = document.querySelector('input[name="admin-command-type"]:checked')?.value;
    if (!commandType) { showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); return; }
    if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();
    
    // เก็บรายชื่อจากหน้าจอ (รวมถึงที่แก้ไขหน้างาน)
    const attendees = [];
    document.querySelectorAll('#admin-command-attendees-list > div').forEach(div => {
        const name = div.querySelector('.admin-att-name').value.trim();
        const pos = div.querySelector('.admin-att-pos').value.trim();
        if (name) attendees.push({ name, position: pos });
    });
    
    const requestData = {
        docType: 'command', templateType: commandType, requestId: requestId, id: requestId,
        docDate: document.getElementById('admin-command-doc-date').value,
        requesterName: document.getElementById('admin-command-requester-name').value.trim(), 
        requesterPosition: document.getElementById('admin-command-requester-position').value.trim(),
        location: document.getElementById('admin-command-location').value.trim(), 
        province: getStoredProvinceValue(document.getElementById('admin-command-province').value.trim()),
        purpose: document.getElementById('admin-command-purpose').value.trim(),
        startDate: document.getElementById('admin-command-start-date').value, 
        endDate: document.getElementById('admin-command-end-date').value,
        attendees: attendees,
        expenseOption: document.getElementById('admin-expense-option').value,
        expenseItems: document.getElementById('admin-expense-items').value, 
        totalExpense: document.getElementById('admin-total-expense').value,
        vehicleOption: document.getElementById('admin-vehicle-option').value, 
        licensePlate: document.getElementById('admin-license-plate').value,
        createdby: getCurrentUser()?.username || 'admin'
    };
    
    toggleLoader('admin-generate-command-button', true);
    showSavingOverlay('กำลังสร้างเอกสารคำสั่ง...');
    try {
        const { pdfBlob, docxBlob } = await generateOfficialPDF(requestData);
        const previewUrl = URL.createObjectURL(pdfBlob);
        openUrlWithDownloadIndicator(previewUrl, 'กำลังเปิดตัวอย่างไฟล์คำสั่ง...');
        setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
        
        const safeRequestId = requestId.replace(/\//g, '-');
        const pdfUploadUrl = await uploadPdfToFirebaseStorage(pdfBlob, requestData.createdby, `คำสั่ง_${safeRequestId}.pdf`);
        const docUploadUrl = docxBlob
            ? await uploadFileToStorage(docxBlob, requestData.createdby, `คำสั่ง_${safeRequestId}.docx`,
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            : '';

        if (pdfUploadUrl) {
            requestData.preGeneratedPdfUrl = pdfUploadUrl;
            requestData.preGeneratedDocUrl = docUploadUrl || '';
            
            // ส่งข้อมูลไป GAS (เพื่อบันทึกใน Sheet)
            await apiCall('POST', 'approveCommand', requestData);
            await apiCall('POST', 'updateRequest', {
                requestId,
                activeApprovalDocType: 'command',
                docStatus: 'waiting_saraban',
                commandStatus: 'waiting_saraban',
                commandPdfUrl: pdfUploadUrl,
                completedCommandUrl: pdfUploadUrl,
                currentPdfUrl: pdfUploadUrl,
                commandDocUrl: docUploadUrl || '',
                lastUpdated: new Date().toISOString(),
            });

            if (typeof ensureRoleScriptsForUser === 'function') {
                try {
                    await ensureRoleScriptsForUser(getCurrentUser(), { pageId: 'approval-page' });
                    if (typeof generateApprovalToken === 'function') {
                        await generateApprovalToken(requestId, 'waiting_saraban', {
                            ...requestData,
                            activeApprovalDocType: 'command',
                            commandPdfUrl: pdfUploadUrl,
                            completedCommandUrl: pdfUploadUrl,
                            currentPdfUrl: pdfUploadUrl,
                        });
                    }
                } catch (tokenError) {
                    console.warn('generate approval token after command creation failed:', tokenError);
                }
            }
            
            const successMessage = 'สร้างเอกสารคำสั่งเรียบร้อยแล้ว ✅\nเอกสารถูกส่งไปยังงานสารบรรณเพื่อออกเลขที่และวันที่';
            showAlert('สำเร็จ', successMessage);
            await fetchAllRequestsForCommand();
        }
    } catch (error) {
        console.error(error);
        showAlert('แจ้งเตือน', 'การบันทึกขัดข้อง: ' + error.message);
    } finally {
        toggleLoader('admin-generate-command-button', false);
        hideSavingOverlay();
    }
}

// --- RENDER FUNCTIONS ---
// ในไฟล์ js/admin.js
// --- Helper Function: แปลงวันที่เป็นไทย ---
function formatThaiDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    // กรณี Date Invalid ให้คืนค่าเดิมกลับไป
    if (isNaN(date.getTime())) return dateString;
    
    const thaiMonths = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];
    
    const d = date.getDate();
    const m = thaiMonths[date.getMonth()];
    const y = date.getFullYear() + 543;
    
    return `${d} ${m} ${y}`;
}
// --- 1. ฟังก์ชันแสดงรายการคำขอ (ตาราง) ---
function isCompactAdminCardView() {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
}

let _currentAdminRequestFilter = 'all';

function isAdminRequestCompleted(request) {
    const status = String(request?.status || '').toLowerCase();
    return status.includes('เสร็จสิ้น') || status.includes('รับไฟล์');
}

function isAdminMemoCompleted(memo) {
    const status = String(memo?.status || memo?.docStatus || '').toLowerCase();
    return !!(memo?.completedCommandUrl || memo?.commandPdfUrl)
        || status.includes('เสร็จสิ้น')
        || status.includes('รับไฟล์')
        || status.includes('อนุมัติ');
}

function updateAdminRequestFilterCounts() {
    const cache = (typeof allRequestsCache !== 'undefined') ? allRequestsCache : [];
    const counts = {
        all: cache.length,
        pending: cache.filter(r => !isAdminRequestCompleted(r)).length,
        completed: cache.filter(r => isAdminRequestCompleted(r)).length,
    };
    Object.entries(counts).forEach(([key, value]) => {
        const el = document.getElementById(`request-filter-${key}-count`);
        if (el) el.textContent = String(value);
    });
}

function updateAdminMemoFilterCounts() {
    const cache = (typeof allMemosCache !== 'undefined') ? allMemosCache : [];
    const counts = {
        all: cache.length,
        pending: cache.filter(m => !isAdminMemoCompleted(m)).length,
        completed: cache.filter(m => isAdminMemoCompleted(m)).length,
    };
    Object.entries(counts).forEach(([key, value]) => {
        const el = document.getElementById(`memo-filter-${key}-count`);
        if (el) el.textContent = String(value);
    });
}

function filterAdminRequests(filter) {
    _currentAdminRequestFilter = filter;

    ['all', 'pending', 'completed'].forEach(f => {
        const btn = document.getElementById(`request-filter-${f}`);
        if (!btn) return;
        btn.classList.toggle('active', f === filter);
    });

    _applyRequestFilterAndSearch();
}

function _applyRequestFilterAndSearch() {
    const cache = (typeof allRequestsCache !== 'undefined') ? allRequestsCache : [];
    const query = (document.getElementById('admin-search-requests')?.value || '').toLowerCase().trim();
    let filtered = cache;

    updateAdminRequestFilterCounts();

    if (_currentAdminRequestFilter === 'pending') {
        filtered = filtered.filter(r => !isAdminRequestCompleted(r));
    } else if (_currentAdminRequestFilter === 'completed') {
        filtered = filtered.filter(r => isAdminRequestCompleted(r));
    }

    if (query) {
        filtered = filtered.filter(r =>
            (r.id            || '').toLowerCase().includes(query) ||
            (r.requesterName || '').toLowerCase().includes(query) ||
            (r.purpose       || '').toLowerCase().includes(query) ||
            (r.location      || '').toLowerCase().includes(query) ||
            (r.status        || '').toLowerCase().includes(query) ||
            (r.docStatus     || '').toLowerCase().includes(query)
        );
    }

    renderAdminRequestsList(filtered);
}

function renderAdminRequestsList(requests) {
    const tableContainer = document.getElementById('admin-requests-table-list');
    const cardContainer = document.getElementById('admin-requests-cards');
    const compactView = isCompactAdminCardView();

    if (!requests || requests.length === 0) {
        if (tableContainer) {
            tableContainer.innerHTML = `
                <tr><td colspan="9" class="text-center py-10 text-gray-400">
                    <p class="text-lg">ไม่พบคำขอไปราชการ</p>
                    <p class="text-sm">รายการคำขอใหม่จะปรากฏที่นี่</p>
                </td></tr>`;
        }
        if (cardContainer) {
            cardContainer.innerHTML = `
                <div class="admin-card-empty">
                    <p class="text-lg text-gray-500">ไม่พบคำขอไปราชการ</p>
                    <p class="text-sm text-gray-400 mt-2">รายการคำขอใหม่จะปรากฏที่นี่</p>
                </div>`;
        }
        return;
    }

    const tableRows = [];
    const cardItems = [];

    requests.forEach(request => {
        let attendeesList = [];
        try {
            attendeesList = typeof request.attendees === 'string' ? JSON.parse(request.attendees) : (request.attendees || []);
        } catch (e) { attendeesList = []; }

        const normalize = (str) => (str || '').trim().replace(/\s+/g, ' ');
        const reqName = normalize(request.requesterName);
        const hasRequesterInList = attendeesList.some(att => normalize(att.name) === reqName);

        let totalPeople = 1;
        if (attendeesList.length > 0) {
            totalPeople = hasRequesterInList ? attendeesList.length : attendeesList.length + 1;
        } else if (request.attendeeCount) {
            totalPeople = parseInt(request.attendeeCount) + 1;
        }
        const peopleCategory = totalPeople === 1 ? 'เดี่ยว' : (totalPeople <= 5 ? 'กลุ่มเล็ก' : 'กลุ่มใหญ่');

        let expenseCell = '';
        if (request.expenseOption === 'partial') {
            const amount = request.totalExpense ? Number(request.totalExpense).toLocaleString() : '0';
            expenseCell = `<span class="inline-block px-1.5 py-0.5 rounded text-xs bg-teal-100 text-teal-800 border border-teal-200 font-bold whitespace-nowrap">💸<br>${amount} บ.</span>`;
        } else {
            expenseCell = `<span class="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">⛔ ไม่เบิก</span>`;
        }

        const safeId = escapeHtml(request.id);
        const displayName = request.requesterName || request.username || '-';
        const displayPurpose = request.purpose || '-';
        const displayProvince = request.province ? getStoredProvinceValue(request.province) : '';
        const displayLocation = request.location || displayProvince || '-';

        const safeName = escapeHtml(displayName);
        const safePurpose = escapeHtml(displayPurpose);
        const safeLocation = escapeHtml(displayLocation);
        const startDate = formatDisplayDate(request.startDate);
        const endDate = formatDisplayDate(request.endDate);
        const dateHtml = startDate === endDate ? startDate : `${startDate}<br><span class="text-gray-400">– ${endDate}</span>`;
        const plainDate = startDate === endDate ? startDate : `${startDate} - ${endDate}`;

        const dispatchUrl = request.dispatchBookUrl || request.dispatchBookPdfUrl;
        const travelScheduleUrl = request.travelSchedulePdfUrl || request.travelScheduleUrl;
        const hasTravelScheduleData = !!(request.travelSchedule && JSON.stringify(request.travelSchedule) !== '{}');
        const dispatchBtn = dispatchUrl
            ? `<div class="flex gap-1 w-full">
                   <a href="${dispatchUrl}" target="_blank" class="btn btn-xs flex-1 text-center" style="background:linear-gradient(135deg,#f9a8d4,#7dd3fc);color:#075985;">📦 ดู</a>
                   <button onclick="openDispatchModal('${safeId}')" class="btn btn-xs px-2" style="background:#fdf2f8;color:#be185d;border:1px solid #fbcfe8;">✏️</button>
               </div>`
            : `<button onclick="openDispatchModal('${safeId}')" class="btn btn-xs w-full" style="background:linear-gradient(135deg,#f9a8d4,#7dd3fc);color:#075985;">📦 ออกหนังสือส่ง</button>`;

        const adminMemoBtn = !request.completedMemoUrl
            ? `<button onclick="openSendMemoFromList('${safeId}')" class="btn btn-xs w-full animate-pulse" style="background:linear-gradient(135deg,#fb923c,#f97316);color:white;">📤 ส่งบันทึกแทน</button>`
            : `<a href="${request.completedMemoUrl}" target="_blank" class="btn btn-xs w-full" style="background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;">📄 ดูบันทึก</a>`;

        const draftPdfUrl = request.currentPdfUrl || request.pdfUrl || request.memoPdfUrl;
        const draftPdfBtn = draftPdfUrl
            ? `<a href="${draftPdfUrl}" target="_blank" class="btn btn-xs" style="background:#e0e7ff;color:#4338ca;border:1px solid #c7d2fe;">🖨️ PDF</a>`
            : '';

        let commandActionBtn = '';
        if (request.commandPdfUrl) {
            commandActionBtn = `
                <a href="${request.commandPdfUrl}" target="_blank" class="btn btn-xs w-full" style="background:linear-gradient(135deg,#34d399,#10b981);color:white;">📄 ดูคำสั่ง</a>
                <button onclick="openAdminGenerateCommand('${safeId}')" class="btn btn-xs w-full" style="background:linear-gradient(135deg,#fbbf24,#f59e0b);color:white;">✏️ แก้ไขคำสั่ง</button>`;
        } else {
            commandActionBtn = `
                ${adminMemoBtn}
                <button onclick="openAdminGenerateCommand('${safeId}')" class="btn btn-xs w-full" style="background:linear-gradient(135deg,#34d399,#10b981);color:white;">✅ ออกคำสั่ง (${peopleCategory})</button>`;
        }

        const statusBadge = request.commandPdfUrl
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;">✅ มีคำสั่ง</span>`
            : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background:#fef9c3;color:#b45309;border:1px solid #fde68a;">⏳ รอออกคำสั่ง</span>`;
        const dispatchBadge = dispatchUrl
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background:#fdf2f8;color:#be185d;border:1px solid #fbcfe8;">📦 หนังสือส่ง</span>`
            : '';
        const travelScheduleBadge = travelScheduleUrl
            ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background:#ecfdf5;color:#047857;border:1px solid #bbf7d0;">📅 มีกำหนดการ</span>`
            : (hasTravelScheduleData ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">💾 บันทึกกำหนดการ</span>` : '');

        const mainStatus = request.status || '';
        const docStatus = request.docStatus || '';
        const mainStatusBadge = mainStatus
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium max-w-[140px] truncate" style="background:#f1f5f9;color:#475569;border:1px solid #e2e8f0;" title="${escapeHtml(mainStatus)}">${escapeHtml(mainStatus)}</span>`
            : '';
        const docStatusBadge = docStatus
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs max-w-[140px] truncate" style="background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;font-size:0.65rem;" title="${escapeHtml(docStatus)}">${escapeHtml(docStatus)}</span>`
            : '';

        const safeStatus = mainStatus.replace(/'/g, "\\'");
        const safeDocStatus = docStatus.replace(/'/g, "\\'");
        const rowClass = request.commandPdfUrl ? 'row-green' : '';

        const cardHtml = `
        <article class="admin-record-card ${rowClass}" data-id="${safeId}">
            <div class="admin-record-card__summary">
                <div class="admin-record-card__top">
                    <label class="admin-record-card__select">
                        <input type="checkbox" class="bulk-checkbox w-4 h-4 rounded accent-indigo-600 cursor-pointer" value="${safeId}" onchange="updateBulkToolbar()">
                        <span>เลือก</span>
                    </label>
                </div>
                <div class="admin-record-card__id">${safeId}</div>
                <div class="admin-record-card__name">${safeName}</div>
                <div class="admin-record-card__subline">${peopleCategory}</div>
            </div>
            <div class="admin-record-card__details">
                <div class="admin-record-card__meta">
                    <div class="admin-record-card__field admin-record-card__field--wide">
                        <span class="admin-record-card__field-label">เรื่อง</span>
                        <div class="admin-record-card__field-value">${safePurpose}</div>
                    </div>
                    <div class="admin-record-card__field">
                        <span class="admin-record-card__field-label">สถานที่</span>
                        <div class="admin-record-card__field-value admin-record-card__field-value--muted">📍 ${safeLocation}</div>
                    </div>
                    <div class="admin-record-card__field">
                        <span class="admin-record-card__field-label">วันที่เดินทาง</span>
                        <div class="admin-record-card__field-value admin-record-card__field-value--muted">${dateHtml}</div>
                    </div>
                </div>
                <div class="admin-record-card__meta admin-record-card__meta--three">
                    <div class="admin-record-card__field">
                        <span class="admin-record-card__field-label">ผู้ร่วมเดินทาง</span>
                        <div class="admin-record-card__field-value">${totalPeople} คน</div>
                    </div>
                    <div class="admin-record-card__field">
                        <span class="admin-record-card__field-label">งบประมาณ</span>
                        <div class="admin-record-card__field-value">${expenseCell}</div>
                    </div>
                    <div class="admin-record-card__field">
                        <span class="admin-record-card__field-label">ช่วงเวลา</span>
                        <div class="admin-record-card__field-value admin-record-card__field-value--muted">${plainDate}</div>
                    </div>
                </div>
            </div>
            <div class="admin-record-card__side">
                <div class="admin-record-card__badges">${statusBadge}${dispatchBadge}${travelScheduleBadge}${mainStatusBadge}${docStatusBadge}</div>
                <div class="admin-record-card__files">${draftPdfBtn || '<span class="text-xs text-gray-300">ยังไม่มีไฟล์ PDF แนบ</span>'}</div>
                <div class="admin-record-card__actions">
                    ${commandActionBtn}
                    ${dispatchBtn}
                    ${travelScheduleUrl ? `<a href="${sanitizeUrl(travelScheduleUrl)}" target="_blank" class="btn btn-xs" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;">📅 ดูกำหนดการ</a>` : ''}
                    ${isEligibleForTravelSchedule(request) ? `<button onclick="openTravelScheduleByReqId('${safeId}')" class="btn btn-xs" style="background:linear-gradient(135deg,#7dd3fc,#f9a8d4);color:#075985;">${travelScheduleUrl ? '✏️ แก้กำหนดการ' : '📅 กำหนดการเดินทาง'}</button>` : ''}
                    <button onclick="openCustomStatusModal('${safeId}', '${safeStatus}', '${safeDocStatus}')" class="btn btn-xs btn--full" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;">✏️ เปลี่ยนสถานะ</button>
                    <button onclick="deleteRequestByAdmin('${safeId}')" class="btn btn-xs btn--full" style="background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;">🗑️ ลบ</button>
                </div>
            </div>
        </article>`;

        const tableHtml = `
        <tr class="${rowClass}" data-id="${safeId}">
            <td class="text-center"><input type="checkbox" class="bulk-checkbox w-4 h-4 rounded accent-indigo-600 cursor-pointer" value="${safeId}" onchange="updateBulkToolbar()"></td>
            <td><div class="font-bold text-indigo-700 text-sm leading-tight">${safeId}</div><div class="text-xs text-gray-400 mt-0.5 font-medium">${peopleCategory}</div></td>
            <td><div class="font-semibold text-gray-800 text-sm leading-tight">${safeName}</div></td>
            <td style="max-width:240px"><div class="text-gray-700 text-sm leading-snug" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${safePurpose}</div><div class="text-gray-400 text-xs mt-0.5">📍 ${safeLocation}</div></td>
            <td class="whitespace-nowrap text-xs text-gray-600">${dateHtml}</td>
            <td class="text-center"><span class="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold" style="background:#eef2ff;color:#4338ca;">${totalPeople}</span></td>
            <td class="text-center">${expenseCell}</td>
            <td><div class="flex flex-wrap gap-1 mb-1.5">${statusBadge}${dispatchBadge}${travelScheduleBadge}</div><div class="flex flex-wrap gap-1 mb-1">${mainStatusBadge}</div><div class="flex flex-wrap gap-1 items-center">${docStatusBadge}${draftPdfBtn}</div></td>
            <td><div class="flex flex-col gap-1.5 items-stretch" style="min-width:138px">${commandActionBtn}${dispatchBtn}${travelScheduleUrl ? `<a href="${sanitizeUrl(travelScheduleUrl)}" target="_blank" class="btn btn-xs w-full" style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;">📅 ดูกำหนดการ</a>` : ''}${isEligibleForTravelSchedule(request) ? `<button onclick="openTravelScheduleByReqId('${safeId}')" class="btn btn-xs w-full" style="background:linear-gradient(135deg,#7dd3fc,#f9a8d4);color:#075985;">${travelScheduleUrl ? '✏️ แก้กำหนดการ' : '📅 กำหนดการเดินทาง'}</button>` : ''}<button onclick="openCustomStatusModal('${safeId}', '${safeStatus}', '${safeDocStatus}')" class="btn btn-xs w-full" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;">✏️ เปลี่ยนสถานะ</button><button onclick="deleteRequestByAdmin('${safeId}')" class="btn btn-xs w-full mt-0.5" style="background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;">🗑️ ลบ</button></div></td>
        </tr>`;

        if (compactView) cardItems.push(cardHtml);
        else tableRows.push(tableHtml);
    });

    if (tableContainer) tableContainer.innerHTML = compactView ? '' : tableRows.join('');
    if (cardContainer) cardContainer.innerHTML = compactView ? cardItems.join('') : '';
}

// --- 2. ฟังก์ชัน Helper: เลือกสีของ Dropdown ---
function getStatusClass(status) {
    switch(status) {
        case 'อนุมัติ': 
        case 'เสร็จสิ้น':
            return 'text-green-700 bg-green-50 ring-green-200'; // สีเขียว
        case 'ไม่อนุมัติ': 
            return 'text-red-700 bg-red-50 ring-red-200'; // สีแดง
        case 'แก้ไข': 
        case 'นำกลับไปแก้ไข':
            return 'text-orange-700 bg-orange-50 ring-orange-200'; // สีส้ม
        case 'รอตรวจสอบ':
            return 'text-yellow-700 bg-yellow-50 ring-yellow-200'; // สีเหลือง
        case 'กำลังดำเนินการ':
            return 'text-blue-700 bg-blue-50 ring-blue-200'; // สีฟ้า
        default: 
            return 'text-gray-700 bg-gray-50 ring-gray-200'; // สีเทา
    }
}

// --- 3. ฟังก์ชันอัปเดตสถานะ (เชื่อมต่อ API) ---
async function updateMemoStatus(requestId, newStatus) {
    // ถามยืนยันก่อนเปลี่ยน
    if(!confirm(`ยืนยันการเปลี่ยนสถานะเป็น "${newStatus}" ใช่หรือไม่?`)) {
        // ถ้ายกเลิก ให้โหลดตารางใหม่เพื่อคืนค่าเดิม
        renderAdminRequestsList(allRequestsCache);
        return;
    }

    try {
        // 1. ส่งข้อมูลไปอัปเดตที่ Google Sheets (GAS)
        // ใช้ apiCall ที่คุณมีอยู่แล้ว
        const result = await apiCall('POST', 'updateRequest', {
            id: requestId,
            status: newStatus
        });

        if (result.status === 'success') {
            // ล้าง user-side cache เพื่อให้ User เห็นสถานะใหม่ทันทีเมื่อ reload
            window.userRequestsCache = null;
            window.userRequestsCacheTime = 0;

            // 2. อัปเดต Cache ในเครื่อง Admin เอง (เพื่อให้สีเปลี่ยนโดยไม่ต้องโหลดใหม่)
            const reqIndex = allRequestsCache.findIndex(r => r.id === requestId);
            if(reqIndex !== -1) {
                allRequestsCache[reqIndex].status = newStatus;
                renderAdminRequestsList(allRequestsCache); // รีเฟรชตารางให้สีเปลี่ยน
            }
            
            // แจ้งเตือนเล็กๆ
            // showAlert('สำเร็จ', `เปลี่ยนสถานะเป็น ${newStatus} เรียบร้อยแล้ว`); 
            
        } else {
            throw new Error(result.message);
        }

    } catch (error) {
        console.error("Update Status Error:", error);
        showAlert('ผิดพลาด', 'ไม่สามารถเปลี่ยนสถานะได้: ' + error.message);
        renderAdminRequestsList(allRequestsCache); // คืนค่าเดิมกรณี Error
    }
}
// --- ฟังก์ชันเปลี่ยนสถานะอิสระ (Admin Custom Status) ---
window.openCustomStatusModal = function(requestId, currentStatus, currentDocStatus) {
    window._customStatusDocId = requestId;

    // แสดงข้อมูลปัจจุบันใน modal
    const elId        = document.getElementById('cstatus-doc-id');
    const elStatus    = document.getElementById('cstatus-current-status');
    const elDocStatus = document.getElementById('cstatus-current-docstatus');
    const elInput     = document.getElementById('cstatus-new-input');

    if (elId)        elId.textContent        = requestId;
    if (elStatus)    elStatus.textContent    = currentStatus    || '(ไม่มี)';
    if (elDocStatus) elDocStatus.textContent = currentDocStatus || '(ไม่มี)';
    if (elInput)     { elInput.value = ''; elInput.focus(); }

    // เปิด modal
    const modal = document.getElementById('admin-custom-status-modal');
    if (modal) { modal.classList.remove('hidden'); modal.style.display = 'flex'; }
};

window.closeCustomStatusModal = function() {
    const modal = document.getElementById('admin-custom-status-modal');
    if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
    window._customStatusDocId = null;
};

window.confirmCustomStatus = async function() {
    const docId    = window._customStatusDocId;
    const newValue = (document.getElementById('cstatus-new-input')?.value || '').trim();
    const doStatus    = document.getElementById('cstatus-update-status')?.checked;
    const doDocStatus = document.getElementById('cstatus-update-docstatus')?.checked;

    if (!docId)    { alert('ไม่พบรหัสเอกสาร'); return; }
    if (!newValue) { alert('⚠️ กรุณากรอกสถานะที่ต้องการ'); return; }
    if (!doStatus && !doDocStatus) { alert('⚠️ กรุณาเลือกฟิลด์ที่ต้องการอัปเดตอย่างน้อย 1 รายการ'); return; }

    const fields = [];
    if (doStatus)    fields.push('status');
    if (doDocStatus) fields.push('docStatus');

    if (!confirm(`ยืนยันเปลี่ยนสถานะเอกสาร:\n"${docId}"\n\nฟิลด์: ${fields.join(', ')}\nค่าใหม่: "${newValue}"`)) return;

    closeCustomStatusModal();
    showAlert('กำลังดำเนินการ', 'กำลังบันทึกสถานะ...', false);

    try {
        const safeId  = docId.replace(/[\/\\:\.]/g, '-');
        const user    = getCurrentUser();
        // หา original ID สำหรับ GAS
        const cached  = allRequestsCache.find(r => r.id === docId || r.requestId === docId) || {};
        const origId  = cached.id || cached.requestId || docId;

        // 1. อัปเดต GAS/Supabase
        const gasPayload = { requestId: origId };
        if (doStatus)    gasPayload.status    = newValue;
        if (doDocStatus) gasPayload.docStatus  = newValue;
        gasPayload.lastUpdated = new Date().toISOString();
        await apiCall('POST', 'updateRequest', gasPayload);

        // 2. อัปเดต cache แล้วรีเฟรชตาราง
        window.userRequestsCache = null;  // ล้าง user-side cache
        window.userRequestsCacheTime = 0;
        const idx = allRequestsCache.findIndex(r => r.id === docId || r.requestId === docId);
        if (idx !== -1) {
            if (doStatus)    allRequestsCache[idx].status    = newValue;
            if (doDocStatus) allRequestsCache[idx].docStatus  = newValue;
        }

        document.getElementById('alert-modal').style.display = 'none';
        showAlert('✅ บันทึกแล้ว', `เปลี่ยนสถานะ "${docId}" เป็น "${newValue}" เรียบร้อย`);
        renderAdminRequestsList(allRequestsCache);

    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('❌ ผิดพลาด', e.message);
    }
};

// --- ฟังก์ชัน Helper สำหรับเปลี่ยนสี Dropdown ---
function getStatusClass(status) {
    switch(status) {
        case 'อนุมัติ': return 'text-green-600 bg-green-50 border-green-200';
        case 'ไม่อนุมัติ': return 'text-red-600 bg-red-50 border-red-200';
        case 'แก้ไข': return 'text-orange-600 bg-orange-50 border-orange-200';
        case 'เสร็จสิ้น': return 'text-blue-600 bg-blue-50 border-blue-200';
        default: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    }
}
// --- แก้ไขในไฟล์ js/admin.js ---


async function handleDispatchFormSubmit(e) {
    e.preventDefault();
    const requestId = document.getElementById('dispatch-request-id').value;
    if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();
    
    // --- 1. ค้นหาข้อมูลเดิมจาก Cache เพื่อป้องกันข้อมูลหายตอนอัปเดต ---
    const originalData = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId) || {};
    
    // เริ่มแสดง Loader ที่ปุ่มบันทึก
    toggleLoader('dispatch-submit-button', true);

    try {
        // --- 2. รวบรวมข้อมูลโดยการผสานข้อมูลเดิม (Merge) กับค่าใหม่จากฟอร์ม ---
        const requestData = {
            ...originalData, // รักษาข้อมูลเดิมทั้งหมดไว้ (ชื่อ, ตำแหน่ง, รายชื่อแนบ, วัตถุประสงค์เดิม)
            docType: 'dispatch',
            id: requestId,
            
            // ข้อมูลส่วนหัวและรายละเอียดจากหน้าต่าง Dispatch
            dispatchMonth: document.getElementById('dispatch-month').value,
            dispatchYear: document.getElementById('dispatch-year').value,
            studentCount: document.getElementById('student-count').value,
            teacherCount: document.getElementById('teacher-count').value,
            purpose: document.getElementById('dispatch-purpose').value.trim(),
            location: document.getElementById('dispatch-location').value.trim(),
            province: getStoredProvinceValue(document.getElementById('dispatch-province').value.trim()),
            stayAt: document.getElementById('dispatch-stay-at').value.trim(),
            
            // วันเวลาเดินทาง
            startDate: document.getElementById('dispatch-date-start').value,
            dateStart: document.getElementById('dispatch-date-start').value,
            startTime: document.getElementById('dispatch-time-start').value,
            timeStart: document.getElementById('dispatch-time-start').value,
            endDate: document.getElementById('dispatch-date-end').value,
            dateEnd: document.getElementById('dispatch-date-end').value,
            endTime: document.getElementById('dispatch-time-end').value,
            timeEnd: document.getElementById('dispatch-time-end').value,
            
            // ยานพาหนะ
            dispatchVehicleType: document.getElementById('dispatch-vehicle-type').value,
            vehicleType: document.getElementById('dispatch-vehicle-type').value,
            dispatchVehicleId: document.getElementById('dispatch-vehicle-id').value,
            vehicleId: document.getElementById('dispatch-vehicle-id').value,

            // จำนวนสิ่งที่ส่งมาด้วย 1-7
            qty1: document.getElementById('qty1').value,
            qty2: document.getElementById('qty2').value,
            qty3: document.getElementById('qty3').value,
            qty4: document.getElementById('qty4').value,
            qty5: document.getElementById('qty5').value,
            qty6: document.getElementById('qty6').value,
            qty7: document.getElementById('qty7').value,

            commandCount: document.getElementById('qty2').value,
            createdby: getCurrentUser() ? getCurrentUser().username : 'admin'
        };
        
        console.log("🚀 Generating Dispatch PDF with merged data...", requestData);
        
        // --- 3. ส่งข้อมูลไปสร้าง PDF ---
        const { pdfBlob } = await generateOfficialPDF(requestData);
        
        // Preview ไฟล์ทันที
        const tempPdfUrl = URL.createObjectURL(pdfBlob);
        openUrlWithDownloadIndicator(tempPdfUrl, 'กำลังเปิดตัวอย่างหนังสือส่ง...');
        setTimeout(() => URL.revokeObjectURL(tempPdfUrl), 60000);
        
        // UI Feedback: แสดงข้อความกำลังบันทึก
        const modalBody = document.querySelector('#dispatch-modal .modal-content'); 
        if(modalBody) {
            let msg = document.getElementById('dispatch-saving-msg');
            if(!msg) {
                msg = document.createElement('div');
                msg.id = 'dispatch-saving-msg';
                msg.className = 'text-center text-blue-600 font-bold mt-2 animate-pulse';
                msg.innerHTML = '🔄 กำลังบันทึกไฟล์และอัปเดตฐานข้อมูล...';
                const btnContainer = document.querySelector('#dispatch-modal .flex.justify-end');
                if(btnContainer) btnContainer.before(msg);
            }
        }

        // --- 4. Upload ไฟล์ขึ้น Firebase Storage ---
        const permanentPdfUrl = await uploadPdfToFirebaseStorage(
            pdfBlob, requestData.createdby,
            `หนังสือส่ง_${requestId.replace(/[\/\\:\.]/g, '-')}.pdf`
        );

        // --- 5. อัปเดตฐานข้อมูล (GAS + Firebase) ---
        
        // อัปเดต GAS (Google Sheets) แบบส่งข้อมูลชุดสมบูรณ์ป้องกันฟิลด์ว่าง
        await apiCall('POST', 'updateRequest', {
            ...requestData, // ส่งข้อมูลทั้งหมดที่มี (ชื่อผู้ขอ, รายชื่อ, สถานที่ ฯลฯ) เพื่อไม่ให้ค่าในชีทหาย
            docType: 'dispatch',
            activeApprovalDocType: 'dispatch',
            docStatus: 'waiting_saraban',
            dispatchStatus: 'waiting_saraban',
            currentPdfUrl: permanentPdfUrl,
            dispatchBookUrl: permanentPdfUrl,
            dispatchBookPdfUrl: permanentPdfUrl,
            dispatchMeta: {
                dispatchMonth: requestData.dispatchMonth,
                dispatchYear: requestData.dispatchYear,
                studentCount: requestData.studentCount,
                teacherCount: requestData.teacherCount,
                province: requestData.province,
                stayAt: requestData.stayAt,
                startDate: requestData.startDate,
                startTime: requestData.startTime,
                endDate: requestData.endDate,
                endTime: requestData.endTime,
                vehicleType: requestData.dispatchVehicleType,
                vehicleId: requestData.dispatchVehicleId,
                qty1: requestData.qty1,
                qty2: requestData.qty2,
                qty3: requestData.qty3,
                qty4: requestData.qty4,
                qty5: requestData.qty5,
                qty6: requestData.qty6,
                qty7: requestData.qty7,
                generatedAt: new Date().toISOString()
            },
            skipPdfUrlUpdate: true // ป้องกัน GAS เขียนทับ PdfUrl หลักของคำขอ
        
        });

        // --- 6. เสร็จสิ้น: ล้างสถานะและปิดหน้าต่าง ---
        const msg = document.getElementById('dispatch-saving-msg');
        if(msg) msg.remove();

        document.getElementById('dispatch-modal').style.display = 'none';
        document.getElementById('dispatch-form').reset(); 
        
        showAlert('สำเร็จ', 'บันทึกหนังสือส่งเรียบร้อยแล้ว และส่งต่อให้งานสารบรรณออกเลขที่/วันที่เรียบร้อย');
        
        // โหลดรายการใหม่เพื่อให้หน้าจอแสดงปุ่ม "ดูหนังสือส่ง"
        await fetchAllRequestsForCommand();

    } catch (error) {
        console.error(error);
        showAlert('แจ้งเตือน', 'เกิดข้อผิดพลาด: ' + error.message);
        const msg = document.getElementById('dispatch-saving-msg');
        if(msg) msg.remove();
    } finally {
        toggleLoader('dispatch-submit-button', false);
    }
}
// ฟังก์ชันสร้างบันทึกข้อความแบบ Admin (ที่เคยหายไป)
async function handleAdminGenerateMemo() {
    const requestId = document.getElementById('admin-memo-request-id')?.value || document.getElementById('admin-command-request-id')?.value;
    if (!requestId) { showAlert('ผิดพลาด', 'ไม่พบรหัสคำขอ'); return; }

    const requestData = {
        docType: 'memo',
        id: requestId,
        docDate: document.getElementById('admin-memo-doc-date')?.value || new Date().toISOString().split('T')[0],
        requesterName: document.getElementById('admin-memo-requester-name')?.value.trim(),
        requesterPosition: document.getElementById('admin-memo-requester-position')?.value.trim(),
        department: document.getElementById('admin-memo-department')?.value.trim(), 
        headName: document.getElementById('admin-memo-head-name')?.value.trim(),   
        location: document.getElementById('admin-memo-location')?.value.trim(),
        purpose: document.getElementById('admin-memo-purpose')?.value.trim(),
        startDate: document.getElementById('admin-memo-start-date')?.value,
        endDate: document.getElementById('admin-memo-end-date')?.value,
        vehicleOption: document.getElementById('admin-memo-vehicle-option')?.value || 'gov', 
        licensePlate: document.getElementById('admin-memo-license-plate')?.value || '',
        expenseOption: document.getElementById('admin-memo-expense-option')?.value || 'no',
        expenseItems: document.getElementById('admin-memo-expense-items')?.value || [], 
        totalExpense: document.getElementById('admin-memo-total-expense')?.value || '0',
        createdby: getCurrentUser() ? getCurrentUser().username : 'admin'
    };
    
    const attendees = [];
    const attendeeList = document.querySelectorAll('#admin-memo-attendees-list > div');
    if (attendeeList.length > 0) {
        attendeeList.forEach(div => {
            const name = div.querySelector('.admin-att-name').value.trim();
            const pos = div.querySelector('.admin-att-pos').value.trim();
            if (name) attendees.push({ name, position: pos });
        });
    }
    requestData.attendees = attendees;

    const btnId = 'admin-generate-memo-button';
    toggleLoader(btnId, true);

    try {
        console.log("🚀 Generating Memo via Cloud Run...");
        const { pdfBlob } = await generateOfficialPDF(requestData);

        const tempPdfUrl = URL.createObjectURL(pdfBlob);
        openUrlWithDownloadIndicator(tempPdfUrl, 'กำลังเปิดตัวอย่างบันทึกข้อความ...');
        setTimeout(() => URL.revokeObjectURL(tempPdfUrl), 60000);

        const statusDiv = document.getElementById('admin-memo-result');
        if(statusDiv) {
            statusDiv.innerHTML = `<div class="text-blue-600 font-bold animate-pulse">📄 เปิดเอกสารแล้ว... กำลังบันทึกลงระบบ...</div>`;
            statusDiv.classList.remove('hidden');
        }

        const permanentPdfUrl = await uploadPdfToFirebaseStorage(
            pdfBlob, requestData.createdby,
            `บันทึกข้อความ_${requestId.replace(/\//g, '-')}.pdf`
        );

        await apiCall('POST', 'updateRequest', {
            requestId,
            memoPdfUrl: permanentPdfUrl,
            memoStatus: 'สร้างแล้ว',
            lastUpdated: new Date().toISOString()
        });

        showAlert('สำเร็จ', 'บันทึกข้อความถูกสร้างเรียบร้อยแล้ว');
        if(statusDiv) {
            statusDiv.innerHTML = `
                <div class="text-green-600 font-bold mb-2">✅ บันทึกเรียบร้อย</div>
                <a href="${permanentPdfUrl}" target="_blank" class="text-blue-500 underline">เปิดไฟล์จาก Google Drive</a>
            `;
        }
        if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();

    } catch (error) {
        console.error(error);
        showAlert('แจ้งเตือน', 'เปิดไฟล์ได้ แต่การบันทึกขัดข้อง: ' + error.message);
    } finally {
        toggleLoader(btnId, false);
    }
}

/**
 * ฟังก์ชันสร้างเอกสาร PDF (ฉบับแก้ไขการตัดคำ: วันที่เกาะกลุ่ม, ณ ติดสถานที่, แต่แยกคำนำหน้าได้)
 */
async function generateOfficialPDF(requestData) {
    // 1. กำหนดปุ่มสำหรับแสดง Loader ตามประเภทเอกสาร
    let btnId = 'generate-document-button'; 
    if (requestData.docType === 'dispatch') btnId = 'dispatch-submit-button';
    if (requestData.docType === 'command') btnId = 'admin-generate-command-button';
    if (requestData.docType === 'memo') btnId = 'admin-generate-memo-button';
    if (requestData.btnId) btnId = requestData.btnId;
    
    toggleLoader(btnId, true);

    try {
        const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        
        // Helper: แปลงตัวเลขเป็นเลขไทย
        const toThaiNum = (num) => {
            if (num === null || num === undefined || num === "") return "";
            return num.toString().replace(/\d/g, d => "๐๑๒๓๔๕๖๗๘๙"[d]);
        };

        // Helper: จัดรูปแบบวันที่ (ใช้ \u00A0 ยึด วัน-เดือน-ปี ให้ติดกันเสมอ)
        const formatDateThai = (dateStr) => {
            if (!dateStr) return ".....";
            const d = new Date(dateStr);
            // \u00A0 คือ Non-Breaking Space (ห้ามตัดคำ)
            return `${toThaiNum(d.getDate())}\u00A0${thaiMonths[d.getMonth()]}\u00A0${toThaiNum(d.getFullYear() + 543)}`;
        };

        // --- ส่วนจัดการวันที่ (Header) ---
        const docDateObj = requestData.docDate ? new Date(requestData.docDate) : new Date();
        const docDay = docDateObj.getDate();
        const docMonth = thaiMonths[docDateObj.getMonth()];
        const docYear = docDateObj.getFullYear() + 543;
        // วันที่ส่วนหัวกระดาษ (ยึดติดกัน)
        const fullDocDate = `${toThaiNum(docDay)}\u00A0${docMonth}\u00A0${toThaiNum(docYear)}`; 

        // --- ส่วนจัดการช่วงเวลาเดินทาง (Content) ---
        let dateRangeStr = "", startDateStr = "", endDateStr = "", durationStr = "0";
        const rawStartDate = requestData.startDate || requestData.dateStart;
        const rawEndDate = requestData.endDate || requestData.dateEnd;

        if (rawStartDate) {
            const start = new Date(rawStartDate);
            startDateStr = formatDateThai(rawStartDate);
            
            if (rawEndDate) {
                const end = new Date(rawEndDate);
                endDateStr = formatDateThai(rawEndDate);
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
                durationStr = diffDays.toString();

                // ★★★ แก้ไขตรงนี้: ใช้ Space ธรรมดาหลัง "ในวันที่" เพื่อให้ตัดคำได้ ★★★
                if (rawStartDate === rawEndDate) {
                    // "ในวันที่" (เว้นวรรคปกติ) "๙(NBSP)กุมภาพันธ์(NBSP)๒๕๖๙"
                    dateRangeStr = `ในวันที่ ${formatDateThai(rawStartDate)}`;
                } else if (start.getMonth() === end.getMonth()) {
                    // กรณีเดือนเดียวกัน: "ระหว่างวันที่" (วรรคปกติ) "๑-๒(NBSP)มกราคม..."
                    dateRangeStr = `ระหว่างวันที่ ${toThaiNum(start.getDate())}\u00A0-\u00A0${toThaiNum(end.getDate())}\u00A0${thaiMonths[start.getMonth()]}\u00A0พ.ศ.\u00A0${toThaiNum(start.getFullYear() + 543)}`;
                } else {
                    // กรณีคนละเดือน
                    dateRangeStr = `ระหว่างวันที่ ${formatDateThai(rawStartDate)}\u00A0-\u00A0${formatDateThai(rawEndDate)}`;
                }
            } else {
                 dateRangeStr = `ในวันที่ ${formatDateThai(rawStartDate)}`;
                 endDateStr = startDateStr;
                 durationStr = "1";
            }
        }

        // --- ส่วนจัดการรายชื่อผู้ร่วมเดินทาง ---
        const requesterName = (requestData.requesterName || "").trim().replace(/\s+/g, ' ');
        let mergedAttendees = [];
        if (requesterName) mergedAttendees.push({ name: requesterName, position: requestData.requesterPosition });
        
        if (requestData.attendees && Array.isArray(requestData.attendees)) {
            requestData.attendees.forEach(att => {
                const attName = (att.name || "").trim().replace(/\s+/g, ' ');
                if (attName && attName !== requesterName) {
                    mergedAttendees.push({ name: attName, position: att.position || "" });
                }
            });
        }
        const attendeesWithIndex = mergedAttendees.map((att, index) => ({ i: toThaiNum(index + 1), name: att.name, position: att.position }));
        const totalCount = mergedAttendees.length.toString();

        // --- ส่วนจัดการค่าใช้จ่าย ---
        let expense_no = "", expense_partial = "", totalExpenseStr = "";
        let expense_allowance = "", expense_food = "", expense_accommodation = "", expense_transport = "", expense_fuel = "";
        let expense_other_check = "", expense_other_text = ""; 

        if (requestData.expenseOption === 'no' || requestData.expenseOption === 'ไม่ขอเบิก') {
            expense_no = "/"; 
        } else {
            expense_partial = "/";
            let itemsStr = "";
            if (Array.isArray(requestData.expenseItems)) {
                itemsStr = JSON.stringify(requestData.expenseItems);
                const otherItem = requestData.expenseItems.find(item => item.name === 'ค่าใช้จ่ายอื่นๆ' || item.name === 'other');
                if (otherItem) {
                    expense_other_check = "/";
                    expense_other_text = otherItem.detail || ""; 
                }
            } else if (typeof requestData.expenseItems === 'string') {
                itemsStr = requestData.expenseItems;
            }
            if (itemsStr.includes('allowance') || itemsStr.includes('เบี้ยเลี้ยง')) expense_allowance = "/";
            if (itemsStr.includes('food') || itemsStr.includes('อาหาร')) expense_food = "/";
            if (itemsStr.includes('accommodation') || itemsStr.includes('ที่พัก')) expense_accommodation = "/";
            if (itemsStr.includes('transport') || itemsStr.includes('พาหนะ')) expense_transport = "/";
            if (itemsStr.includes('fuel') || itemsStr.includes('น้ำมัน')) expense_fuel = "/";
            totalExpenseStr = requestData.totalExpense ? toThaiNum(parseFloat(requestData.totalExpense).toLocaleString('th-TH', {minimumFractionDigits: 2})) : toThaiNum("0");
        }
        
        // --- ส่วนจัดการพาหนะ ---
        let vehicle_gov = "", vehicle_private = "", vehicle_public = "";
        let license_plate = "", other_detail = "";
        if (requestData.vehicleOption === 'gov') { vehicle_gov = "/"; }
        else if (requestData.vehicleOption === 'private') { 
            vehicle_private = "/"; 
            license_plate = toThaiNum(requestData.licensePlate || ""); 
        } else { 
            vehicle_public = "/"; 
            other_detail = toThaiNum(requestData.licensePlate || requestData.publicVehicleDetails || ""); 
        }

        // --- ส่วนจัดการเลขที่เอกสาร ---
        let rawId = requestData.id || requestData.requestId || "";
        let docNumberRaw = ".....";
        if (rawId) {
            if (rawId.includes('/')) docNumberRaw = rawId.split('/')[0];
            else docNumberRaw = rawId;
            docNumberRaw = docNumberRaw.replace(/บค/gi, '').trim();
        }

        // --- 2. เลือกไฟล์แม่แบบ ---
        let templateFilename = '';
        if (requestData.docType === 'dispatch') {
            templateFilename = 'แม่แบบหนังสือส่งใหม่.docx'; 
        } else if (requestData.docType === 'memo') {
            templateFilename = 'template_memo.docx';
        } else {
            switch (requestData.templateType) {
                case 'groupSmall': templateFilename = 'template_command_small.docx'; break;
                case 'groupLarge': templateFilename = 'template_command_large.docx'; break;
                default: templateFilename = 'template_command_solo.docx'; break;
            }
        }

        // --- 3. โหลดและ Render Template ---
        const response = await fetch(`../${templateFilename}`);
        if (!response.ok) throw new Error(`ไม่พบไฟล์แม่แบบ "${templateFilename}"`);
        const content = await response.arrayBuffer();

        const zip = new PizZip(content);
        const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        // เตรียมข้อมูล (Render Data)
        let renderData = {
            id: toThaiNum(rawId || "......."), 
            doc_number: toThaiNum(docNumberRaw),
            dd: toThaiNum(docDay), MMMM: docMonth, YYYY: toThaiNum(docYear),
            doc_date: fullDocDate, 
            start_date: startDateStr, end_date: endDateStr, duration: toThaiNum(durationStr),
            date_range: dateRangeStr, // ใช้ตัวแปรที่แก้แล้ว (มีวรรคปกติ)
            
            requesterName, requester_position: requestData.requesterPosition, 
            requesterPosition: requestData.requesterPosition,
            
            // ★★★ สถานที่: ยึด "ณ" ให้ติดกับสถานที่เหมือนเดิม ★★★
            location: toThaiNum((requestData.location || "").replace(/ณ /g, "ณ\u00A0")), 
            province: toThaiNum(getStoredProvinceValue(requestData.province || "")),
            
            purpose: toThaiNum(requestData.purpose || ""),
            learning_area: requestData.department || "..............", 
            head_name: requestData.headName || "..............",
            attendees: attendeesWithIndex, total_count: toThaiNum(totalCount),
            vehicle_gov, vehicle_private, vehicle_public, license_plate, other_detail,
            expense_no, expense_partial, 
            expense_allowance, expense_food, expense_accommodation, expense_transport, expense_fuel,
            expense_other_check, expense_other_text: toThaiNum(expense_other_text), 
            expense_total: totalExpenseStr
        };

        if (requestData.docType === 'dispatch') {
            Object.assign(renderData, {
                dispatch_month: requestData.dispatchMonth || "",
                dispatch_year: toThaiNum(requestData.dispatchYear || ""),
                qty1: toThaiNum(requestData.qty1 || "๑"), qty2: toThaiNum(requestData.qty2 || "๑"),
                qty3: toThaiNum(requestData.qty3 || "๑"), qty4: toThaiNum(requestData.qty4 || "๑"),
                qty5: toThaiNum(requestData.qty5 || "๑"), qty6: toThaiNum(requestData.qty6 || "๑"),
                qty7: toThaiNum(requestData.qty7 || "๑"),
                student_count: toThaiNum(requestData.studentCount || "0"),
                teacher_count: toThaiNum(requestData.teacherCount || "0"),
                date_start: formatDateThai(requestData.dateStart),
                time_start: toThaiNum(requestData.timeStart || ""),
                date_end: formatDateThai(requestData.dateEnd),
                time_end: toThaiNum(requestData.timeEnd || ""),
                vehicle_type: requestData.vehicleType || "-",
                vehicle_id: toThaiNum(requestData.vehicleId || "-"),
                stay_at: (requestData.stayAt && requestData.stayAt.trim() !== "") ? requestData.stayAt : "-"
            });
        }

        Object.keys(renderData).forEach(key => {
            if (renderData[key] === undefined || renderData[key] === null) renderData[key] = ""; 
        });

        doc.render(renderData);

        const docxBlob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const formData = new FormData();
        formData.append("files", docxBlob, "document.docx");
        
        const cloudRunBaseUrl = (typeof PDF_ENGINE_CONFIG !== 'undefined') ? PDF_ENGINE_CONFIG.BASE_URL : "https://wny-pdf-engine-660310608742.asia-southeast1.run.app";
        const cloudRunResponse = await fetch(`${cloudRunBaseUrl}/forms/libreoffice/convert`, { method: "POST", body: formData });
        
        if (!cloudRunResponse.ok) throw new Error(`Cloud Run Error: ${cloudRunResponse.status}`);
        
        const pdfBlob = await cloudRunResponse.blob();
        return { pdfBlob, docxBlob };

    } catch (error) {
        console.error("PDF Generation Error:", error);
        if (error.properties && error.properties.errors) {
            const errorMessages = error.properties.errors.map(e => e.properties.explanation).join("\n");
            alert(`❌ เกิดข้อผิดพลาดใน Template:\n${errorMessages}`);
        } else {
            alert(`❌ สร้างเอกสารไม่สำเร็จ: ${error.message}`);
        }
        throw error;
    } finally {
        toggleLoader(btnId, false);
    }
}


function renderUsersList(users, meta = {}) {
    const container = document.getElementById('users-content');
    const countBadge = document.getElementById('users-count-badge');
    const searchInput = document.getElementById('users-search-input');
    const totalUsers = Number(meta.total || users.length || 0);
    const matchedUsers = Number(meta.matched || users.length || 0);
    const hasQuery = !!String(meta.query || '').trim();
    const hasMore = !!meta.hasMore;

    if (!users || users.length === 0) {
        container.innerHTML = `<div class="text-center py-16 text-gray-400">
            <div class="text-5xl mb-3">👤</div>
            <p class="font-medium text-gray-500">ไม่พบข้อมูลผู้ใช้</p>
        </div>`;
        if (countBadge) countBadge.textContent = hasQuery
            ? `0/${totalUsers} คน`
            : `0/${totalUsers} คน`;
        return;
    }

    if (countBadge) {
        if (hasQuery) {
            countBadge.textContent = `${matchedUsers}/${totalUsers} คน`;
        } else if (hasMore) {
            countBadge.textContent = `${users.length}/${totalUsers} คน`;
        } else {
            countBadge.textContent = `${matchedUsers} คน`;
        }
    }

    // ── Role badge config ──────────────────────────────────────
    const roleBadgeMap = {
        'admin':            { label: '⚙️ Admin',          cls: 'bg-red-100 text-red-700 border border-red-200' },
        'director':         { label: '🏫 ผู้อำนวยการ',    cls: 'bg-purple-100 text-purple-700 border border-purple-200' },
        'saraban':          { label: '📋 สารบรรณ',        cls: 'bg-indigo-100 text-indigo-700 border border-indigo-200' },
        'deputy_acad':      { label: '📚 รอง ผอ.วิชาการ', cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
        'deputy_personnel': { label: '👔 รอง ผอ.บุคคล',   cls: 'bg-cyan-100 text-cyan-700 border border-cyan-200' },
        'deputy_general':   { label: '🧭 รอง ผอ.ทั่วไป',   cls: 'bg-sky-100 text-sky-700 border border-sky-200' },
        'deputy_budget':    { label: '💼 รอง ผอ.งบประมาณ', cls: 'bg-teal-100 text-teal-700 border border-teal-200' },
        'head_guidance':    { label: '🧭 หัวหน้าแนะแนว',  cls: 'bg-lime-100 text-lime-700 border border-lime-200' },
        'head_general':     { label: '🏢 หัวหน้าทั่วไป',   cls: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
        'head_personnel':   { label: '👥 หัวหน้าบุคคล',    cls: 'bg-green-100 text-green-700 border border-green-200' },
        'head_budget':      { label: '💰 หัวหน้างบประมาณ', cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
        'head_acad':        { label: '📘 หัวหน้าวิชาการ',  cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
        'user':             { label: '👤 User',            cls: 'bg-gray-100 text-gray-500 border border-gray-200' },
    };
    ['head_thai','head_foreign','head_science','head_art','head_social','head_health','head_career','head_math'].forEach(r => {
        roleBadgeMap[r] = { label: '🧑‍🏫 หัวหน้ากลุ่มสาระฯ', cls: 'bg-green-100 text-green-700 border border-green-200' };
    });

    function getRoleBadgeHtml(role) {
        const cfg = roleBadgeMap[(role||'user').toLowerCase()] || { label: role, cls: 'bg-gray-100 text-gray-500 border border-gray-200' };
        return `<span class="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full ${cfg.cls}">${cfg.label}</span>`;
    }

    function getUserSearchHaystack(user) {
        const roleKey = String(user?.role || 'user').toLowerCase();
        const roleLabel = String(roleBadgeMap[roleKey]?.label || '').toLowerCase();
        const matchedPositions = (typeof POSITION_TO_ROLE !== 'undefined')
            ? Object.keys(POSITION_TO_ROLE).filter(position => POSITION_TO_ROLE[position] === roleKey)
            : [];

        return [
            user?.fullName || '',
            user?.username || '',
            user?.loginName || user?.loginname || user?.LoginName || '',
            user?.position || '',
            user?.department || '',
            roleKey,
            roleLabel,
            ...matchedPositions
        ]
            .join(' ')
            .toLowerCase();
    }

    function getInitials(name) {
        if (!name) return '?';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] || '') + (parts[1][0] || '');
        return (name[0] || '?').toUpperCase();
    }

    function getAvatarBg(username) {
        const palette = ['bg-blue-500','bg-emerald-500','bg-violet-500','bg-pink-500','bg-orange-500','bg-teal-500','bg-indigo-500','bg-rose-500','bg-amber-500','bg-cyan-500'];
        let h = 0;
        for (const c of (username || '')) h = h * 31 + c.charCodeAt(0);
        return palette[Math.abs(h) % palette.length];
    }

    // ── Build row HTML ─────────────────────────────────────────
    const buildRows = (list) => {
        if (list.length === 0) {
            return `<tr><td colspan="4" class="text-center py-12 text-gray-400">
                <div class="text-3xl mb-2">🔍</div>
                <p>ไม่พบผู้ใช้ที่ตรงกับการค้นหา</p>
            </td></tr>`;
        }
        return list.map(user => {
            const initials   = getInitials(user.fullName || user.username);
            const avatarBg   = getAvatarBg(user.username);
            // ── ใช้ escapeHtml เฉพาะสำหรับแสดงผลใน HTML เท่านั้น ──
            // ── ค่าที่ส่งเป็น onclick ใช้ data-* attribute แทน เพื่อหลีกเลี่ยงปัญหา quote ──
            const unameHtml     = escapeHtml(user.username   || '');
            const fnameHtml     = escapeHtml(user.fullName   || '');
            const posHtml       = escapeHtml(user.position   || '');
            const deptHtml      = escapeHtml(user.department || '');
            const roleHtml      = escapeHtml(user.role       || 'user');
            // loginName — รองรับทุก case: camelCase (loginName) / all-lowercase (loginname) / PascalCase (LoginName)
            const loginName     = user.loginName || user.loginname || user.LoginName || '';
            const loginNameHtml = escapeHtml(loginName);
            const showLogin  = loginName && loginName !== (user.username || '');
            const loginBadge = showLogin
                ? `<span class="inline-flex items-center gap-1 text-xs text-blue-500 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-mono ml-1" title="Login Name">🔐 ${escapeHtml(loginName)}</span>`
                : '';
            return `
            <tr class="border-b border-gray-100 hover:bg-blue-50/40 transition-colors group">
                <td class="px-5 py-3.5" data-label="ผู้ใช้">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full ${avatarBg} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                            ${initials}
                        </div>
                        <div class="min-w-0">
                            <div class="font-semibold text-gray-800 text-sm leading-snug">${fnameHtml}</div>
                            <div class="mt-1 flex flex-wrap items-center gap-1">
                                <span class="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono" title="Username (บัญชีในระบบ)">🔑 ${unameHtml}</span>
                                ${loginBadge}
                            </div>
                        </div>
                    </div>
                </td>
                <td class="px-5 py-3.5 hidden sm:table-cell" data-label="ตำแหน่ง / กลุ่มสาระ">
                    <div class="text-sm font-medium text-gray-700">${posHtml}</div>
                    <div class="text-xs text-gray-400 mt-0.5">${deptHtml}</div>
                </td>
                <td class="px-5 py-3.5 hidden sm:table-cell" data-label="บทบาท">
                    ${getRoleBadgeHtml(user.role)}
                </td>
                <td class="px-5 py-3.5 text-right whitespace-nowrap" data-label="การจัดการ">
                    <button
                        data-uid="${unameHtml}"
                        data-name="${fnameHtml}"
                        data-position="${posHtml}"
                        data-department="${deptHtml}"
                        data-role="${roleHtml}"
                        data-loginname="${loginNameHtml}"
                        onclick="openEditUserModal(this.dataset.uid, this.dataset.name, this.dataset.position, this.dataset.department, this.dataset.role, this.dataset.loginname)"
                        class="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold transition-colors mr-1.5 shadow-sm">
                        ✏️ แก้ไข
                    </button>
                    <button
                        data-uid="${unameHtml}"
                        onclick="deleteUser(this.dataset.uid)"
                        class="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg text-xs font-semibold transition-colors shadow-sm">
                        🗑️ ลบ
                    </button>
                </td>
            </tr>`;
        }).join('');
    };

    container.innerHTML = `
    <div class="overflow-x-auto">
        <table class="w-full text-left">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">ผู้ใช้ / บัญชี</th>
                    <th class="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">ตำแหน่ง / กลุ่มสาระฯ</th>
                    <th class="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider hidden sm:table-cell">บทบาท</th>
                    <th class="px-5 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">การจัดการ</th>
                </tr>
            </thead>
            <tbody id="users-table-body">
                ${buildRows(users)}
            </tbody>
        </table>
    </div>`;

    // ── Live search binding ────────────────────────────────────
    if (searchInput) {
        if (document.activeElement !== searchInput) {
            searchInput.value = meta.query || '';
        }
        searchInput.oninput = null;
        searchInput.oninput = function() {
            const nextQuery = this.value.trim();
            window.currentUsersDirectoryQuery = nextQuery;
            if (usersSearchDebounceTimer) clearTimeout(usersSearchDebounceTimer);
            usersSearchDebounceTimer = window.setTimeout(() => {
                fetchAllUsers(nextQuery);
            }, nextQuery ? 220 : 100);
        };
    }
}

// ── ฟังก์ชันกรองบันทึกข้อความ ──────────────────────
let _currentMemoFilter = 'all';

function filterAdminMemos(filter) {
    _currentMemoFilter = filter;

    // อัปเดต active state ของปุ่ม
    ['all', 'pending', 'completed'].forEach(f => {
        const btn = document.getElementById(`memo-filter-${f}`);
        if (!btn) return;
        btn.classList.toggle('active', f === filter);
    });

    _applyMemoFilterAndSearch();
}

function _applyMemoFilterAndSearch() {
    const cache  = (typeof allMemosCache !== 'undefined') ? allMemosCache : [];
    const query  = (document.getElementById('admin-search-memos')?.value || '').toLowerCase();
    let filtered = cache;

    updateAdminMemoFilterCounts();

    // 1. กรองตาม filter category
    if (_currentMemoFilter === 'pending') {
        filtered = filtered.filter(m => !isAdminMemoCompleted(m));
    } else if (_currentMemoFilter === 'completed') {
        filtered = filtered.filter(m => isAdminMemoCompleted(m));
    }

    // 2. กรองตาม search query
    if (query) {
        filtered = filtered.filter(m =>
            (m.id             || '').toLowerCase().includes(query) ||
            (m.submittedBy    || '').toLowerCase().includes(query) ||
            (m.requesterName  || '').toLowerCase().includes(query) ||
            (m.purpose        || '').toLowerCase().includes(query) ||
            (m.location       || '').toLowerCase().includes(query) ||
            (m.refNumber      || '').toLowerCase().includes(query) ||
            (m.status         || '').toLowerCase().includes(query)
        );
    }

    renderAdminMemosList(filtered);
}

function getSignedPackageEntries(record = {}) {
    const entries = [];
    const pushEntry = (key, label, url) => {
        if (!url || entries.some(item => item.url === url)) return;
        entries.push({ key, label, url });
    };

    const memoUrl = record.completedMemoUrl
        || record.adminMemoUrl
        || ((record.status === 'เสร็จสิ้น' || record.status === 'รับไฟล์กลับไปใช้งาน')
            ? (record.pdfUrl || record.memoPdfUrl || record.currentPdfUrl || '')
            : '');
    pushEntry('memo', 'บันทึกข้อความ', memoUrl);

    if (record.completedCommandUrl) {
        pushEntry('command', 'คำสั่งไปราชการ', record.completedCommandUrl);
    }

    if (record.completedDispatchBookUrl || record.dispatchStatus === 'เสร็จสิ้น') {
        pushEntry('dispatch', 'หนังสือส่ง', record.completedDispatchBookUrl || record.dispatchBookUrl || record.dispatchBookPdfUrl || '');
    }

    return entries;
}

function getAdminUploadedMemoFiles(record = {}) {
    const files = [];
    const pushFile = (key, label, url, className) => {
        if (!url || files.some(item => item.url === url)) return;
        files.push({ key, label, url, className });
    };
    const firstUrl = (...values) => values.find(value => typeof value === 'string' && value.trim()) || '';

    // แสดงเฉพาะไฟล์ที่แอดมินอัปโหลดเอง ไม่รวมไฟล์ที่ระบบ generate / archive อัตโนมัติ
    pushFile('adminMemo', '📄 บันทึก', firstUrl(
        record.adminMemoUrl,
        record.completedMemoUrl,
        record.adminmemourl,
        record.completedmemourl
    ), 'bg-blue-100 text-blue-700 border border-blue-300 hover:bg-blue-200');
    pushFile('command', '📋 คำสั่ง', firstUrl(
        record.completedCommandUrl,
        record.commandPdfUrl,
        record.completedcommandurl
    ), 'bg-indigo-100 text-indigo-700 border border-indigo-300 hover:bg-indigo-200');
    pushFile('dispatch', '📦 หนังสือส่ง', firstUrl(
        record.dispatchBookUrl,
        record.completedDispatchBookUrl,
        record.dispatchBookPdfUrl,
        record.dispatchbookurl
    ), 'bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200');

    return files;
}

function decodeBase64ToArrayBuffer(base64) {
    const bin = window.atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

async function fetchPdfArrayBufferForMerge(url) {
    if (!url) throw new Error('ไม่พบลิงก์ไฟล์ PDF');

    if (url.includes('drive.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        const fileId = match ? match[1] : '';
        if (!fileId) throw new Error('ไม่สามารถอ่านรหัสไฟล์ Google Drive ได้');

        const scriptUrl = "https://script.google.com/macros/s/AKfycbyyUHx5gy7SFow_xex1Jt8TorLaWpxIgoYausg9z8QuSfoL8g_1r5on104A2m-PbGIWpA/exec";
        const response = await fetch(`${scriptUrl}?action=getPdfBase64&fileId=${fileId}`);
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message || 'ดึงไฟล์ PDF จาก Google Drive ไม่สำเร็จ');
        return decodeBase64ToArrayBuffer(result.data);
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`ดาวน์โหลดไฟล์ไม่สำเร็จ (${response.status})`);
    return response.arrayBuffer();
}

window.downloadAdminMergedPackage = async function(requestId) {
    if (!checkAdminAccess()) return;

    try {
        showAlert('กำลังดำเนินการ', 'กำลังรวมไฟล์ PDF ที่ลงนามเสร็จแล้ว...', false);

        let record = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId || r.refNumber === requestId) || {};

        const entries = getSignedPackageEntries(record);
        if (entries.length === 0) throw new Error('ยังไม่พบไฟล์ที่ลงนามเสร็จแล้วสำหรับรวมส่งเขต');

        const mergedPdf = await PDFLib.PDFDocument.create();
        const failed = [];

        for (const entry of entries) {
            try {
                const arrayBuffer = await fetchPdfArrayBufferForMerge(entry.url);
                const srcPdf = await PDFLib.PDFDocument.load(arrayBuffer);
                const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            } catch (error) {
                console.warn(`merge package skipped: ${entry.label}`, error);
                failed.push(entry.label);
            }
        }

        if (mergedPdf.getPageCount() === 0) {
            throw new Error('ไม่สามารถรวมไฟล์ได้ เนื่องจากทุกไฟล์เปิดไม่สำเร็จ');
        }

        const mergedBytes = await mergedPdf.save();
        const blob = new Blob([mergedBytes], { type: 'application/pdf' });
        const downloadUrl = URL.createObjectURL(blob);
        if (typeof triggerBrowserDownload === 'function') {
            triggerBrowserDownload(downloadUrl, `ชุดเอกสารส่งเขต_${safeId}.pdf`);
        } else {
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `ชุดเอกสารส่งเขต_${safeId}.pdf`;
            link.click();
        }
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);

        document.getElementById('alert-modal').style.display = 'none';
        const failedText = failed.length ? `\n\nหมายเหตุ: ข้ามไฟล์ ${failed.join(', ')}` : '';
        showAlert('✅ สำเร็จ', `รวมไฟล์ลงนามสำหรับส่งเขตเรียบร้อยแล้ว (${entries.length - failed.length}/${entries.length} ไฟล์)${failedText}`);
    } catch (error) {
        try { document.getElementById('alert-modal').style.display = 'none'; } catch (_) {}
        showAlert('ผิดพลาด', error.message);
    }
};

function renderAdminMemosList(memos) {
    const tableContainer = document.getElementById('admin-memos-table-list');
    const cardContainer = document.getElementById('admin-memos-cards');
    const compactView = isCompactAdminCardView();

    if (!memos || memos.length === 0) {
        if (tableContainer) tableContainer.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-gray-400">ไม่พบบันทึกข้อความในหมวดนี้</td></tr>`;
        if (cardContainer) cardContainer.innerHTML = `<div class="admin-card-empty">ไม่พบบันทึกข้อความในหมวดนี้</div>`;
        return;
    }

    const tableRows = [];
    const cardItems = [];

    memos.forEach((memo, idx) => {
        const adminUploadedFiles = getAdminUploadedMemoFiles(memo);
        const hasCompletedFiles = adminUploadedFiles.length > 0;
        const hasCommand = !!memo.completedCommandUrl || !!memo.commandPdfUrl;
        const signedPackageEntries = getSignedPackageEntries(memo);
        const canMergePackage = signedPackageEntries.length >= 2;
        const gasId = escapeHtml(memo.id || '');
        const refId = escapeHtml(memo.refNumber || memo.requestId || memo.id || '');
        const safeId = refId;
        const displayName = escapeHtml(memo.requesterName || memo.submittedBy || '-');
        const displayPurpose = escapeHtml(memo.purpose || memo.subject || '-');
        const displayLocation = escapeHtml(memo.location || (memo.province ? getStoredProvinceValue(memo.province) : '') || '-');

        let dateRange = '-';
        if (memo.startDate || memo.endDate) {
            const s = formatDisplayDate(memo.startDate);
            const e = formatDisplayDate(memo.endDate);
            dateRange = s === e ? s : `${s}<br><span class="text-gray-400">– ${e}</span>`;
        } else if (memo.docDate) {
            dateRange = formatDisplayDate(memo.docDate);
        }

        const statusText = translateStatus(memo.status || memo.docStatus || '');
        const statusColor = (memo.status === 'เสร็จสิ้น' || memo.status === 'อนุมัติ')
            ? 'bg-green-100 text-green-700'
            : (memo.status === 'ไม่อนุมัติ' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700');

        const fileLinks = adminUploadedFiles
            .map(file => `<a href="${file.url}" target="_blank" class="btn btn-xs ${file.className}">${file.label}</a>`)
            .join('');

        const rowClass = hasCommand ? 'row-green' : (hasCompletedFiles ? 'row-blue' : '');
        const cardHtml = `
        <article class="admin-record-card ${rowClass}">
            <div class="admin-record-card__summary">
                <div class="admin-record-card__subline">รายการที่ ${idx + 1}</div>
                <div class="admin-record-card__id">${safeId}</div>
                <div class="admin-record-card__name">${displayName}</div>
                <div class="admin-record-card__subline">${hasCommand ? '✅ ออกคำสั่งแล้ว' : '⏳ รอออกคำสั่ง'}</div>
            </div>
            <div class="admin-record-card__details">
                <div class="admin-record-card__meta">
                    <div class="admin-record-card__field admin-record-card__field--wide">
                        <span class="admin-record-card__field-label">เรื่อง</span>
                        <div class="admin-record-card__field-value">${displayPurpose}</div>
                    </div>
                    <div class="admin-record-card__field">
                        <span class="admin-record-card__field-label">สถานที่</span>
                        <div class="admin-record-card__field-value admin-record-card__field-value--muted">📍 ${displayLocation}</div>
                    </div>
                    <div class="admin-record-card__field">
                        <span class="admin-record-card__field-label">วันที่</span>
                        <div class="admin-record-card__field-value admin-record-card__field-value--muted">${dateRange}</div>
                    </div>
                </div>
            </div>
            <div class="admin-record-card__side">
                <div class="admin-record-card__badges"><span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">${statusText}</span></div>
                <div class="admin-record-card__files">${fileLinks || '<span class="text-xs text-gray-300">ยังไม่มีไฟล์แนบ</span>'}</div>
                <div class="admin-record-card__actions">
                    <button onclick="openAdminMemoAction('${gasId}', '${refId}')" class="btn btn-xs ${hasCompletedFiles ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'} text-white whitespace-nowrap">${hasCompletedFiles ? '📁 จัดการ' : '📤 อัพโหลด'}</button>
                    ${memo.docStatus === 'waiting_admin_final' ? `<button onclick="handleAdminFinalize('${refId}')" class="btn btn-xs bg-green-600 hover:bg-green-700 text-white">📦 ไฟนอลและส่งเก็บ</button>` : ''}
                    ${canMergePackage ? `<button onclick="downloadAdminMergedPackage('${refId}')" class="btn btn-xs btn--full bg-sky-100 text-sky-700 border border-sky-300 hover:bg-sky-200">🧷 รวมไฟล์ส่งเขต</button>` : ''}
                    <button onclick="deleteMemoByAdmin('${refId}', '${gasId}')" class="admin-record-card__delete">🗑️ ลบ</button>
                </div>
            </div>
        </article>`;

        const tableHtml = `
        <tr class="${rowClass}">
            <td class="text-center text-xs text-gray-400">${idx + 1}</td>
            <td><div class="font-bold text-indigo-700 text-sm">${safeId}</div>${hasCommand ? `<div class="text-xs text-green-600 mt-0.5">✅ ออกคำสั่งแล้ว</div>` : `<div class="text-xs text-gray-400 mt-0.5">⏳ รอออกคำสั่ง</div>`}</td>
            <td><div class="font-medium text-gray-800 text-sm">${displayName}</div></td>
            <td style="max-width:240px"><div class="text-gray-700 text-sm" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${displayPurpose}</div><div class="text-gray-400 text-xs mt-0.5">📍 ${displayLocation}</div></td>
            <td class="text-xs text-gray-600 whitespace-nowrap">${dateRange}</td>
            <td><span class="inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">${statusText}</span></td>
            <td><div class="flex flex-wrap gap-1">${fileLinks || '<span class="text-xs text-gray-300">—</span>'}</div></td>
            <td><div class="flex flex-col gap-1.5 items-center" style="min-width:100px"><button onclick="openAdminMemoAction('${gasId}', '${refId}')" class="btn btn-xs ${hasCompletedFiles ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500 hover:bg-orange-600'} text-white whitespace-nowrap">${hasCompletedFiles ? '📁 จัดการ' : '📤 อัพโหลด'}</button>${memo.docStatus === 'waiting_admin_final' ? `<button onclick="handleAdminFinalize('${refId}')" class="btn btn-xs bg-green-600 hover:bg-green-700 text-white">📦 ไฟนอลและส่งเก็บ</button>` : ''}${canMergePackage ? `<button onclick="downloadAdminMergedPackage('${refId}')" class="btn btn-xs bg-sky-100 text-sky-700 border border-sky-300 hover:bg-sky-200">🧷 รวมส่งเขต</button>` : ''}<button onclick="deleteMemoByAdmin('${refId}', '${gasId}')" class="text-xs text-red-400 hover:text-red-600">🗑️ ลบ</button></div></td>
        </tr>`;

        if (compactView) cardItems.push(cardHtml)
        else tableRows.push(tableHtml)
    });

    if (tableContainer) tableContainer.innerHTML = compactView ? '' : tableRows.join('');
    if (cardContainer) cardContainer.innerHTML = compactView ? cardItems.join('') : '';
}

// --- USER MANAGEMENT ---

async function deleteUser(username) {
    if (await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ ${username}?`)) {
        try { 
            await apiCall('POST', 'deleteUser', { username }); 
            showAlert('สำเร็จ', 'ลบผู้ใช้สำเร็จ'); 
            window.signerUserCandidatesCache = null;
            await fetchAllUsers(window.currentUsersDirectoryQuery || ''); 
        } catch (error) { 
            showAlert('ผิดพลาด', error.message); 
        }
    }
}

function openAddUserModal() { 
    document.getElementById('register-modal').style.display = 'flex'; 
}

// ในไฟล์ admin.js ค้นหาฟังก์ชัน downloadUserTemplate แล้วแทนที่ด้วยโค้ดนี้
function downloadUserTemplate() {
    withDownloadIndicator(async () => {
        const ws = XLSX.utils.aoa_to_sheet([
            ['Username', 'Password', 'FullName', 'Position', 'Department', 'Role'],
            ['teacher01', '123456', 'นายใจดี สอนดี', 'ครู', 'ภาษาไทย', 'user'],
            ['head_math', '123456', 'นายสมชาย รักเรียน', 'ครู', 'คณิตศาสตร์', 'head'],
            ['dep_acad', '123456', 'นายวิชา ชาญชำนาญ', 'รองผู้อำนวยการ', 'วิชาการ', 'deputy_acad'],
            ['saraban1', '123456', 'นางสาวเอกสาร รวดเร็ว', 'เจ้าหน้าที่', 'งานสารบรรณ', 'saraban']
        ]);
        
        ws['!cols'] = [{wch: 15}, {wch: 10}, {wch: 25}, {wch: 15}, {wch: 20}, {wch: 15}];
        
        const wb = XLSX.utils.book_new(); 
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'user_template_with_roles.xlsx');
    }, 'กำลังสร้างไฟล์แม่แบบรายชื่อผู้ใช้...');
}

async function handleUserImport(e) {
    const file = e.target.files[0]; 
    if (!file) return;
    try {
        const data = await file.arrayBuffer(); 
        const workbook = XLSX.read(data); 
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        const result = await apiCall('POST', 'importUsers', { users: jsonData });
        if (result.status === 'success') { 
            showAlert('สำเร็จ', result.message); 
            window.signerUserCandidatesCache = null;
            await fetchAllUsers(window.currentUsersDirectoryQuery || ''); 
        } else { 
            showAlert('ผิดพลาด', result.message); 
        }
    } catch (error) { 
        showAlert('ผิดพลาด', error.message); 
    } finally { 
        e.target.value = ''; 
    }
}

// --- OTHER MODALS ---

function openCommandApproval(requestId) {
    if (!checkAdminAccess()) return;
    document.getElementById('command-request-id').value = requestId;
    document.getElementById('command-approval-modal').style.display = 'flex';
}

// แก้ไขในไฟล์ admin.js

async function openDispatchModal(requestId) {
    if (!checkAdminAccess()) return;
    if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();
    
    // 1. Reset Form และเตรียมค่าเริ่มต้น
    document.getElementById('dispatch-form').reset();
    document.getElementById('dispatch-request-id').value = requestId;
    
    // ตั้งค่า Default จำนวนเอกสารแนบ 1-7 เป็น "๑" ทั้งหมด
    for(let i=1; i<=7; i++) {
        const el = document.getElementById(`qty${i}`);
        if(el) el.value = "๑";
    }

    // สร้าง Dropdown เดือน
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const now = new Date();
    const monthSelect = document.getElementById('dispatch-month');
    if(monthSelect) {
        monthSelect.innerHTML = thaiMonths.map(m => `<option value="${m}" ${m === thaiMonths[now.getMonth()] ? 'selected' : ''}>${m}</option>`).join('');
    }

    try {
        toggleLoader(isCompactAdminCardView() ? 'admin-requests-cards' : 'admin-requests-table-list', true);
        
        // 2. ดึงข้อมูลคำขอจาก Google Sheets (GAS)
        const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId });
        let data = {};
        if (result.status === 'success') {
            data = result.data.data || result.data;
        }

        // 3. เติมข้อมูลพื้นฐานลงฟอร์ม
        if (monthSelect) {
            const selectedMonth = data.dispatchMonth || thaiMonths[now.getMonth()];
            monthSelect.value = thaiMonths.includes(selectedMonth) ? selectedMonth : thaiMonths[now.getMonth()];
        }
        const yearInput = document.getElementById('dispatch-year');
        if(yearInput) yearInput.value = data.dispatchYear || (now.getFullYear() + 543);
        document.getElementById('dispatch-purpose').value = data.purpose || '';
        document.getElementById('dispatch-location').value = data.location || '';
        document.getElementById('dispatch-province').value = getPlainProvinceValue(data.province || 'สระแก้ว');
        
        // ตอนนี้ข้อมูล 'ที่พัก' จะถูกแสดงอย่างถูกต้องแล้ว
        document.getElementById('dispatch-stay-at').value = data.stayAt || ''; 

        // 4. จัดการวันที่และเวลา
        const toInputDate = (d) => d ? new Date(d).toISOString().split('T')[0] : '';
        document.getElementById('dispatch-date-start').value = toInputDate(data.startDate);
        document.getElementById('dispatch-date-end').value = toInputDate(data.endDate);
        document.getElementById('dispatch-time-start').value = data.startTime || '06:00';
        document.getElementById('dispatch-time-end').value = data.endTime || '18:00';

        // 5. จัดการยานพาหนะ
        if (data.dispatchVehicleType && data.dispatchVehicleType.trim() !== "") {
            document.getElementById('dispatch-vehicle-type').value = data.dispatchVehicleType;
            document.getElementById('dispatch-vehicle-id').value = data.dispatchVehicleId || '-';
        } else {
            // Fallback: ถ้าไม่มีข้อมูลแบบใหม่ ให้แปลงจาก Checkbox เดิม
            let vType = 'รถตู้'; 
            if (data.vehicleOption === 'gov') vType = 'รถบัสโรงเรียน'; 
            else if (data.vehicleOption === 'private') vType = 'รถยนต์ส่วนตัว';
            else if (data.vehicleOption === 'public') vType = 'รถโดยสารสาธารณะ';
            
            document.getElementById('dispatch-vehicle-type').value = vType;
            document.getElementById('dispatch-vehicle-id').value = data.licensePlate || data.publicVehicleDetails || '-';
        }

        // 6. นับจำนวนครู/นักเรียนอัตโนมัติ
        if (data.studentCount !== undefined && data.teacherCount !== undefined) {
            document.getElementById('student-count').value = data.studentCount;
            document.getElementById('teacher-count').value = data.teacherCount;
        } else {
            let attendees = [];
            try { 
                attendees = typeof data.attendees === 'string' ? JSON.parse(data.attendees) : (data.attendees || []); 
            } catch(e) { 
                attendees = []; 
            }
            
            let sCount = 0; // นักเรียน
            let tCount = 0; // ครู/บุคลากร
            const isStudent = (pos) => (pos || '').trim().includes('นักเรียน');
            
            // เช็คผู้ขอ
            if (isStudent(data.requesterPosition)) sCount++; else tCount++;
            
            // เช็คผู้ติดตาม
            attendees.forEach(att => {
                if ((att.name||'').trim() !== (data.requesterName||'').trim()) {
                    if (isStudent(att.position)) sCount++; else tCount++;
                }
            });

            document.getElementById('student-count').value = sCount;
            document.getElementById('teacher-count').value = tCount;
        }

        for (let i = 1; i <= 7; i++) {
            const qtyInput = document.getElementById(`qty${i}`);
            if (qtyInput) qtyInput.value = data[`qty${i}`] || '๑';
        }

        // 7. เปิด Modal
        const modal = document.getElementById('dispatch-modal');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถดึงข้อมูลคำขอได้');
    } finally {
        toggleLoader(isCompactAdminCardView() ? 'admin-requests-cards' : 'admin-requests-table-list', false);
    }
}

function openAdminMemoAction(memoId, refNumber) {
    if (!checkAdminAccess()) return;
    // memoId    = memo.id สำหรับ GAS API
    // refNumber = เลขที่บันทึกข้อความ (refNumber) สำหรับ Firestore key
    document.getElementById('admin-memo-id').value        = memoId;
    document.getElementById('admin-memo-refnumber').value = refNumber || memoId;

    // รีเซ็ตช่องเหตุผลตีกลับและยกเลิก
    const reasonBox = document.getElementById('admin-rejection-reason-container');
    const reasonInput = document.getElementById('admin-rejection-reason');
    const cancelBox = document.getElementById('admin-cancel-reason-container');
    const cancelInput = document.getElementById('admin-cancel-reason');
    if (reasonBox) reasonBox.classList.add('hidden');
    if (reasonInput) reasonInput.value = '';
    if (cancelBox) cancelBox.classList.add('hidden');
    if (cancelInput) cancelInput.value = '';

    // Show/hide ช่องเหตุผลตาม status ที่เลือก
    const statusSel = document.getElementById('admin-memo-status');
    const handleStatusChange = () => {
        const val = statusSel?.value;
        if (reasonBox) reasonBox.classList.toggle('hidden', val !== 'นำกลับไปแก้ไข');
        if (cancelBox) cancelBox.classList.toggle('hidden', val !== 'ยกเลิก');
    };
    // ถอด listener เก่าก่อน (ป้องกันซ้ำ) แล้วใส่ใหม่
    statusSel?.removeEventListener('change', statusSel._rejectHandler);
    statusSel._rejectHandler = handleStatusChange;
    statusSel?.addEventListener('change', handleStatusChange);
    handleStatusChange(); // เรียกทันทีเผื่อค่าเดิมเป็น "นำกลับไปแก้ไข"

    document.getElementById('admin-memo-action-modal').style.display = 'flex';
}

async function handleCommandApproval(e) {
    e.preventDefault();
    const requestId = document.getElementById('command-request-id').value;
    const commandType = document.querySelector('input[name="command_type"]:checked')?.value;
    
    if (!commandType) { showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); return; }
    
    toggleLoader('command-approval-submit-button', true);
    try {
        const result = await apiCall('POST', 'approveCommand', { requestId: requestId, templateType: commandType });
        if (result.status === 'success') { 
            showAlert('สำเร็จ', 'อนุมัติคำสั่งเรียบร้อยแล้ว'); 
            document.getElementById('command-approval-modal').style.display = 'none'; 
            document.getElementById('command-approval-form').reset(); 
            await fetchAllRequestsForCommand(); 
        } else { 
            showAlert('ผิดพลาด', result.message); 
        }
    } catch (error) { 
        showAlert('ผิดพลาด', error.message); 
    } finally { 
        toggleLoader('command-approval-submit-button', false); 
    }
}

async function handleAdminMemoActionSubmit(e) {
    e.preventDefault();
    const memoId = document.getElementById('admin-memo-id').value;
    const status = document.getElementById('admin-memo-status').value;

    // ── กรณียกเลิก: ลบเอกสารออกจากระบบทั้งหมด ──
    if (status === 'ยกเลิก') {
        const cancelReason = document.getElementById('admin-cancel-reason')?.value?.trim() || 'ไม่ระบุเหตุผล';
        const refNumber = document.getElementById('admin-memo-refnumber')?.value || memoId;
        const confirmed = await showConfirm(
            '⚠️ ยืนยันการยกเลิก',
            `คุณแน่ใจหรือไม่ที่จะลบบันทึก "${refNumber}" ออกจากระบบ?\n\nเหตุผล: ${cancelReason}\n\nการดำเนินการนี้ไม่สามารถยกเลิกได้`
        );
        if (!confirmed) return;

        toggleLoader('admin-memo-submit-button', true);
        showSavingOverlay('กำลังลบบันทึกออกจากระบบ...');
        try {
            // Sync ไป GAS/Supabase ว่าถูกยกเลิก
            await apiCall('POST', 'updateRequest', {
                requestId: refNumber,
                status: 'ยกเลิก',
                cancelReason
            });

            showAlert('สำเร็จ', `ลบบันทึก "${refNumber}" ออกจากระบบเรียบร้อยแล้ว`);
            document.getElementById('admin-memo-action-modal').style.display = 'none';
            document.getElementById('admin-memo-action-form').reset();
            await fetchAllMemos();
        } catch (error) {
            showAlert('ผิดพลาด', `ไม่สามารถลบบันทึกได้: ${error.message}`);
        } finally {
            toggleLoader('admin-memo-submit-button', false);
            hideSavingOverlay();
        }
        return;
    }

    const completedMemoFile    = document.getElementById('admin-completed-memo-file').files[0];
    const completedCommandFile = document.getElementById('admin-completed-command-file').files[0];
    const dispatchBookFile     = document.getElementById('admin-dispatch-book-file').files[0];

    toggleLoader('admin-memo-submit-button', true);
    showSavingOverlay('กำลังอัปโหลดไฟล์และบันทึกข้อมูล...');

    try {
        const refNumber = document.getElementById('admin-memo-refnumber')?.value || memoId;
        const safeId    = refNumber.replace(/[\/\\:\.]/g, '-');
        const adminUser = getCurrentUser()?.username || 'admin';

        // --- อัปโหลดไฟล์ไปยัง Firebase Storage โดยตรง ---
        const urls = {};
        if (completedMemoFile) {
            const ext = completedMemoFile.name.split('.').pop();
            urls.adminMemoUrl = await uploadFileToStorage(
                completedMemoFile, adminUser,
                `memo_admin_${safeId}_${Date.now()}.${ext}`,
                completedMemoFile.type
            );
            console.log('✅ Admin memo file uploaded:', urls.adminMemoUrl);
        }
        if (completedCommandFile) {
            const ext = completedCommandFile.name.split('.').pop();
            urls.completedCommandUrl = await uploadFileToStorage(
                completedCommandFile, adminUser,
                `command_${safeId}_${Date.now()}.${ext}`,
                completedCommandFile.type
            );
            console.log('✅ Command file uploaded:', urls.completedCommandUrl);
        }
        if (dispatchBookFile) {
            const ext = dispatchBookFile.name.split('.').pop();
            urls.dispatchBookUrl = await uploadFileToStorage(
                dispatchBookFile, adminUser,
                `dispatch_${safeId}_${Date.now()}.${ext}`,
                dispatchBookFile.type
            );
            console.log('✅ Dispatch book uploaded:', urls.dispatchBookUrl);
        }

        // --- อัปเดต Firestore ---
        if (typeof db !== 'undefined') {
            const updateData = {
                status,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (status === 'นำกลับไปแก้ไข') {
                const reason = document.getElementById('admin-rejection-reason')?.value?.trim() || 'ไม่ระบุเหตุผล';
                updateData.wasRejected     = true;
                updateData.docStatus       = 'waiting_admin_review';
                updateData.rejectedBy      = adminUser;
                updateData.rejectedAt      = new Date().toISOString();
                updateData.rejectionReason = reason;
            } else if (status === 'เสร็จสิ้น' || status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') {
                updateData.wasRejected = false;
            }

            // adminMemoUrl = ไฟล์ที่แอดมินอัพโหลดให้ผู้ใช้นำไปใช้งาน
            if (urls.adminMemoUrl)        updateData.adminMemoUrl        = urls.adminMemoUrl;
            if (urls.completedCommandUrl) updateData.completedCommandUrl = urls.completedCommandUrl;
            if (urls.dispatchBookUrl)     updateData.dispatchBookUrl     = urls.dispatchBookUrl;

            // ดึง username จาก cache เพื่อให้ onSnapshot ผู้ใช้ (where username==...) หาเจอได้
            const memoInCache = allMemosCache.find(m =>
                (m.refNumber || m.id) === refNumber || m.id === memoId
            );
            if (memoInCache?.submittedBy) updateData.username = memoInCache.submittedBy;

        }

        // --- Sync ไป GAS/Supabase ---
        await apiCall('POST', 'updateRequest', {
            requestId: refNumber,
            status,
            ...updateData,
            ...urls,
            lastUpdated: new Date().toISOString()
        });

        if (status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') {
            const memo = allMemosCache.find(m => m.id === memoId);
            if (memo?.submittedBy) {
                await sendCompletionEmail(memo.refNumber, memo.submittedBy, status);
            }
        }

        showAlert('สำเร็จ', 'อัปเดตสถานะและไฟล์เรียบร้อยแล้ว');
        document.getElementById('admin-memo-action-modal').style.display = 'none';
        document.getElementById('admin-memo-action-form').reset();
        await fetchAllMemos();

    } catch (error) {
        showAlert('ผิดพลาด', error.message);
    } finally {
        toggleLoader('admin-memo-submit-button', false);
        hideSavingOverlay();
    }
}

async function sendCompletionEmail(requestId, username, status) {
    try { 
        await apiCall('POST', 'sendCompletionEmail', { requestId: requestId, username: username, status: status }); 
    } catch (error) {}
}

async function openAdminGenerateCommand(requestId) {
    try {
        if (!checkAdminAccess()) return;

        document.getElementById('admin-command-result').classList.add('hidden');
        document.getElementById('admin-command-form').classList.remove('hidden');
        document.getElementById('admin-command-attendees-list').innerHTML = '';

        const gasResult = await apiCall('GET', 'getDraftRequest', { requestId: requestId });

        // เริ่มจาก GAS data เป็นฐาน
        let data = {};
        if (gasResult.status === 'success' && gasResult.data) {
            data = gasResult.data.data || gasResult.data;
        }

        if (!data.requesterName && !data.location) {
            showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้');
            return;
        }

        document.getElementById('admin-command-request-id').value = requestId;
        document.getElementById('admin-command-request-id-display').value = requestId;

        const toInputDate = (dateStr) => {
            if(!dateStr) return '';
            const d = new Date(dateStr);
            return !isNaN(d) ? d.toISOString().split('T')[0] : '';
        };

        const docDateInput = document.getElementById('admin-command-doc-date');
        docDateInput.value = toInputDate(data.docDate);
        docDateInput.readOnly = true;
        docDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'text-gray-500');

        document.getElementById('admin-command-requester-name').value = data.requesterName || '';
        document.getElementById('admin-command-requester-position').value = data.requesterPosition || '';
        document.getElementById('admin-command-location').value = data.location || '';
        document.getElementById('admin-command-province').value = getPlainProvinceValue(data.province || 'สระแก้ว');
        document.getElementById('admin-command-purpose').value = data.purpose || '';
        document.getElementById('admin-command-start-date').value = toInputDate(data.startDate);
        document.getElementById('admin-command-end-date').value = toInputDate(data.endDate);

        const attendeeCountForType = Array.isArray(data.attendees) ? data.attendees.length + 1 : 1;
        const inferredTemplateType = attendeeCountForType <= 1 ? 'solo' : (attendeeCountForType <= 5 ? 'groupSmall' : 'groupLarge');
        const selectedTemplateType = data.commandTemplateType || inferredTemplateType;
        document.querySelectorAll('input[name="admin-command-type"]').forEach(radio => {
            radio.checked = radio.value === selectedTemplateType;
        });

        // เติมรายชื่อผู้ร่วมเดินทาง
        const attendeesToShow = Array.isArray(data.attendees) ? data.attendees : [];
        attendeesToShow.forEach(att => addAdminAttendeeField(att.name || att['ชื่อ-นามสกุล'] || '', att.position || att['ตำแหน่ง'] || ''));

        document.getElementById('admin-expense-option').value = data.expenseOption || 'no';
        document.getElementById('admin-expense-items').value = typeof data.expenseItems === 'object' ? JSON.stringify(data.expenseItems) : (data.expenseItems || '[]');
        document.getElementById('admin-total-expense').value = data.totalExpense || 0;
        document.getElementById('admin-vehicle-option').value = data.vehicleOption || 'gov';
        document.getElementById('admin-license-plate').value = data.licensePlate || '';

        const vehicleText = data.vehicleOption === 'gov' ? 'รถราชการ' :
                          data.vehicleOption === 'private' ? ('รถส่วนตัว ' + (data.licensePlate||'')) : 'อื่นๆ';
        document.getElementById('admin-command-vehicle-info').textContent = `พาหนะ: ${vehicleText}`;

        await switchPage('admin-generate-command-page');

        const addBtn = document.getElementById('admin-add-attendee-btn');
        const newBtn = addBtn.cloneNode(true);
        addBtn.parentNode.replaceChild(newBtn, addBtn);
        newBtn.addEventListener('click', () => addAdminAttendeeField());

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
    }
}

function addAdminAttendeeField(name = '', position = '') {
    const list = document.getElementById('admin-command-attendees-list');
    if (!list) return;
    
    const div = document.createElement('div');
    div.className = 'grid grid-cols-1 md:grid-cols-2 gap-2 mb-2 items-center bg-gray-50 p-2 rounded border border-gray-200';
    div.innerHTML = `
        <input type="text" class="form-input admin-att-name w-full" placeholder="ชื่อ-นามสกุล" value="${escapeHtml(name)}">
        <div class="flex gap-2">
            <input type="text" class="form-input admin-att-pos w-full" placeholder="ตำแหน่ง" value="${escapeHtml(position)}">
            <button type="button" class="btn btn-danger btn-sm px-3 font-bold hover:bg-red-700 transition" onclick="this.closest('.grid').remove()" title="ลบรายชื่อนี้">×</button>
        </div>
    `;
    list.appendChild(div);
}

function showDualLinkResult(containerId, title, docUrl, pdfUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <h3 class="font-bold text-lg text-green-800">${title}</h3>
        <p class="mt-2 text-gray-700">ดำเนินการเสร็จสิ้น ท่านสามารถเลือกเปิดไฟล์ได้ 2 รูปแบบ:</p>
        <div class="flex justify-center flex-wrap gap-4 mt-4">
            ${docUrl ? `
            <a href="${docUrl}" target="_blank" class="btn bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center gap-2">
                📝 แก้ไขใน Google Doc
            </a>` : ''}
            
            ${pdfUrl ? `
            <a href="${pdfUrl}" target="_blank" class="btn bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center gap-2">
                📄 เปิดไฟล์ PDF
            </a>` : ''}
            
            <button onclick="switchPage('command-generation-page')" class="btn bg-gray-500 text-white">กลับหน้าจัดการ</button>
        </div>
    `;
    
    container.classList.remove('hidden');
}

// --- DELETE FUNCTIONS (สำหรับ Admin) ---

async function deleteRequestByAdmin(requestId) {
    if (!await showConfirm("ยืนยันการลบ", `ต้องการลบคำขอ ${requestId} ออกจากระบบ?\n\nการดำเนินการนี้ไม่สามารถยกเลิกได้`)) return;
    toggleLoader(isCompactAdminCardView() ? 'admin-requests-cards' : 'admin-requests-table-list', true);
    try {
        const adminUsername = getCurrentUser()?.username || 'admin';
        const safeId = requestId.replace(/[\/\\:\.]/g, '-');
        await apiCall('POST', 'deleteRequest', { requestId, username: adminUsername });
        if (typeof clearRequestsCache === 'function') clearRequestsCache();
        showAlert('สำเร็จ', `ลบคำขอ ${requestId} ออกจากระบบเรียบร้อยแล้ว`);
        await fetchAllRequestsForCommand();
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
        await fetchAllRequestsForCommand();
    }
}

async function deleteMemoByAdmin(refId, gasId) {
    // refId  = เลขที่บันทึกข้อความ (สำหรับ Firestore key)
    // gasId  = memo.id ภายใน GAS Sheet (สำหรับ GAS API) — fallback เป็น refId ถ้าไม่มี
    const displayId = refId || gasId;
    if (!await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ที่จะลบบันทึกข้อความเลขที่ ${displayId}?`)) return;
    toggleLoader(isCompactAdminCardView() ? 'admin-memos-cards' : 'admin-memos-table-list', true);
    try {
        // ★ ส่ง GAS API ด้วย gasId (internal) — fallback เป็น refId ถ้าเหมือนกัน
        const result = await apiCall('POST', 'deleteMemo', { id: gasId || refId });
        if (result.status === 'success') {
            if (typeof clearRequestsCache === 'function') clearRequestsCache();
            showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว');
            await fetchAllMemos();
        } else { throw new Error(result.message); }
    } catch (error) {
        showAlert('ผิดพลาด', 'ไม่สามารถลบได้: ' + error.message);
        await fetchAllMemos();
    }
}

// blobToBase64 is defined in utils.js (shared utility)
// --- เพิ่มใน js/admin.js ---

/**
 * ฟังก์ชัน Sync ข้อมูลจาก Google Sheets ลง Supabase
 * ใช้สำหรับกู้คืน/ซ่อมข้อมูลเมื่อข้อมูลฝั่ง Sheets กับ Supabase ไม่ตรงกัน
 */
async function syncAllDataFromSheetToSupabase() {
    if (!checkAdminAccess()) return;

    const btn = document.getElementById('admin-sync-btn');
    if(btn) toggleLoader('admin-sync-btn', true);

    try {
        const yearSelect = document.getElementById('admin-year-select');
        const currentYear = new Date().getFullYear() + 543;
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;

        console.log("🚀 Starting Supabase repair sync...");

        const result = await apiCall('POST', 'syncSheetsToSupabase', {
            year: selectedYear
        });

        if (result.status !== 'success') {
            throw new Error(result.message || 'ไม่สามารถซิงก์ข้อมูลไปยัง Supabase ได้');
        }

        const counts = result.counts || {};
        showAlert(
            'สำเร็จ',
            `ซิงก์ข้อมูลจาก Google Sheets ไปยัง Supabase เรียบร้อยแล้ว\n` +
            `ปี ${selectedYear}: คำขอ ${counts.requests || 0} รายการ, ผู้ร่วมเดินทาง ${counts.attendees || 0} รายการ, บันทึก ${counts.memos || 0} รายการ, ผู้ใช้ ${counts.users || 0} รายการ`
        );
        
        // รีโหลดหน้าจอเพื่อแสดงผล
        if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();
        if (typeof fetchAllMemos === 'function') await fetchAllMemos();

        return result;
    } catch (error) {
        console.error("Supabase Sync Error:", error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการซิงค์: ' + error.message);
    } finally {
        if(btn) toggleLoader('admin-sync-btn', false);
    }
}

async function syncAllDataFromSheetToFirebase() {
    return syncAllDataFromSheetToSupabase();
}

// --- SUPABASE → SHEETS MONTHLY BACKUP (Admin) ---

/**
 * สำรองข้อมูลทั้งหมดจาก Supabase ไปยัง Google Sheets
 * เรียกจากปุ่ม "สำรองข้อมูล → Google Sheets" ในหน้า Admin
 */
async function adminBackupSupabaseToSheets() {
    if (!checkAdminAccess()) return;

    const yearSelect = document.getElementById('admin-year-select');
    const currentYear = new Date().getFullYear() + 543;
    const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;

    const confirmed = await showConfirm(
        'ยืนยันการสำรองข้อมูล',
        `ระบบจะส่งข้อมูลทั้งหมดในปี พ.ศ. ${selectedYear} จาก Supabase ไปบันทึกใน Google Sheets\nใช้เวลาสักครู่ กรุณารอ...`
    );
    if (!confirmed) return;

    const btn = document.getElementById('admin-backup-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loader-sm"></span> กำลังสำรองข้อมูล...'; }

    try {
        showAlert('กำลังดำเนินการ', 'กำลังสำรองข้อมูลไปยัง Google Sheets... กรุณารอ', false);
        const result = await backupSupabaseToSheets(selectedYear);
        document.getElementById('alert-modal').style.display = 'none';

        if (result.status === 'success') {
            showAlert('สำเร็จ', result.message || `สำรองข้อมูล ${result.count || 0} รายการเรียบร้อยแล้ว`);
        } else {
            throw new Error(result.message || 'สำรองข้อมูลไม่สำเร็จ');
        }
    } catch (error) {
        document.getElementById('alert-modal').style.display = 'none';
        console.error('Backup error:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการสำรองข้อมูล: ' + error.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '💾 สำรองข้อมูลจาก Supabase → Sheets'; }
    }
}

async function adminBackupFirestoreToSheets() {
    return adminBackupSupabaseToSheets();
}

// --- YEARLY BACKUP EMAIL ---

async function adminSendYearlyBackupEmail() {
    if (!checkAdminAccess()) return;

    const yearSelect = document.getElementById('admin-year-select');
    const currentYear = new Date().getFullYear() + 543;
    const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;

    // ขอ email ปลายทาง
    const emailInput = prompt(
        `ส่ง Email สำรองข้อมูลประจำปี พ.ศ. ${selectedYear}\n\nกรอก Email ที่ต้องการรับข้อมูล:`,
        getCurrentUser()?.email || ''
    );
    if (!emailInput || !emailInput.trim()) return;
    const email = emailInput.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return showAlert('ผิดพลาด', 'รูปแบบ Email ไม่ถูกต้อง');
    }

    const confirmed = await showConfirm(
        'ยืนยันการส่ง Email',
        `ระบบจะส่งข้อมูลทั้งหมดในปี พ.ศ. ${selectedYear} พร้อม link ดาวน์โหลดไฟล์ทุกรายการ ไปที่\n\n${email}\n\nใช้เวลาสักครู่ กรุณารอ...`
    );
    if (!confirmed) return;

    const btn = document.getElementById('admin-email-backup-btn');
    const origLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ กำลังส่ง...'; }

    try {
        showAlert('กำลังดำเนินการ', 'กำลังรวบรวมข้อมูลและส่ง Email... กรุณารอสักครู่', false);

        const result = await apiCall('POST', 'sendYearlyBackupEmailByYear', {
            year:     selectedYear,
            email:    email
        });

        document.getElementById('alert-modal').style.display = 'none';
        if (result.status === 'success') {
            showAlert('ส่ง Email สำเร็จ', `${result.message}\n\nเปิด archive page เพื่อดูข้อมูลออนไลน์ได้ที่ปุ่ม "📚 คลังข้อมูล"`);
        } else {
            throw new Error(result.message || 'ส่ง Email ไม่สำเร็จ');
        }
    } catch (error) {
        document.getElementById('alert-modal').style.display = 'none';
        console.error('Send backup email error:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = origLabel; }
    }
}

function formatKeepAliveTimeLabel(value) {
    if (!value) return 'ยังไม่มีข้อมูล';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function renderSupabaseKeepAliveStatus(data = {}) {
    const box = document.getElementById('supabase-keepalive-status');
    if (!box) return;

    const enabled = data.enabled === true;
    const statusText = enabled ? 'เปิดใช้งานอยู่' : 'ยังไม่ได้เปิดใช้งาน';
    const healthText = data.lastStatus === 'success'
        ? 'ปลุกล่าสุดสำเร็จ'
        : (data.lastStatus === 'error' ? 'ปลุกล่าสุดไม่สำเร็จ' : 'ยังไม่เคยปลุก');
    const intervalText = `${data.intervalDays || 5} วัน`;

    box.innerHTML = `
        <div class="space-y-1">
            <div><strong>สถานะ:</strong> ${statusText}</div>
            <div><strong>รอบการปลุก:</strong> ทุก ${intervalText}</div>
            <div><strong>สุขภาพล่าสุด:</strong> ${healthText}</div>
            <div><strong>รันล่าสุด:</strong> ${formatKeepAliveTimeLabel(data.lastRunAt)}</div>
            <div><strong>สำเร็จล่าสุด:</strong> ${formatKeepAliveTimeLabel(data.lastSuccessAt)}</div>
            <div><strong>ข้อความ:</strong> ${data.lastMessage || 'ยังไม่มีข้อความ'}</div>
        </div>
    `;
}

async function loadSupabaseKeepAliveStatus() {
    if (!checkAdminAccess()) return;

    const box = document.getElementById('supabase-keepalive-status');
    if (box) box.textContent = 'กำลังโหลดสถานะ...';

    try {
        const result = await apiCall('GET', 'getSupabaseKeepAliveStatus', {}, 2, { silent: true });
        renderSupabaseKeepAliveStatus(result?.data || {});
    } catch (error) {
        console.error('Load keep-alive status error:', error);
        const message = String(error?.message || '');
        if (box) {
            if (message.includes('ScriptApp.getProjectTriggers') || message.includes('script.scriptapp')) {
                box.innerHTML = `
                    <div class="space-y-1 text-amber-800">
                        <div><strong>ยังไม่พร้อมใช้งาน</strong></div>
                        <div>ระบบยังไม่ได้รับสิทธิ์ ScriptApp สำหรับจัดการ trigger</div>
                        <div>ให้อัปเดต manifest และอนุญาตสิทธิ์ใหม่ใน Apps Script ก่อน</div>
                    </div>
                `;
            } else {
                box.textContent = 'โหลดสถานะ keep-alive ไม่สำเร็จ';
            }
        }
    }
}

async function enableSupabaseKeepAlive() {
    if (!checkAdminAccess()) return;
    const btn = document.getElementById('supabase-keepalive-enable-btn');
    const intervalDays = 5;

    if (btn) toggleLoader('supabase-keepalive-enable-btn', true);
    try {
        const result = await apiCall('POST', 'installSupabaseKeepAliveTrigger', {
            intervalDays
        });
        if (result?.status !== 'success') {
            throw new Error(result?.message || 'เปิดระบบกันหลับไม่สำเร็จ');
        }
        renderSupabaseKeepAliveStatus(result.data || {});
        showAlert('สำเร็จ', 'เปิดใช้งานระบบป้องกัน Supabase หลับแล้ว');
    } catch (error) {
        console.error('Enable keep-alive error:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถเปิดระบบกันหลับได้: ' + error.message);
    } finally {
        if (btn) toggleLoader('supabase-keepalive-enable-btn', false);
    }
}

async function disableSupabaseKeepAlive() {
    if (!checkAdminAccess()) return;
    const btn = document.getElementById('supabase-keepalive-disable-btn');

    if (btn) toggleLoader('supabase-keepalive-disable-btn', true);
    try {
        const result = await apiCall('POST', 'removeSupabaseKeepAliveTrigger', {});
        if (result?.status !== 'success') {
            throw new Error(result?.message || 'ปิดระบบกันหลับไม่สำเร็จ');
        }
        renderSupabaseKeepAliveStatus(result.data || {});
        showAlert('สำเร็จ', 'ปิดระบบป้องกัน Supabase หลับแล้ว');
    } catch (error) {
        console.error('Disable keep-alive error:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถปิดระบบกันหลับได้: ' + error.message);
    } finally {
        if (btn) toggleLoader('supabase-keepalive-disable-btn', false);
    }
}

async function runSupabaseKeepAliveNowFromAdmin() {
    if (!checkAdminAccess()) return;
    const btn = document.getElementById('supabase-keepalive-run-btn');

    if (btn) toggleLoader('supabase-keepalive-run-btn', true);
    try {
        const result = await apiCall('POST', 'runSupabaseKeepAliveNow', {});
        if (result?.status !== 'success') {
            throw new Error(result?.message || 'ปลุก Supabase ไม่สำเร็จ');
        }
        renderSupabaseKeepAliveStatus(result.data || {});
        showAlert('สำเร็จ', 'ปลุก Supabase สำเร็จแล้ว');
    } catch (error) {
        console.error('Run keep-alive now error:', error);
        showAlert('ผิดพลาด', 'ปลุก Supabase ไม่สำเร็จ: ' + error.message);
    } finally {
        if (btn) toggleLoader('supabase-keepalive-run-btn', false);
    }
}

// --- ANNOUNCEMENT MANAGEMENT ---

async function loadAdminAnnouncementSettings() {
    if (!checkAdminAccess()) return;
    
    // Reset Form
    document.getElementById('announcement-active').checked = false;
    document.getElementById('announcement-title-input').value = '';
    document.getElementById('announcement-message-input').value = '';
    document.getElementById('current-announcement-img-preview').classList.add('hidden');

    try {
        const result = await apiCall('GET', 'getAnnouncementSetting');
        const data = result?.status === 'success' ? (result.data || {}) : {};
        document.getElementById('announcement-active').checked = data.isActive || false;
        document.getElementById('announcement-title-input').value = data.title || '';
        document.getElementById('announcement-message-input').value = data.message || '';
        
        if (data.imageUrl) {
            const preview = document.getElementById('current-announcement-img-preview');
            preview.classList.remove('hidden');
            
            // ★★★ แก้ไขตรงนี้: แปลงลิงก์ก่อนแสดงผล ★★★
            let displayUrl = data.imageUrl;
            if (displayUrl.includes('drive.google.com') && displayUrl.includes('/d/')) {
                // ดึง File ID ออกมาแล้วสร้างลิงก์แบบ Direct
                const fileId = displayUrl.split('/d/')[1].split('/')[0];
                displayUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
            }
            
            preview.querySelector('img').src = displayUrl;
        }
    } catch (e) { 
        console.error("Load Announcement Error:", e);
        showAlert('แจ้งเตือน', 'ไม่สามารถโหลดข้อมูลประกาศล่าสุดได้');
    }
}

async function handleSaveAnnouncement(e) {
    e.preventDefault();
    if (!checkAdminAccess()) return;

    toggleLoader('save-announcement-btn', true);

    try {
        const isActive = document.getElementById('announcement-active').checked;
        const title = document.getElementById('announcement-title-input').value;
        const message = document.getElementById('announcement-message-input').value;
        const fileInput = document.getElementById('announcement-image-input');
        
        let imageUrl = null;

        // ถ้ามีการอัปโหลดรูปใหม่
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const ext = file.name.split('.').pop() || 'jpg';
            imageUrl = await uploadFileToStorage(
                file, getCurrentUser()?.username || 'admin',
                `announcement_${Date.now()}.${ext}`, file.type
            );
        } else {
            // ถ้าไม่ได้อัปใหม่ ให้ใช้รูปเดิม (ดึงจาก src ของ preview)
            const previewImg = document.querySelector('#current-announcement-img-preview img');
            if (previewImg && !document.getElementById('current-announcement-img-preview').classList.contains('hidden')) {
                imageUrl = previewImg.src;
            }
        }

        const result = await apiCall('POST', 'saveAnnouncementSetting', {
            isActive,
            title,
            message,
            imageUrl,
            updatedBy: getCurrentUser()?.username || 'admin'
        });
        if (result?.status !== 'success') {
            throw new Error(result?.message || 'บันทึกประกาศไม่สำเร็จ');
        }

        showAlert('สำเร็จ', 'บันทึกประกาศเรียบร้อยแล้ว');
        
        // ล้างค่า input file
        fileInput.value = '';
        loadAdminAnnouncementSettings(); 

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + error.message);
    } finally {
        toggleLoader('save-announcement-btn', false);
    }
}

// ============================================================
// 🔴 HIGH PRIORITY: ADMIN DASHBOARD + PIPELINE + BULK ACTIONS
// ============================================================

// --- ADMIN DASHBOARD ---

async function loadAdminDashboard() {
    if (!checkAdminAccess()) return;

    _setAdminDashboardLoading();
    const yearSelect = document.getElementById('admin-year-select');
    const currentYear = new Date().getFullYear() + 543;
    const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;

    // ใช้ cache ถ้ามีอยู่แล้ว ไม่ต้องดึงใหม่
    let requests = allRequestsCache || [];
    if (!requests.length) {
        try {
            const res = await apiCall('GET', 'getAllRequests', {
                year: selectedYear,
                latestMonth: 'true'
            });
            requests = res.status === 'success' ? (res.data || []) : [];
            allRequestsCache = requests;
            window.allRequestsCacheScope = 'latest-month-admin';
        } catch (e) {
            console.warn('Dashboard: failed to load requests', e.message);
        }
    }

    _renderKpiCards(requests);
    _renderPipeline(requests);
    _renderOverdueList(requests);
    _renderRecentList(requests);
}

function _setAdminDashboardLoading() {
    ['kpi-pending-command', 'kpi-waiting-saraban', 'kpi-waiting-director', 'kpi-done'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="loader-sm"></span>';
    });
    const pipeline = document.getElementById('admin-pipeline');
    if (pipeline) pipeline.innerHTML = renderInlineLoader('กำลังโหลดภาพรวมสายการอนุมัติ...');
    const overdue = document.getElementById('admin-overdue-list');
    if (overdue) overdue.innerHTML = renderInlineLoader('กำลังตรวจสอบเอกสารค้างนาน...');
    const recent = document.getElementById('admin-recent-list');
    if (recent) recent.innerHTML = renderInlineLoader('กำลังโหลดรายการล่าสุด...');
}

function _renderKpiCards(requests) {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();

    const pendingCommand = requests.filter(r => !r.commandPdfUrl && r.status !== 'เสร็จสิ้น').length;
    const waitingSaraban = requests.filter(r => (r.docStatus || '').includes('saraban')).length;
    const waitingDirector = requests.filter(r => (r.docStatus || '').includes('director')).length;
    const doneThisMonth = requests.filter(r => {
        if (r.status !== 'เสร็จสิ้น') return false;
        const d = new Date(r.lastUpdated || r.timestamp || 0);
        return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    }).length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('kpi-pending-command', pendingCommand);
    set('kpi-waiting-saraban', waitingSaraban);
    set('kpi-waiting-director', waitingDirector);
    set('kpi-done', doneThisMonth);
}

function _renderPipeline(requests) {
    const container = document.getElementById('admin-pipeline');
    if (!container) return;

    const stages = [
        { label: 'รอออกคำสั่ง',   mode: 'pending_command',  filter: r => !r.commandPdfUrl && r.status !== 'เสร็จสิ้น', color: 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' },
        { label: 'รอหัวหน้ากลุ่ม', mode: 'waiting_head',     filter: r => (r.docStatus || '').startsWith('waiting_head'), color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' },
        { label: 'รอรองผอ.',       mode: 'waiting_deputy',   filter: r => (r.docStatus || '').startsWith('waiting_dep'), color: 'bg-indigo-100 text-indigo-700 border-indigo-300 hover:bg-indigo-200' },
        { label: 'รอสารบรรณ',     mode: 'waiting_saraban',  filter: r => (r.docStatus || '').includes('saraban'), color: 'bg-purple-100 text-purple-700 border-purple-300 hover:bg-purple-200' },
        { label: 'รอผู้อำนวยการ', mode: 'waiting_director', filter: r => (r.docStatus || '').includes('director'), color: 'bg-pink-100 text-pink-700 border-pink-300 hover:bg-pink-200' },
        { label: 'เสร็จสิ้น',     mode: 'completed',        filter: r => r.status === 'เสร็จสิ้น', color: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' },
    ];

    const arrow = `<span class="text-gray-300 text-xl font-light self-center">›</span>`;

    container.innerHTML = stages.map((s, i) => {
        const count = requests.filter(s.filter).length;
        const pill = `<div class="flex flex-col items-center border rounded-xl px-4 py-2 ${s.color} min-w-[90px] text-center cursor-pointer transition select-none" onclick="filterAdminRequestsBy('${s.mode}')" title="คลิกเพื่อดูรายการ">
            <span class="text-2xl font-extrabold">${count}</span>
            <span class="text-xs font-medium mt-0.5 leading-tight">${s.label}</span>
        </div>`;
        return i < stages.length - 1 ? pill + arrow : pill;
    }).join('');
}

function _renderOverdueList(requests) {
    const container = document.getElementById('admin-overdue-list');
    if (!container) return;

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const overdue = requests.filter(r => {
        if (r.status === 'เสร็จสิ้น') return false;
        const ts = r.timestamp?.seconds ? r.timestamp.seconds * 1000 : new Date(r.timestamp || 0).getTime();
        if (!(ts > 0)) return false;
        const createdAt = new Date(ts);
        if (createdAt.getMonth() !== thisMonth || createdAt.getFullYear() !== thisYear) return false;
        return ts < threeDaysAgo;
    }).slice(0, 8);

    if (!overdue.length) {
        container.innerHTML = `<div class="text-green-600 text-sm flex items-center gap-2">✅ ไม่มีเอกสารค้างเกิน 3 วันในเดือนนี้</div>`;
        return;
    }

    container.innerHTML = overdue.map(r => {
        const ts = r.timestamp?.seconds ? r.timestamp.seconds * 1000 : new Date(r.timestamp || 0).getTime();
        const days = Math.floor((Date.now() - ts) / 86400000);
        const safeId = escapeHtml(r.id || '—');
        return `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0 rounded-lg px-2 hover:bg-red-50 cursor-pointer transition" onclick="filterByStatus('${safeId}');switchAdminTab('requests');" title="คลิกเพื่อดูรายการ">
            <div>
                <span class="font-bold text-indigo-600">${safeId}</span>
                <span class="text-gray-500 ml-1">${escapeHtml((r.requesterName || '').substring(0,14))}</span>
            </div>
            <span class="text-red-500 font-semibold whitespace-nowrap">${days} วัน</span>
        </div>`;
    }).join('');
}

function _renderRecentList(requests) {
    const container = document.getElementById('admin-recent-list');
    if (!container) return;

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const sorted = requests.filter(r => {
        const ts = r.timestamp?.seconds ? r.timestamp.seconds * 1000 : new Date(r.timestamp || 0).getTime();
        if (!(ts > 0)) return false;
        const createdAt = new Date(ts);
        return createdAt.getMonth() === thisMonth && createdAt.getFullYear() === thisYear;
    }).sort((a, b) => {
        const ta = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : new Date(a.timestamp || 0).getTime();
        const tb = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : new Date(b.timestamp || 0).getTime();
        return tb - ta;
    }).slice(0, 8);

    if (!sorted.length) {
        container.innerHTML = `<div class="text-gray-400 text-sm">ยังไม่มีรายการในเดือนนี้</div>`;
        return;
    }

    container.innerHTML = sorted.map(r => {
        const safeId = escapeHtml(r.id || '—');
        return `<div class="flex items-center justify-between gap-2 py-1.5 border-b border-gray-100 last:border-0 rounded-lg px-2 hover:bg-indigo-50 cursor-pointer transition" onclick="filterByStatus('${safeId}');switchAdminTab('requests');" title="คลิกเพื่อดูรายการ">
            <div>
                <span class="font-bold text-indigo-600">${safeId}</span>
                <span class="text-gray-500 ml-1 text-xs">${escapeHtml((r.requesterName || '').substring(0,16))}</span>
            </div>
            <span class="text-xs px-2 py-0.5 rounded-full ${r.status === 'เสร็จสิ้น' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">${escapeHtml(r.status || '—')}</span>
        </div>`;
    }).join('');
}

// --- BULK ACTIONS ---

function updateBulkToolbar() {
    const checked = document.querySelectorAll('.bulk-checkbox:checked');
    const toolbar = document.getElementById('bulk-toolbar');
    const countEl = document.getElementById('bulk-count');
    const selectAllDesktop = document.getElementById('bulk-select-all-desktop');
    const selectAllMobile = document.getElementById('bulk-select-all-mobile');

    if (!toolbar) return;
    if (checked.length > 0) {
        toolbar.classList.remove('hidden');
        if (countEl) countEl.textContent = checked.length;
    } else {
        toolbar.classList.add('hidden');
    }

    const all = document.querySelectorAll('.bulk-checkbox');
    [selectAllDesktop, selectAllMobile].forEach(selectAll => {
        if (!selectAll) return;
        selectAll.checked = all.length > 0 && checked.length === all.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
    });
}

function toggleSelectAll(masterCb) {
    document.querySelectorAll('.bulk-checkbox').forEach(cb => { cb.checked = masterCb.checked; });
    updateBulkToolbar();
}

function clearBulkSelection() {
    document.querySelectorAll('.bulk-checkbox').forEach(cb => { cb.checked = false; });
    const selectAllDesktop = document.getElementById('bulk-select-all-desktop');
    const selectAllMobile = document.getElementById('bulk-select-all-mobile');
    [selectAllDesktop, selectAllMobile].forEach(selectAll => {
        if (selectAll) { selectAll.checked = false; selectAll.indeterminate = false; }
    });
    updateBulkToolbar();
}

function _getSelectedIds() {
    return [...document.querySelectorAll('.bulk-checkbox:checked')].map(cb => cb.value);
}

function bulkExportCSV() {
    const ids = _getSelectedIds();
    if (!ids.length) return;

    const rows = (allRequestsCache || []).filter(r => ids.includes(r.id));
    if (!rows.length) return showAlert('ผิดพลาด', 'ไม่พบข้อมูลที่เลือก');

    const headers = ['เลขที่', 'ชื่อผู้ขอ', 'เรื่อง', 'สถานที่', 'วันเริ่ม', 'วันสิ้นสุด', 'สถานะ', 'งบประมาณ'];
    const csvRows = [headers.join(',')];
    rows.forEach(r => {
        csvRows.push([
            r.id || '', r.requesterName || '', r.purpose || '',
            r.location || '', r.startDate || '', r.endDate || '',
            r.status || '', r.totalExpense || '0'
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    triggerBrowserDownload(
        url,
        `คำขอไปราชการ_${new Date().toLocaleDateString('th-TH')}.csv`,
        'กำลังดาวน์โหลดไฟล์ CSV...'
    );
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    clearBulkSelection();
}

function bulkChangeStatus() {
    const ids = _getSelectedIds();
    if (!ids.length) return;
    const countEl = document.getElementById('bulk-status-count');
    if (countEl) countEl.textContent = ids.length;
    document.getElementById('bulk-status-modal').style.display = 'flex';
}

async function bulkChangeStatusConfirm() {
    const ids = _getSelectedIds();
    const newStatus = document.getElementById('bulk-status-select').value;
    if (!newStatus) return showAlert('ผิดพลาด', 'กรุณาเลือกสถานะ');

    document.getElementById('bulk-status-modal').style.display = 'none';

    let done = 0, failed = 0;
    for (const id of ids) {
        try {
            await apiCall('POST', 'updateRequest', { id, status: newStatus });
            done++;
        } catch (e) { failed++; }
    }

    clearRequestsCache();
    clearBulkSelection();
    showAlert('สำเร็จ', `เปลี่ยนสถานะแล้ว ${done} รายการ${failed ? ` (ล้มเหลว ${failed})` : ''}`);
    await fetchAllRequestsForCommand();
}

async function bulkGenerateCommand() {
    const ids = _getSelectedIds();
    if (!ids.length) return;

    const confirmed = await showConfirm('ออกคำสั่ง', `ระบบจะเปิดหน้าออกคำสั่งให้ครบ ${ids.length} รายการทีละชุด กด "ตกลง" เพื่อเริ่ม`);
    if (!confirmed) return;

    clearBulkSelection();
    openAdminGenerateCommand(ids[0]);
}

function filterByStatus(statusValue) {
    const searchInput = document.getElementById('admin-search-requests');
    if (searchInput) {
        searchInput.value = statusValue;
        searchInput.dispatchEvent(new Event('input'));
    }
}

// กรองรายการตาม mode พิเศษ (ใช้กับ KPI cards / pipeline pills)
function filterAdminRequestsBy(mode) {
    if (!allRequestsCache) return;
    const now = new Date();
    const filters = {
        'pending_command':  r => !r.commandPdfUrl && !isAdminRequestCompleted(r),
        'waiting_saraban':  r => (r.docStatus || '').includes('saraban'),
        'waiting_director': r => (r.docStatus || '').includes('director'),
        'waiting_head':     r => (r.docStatus || '').startsWith('waiting_head'),
        'waiting_deputy':   r => (r.docStatus || '').startsWith('waiting_dep'),
        'done_this_month':  r => {
            if (!isAdminRequestCompleted(r)) return false;
            const d = new Date(r.lastUpdated || r.timestamp || 0);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        },
        'completed':        r => isAdminRequestCompleted(r),
    };
    const filterFn = filters[mode];
    const filtered = filterFn ? allRequestsCache.filter(filterFn) : allRequestsCache;

    // สลับไป tab คำขอแล้ว render ทันที
    if (typeof switchAdminTab === 'function') switchAdminTab('requests');
    _currentAdminRequestFilter = 'all';
    ['all', 'pending', 'completed'].forEach(f => {
        const btn = document.getElementById(`request-filter-${f}`);
        if (!btn) return;
        btn.classList.toggle('active', f === 'all');
    });
    renderAdminRequestsList(filtered);

    // ล้าง search input
    const searchInput = document.getElementById('admin-search-requests');
    if (searchInput) searchInput.value = '';
}
// ในไฟล์ js/admin.js

function openDispatchBookModal(requestId) {
    console.log("Opening Dispatch Modal for:", requestId);

    // 1. ค้นหาข้อมูลคำขอจาก Cache (ที่โหลดมาแล้วในตาราง)
    const req = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
    
    if (!req) {
        alert('ไม่พบข้อมูลคำขอ กรุณารีโหลดหน้าเว็บ');
        return;
    }

    // 2. เปิด Modal (ต้องตรงกับ ID ใน index.html)
    const modal = document.getElementById('dispatch-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // บังคับแสดงผล
    } else {
        console.error("❌ ไม่พบ Element ID: dispatch-modal ในหน้าเว็บ");
        return;
    }

    // 3. เซ็ตค่าพื้นฐานลงในฟอร์ม
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val !== undefined && val !== null) ? val : '';
    };

    setVal('dispatch-request-id', requestId);

    // วันที่ปัจจุบัน (สำหรับ Default ปี/เดือน)
    const today = new Date();
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    
    // สร้างตัวเลือกเดือน
    const monthSelect = document.getElementById('dispatch-month');
    if (monthSelect) {
        monthSelect.innerHTML = "";
        thaiMonths.forEach((m) => {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m;
            if (m === req.dispatchMonth || (!req.dispatchMonth && m === thaiMonths[today.getMonth()])) {
                option.selected = true;
            }
            monthSelect.appendChild(option);
        });
    }

    setVal('dispatch-year', req.dispatchYear || (today.getFullYear() + 543));
    setVal('student-count', req.studentCount || '0');
    setVal('teacher-count', req.teacherCount || '0');

    // รายละเอียดอื่นๆ
    setVal('dispatch-purpose', req.purpose || '');
    setVal('dispatch-location', req.location || '');
    setVal('dispatch-stay-at', req.stayAt || '-');
    setVal('dispatch-vehicle-type', req.vehicleType || '-');
    setVal('dispatch-vehicle-id', req.vehicleId || '-');

    // วันที่และเวลาเดินทาง
    setVal('dispatch-date-start', req.startDate || '');
    setVal('dispatch-time-start', req.startTime || '06:00');
    setVal('dispatch-date-end', req.endDate || '');
    setVal('dispatch-time-end', req.endTime || '18:00');

    // 4. เซ็ตค่า "สิ่งที่ส่งมาด้วย" (1-7)
    // รองรับทั้งแบบแก้ไขได้ (input) และแบบดูอย่างเดียว (ถ้ายังไม่ได้แก้ HTML)
    const setItem = (index, defaultText) => {
        // ชื่อเอกสาร (item1, item2...)
        const itemInput = document.getElementById(`dispatch-item-${index}`);
        if (itemInput) {
            // ถ้ามีข้อมูลใน DB ให้ใช้ค่าเดิม ถ้าไม่มีให้ใช้ค่า Default
            const savedItem = req[`item${index}`];
            itemInput.value = (savedItem && savedItem !== 'undefined') ? savedItem : defaultText;
        }

        // จำนวน (qty1, qty2...)
        const qtyInput = document.getElementById(`qty${index}`); // ID ตาม HTML ของคุณคือ qty1, qty2
        if (qtyInput) {
            const savedQty = req[`qty${index}`];
            qtyInput.value = (savedQty && savedQty !== 'undefined') ? savedQty : '๑';
        }
    };

    setItem(1, "หนังสือเชิญ");
    setItem(2, "คำสั่งโรงเรียน");
    setItem(3, "รายชื่อนักเรียน");
    setItem(4, "แผนที่เดินทาง");
    setItem(5, "หนังสือขออนุญาต");
    setItem(6, "กรมธรรม์");
    setItem(7, "กำหนดการ");
}

// ─────────────────────────────────────────────────────────────────────────────
// ฟีเจอร์เสริม: สร้างกำหนดการเดินทางพานักเรียนไปนอกสถานศึกษา (PDF)
// เงื่อนไขการแสดงปุ่ม: จังหวัด ≠ สระแก้ว + ค้างคืน (endDate > startDate) + มีนักเรียนใน attendees
// ─────────────────────────────────────────────────────────────────────────────

let travelScheduleSignaturePad = null;
window._travelScheduleSavedSignatureBase64 = '';

// Helper: แปลงวันที่เป็นภาษาไทย (พ.ศ.)
function _tsTH(dateStr) {
    const thaiMonths = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
    const toNum = n => String(n).replace(/\d/g, d => "๐๑๒๓๔๕๖๗๘๙"[d]);
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    return `${toNum(d.getDate())} ${thaiMonths[d.getMonth()]} ${toNum(d.getFullYear() + 543)}`;
}

// Helper: parse attendees (รองรับ array หรือ JSON string)
function _tsAttendees(req) {
    try {
        return Array.isArray(req.attendees) ? req.attendees : JSON.parse(req.attendees || '[]');
    } catch(e) { return []; }
}

// ตรวจสอบว่าคำขอนี้ผ่านเงื่อนไขหรือไม่
function isEligibleForTravelSchedule(req) {
    const province   = getPlainProvinceValue((req.province || 'สระแก้ว').trim());
    const isOutside  = province !== 'สระแก้ว';
    const isMultiDay = new Date(req.endDate) > new Date(req.startDate);
    const hasStudents = _tsAttendees(req).some(a => String(a.position || '').includes('นักเรียน'));
    return isOutside && isMultiDay && hasStudents;
}

// เปิด Modal โดย lookup request จาก ID (ใช้กับปุ่มที่ส่งแค่ ID)
function openTravelScheduleByReqId(reqId) {
    let req = null;
    // ค้นหาใน user cache ก่อน จากนั้น admin cache
    if (window.userRequestsCache) {
        req = window.userRequestsCache.find(r => (r.id || r.requestId) === reqId);
    }
    if (!req && typeof allRequestsCache !== 'undefined' && allRequestsCache) {
        req = allRequestsCache.find(r => (r.id || r.requestId) === reqId);
    }
    if (!req) { showAlert('ไม่พบข้อมูล', 'ไม่พบข้อมูลคำขอ กรุณาโหลดหน้าใหม่'); return; }
    openTravelScheduleModal(req);
}

// เปิด Modal พร้อมข้อมูลที่ดึงจากคำขอ
function openTravelScheduleModal(req) {
    if (typeof req === 'string') { try { req = JSON.parse(req); } catch(e) { return; } }
    window._travelScheduleReq = req;

    const vehicleLabel = {gov:'รถราชการ', private:'รถยนต์ส่วนตัว', public:'รถสาธารณะ'}[req.vehicleOption] || req.vehicleOption || '—';
    const att = _tsAttendees(req);
    const savedSchedule = (typeof parseTravelScheduleData === 'function')
        ? parseTravelScheduleData(req.travelSchedule)
        : (req.travelSchedule || { requesterTel: '', driverName: '', itinerary: [] });
    window._travelScheduleSavedSignatureBase64 = savedSchedule.signatureBase64 || req.signatureBase64 || '';
    const savedItinerary = {};
    (savedSchedule.itinerary || []).forEach(item => {
        if (item.date) savedItinerary[item.date] = item.detail || '';
    });

    document.getElementById('ts-requester-name').textContent     = req.requesterName     || '—';
    document.getElementById('ts-requester-position').textContent = req.requesterPosition || '—';
    document.getElementById('ts-location').textContent           = req.location          || '—';
    document.getElementById('ts-purpose').textContent            = req.purpose           || '—';
    document.getElementById('ts-vehicle').textContent            = vehicleLabel;
    document.getElementById('ts-license-plate').textContent      = req.licensePlate      || '—';
    document.getElementById('ts-total-count').textContent        = att.length + ' คน';
    document.getElementById('ts-date-range').textContent         = _tsTH(req.startDate) + ' ถึง ' + _tsTH(req.endDate);

    // เติมข้อมูลเดิมถ้าผู้ขอหรือแอดมินเคยบันทึกไว้
    document.getElementById('ts-requester-tel').value = savedSchedule.requesterTel || '';
    document.getElementById('ts-driver-name').value   = savedSchedule.driverName || '';
    const statusEl = document.getElementById('ts-file-status');
    const scheduleUrl = req.travelSchedulePdfUrl || req.travelScheduleUrl || '';
    if (statusEl) {
        statusEl.style.display = scheduleUrl ? 'block' : (savedSchedule.requesterTel || savedSchedule.driverName || (savedSchedule.itinerary || []).length ? 'block' : 'none');
        statusEl.innerHTML = scheduleUrl
            ? `มีไฟล์กำหนดการแล้ว <a href="${sanitizeUrl(scheduleUrl)}" target="_blank" style="color:#047857;text-decoration:underline;">เปิดไฟล์</a>`
            : 'มีข้อมูลกำหนดการที่บันทึกไว้ แต่ยังไม่ได้สร้างไฟล์ PDF';
    }

    // สร้าง textarea สำหรับแต่ละวัน
    const container = document.getElementById('ts-itinerary-rows');
    container.innerHTML = '';
    const start = new Date(req.startDate + 'T00:00:00');
    const end   = new Date(req.endDate   + 'T00:00:00');
    const _localDateStr = dt => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const idx    = Math.round((d - start) / 86400000);
        const iso    = _localDateStr(d);
        const dateTH = _tsTH(iso);
        container.insertAdjacentHTML('beforeend', `
            <div style="margin-bottom:12px;">
              <label style="font-size:0.82rem; font-weight:600; color:#374151; display:block; margin-bottom:4px;">
                วันที่ ${idx + 1}: ${dateTH}
              </label>
              <textarea id="ts-day-${idx}" data-ts-date="${iso}" rows="2" placeholder="ระบุกิจกรรม/สถานที่ในวันนี้..."
                style="width:100%; border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:0.88rem; resize:vertical; box-sizing:border-box;">${escapeHtml(savedItinerary[iso] || '')}</textarea>
            </div>`);
    }

    const modal = document.getElementById('travel-schedule-modal');
    modal.style.display = 'flex';
    setTimeout(() => initTravelScheduleSignaturePad(window._travelScheduleSavedSignatureBase64), 120);
}

// ปิด Modal
function closeTravelScheduleModal() {
    const modal = document.getElementById('travel-schedule-modal');
    if (modal) modal.style.display = 'none';
    window._travelScheduleReq = null;
}

function initTravelScheduleSignaturePad(signatureBase64 = '') {
    const canvas = document.getElementById('ts-signature-canvas');
    if (!canvas || typeof SignaturePad === 'undefined') return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.offsetWidth || 280;
    const height = rect.height || canvas.offsetHeight || 154;
    const result = createSignaturePad(canvas, travelScheduleSignaturePad, { width, height });
    if (!result) return;
    travelScheduleSignaturePad = result.pad;

    if (signatureBase64) {
        travelScheduleSignaturePad.fromDataURL(signatureBase64, {
            ratio: result.ratio,
            width,
            height
        });
    }
}

function clearTravelScheduleSignature() {
    if (travelScheduleSignaturePad) travelScheduleSignaturePad.clear();
    window._travelScheduleSavedSignatureBase64 = '';
}

async function _collectTravelScheduleModalData() {
    const req = window._travelScheduleReq;
    if (!req) return null;
    const tel = (document.getElementById('ts-requester-tel').value || '').trim();
    const driver = (document.getElementById('ts-driver-name').value || '').trim();
    const itinerary = Array.from(document.querySelectorAll('#ts-itinerary-rows textarea[data-ts-date]')).map(textarea => ({
        date: textarea.dataset.tsDate || '',
        dateText: _tsTH(textarea.dataset.tsDate || ''),
        detail: textarea.value.trim()
    }));
    const rawSignatureBase64 = (travelScheduleSignaturePad && !travelScheduleSignaturePad.isEmpty())
        ? travelScheduleSignaturePad.toDataURL('image/png')
        : (window._travelScheduleSavedSignatureBase64 || '');
    const signatureBase64 = (typeof optimizeSignatureDataURL === 'function' && rawSignatureBase64)
        ? await optimizeSignatureDataURL(rawSignatureBase64, { targetHeight: 340 })
        : rawSignatureBase64;
    return { requesterTel: tel, driverName: driver, signatureBase64, itinerary };
}

async function _saveTravelScheduleToFirestore(extra = {}) {
    const req = window._travelScheduleReq;
    const schedule = await _collectTravelScheduleModalData();
    if (!req || !schedule) throw new Error('ไม่พบข้อมูลคำขอ');
    const requestId = req.id || req.requestId;
    if (!requestId) throw new Error('ไม่พบเลขที่คำขอ');
    const user = getCurrentUser() || {};
    const updateData = {
        travelSchedule: schedule,
        travelScheduleStatus: extra.travelSchedulePdfUrl ? 'generated' : 'draft',
        travelScheduleUpdatedBy: user.username || user.name || 'user',
        travelScheduleUpdatedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        ...extra
    };
    await apiCall('POST', 'updateRequest', {
        requestId,
        ...updateData
    });
    Object.assign(req, updateData, { travelSchedule: schedule });
    return { requestId, schedule, updateData };
}

async function _refreshTravelScheduleLists() {
    if (typeof clearRequestsCache === 'function') clearRequestsCache();
    if (typeof fetchUserRequests === 'function') await fetchUserRequests(true);
    const user = getCurrentUser();
    if (user?.role === 'admin' && typeof fetchAllRequestsForCommand === 'function') {
        await fetchAllRequestsForCommand();
    }
}

async function saveTravelScheduleDraft() {
    const btn = document.getElementById('ts-save-btn');
    try {
        if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }
        await _saveTravelScheduleToFirestore();
        await _refreshTravelScheduleLists();
        showAlert('สำเร็จ', 'บันทึกข้อมูลกำหนดการเดินทางเรียบร้อยแล้ว');
    } catch (err) {
        console.error('saveTravelScheduleDraft error:', err);
        showAlert('ผิดพลาด', err.message || 'บันทึกข้อมูลไม่สำเร็จ');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึกข้อมูล'; }
    }
}

// สร้าง PDF กำหนดการเดินทาง
async function generateTravelSchedulePDF() {
    const req    = window._travelScheduleReq;
    if (!req) return;
    const schedule = await _collectTravelScheduleModalData();
    if (!schedule?.requesterTel || !schedule?.driverName) {
        showAlert('กรุณากรอกข้อมูลให้ครบ', 'ต้องกรอกเบอร์โทรครูผู้ควบคุม และชื่อพนักงานขับรถ');
        return;
    }

    // รวบรวม itinerary
    const itinerary = schedule.itinerary.map(item => ({
        date: item.dateText || _tsTH(item.date),
        detail: item.detail || ''
    }));

    const att        = _tsAttendees(req);
    const vehicleMap = {gov:'รถราชการ', private:'รถยนต์ส่วนตัว', public:'รถสาธารณะ'};
    const toNum      = n => String(n).replace(/\d/g, d => "๐๑๒๓๔๕๖๗๘๙"[d]);

    // แสดง loader
    const genBtn = document.getElementById('ts-generate-btn');
    if (genBtn) { genBtn.disabled = true; genBtn.textContent = '⏳ กำลังสร้าง...'; }

    try {
        // โหลด template
        const resp    = await fetch('../template_travel_schedule.docx');
        if (!resp.ok) throw new Error('ไม่พบไฟล์แม่แบบ template_travel_schedule.docx');
        const content = await resp.arrayBuffer();
        const zip     = new PizZip(content);
        const doc     = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        doc.render({
            requesterName:      req.requesterName     || '',
            requester_position: req.requesterPosition || '',
            requester_tel:      schedule.requesterTel,
            vehicle:            vehicleMap[req.vehicleOption] || req.vehicleOption || '',
            license_plate:      req.licensePlate      || '',
            driver_name:        schedule.driverName,
            total_count:        toNum(att.length),
            location:           req.location          || '',
            purpose:            req.purpose           || '',
            start_date:         _tsTH(req.startDate),
            start_time:         req.startTime         || '06:00',
            end_date:           _tsTH(req.endDate),
            end_time:           req.endTime           || '18:00',
            itinerary:          itinerary
        });

        const docxBlob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

        // แปลงเป็น PDF ผ่าน Cloud Run (เหมือนเอกสารอื่นๆ)
        const cloudRunBaseUrl = (typeof PDF_ENGINE_CONFIG !== 'undefined') ? PDF_ENGINE_CONFIG.BASE_URL : 'https://wny-pdf-engine-660310608742.asia-southeast1.run.app';
        const formData = new FormData();
        formData.append('files', docxBlob, 'travel_schedule.docx');
        const pdfResp = await fetch(`${cloudRunBaseUrl}/forms/libreoffice/convert`, { method: 'POST', body: formData });
        if (!pdfResp.ok) throw new Error('ไม่สามารถแปลงเป็น PDF ได้ (Cloud Run: ' + pdfResp.status + ')');
        let pdfBlob = await pdfResp.blob();

        if (schedule.signatureBase64 && typeof promptForSignature === 'function') {
            const signatureForPdf = (typeof optimizeSignatureDataURL === 'function')
                ? await optimizeSignatureDataURL(schedule.signatureBase64, { targetHeight: 340 })
                : schedule.signatureBase64;
            pdfBlob = await promptForSignature(pdfBlob, signatureForPdf);
        }

        const requestId = req.id || req.requestId || 'travel_schedule';
        const safeId = requestId.replace(/[\/\\:\.\s]/g, '-');
        const username = req.username || getCurrentUser()?.username || 'user';
        const filename = `travel_schedule_${safeId}_${Date.now()}.pdf`;
        const uploadedUrl = await uploadPdfToFirebaseStorage(pdfBlob, username, filename);
        await _saveTravelScheduleToFirestore({
            travelSchedulePdfUrl: uploadedUrl,
            travelScheduleGeneratedAt: new Date().toISOString()
        });

        // ดาวน์โหลด PDF
        const url = URL.createObjectURL(pdfBlob);
        triggerBrowserDownload(
            url,
            `กำหนดการเดินทาง_${req.requesterName || 'ครู'}.pdf`,
            'กำลังดาวน์โหลดไฟล์กำหนดการเดินทาง...'
        );
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        await _refreshTravelScheduleLists();
        closeTravelScheduleModal();
        showAlert('สำเร็จ', 'สร้างไฟล์กำหนดการเดินทางเรียบร้อยแล้ว');
    } catch(err) {
        console.error('generateTravelSchedulePDF error:', err);
        showAlert('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถสร้าง PDF ได้');
    } finally {
        if (genBtn) { genBtn.disabled = false; genBtn.textContent = '📄 สร้าง PDF'; }
    }
}
// -----------------------------------------------------------------------
// 6. ADMIN FINALIZE — ไฟนล์งานและย้ายไป Google Drive
// -----------------------------------------------------------------------

async function handleAdminFinalize(requestId) {
    toggleLoader('admin-finalize-button', true);
    try {
        const data = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
        if (!data) throw new Error('ไม่พบเอกสารในรายการที่โหลดอยู่');

        // 2. ตรวจสอบสถานะ
        if (data.docStatus !== 'waiting_admin_final') {
            throw new Error('เอกสารยังไม่พร้อมสำหรับไฟนล์งาน');
        }

        const activeDocType = data.activeApprovalDocType || data.docType || (data.completedCommandUrl || data.commandPdfUrl ? 'command' : (data.completedDispatchBookUrl || data.dispatchBookUrl || data.dispatchBookPdfUrl ? 'dispatch' : 'memo'));

        // 3. ดาวน์โหลดไฟล์จาก Firebase Storage
        const firebaseUrl = data.currentPdfUrl
            || (activeDocType === 'command' ? (data.completedCommandUrl || data.commandPdfUrl) : '')
            || (activeDocType === 'dispatch' ? (data.completedDispatchBookUrl || data.dispatchBookUrl || data.dispatchBookPdfUrl) : '')
            || data.completedMemoUrl
            || data.pdfUrl;
        if (!firebaseUrl) throw new Error('ไม่พบไฟล์ใน Firebase Storage');

        // 4. ย้ายไปเก็บที่ Google Drive (และลบออกจาก Firebase)
        const driveUrl = await archiveToGoogleDrive(
            firebaseUrl,
            data.username || 'admin',
            `${activeDocType === 'dispatch' ? 'Final_Dispatch' : (activeDocType === 'command' ? 'Final_Command' : 'Final_Memo')}_${requestId.replace(/[\\/\\:\\.]/g, '-')}.pdf`
        );

        const gasPayload = {
            requestId: requestId,
            docStatus: 'สิ้นสุดกระบวนการ',
            currentPdfUrl: '',
            finalizedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString(),
        };

        if (activeDocType === 'command') {
            gasPayload.completedCommandUrl = driveUrl;
            gasPayload.commandPdfUrl = driveUrl;
            gasPayload.commandStatus = 'เสร็จสิ้น';
        } else if (activeDocType === 'dispatch') {
            gasPayload.completedDispatchBookUrl = driveUrl;
            gasPayload.dispatchBookUrl = driveUrl;
            gasPayload.dispatchBookPdfUrl = driveUrl;
            gasPayload.dispatchStatus = 'เสร็จสิ้น';
        } else {
            gasPayload.completedMemoUrl = driveUrl;
            gasPayload.pdfUrl = driveUrl;
            gasPayload.status = 'เสร็จสิ้น';
        }

        // 6. อัปเดต GAS/Supabase
        await apiCall('POST', 'updateRequest', gasPayload);

        const docLabel = activeDocType === 'dispatch' ? 'หนังสือส่ง' : (activeDocType === 'command' ? 'คำสั่งไปราชการ' : 'บันทึกข้อความ');
        showAlert('✅ สำเร็จ', `ไฟนล์${docLabel}และส่งเก็บ Google Drive เรียบร้อยแล้ว`);

    } catch (error) {
        showAlert('ผิดพลาด', error.message);
    } finally {
        toggleLoader('admin-finalize-button', false);
    }
}
