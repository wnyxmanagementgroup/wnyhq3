// --- PAGE NAVIGATION & EVENT LISTENERS ---

let notificationUnsubscribe = null;
let notificationFallbackUsed = false;
const WORKFLOW_SETTINGS_CACHE_KEY = 'wny_workflow_settings_cache_v1';
const WORKFLOW_SETTINGS_OWNER_USERNAMES = ['admin', 'admin2'];
const DEFAULT_WORKFLOW_SETTINGS = {
    forceMemoUploadForAll: false,
    requiredMemoUploads: {
        refDoc: true,
        exchange: false
    }
};
window.systemWorkflowSettings = window.systemWorkflowSettings || normalizeWorkflowSettings(readCachedWorkflowSettings());
window.lastPersistedWorkflowSettings = window.lastPersistedWorkflowSettings || normalizeWorkflowSettings(readCachedWorkflowSettings());
window.systemWorkflowSettingsMeta = window.systemWorkflowSettingsMeta || {
    source: 'cache',
    warningMessage: ''
};

// ★ ติดตามลำดับการอัพโหลดของ send-memo modal (timestamp ของแต่ละ input)
window._memoUploadOrder = {};

// --- Sidebar ---
const PAGE_TITLES = {
    'dashboard-page':             'แดชบอร์ด',
    'form-page':                  'ร่างคำขอไปราชการ',
    'approval-page':              'เอกสารรอลงนาม',
    'send-memo-page':             'ส่งบันทึกข้อความ',
    'stats-page':                 'สถิติข้อมูล',
    'profile-page':               'ข้อมูลส่วนตัว',
    'edit-page':                  'แก้ไขคำขอ',
    'command-generation-page':    'จัดการบันทึก/คำสั่ง',
    'admin-users-page':           'จัดการผู้ใช้',
    'admin-approval-links-page':  'จัดการลิงก์ลงนาม',
    'admin-system-settings-page': 'ตั้งค่าระบบ',
};

const MOBILE_SIDEBAR_BREAKPOINT = 1024;
const MOBILE_EDGE_SWIPE_ZONE = 28;
const MOBILE_EDGE_SWIPE_TRIGGER = 72;

function isMobileSidebarViewport() {
    return window.innerWidth <= MOBILE_SIDEBAR_BREAKPOINT;
}

function syncSidebarLayoutState() {
    const sidebar = document.getElementById('sidebar');
    const app = document.getElementById('main-app');
    if (!sidebar || !app) return;

    const isCollapsed = sidebar.classList.contains('collapsed');
    app.classList.toggle('sidebar-open-mobile', isMobileSidebarViewport() && !isCollapsed);
}

function setupMobileSidebarEdgeGesture() {
    if (window._mobileSidebarEdgeGestureSetup) return;
    window._mobileSidebarEdgeGestureSetup = true;

    let gesture = null;

    const resetGesture = () => {
        gesture = null;
    };

    document.addEventListener('touchstart', (event) => {
        if (!isMobileSidebarViewport()) return;
        if (!event.touches || event.touches.length !== 1) return;

        const sidebar = document.getElementById('sidebar');
        const mainApp = document.getElementById('main-app');
        if (!sidebar || !mainApp || mainApp.classList.contains('hidden')) return;
        if (!sidebar.classList.contains('collapsed')) return;

        const touch = event.touches[0];
        if (touch.clientX > MOBILE_EDGE_SWIPE_ZONE) return;

        const target = event.target;
        if (target && target.closest && target.closest('.table-wrapper, .overflow-x-auto, textarea, input, select, canvas, iframe')) {
            return;
        }

        gesture = {
            startX: touch.clientX,
            startY: touch.clientY,
            locked: false
        };
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
        if (!gesture || !isMobileSidebarViewport()) return;
        if (!event.touches || event.touches.length !== 1) {
            resetGesture();
            return;
        }

        const touch = event.touches[0];
        const deltaX = touch.clientX - gesture.startX;
        const deltaY = touch.clientY - gesture.startY;

        if (!gesture.locked) {
            if (Math.abs(deltaX) < 10) return;
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                resetGesture();
                return;
            }
            gesture.locked = true;
        }

        if (deltaX <= 0) {
            resetGesture();
            return;
        }

        event.preventDefault();

        if (deltaX >= MOBILE_EDGE_SWIPE_TRIGGER) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('collapsed')) {
                sidebar.classList.remove('collapsed');
                syncSidebarLayoutState();
            }
            resetGesture();
        }
    }, { passive: false });

    document.addEventListener('touchend', resetGesture, { passive: true });
    document.addEventListener('touchcancel', resetGesture, { passive: true });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('collapsed');
    if (!isMobileSidebarViewport()) {
        localStorage.setItem('sidebar-collapsed', sidebar.classList.contains('collapsed'));
    }
    syncSidebarLayoutState();
}

// Restore sidebar state from localStorage
document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    if (isMobileSidebarViewport()) {
        sidebar.classList.add('collapsed');
    } else if (localStorage.getItem('sidebar-collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }
    syncSidebarLayoutState();
    setupMobileSidebarEdgeGesture();
});

window.addEventListener('resize', () => {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    if (isMobileSidebarViewport()) {
        sidebar.classList.add('collapsed');
    }
    syncSidebarLayoutState();
});

async function switchPage(targetPageId) {
    console.log("🔄 Switching to page:", targetPageId);

    // Hide all pages
    document.querySelectorAll('.page-view').forEach(page => { page.classList.add('hidden'); });

    // Show target page
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) { targetPage.classList.remove('hidden'); }

    // Update active nav button
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.target === targetPageId) { btn.classList.add('active'); }
    });

    // Update topbar title
    const titleEl = document.getElementById('page-title');
    if (titleEl && PAGE_TITLES[targetPageId]) {
        titleEl.textContent = PAGE_TITLES[targetPageId];
    }

    // --- เพิ่ม Logic สำหรับหน้า send-memo-page ---
    if (targetPageId === 'send-memo-page') {
        if (typeof fetchPendingMemos === 'function') {
            fetchPendingMemos(); // เรียกฟังก์ชันโหลดข้อมูลเฉพาะหน้านี้
        }
    }
// เพิ่มต่อจากเงื่อนไขของ send-memo-page ก็ได้ครับ
    if (targetPageId === 'approval-page') {
        if (typeof loadPendingApprovals === 'function') {
            loadPendingApprovals();
        }
    }
    if (targetPageId === 'admin-system-settings-page') {
        if (typeof loadSystemWorkflowSettings === 'function') loadSystemWorkflowSettings();
    }
    if (targetPageId === 'admin-heads-page') {
        // admin-heads-page ถูกรวมเข้า admin-users-page tab แล้ว — redirect ไปหน้านั้นแทน
        switchPage('admin-users-page');
        setTimeout(() => switchUsersTab('heads'), 50);
        return;
    }
    // --- Logic เฉพาะของแต่ละหน้า (Parallel Processing) ---

    if (targetPageId === 'edit-page') { 
        setTimeout(() => { setupEditPageEventListeners(); }, 100); 
    }
    
    if (targetPageId === 'dashboard-page') {
        // [แก้ไข] ลบ await ออก เพื่อให้โหลดข้อมูลแบบ Background Process
        // ผู้ใช้จะเห็น Loader หมุนๆ บนหน้าจอ แต่ Popup จะเด้งได้เลย
        fetchUserRequests(); 
        
        // เรียก Popup แจ้งเตือนทันที
        showReminderModal();
    }
    
    if (targetPageId === 'form-page') { 
        // ฟอร์มควรรอให้รีเซ็ตเสร็จก่อน เพื่อป้องกันข้อมูลค้าง
        await resetRequestForm(); 
        setTimeout(() => { tryAutoFillRequester(); }, 100); 
    }
    
    if (targetPageId === 'profile-page') {
        if (typeof loadProfileData === 'function') loadProfileData();
    }
    
    if (targetPageId === 'stats-page') {
        // [แก้ไข] ลบ await ออก ให้โหลดกราฟเบื้องหลัง
        if (typeof loadStatsData === 'function') loadStatsData(); 
    }
    
    if (targetPageId === 'admin-users-page') {
        // รีเซ็ตกลับไป Tab รายชื่อผู้ใช้เสมอเมื่อเปิดหน้านี้
        switchUsersTab('users');
        if (typeof fetchAllUsers === 'function') fetchAllUsers();
    }
    
    if (targetPageId === 'command-generation-page') {
        const tab = document.getElementById('admin-view-dashboard-tab');
        if (tab) tab.click();
    }

    if (isMobileSidebarViewport()) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            sidebar.classList.add('collapsed');
            syncSidebarLayoutState();
        }
    }
}

// ── สลับ Tab ในหน้าจัดการผู้ใช้ ('users' | 'heads') ──────────────
function switchUsersTab(tab) {
    const tabs = ['users', 'heads'];
    tabs.forEach(t => {
        const panel = document.getElementById('users-tab-panel-' + t);
        const btn   = document.getElementById('users-tab-btn-' + t);
        if (panel) panel.classList.toggle('hidden', t !== tab);
        if (btn) {
            if (t === tab) {
                btn.classList.remove('border-transparent', 'text-gray-500');
                btn.classList.add('border-blue-600', 'text-blue-700');
            } else {
                btn.classList.remove('border-blue-600', 'text-blue-700');
                btn.classList.add('border-transparent', 'text-gray-500');
            }
        }
    });
    // โหลดข้อมูลหัวหน้าส่วนเมื่อสลับไป tab นั้น
    if (tab === 'heads') {
        if (typeof loadHeadsManagement === 'function') loadHeadsManagement();
    }
}

