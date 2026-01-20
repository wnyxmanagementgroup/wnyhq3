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

async function fetchAllRequestsForCommand() {
    try {
        if (!checkAdminAccess()) return;
        
        // 1. ตรวจสอบปีที่เลือก
        const yearSelect = document.getElementById('admin-year-select');
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : (new Date().getFullYear() + 543);
        const currentYear = new Date().getFullYear() + 543;
        
        const isHistoryMode = selectedYear !== currentYear;

        // แสดง Loader
        const listContainer = document.getElementById('admin-requests-list');
        listContainer.innerHTML = '<div class="text-center p-8"><div class="loader mx-auto"></div><p class="mt-4">กำลังโหลดข้อมูล...</p></div>';

        let requests = [];

        if (isHistoryMode) {
            console.log(`👮‍♂️ Admin: Fetching HISTORY data for ${selectedYear} from GAS...`);
            const result = await apiCall('GET', 'getRequestsByYear', { 
                year: selectedYear,
                username: 'ADMIN_ALL' 
            });
            if (result.status === 'success') requests = result.data || [];

        } else {
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

// --- GENERATE COMMAND FUNCTIONS ---

async function handleAdminGenerateCommand() {
    const requestId = document.getElementById('admin-command-request-id').value;
    const commandType = document.querySelector('input[name="admin-command-type"]:checked')?.value;
    
    if (!commandType) { showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); return; }
    
    // เตรียมข้อมูล (เหมือนเดิม)
    const attendees = [];
    document.querySelectorAll('#admin-command-attendees-list > div').forEach(div => {
        const name = div.querySelector('.admin-att-name').value.trim();
        const pos = div.querySelector('.admin-att-pos').value.trim();
        if (name) attendees.push({ name, position: pos });
    });
    
    const requestData = {
        doctype: 'command',
        templateType: commandType,
        requestId: requestId, id: requestId,
        docDate: document.getElementById('admin-command-doc-date').value,
        requesterName: document.getElementById('admin-command-requester-name').value.trim(), 
        requesterPosition: document.getElementById('admin-command-requester-position').value.trim(),
        location: document.getElementById('admin-command-location').value.trim(), 
        purpose: document.getElementById('admin-command-purpose').value.trim(),
        startDate: document.getElementById('admin-command-start-date').value, 
        endDate: document.getElementById('admin-command-end-date').value,
        attendees: attendees,
        expenseOption: document.getElementById('admin-expense-option').value,
        expenseItems: document.getElementById('admin-expense-items').value, 
        totalExpense: document.getElementById('admin-total-expense').value,
        vehicleOption: document.getElementById('admin-vehicle-option').value, 
        licensePlate: document.getElementById('admin-license-plate').value,
        createdby: getCurrentUser() ? getCurrentUser().username : 'admin'
    };
    
    toggleLoader('admin-generate-command-button', true);
    
    try {
        // 1. สร้างไฟล์ผ่าน Cloud Run (เร็ว)
        console.log("🚀 Generating PDF via Cloud Run...");
        const { pdfBlob, docxBlob } = await generateOfficialPDF(requestData);
        
        // ★★★ UX Improvement: เปิดไฟล์ให้ดูทันที! ไม่ต้องรออัปโหลด ★★★
        const tempPdfUrl = URL.createObjectURL(pdfBlob);
        window.open(tempPdfUrl, '_blank');
        
        // แจ้งเตือนผู้ใช้ว่ากำลังบันทึก (เปลี่ยนจาก Alert เป็น Toast หรือข้อความเล็กๆ ถ้ามี แต่ใช้ Alert ชั่วคราวได้)
        // หมายเหตุ: ไม่ใช้ showAlert ที่มี await เพื่อไม่ให้บล็อกการทำงาน
        const statusDiv = document.getElementById('admin-command-result');
        if(statusDiv) {
            statusDiv.innerHTML = `<div class="text-blue-600 font-bold animate-pulse">📄 เปิดเอกสารแล้ว... กำลังบันทึกลงระบบเบื้องหลัง กรุณาอย่าปิดหน้านี้...</div>`;
            statusDiv.classList.remove('hidden');
        }

        console.log("⏳ Background Process: Uploading to Drive...");

        // 2. ทำงานเบื้องหลัง: อัปโหลดลง Google Drive
        const pdfBase64 = await blobToBase64(pdfBlob);
        const docBase64 = await blobToBase64(docxBlob);
        
        // อัปโหลด PDF
        const pdfUpload = await apiCall('POST', 'uploadGeneratedFile', {
            data: pdfBase64,
            filename: `คำสั่ง_${requestId.replace(/\//g,'-')}.pdf`,
            mimeType: 'application/pdf',
            username: requestData.createdby
        });

        // อัปโหลด Word (Backup)
        const docUpload = await apiCall('POST', 'uploadGeneratedFile', {
            data: docBase64,
            filename: `คำสั่ง_${requestId.replace(/\//g,'-')}.docx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            username: requestData.createdby
        });

        if (pdfUpload.status !== 'success') throw new Error("Upload PDF failed");
        
        // ลิงก์ถาวรจาก Google Drive
        const permanentPdfUrl = pdfUpload.url; 
        const permanentDocUrl = docUpload.status === 'success' ? docUpload.url : null;

        // 3. ทำงานเบื้องหลัง: บันทึกข้อมูลลง Sheet
        requestData.preGeneratedPdfUrl = permanentPdfUrl;
        requestData.preGeneratedDocUrl = permanentDocUrl;
        
        await apiCall('POST', 'approveCommand', requestData);

        // 4. ทำงานเบื้องหลัง: บันทึกลิงก์ลง Firestore
        const safeId = requestId.replace(/[\/\\:\.]/g, '-');
        if (typeof db !== 'undefined') {
            try {
                await db.collection('requests').doc(safeId).set({
                    commandStatus: 'เสร็จสิ้น',
                    commandPdfUrl: permanentPdfUrl,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (e) {}
        }

        // เสร็จสิ้นทุกกระบวนการ
        console.log("✅ Background Process: Complete");
        showAlert('สำเร็จ', 'บันทึกข้อมูลลงระบบเรียบร้อยแล้ว');
        
        // อัปเดต UI ด้วยลิงก์ถาวร
        showDualLinkResult('admin-command-result', 'บันทึกคำสั่งเรียบร้อยแล้ว', permanentDocUrl, permanentPdfUrl);
        await fetchAllRequestsForCommand();

    } catch (error) {
        console.error(error);
        showAlert('แจ้งเตือน', 'เปิดเอกสารสำเร็จ แต่การบันทึกลงระบบขัดข้อง: ' + error.message);
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
        memoCount: document.getElementById('memo-count').value,
        createdby: getCurrentUser() ? getCurrentUser().username : 'admin'
    };
    
    toggleLoader('dispatch-submit-button', true);
    
    try {
        // 1. สร้างผ่าน Cloud Run
        console.log("🚀 Generating Dispatch via Cloud Run...");
        const { pdfBlob } = await generateOfficialPDF(requestData);
        
        // ★★★ UX Improvement: เปิดไฟล์ทันที ★★★
        const tempPdfUrl = URL.createObjectURL(pdfBlob);
        window.open(tempPdfUrl, '_blank');
        
        // แจ้งเตือนสถานะ
        const modalBody = document.querySelector('#dispatch-modal .modal-content'); // หรือจุดที่ต้องการแสดง
        if(modalBody) {
            // สร้าง element แจ้งเตือนชั่วคราว
            const msg = document.createElement('div');
            msg.id = 'dispatch-saving-msg';
            msg.className = 'text-center text-blue-600 font-bold mt-2 animate-pulse';
            msg.innerText = 'กำลังบันทึกไฟล์ลงระบบ...';
            modalBody.appendChild(msg);
        }

        // 2. Background Process: อัปโหลด
        console.log("⏳ Uploading to Drive...");
        const pdfBase64 = await blobToBase64(pdfBlob);
        
        const uploadResult = await apiCall('POST', 'uploadGeneratedFile', {
            data: pdfBase64,
            filename: `หนังสือส่ง_${requestId.replace(/\//g,'-')}.pdf`,
            mimeType: 'application/pdf',
            username: requestData.createdby
        });
        
        if (uploadResult.status !== 'success') throw new Error("Upload failed");
        const permanentPdfUrl = uploadResult.url;

        // 3. Background Process: บันทึก Sheet
        requestData.preGeneratedPdfUrl = permanentPdfUrl;
        await apiCall('POST', 'generateDispatchBook', requestData);

        // 4. Background Process: บันทึก Firestore
        const safeId = requestId.replace(/[\/\\:\.]/g, '-');
        if (typeof db !== 'undefined') {
             try {
                await db.collection('requests').doc(safeId).set({
                    dispatchBookPdfUrl: permanentPdfUrl
                }, { merge: true });
             } catch (e) {}
        }

        // เสร็จสิ้น
        const msg = document.getElementById('dispatch-saving-msg');
        if(msg) msg.remove();

        document.getElementById('dispatch-modal').style.display = 'none';
        document.getElementById('dispatch-form').reset();
        showAlert('สำเร็จ', 'บันทึกหนังสือส่งเรียบร้อยแล้ว');
        
        await fetchAllRequestsForCommand();

    } catch (error) {
        showAlert('แจ้งเตือน', 'เปิดไฟล์สำเร็จ แต่บันทึกไม่ผ่าน: ' + error.message);
    } finally {
        toggleLoader('dispatch-submit-button', false);
    }
}

// ==========================================
// ★★★ ฟังก์ชันสร้าง PDF ผ่าน Cloud Run (Core Engine) ★★★
// ==========================================
// ==========================================
// ★★★ ฟังก์ชันสร้าง PDF ผ่าน Cloud Run (Core Engine) ★★★
// ==========================================
async function generateOfficialPDF(requestData) {
    // กำหนดปุ่ม Loader
    let btnId = 'generate-document-button'; 
    if (requestData.doctype === 'dispatch') btnId = 'dispatch-submit-button';
    if (requestData.doctype === 'command') btnId = 'admin-generate-command-button';
    
    toggleLoader(btnId, true); 

    try {
        // --- 1. เตรียมข้อมูลสำหรับ Template ---
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

                // --- ★★★ ส่วนที่แก้ไข: ตัดคำว่า "เดือน" ออกตามรูปแบบที่ขอ ★★★ ---
                if (requestData.startDate === requestData.endDate) {
                    // กรณีวันเดียว: ในวันที่ 20 มกราคม พ.ศ. 2569
                    dateRangeStr = `ในวันที่ ${startDay} ${startMonth} พ.ศ. ${year}`;
                } else if (start.getMonth() === end.getMonth()) {
                    // กรณีเดือนเดียวกัน: ระหว่างวันที่ 20 - 25 มกราคม พ.ศ. 2569
                    dateRangeStr = `ระหว่างวันที่ ${startDay} - ${endDay} ${startMonth} พ.ศ. ${year}`;
                } else {
                    // กรณีคนละเดือน: ระหว่างวันที่ 30 มกราคม - 2 กุมภาพันธ์ พ.ศ. 2569
                    dateRangeStr = `ระหว่างวันที่ ${startDay} ${startMonth} - ${endDay} ${endMonth} พ.ศ. ${year}`;
                }
                // -------------------------------------------------------------
            }
        }

        // จัดการรายชื่อแนบ (ผู้ขออยู่คนแรกเสมอ)
        const requesterName = (requestData.requesterName || "").trim();
        const requesterPos = (requestData.requesterPosition || "").trim();
        
        let mergedAttendees = [];
        if (requesterName) {
            mergedAttendees.push({ name: requesterName, position: requesterPos });
        }
        if (requestData.attendees && Array.isArray(requestData.attendees)) {
            requestData.attendees.forEach(att => {
                const attName = (att.name || "").trim();
                if (attName && attName !== requesterName) {
                    mergedAttendees.push({ name: attName, position: att.position || "" });
                }
            });
        }
        const attendeesWithIndex = mergedAttendees.map((att, index) => ({
            i: index + 1,
            name: att.name,
            position: att.position
        }));
        
        // ตรวจสอบประเภทพาหนะ
        let vehicleText = 'อื่นๆ';
        
        if (requestData.vehicleOption === 'gov') {
            vehicleText = 'รถราชการ';
        } else if (requestData.vehicleOption === 'private') {
            vehicleText = `รถส่วนตัว ${requestData.licensePlate || ''}`.trim();
        } else {
            // กรณีเลือกอื่นๆ หรือไม่ระบุ -> ให้ใช้ข้อความที่พิมพ์มา (ถ้ามี) หรือใช้คำว่า "อื่นๆ"
            vehicleText = requestData.licensePlate ? requestData.licensePlate : 'อื่นๆ';
        }

        // --- 2. โหลดไฟล์ Template ---
        let templateFilename = '';
        if (requestData.doctype === 'command') {
            switch (requestData.templateType) {
                case 'groupSmall': templateFilename = 'template_command_small.docx'; break;
                case 'groupLarge': templateFilename = 'template_command_large.docx'; break;
                default: templateFilename = 'template_command_solo.docx'; break;
            }
        } else if (requestData.doctype === 'dispatch') {
            templateFilename = 'template_dispatch.docx';
        }

        const response = await fetch(`./${templateFilename}`);
        if (!response.ok) throw new Error(`ไม่พบไฟล์แม่แบบ "${templateFilename}"`);
        const content = await response.arrayBuffer();

        // --- 3. Render ข้อมูลลง Word ---
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
            date_range: dateRangeStr, // ใช้ตัวแปรที่เราแก้ Format แล้ว
            start_day: startDay, start_month: startMonth, start_year: startYear,
            requesterName: requestData.requesterName || "",
            requesterPosition: requestData.requesterPosition || "",
            attendees: attendeesWithIndex,
            vehicle_txt: vehicleText,
            dispatch_month: requestData.dispatchMonth || "",
            dispatch_year: requestData.dispatchYear || "",
            command_count: requestData.commandCount || "",
            memo_count: requestData.memoCount || ""
        };

        doc.render(dataToRender);

        // --- 4. ส่งไปแปลงเป็น PDF ที่ Cloud Run ---
        const docxBlob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const formData = new FormData();
        formData.append("files", docxBlob, "document.docx");

        const cloudRunBaseUrl = (typeof PDF_ENGINE_CONFIG !== 'undefined') ? PDF_ENGINE_CONFIG.BASE_URL : "https://pdf-engine-660310608742.asia-southeast1.run.app";
        
        console.log("🚀 ส่งไป Cloud Run...");
        const cloudRunResponse = await fetch(`${cloudRunBaseUrl}/forms/libreoffice/convert`, {
            method: "POST",
            body: formData
        });

        if (!cloudRunResponse.ok) throw new Error(`Cloud Run Error: ${cloudRunResponse.status}`);
        
        const pdfBlob = await cloudRunResponse.blob();
        return { pdfBlob, docxBlob };

    } catch (error) {
        console.error("PDF Generation Error:", error);
        alert(`❌ สร้างเอกสารไม่สำเร็จ: ${error.message}`);
        throw error;
    } finally {
        toggleLoader(btnId, false);
    }
}

// --- RENDER FUNCTIONS ---

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
    
    if (!requests || requests.length === 0) { 
        container.innerHTML = `
            <div class="text-center py-10">
                <p class="text-gray-400 text-lg">ไม่พบคำขอไปราชการ</p>
                <p class="text-gray-300 text-sm">รายการคำขอใหม่จะปรากฏที่นี่</p>
            </div>`; 
        return; 
    }
    
    container.innerHTML = requests.map(request => {
        const attendeeCount = request.attendeeCount || 0;
        const totalPeople = attendeeCount + 1;
        let peopleCategory = totalPeople === 1 ? "คำสั่งเดี่ยว" : (totalPeople <= 5 ? "คำสั่งกลุ่มเล็ก" : "คำสั่งกลุ่มใหญ่");
        
        const safeId = escapeHtml(request.id);
        const safeName = escapeHtml(request.requesterName);
        const safePurpose = escapeHtml(request.purpose);
        const safeLocation = escapeHtml(request.location);
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;

        let commandActionButtons = '';
        if (request.commandPdfUrl) {
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
            commandActionButtons = `
                <button onclick="openAdminGenerateCommand('${safeId}')" class="btn bg-green-500 hover:bg-green-600 text-white btn-sm shadow-sm w-full md:w-auto">
                    ✅ ออกคำสั่ง (${peopleCategory})
                </button>
            `;
        }

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
                    
                    <button onclick="deleteRequestByAdmin('${safeId}')" class="btn bg-red-100 text-red-600 hover:bg-red-200 btn-xs mb-2 flex items-center gap-1 self-end" title="ลบรายการนี้">
                        🗑️ ลบ
                    </button>
                    
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
    
    if (!memos || memos.length === 0) { 
        container.innerHTML = '<p class="text-center text-gray-500">ไม่พบบันทึกข้อความ</p>'; 
        return; 
    }
    
    container.innerHTML = memos.map(memo => {
        const hasCompletedFiles = memo.completedMemoUrl || memo.completedCommandUrl || memo.dispatchBookUrl;
        const safeId = escapeHtml(memo.id);
        const safeRef = escapeHtml(memo.refNumber);
        const safeUser = escapeHtml(memo.submittedBy);

        return `
        <div class="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition">
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
                
                <div class="flex flex-col gap-2 w-full sm:w-auto items-end">
                    
                    <button onclick="deleteMemoByAdmin('${safeId}')" class="btn bg-red-100 text-red-600 hover:bg-red-200 btn-xs mb-2" title="ลบบันทึกนี้">
                        🗑️ ลบ
                    </button>

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
    
    // แปลงไฟล์เป็น Base64 ส่งไปให้ GAS
    let completedMemoFileObject = null; 
    let completedCommandFileObject = null; 
    let dispatchBookFileObject = null;
    
    if (completedMemoFile) completedMemoFileObject = await fileToObject(completedMemoFile);
    if (completedCommandFile) completedCommandFileObject = await fileToObject(completedCommandFile);
    if (dispatchBookFile) dispatchBookFileObject = await fileToObject(dispatchBookFile);
    
    toggleLoader('admin-memo-submit-button', true);
    
    try {
        // ส่งไฟล์ไปให้ GAS อัปโหลดลง Drive
        const result = await apiCall('POST', 'updateMemoStatus', { 
            id: memoId, 
            status: status, 
            completedMemoFile: completedMemoFileObject, 
            completedCommandFile: completedCommandFileObject, 
            dispatchBookFile: dispatchBookFileObject 
        });
        
        if (result.status === 'success') {
            // ★ รับ URLs ที่ GAS ส่งกลับมา (จากที่เราแก้ Code.gs ข้อ 1.2)
            const urls = result.data || {}; 
            const safeId = memoId.replace(/[\/\\:\.]/g, '-');

            // อัปเดต Firestore เพื่อให้เห็นไฟล์ทันทีโดยไม่ต้องรอ Sync
            if (typeof db !== 'undefined') {
                 const updateData = { status: status };
                 if (urls.completedMemoUrl) updateData.completedMemoUrl = urls.completedMemoUrl;
                 if (urls.completedCommandUrl) updateData.completedCommandUrl = urls.completedCommandUrl;
                 if (urls.dispatchBookUrl) updateData.dispatchBookUrl = urls.dispatchBookUrl;

                 try {
                    // อัปเดตทั้งใน Memos และ Requests (เผื่อเก็บแยก)
                    await db.collection('memos').doc(safeId).set(updateData, { merge: true });
                    await db.collection('requests').doc(safeId).set(updateData, { merge: true });
                 } catch (e) { console.warn("Firestore update error:", e); }
            }

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
            
            // --- ★★★ ส่วนที่แก้ไข: ล็อกวันที่เอกสาร (Read Only) ★★★ ---
            const docDateInput = document.getElementById('admin-command-doc-date');
            docDateInput.value = toInputDate(data.docDate);
            docDateInput.readOnly = true; // ห้ามแก้ไข
            docDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'text-gray-500'); // ปรับสีให้ดูจางลง
            // --------------------------------------------------------

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

// ฟังก์ชันช่วยอัปโหลดไฟล์ Blob ลง Firebase Storage
async function uploadBlobToStorage(blob, path) {
    return new Promise((resolve, reject) => {
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(path);
        const uploadTask = fileRef.put(blob);

        uploadTask.on('state_changed', 
            (snapshot) => { /* ดู Progress ได้ถ้าต้องการ */ }, 
            (error) => { reject(error); }, 
            () => {
                uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                    resolve(downloadURL);
                });
            }
        );
    });
}

// --- DELETE FUNCTIONS (สำหรับ Admin) ---

// 1. ลบคำขอไปราชการ (Requests)
// ลบคำขอ
async function deleteRequestByAdmin(requestId) {
    if (!await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ที่จะลบคำขอเลขที่ ${requestId}?`)) return;
    toggleLoader('admin-requests-list', true);
    try {
        const safeId = requestId.toString().replace(/[\/\\:\.]/g, '-');
        // ลบจาก Firestore
        if (typeof db !== 'undefined') { try { await db.collection('requests').doc(safeId).delete(); } catch (e) {} }
        // ลบจาก Sheet/Drive (ผ่าน GAS)
        const result = await apiCall('POST', 'deleteRequest', { id: requestId });
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว');
            await fetchAllRequestsForCommand();
        } else { throw new Error(result.message); }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
        await fetchAllRequestsForCommand();
    }
}

// ลบบันทึกข้อความ
async function deleteMemoByAdmin(memoId) {
    if (!await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ที่จะลบบันทึกข้อความเลขที่ ${memoId}?`)) return;
    toggleLoader('admin-memos-list', true);
    try {
        const safeId = memoId.toString().replace(/[\/\\:\.]/g, '-');
        // ลบจาก Firestore
        if (typeof db !== 'undefined') { 
            try { await db.collection('memos').doc(safeId).delete(); } catch (e) {}
            try { await db.collection('requests').doc(safeId).delete(); } catch (e) {}
        }
        // ลบจาก Sheet/Drive (ผ่าน GAS)
        const result = await apiCall('POST', 'deleteMemo', { id: memoId });
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว');
            await fetchAllMemos();
        } else { throw new Error(result.message); }
    } catch (error) {
        showAlert('ผิดพลาด', 'ไม่สามารถลบได้: ' + error.message);
        await fetchAllMemos();
    }
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64String = reader.result.split(',')[1]; // ตัด header ออก
        resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
