// --- API HELPER FUNCTIONS ---
// --- API HELPER FUNCTIONS (Enhanced Stability) ---

async function apiCall(method, action, payload = {}, retries = 2) {
    let url = SCRIPT_URL;
    const TIMEOUT_MS = 30000; // 30 วินาที (ถ้าเกินนี้ให้ตัด)

    // ตั้งค่า Headers
    const options = {
        method: method,
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    };

    // จัดการ Parameter
    if (method === 'GET') {
        const params = new URLSearchParams({ action, ...payload, cacheBust: new Date().getTime() }); 
        url += `?${params}`;
    } else {
        options.body = JSON.stringify({ action, payload });
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
    if (!button) {
        // console.warn(`Button with id '${buttonId}' not found`);
        return;
    }
    
    const loader = button.querySelector('.loader');
    const text = button.querySelector('span');
    
    if (show) {
        if (loader) loader.classList.remove('hidden');
        if (text) text.classList.add('hidden');
        button.disabled = true;
    } else {
        if (loader) loader.classList.add('hidden');
        if (text) text.classList.remove('hidden');
        button.disabled = false;
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
            const data = reader.result.toString().split(',')[1];
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
        const base64String = reader.result.split(',')[1]; 
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

function clearRequestsCache() {
    allRequestsCache = [];
    allMemosCache = [];
    userMemosCache = [];
}

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
    };
    return statusColors[status] || 'text-gray-600';
}