// ★★★ เพิ่มฟังก์ชันนี้ไว้ท้ายไฟล์ main.js หรือบริเวณใกล้เคียง switchPage ★★★
function showReminderModal() {
    // ตรวจสอบว่าเคยแสดงไปแล้วหรือยังใน Session นี้ (ถ้าต้องการให้แสดงทุกครั้งที่ Login ใหม่)
    const hasShown = sessionStorage.getItem('loginReminderShown');
    
    // ถ้ายังไม่เคยแสดง ให้แสดง (เมื่อ Login เข้ามาครั้งแรกจะแสดงแน่นอน)
    if (!hasShown) {
        const modal = document.getElementById('reminder-modal');
        if (modal) {
            modal.style.display = 'flex';
            
            // ตั้งค่าปุ่มปิด
            const closeBtn = document.getElementById('close-reminder-modal');
            
            // ลบ Event Listener เก่าออกก่อนเพื่อป้องกันการซ้อนทับ (Safety)
            const newBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newBtn, closeBtn);
            
            newBtn.addEventListener('click', function() {
                modal.style.display = 'none';
                sessionStorage.setItem('loginReminderShown', 'true'); // บันทึกว่าแสดงแล้ว
            });
        }
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
// [เพิ่มฟังก์ชัน Real-time Notification]
function startRealtimeNotifications() {
    const user = getCurrentUser();
    if (!user || typeof db === 'undefined') return;

    // ถ้าเคยฟังอยู่แล้ว ให้ยกเลิกก่อนกันซ้ำ
    if (notificationUnsubscribe) {
        notificationUnsubscribe();
    }
    notificationFallbackUsed = false;

    console.log("🔔 Starting Real-time Notification Listener...");

    // ใช้ onSnapshot เพื่อฟังการเปลี่ยนแปลงข้อมูลแบบทันที
    notificationUnsubscribe = db.collection('requests')
        .where('username', '==', user.username)
        .onSnapshot((snapshot) => {
            const requests = [];

            // วนลูปเช็คเอกสารทุกตัวที่มีการเปลี่ยนแปลง
            snapshot.forEach((doc) => {
                requests.push({ id: doc.id, ...doc.data() });
            });

            // อัปเดต UI ทันที
            renderNotificationUI(buildUserRequestBadgeSummary(requests));
        }, (error) => {
            const message = String(error?.message || error || '');
            if (/Missing or insufficient permissions/i.test(message)) {
                if (!notificationFallbackUsed && typeof fetchUserRequests === 'function') {
                    notificationFallbackUsed = true;
                    fetchUserRequests(true).catch((fallbackError) => {
                        console.warn('Notification fallback fetch error:', fallbackError);
                    });
                }
                return;
            }
            console.warn("Real-time Notification Error:", error);
        });

    refreshApprovalInboxBadge();
}

// เก็บรายการค้างส่งไว้ให้ openPendingMemoList() เข้าถึงได้
let _pendingMemoItems = [];

function setNavBadgeState(badgeId, count, tone = 'danger') {
    const badge = document.getElementById(badgeId);
    if (!badge) return;

    const safeCount = Math.max(0, Number(count) || 0);
    if (safeCount <= 0) {
        badge.textContent = '0';
        badge.classList.add('hidden');
        return;
    }

    badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
    badge.classList.remove('hidden');

    if (badge.classList.contains('nav-badge')) {
        badge.classList.remove('nav-badge--danger', 'nav-badge--success');
        badge.classList.add(tone === 'success' ? 'nav-badge--success' : 'nav-badge--danger');
    }
}

function buildUserRequestBadgeSummary(requests = []) {
    const pendingMemoItems = [];
    let completedReadyCount = 0;

    requests.forEach((req = {}) => {
        const reqId = req.requestId || req.id || '';
        const draftMemoUrl = req.fileUrl || req.pdfUrl || req.memoPdfUrl || req.currentPdfUrl || '';
        const completedMemoUrl = req.completedMemoUrl || '';
        const adminMemoUrl = req.adminMemoUrl || '';
        const status = String(req.status || '');
        const memoStatus = String(req.memoStatus || '');

        const isReadyToUse = status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน'
            || (!!adminMemoUrl && status === 'เสร็จสิ้น');
        const isFixing = status === 'นำกลับไปแก้ไข'
            || memoStatus === 'นำกลับไปแก้ไข'
            || (req.wasRejected === true
                && status !== 'เสร็จสิ้น'
                && status !== 'เสร็จสิ้น/รับไฟล์ไปใช้งาน');
        const isSubmitted = status === 'Submitted';
        const isFinalStatus = isReadyToUse || status === 'ไม่อนุมัติ' || status === 'ยกเลิก';
        const needsToSend = (draftMemoUrl && !completedMemoUrl && !isSubmitted && !isFinalStatus) || isFixing;

        if (needsToSend) {
            pendingMemoItems.push({
                id: reqId,
                purpose: req.purpose,
                startDate: req.startDate,
                isFix: isFixing
            });
        }

        if (isReadyToUse) {
            completedReadyCount++;
        }
    });

    return {
        pendingMemoCount: pendingMemoItems.length,
        pendingMemoItems,
        completedReadyCount
    };
}

async function refreshApprovalInboxBadge() {
    const user = getCurrentUser();
    const badge = document.getElementById('approval-badge');
    if (!badge) return;

    const targetStatus = user ? getTargetStatusForUser(user._approverRole || user.role) : '';
    if (!user || !targetStatus) {
        badge.classList.add('hidden');
        return;
    }

    try {
        let count = 0;
        if (typeof db !== 'undefined' && db) {
            try {
                const snapshot = await db.collection('requests')
                    .where('docStatus', '==', targetStatus)
                    .get();
                count = snapshot.size;
            } catch (firestoreError) {
                const message = String(firestoreError?.message || firestoreError || '');
                if (!/Missing or insufficient permissions/i.test(message)) throw firestoreError;
                const docs = await getApprovalDocsFallback(targetStatus);
                count = docs.length;
            }
        } else {
            const docs = await getApprovalDocsFallback(targetStatus);
            count = docs.length;
        }
        setNavBadgeState('approval-badge', count, 'danger');
    } catch (error) {
        console.warn('refreshApprovalInboxBadge error:', error);
    }
}

function renderNotificationUI(summary = {}) {
    const {
        pendingMemoCount = 0,
        pendingMemoItems = [],
        completedReadyCount = 0
    } = summary;

    _pendingMemoItems = pendingMemoItems;
    setNavBadgeState('send-memo-badge', pendingMemoCount, 'danger');
    setNavBadgeState('user-completed-badge', completedReadyCount, 'success');

    // ★ แทนที่ปุ่มแจ้งเตือน → ตรวจ isFixing แล้วเปิด send modal อัตโนมัติที่ dashboard
    const fixingItems = pendingMemoItems.filter(item => item.isFix);
    if (fixingItems.length === 0) return;

    // ★ รีเฟรช dashboard เสมอเมื่อมีรายการ isFixing (ไม่ถูก block โดย sessionStorage)
    //    เพื่อให้สถานะ "นำกลับไปแก้ไข" อัปเดตทันทีที่แอดมินเปลี่ยน
    if (typeof fetchUserRequests === 'function') {
        fetchUserRequests(true).then(() => {
            // ★ Modal auto-open: guard ด้วย sessionStorage แค่การเปิด modal เท่านั้น
            //    (ไม่ block การรีเฟรชข้างบน)
            fixingItems.forEach(item => {
                if (!item.id) return;
                const sessionKey = `fixingModalOpened_${item.id}`;
                // เปิด modal ได้แค่ครั้งเดียวต่อ session ต่อ doc เพื่อกันซ้ำ
                if (sessionStorage.getItem(sessionKey)) return;
                sessionStorage.setItem(sessionKey, '1');

                // สลับไปหน้า dashboard ก่อนถ้าไม่ได้อยู่
                const dashPage = document.getElementById('dashboard-page');
                if (dashPage && dashPage.classList.contains('hidden')) {
                    if (typeof switchPage === 'function') switchPage('dashboard-page');
                }
                setTimeout(() => {
                    if (typeof openSendMemoFromList === 'function') {
                        openSendMemoFromList(item.id);
                    }
                }, 400);
            });
        });
    }
}

function getSystemWorkflowSettings() {
    if (!window.systemWorkflowSettings || typeof window.systemWorkflowSettings !== 'object') {
        window.systemWorkflowSettings = normalizeWorkflowSettings(readCachedWorkflowSettings());
    }
    return window.systemWorkflowSettings;
}

function getSystemWorkflowSettingsMeta() {
    if (!window.systemWorkflowSettingsMeta || typeof window.systemWorkflowSettingsMeta !== 'object') {
        window.systemWorkflowSettingsMeta = { source: 'cache', warningMessage: '' };
    }
    return window.systemWorkflowSettingsMeta;
}

function normalizeWorkflowSettings(source = {}) {
    const rawRequired = source.requiredMemoUploads || {};
    return {
        forceMemoUploadForAll: !!source.forceMemoUploadForAll,
        requiredMemoUploads: {
            refDoc: rawRequired.refDoc !== false,
            exchange: !!rawRequired.exchange
        }
    };
}

function readCachedWorkflowSettings() {
    try {
        const raw = localStorage.getItem(WORKFLOW_SETTINGS_CACHE_KEY);
        return raw ? JSON.parse(raw) : DEFAULT_WORKFLOW_SETTINGS;
    } catch (error) {
        console.warn('readCachedWorkflowSettings error:', error);
        return DEFAULT_WORKFLOW_SETTINGS;
    }
}

function cacheWorkflowSettings(settings) {
    try {
        localStorage.setItem(WORKFLOW_SETTINGS_CACHE_KEY, JSON.stringify(normalizeWorkflowSettings(settings)));
    } catch (error) {
        console.warn('cacheWorkflowSettings error:', error);
    }
}

function getWorkflowSettingsOwnerPriority(data = {}) {
    const username = String(data.username || '').trim();
    const loginName = String(data.loginName || '').trim();
    const usernameRank = WORKFLOW_SETTINGS_OWNER_USERNAMES.indexOf(username);
    const loginRank = WORKFLOW_SETTINGS_OWNER_USERNAMES.indexOf(loginName);
    const rank = [usernameRank, loginRank].filter(v => v >= 0).sort((a, b) => a - b)[0];
    return Number.isInteger(rank) ? rank : Number.MAX_SAFE_INTEGER;
}

async function loadWorkflowSettingsFromAdminUserDoc() {
    try {
        const result = await apiCall('GET', 'getWorkflowSettings');
        if (result?.status === 'success' && result?.data) {
            return normalizeWorkflowSettings(result.data);
        }
    } catch (error) {
        console.warn('loadWorkflowSettingsFromAdminUserDoc Supabase/GAS error:', error);
    }
    return null;
}

async function saveWorkflowSettingsToAdminUserDoc(settings) {
    const currentUser = typeof getCurrentUser === 'function' ? (getCurrentUser() || {}) : {};
    const result = await apiCall('POST', 'saveWorkflowSettings', {
        ...normalizeWorkflowSettings(settings),
        updatedBy: currentUser.username || currentUser.loginName || ''
    });
    if (result?.status !== 'success') {
        throw new Error(result?.message || 'ไม่สามารถบันทึกการตั้งค่า workflow ได้');
    }
}

function isUnifiedMemoUploadEnabled() {
    return !!getSystemWorkflowSettings().forceMemoUploadForAll;
}

function getRequiredMemoUploadSettings() {
    const settings = getSystemWorkflowSettings();
    const requiredMemoUploads = settings.requiredMemoUploads || {};
    return {
        refDoc: requiredMemoUploads.refDoc !== false,
        exchange: !!requiredMemoUploads.exchange
    };
}

function updateSystemWorkflowSettingsPreview(forceEnabled = isUnifiedMemoUploadEnabled()) {
    const statusEl = document.getElementById('setting-force-memo-upload-status');
    const hintEl = document.getElementById('setting-force-memo-upload-hint');
    const checkbox = document.getElementById('setting-force-memo-upload');
    const requiredRefDocCheckbox = document.getElementById('setting-required-file-ref-doc');
    const requiredExchangeCheckbox = document.getElementById('setting-required-file-exchange');
    const requiredSummaryEl = document.getElementById('setting-required-upload-summary');
    const requiredDocs = getRequiredMemoUploadSettings();

    if (checkbox) checkbox.checked = !!forceEnabled;
    if (requiredRefDocCheckbox) requiredRefDocCheckbox.checked = !!requiredDocs.refDoc;
    if (requiredExchangeCheckbox) requiredExchangeCheckbox.checked = !!requiredDocs.exchange;

    if (statusEl) {
        statusEl.textContent = forceEnabled ? 'บังคับอัปโหลดทุกกรณี' : 'ใช้โหมดเดิม';
        statusEl.className = forceEnabled
            ? 'inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200'
            : 'inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200';
    }

    if (hintEl) {
        const baseHint = forceEnabled
            ? 'ขณะนี้ทุกคำขอจะใช้หน้าส่งบันทึกแบบแนบไฟล์/ส่งต่อในระบบเหมือนกันทั้งหมด'
            : 'โหมดปัจจุบันยังคงแยกการส่งบันทึกระหว่างกรณีเบิกกับไม่เบิกค่าใช้จ่าย';
        const warning = getSystemWorkflowSettingsMeta().warningMessage;
        hintEl.textContent = warning ? `${baseHint} | ${warning}` : baseHint;
    }

    if (requiredSummaryEl) {
        const requiredLabels = [];
        if (requiredDocs.refDoc) requiredLabels.push('หนังสือต้นเรื่อง/หนังสือเชิญ');
        if (requiredDocs.exchange) requiredLabels.push('ไฟล์แลกคาบสอน');
        requiredSummaryEl.textContent = requiredLabels.length > 0
            ? `เอกสารที่ระบบจะบังคับในโหมดอัปโหลด: ${requiredLabels.join(' และ ')}`
            : 'ตอนนี้ไม่มีเอกสารใดถูกบังคับ ระบบจะให้แนบได้ตามความจำเป็น';
    }
}

function applyMemoUploadRequirementLabels() {
    const requiredDocs = getRequiredMemoUploadSettings();
    const exchangeLabel = document.getElementById('file-exchange-label');
    const refDocLabel = document.getElementById('file-ref-doc-label');
    const summary = document.getElementById('memo-upload-requirements-summary');

    if (exchangeLabel) {
        exchangeLabel.className = requiredDocs.exchange
            ? 'form-label text-sm text-red-600 font-bold'
            : 'form-label text-sm text-gray-600';
        exchangeLabel.innerHTML = requiredDocs.exchange
            ? '* 1. ไฟล์แลกคาบสอน (PDF)'
            : '1. ไฟล์แลกคาบสอน (PDF) <span class="text-gray-400 font-normal">(ถ้ามี)</span>';
    }

    if (refDocLabel) {
        refDocLabel.className = requiredDocs.refDoc
            ? 'form-label text-sm text-red-600 font-bold'
            : 'form-label text-sm text-gray-600';
        refDocLabel.innerHTML = requiredDocs.refDoc
            ? '* 2. หนังสือต้นเรื่อง/หนังสือเชิญ (PDF)'
            : '2. หนังสือต้นเรื่อง/หนังสือเชิญ (PDF) <span class="text-gray-400 font-normal">(ถ้ามี)</span>';
    }

    if (summary) {
        const forced = [];
        if (requiredDocs.refDoc) forced.push('หนังสือต้นเรื่อง/หนังสือเชิญ');
        if (requiredDocs.exchange) forced.push('ไฟล์แลกคาบสอน');
        const baseSummary = forced.length > 0
            ? `เอกสารบังคับก่อนส่งต่อ: ${forced.join(' และ ')}`
            : 'เอกสารแนบทั้งหมดเป็นแบบไม่บังคับในโหมดนี้';
        const warning = getSystemWorkflowSettingsMeta().warningMessage;
        summary.textContent = warning ? `${baseSummary} | ${warning}` : baseSummary;
    }
}

function applyMemoSourceModeUI() {
    const sourceMode = window._memoSourceMode || 'auto';
    const sourceContainer = document.getElementById('memo-source-mode-container');
    const preSignedDisplay = document.getElementById('pre-signed-memo-display');
    const manualContainer = document.getElementById('memo-manual-upload-container');
    const autoBtn = document.getElementById('memo-source-auto-btn');
    const manualBtn = document.getElementById('memo-source-manual-btn');
    const manualInput = document.getElementById('file-signed-memo');
    const isUploadMode = (document.querySelector('input[name="modal_memo_type"]:checked')?.value || 'non_reimburse') !== 'reimburse'
        || isUnifiedMemoUploadEnabled();

    if (sourceContainer) sourceContainer.classList.toggle('hidden', !isUploadMode);
    if (preSignedDisplay) preSignedDisplay.classList.toggle('hidden', !isUploadMode || sourceMode !== 'auto' || !document.getElementById('pre-signed-memo-url')?.value);
    if (manualContainer) manualContainer.classList.toggle('hidden', !isUploadMode || sourceMode !== 'manual');

    if (autoBtn) {
        autoBtn.className = sourceMode === 'auto'
            ? 'btn bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200'
            : 'btn bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200';
    }
    if (manualBtn) {
        manualBtn.className = sourceMode === 'manual'
            ? 'btn bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200'
            : 'btn bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200';
    }
    if (manualInput) manualInput.required = isUploadMode && sourceMode === 'manual';
}

function applyMemoWorkflowModeUI() {
    const forceUploadMode = isUnifiedMemoUploadEnabled();
    const memoTypeContainer = document.getElementById('modal-memo-type-container');
    const banner = document.getElementById('memo-workflow-mode-banner');
    const reimburseRadio = document.getElementById('memo_type_reimburse');
    const nonReimburseRadio = document.getElementById('memo_type_non_reimburse');

    if (memoTypeContainer) memoTypeContainer.classList.toggle('hidden', forceUploadMode);
    if (banner) {
        banner.classList.toggle('hidden', !forceUploadMode);
        banner.textContent = forceUploadMode
            ? 'เปิดโหมดบังคับอัปโหลดไฟล์: ทุกคำขอจะใช้การส่งบันทึกแบบแนบไฟล์ในระบบเหมือนกันทั้งหมด'
            : '';
    }

    if (reimburseRadio) {
        reimburseRadio.disabled = forceUploadMode;
        if (forceUploadMode) reimburseRadio.checked = false;
    }
    if (nonReimburseRadio && forceUploadMode) {
        nonReimburseRadio.checked = true;
    }

    const selectedType = forceUploadMode
        ? 'non_reimburse'
        : (document.querySelector('input[name="modal_memo_type"]:checked')?.value || 'non_reimburse');
    const isUploadMode = selectedType !== 'reimburse';
    const requiredDocs = getRequiredMemoUploadSettings();

    const nonReimburseContainer = document.getElementById('modal-non-reimburse-files');
    const fileExchange = document.getElementById('file-exchange');
    const fileRefDoc = document.getElementById('file-ref-doc');
    if (nonReimburseContainer) {
        nonReimburseContainer.classList.toggle('hidden', !isUploadMode);
    }
    if (fileExchange) fileExchange.required = isUploadMode && !!requiredDocs.exchange;
    if (fileRefDoc) fileRefDoc.required = isUploadMode && !!requiredDocs.refDoc;

    const forwardContainer = document.getElementById('modal-forward-to-container');
    const forwardSelect = document.getElementById('modal-forward-to');
    if (forwardContainer) forwardContainer.classList.toggle('hidden', !isUploadMode);
    if (forwardSelect) forwardSelect.required = isUploadMode;

    const singleFileContainer = document.getElementById('modal-single-file-container');
    const oldFileContainer = document.getElementById('modal-memo-file-container');
    if (singleFileContainer) singleFileContainer.classList.add('hidden');
    if (oldFileContainer) oldFileContainer.classList.add('hidden');

    applyMemoUploadRequirementLabels();
    applyMemoSourceModeUI();
    updateSystemWorkflowSettingsPreview(forceUploadMode);
}

async function loadSystemWorkflowSettings() {
    const cachedSettings = normalizeWorkflowSettings(readCachedWorkflowSettings());
    window.systemWorkflowSettings = normalizeWorkflowSettings(getSystemWorkflowSettings());
    window.lastPersistedWorkflowSettings = cachedSettings;
    const meta = getSystemWorkflowSettingsMeta();
    meta.warningMessage = '';
    meta.source = 'cache';

    try {
        const result = await apiCall('GET', 'getWorkflowSettings');
        if (result?.status === 'success' && result?.data) {
            const remoteSettings = normalizeWorkflowSettings(result.data);
            window.systemWorkflowSettings = remoteSettings;
            window.lastPersistedWorkflowSettings = remoteSettings;
            cacheWorkflowSettings(remoteSettings);
            meta.source = 'remote';
        } else {
            throw new Error(result?.message || 'ไม่พบข้อมูล workflow settings');
        }
    } catch (error) {
        console.warn('loadSystemWorkflowSettings error:', error);
        const fallbackSettings = await loadWorkflowSettingsFromAdminUserDoc();
        if (fallbackSettings) {
            window.systemWorkflowSettings = fallbackSettings;
            window.lastPersistedWorkflowSettings = fallbackSettings;
            cacheWorkflowSettings(fallbackSettings);
            meta.source = 'api-fallback';
            meta.warningMessage = 'ไม่สามารถโหลดการตั้งค่ากลางได้ จึงใช้ค่าจากข้อมูลสำรองล่าสุด';
        } else {
            window.systemWorkflowSettings = cachedSettings;
            meta.warningMessage = 'ไม่สามารถโหลดการตั้งค่ากลางได้ จึงใช้ค่าล่าสุดที่เก็บไว้ในเครื่อง';
        }
    }

    applyMemoWorkflowModeUI();
    return getSystemWorkflowSettings();
}

async function saveSystemWorkflowSettings() {
    const checkbox = document.getElementById('setting-force-memo-upload');
    const requiredRefDocCheckbox = document.getElementById('setting-required-file-ref-doc');
    const requiredExchangeCheckbox = document.getElementById('setting-required-file-exchange');
    const btn = document.getElementById('save-workflow-settings-btn');
    const forceMemoUploadForAll = !!checkbox?.checked;
    const requiredMemoUploads = {
        refDoc: !!requiredRefDocCheckbox?.checked,
        exchange: !!requiredExchangeCheckbox?.checked
    };

    if (!checkbox) return;
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ กำลังบันทึก...';
    }

    const nextSettings = normalizeWorkflowSettings({
        forceMemoUploadForAll,
        requiredMemoUploads
    });
    const previousPersistedSettings = normalizeWorkflowSettings(window.lastPersistedWorkflowSettings || readCachedWorkflowSettings());
    const meta = getSystemWorkflowSettingsMeta();

    try {
        await saveWorkflowSettingsToAdminUserDoc({
            ...nextSettings,
            updatedBy: getCurrentUser()?.username || ''
        });

        window.systemWorkflowSettings = nextSettings;
        window.lastPersistedWorkflowSettings = nextSettings;
        cacheWorkflowSettings(nextSettings);
        meta.warningMessage = '';
        meta.source = 'remote';
        applyMemoWorkflowModeUI();
        showAlert('สำเร็จ', forceMemoUploadForAll
            ? 'เปิดโหมดบังคับอัปโหลดไฟล์สำหรับทุกคำขอเรียบร้อยแล้ว'
            : 'เปลี่ยนกลับไปใช้โหมดส่งบันทึกแบบเดิมเรียบร้อยแล้ว');
    } catch (error) {
        window.systemWorkflowSettings = previousPersistedSettings;
        window.lastPersistedWorkflowSettings = previousPersistedSettings;
        meta.warningMessage = 'บันทึกค่าไม่สำเร็จ ระบบกลับไปใช้ค่าล่าสุดที่บันทึกไว้แล้ว';
        applyMemoWorkflowModeUI();
        console.error('saveSystemWorkflowSettings error:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถบันทึกการตั้งค่า workflow ได้: ' + error.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '💾 บันทึกการตั้งค่า workflow';
        }
    }
}

