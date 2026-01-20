// --- PAGE NAVIGATION & EVENT LISTENERS ---

async function switchPage(targetPageId) {
    console.log("🔄 Switching to page:", targetPageId);
    
    // ซ่อนทุกหน้า
    document.querySelectorAll('.page-view').forEach(page => { page.classList.add('hidden'); });
    
    // แสดงหน้าเป้าหมาย
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) { targetPage.classList.remove('hidden'); }

    // จัดการปุ่มเมนู (Active State)
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.target === targetPageId) { btn.classList.add('active'); }
    });

    // Logic เฉพาะของแต่ละหน้า
    if (targetPageId === 'edit-page') { 
        setTimeout(() => { setupEditPageEventListeners(); }, 100); 
    }
    
    if (targetPageId === 'dashboard-page') {
        await fetchUserRequests(); // ดึงข้อมูล (Hybrid)
    }
    
    if (targetPageId === 'form-page') { 
        await resetRequestForm(); 
        setTimeout(() => { tryAutoFillRequester(); }, 100); 
    }
    
    if (targetPageId === 'profile-page') {
        if (typeof loadProfileData === 'function') loadProfileData();
    }
    
    if (targetPageId === 'stats-page') {
        if (typeof loadStatsData === 'function') await loadStatsData(); 
    }
    
    if (targetPageId === 'admin-users-page') {
        if (typeof fetchAllUsers === 'function') await fetchAllUsers();
    }
    
    if (targetPageId === 'command-generation-page') { 
        const tab = document.getElementById('admin-view-requests-tab');
        if(tab) tab.click(); 
    }
}

function setupVehicleOptions() {
    // จัดการ Checkbox ยานพาหนะ (หน้าสร้าง)
    document.querySelectorAll('input[name="vehicle_option"].vehicle-checkbox').forEach(checkbox => { 
        checkbox.addEventListener('change', toggleVehicleDetails); 
    });
    // จัดการ Checkbox ยานพาหนะ (หน้าแก้ไข)
    document.querySelectorAll('input[name="edit-vehicle_option"].vehicle-checkbox').forEach(checkbox => { 
        checkbox.addEventListener('change', toggleEditVehicleDetails); 
    });
}

