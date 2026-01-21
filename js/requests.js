// --- REQUEST FUNCTIONS (HYBRID SYSTEM: Firebase + GAS) ---

// จัดการปุ่ม Action ต่างๆ (แก้ไข, ลบ, ส่งบันทึก)
async function handleRequestAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const requestId = button.dataset.id;
    const action = button.dataset.action;

    console.log("Action triggered:", action, "Request ID:", requestId);

    if (action === 'edit') {
        console.log("🔄 Opening edit page for:", requestId);
        await openEditPage(requestId);
        
    } else if (action === 'delete') {
        console.log("🗑️ Deleting request:", requestId);
        await handleDeleteRequest(requestId);
        
    } else if (action === 'send-memo') {
        console.log("📤 Opening send memo modal for:", requestId);
        document.getElementById('memo-modal-request-id').value = requestId;
        document.getElementById('send-memo-modal').style.display = 'flex';
    }
}

// ลบคำขอ (ลบทั้งใน GAS และ Firebase)
async function handleDeleteRequest(requestId) {
    try {
        const user = getCurrentUser();
        if (!user) {
            showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่');
            return;
        }

        const confirmed = await showConfirm(
            'ยืนยันการลบ', 
            `คุณแน่ใจหรือไม่ว่าต้องการลบคำขอ ${requestId}? การกระทำนี้ไม่สามารถย้อนกลับได้`
        );

        if (!confirmed) return;

        // 1. ส่งคำสั่งลบไปที่ Google Apps Script (Master Data)
        const result = await apiCall('POST', 'deleteRequest', {
            requestId: requestId,
            username: user.username
        });

        if (result.status === 'success') {
            
            // 2. ลบข้อมูลใน Firebase (ถ้าเปิดใช้งาน Hybrid)
            if (typeof db !== 'undefined' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
                try {
                    // หาเอกสารที่มี requestId ตรงกันแล้วลบ
                    const query = await db.collection('requests').where('requestId', '==', requestId).get();
                    if (!query.empty) {
                        const batch = db.batch();
                        query.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log("✅ Deleted from Firebase:", requestId);
                    }
                } catch (fbError) {
                    console.warn("⚠️ Failed to delete from Firebase:", fbError);
                }
            }

            showAlert('สำเร็จ', 'ลบคำขอเรียบร้อยแล้ว');
            
            clearRequestsCache();
            await fetchUserRequests(); // โหลดข้อมูลใหม่
            
            // ถ้าอยู่ในหน้า Edit ให้เด้งกลับ Dashboard
            if (document.getElementById('edit-page').classList.contains('hidden') === false) {
                await switchPage('dashboard-page');
            }
            
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถลบคำขอได้');
        }

    } catch (error) {
        console.error('Error deleting request:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลบคำขอ: ' + error.message);
    }
}



// ✅ [แก้ไข] ดึงข้อมูลและกรองเฉพาะของฉัน (สำหรับ Dashboard)
// --- แก้ไขใน js/requests.js ---

async function fetchUserRequests() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        // 1. ตรวจสอบปีที่เลือก
        const yearSelect = document.getElementById('user-year-select');
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : (new Date().getFullYear() + 543);
        const currentYear = new Date().getFullYear() + 543;
        
        const isHistoryMode = selectedYear !== currentYear; // เช็คว่าเป็นโหมดดูย้อนหลังหรือไม่

        document.getElementById('requests-loader').classList.remove('hidden');
        document.getElementById('requests-list').classList.add('hidden');
        document.getElementById('no-requests-message').classList.add('hidden');

        let requestsData = [];
        let memosData = [];

        // 2. Logic การดึงข้อมูลแยกตามโหมด
        if (isHistoryMode) {
            console.log(`📜 Fetching HISTORY data for year ${selectedYear} directly from GAS...`);
            
            // ★ ยิงตรงไป GAS (ไม่ผ่าน Firebase)
            const res = await apiCall('GET', 'getRequestsByYear', { 
                year: selectedYear, 
                username: user.username 
            });
            
            if (res.status === 'success') requestsData = res.data;
            
            // (Optional) อาจต้องดึง Memo ของปีนั้นด้วย ถ้า API แยกกัน
            // const memoRes = await apiCall('GET', 'getMemosByYear', { ... });

        } else {
            // ★ โหมดปกติ (ปีปัจจุบัน) ใช้ Hybrid/Firebase เหมือนเดิม
            if (typeof fetchRequestsHybrid === 'function' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
                const firebaseResult = await fetchRequestsHybrid(user);
                if (firebaseResult !== null) {
                    requestsData = firebaseResult;
                } else {
                    const res = await apiCall('GET', 'getUserRequests', { username: user.username });
                    if (res.status === 'success') requestsData = res.data;
                }
            } else {
                const res = await apiCall('GET', 'getUserRequests', { username: user.username });
                if (res.status === 'success') requestsData = res.data;
            }
            
            // ดึง Memo ปัจจุบัน
            const memosResult = await apiCall('GET', 'getSentMemos', { username: user.username });
            if (memosResult.status === 'success') memosData = memosResult.data || [];
        }

        // 3. กรองและเรียงลำดับ
        if (requestsData && requestsData.length > 0) {
            // ถ้าเป็น GAS (History) อาจจะกรองมาให้แล้ว แต่กรองซ้ำเพื่อความชัวร์
            requestsData = requestsData.filter(req => req.username === user.username);
            
            requestsData.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.docDate || 0).getTime();
                const dateB = new Date(b.timestamp || b.docDate || 0).getTime();
                return dateB - dateA;
            });
        }

        // 4. แสดงผล
        allRequestsCache = requestsData;
        userMemosCache = memosData;
        renderRequestsList(allRequestsCache, userMemosCache);
        
        // ถ้าเป็นโหมดประวัติ อาจปิดการแจ้งเตือนหรือปุ่มแก้ไขบางอย่าง
        if (!isHistoryMode) {
            updateNotifications(allRequestsCache, userMemosCache);
        }

    } catch (error) {
        console.error('Error fetching requests:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
        document.getElementById('requests-loader').classList.add('hidden');
    }
}

