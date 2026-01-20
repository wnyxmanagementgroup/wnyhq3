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

// --- แก้ไขใน js/admin.js ---

async function fetchAllRequestsForCommand() {
    try {
        if (!checkAdminAccess()) return;
        
        // 1. ตรวจสอบปีที่เลือก
        const yearSelect = document.getElementById('admin-year-select');
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : (new Date().getFullYear() + 543);
        const currentYear = new Date().getFullYear() + 543;
        
        const isHistoryMode = selectedYear !== currentYear;

        // แสดง Loader (อาจต้องสร้าง loader element หรือใช้ toggleLoader ถ้ามีปุ่ม)
        const listContainer = document.getElementById('admin-requests-list');
        listContainer.innerHTML = '<div class="text-center p-8"><div class="loader mx-auto"></div><p class="mt-4">กำลังโหลดข้อมูล...</p></div>';

        let requests = [];

        if (isHistoryMode) {
            console.log(`👮‍♂️ Admin: Fetching HISTORY data for ${selectedYear} from GAS...`);
            
            // ★ ยิงตรงไป GAS (ดึงทั้งหมดของปีนั้น)
            const result = await apiCall('GET', 'getRequestsByYear', { 
                year: selectedYear,
                username: 'ADMIN_ALL' // ส่ง flag บอกว่าขอทั้งหมด
            });
            
            if (result.status === 'success') requests = result.data || [];

        } else {
            // ★ โหมดปกติ (ปีปัจจุบัน)
            const result = await apiCall('GET', 'getAllRequests');
            if (result.status === 'success') requests = result.data || [];
        }

        // 2. เรียงลำดับ
        requests.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.docDate || 0).getTime();
            const timeB = new Date(b.timestamp || b.docDate || 0).getTime();
            return timeB - timeA;
        });

        // 3. แสดงผล
        renderAdminRequestsList(requests);
        
        // ถ้าเป็นโหมดประวัติ อาจแจ้งเตือนเล็กน้อยว่า "กำลังดูข้อมูลเก่า"
        if (isHistoryMode) {
            // (Optional) อาจเปลี่ยนสี Border หรือใส่ข้อความแจ้งเตือน
        }

    } catch (error) { 
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้'); 
    }
}

async function fetchAllMemos() {
    try {
        if (!checkAdminAccess()) return;
        const result = await apiCall('GET', 'getAllMemos');
        if (result.status === 'success') {
            let memos = result.data || [];
            
            // เรียงลำดับ: ล่าสุดก่อน
            memos.sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });

            renderAdminMemosList(memos);
        }
    } catch (error) { 
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลบันทึกข้อความได้'); 
    }
}