function setupEventListeners() {
    // --- Auth & User Management ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    const showRegBtn = document.getElementById('show-register-modal-button');
    if (showRegBtn) showRegBtn.addEventListener('click', () => document.getElementById('register-modal').style.display = 'flex');
    
    const regForm = document.getElementById('register-form');
    if (regForm) regForm.addEventListener('submit', handleRegister);
    
    const forgotPwdBtn = document.getElementById('show-forgot-password-modal');
    if (forgotPwdBtn) forgotPwdBtn.addEventListener('click', () => { document.getElementById('forgot-password-modal').style.display = 'flex'; });
    
    document.getElementById('forgot-password-modal-close-button')?.addEventListener('click', () => { document.getElementById('forgot-password-modal').style.display = 'none'; });
    document.getElementById('forgot-password-cancel-button')?.addEventListener('click', () => { document.getElementById('forgot-password-modal').style.display = 'none'; });
    document.getElementById('forgot-password-form')?.addEventListener('submit', handleForgotPassword);
    
    // --- Modals (General) ---
    document.getElementById('public-attendee-modal-close-button')?.addEventListener('click', () => { document.getElementById('public-attendee-modal').style.display = 'none'; });
    document.getElementById('public-attendee-modal-close-btn2')?.addEventListener('click', () => { document.getElementById('public-attendee-modal').style.display = 'none'; });
    
    document.querySelectorAll('.modal').forEach(modal => { 
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; }); 
    });
    
    document.getElementById('register-modal-close-button')?.addEventListener('click', () => document.getElementById('register-modal').style.display = 'none');
    document.getElementById('register-modal-close-button2')?.addEventListener('click', () => document.getElementById('register-modal').style.display = 'none');
    
    document.getElementById('alert-modal-close-button')?.addEventListener('click', () => document.getElementById('alert-modal').style.display = 'none');
    document.getElementById('alert-modal-ok-button')?.addEventListener('click', () => document.getElementById('alert-modal').style.display = 'none');
    document.getElementById('confirm-modal-close-button')?.addEventListener('click', () => document.getElementById('confirm-modal').style.display = 'none');
    
    // --- Admin Commands & Memos ---
    document.getElementById('back-to-admin-command')?.addEventListener('click', async () => { await switchPage('command-generation-page'); });
    document.getElementById('admin-generate-command-button')?.addEventListener('click', handleAdminGenerateCommand);
    document.getElementById('command-approval-form')?.addEventListener('submit', handleCommandApproval);
    document.getElementById('command-approval-modal-close-button')?.addEventListener('click', () => document.getElementById('command-approval-modal').style.display = 'none');
    document.getElementById('command-approval-cancel-button')?.addEventListener('click', () => document.getElementById('command-approval-modal').style.display = 'none');
    
    document.getElementById('dispatch-form')?.addEventListener('submit', handleDispatchFormSubmit);
    document.getElementById('dispatch-modal-close-button')?.addEventListener('click', () => document.getElementById('dispatch-modal').style.display = 'none');
    document.getElementById('dispatch-cancel-button')?.addEventListener('click', () => document.getElementById('dispatch-modal').style.display = 'none');
    
    document.getElementById('admin-memo-action-form')?.addEventListener('submit', handleAdminMemoActionSubmit);
    document.getElementById('admin-memo-action-modal-close-button')?.addEventListener('click', () => document.getElementById('admin-memo-action-modal').style.display = 'none');
    document.getElementById('admin-memo-cancel-button')?.addEventListener('click', () => document.getElementById('admin-memo-action-modal').style.display = 'none');
    
    document.getElementById('send-memo-modal-close-button')?.addEventListener('click', () => document.getElementById('send-memo-modal').style.display = 'none');
    document.getElementById('send-memo-cancel-button')?.addEventListener('click', () => document.getElementById('send-memo-modal').style.display = 'none');
    document.getElementById('send-memo-form')?.addEventListener('submit', handleMemoSubmitFromModal);

    // --- Stats ---
    document.getElementById('refresh-stats')?.addEventListener('click', async () => { 
        if(typeof loadStatsData === 'function') {
            await loadStatsData(true); // Force Refresh
            showAlert('สำเร็จ', 'อัปเดตข้อมูลสถิติเรียบร้อยแล้ว'); 
        }
    });
    document.getElementById('export-stats')?.addEventListener('click', () => {
        if(typeof exportStatsReport === 'function') exportStatsReport();
    });

    // --- Navigation ---
    document.getElementById('navigation')?.addEventListener('click', async (e) => {
        const navButton = e.target.closest('.nav-button');
        if (navButton && navButton.dataset.target) { await switchPage(navButton.dataset.target); }
    });

    // --- Forms & Inputs ---
    setupVehicleOptions();
    
    const adminMemoStatus = document.getElementById('admin-memo-status');
    if (adminMemoStatus) {
        adminMemoStatus.addEventListener('change', function(e) {
            const fileUploads = document.getElementById('admin-file-uploads');
            if (e.target.value === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') { 
                fileUploads.classList.remove('hidden'); 
            } else { 
                fileUploads.classList.add('hidden'); 
            }
        });
    }

    const reqForm = document.getElementById('request-form');
    if (reqForm) reqForm.addEventListener('submit', handleRequestFormSubmit);
    
    document.getElementById('form-add-attendee')?.addEventListener('click', () => addAttendeeField());
    document.getElementById('form-import-excel')?.addEventListener('click', () => document.getElementById('excel-file-input').click());
    document.getElementById('excel-file-input')?.addEventListener('change', handleExcelImport); 
    document.getElementById('form-download-template')?.addEventListener('click', downloadAttendeeTemplate); 
    
    document.querySelectorAll('input[name="expense_option"]').forEach(radio => radio.addEventListener('change', toggleExpenseOptions));
    
    document.querySelectorAll('input[name="modal_memo_type"]').forEach(radio => radio.addEventListener('change', (e) => {
        const fileContainer = document.getElementById('modal-memo-file-container');
        const fileInput = document.getElementById('modal-memo-file');
        const isReimburse = e.target.value === 'reimburse';
        fileContainer.classList.toggle('hidden', isReimburse);
        if(fileInput) fileInput.required = !isReimburse;
    }));
    
    document.querySelectorAll('input[name="vehicle_option"]').forEach(checkbox => {checkbox.addEventListener('change', toggleVehicleDetails);});
    
    document.getElementById('profile-form')?.addEventListener('submit', handleProfileUpdate);
    document.getElementById('password-form')?.addEventListener('submit', handlePasswordUpdate);
    document.getElementById('show-password-toggle')?.addEventListener('change', togglePasswordVisibility);
    
    document.getElementById('form-department')?.addEventListener('change', (e) => {
        const selectedPosition = e.target.value;
        const headNameInput = document.getElementById('form-head-name');
        if(headNameInput) headNameInput.value = specialPositionMap[selectedPosition] || '';
    });
    
    const searchInput = document.getElementById('search-requests');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderRequestsList(allRequestsCache, userMemosCache, e.target.value));
    }

    // --- Admin User Mgmt ---
    document.getElementById('add-user-button')?.addEventListener('click', openAddUserModal);
    document.getElementById('download-user-template-button')?.addEventListener('click', downloadUserTemplate);
    document.getElementById('import-users-button')?.addEventListener('click', () => document.getElementById('user-excel-input').click());
    document.getElementById('user-excel-input')?.addEventListener('change', handleUserImport);
    
    // --- Admin Tabs ---
    document.getElementById('admin-view-requests-tab')?.addEventListener('click', async (e) => {
        document.getElementById('admin-view-memos-tab').classList.remove('active');
        e.target.classList.add('active');
        document.getElementById('admin-requests-view').classList.remove('hidden');
        document.getElementById('admin-memos-view').classList.add('hidden');
        await fetchAllRequestsForCommand();
    });
    
    document.getElementById('admin-view-memos-tab')?.addEventListener('click', async (e) => {
        document.getElementById('admin-view-requests-tab').classList.remove('active');
        e.target.classList.add('active');
        document.getElementById('admin-memos-view').classList.remove('hidden');
        document.getElementById('admin-requests-view').classList.add('hidden');
        await fetchAllMemos();
    });

    // --- [IMPORTANT] ADMIN SYNC BUTTON (HYBRID) ---
    const adminSyncBtn = document.getElementById('admin-sync-btn');
    if (adminSyncBtn) {
        adminSyncBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ คำเตือน: การ Sync จะดึงข้อมูลทั้งหมดจาก Google Sheets มาทับใน Firebase\n\nควรทำเมื่อ:\n1. เริ่มระบบครั้งแรก\n2. ข้อมูลไม่ตรงกัน\n\nคุณต้องการดำเนินการต่อหรือไม่?')) return;
            
            toggleLoader('admin-sync-btn', true);
            
            try {
                // 1. Sync Requests (คำขอ)
                if (typeof syncAllDataFromSheetToFirebase === 'function') {
                    const reqResult = await syncAllDataFromSheetToFirebase();
                    console.log('Request Sync Result:', reqResult);
                }

                // 2. Sync Users (ผู้ใช้งาน - เพื่อการ Login ที่เร็วขึ้น)
                if (typeof syncUsersToFirebase === 'function') {
                    const userResult = await syncUsersToFirebase();
                    console.log('User Sync Result:', userResult);
                }

                showAlert('สำเร็จ', 'อัปเดตฐานข้อมูล (คำขอและผู้ใช้งาน) เรียบร้อยแล้ว');
                
                // รีโหลดหน้า Admin เพื่อแสดงข้อมูลล่าสุด
                if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();

            } catch (error) {
                showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการ Sync: ' + error.message);
            } finally {
                toggleLoader('admin-sync-btn', false);
            }
        });
    }

    // --- [NEW] NOTIFICATION BELL (กระดิ่งแจ้งเตือน) ---
    const notifBtn = document.getElementById('notification-btn');
    const notifDropdown = document.getElementById('notification-dropdown');

    if (notifBtn && notifDropdown) {
        // กดปุ่มกระดิ่ง -> เปิด/ปิด Dropdown
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // กันไม่ให้ไปโดน event คลิกพื้นหลัง
            notifDropdown.classList.toggle('hidden');
        });

        // คลิกที่อื่น -> ปิด Dropdown
        document.addEventListener('click', (e) => {
            if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.classList.add('hidden');
            }
        });
    }

    // --- [NEW] PROMPT SEND MEMO MODAL (แจ้งเตือนส่งงานทันทีหลังสร้าง) ---
    const promptModal = document.getElementById('prompt-send-memo-modal');
    const closePrompt = () => { if(promptModal) promptModal.style.display = 'none'; };

    // ปุ่มปิด (X) และปุ่มส่งภายหลัง
    document.getElementById('prompt-send-memo-close-btn')?.addEventListener('click', closePrompt);
    document.getElementById('prompt-send-memo-later-btn')?.addEventListener('click', closePrompt);

    // ปุ่ม "ส่งบันทึกข้อความทันที"
    document.getElementById('prompt-send-memo-now-btn')?.addEventListener('click', () => {
        // 1. ปิดหน้าต่าง Prompt
        closePrompt();
        
        // 2. ดึง ID ที่ฝากไว้
        const requestId = document.getElementById('prompt-send-memo-request-id').value;
        
        // 3. เปิดหน้าต่างส่งบันทึก (Send Memo Modal)
        if (requestId) {
            document.getElementById('memo-modal-request-id').value = requestId;
            document.getElementById('send-memo-modal').style.display = 'flex';
        } else {
            showAlert('ข้อผิดพลาด', 'ไม่พบรหัสคำขอ');
        }
    });

    // Error Handling
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        if (event.error && event.error.message && event.error.message.includes('openEditPageDirect')) return;
    });
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
    });
}

