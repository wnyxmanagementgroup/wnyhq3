// --- REQUEST FUNCTIONS (HYBRID SYSTEM: Firebase + GAS) ---
function sanitizeUrl(url) {
    if (!url) return '#';
    const trimmed = String(url).trim();
    if (trimmed.toLowerCase().startsWith('javascript:')) return '#';
    if (trimmed.toLowerCase().startsWith('data:text/html')) return '#';
    return trimmed;
}
// --- ส่วนที่เพิ่มใหม่: รายชื่อจังหวัดและ Logic ตรวจสอบเงื่อนไข ---

// --- ส่วนที่เพิ่มใหม่: รายชื่อจังหวัดและ Logic ตรวจสอบเงื่อนไข (ยานพาหนะ + ที่พัก) ---

const THAI_PROVINCES = [
    "กระบี่", "กรุงเทพมหานคร", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", 
    "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", 
    "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", 
    "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", 
    "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", 
    "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", 
    "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", 
    "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", 
    "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", 
    "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", 
    "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", 
    "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"
];

function stripProvincePrefix(provinceValue) {
    const rawValue = String(provinceValue || '').trim();
    if (!rawValue) return '';
    if (rawValue === 'กรุงเทพมหานคร') return rawValue;
    return rawValue.replace(/^จังหวัด\s*/u, '').trim();
}

function formatProvinceLabel(provinceValue) {
    const plainProvince = stripProvincePrefix(provinceValue);
    if (!plainProvince) return '';
    if (plainProvince === 'กรุงเทพมหานคร') return plainProvince;
    return `จังหวัด${plainProvince}`;
}

function initProvinceDropdown(selectId = 'form-province') {
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = ''; 

    // ค่าเริ่มต้น
    const defaultOption = document.createElement('option');
    defaultOption.value = 'สระแก้ว';
    defaultOption.text = formatProvinceLabel('สระแก้ว');
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    // วนลูปจังหวัดอื่นๆ
    THAI_PROVINCES.forEach(province => {
        if (province !== 'สระแก้ว') {
            const option = document.createElement('option');
            option.value = province;
            option.text = formatProvinceLabel(province);
            select.appendChild(option);
        }
    });

    const otherOption = document.createElement('option');
    otherOption.value = 'other';
    otherOption.text = 'อื่นๆ (ระบุ)';
    select.appendChild(otherOption);
}

function setupProvinceField(selectId, otherInputId, defaultProvince = 'สระแก้ว') {
    const provinceSelect = document.getElementById(selectId);
    const provinceOther = document.getElementById(otherInputId);
    if (!provinceSelect) return;

    initProvinceDropdown(selectId);

    const updateProvinceOtherVisibility = () => {
        if (!provinceOther) return;
        if (provinceSelect.value === 'other') {
            provinceOther.classList.remove('hidden');
            provinceOther.required = true;
        } else {
            provinceOther.classList.add('hidden');
            provinceOther.required = false;
        }
    };

    const plainDefaultProvince = stripProvincePrefix(defaultProvince) || 'สระแก้ว';
    provinceSelect.value = THAI_PROVINCES.includes(plainDefaultProvince) ? plainDefaultProvince : 'other';
    if (provinceOther) {
        provinceOther.value = provinceSelect.value === 'other' ? plainDefaultProvince || '' : '';
    }

    provinceSelect.onchange = updateProvinceOtherVisibility;
    updateProvinceOtherVisibility();
}

function setProvinceFieldValue(selectId, otherInputId, provinceValue) {
    const normalizedProvince = stripProvincePrefix(provinceValue) || 'สระแก้ว';
    const provinceSelect = document.getElementById(selectId);
    const provinceOther = document.getElementById(otherInputId);
    if (!provinceSelect) return;

    provinceSelect.value = THAI_PROVINCES.includes(normalizedProvince) ? normalizedProvince : 'other';
    if (provinceOther) {
        provinceOther.value = provinceSelect.value === 'other' ? normalizedProvince : '';
        provinceOther.classList.toggle('hidden', provinceSelect.value !== 'other');
        provinceOther.required = provinceSelect.value === 'other';
    }
}

function getProvinceFieldValue(selectId, otherInputId) {
    const provinceSelect = document.getElementById(selectId);
    const provinceOther = document.getElementById(otherInputId);
    if (!provinceSelect) return formatProvinceLabel('สระแก้ว');

    if (provinceSelect.value === 'other') {
        return formatProvinceLabel(provinceOther?.value.trim() || 'อื่นๆ');
    }
    return formatProvinceLabel(provinceSelect.value || 'สระแก้ว');
}

function parseTravelScheduleData(value) {
    if (!value) return { requesterTel: '', driverName: '', itinerary: [] };
    if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch(e) { value = {}; }
    }
    return {
        requesterTel: value.requesterTel || value.requester_tel || '',
        driverName: value.driverName || value.driver_name || '',
        signatureBase64: value.signatureBase64 || '',
        itinerary: Array.isArray(value.itinerary) ? value.itinerary : []
    };
}

function collectFormTravelSchedule(prefix = 'form') {
    const section = document.getElementById(`${prefix}-travel-schedule-section`);
    const rowsContainer = document.getElementById(`${prefix}-ts-itinerary-rows`);
    if (section && section.classList.contains('hidden')) return null;

    const requesterTel = document.getElementById(`${prefix}-ts-requester-tel`)?.value?.trim() || '';
    const driverName = document.getElementById(`${prefix}-ts-driver-name`)?.value?.trim() || '';
    const itinerary = Array.from(rowsContainer?.querySelectorAll('textarea[data-ts-date]') || []).map((textarea) => ({
        date: textarea.dataset.tsDate || '',
        detail: textarea.value.trim()
    }));

    if (!requesterTel && !driverName && itinerary.every(item => !item.detail)) return null;
    return { requesterTel, driverName, itinerary };
}

function getSignerPositionOptions() {
    return Object.keys(specialPositionMap || {})
        .filter(position => position && position !== 'ผู้อำนวยการโรงเรียน');
}

function syncSignerHeadName(selectId, headNameInputId, fallbackName = '') {
    const select = document.getElementById(selectId);
    const headInput = document.getElementById(headNameInputId);
    if (!headInput) return;
    const selectedPosition = select?.value || '';
    headInput.value = selectedPosition ? (specialPositionMap[selectedPosition] || fallbackName || '') : '';
}

function populateSignerPositionSelect(selectId, selectedValue = '') {
    const select = document.getElementById(selectId);
    if (!select) return;

    const previousValue = selectedValue || select.value || '';
    const positions = getSignerPositionOptions();

    select.innerHTML = '<option value="">-- เลือกกลุ่มสาระ/งาน --</option>';
    positions.forEach(position => {
        const option = document.createElement('option');
        option.value = position;
        option.textContent = position;
        select.appendChild(option);
    });

    if (previousValue && !positions.includes(previousValue)) {
        const legacyOption = document.createElement('option');
        legacyOption.value = previousValue;
        legacyOption.textContent = previousValue;
        select.appendChild(legacyOption);
    }

    select.value = previousValue || '';
}

window.refreshSignerPositionOptions = function() {
    const formSelect = document.getElementById('form-department');
    const editSelect = document.getElementById('edit-department');

    if (formSelect) {
        populateSignerPositionSelect('form-department', formSelect.value || '');
        syncSignerHeadName('form-department', 'form-head-name');
    }
    if (editSelect) {
        populateSignerPositionSelect('edit-department', editSelect.value || '');
        syncSignerHeadName('edit-department', 'edit-head-name');
    }
};

function updateRequestFormTravelScheduleSection() {
    const section = document.getElementById('form-travel-schedule-section');
    const rowsContainer = document.getElementById('form-ts-itinerary-rows');
    if (!section || !rowsContainer) return;

    const province = getProvinceFieldValue('form-province', 'form-province-other');
    const startDate = document.getElementById('form-start-date')?.value || '';
    const endDate = document.getElementById('form-end-date')?.value || '';
    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end = endDate ? new Date(endDate + 'T00:00:00') : null;
    const hasStudents = Array.from(document.querySelectorAll('#form-attendees-list .attendee-position-select, #form-attendees-list .attendee-position-other'))
        .some(el => String(el.value || '').includes('นักเรียน'));
    const shouldShow = stripProvincePrefix(province) !== 'สระแก้ว'
        && start && end && end > start
        && hasStudents;

    section.classList.toggle('hidden', !shouldShow);
    if (!shouldShow) return;

    const existing = {};
    rowsContainer.querySelectorAll('textarea[data-ts-date]').forEach(textarea => {
        existing[textarea.dataset.tsDate] = textarea.value;
    });

    rowsContainer.innerHTML = '';
    const dateFormatter = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        rowsContainer.insertAdjacentHTML('beforeend', `
            <div>
                <label class="form-label text-emerald-700">วันที่ ${dateFormatter.format(d)}</label>
                <textarea data-ts-date="${iso}" rows="2" class="form-input" placeholder="ระบุกิจกรรม/สถานที่ในวันนี้...">${escapeHtml(existing[iso] || '')}</textarea>
            </div>`);
    }
}

// ในไฟล์ requests.js

function setupFormConditions() {
    setupProvinceField('form-province', 'form-province-other'); // เรียกฟังก์ชันสร้างจังหวัด
    populateSignerPositionSelect('form-department');
    syncSignerHeadName('form-department', 'form-head-name');

    const province = document.getElementById('form-province');
    const provinceOther = document.getElementById('form-province-other');
    const startDateInput = document.getElementById('form-start-date');
    const endDateInput = document.getElementById('form-end-date');
    const attendeesList = document.getElementById('form-attendees-list');
    
    // Elements ที่พัก
    const stayContainer = document.getElementById('form-stay-container');
    const stayInput = document.getElementById('form-stay-at');
    
    // Elements ยานพาหนะ (สำหรับหนังสือส่ง) - เพิ่มใหม่
    const vehicleContainer = document.getElementById('form-dispatch-vehicle-container');
    const vehicleTypeInput = document.getElementById('form-dispatch-vehicle-type');
    const vehicleIdInput = document.getElementById('form-dispatch-vehicle-id');

    function checkConditions() {
        if (!province) return;
        
        const isNotSaKaeo = stripProvincePrefix(province.value) !== 'สระแก้ว';

        // 1. จัดการช่องจังหวัด "อื่นๆ"
        if(province.value === 'other') {
            provinceOther.classList.remove('hidden');
            provinceOther.required = true;
        } else {
            provinceOther.classList.add('hidden');
            provinceOther.required = false;
        }

        // 2. เงื่อนไข: ไม่ใช่สระแก้ว (แสดงและบังคับกรอก)
        if (isNotSaKaeo) {
            // -- ส่วนที่พัก --
            stayContainer.classList.remove('hidden');
            stayInput.required = true;

            // -- ส่วนยานพาหนะหนังสือส่ง (ใหม่) --
            vehicleContainer.classList.remove('hidden');
            vehicleTypeInput.required = true;
            vehicleIdInput.required = true;
        } else {
            // -- ซ่อนและล้างค่า --
            stayContainer.classList.add('hidden');
            stayInput.required = false;
            stayInput.value = '';

            vehicleContainer.classList.add('hidden');
            vehicleTypeInput.required = false;
            vehicleTypeInput.value = '';
            vehicleIdInput.required = false;
            vehicleIdInput.value = '';
        }
        updateRequestFormTravelScheduleSection();
    }

    if (province) {
        province.addEventListener('change', checkConditions);
        checkConditions(); // เรียกครั้งแรก
    }
    provinceOther?.addEventListener('input', updateRequestFormTravelScheduleSection);
    startDateInput?.addEventListener('change', updateRequestFormTravelScheduleSection);
    endDateInput?.addEventListener('change', updateRequestFormTravelScheduleSection);
    attendeesList?.addEventListener('input', updateRequestFormTravelScheduleSection);
    attendeesList?.addEventListener('change', updateRequestFormTravelScheduleSection);
}
// จัดการปุ่ม Action ต่างๆ (แก้ไข, ลบ, ส่งบันทึก)
async function handleRequestAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const requestId = button.dataset.id;
    const action = button.dataset.action;

    console.log("Action triggered:", action, "Request ID:", requestId);

    if (action === 'edit') {
        console.log("🔄 Opening edit page for:", requestId);
        await openEditPage(requestId);
        
    } else if (action === 'delete') {
        console.log("🗑️ Deleting request:", requestId);
        await handleDeleteRequest(requestId);
        
    } else if (action === 'send-memo') {
        console.log("📤 Opening send memo modal for:", requestId);
        // ดึงข้อมูลแผนกจาก cache เพื่อ auto-select ผู้รับเรื่อง
        let deptName = null;
        if (window.userRequestsCache) {
            const cached = window.userRequestsCache.find(r => (r.id || r.requestId) === requestId);
            if (cached) deptName = cached.department || null;
        }
        openSendMemoFromList(requestId, deptName);
    }
}