// ... (ส่วนล่าง renderRequestsList และอื่นๆ คงเดิม) ...

// แสดงรายการคำขอ (Render UI)
function renderRequestsList(requests, memos, searchTerm = '') {
    const container = document.getElementById('requests-list');
    const noRequestsMessage = document.getElementById('no-requests-message');
    
    if (!requests || requests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        return;
    }

    let filteredRequests = requests;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredRequests = requests.filter(req => 
            (req.purpose && req.purpose.toLowerCase().includes(term)) ||
            (req.location && req.location.toLowerCase().includes(term)) ||
            (req.id && req.id.toLowerCase().includes(term))
        );
    }

    if (filteredRequests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        noRequestsMessage.textContent = 'ไม่พบคำขอที่ตรงกับการค้นหา';
        return;
    }

    container.innerHTML = filteredRequests.map(request => {
        const relatedMemo = memos.find(memo => memo.refNumber === request.id);
        
        let displayRequestStatus = request.status;
        let displayCommandStatus = request.commandStatus;
        
        // ถ้ามี Memo ให้ใช้สถานะจาก Memo แทน (ในกรณีที่ยังไม่ได้ Sync)
        if (relatedMemo) {
            displayRequestStatus = relatedMemo.status;
            displayCommandStatus = relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ? 'เสร็จสิ้น' : relatedMemo.status;
        }
        
        // ตรวจสอบไฟล์ที่เสร็จสมบูรณ์ (Priority: จาก Memo -> จาก Request เอง)
        const completedMemoUrl = relatedMemo?.completedMemoUrl || request.completedMemoUrl;
        const completedCommandUrl = relatedMemo?.completedCommandUrl || request.completedCommandUrl;
        const dispatchBookUrl = relatedMemo?.dispatchBookUrl || request.dispatchBookUrl;

        const hasCompletedFiles = completedMemoUrl || completedCommandUrl || dispatchBookUrl;
        
        const isFullyCompleted = displayRequestStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayRequestStatus === 'เสร็จสิ้น';
        
        // Sanitization (ป้องกัน XSS)
        const safeId = escapeHtml(request.id || request.requestId || 'รอออกเลข');
        const safePurpose = escapeHtml(request.purpose || 'ไม่มีวัตถุประสงค์');
        const safeLocation = escapeHtml(request.location || 'ไม่ระบุ');
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;
        
        return `
            <div class="border rounded-lg p-4 mb-4 bg-white shadow-sm ${isFullyCompleted ? 'border-green-300 bg-green-50' : ''} hover:shadow-md transition-all">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <h3 class="font-bold text-lg text-indigo-700">${safeId}</h3>
                            ${isFullyCompleted ? `
                                <span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-green-200">
                                    ✅ เสร็จสิ้น
                                </span>
                            ` : ''}
                            ${displayRequestStatus === 'นำกลับไปแก้ไข' ? `
                                <span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-red-200">
                                    ⚠️ ต้องแก้ไข
                                </span>
                            ` : ''}
                        </div>
                        <p class="text-gray-700 font-medium mb-1">${safePurpose}</p>
                        <p class="text-sm text-gray-500">📍 ${safeLocation} | 📅 ${safeDate}</p>
                        
                        <div class="mt-3 space-y-1">
                            <p class="text-sm">
                                <span class="font-medium">สถานะคำขอ:</span> 
                                <span class="${getStatusColor(displayRequestStatus)}">${translateStatus(displayRequestStatus)}</span>
                            </p>
                            <p class="text-sm">
                                <span class="font-medium">สถานะคำสั่ง:</span> 
                                <span class="${getStatusColor(displayCommandStatus || 'กำลังดำเนินการ')}">${translateStatus(displayCommandStatus || 'กำลังดำเนินการ')}</span>
                            </p>
                        </div>
                        
                        ${hasCompletedFiles ? `
                            <div class="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                <p class="text-sm font-medium text-green-800 mb-2">📁 ไฟล์ที่พร้อมดาวน์โหลด:</p>
                                <div class="flex flex-wrap gap-2">
                                    ${completedMemoUrl ? `
                                        <a href="${completedMemoUrl}" target="_blank" class="btn btn-success btn-sm text-xs py-1 px-2">
                                            📄 บันทึกข้อความ
                                        </a>
                                    ` : ''}
                                    ${completedCommandUrl ? `
                                        <a href="${completedCommandUrl}" target="_blank" class="btn bg-blue-500 hover:bg-blue-600 text-white btn-sm text-xs py-1 px-2">
                                            📋 คำสั่ง
                                        </a>
                                    ` : ''}
                                    ${dispatchBookUrl ? `
                                        <a href="${dispatchBookUrl}" target="_blank" class="btn bg-purple-500 hover:bg-purple-600 text-white btn-sm text-xs py-1 px-2">
                                            📦 หนังสือส่ง
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex flex-col gap-2 ml-4 min-w-[100px]">
                        ${request.pdfUrl ? `
                            <a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm w-full text-center">
                                📄 ดูคำขอ
                            </a>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="edit" data-id="${request.id || request.requestId}" class="btn bg-blue-500 hover:bg-blue-600 text-white btn-sm w-full">
                                ✏️ แก้ไข
                            </button>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="delete" data-id="${request.id || request.requestId}" class="btn btn-danger btn-sm w-full">
                                🗑️ ลบ
                            </button>
                        ` : ''}
                        
                        ${(displayRequestStatus === 'นำกลับไปแก้ไข' || !relatedMemo) && !isFullyCompleted ? `
                            <button data-action="send-memo" data-id="${request.id || request.requestId}" class="btn bg-green-500 hover:bg-green-600 text-white btn-sm w-full">
                                📤 ส่งบันทึก
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.classList.remove('hidden');
    noRequestsMessage.classList.add('hidden');

    container.addEventListener('click', handleRequestAction);
}

// --- EDIT PAGE FUNCTIONS ---

function resetEditPage() {
    console.log("🧹 Resetting edit page...");
    
    document.getElementById('edit-request-form').reset();
    document.getElementById('edit-attendees-list').innerHTML = '';
    document.getElementById('edit-result').classList.add('hidden');
    
    sessionStorage.removeItem('currentEditRequestId');
    document.getElementById('edit-request-id').value = '';
    document.getElementById('edit-draft-id').value = '';
    
    console.log("✅ Edit page reset complete");
}

function setupEditPageEventListeners() {
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        console.log("🏠 Returning to dashboard from edit page");
        switchPage('dashboard-page');
    });
    
    document.getElementById('generate-document-button').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Generate document button clicked");
        generateDocumentFromDraft();
    });
    
    document.getElementById('edit-add-attendee').addEventListener('click', () => addEditAttendeeField());
    
    document.querySelectorAll('input[name="edit-expense_option"]').forEach(radio => {
        radio.addEventListener('change', toggleEditExpenseOptions);
    });
    
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(radio => {
        radio.addEventListener('change', toggleEditVehicleDetails); // Use the toggleDetails helper
    });
    
    document.getElementById('edit-department').addEventListener('change', (e) => {
        const selectedPosition = e.target.value;
        const headNameInput = document.getElementById('edit-head-name');
        headNameInput.value = specialPositionMap[selectedPosition] || '';
    });
}