function handleExcelImport(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            const attendeesList = document.getElementById('form-attendees-list');
            if(attendeesList) attendeesList.innerHTML = '';
            
            jsonData.forEach(row => {
                if (row['ชื่อ-นามสกุล'] && row['ตำแหน่ง']) {
                    const list = document.getElementById('form-attendees-list');
                    const attendeeDiv = document.createElement('div');
                    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
                    attendeeDiv.innerHTML = `
                    <input type="text" class="form-input attendee-name md:col-span-1" value="${escapeHtml(row['ชื่อ-นามสกุล'])}" required>
                    <div class="attendee-position-wrapper md:col-span-1">
                        <select class="form-input attendee-position-select"><option value="other">อื่นๆ</option></select>
                        <input type="text" class="form-input attendee-position-other mt-1" value="${escapeHtml(row['ตำแหน่ง'])}">
                    </div>
                    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>`;
                    list.appendChild(attendeeDiv);
                }
            });
            showAlert('สำเร็จ', 'นำเข้าข้อมูลผู้ร่วมเดินทางสำเร็จ');
        };
        reader.readAsArrayBuffer(file);
    } catch (error) { showAlert('ผิดพลาด', error.message); } finally { e.target.value = ''; }
}

function downloadAttendeeTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([['ชื่อ-นามสกุล', 'ตำแหน่ง'],['ตัวอย่าง ผู้ใช้', 'ครู']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'attendee_template.xlsx');
}