// ลบคำขอออกจากระบบทั้งหมด (hard delete)
async function handleDeleteRequest(requestId) {
    try {
        const user = getCurrentUser();
        if (!user) { showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่'); return; }

        const confirmed = await showConfirm(
            'ยืนยันการลบ',
            `ต้องการลบคำขอ ${requestId} ออกจากระบบ?\n\nการดำเนินการนี้ไม่สามารถยกเลิกได้`
        );
        if (!confirmed) return;

        await apiCall('POST', 'deleteRequest', { requestId, username: user.username });

        showAlert('สำเร็จ', `ลบคำขอ ${requestId} ออกจากระบบเรียบร้อยแล้ว`);
        clearRequestsCache();
        await fetchUserRequests();

        if (!document.getElementById('edit-page').classList.contains('hidden')) {
            await switchPage('dashboard-page');
        }
    } catch (error) {
        console.error('Error deleting request:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
    }
}
// ==========================================
// 1. ฟังก์ชันดึงข้อมูล (Fetch Data) - อัปเกรดระบบ Cache
// ==========================================
async function fetchUserRequests(forceRefresh = false) {
    const user = getCurrentUser();
    if (!user) return;

    const yearSelect = document.getElementById('user-year-select');
    const currentYear = new Date().getFullYear() + 543;
    const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;

    // --- 🚀 CACHE CHECK LOGIC ---
    const now = Date.now();
    const isCacheValid = window.userRequestsCache !== null;
    const isSameYear = window.userRequestsCacheYear === selectedYear;
    const isNotExpired = (now - window.userRequestsCacheTime) < CACHE_TTL_MS;

    if (!forceRefresh && isCacheValid && isSameYear && isNotExpired) {
        console.log("⚡ โหลดข้อมูลจาก Cache (ประหยัดเวลาและโควต้า API)");
        renderUserRequests(window.userRequestsCache);
        return; // ออกจากฟังก์ชันเลย ไม่ต้องยิง API
    }

    // UI: แสดง Loader ถ้าต้องยิง API ใหม่
    const container = document.getElementById('user-requests-list');
    const tableWrapper = document.getElementById('requests-table-wrapper');
    const noMsg = document.getElementById('no-requests-message');
    
    if (container) {
        container.innerHTML = `
            <tr><td colspan="6" class="text-center py-10">
                <span class="loader mb-3 inline-block"></span>
                <p class="text-gray-500 animate-pulse mt-2">กำลังดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์...</p>
            </td></tr>`;
    }
    if (tableWrapper) tableWrapper.classList.remove('hidden');
    if (noMsg) noMsg.classList.add('hidden');

    try {
        // ── ดึงข้อมูลจาก GAS Sheets (source of truth) ──
        const result = await apiCall('GET', 'getRequestsByYear', {
            year: selectedYear,
            username: user.username
        });
        let requests = (result.status === 'success') ? (result.data || []) : [];
        console.log(`📋 Loaded ${requests.length} requests from GAS/Supabase`);

        // ── 3. เรียงลำดับ (ใหม่ -> เก่า) ──
        if (requests.length > 0) {
            requests.sort((a, b) => {
                const getTime = (d) => d ? new Date(d).getTime() : 0;
                return getTime(b.docDate) - getTime(a.docDate);
            });
        }

        // ── 4. บันทึกลง Cache ──
        window.userRequestsCache = requests;
        window.userRequestsCacheTime = Date.now();
        window.userRequestsCacheYear = selectedYear;

        // ── 5. แสดงผล ──
        renderUserRequests(requests);

    } catch (error) {
        console.error('Error fetching requests:', error);
        if (container) {
            container.innerHTML = `<p class="text-center text-red-500 py-10">โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
        }
    }
}

// ==========================================
// 2. ฟังก์ชันแสดงผล (Render UI) - ปรับปรุงปุ่มแก้ไขรายการที่ส่งแล้ว
// ==========================================
function renderUserRequests(requests) {
    const container = document.getElementById('user-requests-list');
    const noMsg = document.getElementById('no-requests-message');
    const tableWrapper = document.getElementById('requests-table-wrapper');

    if (!container) return;

    if (typeof renderNotificationUI === 'function' && typeof buildUserRequestBadgeSummary === 'function') {
        renderNotificationUI(buildUserRequestBadgeSummary(requests || []));
    }

    if (!requests || requests.length === 0) {
        container.innerHTML = '';
        if (tableWrapper) tableWrapper.classList.add('hidden');
        if (noMsg) {
            noMsg.classList.remove('hidden');
            noMsg.innerHTML = `
                <div class="text-center py-10">
                    <p class="text-gray-400 text-lg">ยังไม่มีประวัติการขอไปราชการในปีนี้</p>
                    <p class="text-sm text-gray-500 mt-2">เมื่อสร้างคำขอแล้ว รายการจะมาแสดงที่หน้านี้</p>
                    <button onclick="switchPage('form-page')" class="mt-3 btn bg-indigo-500 hover:bg-indigo-600 text-white btn-sm">
                        + สร้างคำขอใหม่
                    </button>
                </div>`;
        }
        return;
    }

    if (noMsg) noMsg.classList.add('hidden');
    if (tableWrapper) tableWrapper.classList.remove('hidden');

    // Helper: format วันที่ภาษาไทย
    const formatDate = (date) => {
        if (!date) return '-';
        const d = new Date(date);
        return isNaN(d.getTime()) ? date : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    container.innerHTML = requests.map(req => {
        const safeId = escapeHtml(req.id || 'รอเลขที่');

        // ลิงก์ไฟล์
        const completedMemoUrl    = req.completedMemoUrl;
        const adminMemoUrl        = req.adminMemoUrl;   // ไฟล์ที่แอดมินอัพโหลดให้ผู้ใช้นำไปใช้งาน
        const draftMemoUrl        = req.fileUrl || req.pdfUrl || req.memoPdfUrl;
        const completedCommandUrl = req.completedCommandUrl || req.commandPdfUrl || req.commandBookUrl;
        const dispatchBookUrl     = req.dispatchBookUrl || req.dispatchBookPdfUrl;
        const travelScheduleUrl   = req.travelSchedulePdfUrl || req.travelScheduleUrl;
        const hasTravelScheduleData = !!(req.travelSchedule && JSON.stringify(req.travelSchedule) !== '{}');

        // สถานะ
        const hasAdminFile  = !!adminMemoUrl;
        const isReadyToUse  = req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || (hasAdminFile && req.status === 'เสร็จสิ้น');
        const isCompleted   = isReadyToUse || req.status === 'เสร็จสิ้น' || !!completedMemoUrl;
        const isFixing      = (req.status === 'นำกลับไปแก้ไข' || req.memoStatus === 'นำกลับไปแก้ไข'
            || (req.wasRejected === true && !isReadyToUse && req.status !== 'เสร็จสิ้น'));
        const isSubmitted   = req.status === 'Submitted';
        const isFinalStatus = isReadyToUse
            || req.status === 'ไม่อนุมัติ'
            || req.status === 'ยกเลิก';
        const needsToSend = (draftMemoUrl && !completedMemoUrl && !isSubmitted && !isFinalStatus) || isFixing;
        const canSend     = (draftMemoUrl || completedMemoUrl) && !isFinalStatus;
        const canEdit     = !completedCommandUrl && !isReadyToUse;

        // Badge สถานะ
        let statusBadge = '';
        const _badgeBase = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap';
        if (isReadyToUse) {
            statusBadge = `<span class="${_badgeBase}" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;">✅ รับไฟล์ได้แล้ว</span>`;
        } else if (completedCommandUrl) {
            statusBadge = `<span class="${_badgeBase}" style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;">✅ ออกคำสั่งแล้ว</span>`;
        } else if (isFixing) {
            statusBadge = `<span class="${_badgeBase} animate-pulse" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;">⚠️ ตีกลับ/ต้องแก้ไข</span>`;
        } else if (needsToSend) {
            statusBadge = `<span class="${_badgeBase}" style="background:#ffedd5;color:#c2410c;border:1px solid #fed7aa;">⏳ รอยืนยันการส่ง</span>`;
        } else if (isCompleted) {
            statusBadge = `<span class="${_badgeBase}" style="background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;">☑️ ส่งแล้ว (รอคำสั่ง)</span>`;
        } else if (req.status === 'ไม่อนุมัติ') {
            statusBadge = `<span class="${_badgeBase}" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;">❌ ไม่อนุมัติ</span>`;
        } else if (isSubmitted) {
            statusBadge = `<span class="${_badgeBase}" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;">📨 ส่งแล้ว รอดำเนินการ</span>`;
        } else {
            statusBadge = `<span class="${_badgeBase}" style="background:#f8fafc;color:#64748b;border:1px solid #e2e8f0;">… ดำเนินการ</span>`;
        }
        const travelScheduleBadge = travelScheduleUrl
            ? `<span class="${_badgeBase}" style="background:#ecfdf5;color:#047857;border:1px solid #bbf7d0;">📅 มีกำหนดการ</span>`
            : (hasTravelScheduleData
                ? `<span class="${_badgeBase}" style="background:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;">💾 บันทึกกำหนดการแล้ว</span>`
                : '');

        // ปุ่มดำเนินการ (compact สำหรับ table)
        let actionBtns = '';

        // --- รวบรวมไฟล์ที่แอดมินอัพโหลดให้ผู้ใช้ (dedup by URL) ---
        const _adminFiles = [];
        const _seenFileUrls = new Set();
        const _addAdminFile = (url, label, icon) => {
            if (url && !_seenFileUrls.has(url)) {
                _seenFileUrls.add(url);
                _adminFiles.push({ url, label, icon });
            }
        };
        _addAdminFile(adminMemoUrl,        'บันทึกข้อความ',  '📄');
        _addAdminFile(completedCommandUrl, 'คำสั่งไปราชการ', '📋');
        _addAdminFile(dispatchBookUrl,     'หนังสือส่ง',     '📦');
        _addAdminFile(travelScheduleUrl,   'กำหนดการเดินทาง', '📅');

        if (_adminFiles.length === 1) {
            // ไฟล์เดียว → link โดยตรง
            actionBtns += `<a href="${sanitizeUrl(_adminFiles[0].url)}" target="_blank"
                class="btn btn-xs w-full font-bold" style="background:linear-gradient(135deg,#34d399,#10b981);color:white;">
                ${_adminFiles[0].icon} ${_adminFiles[0].label}</a>`;
        } else if (_adminFiles.length > 1) {
            // หลายไฟล์ → dropdown เมนู
            const _menuId = `fmenu-${safeId.replace(/[^a-z0-9]/gi, '_')}`;
            const _menuItems = _adminFiles.map(f => `
                <a href="${sanitizeUrl(f.url)}" target="_blank" onclick="closeAllFileMenus(event)"
                    class="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-green-50 hover:text-green-800 border-b border-gray-100 last:border-0 whitespace-nowrap transition-colors">
                    <span class="text-base">${f.icon}</span>
                    <span class="font-medium">${f.label}</span>
                    <span class="ml-auto text-gray-400 text-xs">↗</span>
                </a>`).join('');
            actionBtns += `
                <div class="w-full file-menu-wrapper">
                    <button onclick="toggleFileMenu('${_menuId}', event)"
                        class="btn btn-xs w-full font-bold flex items-center justify-center gap-1" style="background:linear-gradient(135deg,#34d399,#10b981);color:white;">
                        <span>📥 นำไฟล์ไปใช้งาน</span>
                        <span class="opacity-70 text-xs">▾</span>
                    </button>
                    <div id="${_menuId}" class="file-menu-dropdown" style="display:none;">
                        <div style="background:#16a34a;padding:6px 14px;font-size:0.72rem;color:#fff;font-weight:700;letter-spacing:.05em;">เลือกเอกสาร</div>
                        ${_menuItems}
                    </div>
                </div>`;
        }

        if (canSend) {
            const isUrgent  = needsToSend || isFixing;
            const btnLabel  = isFixing    ? '📤 ส่งใหม่ (ตีกลับ)'
                            : needsToSend ? '📤 ส่งบันทึก'
                            :               '📤 ส่ง/อัปเดตบันทึก';
            actionBtns += `<button onclick="openSendMemoFromList('${safeId}')" class="btn btn-xs w-full ${isUrgent ? 'animate-pulse' : ''}" style="background:linear-gradient(135deg,#fb923c,#f97316);color:white;">${btnLabel}</button>`;
        }
        // ไฟล์ที่ผู้ใช้ส่งมาเอง (แยกออกจากไฟล์แอดมิน)
        if (completedMemoUrl && !_seenFileUrls.has(completedMemoUrl)) {
            actionBtns += `<a href="${sanitizeUrl(completedMemoUrl)}" target="_blank" class="btn btn-xs w-full" style="background:#dbeafe;color:#1d4ed8;border:1px solid #bfdbfe;">📄 บันทึก (ส่ง)</a>`;
        } else if (draftMemoUrl && !isCompleted && !_seenFileUrls.has(draftMemoUrl)) {
            actionBtns += `<a href="${draftMemoUrl}" target="_blank" class="btn btn-xs w-full" style="background:#ccfbf1;color:#0f766e;border:1px solid #99f6e4;">📄 บันทึก (ร่าง)</a>`;
        }
        // ปุ่มสร้างกำหนดการเดินทางพานักเรียน (แสดงเฉพาะกรณีที่ผ่านเงื่อนไข)
        if (typeof isEligibleForTravelSchedule === 'function' && isEligibleForTravelSchedule(req)) {
            const scheduleLabel = travelScheduleUrl ? '✏️ แก้กำหนดการ' : (hasTravelScheduleData ? '📅 สร้างไฟล์กำหนดการ' : '📅 กรอกกำหนดการ');
            actionBtns += `<button onclick="openTravelScheduleByReqId('${safeId}')" class="btn btn-xs w-full" style="background:linear-gradient(135deg,#7dd3fc,#f9a8d4);color:#075985;border:none;">${scheduleLabel}</button>`;
        }

        // ปุ่มแก้ไข/ลบ
        const editDeleteBtns = canEdit ? `
            <div class="flex gap-1 mt-1">
                ${!isCompleted ? `<button onclick="editRequest('${safeId}')" class="btn btn-xs flex-1" style="background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;">✏️ แก้ไข</button>` : ''}
                <button onclick="deleteRequest('${safeId}')" class="btn btn-xs flex-1" style="background:#fff1f2;color:#e11d48;border:1px solid #fecdd3;">🗑️ ลบ</button>
            </div>` : '';

        // สีแถว
        let rowClass = '';
        if (isFixing)           rowClass = 'row-red';
        else if (isReadyToUse)  rowClass = 'row-green';
        else if (completedCommandUrl) rowClass = 'row-green';
        else if (isCompleted)   rowClass = 'row-blue';
        else if (needsToSend)   rowClass = 'row-orange';

        // เหตุผลตีกลับ (ถ้ามี)
        const rejectBanner = isFixing ? `
            <div class="text-xs text-red-600 mt-1 font-bold">🔴 ตีกลับ${req.rejectionReason ? `: ${escapeHtml(req.rejectionReason)}` : ''}</div>` : '';

        return `
        <tr class="${rowClass}">
            <td>
                <div class="font-bold text-indigo-700 text-sm leading-tight">${safeId}</div>
                ${rejectBanner}
            </td>
            <td style="max-width:220px">
                <div class="text-gray-800 text-sm leading-snug" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(req.purpose)}</div>
            </td>
            <td class="text-sm text-gray-600 max-w-[140px]">
                <div style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(req.location || '-')}</div>
            </td>
            <td class="whitespace-nowrap text-xs text-gray-500">
                <div>${formatDate(req.startDate)}</div>
                <div class="text-gray-400">– ${formatDate(req.endDate)}</div>
            </td>
            <td><div class="flex flex-wrap gap-1.5">${statusBadge}${travelScheduleBadge}</div></td>
            <td>
                <div class="flex flex-col gap-1 items-stretch" style="min-width:128px">
                    ${actionBtns}
                    ${editDeleteBtns}
                </div>
            </td>
        </tr>`;
    }).join('');
}

function renderRequestsList(requests, memos, searchTerm = '') {
    const container = document.getElementById('requests-list');
    const noRequestsMessage = document.getElementById('no-requests-message');
    
    if (!requests || requests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        return;
    }

    let filteredRequests = requests;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredRequests = requests.filter(req => 
            (req.purpose && req.purpose.toLowerCase().includes(term)) ||
            (req.location && req.location.toLowerCase().includes(term)) ||
            (req.id && req.id.toLowerCase().includes(term))
        );
    }

    if (filteredRequests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        noRequestsMessage.innerHTML = '<p>ไม่พบคำขอที่ตรงกับการค้นหา</p>';
        return;
    }

    container.innerHTML = filteredRequests.map(request => {
        const relatedMemo = memos.find(memo => memo.refNumber === request.id);
        
        // ── สถานะบันทึกข้อความ ──────────────────────────────────────────────
        // สถานะที่เป็นของคำสั่งโดยเฉพาะ — ไม่ควรแสดงในช่อง "สถานะบันทึกข้อความ"
        const COMMAND_ONLY_STATUSES = new Set([
            'เสร็จสิ้นรอออกคำสั่งไปราชการ',
            'รอตรวจสอบและออกคำสั่งไปราชการ',
        ]);

        let displayRequestStatus = request.status || '';
        if (relatedMemo && relatedMemo.status) {
            displayRequestStatus = relatedMemo.status;
        }
        // ถ้าถูกตีกลับให้ override เสมอ
        if (request.docStatus === 'ถูกตีกลับ') displayRequestStatus = 'ถูกตีกลับ';

        // ── สถานะคำสั่ง ───────────────────────────────────────────────────────
        const commandPdfUrl = relatedMemo?.completedCommandUrl || request.completedCommandUrl || request.commandBookUrl || request.commandPdfUrl;
        // ถ้า request.status เป็น command-only ให้ดึงมาแสดงในช่อง "สถานะคำสั่ง" แทน
        const commandStatusFromRequestStatus = COMMAND_ONLY_STATUSES.has(displayRequestStatus) ? displayRequestStatus : null;
        let displayCommandStatus = request.commandStatus || commandStatusFromRequestStatus || null;
        const hasCommandData = !!(commandPdfUrl || displayCommandStatus);

        // ถ้า request.status เป็น command-only ให้ล้างออกจากช่องบันทึก
        if (COMMAND_ONLY_STATUSES.has(displayRequestStatus)) displayRequestStatus = '';

        // ลิงก์ไฟล์ต่างๆ
        const completedMemoUrl    = relatedMemo?.completedMemoUrl    || request.completedMemoUrl    || request.memoPdfUrl || request.fileUrl;
        const completedCommandUrl = relatedMemo?.completedCommandUrl || request.completedCommandUrl || request.commandBookUrl;
        const dispatchBookUrl     = relatedMemo?.dispatchBookUrl     || request.dispatchBookUrl     || request.dispatchBookPdfUrl;

        const hasCompletedFiles = completedMemoUrl || completedCommandUrl || dispatchBookUrl;
        const isFullyCompleted =
            displayRequestStatus  === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ||
            displayRequestStatus  === 'เสร็จสิ้น' ||
            displayRequestStatus  === 'รับไฟล์กลับไปใช้งาน' ||
            displayCommandStatus  === 'รับไฟล์กลับไปใช้งาน';
        
        const safeId = escapeHtml(request.id || request.requestId || 'รอออกเลข');
        const safePurpose = escapeHtml(request.purpose || 'ไม่มีวัตถุประสงค์');
        const safeLocation = escapeHtml(request.location || 'ไม่ระบุ');
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;
        
        // ★★★ แก้ไขจุดนี้: เลือกไฟล์คำขอ (Cloud Run) ก่อนไฟล์ GAS ★★★
        const requestDocUrl = request.fileUrl || request.memoPdfUrl || request.pdfUrl;

        return `
            <div class="border rounded-lg p-4 mb-4 bg-white shadow-sm ${isFullyCompleted ? 'border-green-300 bg-green-50' : ''} hover:shadow-md transition-all">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <h3 class="font-bold text-lg text-indigo-700">${safeId}</h3>
                            ${isFullyCompleted ? `
                                <span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-green-200">
                                    ✅ เสร็จสิ้น
                                </span>
                            ` : ''}
                            ${displayRequestStatus === 'นำกลับไปแก้ไข' ? `
                                <span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-red-200">
                                    ⚠️ ต้องแก้ไข
                                </span>
                            ` : ''}
                            ${displayRequestStatus === 'ถูกตีกลับ' || request.docStatus === 'ถูกตีกลับ' ? `
                                <span class="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-0.5 rounded-full border border-red-300">
                                    ↩️ ถูกตีกลับ — รอแก้ไข
                                </span>
                            ` : ''}
                        </div>
                        ${(displayRequestStatus === 'ถูกตีกลับ' || request.docStatus === 'ถูกตีกลับ') && (request.rejectionReason || request.rejectedBy) ? `
                            <div class="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                                <span class="font-bold">📋 เหตุผลที่ส่งกลับ:</span> ${escapeHtml(request.rejectionReason || 'ไม่ระบุเหตุผล')}
                                ${request.rejectedBy ? `<span class="text-red-500 text-xs ml-2">— โดย ${escapeHtml(request.rejectedBy)}</span>` : ''}
                            </div>
                        ` : ''}
                        <p class="text-gray-700 font-medium mb-1">${safePurpose}</p>
                        <p class="text-sm text-gray-500">📍 ${safeLocation} | 📅 ${safeDate}</p>
                        
                        <div class="mt-3 space-y-1">
                            <p class="text-sm">
                                <span class="font-medium">สถานะบันทึกข้อความ:</span>
                                <span class="${getStatusColor(displayRequestStatus || 'กำลังดำเนินการ')}">${translateStatus(displayRequestStatus || 'กำลังดำเนินการ')}</span>
                            </p>
                            ${(request.docStatus && request.docStatus.startsWith('waiting_') && !relatedMemo) ? `
                            <p class="text-sm text-gray-500">
                                <span class="font-medium">ขั้นตอนปัจจุบัน:</span>
                                <span class="text-indigo-600">${escapeHtml(typeof getDocStatusLabel === 'function' ? getDocStatusLabel(request.docStatus) : request.docStatus)}</span>
                            </p>` : ''}
                            ${hasCommandData ? `
                            <p class="text-sm">
                                <span class="font-medium">สถานะคำสั่ง:</span>
                                <span class="${getStatusColor(displayCommandStatus || 'กำลังดำเนินการ')}">${translateStatus(displayCommandStatus || 'กำลังดำเนินการ')}</span>
                            </p>` : ''}
                        </div>
                        
                        ${hasCompletedFiles ? `
                            <div class="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                <p class="text-sm font-medium text-green-800 mb-2">📁 ไฟล์ที่พร้อมดาวน์โหลด:</p>
                                <div class="flex flex-wrap gap-2">
                                    ${completedMemoUrl ? `
                                        <a href="${sanitizeUrl(completedMemoUrl)}" target="_blank" class="btn btn-success btn-sm text-xs py-1 px-2">
                                            📄 บันทึกข้อความ
                                        </a>
                                    ` : ''}
                                    ${completedCommandUrl ? `
                                        <a href="${sanitizeUrl(completedCommandUrl)}" target="_blank" class="btn bg-blue-500 hover:bg-blue-600 text-white btn-sm text-xs py-1 px-2">
                                            📋 คำสั่ง
                                        </a>
                                    ` : ''}
                                    ${dispatchBookUrl ? `
                                        <a href="${dispatchBookUrl}" target="_blank" class="btn bg-purple-500 hover:bg-purple-600 text-white btn-sm text-xs py-1 px-2">
                                            📦 หนังสือส่ง
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex flex-col gap-2 ml-4 min-w-[100px]">
                        ${requestDocUrl ? `
                            <a href="${requestDocUrl}" target="_blank" class="btn btn-success btn-sm w-full text-center">
                                📄 ดูคำขอ
                            </a>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="edit" data-id="${request.id || request.requestId}" class="btn bg-blue-500 hover:bg-blue-600 text-white btn-sm w-full">
                                ✏️ แก้ไข
                            </button>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="delete" data-id="${request.id || request.requestId}" class="btn btn-danger btn-sm w-full">
                                🗑️ ลบ
                            </button>
                        ` : ''}
                        
                        ${(displayRequestStatus === 'นำกลับไปแก้ไข' || !relatedMemo) && !isFullyCompleted ? `
                            <button data-action="send-memo" data-id="${request.id || request.requestId}" class="btn bg-green-500 hover:bg-green-600 text-white btn-sm w-full">
                                📤 ส่งบันทึก
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.classList.remove('hidden');
    noRequestsMessage.classList.add('hidden');
}

// --- EDIT PAGE FUNCTIONS ---

function resetEditPage() {
    console.log("🧹 Resetting edit page...");
    
    document.getElementById('edit-request-form').reset();
    document.getElementById('edit-attendees-list').innerHTML = '';
    document.getElementById('edit-result').classList.add('hidden');
    
    sessionStorage.removeItem('currentEditRequestId');
    document.getElementById('edit-request-id').value = '';
    document.getElementById('edit-draft-id').value = '';
    setProvinceFieldValue('edit-province', 'edit-province-other', 'สระแก้ว');
    
    console.log("✅ Edit page reset complete");
}

function setupEditPageEventListeners() {
    setupProvinceField('edit-province', 'edit-province-other');
    populateSignerPositionSelect('edit-department');

    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        console.log("🏠 Returning to dashboard from edit page");
        switchPage('dashboard-page');
    });
    
    document.getElementById('generate-document-button').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Generate document button clicked");
        generateDocumentFromDraft();
    });
    
    document.getElementById('edit-add-attendee').addEventListener('click', () => addEditAttendeeField());
    const importBtn = document.getElementById('edit-import-excel');
    const fileInput = document.getElementById('edit-excel-file-input');

    if (importBtn && fileInput) {
        // เมื่อกดปุ่มสีฟ้า -> ให้ไปกด input file ที่ซ่อนอยู่
        importBtn.addEventListener('click', () => fileInput.click());
        
        // เมื่อเลือกไฟล์เสร็จ -> เรียกฟังก์ชันประมวลผล
        fileInput.addEventListener('change', handleEditExcelImport);
    }
    document.querySelectorAll('input[name="edit-expense_option"]').forEach(radio => {
        radio.addEventListener('change', toggleEditExpenseOptions);
    });
    
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(radio => {
        radio.addEventListener('change', toggleEditVehicleDetails); // Use the toggleDetails helper
    });
    
    document.getElementById('edit-department').addEventListener('change', (e) => {
        syncSignerHeadName('edit-department', 'edit-head-name');
    });
}