async function populateEditForm(requestData) {
    try {
        console.log("Populating edit form with:", requestData);
        document.getElementById('edit-draft-id').value = requestData.draftId || '';
        document.getElementById('edit-request-id').value = requestData.requestId || requestData.id || '';
        
        const formatDateForInput = (dateValue) => {
            if (!dateValue) return '';
            try {
                const date = new Date(dateValue);
                if (isNaN(date)) return '';
                return date.toISOString().split('T')[0];
            } catch (e) { return ''; }
        };
        
        document.getElementById('edit-doc-date').value = formatDateForInput(requestData.docDate);
        document.getElementById('edit-requester-name').value = requestData.requesterName || '';
        document.getElementById('edit-requester-position').value = requestData.requesterPosition || '';
        document.getElementById('edit-location').value = requestData.location || '';
        document.getElementById('edit-purpose').value = requestData.purpose || '';
        document.getElementById('edit-start-date').value = formatDateForInput(requestData.startDate);
        document.getElementById('edit-end-date').value = formatDateForInput(requestData.endDate);
        
        const attendeesList = document.getElementById('edit-attendees-list');
        attendeesList.innerHTML = '';
        
        if (requestData.attendees && requestData.attendees.length > 0) {
            requestData.attendees.forEach((attendee) => {
                if (attendee.name && attendee.position) {
                    addEditAttendeeField(attendee.name, attendee.position);
                }
            });
        }
        
        if (requestData.expenseOption === 'partial') {
            document.getElementById('edit-expense_partial').checked = true;
            toggleEditExpenseOptions();
            
            if (requestData.expenseItems && requestData.expenseItems.length > 0) {
                const expenseItems = Array.isArray(requestData.expenseItems) ? 
                    requestData.expenseItems : JSON.parse(requestData.expenseItems || '[]');
                    
                expenseItems.forEach(item => {
                    const checkboxes = document.querySelectorAll('input[name="edit-expense_item"]');
                    checkboxes.forEach(chk => {
                        if (chk.dataset.itemName === item.name) {
                            chk.checked = true;
                            if (item.name === 'ค่าใช้จ่ายอื่นๆ' && item.detail) {
                                document.getElementById('edit-expense_other_text').value = item.detail;
                            }
                        }
                    });
                });
            }
            if (requestData.totalExpense) {
                document.getElementById('edit-total-expense').value = requestData.totalExpense;
            }
        } else {
            document.getElementById('edit-expense_no').checked = true;
            toggleEditExpenseOptions();
        }
        
        if (requestData.vehicleOption) {
            const vehicleRadio = document.getElementById(`edit-vehicle_${requestData.vehicleOption}`);
            if (vehicleRadio) {
                vehicleRadio.checked = true;
                toggleEditVehicleDetails();
                
                if (requestData.vehicleOption === 'private' && requestData.licensePlate) {
                    document.getElementById('edit-license-plate').value = requestData.licensePlate;
                }
                 if (requestData.vehicleOption === 'public' && requestData.publicVehicleDetails) {
                     document.getElementById('edit-public-vehicle-details').value = requestData.publicVehicleDetails;
                }
            }
        }
        
        if (requestData.department) {
            document.getElementById('edit-department').value = requestData.department;
            const headNameInput = document.getElementById('edit-head-name');
            headNameInput.value = specialPositionMap[requestData.department] || '';
        }
        if (requestData.headName) {
            document.getElementById('edit-head-name').value = requestData.headName;
        }
    } catch (error) {
        console.error("Error populating edit form:", error);
        throw error;
    }
}

async function openEditPage(requestId) {
    try {
        console.log("🔓 Opening edit page for request:", requestId);
        if (!requestId || requestId === 'undefined' || requestId === 'null') {
            showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ");
            return;
        }
        const user = getCurrentUser();
        if (!user) {
            showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
            return;
        }
        
        document.getElementById('edit-result').classList.add('hidden');
        document.getElementById('edit-attendees-list').innerHTML = `
            <div class="text-center p-4"><div class="loader mx-auto"></div><p class="mt-2">กำลังโหลดข้อมูล...</p></div>`;

        const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId, username: user.username });

        if (result.status === 'success' && result.data) {
            let data = result.data;
            if (result.data && result.data.data) {
                data = result.data.data;
            }
            if (data.status === 'error') {
                showAlert("ผิดพลาด", data.message || "เกิดข้อผิดพลาดในการดึงข้อมูล");
                return;
            }
            data.attendees = Array.isArray(data.attendees) ? data.attendees : [];

            if ((!data.requesterName || data.requesterName.trim() === '') && user?.fullName) {
                data.requesterName = user.fullName;
            }
            if ((!data.requesterPosition || data.requesterPosition.trim() === '') && user?.position) {
                data.requesterPosition = user.position;
            }

            sessionStorage.setItem('currentEditRequestId', requestId);
            await populateEditForm(data);
            switchPage('edit-page');
        } else {
            showAlert("ผิดพลาด", result.message || "ไม่พบข้อมูลคำขอ");
        }
    } catch (error) {
        showAlert("ผิดพลาด", "ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้: " + error.message);
    }
}