function enhanceEditFunctionSafety() {
    const requiredFunctions = ['openEditPage', 'generateDocumentFromDraft', 'getEditFormData'];
    requiredFunctions.forEach(funcName => {
        if (typeof window[funcName] !== 'function') {
            console.warn(`Function ${funcName} is not yet loaded.`);
            window[funcName] = function() { showAlert("ระบบกำลังโหลด", "กรุณารอสักครู่หรือรีเฟรชหน้า"); };
        }
    });
}

// ✅ ฟังก์ชันตรวจสอบสถานะ Server (Health Check)
async function checkPDFServerStatus() {
    const statusContainer = document.getElementById('server-status-container');
    const statusText = document.getElementById('server-status-text');
    const statusDot = document.getElementById('status-dot');
    const statusPing = document.getElementById('status-ping');

    if (!statusContainer) return;

    statusContainer.classList.remove('hidden');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // ตรวจสอบการเชื่อมต่อ (no-cors เพื่อไม่ให้ติด Block)
        await fetch(PDF_ENGINE_CONFIG.BASE_URL, {
            method: 'GET',
            signal: controller.signal,
            mode: 'no-cors'
        });

        clearTimeout(timeoutId);

        // Online State
        statusText.textContent = "ระบบ PDF พร้อมใช้งาน";
        statusText.className = "font-medium text-green-600";
        statusDot.className = "relative inline-flex rounded-full h-2 w-2 bg-green-500";
        statusPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75";
        statusContainer.className = "hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-xs";

    } catch (error) {
        // Offline State
        console.warn("PDF Server Check Failed:", error);
        statusText.textContent = "ระบบ PDF ขัดข้อง";
        statusText.className = "font-medium text-red-600";
        statusDot.className = "relative inline-flex rounded-full h-2 w-2 bg-red-500";
        statusPing.className = "hidden";
        statusContainer.className = "hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-xs";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('App Initializing...');
    setupYearSelectors();
    // Check Config
    if (typeof escapeHtml !== 'function') {
        console.error("Config.js not loaded or missing escapeHtml!");
        alert("System Error: Configuration missing. Please refresh.");
        return;
    }

    if (typeof loadPublicWeeklyData === 'function') loadPublicWeeklyData();
    
    // ✅ เรียกใช้ฟังก์ชันตรวจสอบสถานะ PDF Server
    checkPDFServerStatus();

    setupEventListeners();
    enhanceEditFunctionSafety();
    
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Sarabun', sans-serif";
        Chart.defaults.font.size = 14;
        Chart.defaults.color = '#374151';
    }
    
    const navEdit = document.getElementById('nav-edit');
    if (navEdit) navEdit.classList.add('hidden');
    
    if (typeof resetEditPage === 'function') resetEditPage();
    
    const user = getCurrentUser();
    if (user) { initializeUserSession(user); } else { showLoginScreen(); }
});
// ฟังก์ชันสร้างตัวเลือกปี (ย้อนหลัง 3 ปี)
function setupYearSelectors() {
    const currentYear = new Date().getFullYear() + 543;
    const years = [currentYear, currentYear - 1, currentYear - 2]; // กำหนดจำนวนปีที่ต้องการ
    
    const createOptions = (selectId) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        select.innerHTML = years.map(y => 
            `<option value="${y}" ${y === currentYear ? 'selected' : ''}>📂 ปีงบประมาณ ${y} ${y === currentYear ? '(ปัจจุบัน)' : ''}</option>`
        ).join('');

        // เมื่อเปลี่ยนปี ให้โหลดข้อมูลใหม่ทันที
        select.addEventListener('change', async (e) => {
            if (selectId === 'user-year-select') {
                await fetchUserRequests();
            } else if (selectId === 'admin-year-select') {
                await fetchAllRequestsForCommand();
            }
        });
    };

    createOptions('user-year-select');
    createOptions('admin-year-select');
}
