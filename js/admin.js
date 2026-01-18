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
        const result = await apiCall('GET', 'getAllRequests');
        if (result.status === 'success') {
            let requests = result.data || [];
            
            // เรียงลำดับ: ล่าสุดก่อน
            requests.sort((a, b) => {
                const timeA = new Date(a.timestamp || a.docDate || 0).getTime();
                const timeB = new Date(b.timestamp || b.docDate || 0).getTime();
                return timeB - timeA;
            });

            renderAdminRequestsList(requests);
        }
    } catch (error) { 
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

// --- HELPER FUNCTIONS (สำหรับเตรียมข้อมูลลง Word) ---

// แปลงเดือนไทย (สำหรับ {{MMMM}})
function getThaiMonth(dateStr) {
    if (!dateStr) return '.......';
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const d = new Date(dateStr);
    return months[d.getMonth()];
}

// แปลงปีไทย (สำหรับ {{YYYY}})
function getThaiYear(dateStr) {
    if (!dateStr) return '.......';
    const d = new Date(dateStr);
    return (d.getFullYear() + 543).toString();
}

// คำนวณจำนวนวัน (สำหรับ {{duration}})
function calculateDuration(start, end) {
    if (!start || !end) return '-';
    const d1 = new Date(start);
    const d2 = new Date(end);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // นับวันแรกและวันสุดท้าย
    return diffDays;
}

// --- GENERATE COMMAND FUNCTIONS ---

// ฟังก์ชันหลักที่ปุ่มกดเรียกใช้
// --- แก้ไขในไฟล์ js/admin.js ---

// 1. แก้ไขฟังก์ชัน handleAdminGenerateCommand
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
        id: requestId, 
        docDate: document.getElementById('admin-command-doc-date').value,
        requesterName: document.getElementById('admin-command-requester-name').value.trim(), 
        requesterPosition: document.getElementById('admin-command-requester-position').value.trim(),
        location: document.getElementById('admin-command-location').value.trim(), 
        purpose: document.getElementById('admin-command-purpose').value.trim(),
        startDate: document.getElementById('admin-command-start-date').value, 
        endDate: document.getElementById('admin-command-end-date').value,
        attendees: attendees, 
        // ... (ข้อมูลอื่นๆ)
        expenseOption: document.getElementById('admin-expense-option').value,
        expenseItems: document.getElementById('admin-expense-items').value, 
        totalExpense: document.getElementById('admin-total-expense').value,
        vehicleOption: document.getElementById('admin-vehicle-option').value, 
        licensePlate: document.getElementById('admin-license-plate').value
    };
    
    // ★ เปลี่ยนมาใช้ระบบ Hybrid GAS ★
    toggleLoader('admin-generate-command-button', true);
    
    try {
        // เรียกฟังก์ชันใหม่ใน firebaseService.js
        const result = await generateCommandHybrid(requestData);
        
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'สร้างคำสั่งเรียบร้อยแล้ว');
            
            // แสดงผลลัพธ์ 2 ลิงก์ (Doc และ PDF)
            showDualLinkResult(
                'admin-command-result', 
                'สร้างคำสั่งสำเร็จ!', 
                result.data.docUrl, 
                result.data.pdfUrl
            );
        }
    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถสร้างคำสั่งได้: ' + error.message);
    } finally {
        toggleLoader('admin-generate-command-button', false);
    }
}

// 2. แก้ไขฟังก์ชัน handleDispatchFormSubmit
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
    
    try {
        // เรียกฟังก์ชันใหม่
        const result = await generateDispatchHybrid(requestData);
        
        if (result.status === 'success') {
            document.getElementById('dispatch-modal').style.display = 'none';
            document.getElementById('dispatch-form').reset();
            
            // ใช้ Modal Alert หรือแสดงผลในหน้า Admin ก็ได้ (ในที่นี้ขอ Alert พร้อมปุ่มให้เลือก)
            // หรือจะแสดงในหน้า Command Generation Page ก็ได้
            
            // เนื่องจากหน้า Dispatch เป็น Modal ซ้อน Modal ขอใช้ Alert ธรรมดาแจ้งก่อน
            // แต่ถ้าต้องการให้แสดงลิงก์ ให้ใช้หน้าต่าง Result
            showAlert('สำเร็จ', 'สร้างหนังสือส่งเรียบร้อยแล้ว กรุณาตรวจสอบลิงก์ในหน้าจัดการ');
            
            // รีโหลดข้อมูลเพื่อโชว์ปุ่มดูไฟล์
            await fetchAllRequestsForCommand();
        }
    } catch (error) {
        showAlert('ผิดพลาด', error.message);
    } finally {
        toggleLoader('dispatch-submit-button', false);
    }
}