function addEditAttendeeField(name = '', position = '') {
    const list = document.getElementById('edit-attendees-list');
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 bg-gray-50 p-3 rounded border border-gray-200';
    const standardPositions = ['ผู้อำนวยการ', 'รองผู้อำนวยการ', 'ครู', 'ครูผู้ช่วย', 'พนักงานราชการ', 'ครูอัตราจ้าง', 'พนักงานขับรถ', 'นักเรียน'];
    const isStandard = standardPositions.includes(position);
    const selectValue = isStandard ? position : (position ? 'other' : '');
    const otherValue = isStandard ? '' : position;

    attendeeDiv.innerHTML = `
        <div class="md:col-span-1">
            <label class="text-xs text-gray-500 mb-1 block">ชื่อ-นามสกุล</label>
            <input type="text" class="form-input attendee-name w-full" placeholder="ระบุชื่อ-นามสกุล" value="${escapeHtml(name)}" required>
        </div>
        <div class="attendee-position-wrapper md:col-span-1">
            <label class="text-xs text-gray-500 mb-1 block">ตำแหน่ง</label>
            <select class="form-input attendee-position-select w-full">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other mt-2 w-full ${selectValue === 'other' ? '' : 'hidden'}" placeholder="ระบุตำแหน่งอื่นๆ" value="${escapeHtml(otherValue)}">
        </div>
        <div class="flex items-end h-full pb-1 justify-center md:justify-start">
            <button type="button" class="btn btn-danger btn-sm h-10 w-full md:w-auto px-4" onclick="this.closest('.grid').remove()">ลบรายชื่อ</button>
        </div>
    `;
    list.appendChild(attendeeDiv);

    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');
    if (selectValue) select.value = selectValue;
    select.addEventListener('change', () => {
        if (select.value === 'other') {
            otherInput.classList.remove('hidden');
            otherInput.focus();
        } else {
            otherInput.classList.add('hidden');
            otherInput.value = '';
        }
    });
}

function toggleEditExpenseOptions() {
    const partialOptions = document.getElementById('edit-partial-expense-options');
    const totalContainer = document.getElementById('edit-total-expense-container');
    if (document.getElementById('edit-expense_partial')?.checked) {
        partialOptions.classList.remove('hidden');
        totalContainer.classList.remove('hidden');
    } else {
        partialOptions.classList.add('hidden');
        totalContainer.classList.add('hidden');
        document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => { chk.checked = false; });
        document.getElementById('edit-expense_other_text').value = '';
        document.getElementById('edit-total-expense').value = '';
    }
}

function toggleEditVehicleOptions() {
     toggleEditVehicleDetails();
}

function toggleEditVehicleDetails() {
    const privateDetails = document.getElementById('edit-private-vehicle-details'); 
    const publicDetails = document.getElementById('edit-public-vehicle-details'); 
    const privateCheckbox = document.querySelector('input[name="edit-vehicle_option"][value="private"]');
    const publicCheckbox = document.querySelector('input[name="edit-vehicle_option"][value="public"]');

    if (privateDetails) privateDetails.classList.toggle('hidden', !privateCheckbox?.checked);
    if (publicDetails) publicDetails.classList.toggle('hidden', !publicCheckbox?.checked);
}

