// --- AUTH FUNCTIONS (HYBRID SYSTEM) ---
// --- แก้ไขฟังก์ชัน handleLogin ---

async function handleLogin(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('username').value.trim(); // สิ่งที่พิมพ์ (อาจเป็น LoginName)
    const password = document.getElementById('password').value;

    if (!usernameInput || !password) {
        showAlert('ผิดพลาด', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    toggleLoader('login-button', true);
    document.getElementById('login-error').classList.add('hidden');
    
    try {
        const email = `${usernameInput}@wny.app`; 
        const firebasePassword = adjustPasswordForFirebase(password);
        
        let firebaseUser = null;
        let userData = null;

        // 1. ลอง Login Firebase
        try {
            if (typeof firebase !== 'undefined') {
                const userCredential = await firebase.auth().signInWithEmailAndPassword(email, firebasePassword);
                firebaseUser = userCredential.user;
            }
        } catch (firebaseError) { /* ข้าม */ }

       // 2. เรียกตรวจสอบกับ Google Sheet (Hybrid Check)
        // เพื่อดึง "ตัวตนที่แท้จริง" (Real Identity)
        const result = await apiCall('POST', 'verifyCredentials', { username: usernameInput, password: password });

        if (result.status === 'success') {
            const realUser = result.user; // ข้อมูลที่ถูกต้องจาก Sheet

            // ★★★ แก้ไข: ใช้ ID จริง (realUser.username) แทนสิ่งที่พิมพ์ (usernameInput) ★★★
            // เช่น พิมพ์ 'kong' แต่ realUser.username คือ 'admin' -> เราจะใช้ 'admin'
            
            // ★ ต้อง ensureFirebaseAuth ก่อน เพื่อให้มี Firebase UID (email หรือ anonymous)
            if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();

            const _fbUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
            if (_fbUser) {
                const userDocRef = firebase.firestore().collection('users').doc(_fbUser.uid);
                const payload = {
                    username:  realUser.username,
                    loginName: realUser.loginName || usernameInput,
                    fullName:  realUser.fullName,
                    role:      realUser.role,
                    lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                };
                try {
                    // ลอง write ทั้ง role (สำเร็จถ้า doc ใหม่ หรือ role ไม่เปลี่ยน)
                    await userDocRef.set(payload, { merge: true });
                } catch (_roleErr) {
                    // ถ้า blocked (role ต่างจากเดิม) → write แค่ field ที่ไม่ใช่ role
                    try {
                        await userDocRef.set({
                            username:  realUser.username,
                            loginName: realUser.loginName || usernameInput,
                            fullName:  realUser.fullName,
                            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });
                    } catch (_) { /* ไม่ทำให้ login หยุด */ }
                }
            }

            // บันทึกลง Session Browser
            sessionStorage.setItem('currentUser', JSON.stringify(realUser));
            window.currentUser = realUser;
            
            await initializeUserSession(realUser);
            showMainApp();
            checkAndShowAnnouncement();
        } else {
            throw new Error(result.message || 'รหัสผ่านไม่ถูกต้อง');
        }

    } catch (error) {
        document.getElementById('login-error').textContent = error.message;
        document.getElementById('login-error').classList.remove('hidden');
    } finally {
        toggleLoader('login-button', false);
    }
}
function handleLogout() {
    sessionStorage.removeItem('currentUser');
    window.currentUser = null;
    window.location.reload();
}

// ✅ [แก้ไข] ฟังก์ชันโหลดข้อมูลโปรไฟล์ (ที่เคยหายไป)
function loadProfileData() {
    const user = getCurrentUser();
    if (!user) return;

    // เติมข้อมูลลงในฟอร์ม
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };

    setVal('profile-username', user.username);
    setVal('profile-loginname', user.loginName || user.username);
    setVal('profile-fullname', user.fullName);
    setVal('profile-position', user.position);
    setVal('profile-department', user.department);
    setVal('profile-email', user.email);
}

// ✅ [แก้ไข] ฟังก์ชันตั้งค่า Session และแสดงปุ่ม Admin ให้ถูกต้อง
async function initializeUserSession(user) {
    // sign in anonymously เพื่อให้ Firestore rules ผ่าน (ก่อน listener ทุกตัว)
    if (typeof ensureFirebaseAuth === 'function') await ensureFirebaseAuth();

    // 1. สลับหน้าจอ
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
    
    // 2. แสดงชื่อผู้ใช้
    const nameEl = document.getElementById('user-fullname');
    if (nameEl) nameEl.textContent = user.fullName || user.username;

    const posEl = document.getElementById('user-position');
    if (posEl) posEl.textContent = user.position || (user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานทั่วไป');

    // Sidebar footer user info
    const sidebarName = document.getElementById('user-fullname-sidebar');
    if (sidebarName) sidebarName.textContent = user.fullName || user.username;
    const sidebarPos = document.getElementById('user-position-sidebar');
    if (sidebarPos) sidebarPos.textContent = user.position || (user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานทั่วไป');

    if (typeof loadSystemWorkflowSettings === 'function') {
        await loadSystemWorkflowSettings();
    }
    
    // 3. จัดการเมนู Admin (แก้ไขให้เรียก ID ที่ถูกต้องใน HTML)
    const adminBtnCommand       = document.getElementById('admin-nav-command');
    const adminBtnUsers         = document.getElementById('admin-nav-users');
    const adminBtnApprovalLinks = document.getElementById('admin-nav-approval-links');
    const adminBtnSystemSettings = document.getElementById('admin-nav-system-settings');
    const adminBtnHeads         = document.getElementById('admin-nav-heads');
    const adminSyncBtn          = document.getElementById('admin-sync-btn');
    const adminBackupBtn        = document.getElementById('admin-backup-btn');
    const adminEmailBackupBtn   = document.getElementById('admin-email-backup-btn');
    const archiveLinkBtn        = document.getElementById('archive-link-btn');
    const adminSectionLabel     = document.getElementById('admin-section-label');
    const isAdmin = String(user.role).toLowerCase() === 'admin';

    if (isAdmin) {
        if (adminBtnCommand)       adminBtnCommand.classList.remove('hidden');
        if (adminBtnUsers)         adminBtnUsers.classList.remove('hidden');
        if (adminBtnApprovalLinks) adminBtnApprovalLinks.classList.remove('hidden');
        if (adminBtnSystemSettings) adminBtnSystemSettings.classList.remove('hidden');
        if (adminBtnHeads)         adminBtnHeads.classList.remove('hidden');
        if (adminSyncBtn)          adminSyncBtn.classList.remove('hidden');
        if (adminBackupBtn)        adminBackupBtn.classList.remove('hidden');
        if (adminEmailBackupBtn)   { adminEmailBackupBtn.classList.remove('hidden'); adminEmailBackupBtn.style.display = ''; }
        if (archiveLinkBtn)        { archiveLinkBtn.classList.remove('hidden'); archiveLinkBtn.style.display = ''; }
        if (adminSectionLabel)     adminSectionLabel.classList.remove('hidden');
    } else {
        if (adminBtnCommand)       adminBtnCommand.classList.add('hidden');
        if (adminBtnUsers)         adminBtnUsers.classList.add('hidden');
        if (adminBtnApprovalLinks) adminBtnApprovalLinks.classList.add('hidden');
        if (adminBtnSystemSettings) adminBtnSystemSettings.classList.add('hidden');
        if (adminBtnHeads)         adminBtnHeads.classList.add('hidden');
        if (adminSyncBtn)          adminSyncBtn.classList.add('hidden');
        if (adminBackupBtn)        adminBackupBtn.classList.add('hidden');
        if (adminEmailBackupBtn)   { adminEmailBackupBtn.classList.add('hidden'); adminEmailBackupBtn.style.display = 'none'; }
        if (archiveLinkBtn)        { archiveLinkBtn.classList.add('hidden'); archiveLinkBtn.style.display = 'none'; }
        if (adminSectionLabel)     adminSectionLabel.classList.add('hidden');
    }

    // 4. เมนู "เอกสารรอลงนาม" — แสดงทันทีถ้า role บ่งบอกว่าเป็นผู้อนุมัติ
    const hasApproverRole = !isAdmin && user.role && (
        user.role.startsWith('head_') ||
        user.role.startsWith('deputy_') ||
        user.role === 'saraban' ||
        user.role === 'director'
    );
    if (isAdmin || hasApproverRole) {
        const inboxNav = document.getElementById('nav-approval-inbox');
        if (inboxNav) inboxNav.style.display = '';
        if (typeof refreshApprovalInboxBadge === 'function') refreshApprovalInboxBadge();
    }

    // 5. สารบรรณ / ผู้อำนวยการ: แสดงเฉพาะเมนูที่ใช้งาน (เอกสารรอลงนาม + ข้อมูลส่วนตัว)
    if (user.role === 'saraban' || user.role === 'director') {
        // ซ่อนเมนูที่ไม่ใช้งาน
        const hideMenus = ['user-nav-dashboard', 'user-nav-form', 'nav-send-memo', 'nav-stats'];
        hideMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        // ปรับสไตล์ปุ่ม Inbox ให้เข้ากับ grid layout เหมือนปุ่มอื่น
        const inboxNav = document.getElementById('nav-approval-inbox');
        if (inboxNav) {
            inboxNav.className = 'nav-button p-4 text-center bg-white rounded-lg shadow hover:bg-indigo-50 transition';
            inboxNav.innerHTML = `
                <h3 class="font-bold text-indigo-700">📥 เอกสารรอลงนาม</h3>
                <p class="text-xs text-gray-500">รายการที่ต้องดำเนินการ</p>
                <span id="approval-badge" class="inline-block mt-1 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full hidden">0</span>`;
            inboxNav.style.display = '';
        }
        // นำทางไปหน้าเอกสารรอลงนามทันที (switchPage จะเรียก loadPendingApprovals อัตโนมัติ)
        if (typeof switchPage === 'function') switchPage('approval-page');
    }

    // Non-blocking: โหลด signerPositions เพื่ออัปเดต specialPositionMap
    // และตรวจ approver ผ่าน username (กรณีแอดมิน assign แต่ยังไม่ได้ reload)
    if (!isAdmin && typeof db !== 'undefined') {
        (async () => {
            try {
                const snap = await db.collection('systemConfig').doc('signerPositions').get();
                if (!snap.exists) return;
                const data = snap.data();
                // อัปเดต specialPositionMap
                if (data.names && typeof specialPositionMap !== 'undefined') {
                    Object.assign(specialPositionMap, data.names);
                    if (typeof refreshSignerPositionOptions === 'function') {
                        refreshSignerPositionOptions();
                    }
                }
                // ตรวจ approver ผ่าน username (สำหรับกรณี role ยังไม่ได้ update)
                if (!hasApproverRole) {
                    const usernames = data.usernames || {};
                    const posEntry = Object.entries(usernames).find(([, uname]) => uname === user.username);
                    if (posEntry) {
                        // กำหนด _approverRole เพื่อให้ getTargetStatusForUser ใช้งานได้
                        const headRole = (typeof POSITION_TO_ROLE !== 'undefined') ? POSITION_TO_ROLE[posEntry[0]] : null;
                        if (headRole) user._approverRole = headRole;
                        const inboxNav = document.getElementById('nav-approval-inbox');
                        if (inboxNav) inboxNav.style.display = '';
                        if (typeof refreshApprovalInboxBadge === 'function') refreshApprovalInboxBadge();
                    }
                }
            } catch (e) {
                console.warn('signerPositions load error:', e);
            }
        })();
    }

    // 6. นำทางหน้าแรกหลัง Login
    // saraban/director ถูก redirect ไปแล้วที่ข้างบน (approval-page)
    if (typeof switchPage === 'function') {
        const isSarabanOrDirector = user.role === 'saraban' || user.role === 'director';
        if (!isSarabanOrDirector) {
            if (isAdmin) {
                switchPage('command-generation-page');
                loadAdminCommandBadge(); // โหลด badge จำนวนรายการรอดำเนินการ
            } else {
                switchPage('dashboard-page');
            }
        }
    }
}

// โหลดจำนวนรายการที่รอ Admin ดำเนินการ แสดงเป็น badge ที่เมนูจัดการบันทึก/คำสั่ง
async function loadAdminCommandBadge() {
    if (typeof db === 'undefined') return;
    try {
        const snap = await db.collection('requests')
            .where('docStatus', '==', 'waiting_admin_review')
            .get();
        const badge = document.getElementById('admin-command-badge');
        if (!badge) return;
        if (snap.empty) {
            badge.classList.add('hidden');
        } else {
            badge.textContent = snap.size;
            badge.classList.remove('hidden');
        }
    } catch (e) {
        console.warn('loadAdminCommandBadge error:', e);
    }
}

function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
}

function showLoginScreen() {
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}

function handleProfileUpdate(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const formData = {
        username: user.username,
        loginName: document.getElementById('profile-loginname').value, // รับค่า Login Name ใหม่
        fullName: document.getElementById('profile-fullname').value,
        email: document.getElementById('profile-email').value,
        position: document.getElementById('profile-position').value,
        department: document.getElementById('profile-department').value
    };

    toggleLoader('profile-submit-button', true);

    apiCall('POST', 'updateUserProfile', formData)
        .then(result => {
            if (result.status === 'success') {
                const updatedUser = { ...user, ...formData };
                sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
                window.currentUser = updatedUser;
                
                // อัปเดตชื่อมุมจอทันที
                const nameEl = document.getElementById('user-fullname');
                if (nameEl) nameEl.textContent = updatedUser.fullName;
                
                showAlert('สำเร็จ', 'บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว');
            } else {
                showAlert('ผิดพลาด', result.message);
            }
        })
        .catch(error => { showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message); })
        .finally(() => { toggleLoader('profile-submit-button', false); });
}

async function handlePasswordUpdate(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const formData = {
        username: user.username,
        oldPassword: document.getElementById('current-password').value,
        newPassword: document.getElementById('new-password').value
    };

    if (!formData.oldPassword || !formData.newPassword) {
        showAlert('ผิดพลาด', 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่');
        return;
    }

    if (formData.newPassword.length < 6) {
        showAlert('ผิดพลาด', 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
        return;
    }

    toggleLoader('password-submit-button', true);

    try {
        const result = await apiCall('POST', 'updatePassword', formData);
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'เปลี่ยนรหัสผ่านสำเร็จ');
            document.getElementById('password-form').reset();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
    } finally {
        toggleLoader('password-submit-button', false);
    }
}

function handleRegister(e) {
    e.preventDefault();
    // 🔒 1. เพิ่มการบล็อก: ตรวจสอบว่ามี Admin ล็อกอินอยู่หรือไม่
    const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!currentUser || currentUser.role !== 'admin') {
        showAlert('ระบบปิดรับสมัคร', 'ระบบไม่อนุญาตให้สมัครสมาชิกด้วยตนเอง กรุณาติดต่อผู้ดูแลระบบเพื่อเพิ่มบัญชีครับ');
        
        // ปิดหน้าต่าง Modal บังคับกลับไปหน้าเดิม
        const regModal = document.getElementById('register-modal');
        if (regModal) regModal.style.display = 'none';
        return; // หยุดการทำงานของฟังก์ชันทันที
    }
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (password.length < 6) {
        showAlert('ผิดพลาด', 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร');
        return;
    }

    if (password !== confirmPassword) {
        showAlert('ผิดพลาด', 'รหัสผ่านไม่ตรงกัน');
        return;
    }

    // --- ส่วนที่แก้ไข: ดึงค่า Role จาก Dropdown (ถ้ามี) ถ้าไม่มีให้เป็น 'user' ---
    const roleDropdown = document.getElementById('reg-role');
    const userRole = roleDropdown ? roleDropdown.value : 'user';

    const formData = {
        username: document.getElementById('reg-username').value.trim(),
        password: password,
        fullName: document.getElementById('reg-name').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        position: document.getElementById('reg-position').value,
        department: document.getElementById('reg-department').value,
        role: userRole // เปลี่ยนจากการฟิกซ์ 'user' เป็นค่าที่เลือกจาก Dropdown
    };

    toggleLoader('register-submit-button', true);

    apiCall('POST', 'registerUser', formData)
        .then(async result => {
            if (result.status === 'success') {
                showAlert('สำเร็จ', 'ลงทะเบียนเรียบร้อยแล้ว');
                document.getElementById('register-modal').style.display = 'none';
                document.getElementById('register-form').reset();
                
                // --- ส่วนที่เพิ่ม: ถ้า Admin เป็นคนเพิ่มผู้ใช้ ให้รีเฟรชตารางผู้ใช้ทันที ---
                const adminUsersPage = document.getElementById('admin-users-page');
                if (adminUsersPage && !adminUsersPage.classList.contains('hidden')) {
                    if (typeof fetchAllUsers === 'function') {
                        fetchAllUsers();
                    }
                }
            } else {
                showAlert('ผิดพลาด', result.message);
            }
        })
        .catch(error => {
            showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลงทะเบียน: ' + error.message);
        })
        .finally(() => {
            toggleLoader('register-submit-button', false);
        });
}

function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-password-email').value;
    if (!email) { showAlert('ผิดพลาด', 'กรุณากรอกอีเมล'); return; }

    toggleLoader('forgot-password-submit-button', true);

    apiCall('POST', 'forgotPassword', { email: email })
        .then(result => {
            if (result.status === 'success') {
                showAlert('สำเร็จ', 'ระบบได้ส่งรหัสผ่านใหม่ไปยังอีเมลของท่านแล้ว');
                document.getElementById('forgot-password-modal').style.display = 'none';
                document.getElementById('forgot-password-form').reset();
            } else {
                showAlert('ผิดพลาด', result.message);
            }
        })
        .catch(error => { showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message); })
        .finally(() => { toggleLoader('forgot-password-submit-button', false); });
}