async function fetchAllUsers() {
    try {
        if (!checkAdminAccess()) return;
        const result = await apiCall('GET', 'getAllUsers');
        if (result.status === 'success') { 
            allUsersCache = result.data; 
            renderUsersList(allUsersCache); 
        }
    } catch (error) { showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้'); }
}

// --- HELPER FUNCTIONS ---

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

// --- GENERATE COMMAND FUNCTIONS (ระบบ Hybrid Failover) ---

// 1. ฟังก์ชันสร้างคำสั่ง (Command)
async function handleAdminGenerateCommand() {
    const requestId = document.getElementById('admin-command-request-id').value;
    const commandType = document.querySelector('input[name="admin-command-type"]:checked')?.value;
    
    if (!commandType) { showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); return; }
    
    // เตรียมข้อมูล
    const attendees = [];
    document.querySelectorAll('#admin-command-attendees-list > div').forEach(div => {
        const name = div.querySelector('.admin-att-name').value.trim();
        const pos = div.querySelector('.admin-att-pos').value.trim();
        if (name) attendees.push({ name, position: pos });
    });
    
    const requestData = {
        doctype: 'command',
        templateType: commandType,
        id: requestId, 
        docDate: document.getElementById('admin-command-doc-date').value,
        requesterName: document.getElementById('admin-command-requester-name').value.trim(), 
        requesterPosition: document.getElementById('admin-command-requester-position').value.trim(),
        location: document.getElementById('admin-command-location').value.trim(), 
        purpose: document.getElementById('admin-command-purpose').value.trim(),
        startDate: document.getElementById('admin-command-start-date').value, 
        endDate: document.getElementById('admin-command-end-date').value,
        attendees: attendees,
        // ... ข้อมูลอื่นๆ
        expenseOption: document.getElementById('admin-expense-option').value,
        expenseItems: document.getElementById('admin-expense-items').value, 
        totalExpense: document.getElementById('admin-total-expense').value,
        vehicleOption: document.getElementById('admin-vehicle-option').value, 
        licensePlate: document.getElementById('admin-license-plate').value
    };
    
    toggleLoader('admin-generate-command-button', true);
    
    try {
        // 1. เรียกสร้าง PDF (ตอนนี้จะ return Blob กลับมา ไม่เปิดอัตโนมัติ)
        const pdfBlob = await generateOfficialPDF(requestData, true); // true = ขอ Blob คืน
        
        // 2. ตั้งชื่อไฟล์ให้สื่อความหมาย
        const safeId = requestId.replace(/[\/\\:\.]/g, '-'); // แปลง / เป็น -
        const fileName = `คำสั่ง_${safeId}.pdf`;
        
        // 3. อัปโหลดลง Firebase Storage
        console.log("⬆️ กำลังอัปโหลดไฟล์ลง Storage...");
        const storagePath = `commands/${safeId}/${fileName}`;
        const downloadUrl = await uploadBlobToStorage(pdfBlob, storagePath);
        
        console.log("✅ อัปโหลดเสร็จสิ้น: ", downloadUrl);

        // 4. อัปเดตข้อมูลลง Firestore (บันทึกลิงก์ถาวร)
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                commandStatus: 'เสร็จสิ้น',
                commandPdfUrl: downloadUrl, // ลิงก์ไฟล์ PDF
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        // 5. แสดงผลลัพธ์และปุ่มใหม่
        showAlert('สำเร็จ', 'สร้างและบันทึกคำสั่งเรียบร้อยแล้ว');
        
        // เปิดไฟล์ทันที
        window.open(downloadUrl, '_blank');
        
        // อัปเดตหน้าจอ Result ให้มีปุ่ม
        showDualLinkResult(
            'admin-command-result', 
            'บันทึกคำสั่งเรียบร้อยแล้ว', 
            null, // ถ้ามี Doc URL ให้ใส่ตรงนี้
            downloadUrl // PDF URL ใหม่
        );
        
        // รีโหลดรายการเพื่ออัปเดตปุ่มในหน้า Dashboard
        await fetchAllRequestsForCommand();

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
    } finally {
        toggleLoader('admin-generate-command-button', false);
    }
}
// 2. ฟังก์ชันสร้างหนังสือส่ง (Dispatch)
async function handleDispatchFormSubmit(e) {
    e.preventDefault();
    const requestId = document.getElementById('dispatch-request-id').value;
    
    const requestData = {
        doctype: 'dispatch',
        id: requestId, 
        dispatchMonth: document.getElementById('dispatch-month').value, 
        dispatchYear: document.getElementById('dispatch-year').value, 
        commandCount: document.getElementById('command-count').value, 
        memoCount: document.getElementById('memo-count').value 
    };
    
    toggleLoader('dispatch-submit-button', true);
    
    // ★★★ ระบบ Hybrid Failover ★★★
    try {
        console.log("🚀 Attempt 1: Trying Cloud Run (Fast Mode)...");
        await generateOfficialPDF(requestData);
        
        // ปิด Modal ถ้าสำเร็จ
        document.getElementById('dispatch-modal').style.display = 'none';
        document.getElementById('dispatch-form').reset();

    } catch (cloudError) {
        console.warn("⚠️ Cloud Run failed. Switching to GAS System (Backup)...", cloudError);
        
        try {
            console.log("🔄 Attempt 2: Trying GAS (Reliable Mode)...");
            const result = await generateDispatchHybrid(requestData);
            
            if (result.status === 'success') {
                document.getElementById('dispatch-modal').style.display = 'none';
                document.getElementById('dispatch-form').reset();
                showAlert('สำเร็จ', 'สร้างหนังสือส่งเรียบร้อยแล้ว (ผ่านระบบสำรอง)');
                await fetchAllRequestsForCommand();
            }
        } catch (gasError) {
            showAlert('ผิดพลาด', 'ไม่สามารถสร้างหนังสือส่งได้: ' + gasError.message);
        }
    } finally {
        toggleLoader('dispatch-submit-button', false);
    }
}

        // ==========================================