// 1. ฟังก์ชันนำข้อมูลเข้าฟอร์ม (แก้ไขให้ดึงรายชื่อมาสร้างฟิลด์อัตโนมัติ)
// --- แก้ไขในไฟล์ js/requests.js ---

// --- แก้ไขในไฟล์ js/requests.js ---

async function populateEditForm(requestData) {
    try {
        console.log("📝 กำลังเติมข้อมูลลงฟอร์มแก้ไข:", requestData);
        
        // --- 1. ข้อมูลพื้นฐานและ ID ---
        document.getElementById('edit-draft-id').value = requestData.draftId || '';
        document.getElementById('edit-request-id').value = requestData.requestId || requestData.id || '';
        
        // ฟังก์ชันช่วยแปลงวันที่
        const formatDate = (dateValue) => {
            if (!dateValue) return '';
            const d = new Date(dateValue);
            return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
        };
        
        document.getElementById('edit-doc-date').value = formatDate(requestData.docDate);
        document.getElementById('edit-requester-name').value = requestData.requesterName || '';
        document.getElementById('edit-requester-position').value = requestData.requesterPosition || '';
        document.getElementById('edit-location').value = requestData.location || '';
        setProvinceFieldValue('edit-province', 'edit-province-other', requestData.province || '');
        document.getElementById('edit-purpose').value = requestData.purpose || '';
        document.getElementById('edit-start-date').value = formatDate(requestData.startDate);
        document.getElementById('edit-end-date').value = formatDate(requestData.endDate);
        
        // --- 2. จัดการรายชื่อผู้ร่วมเดินทาง ---
        const attendeesListEl = document.getElementById('edit-attendees-list');
        if (attendeesListEl) attendeesListEl.innerHTML = ''; // ล้างข้อมูลเก่าก่อน

        let attendeesData = [];
        if (requestData.attendees) {
            // รองรับทั้ง Array และ JSON String
            attendeesData = Array.isArray(requestData.attendees) 
                ? requestData.attendees 
                : JSON.parse(requestData.attendees || '[]');
        }

        const requesterNameCheck = (requestData.requesterName || '').trim();

        // วนลูปสร้างฟิลด์รายชื่อ (ถ้าชื่อไม่ตรงกับผู้ขอ ให้แสดงออกมา)
        if (attendeesData.length > 0) {
            attendeesData.forEach(att => {
                const name = att.name || att['ชื่อ-นามสกุล'] || '';
                const position = att.position || att['ตำแหน่ง'] || '';
                
                if (name && name.trim() !== requesterNameCheck) {
                    // เรียกฟังก์ชันเพิ่มฟิลด์ (ต้องมีฟังก์ชัน addEditAttendeeField อยู่ในไฟล์แล้ว)
                    addEditAttendeeField(name, position);
                }
            });
        }
        
        // --- 3. จัดการข้อมูลค่าใช้จ่าย & ไฟล์แนบ (สำคัญ!) ---
        const radioNo = document.getElementById('edit-expense_no');
        const radioPartial = document.getElementById('edit-expense_partial');
        
        // Reset ค่า Checkbox และ Textbox ก่อน
        document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => chk.checked = false);
        if(document.getElementById('edit-expense_other_text')) document.getElementById('edit-expense_other_text').value = '';
        document.getElementById('edit-total-expense').value = '';

        // ตรวจสอบสถานะการเบิก
        const expenseOption = requestData.expenseOption;

        if (expenseOption === 'partial' || expenseOption === 'ขอเบิกเฉพาะค่าใช้จ่าย') {
            // กรณี: ขอเบิก
            if (radioPartial) radioPartial.checked = true;
            
            let expenseItems = requestData.expenseItems || [];
            if (typeof expenseItems === 'string') try { expenseItems = JSON.parse(expenseItems); } catch(e) {}
            
            if (Array.isArray(expenseItems)) {
                expenseItems.forEach(item => {
                    const itemName = item.name || item;
                    const checkbox = document.querySelector(`input[name="edit-expense_item"][data-item-name="${itemName}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        if (itemName === 'ค่าใช้จ่ายอื่นๆ' && item.detail) {
                            document.getElementById('edit-expense_other_text').value = item.detail;
                        }
                    }
                });
            }
            document.getElementById('edit-total-expense').value = requestData.totalExpense || '';
            
        } else {
            // กรณี: ไม่ขอเบิก (หรืออื่นๆ)
            if (radioNo) radioNo.checked = true;
            
            // ★★★ แสดงลิงก์ไฟล์แนบเดิม (ถ้ามี) ★★★
            // ฟังก์ชันย่อยสำหรับจัดการลิงก์
            const setupLink = (url, containerId) => {
                const div = document.getElementById(containerId);
                if (!div) return;
                
                const a = div.querySelector('a');
                if (url && url.startsWith('http')) {
                    div.classList.remove('hidden'); // แสดงลิงก์
                    if(a) a.href = url;
                } else {
                    div.classList.add('hidden'); // ซ่อนลิงก์ถ้าไม่มีไฟล์เดิม
                }
            };
            
            // ดึงลิงก์จาก Field เก่ามาแสดง (ให้ตรงกับ HTML ที่เพิ่มไป)
            setupLink(requestData.fileExchangeUrl, 'link-existing-exchange');
            setupLink(requestData.fileRefDocUrl, 'link-existing-ref-doc');
            setupLink(requestData.fileOtherUrl, 'link-existing-other');
        }
        
        // เรียกฟังก์ชันเพื่อซ่อน/แสดง UI ตาม Radio ที่เลือก
        if (typeof toggleEditExpenseOptions === 'function') {
            toggleEditExpenseOptions(); 
        }
        
        // --- 4. จัดการข้อมูลพาหนะ ---
        const vehicleOption = requestData.vehicleOption || 'gov';
        const vehicleRadio = document.querySelector(`input[name="edit-vehicle_option"][value="${vehicleOption}"]`);
        if (vehicleRadio) vehicleRadio.checked = true;

        document.getElementById('edit-license-plate').value = requestData.licensePlate || '';
        
        const publicVehicleInput = document.getElementById('edit-public-vehicle-details'); 
        if (publicVehicleInput) {
            publicVehicleInput.value = requestData.publicVehicleDetails || '';
        }
        
        if (typeof toggleEditVehicleDetails === 'function') {
            toggleEditVehicleDetails();
        }

        // --- 5. ข้อมูลผู้ลงนาม ---
        populateSignerPositionSelect('edit-department', requestData.department || '');
        syncSignerHeadName('edit-department', 'edit-head-name', requestData.headName || '');

        // ★★★ เก็บข้อมูลเดิมไว้ในตัวแปร Global (สำคัญมากสำหรับการบันทึก) ★★★
        // เพื่อให้ฟังก์ชัน saveEditRequest รู้ว่าไฟล์เดิมคืออะไร หากผู้ใช้ไม่ได้อัปโหลดไฟล์ใหม่ทับ
        window.originalRequestDataForEdit = requestData;

        console.log("✅ เติมข้อมูลลงฟอร์มสำเร็จ");

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาดใน populateEditForm:", error);
        showAlert("ข้อผิดพลาด", "ไม่สามารถดึงข้อมูลลงแบบฟอร์มได้ครบถ้วน");
    }
}

// 2. ฟังก์ชันจัดการการนำเข้าไฟล์ Excel/CSV ในหน้าแก้ไข (เพิ่มใหม่)
async function handleEditExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    toggleLoader('edit-import-excel', true);
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        jsonData.forEach(row => {
            const name = row['ชื่อ-นามสกุล'] || row['Name'];
            const pos = row['ตำแหน่ง'] || row['Position'];
            if (name) {
                addEditAttendeeField(name, pos); // เพิ่มฟิลด์รายชื่อลงหน้าแก้ไข
            }
        });
        showAlert('สำเร็จ', 'นำเข้าข้อมูลผู้ร่วมเดินทางเรียบร้อยแล้ว');
    } catch (error) {
        showAlert('ผิดพลาด', 'ไม่สามารถอ่านไฟล์ได้: ' + error.message);
    } finally {
        toggleLoader('edit-import-excel', false);
        e.target.value = ''; // ล้างค่าเพื่อให้เลือกไฟล์เดิมซ้ำได้
    }
}



async function openEditPage(requestId) {
    try {
        console.log("🔓 Opening edit page for request:", requestId);
        
        if (!requestId || requestId === 'undefined' || requestId === 'null') {
            showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ");
            return;
        }

        const user = getCurrentUser();
        if (!user) {
            showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
            return;
        }
        
        // 1. Reset ฟอร์มรอไว้ก่อน
        resetEditPage();
        
        let requestData = null;

        // ------------------------------------------------------------------
        // STEP 1: ลองดูใน Cache ก่อน
        // ★ ตรวจ user cache ก่อน (window.userRequestsCache) แล้วค่อยดู admin cache
        // ------------------------------------------------------------------
        if (!requestData && window.userRequestsCache) {
            const cached = window.userRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
            if (cached) {
                console.log("✅ พบข้อมูลใน User Cache (userRequestsCache)");
                requestData = cached;
            }
        }
        if (!requestData && typeof allRequestsCache !== 'undefined') {
            const cached = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
            if (cached) {
                console.log("✅ พบข้อมูลใน Admin Cache (allRequestsCache)");
                requestData = cached;
            }
        }

        // ------------------------------------------------------------------
        // STEP 2: ไม้ตายสุดท้าย -> ดึงจาก GAS / Supabase
        // ------------------------------------------------------------------
        if (!requestData) {
            console.log("🔄 กำลังดึงข้อมูลต้นฉบับจาก GAS / Supabase...");
            document.getElementById('edit-attendees-list').innerHTML = `
                <div class="text-center p-4"><div class="loader mx-auto"></div><p class="mt-2 text-blue-600">กำลังดึงรายชื่อจากฐานข้อมูลหลัก...</p></div>`;

            // เรียก API ไปที่ GAS เพื่อดึงข้อมูลแถวนั้นโดยเฉพาะ
            const result = await apiCall('GET', 'getDraftRequest', { 
                requestId: requestId, 
                username: user.username 
            });
            
            if (result.status === 'success' && result.data) {
                // รองรับโครงสร้างข้อมูลที่อาจซ้อนกัน
                requestData = result.data.data || result.data;
                console.log("✅ ได้รับข้อมูลจาก GAS / Supabase เรียบร้อย");
            }
        }

        // ------------------------------------------------------------------
        // STEP 4: นำข้อมูลใส่ฟอร์ม
        // ------------------------------------------------------------------
        if (requestData) {

            // ── Guard: เตือนถ้าเอกสารอยู่ในสายอนุมัติขั้นสูงแล้ว ─────────
            const advancedStatuses = ['waiting_admin_review', 'waiting_saraban', 'waiting_director', 'completed'];
            const currentDocStatus = requestData.docStatus || '';
            if (advancedStatuses.includes(currentDocStatus)) {
                const statusLabels = {
                    'waiting_admin_review': 'รออนุมัติจาก Admin',
                    'waiting_saraban':      'อยู่ระหว่างออกเลขสารบรรณ',
                    'waiting_director':     'รอลงนามโดยผู้อำนวยการ',
                    'completed':            'เสร็จสิ้นแล้ว'
                };
                const label = statusLabels[currentDocStatus] || currentDocStatus;
                const confirmed = confirm(
                    `⚠️ เอกสารนี้อยู่ในสถานะ "${label}"\n\n` +
                    `การแก้ไขจะรีเซ็ตสถานะกลับเป็น "ร่าง" และสายอนุมัติจะต้องเริ่มใหม่ตั้งแต่ต้น\n\n` +
                    `ต้องการแก้ไขต่อไปหรือไม่?`
                );
                if (!confirmed) return;
            }
            // ─────────────────────────────────────────────────────────────

            sessionStorage.setItem('currentEditRequestId', requestId);
            await populateEditForm(requestData);
            switchPage('edit-page');
        } else {
            showAlert("ไม่พบข้อมูล", "ไม่สามารถดึงข้อมูลคำขอนี้ได้ หรือข้อมูลถูกลบไปแล้ว");
            document.getElementById('edit-attendees-list').innerHTML = ''; // ล้าง Loader
        }

    } catch (error) {
        console.error(error);
        showAlert("ผิดพลาด", "การเปิดหน้าแก้ไขขัดข้อง: " + error.message);
    }
}
function addEditAttendeeField(name = '', position = '') {
    const list = document.getElementById('edit-attendees-list');
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 bg-gray-50 p-3 rounded border border-gray-200';
    const standardPositions = ['ผู้อำนวยการ', 'รองผู้อำนวยการ', 'ครู', 'ครูผู้ช่วย', 'พนักงานราชการ', 'ครูอัตราจ้าง', 'พนักงานขับรถ', 'นักเรียน'];
    const isStandard = standardPositions.includes(position);
    const selectValue = isStandard ? position : (position ? 'other' : '');
    const otherValue = isStandard ? '' : position;

    attendeeDiv.innerHTML = `
        <div class="md:col-span-1">
            <label class="text-xs text-gray-500 mb-1 block">ชื่อ-นามสกุล</label>
            <input type="text" class="form-input attendee-name w-full" placeholder="ระบุชื่อ-นามสกุล" value="${escapeHtml(name)}" required>
        </div>
        <div class="attendee-position-wrapper md:col-span-1">
            <label class="text-xs text-gray-500 mb-1 block">ตำแหน่ง</label>
            <select class="form-input attendee-position-select w-full">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other mt-2 w-full ${selectValue === 'other' ? '' : 'hidden'}" placeholder="ระบุตำแหน่งอื่นๆ" value="${escapeHtml(otherValue)}">
        </div>
        <div class="flex items-end h-full pb-1 justify-center md:justify-start">
            <button type="button" class="btn btn-danger btn-sm h-10 w-full md:w-auto px-4" onclick="this.closest('.grid').remove()">ลบรายชื่อ</button>
        </div>
    `;
    list.appendChild(attendeeDiv);

    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');
    if (selectValue) select.value = selectValue;
    select.addEventListener('change', () => {
        if (select.value === 'other') {
            otherInput.classList.remove('hidden');
            otherInput.focus();
        } else {
            otherInput.classList.add('hidden');
            otherInput.value = '';
        }
    });
}

// --- นำไปทับฟังก์ชัน toggleEditExpenseOptions เดิม ---
function toggleEditExpenseOptions() {
    const partialOptions = document.getElementById('edit-partial-expense-options');
    const totalContainer = document.getElementById('edit-total-expense-container');
    const attachmentContainer = document.getElementById('edit-non-reimburse-attachments'); // กล่องใหม่

    const isPartial = document.getElementById('edit-expense_partial')?.checked;
    const isNoExpense = document.getElementById('edit-expense_no')?.checked;

    if (isPartial) {
        partialOptions.classList.remove('hidden');
        totalContainer.classList.remove('hidden');
        if (attachmentContainer) attachmentContainer.classList.add('hidden');
    } else {
        partialOptions.classList.add('hidden');
        totalContainer.classList.add('hidden');
        
        // ถ้าเลือก "ไม่เบิก" ให้โชว์กล่องแนบไฟล์
        if (isNoExpense && attachmentContainer) {
            attachmentContainer.classList.remove('hidden');
        } else if (attachmentContainer) {
            attachmentContainer.classList.add('hidden');
        }
        
        document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => { chk.checked = false; });
        if(document.getElementById('edit-expense_other_text')) document.getElementById('edit-expense_other_text').value = '';
        document.getElementById('edit-total-expense').value = '';
    }
}

function toggleEditVehicleOptions() {
     toggleEditVehicleDetails();
}

// --- แก้ไขในไฟล์ requests.js ---

function toggleEditVehicleDetails() {
    const privateDetails = document.getElementById('edit-private-vehicle-details'); 
    
    // แก้ไข ID ให้ตรงกับ HTML ใหม่ (เติม -container)
    const publicDetails = document.getElementById('edit-public-vehicle-details-container'); 
    
    const privateCheckbox = document.querySelector('input[name="edit-vehicle_option"][value="private"]');
    const publicCheckbox = document.querySelector('input[name="edit-vehicle_option"][value="public"]');

    if (privateDetails) privateDetails.classList.toggle('hidden', !privateCheckbox?.checked);
    if (publicDetails) publicDetails.classList.toggle('hidden', !publicCheckbox?.checked);
}
async function generateDocumentFromDraft() {
    const btn = document.getElementById('generate-document-button');
    const btnText = document.getElementById('generate-doc-button-text');
    const loader = document.getElementById('generate-doc-loader');

    const setBtnStatus = (msg, loading = true) => {
        if (btn) btn.disabled = loading;
        if (loader) loader.classList.toggle('hidden', !loading);
        if (btnText) btnText.textContent = msg;
    };

    try {
        // Step 1: ตรวจสอบและดึงข้อมูลฟอร์ม
        setBtnStatus('กำลังตรวจสอบข้อมูล...', true);
        if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();
        const formData = getEditFormData();
        if (!validateEditForm(formData)) throw new Error("ข้อมูลไม่ครบถ้วน");

        formData.attachmentUrls = [];
        formData.docType = 'memo';

        // Step 2: สร้าง PDF
        setBtnStatus('กำลังสร้างเอกสาร...', true);
        const { pdfBlob } = await generateOfficialPDF(formData);

        // Step 3: เตรียมลายเซ็น (ใหม่จาก pad > เดิมจาก cache)
        let signatureBase64 = null;
        if (typeof editSignaturePad !== 'undefined' && editSignaturePad && !editSignaturePad.isEmpty()) {
            const rawSignatureBase64 = editSignaturePad.toDataURL('image/png');
            signatureBase64 = (typeof optimizeSignatureDataURL === 'function')
                ? await optimizeSignatureDataURL(rawSignatureBase64, { targetHeight: 340 })
                : rawSignatureBase64;
        } else if (formData.signatureBase64) {
            signatureBase64 = formData.signatureBase64;
        }

        // Step 4: วางลายเซ็นบน PDF (ถ้ามี)
        let finalBlob = pdfBlob;
        if (signatureBase64) {
            setBtnStatus('กรุณาเลือกตำแหน่งลายเซ็นในเอกสาร...', true);
            finalBlob = await promptForSignature(pdfBlob, signatureBase64);
        }

        // Step 5: อัปโหลด PDF (Firebase Storage ก่อน, GAS Drive เป็น fallback)
        setBtnStatus('กำลังอัปโหลดไฟล์...', true);
        const safeId = formData.requestId.replace(/[\/\\\:\.\s]/g, '-');
        const filename = `memo_EDIT_${safeId}_${Date.now()}.pdf`;
        let newFileUrl = '';

        // แปลง blob → base64 เพื่อบันทึกลง Firestore (ให้ signature.js อ่านได้โดยไม่ต้อง fetch ข้าม CORS)
        const pdfBase64ForFirestore = await blobToBase64(finalBlob);

        newFileUrl = await uploadPdfToFirebaseStorage(finalBlob, formData.username, filename);
        console.log('✅ Edit PDF uploaded to Firebase Storage:', newFileUrl);

        // Step 6: บันทึกข้อมูลลง Firestore
        setBtnStatus('กำลังบันทึกข้อมูล...', true);
        formData.fileUrl = newFileUrl;
        formData.pdfUrl = newFileUrl;
        formData.memoPdfUrl = newFileUrl;
        if (signatureBase64) formData.signatureBase64 = signatureBase64;

        await apiCall('POST', 'updateRequest', {
            ...formData,
            fileUrl: newFileUrl,
            pdfUrl: newFileUrl,
            memoPdfUrl: newFileUrl,
            pdfBase64: pdfBase64ForFirestore,
            docStatus: 'draft',
            lastUpdated: new Date().toISOString(),
            ...(signatureBase64 ? { signatureBase64 } : {})
        });

        // Step 8: เสร็จสิ้น — นำผู้ใช้ไปส่งเอกสารทันทีพร้อมแนบไฟล์ที่เซ็นแล้ว
        setBtnStatus('✅ บันทึกสำเร็จ', false);
        if (typeof clearRequestsCache === 'function') clearRequestsCache();
        if (typeof fetchUserRequests === 'function') await fetchUserRequests();

        if (signatureBase64 && newFileUrl) {
            // มีการเซ็นออนไลน์ → เปิด send-memo modal พร้อมแนบไฟล์ที่ลงนามแล้ว
            switchPage('dashboard-page');
            openSendMemoWithPreSignedDoc(formData.requestId, newFileUrl, formData.department);
        } else {
            // ไม่มีลายเซ็น → เปิดดูไฟล์ + กลับ dashboard เหมือนเดิม
            showAlert('✅ สำเร็จ', 'บันทึกและสร้างเอกสารเรียบร้อยแล้ว');
            if (newFileUrl) openUrlWithDownloadIndicator(newFileUrl, 'กำลังเปิดไฟล์บันทึกข้อความ...');
            switchPage('dashboard-page');
        }

    } catch (error) {
        if (error.message === 'USER_CANCEL') {
            // ผู้ใช้กด "ยกเลิก" ใน modal วางลายเซ็น — ไม่ต้องแสดง error
            setBtnStatus('บันทึกและสร้างเอกสาร', false);
            return;
        }
        console.error('generateDocumentFromDraft Error:', error);
        showAlert('ข้อผิดพลาด', error.message);
        setBtnStatus('บันทึกและสร้างเอกสาร', false);
    }
}

function getEditFormData() {
    try {
        console.log("📝 เริ่มดึงข้อมูลจากฟอร์มแก้ไข (แบบผสานข้อมูลเดิม)...");

        const user = getCurrentUser();
        if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน (Session หลุด)");

        // ตัวช่วยดึงค่า
        const getValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        // 1. หา ID ของเอกสาร
        let requestId = getValue('edit-request-id');
        if (!requestId) requestId = sessionStorage.getItem('currentEditRequestId');
        
        // 2. ★★★ สำคัญ: ดึงข้อมูลเดิมจาก Cache มาเป็นฐานก่อน (กันข้อมูลหาย) ★★★
        // ตรวจ user cache ก่อน (window.userRequestsCache) แล้วค่อยดู admin cache
        let originalData = {};
        let _foundCached = null;
        if (window.userRequestsCache) {
            _foundCached = window.userRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
        }
        if (!_foundCached && typeof allRequestsCache !== 'undefined') {
            _foundCached = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
        }
        if (_foundCached) {
            // คัดลอกข้อมูลเดิมมาทั้งหมด (Clone)
            originalData = JSON.parse(JSON.stringify(_foundCached));
        }
        // ★ ถ้าไม่มี Cache ลอง fallback จาก window.originalRequestDataForEdit (ที่ populateEditForm เก็บไว้)
        if (!_foundCached && window.originalRequestDataForEdit) {
            originalData = JSON.parse(JSON.stringify(window.originalRequestDataForEdit));
        }

        // 3. ดึงข้อมูลใหม่จากหน้าจอ (เหมือนเดิม)
        const expenseItems = [];
        const expenseOption = document.querySelector('input[name="edit-expense_option"]:checked');
        if (expenseOption && expenseOption.value === 'partial') {
            document.querySelectorAll('input[name="edit-expense_item"]:checked').forEach(chk => {
                const item = { name: chk.dataset.itemName };
                if (item.name === 'ค่าใช้จ่ายอื่นๆ') { 
                    item.detail = getValue('edit-expense_other_text').trim(); 
                }
                expenseItems.push(item);
            });
        }

        const attendees = Array.from(document.querySelectorAll('#edit-attendees-list > div')).map(div => {
            const nameInput = div.querySelector('.attendee-name');
            const select = div.querySelector('.attendee-position-select');
            let position = select ? select.value : '';
            if (position === 'other') { 
                const otherInput = div.querySelector('.attendee-position-other'); 
                position = otherInput ? otherInput.value.trim() : ''; 
            }
            return { name: nameInput ? nameInput.value.trim() : '', position: position };
        }).filter(att => att.name && att.position);

        // 4. ผสานข้อมูล (เอาข้อมูลเดิมตั้ง + ทับด้วยข้อมูลใหม่)
        const formData = {
            ...originalData, // เอาข้อมูลเก่ามาวางก่อน (เช่น timestamp, status เดิม)
            
            // ข้อมูลที่แก้ไขได้ (จะทับข้อมูลเก่า)
            requestId: requestId,
            id: requestId, // ย้ำ ID อีกครั้ง
            draftId: getValue('edit-draft-id') || originalData.draftId|| "",
            username: user.username,
            
            docDate: getValue('edit-doc-date'),
            requesterName: getValue('edit-requester-name').trim(),
            requesterPosition: getValue('edit-requester-position').trim(),
            location: getValue('edit-location').trim(),
            province: getProvinceFieldValue('edit-province', 'edit-province-other'),
            purpose: getValue('edit-purpose').trim(),
            startDate: getValue('edit-start-date'),
            endDate: getValue('edit-end-date'),
            
            attendees: attendees, // รายชื่อผู้ร่วมเดินทางชุดใหม่
            
            expenseOption: expenseOption ? expenseOption.value : 'no',
            expenseItems: expenseItems,
            totalExpense: getValue('edit-total-expense') || 0,
            
            vehicleOption: document.querySelector('input[name="edit-vehicle_option"]:checked')?.value || 'gov',
            licensePlate: getValue('edit-license-plate').trim(),
            publicVehicleDetails: getValue('edit-public-vehicle-details').trim(), // แก้ ID ตามที่คุยกันก่อนหน้า
            
            department: getValue('edit-department'),
            headName: getValue('edit-head-name'),
            
            isEdit: true
        };

        console.log("✅ ข้อมูลสำหรับบันทึก (Merged):", formData);
        return formData;

    } catch (error) {
        console.error('Error in getEditFormData:', error);
        showAlert("พบข้อผิดพลาด", "อ่านข้อมูลไม่สำเร็จ: " + error.message); 
        return null;
    }
}
function validateEditForm(formData) {
    if (!formData.docDate || !formData.requesterName || !formData.location || !formData.purpose || !formData.startDate || !formData.endDate) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลที่จำเป็นให้ครบ"); return false;
    }
    const startDate = new Date(formData.startDate);
    const endDate = new Date(formData.endDate);
    if (startDate > endDate) { showAlert("ข้อมูลไม่ถูกต้อง", "วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด"); return false; }
    return true;
}

// --- Basic Form Functions ---

async function resetRequestForm() {
    document.getElementById('request-form').reset();
    document.getElementById('form-request-id').value = '';
    document.getElementById('form-attendees-list').innerHTML = '';
    if (document.getElementById('form-ts-itinerary-rows')) document.getElementById('form-ts-itinerary-rows').innerHTML = '';
    document.getElementById('form-travel-schedule-section')?.classList.add('hidden');
    document.getElementById('form-result').classList.add('hidden');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('form-doc-date').value = today;
    document.getElementById('form-start-date').value = today;
    document.getElementById('form-end-date').value = today;
    populateSignerPositionSelect('form-department');
    syncSignerHeadName('form-department', 'form-head-name');
}

function addAttendeeField() {
    const list = document.getElementById('form-attendees-list');
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
    attendeeDiv.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" required>
        <div class="attendee-position-wrapper md:col-span-1">
             <select class="form-input attendee-position-select">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other hidden mt-1" placeholder="ระบุตำแหน่ง">
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>
    `;
    list.appendChild(attendeeDiv);
    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');
    select.addEventListener('change', () => {
        otherInput.classList.toggle('hidden', select.value !== 'other');
        updateRequestFormTravelScheduleSection();
    });
    updateRequestFormTravelScheduleSection();
}

function toggleExpenseOptions() {
    // ดึง ID ของกล่องต่างๆ มาเก็บไว้ในตัวแปร
    const partialOptions = document.getElementById('partial-expense-options');
    const totalContainer = document.getElementById('total-expense-container');
    const attachmentContainer = document.getElementById('non-reimburse-attachments'); // เพิ่มตัวแปรสำหรับกล่องแนบไฟล์

    // ตรวจสอบว่าเลือก "ขอเบิก" อยู่หรือไม่
    const isPartial = document.getElementById('expense_partial').checked;

    if (isPartial) {
        // กรณี: เลือกขอเบิก
        partialOptions.classList.remove('hidden');     // แสดงรายการค่าใช้จ่าย
        totalContainer.classList.remove('hidden');     // แสดงช่องรวมเงิน
        if (attachmentContainer) {
            attachmentContainer.classList.add('hidden'); // ซ่อนกล่องแนบไฟล์
        }
    } else {
        // กรณี: เลือกไม่ขอเบิก
        partialOptions.classList.add('hidden');        // ซ่อนรายการค่าใช้จ่าย
        totalContainer.classList.add('hidden');        // ซ่อนช่องรวมเงิน
        if (attachmentContainer) {
            attachmentContainer.classList.remove('hidden'); // แสดงกล่องแนบไฟล์
        }
    }
}


function toggleVehicleDetails() {
    const privateDetails = document.getElementById('private-vehicle-details');
    const publicDetails = document.getElementById('public-vehicle-details');
    const privateCheckbox = document.querySelector('input[name="vehicle_option"][value="private"]');
    const publicCheckbox = document.querySelector('input[name="vehicle_option"][value="public"]');
    
    if (privateDetails) privateDetails.classList.toggle('hidden', !privateCheckbox?.checked);
    if (publicDetails) publicDetails.classList.toggle('hidden', !publicCheckbox?.checked);
}
/**
 * ฟังก์ชันดึงข้อมูลจากฟอร์มบันทึกข้อความ (Matching index.html IDs)
 */
function getRequestFormData() {
    // 1. ดึงรายชื่อผู้ร่วมเดินทางจากรายการที่เพิ่ม
    const attendees = [];
    document.querySelectorAll('#form-attendees-list > div').forEach(div => {
        const nameInput = div.querySelector('.attendee-name');
        const select = div.querySelector('.attendee-position-select');
        const otherInput = div.querySelector('.attendee-position-other');
        
        if (nameInput && nameInput.value.trim()) {
            let position = select ? select.value : '';
            if (position === 'other' && otherInput) {
                position = otherInput.value.trim();
            }
            // เพิ่มเฉพาะคนที่มีทั้งชื่อและตำแหน่ง
            if (nameInput.value.trim()) {
                attendees.push({ name: nameInput.value.trim(), position: position });
            }
        }
    });

    // 2. จัดการข้อมูลค่าใช้จ่าย
    const expenseOption = document.querySelector('input[name="expense_option"]:checked')?.value || 'no';
    let expenseItems = [];
    
    if (expenseOption === 'partial') {
        document.querySelectorAll('input[name="expense_item"]:checked').forEach(cb => {
            let item = { name: cb.getAttribute('data-item-name') || cb.value };
            // กรณีเลือก "ค่าใช้จ่ายอื่นๆ" ให้ดึงรายละเอียด text box มาด้วย
            if (item.name === 'ค่าใช้จ่ายอื่นๆ') {
                const otherText = document.getElementById('expense_other_text')?.value.trim();
                item.detail = otherText;
            }
            expenseItems.push(item);
        });
    }

    // 3. จัดการข้อมูลพาหนะ (เลือกได้หลายตัว แต่ในโค้ดเดิมรองรับตัวเดียว ให้เอาตัวแรกที่เลือก หรือ logic ตามต้องการ)
    // หมายเหตุ: ใน HTML เป็น checkbox name="vehicle_option" อาจเลือกได้หลายตัว แต่ API มักรับค่าเดียว
    // ปรับให้ดึงตัวล่าสุดหรือตัวที่ check
    const vehicleChecked = document.querySelector('input[name="vehicle_option"]:checked');
    const vehicleOption = vehicleChecked ? vehicleChecked.value : 'gov';
    // --- ส่วนที่เพิ่ม: จัดการจังหวัด ---
    let province = getProvinceFieldValue('form-province', 'form-province-other');

    const travelSchedule = collectFormTravelSchedule('form');

    // 4. รวบรวมข้อมูลทั้งหมดเป็น Object
    return {
        docDate: document.getElementById('form-doc-date')?.value || '',
        requesterName: document.getElementById('form-requester-name')?.value.trim(),
        requesterPosition: document.getElementById('form-requester-position')?.value.trim(),
        location: document.getElementById('form-location')?.value.trim(),
       // เพิ่มฟิลด์จังหวัดและที่พัก
        province,
        stayAt: document.getElementById('form-stay-at')?.value.trim(),
        // ข้อมูลยานพาหนะ (สำหรับหนังสือส่ง) - เพิ่มใหม่
        dispatchVehicleType: document.getElementById('form-dispatch-vehicle-type')?.value.trim(),
        dispatchVehicleId: document.getElementById('form-dispatch-vehicle-id')?.value.trim(),

        purpose: document.getElementById('form-purpose')?.value.trim(),
        startDate: document.getElementById('form-start-date')?.value,
        endDate: document.getElementById('form-end-date')?.value,
        
        // เพิ่มเวลา (ถ้ามีใน HTML แล้ว)
        startTime: document.getElementById('form-start-time')?.value || '06:00',
        endTime: document.getElementById('form-end-time')?.value || '18:00',
        
        attendees: attendees,
        
        expenseOption: expenseOption,
        expenseItems: expenseItems,
        totalExpense: document.getElementById('form-total-expense')?.value || 0,
        
        
        vehicleOption: document.querySelector('input[name="vehicle_option"]:checked')?.value || 'gov',
        licensePlate: document.getElementById('form-license-plate')?.value || '',
        publicVehicleDetails: document.getElementById('public-vehicle-details-input')?.value || '', 
        
        department: document.getElementById('form-department')?.value,
        headName: document.getElementById('form-head-name')?.value,
        travelSchedule: travelSchedule || null,
        travelScheduleStatus: travelSchedule ? 'draft' : ''
    };
}

// =========================================================
// ฟังก์ชันช่วยเหลือ: แสดงหน้าต่างให้ผู้ใช้จิ้มลายเซ็นบน PDF
// =========================================================
// =========================================================
// ฟังก์ชันช่วยเหลือ: แสดงหน้าต่างให้ผู้ใช้ลากวางและปรับขนาดลายเซ็นบน PDF
// =========================================================
function promptForSignature(pdfBlob, signatureBase64) {
    return new Promise(async (resolve, reject) => {
        const RENDER_SCALE = 1.5; 
        
        let onDragMove, onDragEnd, onResizeMove, onResizeEnd;

        // ── helper: ปิด modal + ล้าง state ─────────────────────────────
        const cleanup = () => {
            window.cancelSignaturePlacement = null;
            window.skipSignaturePlacement = null;
            const modal = document.getElementById('requester-stamper-modal');
            if (modal) modal.style.display = 'none';
            const pages = document.getElementById('requester-pdf-pages');
            if (pages) pages.innerHTML = '';
            
            // ลบปุ่มยืนยันที่สร้างขึ้นมาใหม่ (ถ้ามี)
            const confirmBtn = document.getElementById('req-confirm-sig-btn');
            if (confirmBtn) confirmBtn.remove();
            
            if (onDragMove) {
                document.removeEventListener('mousemove', onDragMove);
                document.removeEventListener('touchmove', onDragMove);
            }
            if (onDragEnd) {
                document.removeEventListener('mouseup', onDragEnd);
                document.removeEventListener('touchend', onDragEnd);
            }
            if (onResizeMove) {
                document.removeEventListener('mousemove', onResizeMove);
                document.removeEventListener('touchmove', onResizeMove);
            }
            if (onResizeEnd) {
                document.removeEventListener('mouseup', onResizeEnd);
                document.removeEventListener('touchend', onResizeEnd);
            }
        };

        window.cancelSignaturePlacement = () => { cleanup(); reject(new Error('USER_CANCEL')); };
        window.skipSignaturePlacement = () => { cleanup(); resolve(pdfBlob); };

        try {
            const placementSignatureBase64 = (typeof optimizeSignatureDataURL === 'function')
                ? await optimizeSignatureDataURL(signatureBase64, { targetHeight: 340 })
                : signatureBase64;
            const modal = document.getElementById('requester-stamper-modal');
            modal.classList.remove('hidden');
            modal.style.display = 'flex';

            // ── 1. ปรับเปลี่ยนข้อความแนะนำ และสร้างปุ่มยืนยัน ───────────────
            const instructionSpan = modal.querySelector('.bg-yellow-100 span');
            const originalInstruction = instructionSpan.innerHTML;
            instructionSpan.innerHTML = 'เลื่อนดูเอกสาร <b>ลากลายเซ็น</b> ไปวางตรงจุดที่ต้องการ <b>ปรับขนาดได้ที่มุมขวาล่าง</b> และกด <b>✅ ยืนยัน</b>';

            const btnContainer = modal.querySelector('.bg-yellow-100 .flex.gap-2');
            let confirmBtn = document.getElementById('req-confirm-sig-btn');
            if (!confirmBtn) {
                confirmBtn = document.createElement('button');
                confirmBtn.id = 'req-confirm-sig-btn';
                confirmBtn.className = 'px-4 py-1 bg-green-600 text-white rounded-lg text-xs font-bold shadow hover:bg-green-700 whitespace-nowrap transition-transform hover:scale-105';
                confirmBtn.innerHTML = '✅ ยืนยันตำแหน่งลายเซ็น';
                // แทรกปุ่มไว้หน้าสุด
                btnContainer.insertBefore(confirmBtn, btnContainer.firstChild);
            }

            const pagesContainer = document.getElementById('requester-pdf-pages');
            pagesContainer.innerHTML = '<p class="py-8 text-gray-500 text-sm animate-pulse">⏳ กำลังโหลดเอกสาร...</p>';
            pagesContainer.style.position = 'relative'; // สำคัญสำหรับให้ลายเซ็นอ้างอิงตำแหน่ง

            // โหลด PDF ด้วย pdfjs
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const numPages = pdf.numPages;

            pagesContainer.innerHTML = ''; 
            const canvases = []; // เก็บ canvas ทุกหน้าไว้คำนวณว่าลายเซ็นตกอยู่หน้าไหน

            // ── วนแสดงทุกหน้า ────────────────────────────────────────
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const wrapper = document.createElement('div');
                wrapper.style.position = 'relative';
                wrapper.style.marginBottom = '20px';

                const label = document.createElement('div');
                label.className = 'text-xs text-gray-500 font-medium self-start mb-1 ml-2';
                label.textContent = `หน้า ${pageNum} / ${numPages}`;
                wrapper.appendChild(label);

                const canvas = document.createElement('canvas');
                canvas.className = 'border border-gray-300 shadow bg-white block';
                canvas.style.maxWidth = '100%';     
                canvas.style.height = 'auto';        
                canvas.dataset.pageNum = String(pageNum);
                wrapper.appendChild(canvas);
                pagesContainer.appendChild(wrapper);
                canvases.push(canvas);

                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: RENDER_SCALE });
                canvas.width  = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            }

            // ── 2. สร้าง Element ลายเซ็นที่ลากและย่อขยายได้ (Drag & Drop) ──
            const dragEl = document.createElement('div');
            dragEl.style.cssText = `
                position: absolute;
                left: 50%;
                top: 150px;
                transform: translateX(-50%);
                width: 150px;
                cursor: grab;
                z-index: 50;
                border: 2px dashed #3b82f6;
                border-radius: 4px;
                background: rgba(255,255,255,0.7);
                touch-action: none;
                user-select: none;
            `;
            dragEl.innerHTML = `
                <img src="${placementSignatureBase64}" style="width:100%; display:block; pointer-events:none;">
                <div class="sig-resize-handle"
                    style="position:absolute; bottom:-7px; right:-7px; width:20px; height:20px; background:#3b82f6; border-radius:4px; cursor:nwse-resize; z-index:51; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.4);" title="ลากเพื่อย่อ/ขยาย">
                    <svg width="12" height="12" viewBox="0 0 10 10" style="pointer-events:none;">
                        <line x1="2" y1="9" x2="9" y2="2" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                        <line x1="5" y1="9" x2="9" y2="5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
            `;
            pagesContainer.appendChild(dragEl);

            // --- ฟังก์ชันลาก (Drag) ---
            let startX, startY, startLeft, startTop;
            const onDragStart = (e) => {
                if (e.target.closest('.sig-resize-handle')) return; 
                e.preventDefault();
                const pt = e.touches ? e.touches[0] : e;
                startX = pt.clientX;
                startY = pt.clientY;
                // ลบ transform เดิมออกก่อนคำนวณเพื่อให้ลากได้อิสระ
                if (dragEl.style.transform) {
                    const rect = dragEl.getBoundingClientRect();
                    const parentRect = pagesContainer.getBoundingClientRect();
                    dragEl.style.transform = 'none';
                    dragEl.style.left = (rect.left - parentRect.left + pagesContainer.scrollLeft) + 'px';
                    dragEl.style.top = (rect.top - parentRect.top + pagesContainer.scrollTop) + 'px';
                }
                startLeft = parseFloat(dragEl.style.left) || 0;
                startTop = parseFloat(dragEl.style.top) || 0;
                dragEl.style.cursor = 'grabbing';
                
                document.addEventListener('mousemove', onDragMove);
                document.addEventListener('mouseup', onDragEnd);
                document.addEventListener('touchmove', onDragMove, { passive: false });
                document.addEventListener('touchend', onDragEnd);
            };
            
            onDragMove = (e) => {
                e.preventDefault();
                const pt = e.touches ? e.touches[0] : e;
                dragEl.style.left = `${startLeft + (pt.clientX - startX)}px`;
                dragEl.style.top = `${startTop + (pt.clientY - startY)}px`;
            };
            
            onDragEnd = () => {
                dragEl.style.cursor = 'grab';
                document.removeEventListener('mousemove', onDragMove);
                document.removeEventListener('mouseup', onDragEnd);
                document.removeEventListener('touchmove', onDragMove);
                document.removeEventListener('touchend', onDragEnd);
            };
            
            dragEl.addEventListener('mousedown', onDragStart);
            dragEl.addEventListener('touchstart', onDragStart, { passive: false });

            // --- ฟังก์ชันย่อ/ขยาย (Resize) ---
            const handle = dragEl.querySelector('.sig-resize-handle');
            let startRX, startRW;
            const onResizeStart = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const pt = e.touches ? e.touches[0] : e;
                startRX = pt.clientX;
                startRW = dragEl.offsetWidth;
                document.addEventListener('mousemove', onResizeMove);
                document.addEventListener('mouseup', onResizeEnd);
                document.addEventListener('touchmove', onResizeMove, { passive: false });
                document.addEventListener('touchend', onResizeEnd);
            };
            
            onResizeMove = (e) => {
                e.preventDefault();
                const pt = e.touches ? e.touches[0] : e;
                const newW = Math.max(50, startRW + (pt.clientX - startRX)); // กว้างต่ำสุด 50px
                dragEl.style.width = `${newW}px`;
            };
            
            onResizeEnd = () => {
                document.removeEventListener('mousemove', onResizeMove);
                document.removeEventListener('mouseup', onResizeEnd);
                document.removeEventListener('touchmove', onResizeMove);
                document.removeEventListener('touchend', onResizeEnd);
            };
            
            handle.addEventListener('mousedown', onResizeStart);
            handle.addEventListener('touchstart', onResizeStart, { passive: false });

            // ── 3. เมื่อกดยืนยัน คำนวณตำแหน่งและประทับลายเซ็น ──────────────
            confirmBtn.onclick = async () => {
                try {
                    instructionSpan.innerHTML = originalInstruction; // คืนค่าข้อความเดิม
                    const dragRect = dragEl.getBoundingClientRect();
                    
                    // หาว่าลายเซ็นวางอยู่บนหน้าจอ (Canvas) ของกระดาษแผ่นไหนมากที่สุด
                    let targetCanvas = null;
                    let maxArea = 0;
                    
                    for (const canvas of canvases) {
                        const canvasRect = canvas.getBoundingClientRect();
                        // คำนวณพื้นที่ทับซ้อน (Intersection Area)
                        const overlapX = Math.max(0, Math.min(dragRect.right, canvasRect.right) - Math.max(dragRect.left, canvasRect.left));
                        const overlapY = Math.max(0, Math.min(dragRect.bottom, canvasRect.bottom) - Math.max(dragRect.top, canvasRect.top));
                        const area = overlapX * overlapY;
                        
                        if (area > maxArea) {
                            maxArea = area;
                            targetCanvas = canvas;
                        }
                    }

                    if (!targetCanvas || maxArea === 0) {
                        alert('⚠️ กรุณาลากลายเซ็นให้วางอยู่บนหน้ากระดาษ PDF');
                        return;
                    }

                    // ป้องกันการกดซ้ำระหว่างประมวลผล
                    confirmBtn.innerHTML = '<span class="loader-sm border-white"></span> กำลังประทับตรา...';
                    confirmBtn.disabled = true;

                    const canvasRect = targetCanvas.getBoundingClientRect();
                    
                    // แปลงพิกัดจาก CSS (หน้าจอ) -> สัดส่วนของ PDF ต้นฉบับ
                    const cssX = dragRect.left - canvasRect.left;
                    const cssY = dragRect.top - canvasRect.top;
                    const cssW = dragRect.width;
                    const cssH = dragRect.height;

                    const ratioX = targetCanvas.width / canvasRect.width;
                    const ratioY = targetCanvas.height / canvasRect.height;

                    const nativeX = cssX * ratioX;
                    const nativeY = cssY * ratioY;
                    const nativeW = cssW * ratioX;
                    const nativeH = cssH * ratioY;

                    const pdfX = nativeX / RENDER_SCALE;
                    const pdfW = nativeW / RENDER_SCALE;
                    const pdfH = nativeH / RENDER_SCALE;
                    
                    // PDF-lib นับแกน Y จากด้านล่างขึ้นบน จึงต้องเอาความสูงกระดาษมาลบ
                    const pdfTotalH = targetCanvas.height / RENDER_SCALE;
                    const pdfY = pdfTotalH - (nativeY / RENDER_SCALE) - pdfH;

                    const pageIndex = parseInt(targetCanvas.dataset.pageNum, 10) - 1;

                    // เอา UI ออก
                    cleanup();

                    // ประทับลายเซ็นด้วย pdf-lib
                    const pdfBytes  = await pdfBlob.arrayBuffer();
                    const pdfDoc    = await PDFLib.PDFDocument.load(pdfBytes);
                    const pdfPage   = pdfDoc.getPages()[pageIndex];

                    const base64Data = placementSignatureBase64.replace(/^data:image\/\w+;base64,/, '');
                    const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                    const sigImage   = await pdfDoc.embedPng(imageBytes);

                    pdfPage.drawImage(sigImage, {
                        x: pdfX,
                        y: pdfY,
                        width: pdfW,
                        height: pdfH
                    });

                    const modifiedBytes = await pdfDoc.save();
                    resolve(new Blob([modifiedBytes], { type: 'application/pdf' }));
                } catch (err) {
                    reject(err);
                }
            };

        } catch (err) {
            cleanup();
            reject(err);
        }
    });
}

// =========================================================
// ฟังก์ชันหลัก: ส่งคำขอไปราชการ (รองรับ Create, Edit, Tap-to-Sign)
// =========================================================
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function handleRequestFormSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-request-button');
    const setBtnStatus = (msg) => {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="loader-sm"></span> ${msg}`;
        }
    };

    try {
        const formData = getRequestFormData();
        if (!validateRequestForm(formData)) {
            // validateRequestForm แสดง showAlert เฉพาะเจาะจงแล้ว — คืนค่าโดยไม่ throw
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = 'ส่งบันทึกขอไปราชการ'; }
            return;
        }

        const user = getCurrentUser();
        if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน (กรุณา Login ใหม่)");
        formData.username = user.username; 

        // --- เพิ่มเติม: ตรวจสอบว่าเป็นโหมดแก้ไข (Edit) หรือสร้างใหม่ (Create) ---
        const editRequestId = document.getElementById('form-request-id')?.value
            || document.getElementById('request-id')?.value;
        const isEdit = editRequestId ? true : false;
        let realId = editRequestId; // ถ้าเป็นการแก้ ให้ใช้ ID เดิมเลย

        // --- เพิ่มเติม: ดึงข้อมูลลายเซ็นจากกระดาน ---
        let signatureBase64 = null;
        if (typeof requesterSignaturePad !== 'undefined' && !requesterSignaturePad.isEmpty()) {
            const rawSignatureBase64 = requesterSignaturePad.toDataURL("image/png");
            signatureBase64 = (typeof optimizeSignatureDataURL === 'function')
                ? await optimizeSignatureDataURL(rawSignatureBase64, { targetHeight: 340 })
                : rawSignatureBase64;
        }
        formData.signatureBase64 = signatureBase64;

        const targetDocStatus = mapDepartmentToStatus(formData.department);
        formData.status = 'Pending'; 
        formData.docStatus = targetDocStatus; 

        // --- Step 1: ขอเลขที่เอกสารจาก GAS (สร้าง record เบื้องต้นใน Sheets) ---
        if (!isEdit) {
            setBtnStatus('กำลังขอเลขที่เอกสาร...');
            const createPayload = { ...formData, preGeneratedPdfUrl: 'SKIP_GENERATION' };
            const createResult = await apiCall('POST', 'createRequest', createPayload);
            if (createResult.status !== 'success') throw new Error(createResult.message || "ไม่สามารถขอเลขที่เอกสารได้");
            realId = createResult.id || createResult.data?.id;
            if (!realId) throw new Error("ระบบไม่ส่งเลขที่เอกสารกลับมา");
            console.log("✅ ได้รับเลขที่เอกสาร (GAS):", realId);
        }

        // --- Step 2: สร้าง PDF จาก Cloud Run ---
        setBtnStatus('กำลังสร้างไฟล์ PDF...');
        const pdfData = { ...formData, id: realId, requestId: realId, docType: 'memo' };
        
        // รับ PDF ต้นฉบับมาจาก Cloud Run
        let { pdfBlob } = await generateOfficialPDF(pdfData);

        // --- Step 2.5: ประทับลายเซ็น (Tap-to-Sign) ---
        if (signatureBase64) {
            setBtnStatus('รอการประทับลายเซ็น...');
            document.getElementById('alert-modal').style.display = 'none'; // ซ่อนโหลดดิ้งชั่วคราว
            
            // เรียก Modal ขึ้นมาและหยุดรอ (await) จนกว่าผู้ใช้จะจิ้มหน้าจอเสร็จ
            pdfBlob = await promptForSignature(pdfBlob, signatureBase64);
            
            // จิ้มเสร็จแล้ว แสดงโหลดดิ้งต่อ
            showAlert('กำลังดำเนินการ', 'กำลังบันทึกข้อมูล... กรุณารอสักครู่', false);
        }

        // --- Step 3: อัปโหลด PDF ไป Firebase Storage (ไม่ต้องพึ่ง DriveApp) ---
        setBtnStatus('กำลังบันทึกไฟล์...');
        const safeIdForFile = realId.replace(/[\/\\\:\.\s]/g, '-');
        const safeFilename = `memo_${safeIdForFile}_${Date.now()}.pdf`;
        let finalFileUrl = '';

        finalFileUrl = await uploadPdfToFirebaseStorage(pdfBlob, user.username, safeFilename);
        console.log('✅ PDF uploaded to Firebase Storage:', finalFileUrl);

        // --- Step 4: อัปเดต URL ไฟล์ PDF ลงใน Google Sheets ---
        setBtnStatus('กำลังปรับปรุงฐานข้อมูล...');
        const gasPayload = {
            ...formData,
            requestId: realId,
            pdfUrl:     finalFileUrl,
            fileUrl:    finalFileUrl,
            memoPdfUrl: finalFileUrl,
        };
        const saveResult = await apiCall('POST', 'updateRequest', gasPayload);
        if (saveResult.status !== 'success') {
            console.warn('⚠️ GAS updateRequest warning:', saveResult.message);
        } else {
            console.log('✅ Updated GAS Sheets:', realId);
        }

        document.getElementById('alert-modal').style.display = 'none';

        resetRequestForm();
        if (typeof requesterSignaturePad !== 'undefined' && requesterSignaturePad) requesterSignaturePad.clear();

        if (typeof clearRequestsCache === 'function') clearRequestsCache();
        await fetchUserRequests();

        // แสดงหน้าผลลัพธ์เพื่อให้ผู้ใช้สามารถลงนามหลังสร้างเอกสาร
        const resultTitle = isEdit ? 'แก้ไขเอกสารเรียบร้อย' : 'สร้างเอกสารเรียบร้อย';
        const resultMessage = `เลขที่เอกสาร: ${realId}`;
        if (typeof showFormResult === 'function') {
            showFormResult(resultTitle, resultMessage, finalFileUrl, realId);
        } else {
            if (finalFileUrl) openUrlWithDownloadIndicator(finalFileUrl, 'กำลังเปิดไฟล์เอกสาร...');
            showAlert("สำเร็จ", isEdit ? `แก้ไขเอกสารเลขที่ ${realId} เรียบร้อยแล้ว` : `สร้างเอกสารเลขที่ ${realId} เรียบร้อยแล้ว`);
            switchPage('dashboard-page');
        }

    } catch (error) {
        console.error("Submit Error:", error);
        document.getElementById('alert-modal').style.display = 'none';
        showAlert("ข้อผิดพลาด", error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'ส่งบันทึกขอไปราชการ';
        }
    }
}



function tryAutoFillRequester(retry = 0) {
    const nameInput = document.getElementById('form-requester-name');
    const posInput = document.getElementById('form-requester-position');
    const dateInput = document.getElementById('form-doc-date');
    if (!nameInput || !posInput) {
        if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 500);
        return;
    }
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
    let user = window.currentUser;
    if (!user) {
        const storedUser = sessionStorage.getItem('currentUser');
        if (storedUser) { try { user = JSON.parse(storedUser); window.currentUser = user; } catch (err) {} }
    }
    if (user) { nameInput.value = user.fullName || ''; posInput.value = user.position || ''; }
    else if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 1000);
}



// Public Data
async function loadPublicWeeklyData() {
    try {
        let requests = [];
        let usedOptimizedEndpoint = false;

        try {
            const requestsResult = await apiCall('GET', 'getPublicWeeklySnapshot');
            if (requestsResult.status === 'success' && Array.isArray(requestsResult.data)) {
                requests = requestsResult.data;
                usedOptimizedEndpoint = true;
            }
        } catch (_) {}

        if (!usedOptimizedEndpoint) {
            const [requestsResult, memosResult] = await Promise.all([apiCall('GET', 'getAllRequests'), apiCall('GET', 'getAllMemos')]);
            if (requestsResult.status !== 'success') {
                throw new Error('ไม่สามารถโหลดข้อมูลได้');
            }
            const memos = memosResult.status === 'success' ? memosResult.data : [];
            requests = requestsResult.data.map(req => {
                const relatedMemo = memos.find(m => m.refNumber === req.id);
                return { ...req, completedCommandUrl: relatedMemo ? relatedMemo.completedCommandUrl : null, realStatus: relatedMemo ? relatedMemo.status : req.status };
            });
        }
        currentPublicWeeklyData = requests;
        renderPublicTable(requests);
    } catch (error) { document.getElementById('public-weekly-list').innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">ไม่พบข้อมูล</td></tr>`; }
}