// เปิด modal แสดงรายการค้างส่งเมื่อกดปุ่มแดง
function openPendingMemoList() {
    if (_pendingMemoItems.length === 0) return;

    // ถ้ามีแค่ 1 รายการ → เปิด modal ส่งทันที
    if (_pendingMemoItems.length === 1) {
        openSendMemoFromList(_pendingMemoItems[0].id);
        return;
    }

    // ถ้ามีหลายรายการ → แสดงรายการให้เลือก
    const listHtml = _pendingMemoItems.map(item => {
        const statusBadge = item.isFix
            ? `<span class="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded border border-red-200">ต้องแก้ไข</span>`
            : `<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200">รอส่ง</span>`;
        return `<button onclick="openSendMemoFromList('${item.id}'); document.getElementById('pending-list-modal').style.display='none';"
            class="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition mb-2 flex items-center justify-between gap-2">
            <div>
                <div class="flex items-center gap-2 mb-0.5">
                    <span class="font-bold text-sm text-indigo-700">${escapeHtml(item.id || 'รอเลข')}</span>
                    ${statusBadge}
                </div>
                <p class="text-xs text-gray-500">${escapeHtml(item.purpose || '')}</p>
            </div>
            <span class="text-gray-400 text-lg">›</span>
        </button>`;
    }).join('');

    // สร้าง/อัปเดต modal รายการค้างส่ง
    let modal = document.getElementById('pending-list-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pending-list-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[90]';
        document.body.appendChild(modal);
    }
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-[90%] max-w-md p-6">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-red-700">📤 รายการที่ยังไม่ส่งบันทึก</h3>
                <button onclick="document.getElementById('pending-list-modal').style.display='none'" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div>${listHtml}</div>
        </div>`;
    modal.style.display = 'flex';
}

function filterUserRequestsForDashboard(requests, searchTerm = '') {
    if (!Array.isArray(requests)) return [];

    const term = String(searchTerm || '').trim().toLowerCase();
    if (!term) return requests;

    return requests.filter(req =>
        (req.id && req.id.toLowerCase().includes(term)) ||
        (req.requestId && req.requestId.toLowerCase().includes(term)) ||
        (req.purpose && req.purpose.toLowerCase().includes(term)) ||
        (req.location && req.location.toLowerCase().includes(term))
    );
}

function setupEventListeners() {
    if (typeof setupFormConditions === 'function') setupFormConditions();
    
    // --- Auth & User Management ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // 1. ปุ่มสมัครสมาชิก (ผู้ใช้กดเองจากหน้า Login)
    const showRegBtn = document.getElementById('show-register-modal-button');
    if (showRegBtn) {
        showRegBtn.addEventListener('click', () => { 
            document.getElementById('register-modal').style.display = 'flex'; 
            
            // ซ่อนช่องเลือกสิทธิ์ ไม่ให้คนนอกเห็น
            const roleContainer = document.getElementById('reg-role')?.parentElement;
            if (roleContainer) roleContainer.style.display = 'none';
            
            // บังคับค่าให้เป็น 'user' เสมอเพื่อความปลอดภัย
            const roleSelect = document.getElementById('reg-role');
            if (roleSelect) roleSelect.value = 'user';
        });
    }

    // 2. ปุ่มเพิ่มผู้ใช้ (Admin กดจากหน้าจัดการผู้ใช้)
    // เพิ่มดักจับ Event ตรงนี้เพื่อเปิดแสดง Dropdown สิทธิ์
    const addUserBtn = document.getElementById('add-user-button');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            document.getElementById('register-modal').style.display = 'flex';
            
            // แสดงช่องเลือกสิทธิ์ให้ Admin ใช้งาน
            const roleContainer = document.getElementById('reg-role')?.parentElement;
            if (roleContainer) roleContainer.style.display = 'block';
            
            // ตั้งค่าเริ่มต้นเป็น user หรือค่าอื่นที่ต้องการ
            const roleSelect = document.getElementById('reg-role');
            if (roleSelect) roleSelect.value = 'user'; 
        });
    }
    
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
    // --- Edit User Management ---
document.getElementById('edit-user-form')?.addEventListener('submit', handleEditUserSubmit);
document.getElementById('edit-user-modal-close')?.addEventListener('click', () => { document.getElementById('edit-user-modal').style.display = 'none'; });
document.getElementById('edit-user-cancel')?.addEventListener('click', () => { document.getElementById('edit-user-modal').style.display = 'none'; });
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

    // ★ ติดตามลำดับการอัพโหลดของแต่ละไฟล์ใน send-memo modal
    ['file-signed-memo', 'file-exchange', 'file-ref-doc', 'file-other'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', e => {
            if (e.target.files[0]) window._memoUploadOrder[id] = Date.now();
            else delete window._memoUploadOrder[id];
        });
    });
    

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

    document.addEventListener('click', (e) => {
        if (!isMobileSidebarViewport()) return;

        const sidebar = document.getElementById('sidebar');
        if (!sidebar || sidebar.classList.contains('collapsed')) return;

        const clickedInsideSidebar = e.target.closest('#sidebar');
        const clickedHamburger = e.target.closest('.hamburger-btn');
        if (!clickedInsideSidebar && !clickedHamburger) {
            sidebar.classList.add('collapsed');
            syncSidebarLayoutState();
        }
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
    
    document.querySelectorAll('input[name="modal_memo_type"]').forEach(radio =>
        radio.addEventListener('change', () => applyMemoWorkflowModeUI())
    );
    document.getElementById('setting-force-memo-upload')?.addEventListener('change', (e) => {
        updateSystemWorkflowSettingsPreview(!!e.target.checked);
    });
    document.getElementById('setting-required-file-ref-doc')?.addEventListener('change', () => {
        const nextSettings = {
            ...getSystemWorkflowSettings(),
            requiredMemoUploads: {
                ...getRequiredMemoUploadSettings(),
                refDoc: !!document.getElementById('setting-required-file-ref-doc')?.checked,
                exchange: !!document.getElementById('setting-required-file-exchange')?.checked
            }
        };
        window.systemWorkflowSettings = nextSettings;
        applyMemoUploadRequirementLabels();
        updateSystemWorkflowSettingsPreview();
    });
    document.getElementById('setting-required-file-exchange')?.addEventListener('change', () => {
        const nextSettings = {
            ...getSystemWorkflowSettings(),
            requiredMemoUploads: {
                ...getRequiredMemoUploadSettings(),
                refDoc: !!document.getElementById('setting-required-file-ref-doc')?.checked,
                exchange: !!document.getElementById('setting-required-file-exchange')?.checked
            }
        };
        window.systemWorkflowSettings = nextSettings;
        applyMemoUploadRequirementLabels();
        updateSystemWorkflowSettingsPreview();
    });
    document.getElementById('save-workflow-settings-btn')?.addEventListener('click', saveSystemWorkflowSettings);
    applyMemoWorkflowModeUI();
    if (typeof refreshSignerPositionOptions === 'function') refreshSignerPositionOptions();
    
    document.querySelectorAll('input[name="vehicle_option"]').forEach(checkbox => {checkbox.addEventListener('change', toggleVehicleDetails);});
    
    document.getElementById('profile-form')?.addEventListener('submit', handleProfileUpdate);
    document.getElementById('password-form')?.addEventListener('submit', handlePasswordUpdate);
    document.getElementById('show-password-toggle')?.addEventListener('change', togglePasswordVisibility);
    
    document.getElementById('form-department')?.addEventListener('change', (e) => {
        if (typeof syncSignerHeadName === 'function') {
            syncSignerHeadName('form-department', 'form-head-name');
        } else {
            const selectedPosition = e.target.value;
            const headNameInput = document.getElementById('form-head-name');
            if(headNameInput) headNameInput.value = specialPositionMap[selectedPosition] || '';
        }
    });

    document.getElementById('memo-source-auto-btn')?.addEventListener('click', () => {
        window._memoSourceMode = 'auto';
        applyMemoSourceModeUI();
    });
    document.getElementById('memo-source-manual-btn')?.addEventListener('click', () => {
        window._memoSourceMode = 'manual';
        applyMemoSourceModeUI();
    });

    const searchInput = document.getElementById('search-requests');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const source = Array.isArray(window.userRequestsCache) ? window.userRequestsCache : [];
            renderUserRequests(filterUserRequestsForDashboard(source, e.target.value));
        });
    }

    document.getElementById('user-requests-list')?.addEventListener('click', handleRequestAction);

    // --- Admin User Mgmt ---
    document.getElementById('add-user-button')?.addEventListener('click', openAddUserModal);
    document.getElementById('download-user-template-button')?.addEventListener('click', downloadUserTemplate);
    document.getElementById('import-users-button')?.addEventListener('click', () => document.getElementById('user-excel-input').click());
    document.getElementById('user-excel-input')?.addEventListener('change', handleUserImport);
    
    // --- Admin Tabs (Color-coded strip) ---
    function switchAdminTab(tabName) {
        const cfg = {
            dashboard:    { btn: 'admin-view-dashboard-tab',    active: 'tab-dashboard', view: 'admin-dashboard-view'    },
            requests:     { btn: 'admin-view-requests-tab',     active: 'tab-requests',  view: 'admin-requests-view'     },
            memos:        { btn: 'admin-view-memos-tab',        active: 'tab-memos',     view: 'admin-memos-view'        },
            announcement: { btn: 'admin-view-announcement-tab', active: 'tab-announce',  view: 'admin-announcement-view' },
        };
        Object.entries(cfg).forEach(([name, c]) => {
            const btn  = document.getElementById(c.btn);
            const view = document.getElementById(c.view);
            const isActive = name === tabName;
            if (btn) {
                btn.classList.remove('tab-dashboard', 'tab-requests', 'tab-memos', 'tab-announce', 'tab-inactive');
                if (isActive) {
                    if (name === 'dashboard') {
                        btn.style.background = 'linear-gradient(135deg,#f9a8d4,#7dd3fc)';
                        btn.style.color = '#075985';
                    } else {
                        btn.style.background = '';
                        btn.style.color = '';
                        btn.classList.add(c.active);
                    }
                } else {
                    btn.style.background = '';
                    btn.style.color = '';
                    btn.classList.add('tab-inactive');
                }
            }
            if (view) view.classList.toggle('hidden', !isActive);
        });
    }

    // expose ให้ admin.js เรียกได้
    window.switchAdminTab = switchAdminTab;

    document.getElementById('admin-view-dashboard-tab')?.addEventListener('click', async () => {
        switchAdminTab('dashboard');
        if (typeof loadAdminDashboard === 'function') await loadAdminDashboard();
    });

    document.getElementById('admin-view-requests-tab')?.addEventListener('click', async () => {
        switchAdminTab('requests');
        await fetchAllRequestsForCommand();
    });

    document.getElementById('admin-view-memos-tab')?.addEventListener('click', async () => {
        switchAdminTab('memos');
        await fetchAllMemos();
    });

    // ── ผูก search requests กับ filter ──
    document.getElementById('admin-search-requests')?.addEventListener('input', () => {
        if (typeof _applyRequestFilterAndSearch === 'function') _applyRequestFilterAndSearch();
    });

    // ── ผูก search memo กับ filter ──
    document.getElementById('admin-search-memos')?.addEventListener('input', () => {
        if (typeof _applyMemoFilterAndSearch === 'function') _applyMemoFilterAndSearch();
    });

    // --- [IMPORTANT] ADMIN SYNC BUTTON (HYBRID) ---
    const adminSyncBtn = document.getElementById('admin-sync-btn');
    if (adminSyncBtn) {
        adminSyncBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ คำเตือน: การ Sync จะดึงข้อมูลจาก Google Sheets ไปซ่อม/อัปเดตใน Supabase\n\nควรทำเมื่อ:\n1. เริ่มระบบครั้งแรก\n2. ข้อมูลใน Supabase ไม่ตรงกับ Sheets\n\nคุณต้องการดำเนินการต่อหรือไม่?')) return;
            
            toggleLoader('admin-sync-btn', true);
            
            try {
                if (typeof syncAllDataFromSheetToSupabase === 'function') {
                    const syncResult = await syncAllDataFromSheetToSupabase();
                    console.log('Supabase Sync Result:', syncResult);
                }
                
                // รีโหลดหน้า Admin เพื่อแสดงข้อมูลล่าสุด
                if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();
                if (typeof fetchAllMemos === 'function') await fetchAllMemos();

            } catch (error) {
                showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการ Sync: ' + error.message);
            } finally {
                toggleLoader('admin-sync-btn', false);
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
    document.getElementById('admin-view-announcement-tab')?.addEventListener('click', () => {
        switchAdminTab('announcement');
        if (typeof loadAdminAnnouncementSettings === 'function') loadAdminAnnouncementSettings();
    });

    // Submit ฟอร์มประกาศ
    document.getElementById('admin-announcement-form')?.addEventListener('submit', handleSaveAnnouncement);

    // เริ่มต้นระบบแจ้งเตือน (ถ้า User Login อยู่แล้ว)
    const currentUser = getCurrentUser();
    if (currentUser) {
        startRealtimeNotifications();
    }
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
            if (typeof updateRequestFormTravelScheduleSection === 'function') updateRequestFormTravelScheduleSection();
            showAlert('สำเร็จ', 'นำเข้าข้อมูลผู้ร่วมเดินทางสำเร็จ');
        };
        reader.readAsArrayBuffer(file);
    } catch (error) { showAlert('ผิดพลาด', error.message); } finally { e.target.value = ''; }
}

function downloadAttendeeTemplate() {
    withDownloadIndicator(async () => {
        const ws = XLSX.utils.aoa_to_sheet([['ชื่อ-นามสกุล', 'ตำแหน่ง'],['ตัวอย่าง ผู้ใช้', 'ครู']]);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Template');
        XLSX.writeFile(wb, 'attendee_template.xlsx');
    }, 'กำลังสร้างไฟล์แม่แบบผู้ร่วมเดินทาง...');
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

document.addEventListener('DOMContentLoaded', async () => {
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
    
    // ตรวจสอบว่ามีลิงก์ลงนามพิเศษ (?sign=TOKEN) หรือไม่
    const _signToken = new URLSearchParams(window.location.search).get('sign');
    if (_signToken) {
        // โหมดลงนามผ่านลิงก์ — ไม่ต้อง Login
        if (typeof handleTokenSignFlow === 'function') {
            handleTokenSignFlow(_signToken);
        }
    } else {
        const user = getCurrentUser();
        if (user) { await initializeUserSession(user); } else { showLoginScreen(); }
    }
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
// --- เพิ่ม Helper Function ไว้บนสุดหรือท้ายไฟล์ admin.js ---
function convertToDirectLink(url) {
    if (!url) return null;
    try {
        // ถ้าเป็นลิงก์ Google Drive แบบ View ให้แปลงเป็น Direct Link
        if (url.includes('drive.google.com') && url.includes('/d/')) {
            const fileId = url.split('/d/')[1].split('/')[0];
            return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
    } catch (e) { console.error("Link conversion error", e); }
    return url;
}

// ฟังก์ชันสำหรับดูตัวอย่างรูปทันทีที่วางลิงก์
function updateAnnouncementPreview(url) {
    const preview = document.getElementById('current-announcement-img-preview');
    const img = preview.querySelector('img');
    const directUrl = convertToDirectLink(url);
    
    if (directUrl) {
        preview.classList.remove('hidden');
        img.src = directUrl;
    }
}

// --- แก้ไขฟังก์ชัน loadAdminAnnouncementSettings ---
async function loadAdminAnnouncementSettings() {
    if (!checkAdminAccess()) return;
    
    // Reset Form
    document.getElementById('announcement-active').checked = false;
    document.getElementById('announcement-title-input').value = '';
    document.getElementById('announcement-message-input').value = '';
    document.getElementById('announcement-image-input').value = ''; // Reset file input
    document.getElementById('announcement-image-url-input').value = ''; // Reset url input
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
            
            // แปลงลิงก์ให้แสดงผลได้
            const displayUrl = convertToDirectLink(data.imageUrl);
            preview.querySelector('img').src = displayUrl;
            
            // ใส่ค่าลงในช่อง URL ด้วย เพื่อให้แอดมินเห็นว่าลิงก์เดิมคืออะไร
            document.getElementById('announcement-image-url-input').value = displayUrl;
        }
    } catch (e) { 
        console.error("Load Announcement Error:", e); 
    }
}

// --- แก้ไขฟังก์ชัน handleSaveAnnouncement ---
async function handleSaveAnnouncement(e) {
    e.preventDefault();
    if (!checkAdminAccess()) return;

    toggleLoader('save-announcement-btn', true);

    try {
        const isActive = document.getElementById('announcement-active').checked;
        const title = document.getElementById('announcement-title-input').value;
        const message = document.getElementById('announcement-message-input').value;
        
        const fileInput = document.getElementById('announcement-image-input');
        const urlInput = document.getElementById('announcement-image-url-input');
        
        let imageUrl = null;

        // กรณีที่ 1: มีการอัปโหลดไฟล์ใหม่ (ให้ความสำคัญสูงสุด)
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const ext = file.name.split('.').pop() || 'jpg';
            const url = await uploadFileToStorage(
                file, getCurrentUser().username,
                `announcement_${Date.now()}.${ext}`, file.type
            );
            if (url) imageUrl = convertToDirectLink(url);
        } 
        // กรณีที่ 2: ไม่ได้อัปไฟล์ใหม่ แต่มีลิงก์ในช่อง URL (ใช้ลิงก์นั้นเลย)
        else if (urlInput.value.trim() !== '') {
            imageUrl = convertToDirectLink(urlInput.value.trim());
        }
        // กรณีที่ 3: ถ้าไม่มีทั้งคู่ ให้เป็น null (ลบรูปออก)

        const result = await apiCall('POST', 'saveAnnouncementSetting', {
            isActive,
            title,
            message,
            imageUrl,
            updatedBy: getCurrentUser().username
        });
        if (result?.status !== 'success') {
            throw new Error(result?.message || 'บันทึกประกาศไม่สำเร็จ');
        }

        showAlert('สำเร็จ', 'บันทึกประกาศเรียบร้อยแล้ว');
        
        // รีโหลดฟอร์ม
        loadAdminAnnouncementSettings(); 

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + error.message);
    } finally {
        toggleLoader('save-announcement-btn', false);
    }
}
// --- เพิ่ม/แก้ไขใน main.js ---

// 1. เพิ่ม Logic การสลับหน้าจอ Modal
function setupMemoModalLogic() {
    const radios = document.querySelectorAll('input[name="modal_memo_type"]');
    const nonReimburseContainer = document.getElementById('modal-non-reimburse-files');
    
    // ตั้งค่าเริ่มต้น
    const updateVisibility = () => {
        const isNonReimburse = document.getElementById('memo_type_non_reimburse').checked;
        if (isNonReimburse) {
            nonReimburseContainer.classList.remove('hidden');
            // file-exchange ไม่บังคับ (ถ้ามีค่อยแนบ)
            document.getElementById('file-exchange').required = false;
            document.getElementById('file-ref-doc').required = true;
        } else {
            nonReimburseContainer.classList.add('hidden');
            document.getElementById('file-exchange').required = false;
            document.getElementById('file-ref-doc').required = false;
        }
    };

    radios.forEach(radio => radio.addEventListener('change', updateVisibility));
    
    // เรียกครั้งแรก
    updateVisibility();
}
// ==========================================
// 🛠️ ส่วนจัดการการส่งบันทึกและรวมไฟล์ (PDF Merge) - ฉบับแก้ไขสมบูรณ์
// ==========================================

// 1. ฟังก์ชันช่วยรวมไฟล์ (PDF และ รูปภาพ) ให้เป็น PDF ไฟล์เดียว
async function mergeFilesToSinglePDF(files) {
    if (typeof PDFLib === 'undefined') {
        throw new Error("ไม่พบไลบรารี PDF-Lib กรุณาตรวจสอบว่าได้ใส่ Script ใน index.html แล้ว");
    }

    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
        if (!file) continue;

        try {
            const arrayBuffer = await file.arrayBuffer();

            if (file.type === 'application/pdf') {
                const pdfSrc = await PDFDocument.load(arrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdfSrc, pdfSrc.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            } else if (file.type.startsWith('image/')) {
                let image;
                if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                    image = await mergedPdf.embedJpg(arrayBuffer);
                } else if (file.type === 'image/png') {
                    image = await mergedPdf.embedPng(arrayBuffer);
                }

                if (image) {
                    const page = mergedPdf.addPage([595.28, 841.89]); // A4
                    // ปรับขนาดรูปให้พอดี (เว้นขอบ 20px)
                    const { width, height } = image.scaleToFit(555.28, 801.89); 
                    page.drawImage(image, {
                        x: (595.28 - width) / 2,
                        y: (841.89 - height) / 2,
                        width,
                        height,
                    });
                }
            }
        } catch (err) {
            console.error("Error processing file:", file.name, err);
        }
    }

    const pdfBytes = await mergedPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

// ในไฟล์ js/main.js

function updateSidebarForRole(user) {
    // รายการ ID ของเมนู User ทั่วไป
    const userMenus = ['nav-dashboard', 'nav-create-request', 'nav-create-memo'];
    const isApprover = ['deputy_acad', 'deputy_personnel', 'saraban', 'director', 'admin'].includes(user.role) ||
                       (user.role && user.role.startsWith('head_'));

    if (isApprover) {
        const inboxMenu = document.getElementById('nav-approval-inbox');
        if (inboxMenu) inboxMenu.style.display = 'flex'; // โชว์เมนูให้ผู้บริหาร
    }
    // รายการ ID ของเมนู Admin
    const adminMenus = ['nav-admin-panel'];

    if (user.username === 'admin') {
        // --- กรณีเป็น Admin ---
        // 1. ซ่อนเมนู User
        userMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // 2. แสดงเมนู Admin
        adminMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block'; // หรือ 'flex' แล้วแต่ CSS
        });

        // 3. บังคับเปลี่ยนหน้าไปที่ Admin Panel ทันที
        switchPage('admin-panel'); 

    } else {
        // --- กรณีเป็น User ทั่วไป ---
        // 1. แสดงเมนู User
        userMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });

        // 2. ซ่อนเมนู Admin
        adminMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // 3. ไปหน้า Dashboard
        switchPage('dashboard');
    }
}
// --- APPROVAL WORKFLOW SYSTEM ---

// cache เก็บข้อมูลเอกสารรอลงนาม (ใช้ใน openApprovalDocument)
window._approvalDocs = {};

async function getApprovalDocsFallback(targetStatus) {
    const result = await apiCall('GET', 'getAllRequests');
    const requests = (result.status === 'success') ? (result.data || []) : [];

    return requests
        .filter(req => (req.docStatus || '') === targetStatus)
        .map(req => {
            const safeDocId = (req.id || req.requestId || '').replace(/[\/\\:\.]/g, '-');
            return {
                docId: safeDocId,
                ...req
            };
        });
}

// 1. ฟังก์ชันโหลดรายการเอกสารที่รอเซ็น
function getApprovalDocType(req = {}) {
    const activeType = req.activeApprovalDocType || req.docType || '';
    const hasDispatch = !!(req.completedDispatchBookUrl || req.dispatchBookUrl || req.dispatchBookPdfUrl);
    const hasCommand = !!(req.completedCommandUrl || req.commandPdfUrl);

    if (activeType === 'dispatch') return 'dispatch';
    if (activeType === 'command') return 'command';
    if (activeType === 'memo') return 'memo';

    if (req.docType === 'dispatch') return 'dispatch';
    if (req.docType === 'command') return 'command';

    if (hasDispatch && !hasCommand) return 'dispatch';
    if (hasCommand) return 'command';
    return 'memo';
}

function getApprovalPdfUrl(req = {}) {
    const docType = getApprovalDocType(req);
    if (docType === 'dispatch') {
        return req.currentPdfUrl || req.completedDispatchBookUrl || req.dispatchBookUrl || req.dispatchBookPdfUrl || req.pdfUrl || '';
    }
    if (docType === 'command') {
        return req.currentPdfUrl || req.completedCommandUrl || req.commandPdfUrl || req.pdfUrl || '';
    }
    return req.currentPdfUrl || req.completedMemoUrl || req.pdfUrl || req.memoPdfUrl || '';
}

async function loadPendingApprovals() {
    const user = getCurrentUser();
    if (!user) return;

    const container = document.getElementById('approval-list-container');
    container.innerHTML = `<div class="flex justify-center py-10"><div class="loader"></div></div>`;

    // ตรวจสอบ Firebase / Firestore พร้อมใช้งานหรือไม่
    if (typeof db === 'undefined' || !db) {
        container.innerHTML = `
            <div class="text-center py-10">
                <div class="text-red-500 mb-2">⚠️ ระบบฐานข้อมูลยังไม่พร้อมใช้งาน</div>
                <div class="text-xs text-gray-400 mb-4">กรุณารอสักครู่แล้วลองอีกครั้ง</div>
                <button onclick="loadPendingApprovals()" class="btn bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                    🔄 ลองอีกครั้ง
                </button>
            </div>`;
        return;
    }

    try {
        const targetStatus = getTargetStatusForUser(user.role);

        if (!targetStatus) {
            container.innerHTML = `<div class="text-center py-10 text-gray-500">คุณไม่มีสิทธิ์ในการอนุมัติเอกสาร</div>`;
            return;
        }

        let docs = [];

        if (user.role === 'admin') {
            docs = await getApprovalDocsFallback(targetStatus);
            window._approvalDocs = {};
            docs.forEach(doc => {
                if (doc.docId) window._approvalDocs[doc.docId] = doc;
            });
        } else {
            try {
                // ใช้ where อย่างเดียว (ไม่ orderBy) เพื่อไม่ต้องการ composite index
                // และไม่ตัดเอกสารที่ไม่มี timestamp field ออกจากผลลัพธ์
                const snapshot = await db.collection('requests')
                    .where('docStatus', '==', targetStatus)
                    .get();

                snapshot.forEach(doc => {
                    const data = doc.data();
                    docs.push({ docId: doc.id, ...data });
                    window._approvalDocs[doc.id] = data;
                });
            } catch (firestoreError) {
                const message = String(firestoreError?.message || firestoreError || '');
                const isPermissionError = /Missing or insufficient permissions/i.test(message);
                if (!isPermissionError) throw firestoreError;

                console.warn('⚠️ Firestore approval query blocked, fallback to GAS:', message);
                docs = await getApprovalDocsFallback(targetStatus);
                window._approvalDocs = {};
                docs.forEach(doc => {
                    if (doc.docId) window._approvalDocs[doc.docId] = doc;
                });
            }
        }

        if (docs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <span class="text-4xl">🎉</span>
                    <h3 class="text-lg font-bold text-gray-700 mt-4">ไม่มีเอกสารคั่งค้าง</h3>
                    <p class="text-gray-500">โต๊ะทำงานของคุณว่างเปล่า ยอดเยี่ยมมาก!</p>
                </div>`;
            document.getElementById('approval-badge').classList.add('hidden');
            return;
        }

        const badge = document.getElementById('approval-badge');
        if (badge) {
            badge.innerText = docs.length;
            badge.classList.remove('hidden');
        }

        // sort ใน JS: ใช้ timestamp หรือ lastUpdated ที่มี fallback เป็น 0
        docs.sort((a, b) => {
            const tA = (a.timestamp?.toMillis?.() || a.lastUpdated?.toMillis?.() || 0);
            const tB = (b.timestamp?.toMillis?.() || b.lastUpdated?.toMillis?.() || 0);
            return tB - tA; // ล่าสุดก่อน
        });

        // สารบรรณ: แยกตามประเภทงานเพื่อให้หยิบงานได้ง่าย
        if (user.role === 'saraban') {
            const dispatchDocs = docs.filter(d => getApprovalDocType(d) === 'dispatch');
            const cmdDocs  = docs.filter(d => getApprovalDocType(d) === 'command');
            const memoDocs = docs.filter(d => getApprovalDocType(d) === 'memo');
            container.innerHTML =
                _renderApprovalTable(dispatchDocs, user, '📦 หนังสือส่ง', 'rose') +
                _renderApprovalTable(cmdDocs,  user, '📝 คำสั่งไปราชการ',  'indigo') +
                _renderApprovalTable(memoDocs, user, '📄 บันทึกข้อความ',   'teal');
        } else {
            container.innerHTML = _renderApprovalTable(docs, user, null, 'indigo');
        }

    } catch (error) {
        console.error("Error loading approvals:", error);
        const errorMsg = error?.message || error?.code || "Unknown error";
        container.innerHTML = `
            <div class="text-center py-10">
                <div class="text-red-500 mb-2">⚠️ เกิดข้อผิดพลาดในการดึงข้อมูล</div>
                <div class="text-xs text-gray-400 mb-4">${errorMsg}</div>
                <button onclick="loadPendingApprovals()" class="btn bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                    🔄 ลองอีกครั้ง
                </button>
            </div>`;
    }
}