// ★★★ ฟังก์ชันสร้าง PDF ผ่าน Cloud Run (Core Engine) ★★★
// ==========================================
async function generateOfficialPDF(requestData, returnBlob = false) {
    // กำหนดปุ่มที่จะแสดง Loader
    let btnId = 'generate-document-button'; 
    if (requestData.doctype === 'dispatch') btnId = 'dispatch-submit-button';
    if (requestData.doctype === 'command') btnId = 'admin-generate-command-button';
    
    toggleLoader(btnId, true); 

    try {
        // --- ส่วนที่ 1: เตรียมข้อมูล (Data Preparation) ---
        const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const docDateObj = requestData.docDate ? new Date(requestData.docDate) : new Date();
        const docMMMM = thaiMonths[docDateObj.getMonth()];
        const docYYYY = (docDateObj.getFullYear() + 543).toString();
        const docDay = docDateObj.getDate().toString();

        // คำนวณช่วงวันที่
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

        // เตรียมรายชื่อ
        const attendeesWithIndex = (requestData.attendees || []).map((att, index) => ({
            i: index + 1,
            name: att.name || "",
            position: att.position || ""
        }));
        
        // เตรียมข้อความยานพาหนะ
        const vehicleText = requestData.vehicleOption === 'gov' ? 'รถราชการ' : 
                            requestData.vehicleOption === 'private' ? ('รถส่วนตัว ' + (requestData.licensePlate||'')) : 'อื่นๆ';

        // --- ส่วนที่ 2: โหลด Template ---
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
            templateFilename = 'template_memo.docx'; 
        }

        const response = await fetch(`./${templateFilename}`);
        if (!response.ok) throw new Error(`ไม่พบไฟล์แม่แบบ "${templateFilename}"`);
        const content = await response.arrayBuffer();

        // --- ส่วนที่ 3: Render ข้อมูลลง Word ---
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

        // ข้อมูลที่จะส่งเข้า Word
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
            vehicle_txt: vehicleText,
            
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

        // --- ส่วนที่ 4: แปลงเป็น PDF ผ่าน Cloud Run ---
        const docxBlob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        const formData = new FormData();
        // ส่งชื่อไฟล์ภาษาอังกฤษชั่วคราวไปแปลง (กัน Error ฝั่ง Server)
        formData.append("files", docxBlob, "temp_doc.docx");

        const cloudRunBaseUrl = (typeof PDF_ENGINE_CONFIG !== 'undefined') ? PDF_ENGINE_CONFIG.BASE_URL : "https://pdf-engine-660310608742.asia-southeast1.run.app";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // 90 วินาที

        const cloudRunResponse = await fetch(`${cloudRunBaseUrl}/forms/libreoffice/convert`, {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!cloudRunResponse.ok) throw new Error(`Server Error (${cloudRunResponse.status})`);

        const pdfBlob = await cloudRunResponse.blob();

        // ★ ถ้าสั่งให้ return blob ให้ส่งกลับไปให้ฟังก์ชันแม่จัดการต่อ (เพื่ออัปโหลด)
        if (returnBlob) {
            return pdfBlob;
        }

        // ถ้าไม่สั่ง (แบบเก่า) ให้เปิดเลย
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
        // Throw ต่อเพื่อให้ฟังก์ชันแม่รู้ว่า Error
        throw error;
    } finally {
        toggleLoader(btnId, false);
    }
}
// --- RENDER FUNCTIONS (ส่วนแสดงผลคงเดิม) ---