function renderPublicTable(requests) {
    const tbody = document.getElementById('public-weekly-list');
    tbody.parentElement.classList.add('responsive-table');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday); 
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); 
    sunday.setHours(23, 59, 59, 999);
    
    const dateOptions = { day: 'numeric', month: 'short', year: '2-digit' };
    document.getElementById('current-week-display').textContent = `${monday.toLocaleDateString('th-TH', dateOptions)} - ${sunday.toLocaleDateString('th-TH', dateOptions)}`;
    
    const weeklyRequests = requests.filter(req => {
        if (!req.startDate || !req.endDate) return false;
        const reqStart = new Date(req.startDate); 
        const reqEnd = new Date(req.endDate);
        reqStart.setHours(0,0,0,0); 
        reqEnd.setHours(0,0,0,0);
        return (reqStart <= sunday && reqEnd >= monday);
    }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    currentPublicWeeklyData = weeklyRequests;
    
    if (weeklyRequests.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-500">ไม่มีรายการไปราชการในสัปดาห์นี้</td></tr>`; 
        return; 
    }
    
    tbody.innerHTML = weeklyRequests.map((req, index) => {
        // --- ส่วนที่แก้ไข: ตรรกะการนับจำนวนคนรวม ---
        let attendeesList = [];
        try {
            attendeesList = typeof req.attendees === 'string' ? JSON.parse(req.attendees) : (req.attendees || []);
        } catch (e) { 
            attendeesList = []; 
        }

        const requesterName = (req.requesterName || "").trim().replace(/\s+/g, ' ');
        // เช็คว่าใน Array รายชื่อมีชื่อผู้ขอรวมอยู่ด้วยหรือยัง
        const hasRequesterInList = attendeesList.some(att => (att.name || "").trim().replace(/\s+/g, ' ') === requesterName);
        
        // คำนวณจำนวนคนจริง (ถ้ามีชื่อผู้ขอในลิสต์แล้ว ไม่ต้อง +1 เพิ่ม)
        const totalCount = (attendeesList.length > 0) ? (hasRequesterInList ? attendeesList.length : attendeesList.length + 1) : (req.attendeeCount ? (parseInt(req.attendeeCount) + 1) : 1);
        
        let attendeesText = "";
        if (totalCount > 1) { 
            attendeesText = `<div class="text-xs text-indigo-500 mt-1 cursor-pointer hover:underline" onclick="openPublicAttendeeModal(${index})">👥 และคณะรวม ${totalCount} คน</div>`; 
        }
        
        const dateText = `${formatDisplayDate(req.startDate)} - ${formatDisplayDate(req.endDate)}`;
        
        const finalCommandUrl = req.completedCommandUrl; 
        let actionHtml = '';
        
        if (finalCommandUrl && finalCommandUrl.trim() !== "") {
            actionHtml = `<a href="${sanitizeUrl(finalCommandUrl)}" target="_blank" class="btn bg-green-600 hover:bg-green-700 text-white btn-sm shadow-md transition-transform hover:scale-105 inline-flex items-center gap-1">ดูคำสั่ง</a>`;
        } else {
            let displayStatus = req.realStatus || req.status;
            let badgeClass = 'bg-gray-100 text-gray-600'; 
            let icon = '🔄';
            
            if (displayStatus === 'Pending' || displayStatus === 'กำลังดำเนินการ') { 
                badgeClass = 'bg-yellow-100 text-yellow-700 border border-yellow-200'; icon = '⏳'; 
            } else if (displayStatus && displayStatus.includes('แก้ไข')) { 
                badgeClass = 'bg-red-100 text-red-700 border border-red-200'; icon = '⚠️'; 
            } else if (displayStatus === 'เสร็จสิ้นรอออกคำสั่งไปราชการ') { 
                badgeClass = 'bg-blue-50 text-blue-600 border border-blue-100'; icon = '📝'; displayStatus = 'รอออกคำสั่ง'; 
            } else if (displayStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayStatus === 'เสร็จสิ้น') { 
                badgeClass = 'bg-green-100 text-green-700 border border-green-200'; icon = '✅'; displayStatus = 'เสร็จสิ้น'; 
            }
            actionHtml = `<span class="${badgeClass} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap">${icon} ${translateStatus(displayStatus)}</span>`;
        }
        
        return `
        <tr class="border-b hover:bg-gray-50 transition">
            <td class="px-6 py-4 whitespace-nowrap font-medium text-indigo-600" data-label="วัน-เวลา">${dateText}</td>
            <td class="px-6 py-4" data-label="ชื่อผู้ขอ">
                <div class="font-bold text-gray-800">${escapeHtml(req.requesterName)}</div>
                <div class="text-xs text-gray-500">${escapeHtml(req.requesterPosition || '')}</div>
            </td>
            <td class="px-6 py-4" data-label="เรื่อง / สถานที่">
                <div class="font-medium text-gray-900 truncate max-w-xs" title="${escapeHtml(req.purpose)}">${escapeHtml(req.purpose)}</div>
                <div class="text-xs text-gray-500">ณ ${escapeHtml(req.location)}</div>
                ${attendeesText}
            </td>
            <td class="px-6 py-4 text-center align-middle" data-label="ไฟล์คำสั่ง">${actionHtml}</td>
        </tr>`;
    }).join('');
}