// ฟังก์ชันสร้าง pills ประวัติการลงนาม/ข้ามสำหรับ admin
function _buildSigningProgress(req) {
    const ALL_STEPS = [
        { key: 'head_thai',      short: 'ภาษาไทย' },
        { key: 'head_foreign',   short: 'ภาษาต่างประเทศ' },
        { key: 'head_science',   short: 'วิทย์ฯ' },
        { key: 'head_art',       short: 'ศิลปะ' },
        { key: 'head_social',    short: 'สังคม' },
        { key: 'head_health',    short: 'สุขศึกษา' },
        { key: 'head_career',    short: 'การงาน' },
        { key: 'head_math',      short: 'คณิตศาสตร์' },
        { key: 'head_guidance',  short: 'แนะแนว' },
        { key: 'head_general',   short: 'บริหารทั่วไป' },
        { key: 'head_personnel', short: 'หน.บุคคล' },
        { key: 'head_budget',    short: 'หน.งบ' },
        { key: 'head_acad',      short: 'หน.วิชาการ' },
        { key: 'dep_personnel',  short: 'รองผอ.บุคคล' },
        { key: 'dep_acad',       short: 'รองผอ.วิชาการ' },
        { key: 'dep_general',    short: 'รองผอ.ทั่วไป' },
        { key: 'dep_budget',     short: 'รองผอ.งบ' },
        { key: 'saraban',        short: 'สารบรรณ' },
        { key: 'director',       short: 'ผอ.' },
    ];

    const pills = [];
    ALL_STEPS.forEach(step => {
        const signedBy  = req[`signedBy_${step.key}`];
        const skippedBy = req[`skippedBy_${step.key}`];
        if (signedBy) {
            pills.push(`<span title="ลงนามโดย: ${signedBy}"
                class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full border border-green-200 whitespace-nowrap cursor-default">
                ✅ ${step.short}
            </span>`);
        } else if (skippedBy) {
            pills.push(`<span title="ข้ามโดย: ${skippedBy}"
                class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-400 text-xs rounded-full border border-gray-200 whitespace-nowrap cursor-default line-through">
                ⏭️ ${step.short}
            </span>`);
        }
    });

    if (pills.length === 0) return '';
    return `<div class="flex flex-wrap gap-1 mt-1.5">${pills.join('')}</div>`;
}