function renderUsersList(users) {
    const container = document.getElementById('users-content');
    if (!users || users.length === 0) { 
        container.innerHTML = '<p class="text-center text-gray-500">ไม่พบข้อมูลผู้ใช้</p>'; 
        return; 
    }
    
    container.innerHTML = `
    <div class="overflow-x-auto">
        <table class="min-w-full bg-white responsive-table">
            <thead>
                <tr class="bg-gray-100">
                    <th class="px-4 py-2 text-left">ชื่อผู้ใช้</th>
                    <th class="px-4 py-2 text-left">ชื่อ-นามสกุล</th>
                    <th class="px-4 py-2 text-left">ตำแหน่ง</th>
                    <th class="px-4 py-2 text-left">กลุ่มสาระ/งาน</th>
                    <th class="px-4 py-2 text-left">บทบาท</th>
                    <th class="px-4 py-2 text-left">การจัดการ</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                <tr class="border-b">
                    <td class="px-4 py-2" data-label="ชื่อผู้ใช้">${escapeHtml(user.username)}</td>
                    <td class="px-4 py-2" data-label="ชื่อ-นามสกุล">${escapeHtml(user.fullName)}</td>
                    <td class="px-4 py-2" data-label="ตำแหน่ง">${escapeHtml(user.position)}</td>
                    <td class="px-4 py-2" data-label="กลุ่มสาระ">${escapeHtml(user.department)}</td>
                    <td class="px-4 py-2" data-label="บทบาท">${escapeHtml(user.role)}</td>
                    <td class="px-4 py-2" data-label="การจัดการ">
                        <button onclick="deleteUser('${escapeHtml(user.username)}')" class="btn btn-danger btn-sm">ลบ</button>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
}

function renderAdminRequestsList(requests) {
    const container = document.getElementById('admin-requests-list');
    
    // กรณีไม่มีข้อมูล
    if (!requests || requests.length === 0) { 
        container.innerHTML = `
            <div class="text-center py-10">
                <p class="text-gray-400 text-lg">ไม่พบคำขอไปราชการ</p>
                <p class="text-gray-300 text-sm">รายการคำขอใหม่จะปรากฏที่นี่</p>
            </div>`; 
        return; 
    }
    
    container.innerHTML = requests.map(request => {
        // คำนวณจำนวนคน
        const attendeeCount = request.attendeeCount || 0;
        const totalPeople = attendeeCount + 1;
        let peopleCategory = totalPeople === 1 ? "คำสั่งเดี่ยว" : (totalPeople <= 5 ? "คำสั่งกลุ่มเล็ก" : "คำสั่งกลุ่มใหญ่");
        
        // ป้องกัน XSS
        const safeId = escapeHtml(request.id);
        const safeName = escapeHtml(request.requesterName);
        const safePurpose = escapeHtml(request.purpose);
        const safeLocation = escapeHtml(request.location);
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;

        // --- ส่วนตรวจสอบสถานะปุ่ม (Logic ใหม่) ---
        let commandActionButtons = '';
        
        if (request.commandPdfUrl) {
            // ✅ กรณีมีไฟล์คำสั่งแล้ว: แสดงปุ่ม "ดูไฟล์" และ "แก้ไข"
            commandActionButtons = `
                <div class="flex flex-wrap gap-2 justify-end">
                    <a href="${request.commandPdfUrl}" target="_blank" class="btn bg-blue-600 hover:bg-blue-700 text-white btn-sm flex items-center gap-1 shadow-sm px-3">
                        📄 ดูคำสั่ง
                    </a>
                    <button onclick="openAdminGenerateCommand('${safeId}')" class="btn bg-yellow-500 hover:bg-yellow-600 text-white btn-sm flex items-center gap-1 shadow-sm px-3">
                        ✏️ แก้ไข/ออกใหม่
                    </button>
                </div>
            `;
        } else {
            // ⚠️ กรณียังไม่มีไฟล์: แสดงปุ่ม "ออกคำสั่ง" ปุ่มเดียว
            commandActionButtons = `
                <button onclick="openAdminGenerateCommand('${safeId}')" class="btn bg-green-500 hover:bg-green-600 text-white btn-sm shadow-sm w-full md:w-auto">
                    ✅ ออกคำสั่ง (${peopleCategory})
                </button>
            `;
        }

        // --- สร้าง HTML การ์ด ---
        return `
        <div class="border rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition duration-200 mb-4 border-l-4 ${request.commandPdfUrl ? 'border-l-green-500' : 'border-l-yellow-400'}">
            <div class="flex justify-between items-start flex-wrap gap-4">
                
                <div class="flex-1 min-w-[250px]">
                    <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-bold text-indigo-700 text-lg">${safeId}</h4>
                        <span class="text-xs px-2 py-0.5 rounded-full ${request.commandPdfUrl ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                            ${request.commandPdfUrl ? 'ออกคำสั่งแล้ว' : 'รอออกคำสั่ง'}
                        </span>
                    </div>
                    
                    <p class="text-gray-800 font-bold text-md mb-1">${safeName}</p>
                    <p class="text-gray-600 text-sm mb-2">${safePurpose}</p>
                    
                    <div class="flex items-center gap-4 text-sm text-gray-500 bg-gray-50 p-2 rounded-lg inline-block">
                        <div class="flex items-center gap-1">
                            <span>📍</span> ${safeLocation}
                        </div>
                        <div class="border-l pl-4 flex items-center gap-1">
                            <span>📅</span> ${safeDate}
                        </div>
                    </div>
                    
                    <p class="text-xs text-gray-400 mt-2">
                        ผู้ร่วมเดินทาง: ${attendeeCount} คน (รวม ${totalPeople} คน)
                    </p>
                </div>
                
                <div class="flex flex-col gap-2 items-end w-full md:w-auto">
                    ${request.pdfUrl ? 
                        `<a href="${request.pdfUrl}" target="_blank" class="text-xs text-indigo-500 hover:text-indigo-700 underline mb-2 flex items-center gap-1">
                            📎 ดูบันทึกข้อความต้นเรื่อง
                        </a>` : ''
                    }
                    
                    ${commandActionButtons}

                    <div class="w-full border-t my-1"></div>

                    ${!request.dispatchBookPdfUrl ? 
                        `<button onclick="openDispatchModal('${safeId}')" class="btn bg-purple-50 text-purple-700 hover:bg-purple-100 btn-sm w-full md:w-auto border border-purple-200">
                            📦 ออกหนังสือส่ง
                        </button>` : 
                        `<a href="${request.dispatchBookPdfUrl}" target="_blank" class="btn bg-purple-600 text-white btn-sm w-full md:w-auto">
                            📦 ดูหนังสือส่ง
                        </a>`
                    }
                    
                    <button onclick="openCommandApproval('${safeId}')" class="text-xs text-gray-300 hover:text-gray-500 mt-2 underline" title="อนุมัติโดยไม่สร้างไฟล์">
                        อนุมัติด่วน (Bypass)
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}
function renderAdminMemosList(memos) {
    const container = document.getElementById('admin-memos-list');
    if (!memos || memos.length === 0) { container.innerHTML = '<p class="text-center text-gray-500">ไม่พบบันทึกข้อความ</p>'; return; }
    
    container.innerHTML = memos.map(memo => {
        const hasCompletedFiles = memo.completedMemoUrl || memo.completedCommandUrl || memo.dispatchBookUrl;
        const safeId = escapeHtml(memo.id);
        const safeRef = escapeHtml(memo.refNumber);
        const safeUser = escapeHtml(memo.submittedBy);

        return `
        <div class="border rounded-lg p-4 bg-white">
            <div class="flex justify-between items-start flex-wrap gap-4">
                <div class="flex-1">
                    <h4 class="font-bold">${safeId}</h4>
                    <p class="text-sm text-gray-600">โดย: ${safeUser} | อ้างอิง: ${safeRef}</p>
                    <p class="text-sm">สถานะ: <span class="font-medium">${translateStatus(memo.status)}</span></p>
                    <div class="mt-2 text-xs text-gray-500">
                        ${memo.completedMemoUrl ? `<div>✓ บันทึกข้อความสมบูรณ์</div>` : ''}
                        ${memo.completedCommandUrl ? `<div>✓ คำสั่งสมบูรณ์</div>` : ''}
                        ${memo.dispatchBookUrl ? `<div>✓ หนังสือส่งสมบูรณ์</div>` : ''}
                    </div>
                </div>
                <div class="flex flex-col gap-2 w-full sm:w-auto">
                    ${memo.fileURL ? `<a href="${memo.fileURL}" target="_blank" class="btn btn-success btn-sm">ดูไฟล์ต้นทาง</a>` : ''}
                    ${memo.completedMemoUrl ? `<a href="${memo.completedMemoUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm">ดูบันทึกสมบูรณ์</a>` : ''}
                    ${memo.completedCommandUrl ? `<a href="${memo.completedCommandUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm">ดูคำสั่งสมบูรณ์</a>` : ''}
                    ${memo.dispatchBookUrl ? `<a href="${memo.dispatchBookUrl}" target="_blank" class="btn bg-purple-500 text-white btn-sm">ดูหนังสือส่ง</a>` : ''}
                    <button onclick="openAdminMemoAction('${safeId}')" class="btn bg-green-500 text-white btn-sm">${hasCompletedFiles ? 'จัดการไฟล์' : 'อัพโหลดไฟล์'}</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// --- USER MANAGEMENT ---

async function deleteUser(username) {
    if (await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ ${username}?`)) {
        try { 
            await apiCall('POST', 'deleteUser', { username }); 
            showAlert('สำเร็จ', 'ลบผู้ใช้สำเร็จ'); 
            await fetchAllUsers(); 
        } catch (error) { 
            showAlert('ผิดพลาด', error.message); 
        }
    }
}