async function generateDocumentFromDraft() {
    let requestId = document.getElementById('edit-request-id').value;
    const draftId = document.getElementById('edit-draft-id').value;
    if (!requestId) requestId = sessionStorage.getItem('currentEditRequestId');
    if (!requestId) { showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ"); return; }

    const formData = getEditFormData();
    if (!formData) return;
    if (!validateEditForm(formData)) return;
    
    formData.requestId = requestId;
    formData.draftId = draftId;
    formData.isEdit = true;
    
    toggleLoader('generate-document-button', true);
    try {
        let result;
        try {
            // การแก้ไขเอกสาร ยังต้องพึ่ง GAS ในการจัดการไฟล์ PDF ที่มีอยู่
            result = await apiCall('POST', 'updateRequest', formData);
        } catch (updateError) {
            result = await apiCall('POST', 'createRequest', formData);
        }
        
        if (result.status === 'success') {
            document.getElementById('edit-result-title').textContent = 'อัปเดตเอกสารสำเร็จ!';
            document.getElementById('edit-result-message').textContent = `บันทึกข้อความ ที่ ${result.data.id || requestId} ถูกอัปเดตแล้ว`;
            if (result.data.pdfUrl) {
                document.getElementById('edit-result-link').href = result.data.pdfUrl;
                document.getElementById('edit-result-link').classList.remove('hidden');
            } else {
                document.getElementById('edit-result-link').classList.add('hidden');
                document.getElementById('edit-result-message').textContent += ' (แต่ยังไม่สามารถสร้างไฟล์ PDF ได้ในขณะนี้)';
            }
            document.getElementById('edit-result').classList.remove('hidden');
            
            clearRequestsCache();
            await fetchUserRequests();
            
            sessionStorage.removeItem('currentEditRequestId');
            showAlert("สำเร็จ", "อัปเดตเอกสารเรียบร้อยแล้ว");
        } else {
            showAlert("ผิดพลาด", result.message || "ไม่สามารถอัปเดตเอกสารได้");
        }
    } catch (error) {
        showAlert("เกิดข้อผิดพลาด", "ไม่สามารถอัปเดตเอกสารได้: " + error.message);
    } finally {
        toggleLoader('generate-document-button', false);
    }
}

function getEditFormData() {
    try {
        let requestId = document.getElementById('edit-request-id').value;
        const draftId = document.getElementById('edit-draft-id').value;
        if (!requestId) requestId = sessionStorage.getItem('currentEditRequestId');
        if (!requestId) { const urlParams = new URLSearchParams(window.location.search); requestId = urlParams.get('requestId'); }

        const expenseItems = [];
        const expenseOption = document.querySelector('input[name="edit-expense_option"]:checked');
        if (expenseOption && expenseOption.value === 'partial') {
            document.querySelectorAll('input[name="edit-expense_item"]:checked').forEach(chk => {
                const item = { name: chk.dataset.itemName };
                if (item.name === 'ค่าใช้จ่ายอื่นๆ') { item.detail = document.getElementById('edit-expense_other_text').value.trim(); }
                expenseItems.push(item);
            });
        }
        const attendees = Array.from(document.querySelectorAll('#edit-attendees-list > div')).map(div => {
            const nameInput = div.querySelector('.attendee-name');
            const select = div.querySelector('.attendee-position-select');
            let position = select ? select.value : '';
            if (position === 'other') { const otherInput = div.querySelector('.attendee-position-other'); position = otherInput ? otherInput.value.trim() : ''; }
            return { name: nameInput ? nameInput.value.trim() : '', position: position };
        }).filter(att => att.name && att.position);

        const user = getCurrentUser();
        const formData = {
            draftId: draftId || '', requestId: requestId || '', username: user.username,
            docDate: document.getElementById('edit-doc-date').value,
            requesterName: document.getElementById('edit-requester-name').value.trim(),
            requesterPosition: document.getElementById('edit-requester-position').value.trim(),
            location: document.getElementById('edit-location').value.trim(),
            purpose: document.getElementById('edit-purpose').value.trim(),
            startDate: document.getElementById('edit-start-date').value,
            endDate: document.getElementById('edit-end-date').value,
            attendees: attendees,
            expenseOption: expenseOption ? expenseOption.value : 'no',
            expenseItems: expenseItems,
            totalExpense: document.getElementById('edit-total-expense').value || 0,
            vehicleOption: document.querySelector('input[name="edit-vehicle_option"]:checked')?.value || 'gov',
            licensePlate: document.getElementById('edit-license-plate').value.trim(),
            publicVehicleDetails: document.getElementById('edit-public-vehicle-details').value.trim(),
            department: document.getElementById('edit-department').value,
            headName: document.getElementById('edit-head-name').value,
            isEdit: true
        };
        return formData;
    } catch (error) { showAlert("ระบบผิดพลาด", "ไม่สามารถอ่านข้อมูลจากฟอร์มได้"); return null; }
}

function validateEditForm(formData) {
    if (!formData.docDate || !formData.requesterName || !formData.location || !formData.purpose || !formData.startDate || !formData.endDate) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลที่จำเป็นให้ครบ"); return false;
    }
    const startDate = new Date(formData.startDate);
    const endDate = new Date(formData.endDate);
    if (startDate > endDate) { showAlert("ข้อมูลไม่ถูกต้อง", "วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด"); return false; }
    return true;
}

// --- Basic Form Functions ---

async function resetRequestForm() {
    document.getElementById('request-form').reset();
    document.getElementById('form-request-id').value = '';
    document.getElementById('form-attendees-list').innerHTML = '';
    document.getElementById('form-result').classList.add('hidden');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('form-doc-date').value = today;
    document.getElementById('form-start-date').value = today;
    document.getElementById('form-end-date').value = today;
    document.getElementById('form-department').addEventListener('change', (e) => {
        const selectedDept = e.target.value;
        document.getElementById('form-head-name').value = specialPositionMap[selectedDept] || '';
    });
}