function openPublicAttendeeModal(index) {
    const req = currentPublicWeeklyData[index]; 
    if (!req) return;

    document.getElementById('public-modal-purpose').textContent = req.purpose;
    document.getElementById('public-modal-location').textContent = req.location;
    
    const startD = new Date(req.startDate); 
    const endD = new Date(req.endDate);
    let dateText = formatDisplayDate(req.startDate); 
    if (startD.getTime() !== endD.getTime()) { 
        dateText += ` ถึง ${formatDisplayDate(req.endDate)}`; 
    }
    document.getElementById('public-modal-date').textContent = dateText;
    
    const listBody = document.getElementById('public-modal-attendee-list');
    let html = ''; 
    let rowCount = 1;

    // --- ส่วนที่แก้ไข: จัดการรายชื่อเพื่อไม่ให้ผู้ขอซ้ำ ---
    const requesterName = (req.requesterName || "").trim().replace(/\s+/g, ' ');
    const requesterPos = (req.requesterPosition || "").trim();

    let attendeesList = [];
    if (typeof req.attendees === 'string') { 
        try { attendeesList = JSON.parse(req.attendees); } catch (e) { attendeesList = []; } 
    } else if (Array.isArray(req.attendees)) { 
        attendeesList = req.attendees; 
    }

    // กรองลิสต์คนอื่นๆ โดยเอาชื่อผู้ขอออก (ถ้ามี) เพื่อนำไปวางต่อท้ายลำดับที่ 1
    const others = attendeesList.filter(att => {
        const attName = (att.name || "").trim().replace(/\s+/g, ' ');
        return attName !== "" && attName !== requesterName;
    });

    // 1. แสดงผู้ขอเป็นลำดับแรกเสมอ (ลำดับที่ 1)
    html += `
        <tr class="bg-blue-50/50">
            <td class="px-4 py-2 font-bold text-center">${rowCount++}</td>
            <td class="px-4 py-2 font-bold text-blue-800">${escapeHtml(requesterName)} (ผู้ขอ)</td>
            <td class="px-4 py-2 text-gray-600">${escapeHtml(requesterPos)}</td>
        </tr>`;

    // 2. แสดงผู้ร่วมเดินทางคนอื่นๆ ต่อจากผู้ขอ
    if (others.length > 0) {
        others.forEach(att => { 
            html += `
                <tr class="border-t">
                    <td class="px-4 py-2 text-center text-gray-500">${rowCount++}</td>
                    <td class="px-4 py-2 text-gray-800">${escapeHtml(att.name)}</td>
                    <td class="px-4 py-2 text-gray-600">${escapeHtml(att.position)}</td>
                </tr>`; 
        }); 
    }
    
    listBody.innerHTML = html;
    document.getElementById('public-attendee-modal').style.display = 'flex';
}
// --- [NEW] NOTIFICATION SYSTEM ---