function openAddUserModal() { 
    document.getElementById('register-modal').style.display = 'flex'; 
}

function downloadUserTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([['Username', 'Password', 'FullName', 'Position', 'Department', 'Role']]);
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'user_template.xlsx');
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
            await fetchAllUsers(); 
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

function openDispatchModal(requestId) {
    if (!checkAdminAccess()) return;
    document.getElementById('dispatch-request-id').value = requestId;
    document.getElementById('dispatch-year').value = new Date().getFullYear() + 543;
    document.getElementById('dispatch-modal').style.display = 'flex';
}

function openAdminMemoAction(memoId) {
    if (!checkAdminAccess()) return;
    document.getElementById('admin-memo-id').value = memoId;
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
    const completedMemoFile = document.getElementById('admin-completed-memo-file').files[0];
    const completedCommandFile = document.getElementById('admin-completed-command-file').files[0];
    const dispatchBookFile = document.getElementById('admin-dispatch-book-file').files[0];
    
    let completedMemoFileObject = null; 
    let completedCommandFileObject = null; 
    let dispatchBookFileObject = null;
    
    if (completedMemoFile) completedMemoFileObject = await fileToObject(completedMemoFile);
    if (completedCommandFile) completedCommandFileObject = await fileToObject(completedCommandFile);
    if (dispatchBookFile) dispatchBookFileObject = await fileToObject(dispatchBookFile);
    
    toggleLoader('admin-memo-submit-button', true);
    try {
        const result = await apiCall('POST', 'updateMemoStatus', { 
            id: memoId, 
            status: status, 
            completedMemoFile: completedMemoFileObject, 
            completedCommandFile: completedCommandFileObject, 
            dispatchBookFile: dispatchBookFileObject 
        });
        
        if (result.status === 'success') {
            if (status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') { 
                const memo = allMemosCache.find(m => m.id === memoId); 
                if (memo && memo.submittedBy) { 
                    await sendCompletionEmail(memo.refNumber, memo.submittedBy, status); 
                } 
            }
            showAlert('สำเร็จ', 'อัปเดตสถานะและไฟล์เรียบร้อยแล้ว'); 
            document.getElementById('admin-memo-action-modal').style.display = 'none'; 
            document.getElementById('admin-memo-action-form').reset(); 
            await fetchAllMemos();
        } else { 
            showAlert('ผิดพลาด', result.message); 
        }
    } catch (error) { 
        showAlert('ผิดพลาด', error.message); 
    } finally { 
        toggleLoader('admin-memo-submit-button', false); 
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
        
        // Reset UI
        document.getElementById('admin-command-result').classList.add('hidden');
        document.getElementById('admin-command-form').classList.remove('hidden');
        document.getElementById('admin-command-attendees-list').innerHTML = '';
        
        // Load Data
        const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId });
        
        if (result.status === 'success' && result.data) {
            let data = result.data;
            if (result.data.data) data = result.data.data; // Handle wrapper

            // Populate Form
            document.getElementById('admin-command-request-id').value = requestId;
            document.getElementById('admin-command-request-id-display').value = requestId;
            
            const toInputDate = (dateStr) => { 
                if(!dateStr) return ''; 
                const d = new Date(dateStr); 
                return !isNaN(d) ? d.toISOString().split('T')[0] : ''; 
            };
            
            document.getElementById('admin-command-doc-date').value = toInputDate(data.docDate);
            document.getElementById('admin-command-requester-name').value = data.requesterName || '';
            document.getElementById('admin-command-requester-position').value = data.requesterPosition || '';
            document.getElementById('admin-command-location').value = data.location || '';
            document.getElementById('admin-command-purpose').value = data.purpose || '';
            document.getElementById('admin-command-start-date').value = toInputDate(data.startDate);
            document.getElementById('admin-command-end-date').value = toInputDate(data.endDate);
            
            // Populate Attendees
            if (data.attendees && Array.isArray(data.attendees)) { 
                data.attendees.forEach(att => addAdminAttendeeField(att.name, att.position)); 
            } else if (typeof data.attendees === 'string') {
                try {
                    JSON.parse(data.attendees).forEach(att => addAdminAttendeeField(att.name, att.position));
                } catch(e) {}
            }
            
            // Hidden Fields & Info
            document.getElementById('admin-expense-option').value = data.expenseOption || 'no';
            document.getElementById('admin-expense-items').value = typeof data.expenseItems === 'object' ? JSON.stringify(data.expenseItems) : (data.expenseItems || '[]');
            document.getElementById('admin-total-expense').value = data.totalExpense || 0;
            document.getElementById('admin-vehicle-option').value = data.vehicleOption || 'gov';
            document.getElementById('admin-license-plate').value = data.licensePlate || '';
            
            const vehicleText = data.vehicleOption === 'gov' ? 'รถราชการ' : 
                              data.vehicleOption === 'private' ? ('รถส่วนตัว ' + (data.licensePlate||'')) : 'อื่นๆ';
            document.getElementById('admin-command-vehicle-info').textContent = `พาหนะ: ${vehicleText}`;
            
            // Switch View
            await switchPage('admin-generate-command-page');
            
            // Setup Add Button Logic
            const addBtn = document.getElementById('admin-add-attendee-btn');
            // Clone to remove old listeners
            const newBtn = addBtn.cloneNode(true); 
            addBtn.parentNode.replaceChild(newBtn, addBtn);
            newBtn.addEventListener('click', () => addAdminAttendeeField());
            
        } else { 
            showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้'); 
        }
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