function addAttendeeField() {
    const list = document.getElementById('form-attendees-list');
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
    attendeeDiv.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" required>
        <div class="attendee-position-wrapper md:col-span-1">
             <select class="form-input attendee-position-select">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other hidden mt-1" placeholder="ระบุตำแหน่ง">
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>
    `;
    list.appendChild(attendeeDiv);
    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');
    select.addEventListener('change', () => {
        otherInput.classList.toggle('hidden', select.value !== 'other');
    });
}

function toggleExpenseOptions() {
    const partialOptions = document.getElementById('partial-expense-options');
    const totalContainer = document.getElementById('total-expense-container');
    if (document.getElementById('expense_partial').checked) {
        partialOptions.classList.remove('hidden');
        totalContainer.classList.remove('hidden');
    } else {
        partialOptions.classList.add('hidden');
        totalContainer.classList.add('hidden');
    }
}

function toggleVehicleDetails() {
    const privateDetails = document.getElementById('private-vehicle-details');
    const publicDetails = document.getElementById('public-vehicle-details');
    const privateCheckbox = document.querySelector('input[name="vehicle_option"][value="private"]');
    const publicCheckbox = document.querySelector('input[name="vehicle_option"][value="public"]');
    
    if (privateDetails) privateDetails.classList.toggle('hidden', !privateCheckbox?.checked);
    if (publicDetails) publicDetails.classList.toggle('hidden', !publicCheckbox?.checked);
}

// ✅ [HYBRID V2] สร้างบันทึกข้อความ + PDF Cloud Run + Storage
async function handleRequestFormSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) { showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบก่อน'); return; }

    // --- 1. เตรียมข้อมูลจากฟอร์ม ---
    const formData = {
        username: user.username,
        docDate: document.getElementById('form-doc-date').value,
        requesterName: document.getElementById('form-requester-name').value,
        requesterPosition: document.getElementById('form-requester-position').value,
        location: document.getElementById('form-location').value,
        purpose: document.getElementById('form-purpose').value,
        startDate: document.getElementById('form-start-date').value,
        endDate: document.getElementById('form-end-date').value,
        attendees: Array.from(document.querySelectorAll('#form-attendees-list > div')).map(div => {
            const select = div.querySelector('.attendee-position-select');
            let position = select.value;
            if (position === 'other') { position = div.querySelector('.attendee-position-other').value; }
            return { name: div.querySelector('.attendee-name').value, position: position };
        }).filter(att => att.name && att.position),
        expenseOption: document.querySelector('input[name="expense_option"]:checked').value,
        expenseItems: [],
        totalExpense: document.getElementById('form-total-expense').value || 0,
        vehicleOption: document.querySelector('input[name="vehicle_option"]:checked').value,
        licensePlate: document.getElementById('form-license-plate').value,
        department: document.getElementById('form-department').value,
        headName: document.getElementById('form-head-name').value,
        isEdit: false 
    };

    if (formData.expenseOption === 'partial') {
        document.querySelectorAll('input[name="expense_item"]:checked').forEach(chk => {
            const item = { name: chk.dataset.itemName };
            if (item.name === 'ค่าใช้จ่ายอื่นๆ') { item.detail = document.getElementById('expense_other_text')?.value || ''; }
            formData.expenseItems.push(item);
        });
    }

    toggleLoader('submit-request-button', true);
    
    try {
        // --- 2. สร้างข้อมูลในระบบ (เพื่อจองเลขที่เอกสาร/ID) ---
        let result;
        if (typeof createRequestHybrid === 'function' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
            result = await createRequestHybrid(formData);
        } else {
            result = await apiCall('POST', 'createRequest', formData);
        }

        if (result.status === 'success') {
            const newRequestId = result.data.id || 'Draft';
            const safeId = newRequestId.replace(/[\/\\:\.]/g, '-');
            console.log("✅ ID Created:", newRequestId);

            // --- 3. สร้าง PDF ผ่าน Cloud Run ---
            const pdfData = {
                ...formData,
                doctype: 'memo', 
                id: newRequestId,
                btnId: 'submit-request-button'
            };

            console.log("⚙️ Generating PDF...");
            // ดึงค่า pdfBlob ออกมาจาก Object Response
            const { pdfBlob } = await generateOfficialPDF(pdfData);

            // =========================================================
            // ★★★ UX Improvement: เปิดไฟล์ให้ดูทันที (ไม่ต้องรอ) ★★★
            // =========================================================
            const tempPdfUrl = URL.createObjectURL(pdfBlob);
            window.open(tempPdfUrl, '_blank');

            // แจ้งสถานะบนปุ่มหรือหน้าจอว่ากำลังทำงานต่อ
            const submitBtn = document.getElementById('submit-request-button');
            if(submitBtn) {
                 const loaderText = submitBtn.querySelector('.loader')?.nextElementSibling;
                 if(loaderText) loaderText.innerText = 'กำลังบันทึกลงระบบ...';
            }
            
            // --- 4. กระบวนการเบื้องหลัง: อัปโหลด PDF ลง Google Drive ---
            console.log("⏳ Background: Uploading PDF...");
            const pdfBase64 = await blobToBase64(pdfBlob);
            
            const uploadPdfResult = await apiCall('POST', 'uploadGeneratedFile', {
                data: pdfBase64,
                filename: `บันทึกข้อความ_${safeId}.pdf`,
                mimeType: 'application/pdf',
                username: user.username
            });

            if (uploadPdfResult.status !== 'success') throw new Error("PDF Upload failed: " + uploadPdfResult.message);
            const downloadUrl = uploadPdfResult.url;

            // --- 5. กระบวนการเบื้องหลัง: อัปโหลดไฟล์แนบ (ถ้ามี) ---
            const fileInput = document.getElementById('form-file-attachment');
            let attachmentUrl = null;

            if (fileInput && fileInput.files.length > 0) {
                console.log("⏳ Background: Uploading Attachment...");
                const file = fileInput.files[0];
                const fileObj = await fileToObject(file);
                
                const uploadFileResult = await apiCall('POST', 'uploadGeneratedFile', {
                    data: fileObj.data,
                    filename: file.name,
                    mimeType: file.type,
                    username: user.username
                });

                if (uploadFileResult.status === 'success') {
                    attachmentUrl = uploadFileResult.url;
                }
            }

            // --- 6. กระบวนการเบื้องหลัง: อัปเดต Firestore ---
            if (typeof db !== 'undefined') {
                const updateData = {
                    pdfUrl: downloadUrl,
                    completedMemoUrl: downloadUrl,
                    status: 'รอการตรวจสอบ'
                };
                if (attachmentUrl) updateData.fileUrl = attachmentUrl;

                try {
                    await db.collection('requests').doc(safeId).set(updateData, { merge: true });
                } catch (e) { console.warn("Firestore update error:", e); }
            }

            // --- 7. แสดงผลสำเร็จ ---
            console.log("✅ All processes complete.");
            document.getElementById('form-result-title').textContent = 'บันทึกสำเร็จ!';
            document.getElementById('form-result-message').textContent = `บันทึกข้อความเลขที่ ${newRequestId} เรียบร้อยแล้ว`;
            
            const linkBtn = document.getElementById('form-result-link');
            if (linkBtn) {
                linkBtn.href = downloadUrl;
                linkBtn.textContent = 'ดาวน์โหลดไฟล์ถาวร (Google Drive)';
                linkBtn.classList.remove('hidden');
            }
            
            document.getElementById('form-result').classList.remove('hidden');
            document.getElementById('request-form').reset();
            document.getElementById('form-attendees-list').innerHTML = '';
            
            // คืนค่าปุ่ม
            if(submitBtn) {
                 const loaderText = submitBtn.querySelector('.loader')?.nextElementSibling;
                 if(loaderText) loaderText.innerText = 'บันทึกข้อมูล';
            }

            clearRequestsCache();
            if (typeof fetchUserRequests === 'function') await fetchUserRequests(); 

        } else { 
            showAlert('ผิดพลาด', result.message); 
        }
    } catch (error) { 
        console.error(error);
        // ถึงจะ Error ตอนอัปโหลด แต่ User เห็นไฟล์แล้ว ก็แจ้งเตือนแบบ Soft Warning
        showAlert('แจ้งเตือน', 'เปิดไฟล์สำเร็จ แต่การบันทึกลงระบบขัดข้อง: ' + error.message); 
    } finally { 
        toggleLoader('submit-request-button', false); 
    }
}

function tryAutoFillRequester(retry = 0) {
    const nameInput = document.getElementById('form-requester-name');
    const posInput = document.getElementById('form-requester-position');
    const dateInput = document.getElementById('form-doc-date');
    if (!nameInput || !posInput) {
        if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 500);
        return;
    }
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
    let user = window.currentUser;
    if (!user) {
        const storedUser = sessionStorage.getItem('currentUser');
        if (storedUser) { try { user = JSON.parse(storedUser); window.currentUser = user; } catch (err) {} }
    }
    if (user) { nameInput.value = user.fullName || ''; posInput.value = user.position || ''; }
    else if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 1000);
}

// ✅ ฟังก์ชัน Modal ส่งบันทึกข้อความ (ใส่ไว้เพื่อป้องกัน error)
async function handleMemoSubmitFromModal(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    const requestId = document.getElementById('memo-modal-request-id').value;
    const memoType = document.querySelector('input[name="modal_memo_type"]:checked').value;
    const fileInput = document.getElementById('modal-memo-file');
    let fileObject = null;
    if (memoType === 'non_reimburse' && fileInput.files.length > 0) { fileObject = await fileToObject(fileInput.files[0]); }
    
    toggleLoader('send-memo-submit-button', true);
    try {
        const result = await apiCall('POST', 'uploadMemo', { refNumber: requestId, file: fileObject, username: user.username, memoType: memoType });
        if (result.status === 'success') { 
            showAlert('สำเร็จ', 'ส่งบันทึกข้อความสำเร็จ'); 
            document.getElementById('send-memo-modal').style.display = 'none'; 
            document.getElementById('send-memo-form').reset(); 
            await fetchUserRequests(); 
        } 
        else { showAlert('ผิดพลาด', result.message); }
    } catch (error) { showAlert('ผิดพลาด', error.message); } finally { toggleLoader('send-memo-submit-button', false); }
}

// Public Data
async function loadPublicWeeklyData() {
    try {
        const [requestsResult, memosResult] = await Promise.all([apiCall('GET', 'getAllRequests'), apiCall('GET', 'getAllMemos')]);
        if (requestsResult.status === 'success') {
            const requests = requestsResult.data;
            const memos = memosResult.status === 'success' ? memosResult.data : [];
            const enrichedRequests = requests.map(req => {
                const relatedMemo = memos.find(m => m.refNumber === req.id);
                return { ...req, completedCommandUrl: relatedMemo ? relatedMemo.completedCommandUrl : null, realStatus: relatedMemo ? relatedMemo.status : req.status };
            });
            currentPublicWeeklyData = enrichedRequests;
            renderPublicTable(enrichedRequests);
        } else {
            document.getElementById('public-weekly-list').innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">ไม่สามารถโหลดข้อมูลได้</td></tr>`;
            document.getElementById('current-week-display').textContent = "Connection Error";
        }
    } catch (error) { document.getElementById('public-weekly-list').innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">ไม่พบข้อมูล</td></tr>`; }
}

