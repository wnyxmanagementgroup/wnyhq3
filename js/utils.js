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
        'เสร็จสิ้นรับไฟลืไปใช้งาน(กรณีไม่เบิก)/ ติดต่อรับเอกสารที่ห้องบุคคล(กรณีเบิกค่าใช้จ่าย)': 'text-green-600 font-semibold',
        'เสร็จสิ้น': 'text-green-600 font-semibold',
        'Approved': 'text-green-600 font-semibold',
        'เสร็จสิ้นรอตรวจสอบเอกสารดำเนินการออกคำสั่งไปราชการ': 'text-blue-600',
        'กำลังดำเนินการ': 'text-yellow-600',
        'Pending': 'text-yellow-600',
        'Submitted': 'text-blue-600',
        'รอเอกสาร (เบิก)': 'text-orange-600',
        'นำกลับไปแก้ไข': 'text-red-600',
        'รอตรวจสอบเอกสารและออกคำสั่งไปราชการ': 'text-purple-600'
    };
    return statusColors[status] || 'text-gray-600';
}
// --- SHARED PDF FUNCTIONS (ย้ายมาจาก admin.js) ---

// ฟังก์ชันช่วยอัปโหลดไฟล์ Blob ลง Firebase Storage
async function uploadBlobToStorage(blob, path) {
    return new Promise((resolve, reject) => {
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(path);
        const uploadTask = fileRef.put(blob);

        uploadTask.on('state_changed', 
            (snapshot) => { /* Progress */ }, 
            (error) => { reject(error); }, 
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    resolve(downloadURL);
                });
            }
        );
    });
}

// ฟังก์ชันสร้าง PDF ผ่าน Cloud Run (ฉบับกลาง ใช้ได้ทั้ง Command, Dispatch, Memo)
async function generateOfficialPDF(requestData, returnBlob = false) {
    let btnId = 'generate-document-button';
    if (requestData.btnId) btnId = requestData.btnId;
    
    toggleLoader(btnId, true); 

    try {
        const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const docDateObj = requestData.docDate ? new Date(requestData.docDate) : new Date();
        const docMMMM = thaiMonths[docDateObj.getMonth()];
        const docYYYY = (docDateObj.getFullYear() + 543).toString();
        const docDay = docDateObj.getDate().toString();

        let dateRangeStr = "";
        let startDay = "", startMonth = "", startYear = "";
        if (requestData.startDate) {
            const start = new Date(requestData.startDate);
            startDay = start.getDate();
            startMonth = thaiMonths[start.getMonth()];
            startYear = start.getFullYear() + 543;
            
            if (requestData.endDate) {
                const end = new Date(requestData.endDate);
                const endDay = end.getDate();
                const endMonth = thaiMonths[end.getMonth()];
                const year = start.getFullYear() + 543;

                if (requestData.startDate === requestData.endDate) {
                    dateRangeStr = `ในวันที่ ${startDay} เดือน ${startMonth} พ.ศ. ${year}`;
                } else if (start.getMonth() === end.getMonth()) {
                    dateRangeStr = `ระหว่างวันที่ ${startDay} - ${endDay} เดือน ${startMonth} พ.ศ. ${year}`;
                } else {
                    dateRangeStr = `ระหว่างวันที่ ${startDay} เดือน ${startMonth} ถึงวันที่ ${endDay} เดือน ${endMonth} พ.ศ. ${year}`;
                }
            }
        }

        const attendeesWithIndex = (requestData.attendees || []).map((att, index) => ({
            i: index + 1,
            name: att.name || "",
            position: att.position || ""
        }));

        // เลือก Template
        let templateFilename = '';
        if (requestData.doctype === 'command') {
            switch (requestData.templateType) {
                case 'groupSmall': templateFilename = 'template_command_small.docx'; break;
                case 'groupLarge': templateFilename = 'template_command_large.docx'; break;
                default: templateFilename = 'template_command_solo.docx'; break;
            }
        } else if (requestData.doctype === 'dispatch') {
            templateFilename = 'template_dispatch.docx';
        } else if (requestData.doctype === 'memo') {
            // ★ เพิ่มรองรับบันทึกข้อความ (ต้องมีไฟล์นี้ใน Server)
            templateFilename = 'template_memo.docx'; 
        }

        const response = await fetch(`./${templateFilename}`);
        if (!response.ok) throw new Error(`ไม่พบไฟล์แม่แบบ "${templateFilename}"`);
        const content = await response.arrayBuffer();

        const zip = new PizZip(content);
        const doc = new window.docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            parser: function(tag) {
                const cleanTag = tag.trim().replace(/^\s+|\s+$/g, '');
                return {
                    get: function(scope, context) {
                        if (cleanTag === '.') return scope;
                        return scope[cleanTag];
                    }
                };
            }
        });

        const dataToRender = {
            dd: docDay, MMMM: docMMMM, YYYY: docYYYY,
            id: requestData.id || ".......",
            purpose: requestData.purpose || "",
            location: requestData.location || "",
            date_range: dateRangeStr,
            start_day: startDay, start_month: startMonth, start_year: startYear,
            requesterName: requestData.requesterName || "",
            requesterPosition: requestData.requesterPosition || "",
            attendees: attendeesWithIndex,
            vehicle_txt: requestData.vehicleOption === 'private' ? `รถส่วนตัว ทะเบียน ${requestData.licensePlate||'-'}` : (requestData.vehicleOption === 'public' ? 'รถโดยสารสาธารณะ' : 'รถราชการ'),
            
            // ข้อมูลสำหรับบันทึกข้อความ (Memo)
            department: requestData.department || "",
            headName: requestData.headName || "",
            totalExpense: requestData.totalExpense || "",
            
            dispatch_month: requestData.dispatchMonth || "",
            dispatch_year: requestData.dispatchYear || "",
            command_count: requestData.commandCount || "",
            memo_count: requestData.memoCount || ""
        };

        doc.render(dataToRender);

        const docxBlob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        const formData = new FormData();
        formData.append("files", docxBlob, "document.docx");

        const cloudRunBaseUrl = (typeof PDF_ENGINE_CONFIG !== 'undefined') ? PDF_ENGINE_CONFIG.BASE_URL : "https://pdf-engine-660310608742.asia-southeast1.run.app";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); 

        const cloudRunResponse = await fetch(`${cloudRunBaseUrl}/forms/libreoffice/convert`, {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!cloudRunResponse.ok) throw new Error(`Server Error (${cloudRunResponse.status})`);

        const pdfBlob = await cloudRunResponse.blob();

        if (returnBlob) return pdfBlob;

        const pdfUrl = window.URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');

    } catch (error) {
        console.error("PDF Generation Error:", error);
        if (error.properties && error.properties.errors) {
             const msgs = error.properties.errors.map(e => `- ${e.message}`).join('\n');
             alert(`❌ Template Error:\n${msgs}`);
        } else {
             alert(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
        throw error;
    } finally {
        toggleLoader(btnId, false);
    }
}