// 1. ลบคำขอไปราชการ (Requests)
async function deleteRequestByAdmin(requestId) {
    if (!await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ที่จะลบคำขอเลขที่ ${requestId}?\n\nข้อมูลจะถูกลบถาวรทั้งจากเว็บไซต์และฐานข้อมูล`)) return;
    
    toggleLoader('admin-requests-list', true); // แสดง Loading ทับรายการ

    try {
        console.log(`🗑️ Deleting Request: ${requestId}`);

        // A. ลบจาก Firebase Firestore (เพื่อให้หายจากหน้าเว็บทันที)
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(requestId).delete();
            console.log("- Deleted from Firestore");
            
            // (Optional) ลบไฟล์ใน Storage ด้วยถ้าต้องการ
             try {
                 const storageRef = firebase.storage().ref();
                 // ลบโฟลเดอร์ commands/ID (ต้องลบทีละไฟล์ แต่อันนี้ละไว้ก่อน)
             } catch(e) {}
        }

        // B. ลบจาก Google Sheets (ฐานข้อมูลหลัก)
        const result = await apiCall('POST', 'deleteRequest', { id: requestId });
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว');
            await fetchAllRequestsForCommand(); // รีโหลดรายการ
        } else {
            throw new Error(result.message);
        }

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลบ: ' + error.message);
        await fetchAllRequestsForCommand(); // รีโหลดเพื่อความชัวร์
    }
}

// 2. ลบบันทึกข้อความ (Memos)
async function deleteMemoByAdmin(memoId) {
    if (!await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ที่จะลบบันทึกข้อความเลขที่ ${memoId}?`)) return;

    toggleLoader('admin-memos-list', true);

    try {
        console.log(`🗑️ Deleting Memo: ${memoId}`);

        // A. ลบจาก Firebase (ถ้ามีการเก็บ Memos แยก collection)
        if (typeof db !== 'undefined') {
            // เช็คก่อนว่าเก็บใน requests หรือ memos
            // ถ้าเก็บรวมใน requests ให้ลบ doc นั้น หรือถ้าแยก collection ก็ลบที่นั่น
            try {
                await db.collection('memos').doc(memoId).delete();
            } catch (e) { /* ถ้าไม่มี collection นี้ก็ข้าม */ }
            
             // ถ้า Memo เก็บรวมกับ Requests ก็ต้องลบที่ requests ด้วย
             try {
                await db.collection('requests').doc(memoId).delete();
             } catch (e) {}
        }

        // B. ลบจาก Google Sheets (Sheet: Memos)
        const result = await apiCall('POST', 'deleteMemo', { id: memoId });

        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบบันทึกข้อความเรียบร้อยแล้ว');
            await fetchAllMemos(); // รีโหลดรายการ
        } else {
            throw new Error(result.message);
        }

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถลบได้: ' + error.message);
        await fetchAllMemos();
    }
}