function togglePasswordVisibility() {
    const showPassword = document.getElementById('show-password-toggle').checked;
    const currentPassword = document.getElementById('current-password');
    const newPassword = document.getElementById('new-password');
    
    if (currentPassword) currentPassword.type = showPassword ? 'text' : 'password';
    if (newPassword) newPassword.type = showPassword ? 'text' : 'password';
}
// [เพิ่มท้ายไฟล์ หรือในส่วน Utility]
function closeAnnouncement() {
    const modal = document.getElementById('announcement-modal');
    if (modal) modal.style.display = 'none';
}

// --- ในไฟล์ js/auth.js ---

async function checkAndShowAnnouncement() {
    if (typeof db === 'undefined') return;

    try {
        const doc = await db.collection('settings').doc('announcement').get();
        if (doc.exists) {
            const data = doc.data();
            
            if (data.isActive) {
                document.getElementById('announcement-title').textContent = data.title || 'ประกาศ';
                document.getElementById('announcement-message').textContent = data.message || '';
                
                const img = document.getElementById('announcement-image');
                if (data.imageUrl) {
                    // ★★★ แก้ไขตรงนี้: แปลงลิงก์ก่อนแสดงผล ★★★
                    let displayUrl = data.imageUrl;
                    if (displayUrl.includes('drive.google.com') && displayUrl.includes('/d/')) {
                        const fileId = displayUrl.split('/d/')[1].split('/')[0];
                        displayUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
                    }
                    
                    img.src = displayUrl;
                    img.classList.remove('hidden');
                } else {
                    img.classList.add('hidden');
                }
                
                document.getElementById('announcement-modal').style.display = 'flex';
            }
        }
    } catch (e) {
        console.warn("Announcement Error:", e);
    }
}
// ฟังก์ชันช่วยปรับรหัสผ่านให้ครบ 6 ตัว (สำหรับ Firebase เท่านั้น)
function adjustPasswordForFirebase(password) {
    if (!password) return "";
    // ถ้ารหัสสั้นกว่า 6 ตัว ให้เติม "0" ต่อท้ายจนครบ 6 หรือมากกว่า
    // เช่น "1234" -> "123400"
    // เช่น "1" -> "100000"
    if (password.length < 6) {
        return password + "000000".slice(0, 6 - password.length);
    }
    return password;
}