// ฟังก์ชันสร้าง HTML ตารางเอกสารรอลงนาม
function _renderApprovalTable(docs, user, title, color) {
    // ถ้าไม่มีเอกสารในหมวดนี้ (สำหรับ saraban ที่แยก 2 ตาราง)
    if (docs.length === 0) {
        if (!title) return '';
        return `
        <div class="mb-8">
            <h2 class="text-base font-bold text-${color}-700 mb-3 flex items-center gap-2">
                ${title}
                <span class="text-xs font-normal bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">ไม่มีรายการ</span>
            </h2>
            <p class="text-gray-400 text-sm italic px-2 py-4">ไม่มีเอกสารในหมวดนี้</p>
        </div>`;
    }

    let rows = '';
    docs.forEach((req, idx) => {
        const docType = getApprovalDocType(req);
        const pdfUrl  = getApprovalPdfUrl(req);
        const dateStr = req.timestamp ? formatDisplayDate(req.timestamp) : '-';
        const docId   = req.docId;
        const requiresSarabanNumber = docType === 'command' || docType === 'dispatch';

        // --- ปุ่มดำเนินการ ---
        // ปุ่มส่งกลับ (ใช้ร่วมทุก role)
        const rejectBtn = `
            <button onclick="rejectDocument('${docId}')"
                class="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs font-medium whitespace-nowrap">
                ↩️ ส่งกลับ
            </button>`;

        let actionCell = '';
        if (user.role === 'saraban') {
            actionCell = `
                <div class="flex flex-col gap-1 items-center">
                    <div class="flex items-center gap-1.5 justify-center">
                        ${pdfUrl ? `<a href="${pdfUrl}" target="_blank"
                            class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs font-medium whitespace-nowrap">
                            📄 ดู PDF
                        </a>` : ''}
                        <button onclick="openSarabanForApproval('${docId}')"
                            class="px-2 py-1 ${docType === 'dispatch' ? 'bg-rose-500 hover:bg-rose-600' : (docType === 'command' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700')} text-white rounded text-xs font-medium whitespace-nowrap">
                            ${docType === 'dispatch' ? '📦 ออกเลขหนังสือส่ง' : (docType === 'command' ? '📝 ออกเลขคำสั่ง' : '✅ ส่งต่อ')}
                        </button>
                    </div>
                    ${rejectBtn}
                </div>`;
        } else if (user.role === 'admin') {
            actionCell = `
                <div class="flex flex-col gap-1.5 items-center">
                    <div class="flex items-center gap-1.5 justify-center">
                        ${pdfUrl ? `<a href="${pdfUrl}" target="_blank"
                            class="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded text-xs font-medium whitespace-nowrap">
                            📄 ดู
                        </a>` : ''}
                        <button onclick="adminRouteDocument('${docId}')"
                            class="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold whitespace-nowrap shadow-sm">
                            📤 เลือกส่งต่อ
                        </button>
                    </div>
                    <div class="flex items-center gap-1.5 justify-center">
                        <button onclick="adminTerminateProcess('${docId}')"
                            class="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium whitespace-nowrap">
                            🚫 สิ้นสุด
                        </button>
                        ${rejectBtn}
                    </div>
                </div>`;
        } else if (user.role === 'director') {
            actionCell = `
                <div class="flex flex-col gap-1 items-center">
                    <button onclick="openApprovalDocument('${docId}')"
                        class="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium whitespace-nowrap">
                        ✅ ลงนามอนุมัติ
                    </button>
                    ${rejectBtn}
                </div>`;
        } else {
            // หัวหน้า, รองผอ.
            actionCell = `
                <div class="flex flex-col gap-1 items-center">
                    <button onclick="openApprovalDocument('${docId}')"
                        class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-medium whitespace-nowrap">
                        ✍️ เปิดลงนาม
                    </button>
                    ${rejectBtn}
                </div>`;
        }

        // --- สถานะ ---
        let statusBadge = '';
        if (user.role === 'saraban') {
            statusBadge = requiresSarabanNumber
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">${docType === 'dispatch' ? '🟠 รอออกเลขหนังสือส่ง' : '🟠 รอออกเลขคำสั่ง'}</span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">🟡 รอตรวจสอบ</span>`;
        } else if (user.role === 'admin') {
            if (req.wasRejected) {
                statusBadge = `
                    <div class="flex flex-col items-center gap-1">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">⚠️ ถูกตีกลับ</span>
                        ${req.rejectionReason ? `<span class="text-xs text-red-500 max-w-[120px] text-center leading-tight">${req.rejectionReason}</span>` : ''}
                        ${req.rejectedBy ? `<span class="text-xs text-gray-400">โดย ${req.rejectedBy}</span>` : ''}
                    </div>`;
            } else {
                const currentLabel = (typeof getDocStatusLabel === 'function')
                    ? getDocStatusLabel(req.docStatus || '') : '';
                statusBadge = `
                    <div class="flex flex-col items-center gap-1">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">🔵 รอส่งต่อ</span>
                        ${currentLabel ? `<span class="text-xs text-gray-500 text-center max-w-[110px] leading-tight">${currentLabel}</span>` : ''}
                    </div>`;
            }
        } else if (user.role === 'director') {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full">🟢 รออนุมัติ</span>`;
        } else {
            statusBadge = `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full">🔴 ยังไม่ได้ลงนาม</span>`;
        }

        // ป้ายประเภทเอกสาร
        let typeBadge = `<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">บันทึก</span>`;
        if (docType === 'command') {
            typeBadge = `<span class="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs font-bold rounded">คำสั่ง</span>`;
        } else if (docType === 'dispatch') {
            typeBadge = `<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 text-xs font-bold rounded">หนังสือส่ง</span>`;
        }

        rows += `
            <tr class="hover:bg-indigo-50/30 transition-colors">
                <td class="px-4 py-3 text-center text-gray-400 font-semibold text-sm">${idx + 1}</td>
                <td class="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">${dateStr}</td>
                <td class="px-4 py-3">${typeBadge}</td>
                <td class="px-4 py-3 font-medium text-gray-800 text-sm max-w-xs">
                    <div class="line-clamp-2">${escapeHtml(req.purpose || 'ไม่มีหัวข้อ')}</div>
                    ${user.role === 'admin' ? _buildSigningProgress(req) : ''}
                </td>
                <td class="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">${escapeHtml(req.requesterName || '-')}</td>
                <td class="px-4 py-3 text-center">${statusBadge}</td>
                <td class="px-4 py-3 text-center">${actionCell}</td>
            </tr>`;
    });

    const titleHtml = title ? `
        <h2 class="text-base font-bold text-${color}-700 mb-3 flex items-center gap-2">
            ${title}
            <span class="text-xs font-normal bg-${color}-100 text-${color}-600 px-2 py-0.5 rounded-full">${docs.length} รายการ</span>
        </h2>` : '';

    return `
    <div class="mb-8">
        ${titleHtml}
        <div class="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table class="w-full text-sm text-left">
                <thead>
                    <tr class="bg-gray-50 text-gray-500 text-xs uppercase border-b border-gray-200">
                        <th class="px-4 py-3 text-center w-12">ลำดับ</th>
                        <th class="px-4 py-3">วันที่</th>
                        <th class="px-4 py-3">ประเภท</th>
                        <th class="px-4 py-3">เรื่อง / หัวข้อ</th>
                        <th class="px-4 py-3">ผู้ขอ</th>
                        <th class="px-4 py-3 text-center">สถานะ</th>
                        <th class="px-4 py-3 text-center">ดำเนินการ</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 bg-white">
                    ${rows}
                </tbody>
            </table>
        </div>
    </div>`;
}

// 2. ฟังก์ชันตรวจสอบว่า Role นี้ ต้องดูเอกสาร Status ไหน
// ฟังก์ชันตรวจสอบว่า Role นี้ ต้องดูเอกสาร Status ไหน
function getTargetStatusForUser(role) {
    const user = getCurrentUser();
    // _approverRole ที่ set จาก signerPositions มีความสำคัญกว่า role พื้นฐาน
    const effectiveRole = (user && user._approverRole) ? user._approverRole : role;

    // หัวหน้าทุกประเภท → waiting_head_xxx
    if (effectiveRole && effectiveRole.startsWith('head_')) {
        return 'waiting_' + effectiveRole;
    }

    switch (effectiveRole) {
        case 'deputy_acad':      return 'waiting_deputy_acad';
        case 'deputy_personnel': return 'waiting_deputy_personnel';
        case 'deputy_general':   return 'waiting_deputy_general';
        case 'deputy_budget':    return 'waiting_deputy_budget';
        case 'saraban':          return 'waiting_saraban';
        case 'director':         return 'waiting_director';
        case 'admin':            return 'waiting_admin_review';
        default:                 return null;
    }
}

// 3. ฟังก์ชันเมื่อกดปุ่ม "เปิดอ่านและลงนาม" (อ่านข้อมูลจาก cache _approvalDocs)
function openApprovalDocument(docId) {
    const data = window._approvalDocs?.[docId] || {};
    const pdfUrl = getApprovalPdfUrl(data);
    const currentDocStatus = data.docStatus || null;
    const docType = getApprovalDocType(data);
    // ใช้ original ID (มี /) เพื่อให้ GAS หาเอกสารเจอ — docId คือ safeId (มี -)
    const origId = data.id || data.requestId || docId;

    if (!pdfUrl) {
        alert("ไม่พบไฟล์ PDF ในระบบ กรุณาติดต่อแอดมิน");
        return;
    }
    const title = docType === 'dispatch'
        ? '✍️ ลงนามหนังสือส่ง'
        : (docType === 'command' ? '✍️ ลงนามคำสั่งไปราชการ' : '✍️ ลงนามเอกสาร');
    openSignatureSystem(pdfUrl, origId, title, currentDocStatus);
}

// 4. แอดมินตรวจสอบแล้ว → ส่งต่อให้งานสารบรรณ (ไม่ต้องเซ็น)
async function adminForwardToSaraban(docId) {
    if (!confirm('ยืนยันการส่งเอกสารไปยังงานสารบรรณ?')) return;
    const safeId    = docId.replace(/[\/\\:\.]/g, '-');
    const docMeta   = window._approvalDocs?.[docId] || {};
    const origDocId = docMeta.id || docMeta.requestId || docId; // original ID สำหรับ Sheet
    try {
        showAlert('กำลังดำเนินการ', 'กำลังส่งเอกสารไปยังงานสารบรรณ...', false);
        const user = getCurrentUser();
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                docStatus:       'waiting_saraban',
                adminReviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                adminReviewedBy: user?.name || user?.username || 'admin'
            }, { merge: true });
        }
        apiCall('POST', 'updateRequest', {
            requestId: origDocId,
            docStatus: 'waiting_saraban'
        }).catch(err => console.warn("Sheet update error:", err));

        document.getElementById('alert-modal').style.display = 'none';
        // แอดมินจะสร้างลิงก์ให้งานสารบรรณผ่านหน้า "จัดการลิงก์ลงนาม" เอง
        showAlert('✅ สำเร็จ', 'ส่งเอกสารไปงานสารบรรณเรียบร้อยแล้ว');
        loadPendingApprovals();
    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', e.message);
    }
}