function updateNotifications(requests, memos) {
    const badge = document.getElementById('notification-badge');
    const countText = document.getElementById('notification-count-text');
    const listContainer = document.getElementById('notification-list');
    
    if (!badge || !listContainer) return;

    // 1. กรองรายการที่ "สร้าง PDF แล้ว" แต่ "ยังไม่มีไฟล์สมบูรณ์" หรือ "ต้องแก้ไข"
    const pendingItems = requests.filter(req => {
        // ต้องมีเลขที่เอกสาร หรือสร้าง PDF แล้ว
        const hasCreated = req.pdfUrl && req.pdfUrl !== '';
        
        // เช็คสถานะจาก Memo (ถ้ามี)
        const relatedMemo = memos.find(m => m.refNumber === req.id);
        const isCompleted = relatedMemo && (relatedMemo.status === 'เสร็จสิ้น' || relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน');
        const isFixing = relatedMemo && relatedMemo.status === 'นำกลับไปแก้ไข';
        
        // เงื่อนไข: สร้างแล้ว แต่ยังไม่เสร็จ (หรือต้องแก้)
        return hasCreated && (!isCompleted || isFixing);
    });

    const count = pendingItems.length;

    // 2. อัปเดต Badge (จุดแดง)
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
        badge.classList.add('animate-bounce'); // เพิ่ม Effect เด้งดึ๋ง
        setTimeout(() => badge.classList.remove('animate-bounce'), 1000);
    } else {
        badge.classList.add('hidden');
    }
    
    if (countText) countText.textContent = `${count} รายการ`;

    // 3. สร้างรายการใน Dropdown
    if (count === 0) {
        listContainer.innerHTML = `<div class="p-8 text-center text-gray-400 flex flex-col items-center"><svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>ส่งครบทุกรายการแล้ว</div>`;
    } else {
        listContainer.innerHTML = pendingItems.map(req => {
            const isFix = req.status === 'นำกลับไปแก้ไข' || (memos.find(m => m.refNumber === req.id)?.status === 'นำกลับไปแก้ไข');
            const statusBadge = isFix 
                ? `<span class="text-xs bg-red-100 text-red-600 px-1.5 rounded">แก้</span>` 
                : `<span class="text-xs bg-yellow-100 text-yellow-600 px-1.5 rounded">รอส่ง</span>`;
            
            return `
            <div onclick="openSendMemoFromNotif('${req.id}')" class="p-3 hover:bg-blue-50 cursor-pointer transition flex justify-between items-start group">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-sm text-indigo-700">${escapeHtml(req.id || 'รอเลข')}</span>
                        ${statusBadge}
                    </div>
                    <p class="text-xs text-gray-500 line-clamp-1">${escapeHtml(req.purpose)}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">${formatDisplayDate(req.startDate)}</p>
                </div>
                <div class="text-indigo-500 opacity-0 group-hover:opacity-100 transition transform group-hover:translate-x-1">
                    ➤
                </div>
            </div>
            `;
        }).join('');
    }
}

// ฟังก์ชันเปิด Modal ส่งงานเมื่อคลิกจากรายการแจ้งเตือน (ใช้ openSendMemoFromList แทน)
function openSendMemoFromNotif(requestId) {
    openSendMemoFromList(requestId);
}


// ฟังก์ชันบันทึกการแก้ไข (พร้อม Backup ลง Firebase เพื่อกันข้อมูลรายชื่อหาย)
// ==========================================
// 📦 ส่วนจัดการไฟล์แนบในหน้าแก้ไข (Edit Page Attachments)
// ==========================================

// 1. ประกาศตัวแปร Global ไว้เก็บรายการไฟล์ปัจจุบัน
let currentEditAttachments = [];