// 3. ฟังก์ชันช่วยแสดงผล 2 ปุ่ม (Doc & PDF)
function showDualLinkResult(containerId, title, docUrl, pdfUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <h3 class="font-bold text-lg text-green-800">${title}</h3>
        <p class="mt-2 text-gray-700">ท่านสามารถเลือกเปิดไฟล์ได้ 2 รูปแบบ:</p>
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

// ==========================================
// ★★★ ฟังก์ชันสร้าง PDF (หัวใจสำคัญ) ★★★
// ==========================================

// --- ค้นหาฟังก์ชัน generateOfficialPDF เดิมใน admin.js แล้วแทนที่ด้วยโค้ดนี้ ---

// --- แก้ไขไฟล์ js/admin.js (ฟังก์ชัน generateOfficialPDF ฉบับสมบูรณ์) ---

async function generateOfficialPDF(requestData) {
    // 1. ระบุปุ่มที่จะแสดง Loader (เพื่อให้ User รู้ว่าระบบกำลังทำงาน)
    let btnId = 'generate-document-button'; 
    if (requestData.doctype === 'dispatch') btnId = 'dispatch-submit-button';
    if (requestData.doctype === 'command') btnId = 'admin-generate-command-button';
    
    toggleLoader(btnId, true); 

    try {
        // ==========================================
        // ส่วนที่ 1: เตรียมข้อมูล (Data Preparation)
        // ==========================================
        
        // 1.1 แปลงวันที่เอกสารเป็นภาษาไทย
        const thaiMonths = [
            "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
            "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
        ];
        
        const docDateObj = requestData.docDate ? new Date(requestData.docDate) : new Date();
        const docMMMM = thaiMonths[docDateObj.getMonth()];
        const docYYYY = (docDateObj.getFullYear() + 543).toString();

        // 1.2 สร้างข้อความช่วงวันเดินทาง (date_range)
        let dateRangeStr = "";
        if (requestData.startDate && requestData.endDate) {
            const start = new Date(requestData.startDate);
            const end = new Date(requestData.endDate);
            
            const startDay = start.getDate();
            const endDay = end.getDate();
            const startMonth = thaiMonths[start.getMonth()];
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

        // 1.3 เตรียมรายชื่อผู้ร่วมเดินทาง (เพิ่มลำดับที่ i)
        const attendeesWithIndex = (requestData.attendees || []).map((att, index) => ({
            i: index + 1,
            name: att.name || "",
            position: att.position || ""
        }));

        // ==========================================
        // ส่วนที่ 2: โหลดและจัดการแม่แบบ (Template)
        // ==========================================

        // 2.1 เลือกชื่อไฟล์แม่แบบ
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

        console.log(`📂 กำลังโหลดแม่แบบ: ${templateFilename}`);

        // 2.2 โหลดไฟล์จาก Server
        const response = await fetch(`./${templateFilename}`);
        if (!response.ok) {
            throw new Error(`ไม่พบไฟล์แม่แบบ "${templateFilename}" กรุณาตรวจสอบว่าอัปโหลดไฟล์แล้ว`);
        }
        
        const content = await response.arrayBuffer();

        // 2.3 เริ่มต้นระบบ Word Engine (PizZip + Docxtemplater)
        const zip = new PizZip(content);
        
        const doc = new window.docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            
            // ★ ฟีเจอร์ผ่อนปรน (Lenient Parser): ช่วยแก้ปัญหาโค้ดสี/ฟอนต์แทรกในตัวแปร
            parser: function(tag) {
                // ลบช่องว่างและอักขระแปลกปลอมออกจากชื่อตัวแปร
                const cleanTag = tag.trim().replace(/^\s+|\s+$/g, '');
                
                return {
                    get: function(scope, context) {
                        if (cleanTag === '.') return scope;
                        return scope[cleanTag];
                    }
                };
            }
        });

        // ==========================================
        // ส่วนที่ 3: แทนที่ข้อมูล (Rendering)
        // ==========================================

        // ข้อมูลที่จะส่งเข้าไปแทนที่ใน Word
        const dataToRender = {
            YYYY: docYYYY,
            MMMM: docMMMM,
            purpose: requestData.purpose || "",
            location: requestData.location || "",
            date_range: dateRangeStr,
            requesterName: requestData.requesterName || "",
            attendees: attendeesWithIndex, // ตารางรายชื่อ
            dispatch_month: requestData.dispatchMonth || "",
            dispatch_year: requestData.dispatchYear || "",
            command_count: requestData.commandCount || "",
            memo_count: requestData.memoCount || ""
        };

        console.log("Data rendering:", dataToRender);

        // สั่งทำงานแทนที่ข้อมูล
        doc.render(dataToRender);

        // ==========================================
        // ส่วนที่ 4: สร้าง PDF (Cloud Run)
        // ==========================================

        // 4.1 สร้างไฟล์ Word (.docx) ที่สมบูรณ์
        const docxBlob = doc.getZip().generate({
            type: "blob",
            mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        // 4.2 เตรียมส่งไปแปลงเป็น PDF
        const formData = new FormData();
        formData.append("files", docxBlob, "document.docx");

        // ตรวจสอบ URL ของ PDF Engine (ใช้ Config ถ้ามี หรือใช้ Default)
        const cloudRunBaseUrl = (typeof PDF_ENGINE_CONFIG !== 'undefined') 
            ? PDF_ENGINE_CONFIG.BASE_URL 
            : "https://pdf-engine-660310608742.asia-southeast1.run.app";
        
        // ตั้งเวลา Timeout 20 วินาที (ป้องกันการรอนานเกินไป)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); 

        console.log("🚀 กำลังส่งไปแปลงเป็น PDF...");

        const cloudRunResponse = await fetch(`${cloudRunBaseUrl}/forms/libreoffice/convert`, {
            method: "POST",
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!cloudRunResponse.ok) {
            throw new Error(`Server Error (${cloudRunResponse.status}) - แปลงไฟล์ไม่สำเร็จ`);
        }

        // 4.3 เปิดไฟล์ PDF
        const pdfBlob = await cloudRunResponse.blob();
        const pdfUrl = window.URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');

    } catch (error) {
        console.error("PDF Generation Error:", error);
        
        // ==========================================
        // ส่วนที่ 5: แจ้งเตือนข้อผิดพลาด (Error Handling)
        // ==========================================
        if (error.properties && error.properties.errors) {
            // กรณีเป็น Error จากไฟล์ Template (เช่น ปีกกาซ้อนกัน)
            const errorMessages = error.properties.errors.map(e => {
                let msg = e.message;
                // แปล Error ให้อ่านง่าย
                if (msg.includes("Duplicate open tag")) return `- พบปีกกาเปิด {{ ซ้ำกัน (กรุณาลบแล้วพิมพ์ใหม่)`;
                if (msg.includes("Duplicate close tag")) return `- พบปีกกาปิด }} ซ้ำกัน`;
                if (msg.includes("Unclosed tag")) return `- ลืมปิดปีกกา }}`;
                if (msg.includes("Multi error")) return `- มีข้อผิดพลาดหลายจุดใน Template`;
                return `- ${msg} (Tag: ${e.properties.id || 'ไม่ระบุ'})`;
            }).join('\n');
            
            alert(`❌ ไฟล์แม่แบบ Word ผิดพลาด:\n${errorMessages}\n\nคำแนะนำ: ให้เปิดไฟล์ Word แล้วลบตัวแปรที่มีปัญหาทิ้ง แล้วพิมพ์ใหม่ด้วยมือ`);
        } else {
            // กรณี Error อื่นๆ (เน็ตหลุด, Server ล่ม)
            let msg = error.message;
            if (error.name === 'AbortError') msg = "การเชื่อมต่อหมดเวลา (Timeout) - ระบบ PDF ทำงานหนัก กรุณาลองใหม่";
            if (msg.includes('Failed to fetch')) msg = "ไม่สามารถเชื่อมต่อ Server แปลงไฟล์ได้ (ตรวจสอบอินเทอร์เน็ต)";
            
            alert(`❌ เกิดข้อผิดพลาด: ${msg}`);
        }
        
    } finally {
        toggleLoader(btnId, false);
    }
}
// ... (ส่วน Render และ User Management ให้คงไว้ตามเดิม หรือ Copy จากไฟล์เดิมมาต่อท้าย) ...
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
    if (!requests || requests.length === 0) { container.innerHTML = '<p class="text-center text-gray-500">ไม่พบคำขอไปราชการ</p>'; return; }
    
    container.innerHTML = requests.map(request => {
        const attendeeCount = request.attendeeCount || 0;
        const totalPeople = attendeeCount + 1;
        let peopleCategory = totalPeople === 1 ? "คำสั่งเดี่ยว (1 คน)" : (totalPeople <= 5 ? "คำสั่งกลุ่มเล็ก (2-5 คน)" : "คำสั่งกลุ่มใหญ่ (6 คนขึ้นไป)");
        
        const safeId = escapeHtml(request.id);
        const safeName = escapeHtml(request.requesterName);
        const safePurpose = escapeHtml(request.purpose);
        const safeLocation = escapeHtml(request.location);
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;

        return `
        <div class="border rounded-lg p-4 bg-white">
            <div class="flex justify-between items-start flex-wrap gap-4">
                <div class="flex-1 min-w-[200px]">
                    <h4 class="font-bold text-indigo-700">${safeId}</h4>
                    <p class="text-sm text-gray-600">โดย: ${safeName} | ${safePurpose}</p>
                    <p class="text-sm text-gray-500">${safeLocation} | ${safeDate}</p>
                    <p class="text-sm text-gray-700">ผู้ร่วมเดินทาง: ${attendeeCount} คน</p>
                    <p class="text-sm font-medium text-blue-700">👥 รวมทั้งหมด: ${totalPeople} คน (${peopleCategory})</p>
                    <p class="text-sm">สถานะคำขอ: <span class="font-medium">${translateStatus(request.status)}</span></p>
                    <p class="text-sm">สถานะคำสั่ง: <span class="font-medium">${request.commandStatus || 'รอดำเนินการ'}</span></p>
                </div>
                <div class="flex flex-col gap-2 w-full sm:w-auto">
                    ${request.pdfUrl ? `<a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm">ดูคำขอ</a>` : ''}
                    <div class="flex gap-1 flex-wrap">
                        ${request.commandPdfUrl ? 
                            `<a href="${request.commandPdfUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm">ดูคำสั่ง</a>` : 
                            `<button onclick="openAdminGenerateCommand('${safeId}')" class="btn bg-green-500 text-white btn-sm">ออกคำสั่ง</button>`
                        }
                        ${!request.dispatchBookPdfUrl ? `<button onclick="openDispatchModal('${safeId}')" class="btn bg-orange-500 text-white btn-sm">ออกหนังสือส่ง</button>` : ''}
                    </div>
                    <button onclick="openCommandApproval('${safeId}')" class="btn bg-purple-500 text-white btn-sm">อนุมัติด่วน</button>
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

async function handleDispatchFormSubmit(e) {
    e.preventDefault();
    const requestId = document.getElementById('dispatch-request-id').value;
    const dispatchMonth = document.getElementById('dispatch-month').value;
    const dispatchYear = document.getElementById('dispatch-year').value;
    const commandCount = document.getElementById('command-count').value;
    const memoCount = document.getElementById('memo-count').value;
    
    if (!dispatchMonth || !dispatchYear || !commandCount || !memoCount) { 
        showAlert('ผิดพลาด', 'กรุณากรอกข้อมูลให้ครบถ้วน'); 
        return; 
    }
    
    // เตรียมข้อมูลสำหรับส่งไปสร้าง PDF
    const requestData = {
        doctype: 'dispatch', // ★ ระบุว่าเป็นหนังสือส่ง
        id: requestId, 
        dispatchMonth: dispatchMonth, 
        dispatchYear: dispatchYear, 
        commandCount: commandCount, 
        memoCount: memoCount 
    };
    
    // เรียกใช้ฟังก์ชันใหม่
    await generateOfficialPDF(requestData);
    
    // ปิด Modal (Optional: อาจจะรอ PDF เด้งก่อน)
    document.getElementById('dispatch-modal').style.display = 'none'; 
    document.getElementById('dispatch-form').reset(); 
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
// --- เพิ่มต่อท้ายไฟล์ admin.js ---

// ฟังก์ชันแสดงผลลัพธ์ 2 ปุ่ม (Google Doc และ PDF)
function showDualLinkResult(containerId, title, docUrl, pdfUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // สร้าง HTML แสดงปุ่ม
    container.innerHTML = `
        <h3 class="font-bold text-lg text-green-800">${title}</h3>
        <p class="mt-2 text-gray-700">ดำเนินการเสร็จสิ้น ท่านสามารถเลือกเปิดไฟล์ได้ 2 รูปแบบ:</p>
        
        <div class="flex justify-center flex-wrap gap-4 mt-6">
            ${docUrl ? `
            <a href="${docUrl}" target="_blank" class="btn bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center gap-2 px-6 py-2">
                📝 แก้ไขใน Google Doc
            </a>` : ''}
            
            ${pdfUrl ? `
            <a href="${pdfUrl}" target="_blank" class="btn bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center gap-2 px-6 py-2">
                📄 เปิดไฟล์ PDF
            </a>` : ''}
        </div>
        
        <div class="mt-4">
            <button onclick="switchPage('command-generation-page')" class="btn bg-gray-500 text-white btn-sm">กลับหน้าจัดการ</button>
        </div>
    `;
    
    container.classList.remove('hidden');
    
    // เลื่อนหน้าจอลงมาให้เห็นผลลัพธ์
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