// 4b. แอดมิน: เปิด modal เลือกส่งต่อเอกสาร (ข้ามขั้นตอนได้)
window.adminRouteDocument = function(docId) {
    const data = window._approvalDocs?.[docId] || {};
    window._routingDocId = docId;

    // แสดง docId บน modal header
    const display = document.getElementById('route-doc-id-display');
    if (display) display.textContent = docId;

    // ตำแหน่งทั้งหมดที่เป็นไปได้ แบ่งเป็นกลุ่ม
    const ROUTE_GROUPS = [
        { group: '👥 หัวหน้ากลุ่มสาระ / กลุ่มบริหาร', items: [
            { status: 'waiting_deputy_general',    label: 'รองผอ. กลุ่มบริหารทั่วไป',        roleKey: 'dep_general' },
            { status: 'waiting_deputy_budget',     label: 'รองผอ. กลุ่มบริหารงบประมาณ',      roleKey: 'dep_budget' },
            { status: 'waiting_head_thai',      label: 'หัวหน้ากลุ่มสาระภาษาไทย',         roleKey: 'head_thai' },
            { status: 'waiting_head_foreign',   label: 'หัวหน้ากลุ่มสาระภาษาต่างประเทศ',  roleKey: 'head_foreign' },
            { status: 'waiting_head_science',   label: 'หัวหน้ากลุ่มสาระวิทยาศาสตร์ฯ',   roleKey: 'head_science' },
            { status: 'waiting_head_art',       label: 'หัวหน้ากลุ่มสาระศิลปะ',           roleKey: 'head_art' },
            { status: 'waiting_head_social',    label: 'หัวหน้ากลุ่มสาระสังคมศึกษาฯ',    roleKey: 'head_social' },
            { status: 'waiting_head_health',    label: 'หัวหน้ากลุ่มสาระสุขศึกษาฯ',      roleKey: 'head_health' },
            { status: 'waiting_head_career',    label: 'หัวหน้ากลุ่มสาระการงานอาชีพ',     roleKey: 'head_career' },
            { status: 'waiting_head_math',      label: 'หัวหน้ากลุ่มสาระคณิตศาสตร์',     roleKey: 'head_math' },
            { status: 'waiting_head_guidance',  label: 'หัวหน้างานแนะแนว',                roleKey: 'head_guidance' },
            { status: 'waiting_head_general',   label: 'หัวหน้ากลุ่มบริหารทั่วไป',       roleKey: 'head_general' },
            { status: 'waiting_head_personnel', label: 'หัวหน้ากลุ่มบริหารงานบุคคล',      roleKey: 'head_personnel' },
            { status: 'waiting_head_budget',    label: 'หัวหน้ากลุ่มบริหารงบประมาณ',      roleKey: 'head_budget' },
            { status: 'waiting_head_acad',      label: 'หัวหน้ากลุ่มบริหารวิชาการ',       roleKey: 'head_acad' },

        ]},
        { group: '🏫 รองผู้อำนวยการ', items: [
            { status: 'waiting_deputy_personnel',  label: 'รองผอ. กลุ่มบริหารงานบุคคล',      roleKey: 'dep_personnel' },
            { status: 'waiting_deputy_acad',       label: 'รองผอ. กลุ่มบริหารวิชาการ',       roleKey: 'dep_acad' },
        
        ]},
        { group: '📋 ขั้นตอนสุดท้าย', items: [
            { status: 'waiting_saraban',  label: 'งานสารบรรณ',  roleKey: 'saraban' },
            { status: 'waiting_director', label: 'ผู้อำนวยการ', roleKey: 'director' },
        ]},
    ];

    // รวบรวมตำแหน่งที่ลงนามแล้ว
    const signedLabels = [];
    ROUTE_GROUPS.forEach(grp => grp.items.forEach(opt => {
        if (data[`signedBy_${opt.roleKey}`]) signedLabels.push(opt.label);
    }));

    // แสดง / ซ่อน signed summary bar
    const summaryBar  = document.getElementById('route-signed-summary');
    const signedList  = document.getElementById('route-signed-list');
    if (summaryBar && signedList) {
        if (signedLabels.length > 0) {
            signedList.textContent = signedLabels.join(', ');
            summaryBar.classList.remove('hidden');
        } else {
            summaryBar.classList.add('hidden');
        }
    }

    // สร้าง options list
    const listEl = document.getElementById('route-options-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    ROUTE_GROUPS.forEach(grp => {
        // หัวข้อกลุ่ม
        const groupHeader = document.createElement('p');
        groupHeader.className = 'text-xs font-bold text-gray-500 uppercase tracking-wider mt-2 mb-1 px-1';
        groupHeader.textContent = grp.group;
        listEl.appendChild(groupHeader);

        grp.items.forEach(opt => {
            const isSigned    = !!data[`signedBy_${opt.roleKey}`];
            const signedByName = data[`signedBy_${opt.roleKey}`] || '';
            const isCurrent   = data.docStatus === opt.status;

            const label = document.createElement('label');
            label.className = `flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-all
                ${isCurrent
                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                    : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`;

            const radio = document.createElement('input');
            radio.type  = 'radio';
            radio.name  = 'admin-route-target';
            radio.value = opt.status;
            radio.className = 'w-4 h-4 accent-blue-600';
            if (isCurrent) radio.checked = true;

            const textWrap = document.createElement('span');
            textWrap.className = 'flex-1 flex items-center gap-2';

            const labelText = document.createElement('span');
            labelText.className = 'text-sm text-gray-800';
            labelText.textContent = opt.label;

            textWrap.appendChild(labelText);

            if (isSigned) {
                const badge = document.createElement('span');
                badge.className = 'ml-auto text-xs text-green-700 bg-green-100 rounded-full px-2 py-0.5 whitespace-nowrap';
                badge.textContent = `✅ ${signedByName}`;
                textWrap.appendChild(badge);
            }
            if (isCurrent) {
                const cur = document.createElement('span');
                cur.className = 'ml-auto text-xs text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 whitespace-nowrap font-bold';
                cur.textContent = '◀ สถานะปัจจุบัน';
                if (!isSigned) textWrap.appendChild(cur);
            }

            label.appendChild(radio);
            label.appendChild(textWrap);
            listEl.appendChild(label);

            // highlight เมื่อเลือก
            radio.addEventListener('change', () => {
                listEl.querySelectorAll('label').forEach(l => {
                    l.classList.remove('border-blue-400', 'bg-blue-50', 'ring-1', 'ring-blue-400');
                    l.classList.add('border-gray-200');
                });
                if (radio.checked) {
                    label.classList.remove('border-gray-200');
                    label.classList.add('border-blue-400', 'bg-blue-50', 'ring-1', 'ring-blue-400');
                }
            });
        });
    });

    // เปิด modal
    const modal = document.getElementById('admin-route-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
};

// 4c. แอดมิน: ยืนยันส่งต่อเอกสารไปยังตำแหน่งที่เลือก
window.confirmAdminRoute = async function() {
    const selected = document.querySelector('input[name="admin-route-target"]:checked');
    if (!selected) {
        alert('⚠️ กรุณาเลือกตำแหน่งที่ต้องการส่งต่อก่อน');
        return;
    }
    const targetStatus = selected.value;
    const docId        = window._routingDocId;
    if (!docId) { alert('ไม่พบรหัสเอกสาร'); return; }

    // ชื่อ label ของ status ที่เลือก
    const labelEl = selected.closest('label')?.querySelector('span.text-sm');
    const targetLabel = labelEl ? labelEl.textContent : targetStatus;

    const safeId    = docId.replace(/[\/\\:\.]/g, '-');
    const user      = getCurrentUser();
    const docMeta   = window._approvalDocs?.[docId] || {};
    const origDocId = docMeta.id || docMeta.requestId || docId; // original ID สำหรับ Sheet

    const confirmMsg = `ยืนยันส่งเอกสาร:\n"${origDocId}"\n\n→ ${targetLabel}`;
    if (!confirm(confirmMsg)) return;

    closeAdminRouteModal();
    showAlert('กำลังดำเนินการ', `กำลังส่งเอกสารไปยัง "${targetLabel}"...`, false);

    try {
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                docStatus:       targetStatus,
                adminRoutedAt:   firebase.firestore.FieldValue.serverTimestamp(),
                adminRoutedBy:   user?.name || user?.username || 'admin',
                lastUpdated:     firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        apiCall('POST', 'updateRequest', {
            requestId: origDocId,
            docStatus: targetStatus,
        }).catch(err => console.warn('Sheet update error:', err));

        document.getElementById('alert-modal').style.display = 'none';
        showAlert('✅ ส่งต่อสำเร็จ', `ส่งเอกสาร "${docId}" ไปยัง "${targetLabel}" เรียบร้อยแล้ว`);
        loadPendingApprovals();
    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('❌ ผิดพลาด', e.message);
    }
};

// 4d. แอดมิน: ปิด routing modal
window.closeAdminRouteModal = function() {
    const modal = document.getElementById('admin-route-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    window._routingDocId = null;
};

// 4e. แอดมิน: สิ้นสุดกระบวนการ — ไม่ส่งต่อสารบรรณ
async function adminTerminateProcess(docId) {
    const reason = window.prompt(
        `สิ้นสุดกระบวนการสำหรับเอกสาร: ${docId}\n\nระบุเหตุผล (บังคับ):`
    );
    if (reason === null) return;             // กด Cancel
    if (!reason.trim()) {
        alert('⚠️ กรุณาระบุเหตุผลก่อนสิ้นสุดกระบวนการ');
        return;
    }
    if (!confirm(
        `ยืนยันสิ้นสุดกระบวนการสำหรับ:\n"${docId}"\n\nเหตุผล: ${reason.trim()}\n\n` +
        `เอกสารจะไม่ถูกส่งต่อสารบรรณ และไม่สามารถกู้คืนขั้นตอนได้`
    )) return;

    const user   = getCurrentUser();
    const safeId = docId.replace(/[\/\\:\.]/g, '-');
    try {
        showAlert('กำลังดำเนินการ', 'กำลังสิ้นสุดกระบวนการ...', false);

        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                docStatus:         'สิ้นสุดกระบวนการ',
                terminatedAt:      firebase.firestore.FieldValue.serverTimestamp(),
                terminatedBy:      user?.name || user?.username || 'admin',
                terminationReason: reason.trim(),
                lastUpdated:       firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        apiCall('POST', 'updateRequest', {
            requestId:         docId,
            docStatus:         'สิ้นสุดกระบวนการ',
            terminationReason: reason.trim(),
        }).catch(e => console.warn('Sheet update error:', e));

        document.getElementById('alert-modal').style.display = 'none';
        showAlert('🚫 สิ้นสุดแล้ว',
            `สิ้นสุดกระบวนการเรียบร้อยแล้ว\n📝 เหตุผล: ${reason.trim()}`);
        loadPendingApprovals();
    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', e.message);
    }
}

// 5. ส่งกลับเอกสารไปแก้ไข (ทุก role ที่มีปุ่มลงนาม)
async function rejectDocument(docId) {
    // รับเหตุผล
    const reason = window.prompt('ระบุเหตุผลในการส่งกลับ (ถ้ามี):');
    if (reason === null) return; // กด Cancel

    const user   = getCurrentUser();
    const safeId = docId.replace(/[\/\\:\.]/g, '-');
    const rejectedBy = user?.name || user?.username || 'ผู้ตรวจสอบ';

    try {
        showAlert('กำลังดำเนินการ', 'กำลังส่งกลับเอกสาร...', false);

        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                status:           'นำกลับไปแก้ไข',       // ★ ให้ isFixing ตรวจเจอ
                docStatus:        'waiting_admin_review',
                wasRejected:      true,
                rejectedAt:       firebase.firestore.FieldValue.serverTimestamp(),
                rejectedBy:       rejectedBy,
                rejectionReason:  reason.trim() || 'ไม่ระบุเหตุผล',
                lastUpdated:      firebase.firestore.FieldValue.serverTimestamp(),
                // ล้างเลขที่สารบรรณที่เคยออกไว้ (ถ้ามี)
                sarabanDocNum:    firebase.firestore.FieldValue.delete(),
                sarabanDocDate:   firebase.firestore.FieldValue.delete(),
                sarabanStampedAt: firebase.firestore.FieldValue.delete(),
                sarabanStampedBy: firebase.firestore.FieldValue.delete(),
            }, { merge: true });
        }

        // อัปเดต GAS Sheet ด้วย (fire-and-forget)
        apiCall('POST', 'updateRequest', {
            requestId:       docId,
            status:          'นำกลับไปแก้ไข',
            docStatus:       'waiting_admin_review',
            wasRejected:     'true',
            rejectionReason: reason.trim() || 'ไม่ระบุเหตุผล',
        }).catch(e => console.warn('Sheet update error:', e));

        document.getElementById('alert-modal').style.display = 'none';
        showAlert('↩️ ส่งกลับแล้ว',
            `ส่งกลับเอกสารไปยังแอดมินเรียบร้อยแล้ว` +
            (reason.trim() ? `\n📝 เหตุผล: ${reason.trim()}` : ''));
        loadPendingApprovals();
    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', e.message);
    }
}

