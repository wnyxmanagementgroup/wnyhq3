// --- API HELPER FUNCTIONS ---
async function apiCall(method, action, payload = {}) {
    let url = SCRIPT_URL;
    const options = {
        method: method,
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', },
    };

    if (method === 'GET') {
        const params = new URLSearchParams({ action, ...payload, cacheBust: new Date().getTime() }); 
        url += `?${params}`;
    } else {
        options.body = JSON.stringify({ action, payload });
    }

    try {
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (result.status === 'error') throw new Error(result.message);
        return result;
    } catch (error) {
        console.error('API Call Error:', error);
        
        if (error.message.includes('Failed to fetch')) {
            showAlert('การเชื่อมต่อล้มเหลว', 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
        } else {
            showAlert('เกิดข้อผิดพลาด', `Server error: ${error.message}`);
        }
        throw error;
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
        console.error(`Button with id '${buttonId}' not found`);
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

// ฟังก์ชันช่วยเหลือสำหรับสีสถานะ
function getStatusColor(status) {
    const statusColors = {
        'เสร็จสิ้น/รับไฟล์ไปใช้งาน': 'text-green-600 font-semibold',
        'เสร็จสิ้น': 'text-green-600 font-semibold',
        'Approved': 'text-green-600 font-semibold',
        'เสร็จสิ้นรอออกคำสั่งไปราชการ': 'text-blue-600',
        'กำลังดำเนินการ': 'text-yellow-600',
        'Pending': 'text-yellow-600',
        'Submitted': 'text-blue-600',
        'รอเอกสาร (เบิก)': 'text-orange-600',
        'นำกลับไปแก้ไข': 'text-red-600',
        'รอตรวจสอบและออกคำสั่งไปราชการ': 'text-purple-600'
    };
    return statusColors[status] || 'text-gray-600';
}