function renderPublicTable(requests) {
    const tbody = document.getElementById('public-weekly-list');
    tbody.parentElement.classList.add('responsive-table');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    const dateOptions = { day: 'numeric', month: 'short', year: '2-digit' };
    document.getElementById('current-week-display').textContent = `${monday.toLocaleDateString('th-TH', dateOptions)} - ${sunday.toLocaleDateString('th-TH', dateOptions)}`;
    
    const weeklyRequests = requests.filter(req => {
        if (!req.startDate || !req.endDate) return false;
        const reqStart = new Date(req.startDate); const reqEnd = new Date(req.endDate);
        reqStart.setHours(0,0,0,0); reqEnd.setHours(0,0,0,0);
        return (reqStart <= sunday && reqEnd >= monday);
    }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    currentPublicWeeklyData = weeklyRequests;
    if (weeklyRequests.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-500">ไม่มีรายการไปราชการในสัปดาห์นี้</td></tr>`; return; }
    
    tbody.innerHTML = weeklyRequests.map((req, index) => {
        let attendeesList = [];
        if (typeof req.attendees === 'string') { try { attendeesList = JSON.parse(req.attendees); } catch (e) { attendeesList = []; } } else if (Array.isArray(req.attendees)) { attendeesList = req.attendees; }
        let attendeesText = "";
        const count = attendeesList.length > 0 ? attendeesList.length : (req.attendeeCount || 0);
        if (count > 0) { attendeesText = `<div class="text-xs text-indigo-500 mt-1 cursor-pointer hover:underline" onclick="openPublicAttendeeModal(${index})">👥 และคณะรวม ${count + 1} คน</div>`; }
        
        const dateText = `${formatDisplayDate(req.startDate)} - ${formatDisplayDate(req.endDate)}`;
        
        const finalCommandUrl = req.completedCommandUrl; let actionHtml = '';
        if (finalCommandUrl && finalCommandUrl.trim() !== "") {
            actionHtml = `<a href="${finalCommandUrl}" target="_blank" class="btn bg-green-600 hover:bg-green-700 text-white btn-sm shadow-md transition-transform hover:scale-105 inline-flex items-center gap-1">ดูคำสั่ง</a>`;
        } else {
            let displayStatus = req.realStatus || req.status;
            let badgeClass = 'bg-gray-100 text-gray-600'; let icon = '🔄';
            if (displayStatus === 'Pending' || displayStatus === 'กำลังดำเนินการ') { badgeClass = 'bg-yellow-100 text-yellow-700 border border-yellow-200'; icon = '⏳'; }
            else if (displayStatus && displayStatus.includes('แก้ไข')) { badgeClass = 'bg-red-100 text-red-700 border border-red-200'; icon = '⚠️'; }
            else if (displayStatus === 'เสร็จสิ้นรอออกคำสั่งไปราชการ') { badgeClass = 'bg-blue-50 text-blue-600 border border-blue-100'; icon = '📝'; displayStatus = 'รอออกคำสั่ง'; }
            else if (displayStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayStatus === 'เสร็จสิ้น') { badgeClass = 'bg-green-100 text-green-700 border border-green-200'; icon = '✅'; displayStatus = 'เสร็จสิ้น'; }
            actionHtml = `<span class="${badgeClass} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap">${icon} ${translateStatus(displayStatus)}</span>`;
        }
        
        // Sanitization
        const safeName = escapeHtml(req.requesterName);
        const safePosition = escapeHtml(req.requesterPosition || '');
        const safePurpose = escapeHtml(req.purpose);
        const safeLocation = escapeHtml(req.location);

        return `
        <tr class="border-b hover:bg-gray-50 transition">
            <td class="px-6 py-4 whitespace-nowrap font-medium text-indigo-600" data-label="วัน-เวลา">${dateText}</td>
            <td class="px-6 py-4" data-label="ชื่อผู้ขอ">
                <div class="font-bold text-gray-800">${safeName}</div>
                <div class="text-xs text-gray-500">${safePosition}</div>
            </td>
            <td class="px-6 py-4" data-label="เรื่อง / สถานที่">
                <div class="font-medium text-gray-900 truncate max-w-xs" title="${safePurpose}">${safePurpose}</div>
                <div class="text-xs text-gray-500">ณ ${safeLocation}</div>${attendeesText}
            </td>
            <td class="px-6 py-4 text-center align-middle" data-label="ไฟล์คำสั่ง">${actionHtml}</td>
        </tr>`;
    }).join('');
}

function openPublicAttendeeModal(index) {
    const req = currentPublicWeeklyData[index]; if (!req) return;
    document.getElementById('public-modal-purpose').textContent = req.purpose;
    document.getElementById('public-modal-location').textContent = req.location;
    const startD = new Date(req.startDate); const endD = new Date(req.endDate);
    let dateText = formatDisplayDate(req.startDate); if (startD.getTime() !== endD.getTime()) { dateText += ` ถึง ${formatDisplayDate(req.endDate)}`; }
    document.getElementById('public-modal-date').textContent = dateText;
    const listBody = document.getElementById('public-modal-attendee-list');
    let html = ''; let count = 1;
    html += `<tr class="bg-blue-50/50"><td class="px-4 py-2 font-bold text-center">${count++}</td><td class="px-4 py-2 font-bold text-blue-800">${escapeHtml(req.requesterName)} (ผู้ขอ)</td><td class="px-4 py-2 text-gray-600">${escapeHtml(req.requesterPosition)}</td></tr>`;
    if (req.attendees && req.attendees.length > 0) { req.attendees.forEach(att => { html += `<tr class="border-t"><td class="px-4 py-2 text-center text-gray-500">${count++}</td><td class="px-4 py-2 text-gray-800">${escapeHtml(att.name)}</td><td class="px-4 py-2 text-gray-600">${escapeHtml(att.position)}</td></tr>`; }); }
    listBody.innerHTML = html;
    document.getElementById('public-attendee-modal').style.display = 'flex';
}
// --- [NEW] NOTIFICATION SYSTEM ---

function updateNotifications(requests, memos) {
    const badge = document.getElementById('notification-badge');
    const countText = document.getElementById('notification-count-text');
    const listContainer = document.getElementById('notification-list');
    
    if (!badge || !listContainer) return;

    // 1. กรองรายการที่ "สร้าง PDF แล้ว" แต่ "ยังไม่มีไฟล์สมบูรณ์" หรือ "ต้องแก้ไข"
    const pendingItems = requests.filter(req => {
        // ต้องมีเลขที่เอกสาร หรือสร้าง PDF แล้ว
        const hasCreated = req.pdfUrl && req.pdfUrl !== '';
        
        // เช็คสถานะจาก Memo (ถ้ามี)
        const relatedMemo = memos.find(m => m.refNumber === req.id);
        const isCompleted = relatedMemo && (relatedMemo.status === 'เสร็จสิ้น' || relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน');
        const isFixing = relatedMemo && relatedMemo.status === 'นำกลับไปแก้ไข';
        
        // เงื่อนไข: สร้างแล้ว แต่ยังไม่เสร็จ (หรือต้องแก้)
        return hasCreated && (!isCompleted || isFixing);
    });

    const count = pendingItems.length;

    // 2. อัปเดต Badge (จุดแดง)
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
        badge.classList.add('animate-bounce'); // เพิ่ม Effect เด้งดึ๋ง
        setTimeout(() => badge.classList.remove('animate-bounce'), 1000);
    } else {
        badge.classList.add('hidden');
    }
    
    if (countText) countText.textContent = `${count} รายการ`;

    // 3. สร้างรายการใน Dropdown
    if (count === 0) {
        listContainer.innerHTML = `<div class="p-8 text-center text-gray-400 flex flex-col items-center"><svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>ส่งครบทุกรายการแล้ว</div>`;
    } else {
        listContainer.innerHTML = pendingItems.map(req => {
            const isFix = req.status === 'นำกลับไปแก้ไข' || (memos.find(m => m.refNumber === req.id)?.status === 'นำกลับไปแก้ไข');
            const statusBadge = isFix 
                ? `<span class="text-xs bg-red-100 text-red-600 px-1.5 rounded">แก้</span>` 
                : `<span class="text-xs bg-yellow-100 text-yellow-600 px-1.5 rounded">รอส่ง</span>`;
            
            return `
            <div onclick="openSendMemoFromNotif('${req.id}')" class="p-3 hover:bg-blue-50 cursor-pointer transition flex justify-between items-start group">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-sm text-indigo-700">${escapeHtml(req.id || 'รอเลข')}</span>
                        ${statusBadge}
                    </div>
                    <p class="text-xs text-gray-500 line-clamp-1">${escapeHtml(req.purpose)}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">${formatDisplayDate(req.startDate)}</p>
                </div>
                <div class="text-indigo-500 opacity-0 group-hover:opacity-100 transition transform group-hover:translate-x-1">
                    ➤
                </div>
            </div>
            `;
        }).join('');
    }
}

// ฟังก์ชันเปิด Modal ส่งงานเมื่อคลิกจากรายการแจ้งเตือน
function openSendMemoFromNotif(requestId) {
    // ปิด Dropdown
    document.getElementById('notification-dropdown').classList.add('hidden');
    
    // เปิด Modal
    document.getElementById('memo-modal-request-id').value = requestId;
    document.getElementById('send-memo-modal').style.display = 'flex';
}