// 6. สารบรรณ: โหลด PDF แล้วเปิดระบบออกเลขที่
async function openSarabanForApproval(docId) {
    const data    = window._approvalDocs?.[docId] || {};
    const pdfUrl  = getApprovalPdfUrl(data);
    const docType = getApprovalDocType(data);

    if (!pdfUrl) {
        alert("ไม่พบไฟล์ PDF ในระบบ กรุณาติดต่อแอดมิน");
        return;
    }

    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyyUHx5gy7SFow_xex1Jt8TorLaWpxIgoYausg9z8QuSfoL8g_1r5on104A2m-PbGIWpA/exec";
    const _isPdf = (buf) => buf instanceof ArrayBuffer && buf.byteLength > 4 &&
        String.fromCharCode(...new Uint8Array(buf, 0, 4)) === '%PDF';
    const _b64ToBuf = (b64) => {
        const bin   = window.atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes.buffer;
    };

    try {
        showAlert('กำลังโหลด', 'กำลังเตรียมเอกสาร...', false);

        let pdfBuffer = null;

        // 🚀 เส้นทาง 0: Firestore pdfBase64 (เร็วที่สุด — ไม่ต้อง network ไป Drive)
        if (data.pdfBase64) {
            try {
                const buf = _b64ToBuf(data.pdfBase64);
                if (_isPdf(buf)) {
                    pdfBuffer = buf;
                    console.log('🚀 saraban: PDF loaded from Firestore cache — instant!');
                }
            } catch (e) { console.warn('Firestore cache decode error:', e.message); }
        }

        // ⚠️ เส้นทาง 1: GAS base64 proxy (Drive URL, ไม่มี cache)
        if (!pdfBuffer && pdfUrl.includes('drive.google.com')) {
            const match = pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || pdfUrl.match(/id=([a-zA-Z0-9_-]+)/);
            const fileId = match ? match[1] : '';
            if (fileId) {
                const response = await fetch(`${SCRIPT_URL}?action=getPdfBase64&fileId=${fileId}`);
                const result   = await response.json();
                if (result.status === 'success') {
                    const buf = _b64ToBuf(result.data);
                    if (_isPdf(buf)) pdfBuffer = buf;
                    else console.warn('GAS base64 ไม่ใช่ PDF จริง');
                } else {
                    throw new Error(result.message);
                }
            }
        }

        // ⚠️ เส้นทาง 2: Direct fetch (Firebase Storage หรือ URL อื่นๆ ที่ไม่ใช่ Drive)
        if (!pdfBuffer && pdfUrl && !pdfUrl.includes('drive.google.com')) {
            const response = await fetch(pdfUrl);
            if (!response.ok) throw new Error(`HTTP Status: ${response.status}`);
            const buf = await response.arrayBuffer();
            if (_isPdf(buf)) pdfBuffer = buf;
            else console.warn('Direct fetch ไม่ใช่ PDF จริง');
        }

        document.getElementById('alert-modal').style.display = 'none';
        // ส่ง buffer (หรือ null ให้ sarabun.js fallback ต่อเอง)
        openSarabanModal(pdfBuffer, docId, docType, pdfUrl);

    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        console.error("Fetch Error:", e);
        alert("ดึงไฟล์ไม่สำเร็จ: " + e.message);
    }
}