// 2. ฟังก์ชันแสดงรายการไฟล์ (Render UI)
function renderEditAttachments() {
    const container = document.getElementById('edit-existing-attachments-container');
    const list = document.getElementById('edit-existing-attachments-list');
    
    if (!container || !list) return;

    list.innerHTML = ''; // ล้างรายการเก่า

    if (currentEditAttachments && currentEditAttachments.length > 0) {
        container.classList.remove('hidden');
        
        currentEditAttachments.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-white p-3 rounded border border-gray-200 shadow-sm mb-2';
            
            // ตรวจสอบชื่อไฟล์และลิงก์
            const fileName = file.name || file.filename || 'เอกสารแนบ';
            const fileUrl = file.url || file.link || '#';

            item.innerHTML = `
                <div class="flex items-center overflow-hidden">
                    <span class="text-red-500 mr-3 text-xl">📄</span>
                    <div class="flex flex-col">
                        <a href="${fileUrl}" target="_blank" class="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline truncate max-w-[200px] sm:max-w-xs">
                            ${fileName}
                        </a>
                        <span class="text-xs text-gray-400">${file.type || 'เอกสารเดิม'}</span>
                    </div>
                </div>
                <button type="button" onclick="removeEditAttachment(${index})" class="text-gray-400 hover:text-red-500 transition p-2 rounded-full hover:bg-red-50" title="ลบไฟล์นี้">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;
            list.appendChild(item);
        });
    } else {
        container.classList.add('hidden');
    }
}

// 3. ฟังก์ชันลบไฟล์ออกจากรายการ (ลบแค่ในตัวแปร ยังไม่บันทึก)
window.removeEditAttachment = function(index) {
    if (confirm('ต้องการนำไฟล์แนบนี้ออกใช่หรือไม่? (ต้องกดบันทึกการแก้ไข ผลจึงจะมีผลถาวร)')) {
        currentEditAttachments.splice(index, 1);
        renderEditAttachments();
    }
};

// ==========================================
// 🛠️ ปรับปรุงฟังก์ชันหลัก (Override Functions)
// ==========================================

// 4. แก้ไข populateEditForm ให้ดึงไฟล์เก่ามาใส่ตัวแปร
// (ให้เอาฟังก์ชันนี้ไปทับ populateEditForm เดิม หรือแก้ไขส่วนที่เกี่ยวข้อง)
const originalPopulateEditForm = populateEditForm; // เก็บตัวเก่าไว้ถ้ามี

populateEditForm = async function(requestData) {
    // เรียกใช้ Logic เดิมก่อนเพื่อเติม Text Input
    if (typeof originalPopulateEditForm === 'function') {
        await originalPopulateEditForm(requestData);
    }

    console.log("📂 Loading attachments for edit...");
    currentEditAttachments = []; // Reset

    // A. ดึงจาก Array attachments (ถ้ามี)
    if (requestData.attachments && Array.isArray(requestData.attachments)) {
        // กรองเอาเฉพาะ Object ที่มี url (กันข้อมูลขยะที่เป็น String รายชื่อคน)
        const files = requestData.attachments.filter(item => item.url && item.name);
        currentEditAttachments.push(...files);
    }

    // B. ดึงจาก Field เก่า (Legacy Support)
    if (requestData.fileExchangeUrl) currentEditAttachments.push({ name: 'ไฟล์แลกคาบสอน (เดิม)', url: requestData.fileExchangeUrl, type: 'legacy' });
    if (requestData.fileRefDocUrl) currentEditAttachments.push({ name: 'หนังสือราชการ (เดิม)', url: requestData.fileRefDocUrl, type: 'legacy' });
    if (requestData.fileOtherUrl) currentEditAttachments.push({ name: 'เอกสารอื่นๆ (เดิม)', url: requestData.fileOtherUrl, type: 'legacy' });
    if (requestData.fileUrl) currentEditAttachments.push({ name: 'เอกสารแนบ (เดิม)', url: requestData.fileUrl, type: 'legacy' });

    // กำจัดไฟล์ซ้ำ (Unique by URL)
    currentEditAttachments = currentEditAttachments.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);

    // แสดงผล
    renderEditAttachments();

    // แสดงลายเซ็นเดิม (ถ้ามี)
    const existingPreview = document.getElementById('edit-existing-sig-preview');
    const existingImg = document.getElementById('edit-existing-sig-img');
    if (existingPreview && existingImg) {
        if (requestData.signatureBase64) {
            existingImg.src = requestData.signatureBase64;
            existingPreview.classList.remove('hidden');
        } else {
            existingPreview.classList.add('hidden');
        }
    }

    // Reset และ initialize signature pad (delay เพื่อให้ DOM render ก่อน)
    editSignaturePad = null; // บังคับสร้างใหม่เสมอ (เผื่อ canvas ถูก re-render)
    setTimeout(() => {
        if (typeof initEditSignaturePad === 'function') initEditSignaturePad();
    }, 300);
};


// 5. ฟังก์ชันบันทึกการแก้ไขฉบับเต็ม (Save Edit Request - Full Function)

async function saveEditRequest() {
    const btn = document.getElementById('save-edit-btn');
    
    const setBtnStatus = (msg, icon = 'loader-sm') => {
        if (btn) {
            btn.disabled = true;
            // ถ้า icon เป็น loader ให้หมุน ถ้าไม่ใช่ให้แสดงปกติ
            const iconHtml = icon === 'loader-sm' ? '<span class="loader-sm"></span>' : `<i class="${icon}"></i>`;
            btn.innerHTML = `${iconHtml} ${msg}`;
            btn.classList.add('opacity-70', 'cursor-not-allowed');
        }
    };

    try {
        const formData = getEditFormData();
        if (!formData || !validateEditForm(formData)) return;

        // --- Step 1: สร้าง PDF ใหม่ ---
        setBtnStatus('กำลังสร้างไฟล์ PDF ใหม่...');
        
        // บังคับปิด attachments (ตาม Logic เดิม)
        formData.attachments = []; 
        formData.attachmentUrls = [];

        const pdfData = { ...formData, docType: 'memo' };
        const { pdfBlob } = await generateOfficialPDF(pdfData);

        // --- Step 2: อัปโหลดไฟล์ ---
        setBtnStatus('กำลังอัปโหลดไฟล์...');
        
        const safeId = formData.requestId.replace(/[\/\\\:\.\s]/g, '-');
        const filename = `memo_EDIT_${safeId}_${Date.now()}.pdf`;

        const newFileUrl = await uploadPdfToFirebaseStorage(pdfBlob, formData.username, filename);
        console.log("✅ New File URL:", newFileUrl);

        // --- Step 3: บันทึกข้อมูล ---
        setBtnStatus('กำลังบันทึกข้อมูล...');
        
        formData.fileUrl = newFileUrl;
        formData.pdfUrl = newFileUrl;
        formData.memoPdfUrl = newFileUrl;

        const result = await apiCall('POST', 'updateRequest', formData);

        if (result.status === 'success') {
            // ★★★ ส่วนที่ปรับปรุงตามโจทย์ ★★★
            
            // 1. เปลี่ยนข้อความปุ่มให้รู้ว่าเสร็จแล้ว
            if (btn) {
                btn.innerHTML = '✅ ดูไฟล์ที่สร้างสำเร็จ';
                btn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
                btn.classList.add('bg-green-600', 'hover:bg-green-700');
            }

            showAlert("สำเร็จ", "บันทึกการแก้ไขเรียบร้อยแล้ว");
            
            // 2. เปิดไฟล์ใหม่ให้ดูทันที (ใน Tab ใหม่)
            if (newFileUrl) openUrlWithDownloadIndicator(newFileUrl, 'กำลังเปิดไฟล์ที่แก้ไขแล้ว...');
            
            // 3. รีเฟรช Dashboard และพากลับไป
            if (typeof clearRequestsCache === 'function') clearRequestsCache();
            window.allRequestsCache = null; 
            
            await fetchUserRequests(); // โหลดข้อมูลใหม่เพื่อให้ Dashboard มีลิงก์ล่าสุด
            
            // กลับไปหน้า Dashboard
            switchPage('dashboard-page');

        } else {
            throw new Error(result.message || "Server Error");
        }

    } catch (error) {
        console.error("Save Edit Error:", error);
        showAlert("บันทึกไม่สำเร็จ", "เกิดข้อผิดพลาด: " + error.message);
        // คืนค่าปุ่มกรณี Error
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'บันทึกการแก้ไข';
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }
}
// --- ฟังก์ชันแยก: รวมไฟล์และอัปเดตย้อนหลัง (Background Process) ---
async function mergeAndBackfillPDF(requestId, mainPdfUrl, attachments, user) {
    if (!requestId || !mainPdfUrl || !attachments || attachments.length === 0) {
        console.log("ℹ️ No attachments to merge. Skipping.");
        return;
    }

    // แสดงแจ้งเตือนมุมจอว่ากำลังทำงานเบื้องหลัง
    const toastId = 'toast-' + Date.now();
    const showToast = (msg) => {
        const div = document.createElement('div');
        div.id = toastId;
        div.className = "fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50 text-sm flex items-center";
        div.innerHTML = `<span class="loader-sm mr-2 border-white"></span> ${msg}`;
        document.body.appendChild(div);
    };
    const updateToast = (msg, success=true) => {
        const div = document.getElementById(toastId);
        if(div) {
            div.innerHTML = success ? `✅ ${msg}` : `⚠️ ${msg}`;
            if(success) div.classList.replace('bg-gray-800', 'bg-green-600');
            setTimeout(() => div.remove(), 5000);
        }
    };

    try {
        console.log("🔄 Starting Background Merge for:", requestId);
        showToast("กำลังรวมไฟล์แนบอยู่เบื้องหลัง...");

        // 1. ดาวน์โหลดไฟล์หลัก (Main PDF)
        const mainRes = await fetch(mainPdfUrl);
        const mainBlob = await mainRes.blob();

        // 2. รวบรวม URL ไฟล์แนบ
        const attachmentUrls = attachments.map(a => a.url).filter(url => url);
        
        // 3. รวมไฟล์ (Client-side Merge)
        // (ต้องมั่นใจว่ามีฟังก์ชัน mergePDFs ใน utils.js)
        if (typeof mergePDFs !== 'function') throw new Error("mergePDFs function missing");
        
        const mergedBlob = await mergePDFs(mainBlob, attachmentUrls);

        // 4. อัปโหลดไฟล์ที่รวมเสร็จแล้ว (Merged PDF)
        const mergedFilename = `merged_request_${requestId}_${Date.now()}.pdf`;
        const finalUrl = await uploadPdfToFirebaseStorage(mergedBlob, user.username, mergedFilename);

        if (finalUrl) {
            console.log("✅ Merge & Upload Success:", finalUrl);

            // 5. อัปเดตลิงก์ในฐานข้อมูล (Update Request)
            await apiCall('POST', 'updateRequest', {
                requestId: requestId,
                fileUrl: finalUrl // อัปเดตลิงก์หลักเป็นไฟล์ที่รวมแล้ว
            });

            updateToast("รวมไฟล์เอกสารเสร็จสมบูรณ์", true);
        }

    } catch (error) {
        console.error("Background Merge Failed:", error);
        updateToast("การรวมไฟล์ขัดข้อง (เอกสารหลักยังอยู่ครบ)", false);
        // ไม่ต้อง throw error เพื่อไม่ให้กระทบ Flow หลัก
    }
}
/**
 * ฟังก์ชันตรวจสอบความถูกต้องของข้อมูล (Validation Check)
 * @param {Object} data - ข้อมูลที่ดึงมาจากฟอร์ม
 * @returns {Boolean} - true ถ้าข้อมูลถูกต้อง, false ถ้าข้อมูลไม่ครบ
 */
function validateRequestForm(data) {
    // 1. ตรวจสอบข้อมูลบังคับ (ชื่อ, ตำแหน่ง, วัตถุประสงค์, สถานที่)
    if (!data.requesterName || !data.requesterPosition) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกชื่อ-นามสกุล และตำแหน่งของผู้ขอ');
        return false;
    }
    if (!data.purpose) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกวัตถุประสงค์/เรื่องที่ขอไปราชการ');
        return false;
    }
    if (!data.location) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกสถานที่ปฏิบัติราชการ');
        return false;
    }

    // 2. ตรวจสอบวันที่
    if (!data.docDate) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุวันที่ของเอกสาร');
        return false;
    }
    if (!data.startDate || !data.endDate) {
        showAlert('ข้อมูลไม่ครบถ้วน', 'กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุดการเดินทาง');
        return false;
    }

    // 3. ตรวจสอบตรรกะวันที่ (วันกลับต้องไม่มาก่อนวันเริ่ม)
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (start > end) {
        showAlert('วันที่ไม่ถูกต้อง', 'วันที่เริ่มต้นต้องมาก่อนหรือตรงกับวันที่สิ้นสุดการเดินทาง');
        return false;
    }

    return true;
}
window.editRequest = async function(requestId) {
    console.log("Triggering edit for:", requestId);
    await openEditPage(requestId);
};

window.deleteRequest = async function(requestId) {
    console.log("Triggering delete for:", requestId);
    await handleDeleteRequest(requestId);
};
// ไฟล์: js/requests.js

// ==========================================
// 3. ฟังก์ชันสำหรับหน้า "ส่งบันทึก" (แยกออกมาเฉพาะ)
// ==========================================

async function fetchPendingMemos() {
    const user = getCurrentUser();
    if (!user) return;

    // UI Setup
    const container = document.getElementById('pending-memos-list');
    const loader = document.getElementById('pending-memos-loader');
    const noMsg = document.getElementById('no-pending-memos-message');
    
    container.innerHTML = '';
    loader.classList.remove('hidden');
    noMsg.classList.add('hidden');

    try {
        // ใช้ Logic เดียวกับ fetchUserRequests แต่เราจะกรองในขั้นถัดไป
        // เพื่อความชัวร์ ให้ดึงข้อมูลปีปัจจุบันและย้อนหลัง 1 ปี (เผื่อมีงานค้างข้ามปี)
        const currentYear = new Date().getFullYear() + 543;
        
        // ดึงข้อมูลปีปัจจุบัน
        const resultNow = await apiCall('GET', 'getRequestsByYear', { year: currentYear, username: user.username });
        let requests = (resultNow.status === 'success') ? resultNow.data || [] : [];

        // ★ กรองเฉพาะรายการที่ต้องส่งบันทึก ★
        // เงื่อนไข: (มีเลขที่เอกสาร) AND (ยังไม่เสร็จสิ้น OR สถานะ = นำกลับไปแก้ไข)
        const pendingRequests = requests.filter(req => {
            const hasId = req.id && req.id !== '' && !req.id.includes('รอ');
            
            // เช็คสถานะเสร็จสิ้น
            const isCompleted = 
                req.status === 'เสร็จสิ้น' || 
                req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || 
                req.memoStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ||
                req.commandStatus === 'เสร็จสิ้น'; // ถ้าออกคำสั่งแล้วถือว่าผ่านขั้นตอนนี้แล้ว

            // เช็คสถานะแก้ไข
            const isFixing = req.status === 'นำกลับไปแก้ไข' || req.memoStatus === 'นำกลับไปแก้ไข';
            
            // ยังไม่มีไฟล์แนบ (หรือมีแต่ต้องแก้) และยังไม่จบกระบวนการ
            // หมายเหตุ: เช็ค completedMemoUrl ด้วย เพราะบางทีอาจจะส่งแล้วแต่ status ยังไม่อัปเดต
            const hasMemoFile = req.completedMemoUrl && req.completedMemoUrl !== "";

            if (!hasId) return false; // ไม่มีเลข ไม่ต้องแสดง
            
            // แสดงถ้า: (ต้องแก้ไข) หรือ (ยังไม่เสร็จ และ ยังไม่มีไฟล์แนบสมบูรณ์)
            return isFixing || (!isCompleted && !hasMemoFile);
        });

        // เรียงลำดับ (เก่า -> ใหม่ จะได้รีบเคลียร์ของเก่า)
        pendingRequests.sort((a, b) => new Date(a.docDate) - new Date(b.docDate));

        renderPendingMemos(pendingRequests);

    } catch (error) {
        console.error("Error fetching pending memos:", error);
        container.innerHTML = `<p class="text-center text-red-500">โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
    } finally {
        loader.classList.add('hidden');
    }
}

