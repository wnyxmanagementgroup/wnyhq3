// --- AUTH FUNCTIONS (HYBRID SYSTEM) ---

// --- แก้ไขในไฟล์ js/auth.js ---

// --- นำไปแทนที่ฟังก์ชัน handleLogin เดิมในไฟล์ js/auth.js ---

async function handleLogin(e) {
    e.preventDefault();
    
    const usernameInput = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value; // รหัสผ่านจริงที่ user พิมพ์

    if (!usernameInput || !password) {
        showAlert('ผิดพลาด', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    toggleLoader('login-button', true);
    document.getElementById('login-error').classList.add('hidden');
    
    try {
        console.log('Attempting login for:', usernameInput);
        
        // แปลง Username เป็น Email
        const email = `${usernameInput}@wny.app`; 
        
        // ★★★ แปลงรหัสผ่านสำหรับ Firebase (ถ้าสั้นกว่า 6 ตัว ให้เติม 0) ★★★
        const firebasePassword = adjustPasswordForFirebase(password);
        
        let firebaseUser = null;
        let userData = null;

        // -----------------------------------------------------
        // 1. ลอง Login ผ่าน Firebase Auth (ใช้รหัสที่ปรับแล้ว)
        // -----------------------------------------------------
        try {
            if (typeof firebase !== 'undefined') {
                // ใช้ firebasePassword ในการล็อกอิน
                const userCredential = await firebase.auth().signInWithEmailAndPassword(email, firebasePassword);
                firebaseUser = userCredential.user;
                console.log("⚡ Logged in via Firebase (Fast)");
            }
        } catch (firebaseError) {
            // ถ้า User Not Found หรือรหัสผิด (ใน Firebase) ให้ข้ามไปเช็คกับ GAS
            if (firebaseError.code !== 'auth/user-not-found' && firebaseError.code !== 'auth/wrong-password') {
                console.warn("Firebase Login Warning:", firebaseError.message);
            }
        }

        // -----------------------------------------------------
        // 2. ถ้าไม่เจอใน Firebase -> ไปเช็คกับระบบเก่า (GAS)
        // -----------------------------------------------------
        if (!firebaseUser) {
            console.log("🐌 User not found in Firebase, verifying with GAS...");
            
            // ★ ส่งรหัสผ่าน "ต้นฉบับ" (password) ไปเช็คกับ Google Sheet
            const result = await apiCall('POST', 'verifyCredentials', { 
                username: usernameInput, 
                password: password 
            });

            if (result.status === 'success') {
                userData = result.user;

                // Lazy Migration: สร้างบัญชี Firebase ทันที
                if (typeof firebase !== 'undefined') {
                    try {
                        console.log("🚀 Migrating user to Firebase Auth...");
                        
                        // ★ สร้างบัญชีใหม่ด้วยรหัสที่ปรับแล้ว (firebasePassword)
                        const newUserCred = await firebase.auth().createUserWithEmailAndPassword(email, firebasePassword);
                        firebaseUser = newUserCred.user;

                        // บันทึกข้อมูล Profile ลง Firestore
                        await firebase.firestore().collection('users').doc(firebaseUser.uid).set({
                            username: usernameInput,
                            fullName: userData.fullName || usernameInput,
                            position: userData.position || 'User',
                            role: userData.role || 'user',
                            department: userData.department || '',
                            email: userData.email || '',
                            migratedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });

                    } catch (migrationError) {
                        console.error("Migration Failed:", migrationError);
                        // ถ้าสร้างไม่สำเร็จ (เช่น Email ซ้ำในระบบแต่ Password ผิด) ก็ปล่อยผ่านให้ใช้ Session GAS ไปก่อน
                    }
                }
            } else {
                throw new Error(result.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }
        }

        // -----------------------------------------------------
        // 3. Login สำเร็จ (ไม่ว่าจะทางไหน) -> เข้าสู่ระบบ
        // -----------------------------------------------------
        if (firebaseUser || userData) {
            let finalUserObj = userData;

            if (!finalUserObj && firebaseUser) {
                // ดึงข้อมูลล่าสุดจาก Firestore (กรณี Login ผ่าน Firebase)
                const doc = await firebase.firestore().collection('users').doc(firebaseUser.uid).get();
                if (doc.exists) {
                    finalUserObj = doc.data();
                } else {
                    finalUserObj = { username: usernameInput, role: 'user' }; 
                }
            }

            sessionStorage.setItem('currentUser', JSON.stringify(finalUserObj));
            window.currentUser = finalUserObj;
            
            initializeUserSession(finalUserObj);
            showMainApp();

            // เรียกประกาศให้เด้งขึ้นมาทันที
            checkAndShowAnnouncement();

            // เปลี่ยนหน้าไป Dashboard
            await switchPage('dashboard-page');
        }

    } catch (error) {
        console.error('Login error:', error);
        document.getElementById('login-error').textContent = error.message || 'เกิดข้อผิดพลาด';
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
function initializeUserSession(user) {
    // 1. สลับหน้าจอ
    const loginScreen = document.getElementById('login-screen');
    const mainApp = document.getElementById('main-app');
    if (loginScreen) loginScreen.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');
    
    // 2. แสดงชื่อผู้ใช้ (แก้ไข ID ให้ตรงกับ HTML)
    const nameEl = document.getElementById('user-fullname');
    if (nameEl) nameEl.textContent = user.fullName || user.username;

    const posEl = document.getElementById('user-position');
    if (posEl) posEl.textContent = user.position || (user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งานทั่วไป');
    
    // 3. จัดการเมนู Admin (แก้ไขให้เรียก ID ที่ถูกต้องใน HTML)
    const adminBtnCommand = document.getElementById('admin-nav-command');
    const adminBtnUsers = document.getElementById('admin-nav-users');
    const adminActions = document.getElementById('admin-actions'); // ปุ่ม Sync

    const isAdmin = String(user.role).toLowerCase() === 'admin';

    if (isAdmin) {
        if (adminBtnCommand) adminBtnCommand.classList.remove('hidden');
        if (adminBtnUsers) adminBtnUsers.classList.remove('hidden');
        if (adminActions) adminActions.classList.remove('hidden');
    } else {
        if (adminBtnCommand) adminBtnCommand.classList.add('hidden');
        if (adminBtnUsers) adminBtnUsers.classList.add('hidden');
        if (adminActions) adminActions.classList.add('hidden');
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
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (password !== confirmPassword) {
        showAlert('ผิดพลาด', 'รหัสผ่านไม่ตรงกัน');
        return;
    }

    const formData = {
        username: document.getElementById('reg-username').value.trim(),
        password: password,
        fullName: document.getElementById('reg-name').value.trim(),
        email: document.getElementById('reg-email').value.trim(),
        position: document.getElementById('reg-position').value,
        department: document.getElementById('reg-department').value,
        role: 'user'
    };

    toggleLoader('register-submit-button', true);

    apiCall('POST', 'registerUser', formData)
        .then(async result => {
            if (result.status === 'success') {
                showAlert('สำเร็จ', 'ลงทะเบียนเรียบร้อยแล้ว กรุณาเข้าสู่ระบบ');
                document.getElementById('register-modal').style.display = 'none';
                document.getElementById('register-form').reset();
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