// ฟังก์ชันเปิด Modal และนำข้อมูลเดิมมาแสดง
window.openEditUserModal = function(uid, name, position, department, role, loginName) {
    document.getElementById('edit-uid').value       = uid        || '';
    document.getElementById('edit-name').value      = name       || '';
    document.getElementById('edit-position').value  = position   || '';
    // ★ ใช้ ID ที่ไม่ซ้ำกับฟอร์มคำขอ (edit-department ซ้ำกับ SELECT ในหน้าแก้ไขคำขอ)
    document.getElementById('edit-user-dept').value = department || '';

    // เติม Login Name (ถ้า loginName === uid แสดงว่ายังไม่มี alias จริง ให้เว้นว่าง)
    const lnInput = document.getElementById('edit-user-loginname');
    if (lnInput) {
        lnInput.value = (loginName && loginName !== uid) ? loginName : '';
    }

    // แสดง uid hint ในคำอธิบาย
    const uidHint = document.getElementById('edit-user-uid-hint');
    if (uidHint) uidHint.textContent = uid || '';

    // แสดง username ในแถบหัว modal เพื่อให้ admin รู้ว่ากำลังแก้ไขบัญชีใด
    const usernameLabel = document.getElementById('edit-user-username-label');
    if (usernameLabel) usernameLabel.textContent = uid || '';

    // ตั้งค่า Role เดิมให้ถูกต้อง
    // ใช้ .toLowerCase().trim() เผื่อ GAS ส่งค่า role มีตัวพิมพ์ใหญ่หรือ space เกิน
    const roleSelect = document.getElementById('edit-role');
    if (roleSelect) {
        const normalizedRole = (role || 'user').toString().toLowerCase().trim();
        roleSelect.value = normalizedRole;
        // fallback: ถ้าค่าไม่ตรง option ใด ให้ default เป็น 'user'
        if (!roleSelect.value) roleSelect.value = 'user';
    }

    // แสดง Modal
    const modal = document.getElementById('edit-user-modal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
};

// ฟังก์ชันบันทึกข้อมูลเมื่อกด Submit
// ฟังก์ชันบันทึกข้อมูลเมื่อกด Submit
async function handleEditUserSubmit(e) {
    e.preventDefault();
    
    // ดึงค่าจากฟอร์ม
    const username = document.getElementById('edit-uid').value;
    const newName = document.getElementById('edit-name').value.trim();
    const newPosition = document.getElementById('edit-position').value.trim();
    const newDepartment = document.getElementById('edit-user-dept').value.trim();
    const newRole = document.getElementById('edit-role').value;
    // LoginName: ถ้าเว้นว่างให้ใช้ username เป็น default (ตาม logic ของ GAS)
    const lnRaw = (document.getElementById('edit-user-loginname')?.value || '').trim();
    const newLoginName = lnRaw || username;

    if (!username) {
        showAlert('ผิดพลาด', 'ไม่พบรหัสผู้ใช้งาน');
        return;
    }

    const btnText = document.getElementById('edit-user-btn-text');
    const submitBtn = document.getElementById('edit-user-submit');
    
    btnText.textContent = 'กำลังอัปเดต...';
    submitBtn.disabled = true;

    try {
        // 1. เตรียมข้อมูล Payload ให้ตรงกับที่ Code.gs ต้องการ
        const payload = {
            username:   username,
            loginName:  newLoginName, // ส่งค่าที่ admin แก้ไข (หรือ username ถ้าเว้นว่าง)
            fullName:   newName,
            position:   newPosition,
            department: newDepartment,
            role:       newRole
        };

        // ★★★ จุดที่แก้ไข: เปลี่ยนชื่อ API จาก 'editUser' เป็น 'adminUpdateUser' ★★★
        const result = await apiCall('POST', 'adminUpdateUser', payload);

        if (result.status !== 'success') {
            throw new Error(result.message || 'ไม่สามารถอัปเดตข้อมูลใน Google Sheets ได้');
        }

        // 2. อัปเดตใน Firebase ควบคู่ไปด้วย
        if (typeof db !== 'undefined') {
            try {
                const snapshot = await db.collection('users').where('username', '==', username).get();
                if (!snapshot.empty) {
                    const batch = db.batch();
                    snapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            loginName:  newLoginName,
                            fullName:   newName,
                            position:   newPosition,
                            department: newDepartment,
                            role:       newRole,
                            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    await batch.commit();
                }
            } catch (fbError) {
                console.warn("Firebase update warning:", fbError);
            }
        }
        
        showAlert('สำเร็จ', 'อัปเดตข้อมูลผู้ใช้เรียบร้อยแล้ว');
        document.getElementById('edit-user-modal').style.display = 'none';
        
        // โหลดตารางใหม่เพื่อให้ข้อมูลอัปเดตทันที
        if (typeof fetchAllUsers === 'function') {
            fetchAllUsers(); 
        }
        
    } catch (error) {
        console.error('Error updating user:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลได้: ' + error.message);
    } finally {
        btnText.textContent = 'บันทึกข้อมูล';
        submitBtn.disabled = false;
    }
}

// ============================================================
// ระบบลายเซ็นผู้ขอ (Requester Signature System)
// ============================================================

// ตัวแปร global สำหรับ signature pad ในฟอร์ม (pre-submission)
let requesterSignaturePad = null;
// signature pad ในฟอร์มแก้ไข
let editSignaturePad = null;
// เก็บข้อมูลเอกสารล่าสุดที่สร้างเสร็จ (สำหรับ post-submission e-sign)
window._lastCreatedDoc = { id: null, pdfUrl: null };
// signature pad ใน draw modal (post-submission)
let _reqDrawPadInstance = null;

// --- 1. Initialize signature pad ในฟอร์ม (form-sig-canvas) ---
function initFormSignaturePad() {
    const canvas = document.getElementById('form-sig-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.offsetWidth || 460;
    const height = rect.height || canvas.offsetHeight || 188;
    const result = createSignaturePad(canvas, requesterSignaturePad, {
        width,
        height
    });
    if (!result) return;
    requesterSignaturePad = result.pad;
    window._sigPadRatio = result.ratio;
}

// --- 1b. Initialize signature pad ในฟอร์มแก้ไข (edit-sig-canvas) ---
function initEditSignaturePad() {
    const canvas = document.getElementById('edit-sig-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.offsetWidth || 460;
    const height = rect.height || canvas.offsetHeight || 188;
    const result = createSignaturePad(canvas, editSignaturePad, {
        width,
        height
    });
    if (!result) return;
    editSignaturePad = result.pad;
    window._sigPadRatio = result.ratio;

    const clearBtn = document.getElementById('edit-sig-clear-btn');
    if (clearBtn && !clearBtn.dataset.boundSignatureClear) {
        clearBtn.dataset.boundSignatureClear = '1';
        clearBtn.addEventListener('click', () => editSignaturePad && editSignaturePad.clear());
    }
}

// --- 2. เปิด draw modal สำหรับ post-submission e-sign ---
function openRequesterDrawSigModal() {
    const modal = document.getElementById('requester-draw-sig-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const canvas = document.getElementById('requester-draw-canvas');
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.offsetWidth || 460;
    const height = rect.height || canvas.offsetHeight || 188;
    const result = createSignaturePad(canvas, _reqDrawPadInstance, {
        width,
        height
    });
    if (!result) return;
    _reqDrawPadInstance = result.pad;
    window._sigPadRatio = result.ratio;
}

// --- 3. ยืนยันลายเซ็นใน draw modal → เปิด stamper modal กับ PDF ---
async function handleRequesterDrawConfirm() {
    if (!_reqDrawPadInstance || _reqDrawPadInstance.isEmpty()) {
        alert('กรุณาเซ็นชื่อก่อนกดยืนยันครับ');
        return;
    }

    const rawSignatureBase64 = _reqDrawPadInstance.toDataURL('image/png');
    const signatureBase64 = (typeof optimizeSignatureDataURL === 'function')
        ? await optimizeSignatureDataURL(rawSignatureBase64)
        : rawSignatureBase64;
    document.getElementById('requester-draw-sig-modal').classList.add('hidden');

    const pdfUrl = window._lastCreatedDoc.pdfUrl;
    if (!pdfUrl) {
        alert('ไม่พบไฟล์ PDF กรุณาลองใหม่');
        return;
    }

    try {
        showAlert('กำลังโหลด', 'กำลังโหลดเอกสารสำหรับลงนาม...', false);
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error('โหลด PDF ไม่สำเร็จ');
        const pdfBlob = await response.blob();
        document.getElementById('alert-modal').style.display = 'none';

        // เรียก promptForSignature (ใน requests.js) → เปิด requester-stamper-modal
        const signedBlob = await promptForSignature(pdfBlob, signatureBase64);

        // อัปโหลดไฟล์ที่ลงนามแล้วกลับขึ้น Drive
        await reUploadSignedDocument(signedBlob);

    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}

// --- 4. อัปโหลดไฟล์ที่ลงนามแล้วและอัปเดต Firestore ---
async function reUploadSignedDocument(signedBlob) {
    const docId = window._lastCreatedDoc.id;
    if (!docId) { alert('ไม่พบรหัสเอกสาร'); return; }

    try {
        showAlert('กำลังบันทึก', 'กำลังบันทึกเอกสารที่ลงนามแล้ว...', false);

        const user = getCurrentUser();
        const safeId = docId.replace(/[\/\\:\.]/g, '-');
        const newUrl = await uploadPdfToFirebaseStorage(
            signedBlob, user?.username || 'user',
            `memo_signed_${safeId}.pdf`
        );

        // อัปเดต Firestore ด้วย URL ใหม่
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                memoPdfUrl: newUrl,
                pdfUrl: newUrl,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        document.getElementById('alert-modal').style.display = 'none';
        showAlert('สำเร็จ', 'ลงนามเอกสารเรียบร้อยแล้ว!');
        if (typeof clearRequestsCache === 'function') clearRequestsCache();

    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + e.message);
    }
}

// --- 5. แสดง form-result หลังสร้างเอกสารสำเร็จ ---
function showFormResult(title, message, pdfUrl, requestId) {
    // ซ่อนฟอร์ม แสดง result
    document.getElementById('request-form').classList.add('hidden');
    const resultDiv = document.getElementById('form-result');
    resultDiv.classList.remove('hidden');

    document.getElementById('form-result-title').textContent = title;
    document.getElementById('form-result-message').textContent = message;

    const btnPrint   = document.getElementById('btn-print-doc');
    const pdfPreview = document.getElementById('result-pdf-preview');
    const pdfViewer  = document.getElementById('result-pdf-viewer');
    const btnOpenTab = document.getElementById('btn-open-pdf-tab');
    const pdfPending = document.getElementById('result-pdf-pending');

    if (pdfUrl) {
        // แสดง embedded viewer
        if (pdfViewer)  pdfViewer.src  = pdfUrl;
        if (btnOpenTab) btnOpenTab.href = pdfUrl;
        if (pdfPreview) pdfPreview.classList.remove('hidden');
        if (pdfPending) pdfPending.classList.add('hidden');

        // ปุ่มดาวน์โหลด
        if (btnPrint) { btnPrint.href = pdfUrl; btnPrint.classList.remove('hidden'); }
    } else {
        if (pdfPreview) pdfPreview.classList.add('hidden');
        if (pdfPending) pdfPending.classList.remove('hidden');
        if (btnPrint)   btnPrint.classList.add('hidden');
    }

    // เก็บข้อมูลสำหรับใช้กับ btn-esign-doc
    window._lastCreatedDoc = { id: requestId, pdfUrl: pdfUrl };
}

// --- 6. ปุ่ม "กลับหน้าหลัก" ใน form-result ---
function goToDashboardFromResult() {
    document.getElementById('form-result').classList.add('hidden');
    document.getElementById('request-form').classList.remove('hidden');
    if (typeof clearRequestsCache === 'function') clearRequestsCache();
    if (typeof fetchUserRequests === 'function') fetchUserRequests();
    switchPage('dashboard-page');
}

// --- 7. ผูก Event Listeners ทั้งหมด ---
document.addEventListener('DOMContentLoaded', function () {

    // ผูก form-sig-canvas (pre-submission pad)
    const formNavBtn = document.getElementById('user-nav-form');
    if (formNavBtn) {
        formNavBtn.addEventListener('click', () => setTimeout(initFormSignaturePad, 150));
    }
    // init ครั้งแรกเผื่อหน้า form เปิดตอนโหลด
    setTimeout(initFormSignaturePad, 500);

    // ปุ่มล้าง pre-submission pad
    document.getElementById('form-sig-clear-btn')?.addEventListener('click', () => {
        if (requesterSignaturePad) requesterSignaturePad.clear();
    });

    // ปุ่ม btn-esign-doc (post-submission)
    document.getElementById('btn-esign-doc')?.addEventListener('click', openRequesterDrawSigModal);

    // ปุ่มล้างใน draw modal
    document.getElementById('req-sig-clear-btn')?.addEventListener('click', () => {
        if (_reqDrawPadInstance) _reqDrawPadInstance.clear();
    });

    // ปุ่มยืนยันใน draw modal
    document.getElementById('req-sig-confirm-btn')?.addEventListener('click', handleRequesterDrawConfirm);
});

// ===== หน้าจัดการหัวหน้าส่วน =====

async function loadHeadsManagement() {
    const tbody = document.getElementById('heads-config-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-gray-400">กำลังโหลด...</td></tr>';

    let savedNames = {};
    let savedUsernames = {};
    try {
        const result = await apiCall('GET', 'getSignerPositions');
        if (result?.status === 'success' && result?.data) {
            savedNames = result.data.names || {};
            savedUsernames = result.data.usernames || {};
        }
    } catch (e) {
        console.warn('loadHeadsManagement API error:', e);
    }

    // สร้าง rows จาก specialPositionMap (ฐาน) + override จาก Supabase
    const positions = Object.keys(specialPositionMap);
    tbody.innerHTML = '';
    positions.forEach(pos => {
        const safePos = escapeHtml(pos);
        const currentName = escapeHtml(savedNames[pos] !== undefined ? savedNames[pos] : (specialPositionMap[pos] || ''));
        const currentUsername = escapeHtml(savedUsernames[pos] || '');
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50';
        tr.innerHTML = `
            <td class="p-3 text-gray-700 text-xs">${safePos}</td>
            <td class="p-3">
                <input type="text" data-pos="${safePos}" data-field="name"
                    class="heads-name-input w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                    value="${currentName}" placeholder="ชื่อ-นามสกุล">
            </td>
            <td class="p-3">
                <input type="text" data-pos="${safePos}" data-field="username"
                    class="heads-username-input w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                    value="${currentUsername}" placeholder="username (ว่างได้)">
            </td>`;
        tbody.appendChild(tr);
    });
}

async function saveHeadsConfig() {
    const btn = document.getElementById('save-heads-btn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...'; }

    try {
        const names = {};
        const usernames = {};

        document.querySelectorAll('#heads-config-tbody input[data-field="name"]').forEach(input => {
            const pos = input.dataset.pos;
            if (pos) names[pos] = input.value.trim();
        });
        document.querySelectorAll('#heads-config-tbody input[data-field="username"]').forEach(input => {
            const pos = input.dataset.pos;
            if (pos && input.value.trim()) usernames[pos] = input.value.trim();
        });

        const result = await apiCall('POST', 'saveSignerPositions', {
            names,
            usernames,
            updatedBy: getCurrentUser()?.username || ''
        });
        if (result?.status !== 'success') {
            throw new Error(result?.message || 'บันทึกข้อมูลหัวหน้าส่วนไม่สำเร็จ');
        }

        // อัปเดต specialPositionMap ในหน่วยความจำทันที
        Object.assign(specialPositionMap, names);
        if (typeof refreshSignerPositionOptions === 'function') refreshSignerPositionOptions();

        showAlert('สำเร็จ', 'บันทึกการตั้งค่าหัวหน้าส่วนเรียบร้อยแล้ว');
    } catch (e) {
        console.error('saveHeadsConfig error:', e);
        showAlert('ผิดพลาด', 'ไม่สามารถบันทึกได้: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '💾 บันทึกการตั้งค่า'; }
    }
}
// =========================================================
// 4b. แอดมิน: เปิด modal เลือกส่งต่อเอกสาร (แบบ Radio Button จัดกลุ่ม)
// =========================================================
window.adminRouteDocument = function(docId) {
    const data = window._approvalDocs?.[docId] || {};
    window._routingDocId = docId;

    // 1. ตรวจสอบและสร้างโครงสร้างหน้าต่าง (Modal) อัตโนมัติ
    let modal = document.getElementById('admin-route-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'admin-route-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] hidden backdrop-blur-sm';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl w-11/12 max-w-lg p-6 transform transition-all max-h-[90vh] flex flex-col">
                <div class="flex items-center gap-3 mb-4 flex-shrink-0">
                    <div class="p-3 bg-blue-100 text-blue-600 rounded-full">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>
                    </div>
                    <div>
                        <h3 class="text-xl font-bold text-gray-800">ส่งต่อเอกสาร</h3>
                        <p class="text-sm text-gray-500">รหัส: <span id="route-doc-id-display" class="font-mono text-blue-600"></span></p>
                    </div>
                </div>
                
                <div id="route-signed-summary" class="hidden mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex-shrink-0">
                    <p class="text-xs font-bold text-green-800 mb-1">✅ ผู้ที่ลงนามแล้ว:</p>
                    <p id="route-signed-list" class="text-sm text-green-700 font-medium"></p>
                </div>

                <div id="route-options-list" class="overflow-y-auto pr-2 space-y-1 mb-4 flex-1">
                    </div>

                <div class="flex justify-end gap-3 flex-shrink-0 pt-4 border-t border-gray-100">
                    <button onclick="closeAdminRouteModal()" class="px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors">ยกเลิก</button>
                    <button onclick="confirmAdminRoute()" id="admin-route-confirm-btn" class="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 shadow-md transition-transform hover:scale-105">ส่งเอกสาร</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // แสดง docId บน modal
    const display = document.getElementById('route-doc-id-display');
    if (display) display.textContent = docId;

    // กลุ่มตำแหน่ง (อ้างอิงจากโค้ดเดิมของคุณ)
    const ROUTE_GROUPS = [
        { group: '👥 หัวหน้ากลุ่มสาระ / กลุ่มบริหาร', items: [
            { status: 'waiting_deputy_general',    label: 'รองผอ. กลุ่มบริหารทั่วไป',        roleKey: 'dep_general' },
            { status: 'waiting_deputy_budget',     label: 'รองผอ. กลุ่มบริหารงบประมาณ',      roleKey: 'dep_budget' },
            { status: 'waiting_head_thai',      label: 'หัวหน้ากลุ่มสาระภาษาไทย',         roleKey: 'head_thai' },
            { status: 'waiting_head_foreign',   label: 'หัวหน้ากลุ่มสาระภาษาต่างประเทศ',  roleKey: 'head_foreign' },
            { status: 'waiting_head_science',   label: 'หัวหน้ากลุ่มสาระวิทยาศาสตร์ฯ',   roleKey: 'head_science' },
            { status: 'waiting_head_art',       label: 'หัวหน้ากลุ่มสาระศิลปะ',           roleKey: 'head_art' },
            { status: 'waiting_head_social',    label: 'หัวหน้ากลุ่มสาระสังคมศึกษาฯ',    roleKey: 'head_social' },
            { status: 'waiting_head_health',    label: 'หัวหน้ากลุ่มสาระสุขศึกษาฯ',      roleKey: 'head_health' },
            { status: 'waiting_head_career',    label: 'หัวหน้ากลุ่มสาระการงานอาชีพ',     roleKey: 'head_career' },
            { status: 'waiting_head_math',      label: 'หัวหน้ากลุ่มสาระคณิตศาสตร์',     roleKey: 'head_math' },
            { status: 'waiting_head_guidance',  label: 'หัวหน้างานแนะแนว',                roleKey: 'head_guidance' },
            { status: 'waiting_head_general',   label: 'หัวหน้ากลุ่มบริหารทั่วไป',       roleKey: 'head_general' },
            { status: 'waiting_head_personnel', label: 'หัวหน้ากลุ่มบริหารงานบุคคล',      roleKey: 'head_personnel' },
            { status: 'waiting_head_budget',    label: 'หัวหน้ากลุ่มบริหารงบประมาณ',      roleKey: 'head_budget' },
            { status: 'waiting_head_acad',      label: 'หัวหน้ากลุ่มบริหารวิชาการ',       roleKey: 'head_acad' },
        ]},
        { group: '🏫 รองผู้อำนวยการ', items: [
            { status: 'waiting_deputy_personnel',  label: 'รองผอ. กลุ่มบริหารงานบุคคล',      roleKey: 'dep_personnel' },
            { status: 'waiting_deputy_acad',       label: 'รองผอ. กลุ่มบริหารวิชาการ',       roleKey: 'dep_acad' },
        ]},
        { group: '📋 ขั้นตอนสุดท้าย', items: [
            { status: 'waiting_saraban',  label: 'งานสารบรรณ',  roleKey: 'saraban' },
            { status: 'waiting_director', label: 'ผู้อำนวยการ', roleKey: 'director' },
        ]},
    ];

    // รวบรวมตำแหน่งที่ลงนามแล้ว
    const signedLabels = [];
    ROUTE_GROUPS.forEach(grp => grp.items.forEach(opt => {
        if (data[`signedBy_${opt.roleKey}`]) signedLabels.push(opt.label);
    }));

    // แสดงคนที่เซ็นแล้ว
    const summaryBar  = document.getElementById('route-signed-summary');
    const signedList  = document.getElementById('route-signed-list');
    if (summaryBar && signedList) {
        if (signedLabels.length > 0) {
            signedList.textContent = signedLabels.join(', ');
            summaryBar.classList.remove('hidden');
        } else {
            summaryBar.classList.add('hidden');
        }
    }

    // สร้างลิสต์รายการแบบวิทยุ (Radio)
    const listEl = document.getElementById('route-options-list');
    listEl.innerHTML = '';

    ROUTE_GROUPS.forEach(grp => {
        const groupHeader = document.createElement('p');
        groupHeader.className = 'text-xs font-bold text-gray-500 uppercase tracking-wider mt-2 mb-1 px-1';
        groupHeader.textContent = grp.group;
        listEl.appendChild(groupHeader);

        grp.items.forEach(opt => {
            const isSigned    = !!data[`signedBy_${opt.roleKey}`];
            const signedByName = data[`signedBy_${opt.roleKey}`] || '';
            const isCurrent   = data.docStatus === opt.status;

            const label = document.createElement('label');
            label.className = `flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer border transition-all
                ${isCurrent ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400' : 'border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`;

            const radio = document.createElement('input');
            radio.type  = 'radio';
            radio.name  = 'admin-route-target';
            radio.value = opt.status;
            radio.className = 'w-4 h-4 accent-blue-600';
            if (isCurrent) radio.checked = true;

            const textWrap = document.createElement('span');
            textWrap.className = 'flex-1 flex items-center gap-2';

            const labelText = document.createElement('span');
            labelText.className = 'text-sm text-gray-800';
            labelText.textContent = opt.label;

            textWrap.appendChild(labelText);

            if (isSigned) {
                const badge = document.createElement('span');
                badge.className = 'ml-auto text-xs text-green-700 bg-green-100 rounded-full px-2 py-0.5 whitespace-nowrap';
                badge.textContent = `✅ ${signedByName}`;
                textWrap.appendChild(badge);
            }
            if (isCurrent && !isSigned) {
                const cur = document.createElement('span');
                cur.className = 'ml-auto text-xs text-blue-700 bg-blue-100 rounded-full px-2 py-0.5 whitespace-nowrap font-bold';
                cur.textContent = '◀ ปัจจุบัน';
                textWrap.appendChild(cur);
            }

            label.appendChild(radio);
            label.appendChild(textWrap);
            listEl.appendChild(label);

            radio.addEventListener('change', () => {
                listEl.querySelectorAll('label').forEach(l => {
                    l.classList.remove('border-blue-400', 'bg-blue-50', 'ring-1', 'ring-blue-400');
                    l.classList.add('border-gray-200');
                });
                if (radio.checked) {
                    label.classList.remove('border-gray-200');
                    label.classList.add('border-blue-400', 'bg-blue-50', 'ring-1', 'ring-blue-400');
                }
            });
        });
    });

    // เปิด modal
    document.getElementById('admin-route-modal').classList.remove('hidden');
    document.getElementById('admin-route-modal').style.display = 'flex';
};

// 4c. แอดมิน: ยืนยันส่งต่อเอกสารไปยังตำแหน่งที่เลือก
window.confirmAdminRoute = async function() {
    const selected = document.querySelector('input[name="admin-route-target"]:checked');
    if (!selected) {
        alert('⚠️ กรุณาเลือกตำแหน่งที่ต้องการส่งต่อก่อน');
        return;
    }
    const targetStatus = selected.value;
    const docId        = window._routingDocId;
    if (!docId) { alert('ไม่พบรหัสเอกสาร'); return; }

    const labelEl = selected.closest('label')?.querySelector('span.text-sm');
    const targetLabel = labelEl ? labelEl.textContent : targetStatus;

    const safeId    = docId.replace(/[\/\\:\.]/g, '-');
    const user      = getCurrentUser();
    const docMeta   = window._approvalDocs?.[docId] || {};
    const origDocId = docMeta.id || docMeta.requestId || docId;

    if (
        targetStatus === 'waiting_saraban' &&
        typeof memoRequiresCommandBeforeSaraban === 'function' &&
        memoRequiresCommandBeforeSaraban(docMeta, docMeta.docStatus || '')
    ) {
        const requestLabel = origDocId || docId;
        const purpose = docMeta.purpose || 'ไม่ระบุเรื่อง';
        if (typeof showAlert === 'function') {
            showAlert(
                'ต้องสร้างคำสั่งก่อน',
                `บันทึก "${requestLabel}" ยังไม่มีคำสั่งไปราชการ\n\nเรื่อง: ${purpose}\n\nกรุณาให้แอดมินสร้างคำสั่งก่อน แล้วจึงส่งเรื่องไปงานสารบรรณพร้อมกัน`
            );
        } else {
            alert(`บันทึก "${requestLabel}" ยังไม่มีคำสั่งไปราชการ\n\nเรื่อง: ${purpose}\n\nกรุณาให้แอดมินสร้างคำสั่งก่อน แล้วจึงส่งเรื่องไปงานสารบรรณพร้อมกัน`);
        }
        return;
    }

    if (!confirm(`ยืนยันส่งเอกสาร:\n"${origDocId}"\n\n→ ${targetLabel}`)) return;

    closeAdminRouteModal();
    const alertModal = document.getElementById('alert-modal');
    if (alertModal) alertModal.style.display = 'flex';

    try {
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                docStatus:       targetStatus,
                adminRoutedAt:   firebase.firestore.FieldValue.serverTimestamp(),
                adminRoutedBy:   user?.name || user?.username || 'admin',
                lastUpdated:     firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        apiCall('POST', 'updateRequest', {
            requestId: origDocId,
            docStatus: targetStatus,
        }).catch(err => console.warn('Sheet update error:', err));

        // ★ สร้างลิงก์ Token ให้ผู้รับคนต่อไป (โค้ดส่วนที่หายไป)
        if (typeof generateApprovalToken === 'function') {
            await generateApprovalToken(origDocId, targetStatus, docMeta);
        }

        if (alertModal) alertModal.style.display = 'none';
        if (typeof showAlert === 'function') {
            showAlert('✅ ส่งต่อสำเร็จ', `ส่งเอกสาร "${origDocId}" ไปยัง\n"${targetLabel}" เรียบร้อยแล้ว`);
        } else {
            alert(`ส่งเอกสารไปยัง ${targetLabel} สำเร็จ!`);
        }
        
        if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
        if (typeof loadApprovalLinkManagement === 'function') loadApprovalLinkManagement();
        
    } catch (e) {
        if (alertModal) alertModal.style.display = 'none';
        alert('❌ ผิดพลาด: ' + e.message);
    }
};

// 4d. แอดมิน: ปิด routing modal
window.closeAdminRouteModal = function() {
    const modal = document.getElementById('admin-route-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    window._routingDocId = null;
};