function renderPendingMemos(requests) {
    const container = document.getElementById('pending-memos-list');
    const noMsg = document.getElementById('no-pending-memos-message');

    if (requests.length === 0) {
        noMsg.classList.remove('hidden');
        return;
    }

    container.innerHTML = requests.map(req => {
        const safeId = escapeHtml(req.id);
        const isFixing = req.status === 'นำกลับไปแก้ไข' || req.memoStatus === 'นำกลับไปแก้ไข';
        
        let statusBadge = isFixing 
            ? `<span class="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded border border-red-200">⚠️ ตีกลับให้แก้ไข</span>`
            : `<span class="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded border border-yellow-200">⏳ รอส่งบันทึก</span>`;

        // ปุ่มดูไฟล์ (เพื่อให้ดูเลขที่/รายละเอียดก่อนแนบ)
        const viewFileUrl = req.fileUrl || req.pdfUrl;
        const viewBtn = viewFileUrl 
            ? `<a href="${viewFileUrl}" target="_blank" class="text-indigo-600 hover:underline text-sm mr-4">📄 ดูรายละเอียด</a>` 
            : '';

        return `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-1">
                        <h4 class="text-lg font-bold text-gray-800">${safeId}</h4>
                        ${statusBadge}
                    </div>
                    <p class="text-gray-600 font-medium">${escapeHtml(req.purpose)}</p>
                    <p class="text-sm text-gray-500 mt-1">
                        📅 ${formatDisplayDate(req.startDate)} | 📍 ${escapeHtml(req.location)}
                    </p>
                    <div class="mt-2">
                        ${viewBtn}
                    </div>
                </div>
                
                <div class="w-full sm:w-auto">
                    <button onclick="openSendMemoFromList('${safeId}')" class="btn bg-teal-600 hover:bg-teal-700 text-white w-full sm:w-auto shadow-md flex items-center justify-center gap-2 py-2 px-6">
                        <span>📤</span>
                        <span>ส่งบันทึก/แนบไฟล์</span>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ฟังก์ชันเปิด Modal จากหน้านี้ (เพิ่ม Global Function)
// ฟังก์ชันตอนเปิด Modal ส่งงาน
window.openSendMemoFromList = function(requestId, departmentName = null) {
    document.getElementById('memo-modal-request-id').value = requestId;
    document.getElementById('send-memo-form').reset();

    // ★ รีเซ็ตลำดับการอัพโหลดและ pdfBase64 cache เมื่อเปิด Modal ใหม่
    window._memoUploadOrder = {};
    window._memoAutoBase64  = null;
    window._memoSourceMode = 'auto';

    const forceUploadMode = typeof isUnifiedMemoUploadEnabled === 'function' && isUnifiedMemoUploadEnabled();

    // ตั้งค่าประเภทอัตโนมัติเป็น ไม่เบิก
    const nonReimburseRadio = document.getElementById('memo_type_non_reimburse');
    if (nonReimburseRadio) {
        nonReimburseRadio.checked = true;
    }
    if (!forceUploadMode && nonReimburseRadio) {
        nonReimburseRadio.dispatchEvent(new Event('change'));
    } else if (typeof applyMemoWorkflowModeUI === 'function') {
        applyMemoWorkflowModeUI();
    }

    // เลือกแผนกที่จะส่งต่อให้อัตโนมัติ (ถ้ามีส่งมา)
    if (departmentName) {
        const targetStatus = mapDepartmentToStatus(departmentName);
        const forwardSelect = document.getElementById('modal-forward-to');
        if (forwardSelect) forwardSelect.value = targetStatus;
    }

    // ★ ดึง pdfBase64 + URL บันทึกข้อความจาก cache / Firestore โดยอัตโนมัติ
    const cached = (window.userRequestsCache || []).find(r => (r.id || r.requestId) === requestId);
    const memoUrl = cached?.currentPdfUrl || cached?.pdfUrl || '';

    const preSignedInput   = document.getElementById('pre-signed-memo-url');
    const preSignedDisplay = document.getElementById('pre-signed-memo-display');
    const preSignedLink    = document.getElementById('pre-signed-memo-link');
    const manualMemoInput  = document.getElementById('file-signed-memo');

    if (preSignedInput) preSignedInput.value = memoUrl;
    if (manualMemoInput) manualMemoInput.value = '';

    if (memoUrl && preSignedDisplay) {
        preSignedDisplay.classList.remove('hidden');
        if (preSignedLink) { preSignedLink.href = memoUrl; }
    } else if (preSignedDisplay) {
        preSignedDisplay.classList.add('hidden');
    }

    if (typeof applyMemoSourceModeUI === 'function') applyMemoSourceModeUI();
    document.getElementById('send-memo-modal').style.display = 'flex';
};

// ฟังก์ชันเปิด Modal ส่งงาน พร้อมแนบ URL เอกสารที่ลงนามออนไลน์แล้ว
window.openSendMemoWithPreSignedDoc = function(requestId, signedUrl, departmentName = null) {
    document.getElementById('memo-modal-request-id').value = requestId;
    document.getElementById('send-memo-form').reset();

    // ★ รีเซ็ตลำดับการอัพโหลดและ pdfBase64 cache เมื่อเปิด Modal ใหม่
    window._memoUploadOrder = {};
    window._memoAutoBase64  = null;
    window._memoSourceMode = 'auto';

    const forceUploadMode = typeof isUnifiedMemoUploadEnabled === 'function' && isUnifiedMemoUploadEnabled();

    // ตั้งค่าประเภทอัตโนมัติเป็น ไม่เบิก
    const nonReimburseRadio = document.getElementById('memo_type_non_reimburse');
    if (nonReimburseRadio) {
        nonReimburseRadio.checked = true;
    }
    if (!forceUploadMode && nonReimburseRadio) {
        nonReimburseRadio.dispatchEvent(new Event('change'));
    } else if (typeof applyMemoWorkflowModeUI === 'function') {
        applyMemoWorkflowModeUI();
    }

    // แนบ URL เอกสารที่ลงนามแล้ว (pre-signed)
    const preSignedInput = document.getElementById('pre-signed-memo-url');
    const preSignedDisplay = document.getElementById('pre-signed-memo-display');
    const preSignedLink = document.getElementById('pre-signed-memo-link');
    const manualMemoInput = document.getElementById('file-signed-memo');
    if (preSignedInput) preSignedInput.value = signedUrl || '';
    if (manualMemoInput) manualMemoInput.value = '';
    if (signedUrl && preSignedDisplay) {
        preSignedDisplay.classList.remove('hidden');
        if (preSignedLink) {
            preSignedLink.href = signedUrl;
            preSignedLink.textContent = '📄 ดูเอกสารที่ลงนามแล้ว';
        }
    }

    // เลือกแผนกที่จะส่งต่อให้อัตโนมัติ (ถ้ามีส่งมา)
    if (departmentName) {
        const targetStatus = mapDepartmentToStatus(departmentName);
        const forwardSelect = document.getElementById('modal-forward-to');
        if (forwardSelect) forwardSelect.value = targetStatus;
    }

    if (typeof applyMemoSourceModeUI === 'function') applyMemoSourceModeUI();
    document.getElementById('send-memo-modal').style.display = 'flex';
};

// ---------------------------------------------------------
// ฟังก์ชันกดยืนยันการส่งต่อ (ปุ่มสุดท้าย)
// ---------------------------------------------------------
async function handleMemoSubmitFromModal(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const isAdmin      = user.role === 'admin';
    const requestId    = document.getElementById('memo-modal-request-id').value;
    const forceUploadMode = typeof isUnifiedMemoUploadEnabled === 'function' && isUnifiedMemoUploadEnabled();
    const memoType     = forceUploadMode
        ? 'non_reimburse'
        : (document.querySelector('input[name="modal_memo_type"]:checked')?.value || 'non_reimburse');
    const preSignedUrl = document.getElementById('pre-signed-memo-url')?.value || '';
    const manualMemoFile = document.getElementById('file-signed-memo')?.files[0] || null;
    const memoSourceMode = window._memoSourceMode || 'auto';

    const forwardToStatus = memoType === 'reimburse'
        ? 'waiting_admin_review'
        : document.getElementById('modal-forward-to')?.value;

    if (memoType !== 'reimburse' && !forwardToStatus) {
        return showAlert('แจ้งเตือน', 'กรุณาเลือกผู้ที่จะส่งบันทึกต่อให้ถูกต้อง');
    }

    toggleLoader('send-memo-submit-button', true);
    const btn = document.getElementById('send-memo-submit-button');

    try {
        if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();
        let finalFileUrlForAdmin = '';

        if (memoType === 'non_reimburse') {
            const requiredMemoUploads = (typeof getRequiredMemoUploadSettings === 'function')
                ? getRequiredMemoUploadSettings()
                : { refDoc: true, exchange: false };

            // ── 1. รับบันทึกข้อความหลัก ──
            // แหล่ง A: _memoAutoBase64 (cache จาก Firestore — เร็วที่สุด)
            // แหล่ง B: fetch จาก preSignedUrl (Firebase Storage — ต้อง CORS)
            let memoBlob = null;
            if (memoSourceMode === 'manual') {
                if (!manualMemoFile && !isAdmin) {
                    throw new Error('กรุณาอัปโหลดไฟล์บันทึกข้อความด้วยตัวเองก่อนส่งต่อ');
                }
                memoBlob = manualMemoFile || null;
            } else if (window._memoAutoBase64) {
                try {
                    const raw = window._memoAutoBase64.replace(/^data:[^;]+;base64,/, "");
                    const bin = atob(raw);
                    const arr = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                    memoBlob = new Blob([arr], { type: "application/pdf" });
                } catch (e) {
                    console.warn("⚠️ Failed to decode _memoAutoBase64:", e.message);
                    memoBlob = null;
                }
            }
            
            if (!memoBlob && memoSourceMode !== 'manual' && preSignedUrl) {
                btn.innerHTML = "<div class=\"loader\"></div> กำลังโหลดบันทึก...";
                try {
                    const resp = await fetch(preSignedUrl);
                    if (!resp.ok) throw new Error("HTTP " + resp.status);
                    memoBlob = await resp.blob();
                } catch (e) {
                    console.warn("⚠️ Failed to fetch preSignedUrl:", e.message);
                    if (!isAdmin) throw new Error("ไม่สามารถโหลดเอกสารบันทึกข้อความได้: " + e.message);
                }
            }

            if (!memoBlob && !isAdmin) {
                throw new Error("ไม่พบเอกสารบันทึกข้อความ กรุณาสร้างบันทึกก่อนส่ง");
            }

            // ── 2. ไฟล์แนบเพิ่มเติม (ตามลำดับที่อัปโหลด) ──
            const fileExchange = document.getElementById('file-exchange')?.files[0];
            const fileRefDoc   = document.getElementById('file-ref-doc')?.files[0];

            if (!isAdmin && requiredMemoUploads.refDoc && !fileRefDoc) {
                throw new Error('กรุณาแนบหนังสือต้นเรื่อง/หนังสือเชิญ');
            }
            if (!isAdmin && requiredMemoUploads.exchange && !fileExchange) {
                throw new Error('กรุณาแนบไฟล์แลกคาบสอน');
            }

            const extraFiles = [
                { id: 'file-exchange', file: fileExchange },
                { id: 'file-ref-doc',  file: fileRefDoc   },
            ]
            .filter(d => d.file)
            .sort((a, b) => (window._memoUploadOrder?.[a.id] || 0) - (window._memoUploadOrder?.[b.id] || 0))
            .map(d => d.file);

            // ── 3. Merge หรือใช้บันทึกเดี่ยว ──
            let finalBlob;
            if (memoBlob && extraFiles.length > 0) {
                btn.innerHTML = '<div class="loader"></div> กำลังรวมไฟล์ PDF...';
                // mergeFilesToSinglePDF รับ Blob/File ได้เพราะใช้ .arrayBuffer()
                finalBlob = await mergeFilesToSinglePDF([memoBlob, ...extraFiles]);
            } else if (memoBlob) {
                finalBlob = memoBlob;
            } else if (isAdmin) {
                // Admin ส่งโดยไม่มีไฟล์ (bypass)
                console.log('🛡️ Admin Bypass: ส่งบันทึกโดยไม่มีไฟล์แนบ');
                finalBlob = null;
            } else {
                throw new Error('ไม่พบเอกสารสำหรับส่ง');
            }

            // ── 4. อัปโหลด ──
            if (finalBlob) {
                btn.innerHTML = '<div class="loader"></div> กำลังอัปโหลด...';
                finalFileUrlForAdmin = await uploadPdfToFirebaseStorage(
                    finalBlob, user.username,
                    `Complete_Memo_${requestId.replace(/[\/\\:\.]/g, '-')}.pdf`
                );
            }
        }

        // ── 5. บันทึกลง GAS + Firestore ──
        const updatePayload = {
            requestId:   requestId,
            docStatus:   forwardToStatus,
            status:      'Submitted',
            wasRejected: false,
        };
        if (finalFileUrlForAdmin) {
            updatePayload.completedMemoUrl = finalFileUrlForAdmin;
            updatePayload.currentPdfUrl    = finalFileUrlForAdmin; // ผู้อนุมัติเห็นไฟล์รวมล่าสุด
        }

        await apiCall('POST', 'updateRequest', updatePayload);

        // ── 6. แจ้งผลและรีเฟรช ──
        showAlert('สำเร็จ', memoType === 'reimburse'
            ? 'ส่งบันทึกข้อความเรียบร้อยแล้ว (กรุณานำเอกสารฉบับจริงส่งที่งานบุคคล)'
            : (isAdmin && !finalFileUrlForAdmin
                ? 'อัปเดตสถานะเรียบร้อยแล้ว (Admin Bypass)'
                : 'รวมไฟล์และส่งบันทึกข้อความเรียบร้อยแล้ว'));

        if (finalFileUrlForAdmin) {
            openUrlWithDownloadIndicator(finalFileUrlForAdmin, 'กำลังเปิดไฟล์ที่รวมแล้ว...');
        }

        const preSignedInputEl   = document.getElementById('pre-signed-memo-url');
        const preSignedDisplayEl = document.getElementById('pre-signed-memo-display');
        const manualMemoInputEl  = document.getElementById('file-signed-memo');
        if (preSignedInputEl)   preSignedInputEl.value = '';
        if (preSignedDisplayEl) preSignedDisplayEl.classList.add('hidden');
        if (manualMemoInputEl)  manualMemoInputEl.value = '';

        document.getElementById('send-memo-modal').style.display = 'none';
        document.getElementById('send-memo-form').reset();
        window._memoAutoBase64 = null;
        window._memoSourceMode = 'auto';

        await fetchUserRequests(true);
        switchPage('dashboard-page');

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', error.message);
    } finally {
        if (btn) btn.innerHTML = 'ส่งต่อบันทึก';
        toggleLoader('send-memo-submit-button', false);
    }
}
// ฟังก์ชันแปลงชื่อกลุ่มสาระ เป็น Status สำหรับคิวการอนุมัติ
function mapDepartmentToStatus(departmentName) {
    if (!departmentName) return 'waiting_admin_review';
    const d = departmentName;
    // --- กลุ่มสาระ ---
    if (d.includes('ภาษาไทย'))           return 'waiting_head_thai';
    if (d.includes('ภาษาต่างประเทศ'))    return 'waiting_head_foreign';
    if (d.includes('วิทยาศาสตร์'))       return 'waiting_head_science';
    if (d.includes('ศิลปะ'))             return 'waiting_head_art';
    if (d.includes('สังคม'))             return 'waiting_head_social';
    if (d.includes('สุขศึกษา'))          return 'waiting_head_health';
    if (d.includes('การงานอาชีพ'))       return 'waiting_head_career';
    if (d.includes('คณิตศาสตร์'))        return 'waiting_head_math';
    if (d.includes('แนะแนว'))            return 'waiting_head_guidance';
    // --- รองผอ. (ตรวจก่อน หัวหน้ากลุ่มบริหาร เพราะชื่อยาวกว่า) ---
    if (d.includes('รองผู้อำนวยการกลุ่มบริหารวิชาการ'))   return 'waiting_deputy_acad';
    if (d.includes('รองผู้อำนวยการกลุ่มบริหารงานบุคคล')) return 'waiting_deputy_personnel';
    if (d.includes('รองผู้อำนวยการกลุ่มบริหารงบประมาณ')) return 'waiting_deputy_budget';
    if (d.includes('รองผู้อำนวยการกลุ่มบริหารทั่วไป'))   return 'waiting_deputy_general';
    // --- หัวหน้ากลุ่มบริหาร ---
    if (d.includes('หัวหน้ากลุ่มบริหารวิชาการ'))  return 'waiting_head_acad';
    if (d.includes('หัวหน้ากลุ่มบริหารงานบุคคล')) return 'waiting_head_personnel';
    if (d.includes('หัวหน้ากลุ่มบริหารงบประมาณ')) return 'waiting_head_budget';
    if (d.includes('หัวหน้ากลุ่มบริหารทั่วไป'))   return 'waiting_head_general';
    if (d.includes('ผู้อำนวยการโรงเรียน'))         return 'waiting_director';
    return 'waiting_admin_review'; // default: ส่ง admin ตรวจสอบก่อน
}
// ตัวแปรเก็บสถานะชั่วคราวระหว่างการจิ้มลายเซ็น
let requesterStamperState = {
    pdfBlob: null,
    formData: null,
    signatureBase64: null,
    isEdit: false
};

// ---------------------------------------------------------
// 1. ฟังก์ชันหลักสำหรับเริ่มกระบวนการ สร้าง/แก้ไข คำขอ
// ---------------------------------------------------------
async function processAndSignDocument(formData, isEdit = false) {
    toggleLoader('submit-button', true); // หมุน Loader ที่ปุ่ม Submit
    try {
        console.log("Generating PDF from Cloud Run...");
        // ให้ Cloud Run สร้าง PDF ออกมาก่อน (ใช้ generateOfficialPDF แทน generatePdfFromCloudRun ที่ถูกลบออกแล้ว)
        formData.docType = 'memo';
        formData.btnId = 'submit-button';
        const { pdfBlob } = await generateOfficialPDF(formData);
        
        // เก็บข้อมูลไว้ใช้ตอนจิ้ม
        requesterStamperState.pdfBlob = pdfBlob;
        requesterStamperState.formData = formData;
        requesterStamperState.isEdit = isEdit;
        requesterStamperState.signatureBase64 = formData.signatureBase64; // ลายเซ็นจาก Signature Pad

        if (formData.signatureBase64) {
            // ถ้ามีการเซ็นมา -> เปิด Modal ให้จิ้มตำแหน่ง
            await renderPdfForRequesterStamper(pdfBlob);
        } else {
            // ถ้าไม่ได้เซ็นมา -> ข้ามไปเซฟเลย
            await finalizeDocumentSubmission(pdfBlob);
        }
    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถสร้างเอกสารได้: ' + error.message);
        toggleLoader('submit-button', false);
    }
}

// ---------------------------------------------------------
// 2. ฟังก์ชันแสดง PDF ให้ผู้ขอจิ้มตำแหน่ง
// ---------------------------------------------------------
async function renderPdfForRequesterStamper(pdfBlob) {
    const modal = document.getElementById('requester-stamper-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    const canvas = document.getElementById('requester-pdf-canvas');
    const ctx = canvas.getContext('2d');
    
    // โหลด PDF ด้วย pdf.js
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // ดึงหน้า 1 มาแสดง
    const page = await pdf.getPage(1);
    const scale = 1.5; // ขนาดซูม
    const viewport = page.getViewport({ scale: scale });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    toggleLoader('submit-button', false); // ปิดหมุนๆ เพราะรอให้ผู้ใช้จิ้ม

    // ดักจับการคลิกบนหน้ากระดาษ
    canvas.onclick = async function(e) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        
        // แปลงพิกัด HTML กลับเป็นพิกัด PDF (PDF-lib นับ Y จากล่างขึ้นบน)
        const pdfX = canvasX / scale;
        const pdfY = (canvas.height - canvasY) / scale; 

        // ปิด Modal
        modal.style.display = 'none';
        
        // ส่งไปแปะลายเซ็นและเซฟ
        await stampAndSave(pdfX, pdfY);
    };
}

// ---------------------------------------------------------
// 3. ฟังก์ชันประทับลายเซ็นด้วย pdf-lib
// ตัดพื้นที่ว่าง (transparent) รอบๆ ลายเซ็นออก เพื่อให้ได้ aspect ratio ที่แท้จริง
async function stampAndSave(x, y) {
    showAlert('กำลังดำเนินการ', 'กำลังประทับลายเซ็นและบันทึกข้อมูล... กรุณารอสักครู่', false); // แจ้งเตือนแบบซ่อนปุ่ม OK
    
    try {
        const pdfBytes = await requesterStamperState.pdfBlob.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const page = pdfDoc.getPages()[0]; // หน้าแรก

        const optimizedSignatureBase64 = (typeof optimizeSignatureDataURL === 'function')
            ? await optimizeSignatureDataURL(requesterStamperState.signatureBase64 || '', { targetHeight: 340 })
            : (requesterStamperState.signatureBase64 || '');
        const base64Data = optimizedSignatureBase64.includes(',') ? optimizedSignatureBase64.split(',')[1] : optimizedSignatureBase64;
        if (!base64Data) throw new Error('ไม่พบข้อมูลลายเซ็น กรุณาวาดลายเซ็นใหม่');
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const signatureImage = await pdfDoc.embedPng(imageBytes);
        const { width: imageWidth, height: imageHeight } = (typeof getImageDimensionsFromDataURL === 'function')
            ? await getImageDimensionsFromDataURL(optimizedSignatureBase64)
            : { width: 900, height: 320 };
        const aspectRatio = imageWidth / Math.max(1, imageHeight);
        let sigWidth = Math.min(220, Math.max(145, page.getWidth() * 0.24));
        let sigHeight = sigWidth / Math.max(1.2, aspectRatio);
        if (sigHeight > 90) {
            const fitScale = 90 / sigHeight;
            sigHeight *= fitScale;
            sigWidth *= fitScale;
        }

        page.drawImage(signatureImage, {
            x: x - (sigWidth / 2),
            y: y - (sigHeight / 2),
            width: sigWidth,
            height: sigHeight
        });

        const modifiedPdfBytes = await pdfDoc.save();
        const finalPdfBlob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });

        // ส่งเข้ากระบวนการเซฟข้อมูล
        await finalizeDocumentSubmission(finalPdfBlob);
        
    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการประทับลายเซ็น: ' + error.message);
    }
}

// ---------------------------------------------------------
// 4. ★ ฟังก์ชันเซฟข้อมูล (แก้บั๊ก Edit ไม่ติดอยู่ที่นี่) ★
// ---------------------------------------------------------
async function finalizeDocumentSubmission(pdfBlob) {
    const formData = requesterStamperState.formData;
    const isEdit = requesterStamperState.isEdit;

    showSavingOverlay('กำลังอัปโหลดเอกสารและบันทึกข้อมูล...');
    try {
        // 1. อัปโหลดไฟล์ขึ้น Firebase Storage
        const fileName = `memo_${formData.username}_${Date.now()}.pdf`;
        const uploadedUrl = await uploadPdfToFirebaseStorage(pdfBlob, formData.username, fileName);
        if (!uploadedUrl) throw new Error("Upload Failed");

        formData.pdfUrl = uploadedUrl; // นำ URL ใหม่ใส่กลับเข้าไป
        
        // 2. จัดการบันทึกฐานข้อมูล
        if (isEdit) {
            // โหมดแก้ไข: บังคับเรียก API updateRequest
            formData.action = 'updateRequest'; 
            await apiCall('POST', 'updateRequest', formData);
            
            document.getElementById('alert-modal').style.display = 'none'; // ปิดแจ้งเตือนกำลังโหลด
            showAlert('สำเร็จ', 'บันทึกการแก้ไขและสร้างเอกสารใหม่เรียบร้อยแล้ว');
        } else {
            // โหมดสร้างใหม่
            formData.action = 'createRequest';
            const gasRes = await apiCall('POST', 'createRequest', formData);
            
            if (gasRes.data && gasRes.data.id) formData.id = gasRes.data.id;

            document.getElementById('alert-modal').style.display = 'none';
            showAlert('สำเร็จ', 'สร้างคำขอไปราชการเรียบร้อยแล้ว');
        }

        // รีเซ็ตฟอร์ม เคลียร์แคช และเด้งกลับหน้า Dashboard
        document.getElementById('request-form').reset();
        if (requesterSignaturePad) requesterSignaturePad.clear();
        if (typeof clearRequestsCache === 'function') clearRequestsCache();
        switchPage('dashboard-page');

    } catch (error) {
        console.error(error);
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', 'บันทึกข้อมูลไม่สำเร็จ: ' + error.message);
    } finally {
        hideSavingOverlay();
    }
}
// -----------------------------------------------------------------------
// File Menu Dropdown — toggle / close helpers
// -----------------------------------------------------------------------

function toggleFileMenu(menuId, event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const isOpen = menu.style.display !== 'none' && menu.style.display !== '';
    closeAllFileMenus();
    if (!isOpen) {
        // ใช้ position:fixed เพื่อหนีออกจาก overflow:hidden ของ table-wrapper
        const btn = event && (event.currentTarget || event.target?.closest('button'));
        if (btn) {
            const r = btn.getBoundingClientRect();
            menu.style.top = (r.bottom + 4) + 'px';
            menu.style.left = r.left + 'px';
            menu.style.right = 'auto';
        }
        menu.style.display = 'block';
        // ปรับตำแหน่งถ้า dropdown ล้นขอบขวาจอ
        requestAnimationFrame(() => {
            const mr = menu.getBoundingClientRect();
            if (mr.right > window.innerWidth - 8) {
                menu.style.left = 'auto';
                const btn2 = event && (event.currentTarget || event.target?.closest('button'));
                if (btn2) {
                    const r2 = btn2.getBoundingClientRect();
                    menu.style.right = (window.innerWidth - r2.right) + 'px';
                } else {
                    menu.style.right = '8px';
                }
            }
        });
    }
}

function closeAllFileMenus() {
    document.querySelectorAll('.file-menu-dropdown').forEach(m => { m.style.display = 'none'; });
}

// ปิด dropdown เมื่อคลิกนอกพื้นที่ (add once)
if (!window._fileMenuOutsideListenerAdded) {
    window._fileMenuOutsideListenerAdded = true;
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.file-menu-wrapper') && !e.target.closest('.file-menu-dropdown')) {
            document.querySelectorAll('.file-menu-dropdown').forEach(m => { m.style.display = 'none'; });
        }
    });
    // ปิดเมื่อ scroll ด้วย เพราะ position:fixed ไม่ขยับตาม
    document.addEventListener('scroll', function() {
        document.querySelectorAll('.file-menu-dropdown').forEach(m => { m.style.display = 'none'; });
    }, true);
}
