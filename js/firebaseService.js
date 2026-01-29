// --- แก้ไข/แทนที่ในไฟล์ js/firebaseService.js ---

// ==========================================
// 1. ส่วน Helper Functions
// ==========================================

async function uploadToStorage(blob, path) {
    const ref = firebase.storage().ref().child(path);
    await ref.put(blob);
    return await ref.getDownloadURL();
}

async function generatePdfFromCloudRun(templateName, data) {
    if (!PDF_ENGINE_CONFIG || !PDF_ENGINE_CONFIG.BASE_URL) {
        throw new Error("Cloud Run PDF Engine configuration missing");
    }

    // [แก้ไข 1] ลบเครื่องหมาย / ท้าย URL (ถ้ามี) เพื่อป้องกัน //generate
    const baseUrl = PDF_ENGINE_CONFIG.BASE_URL.replace(/\/$/, ""); 
    const url = `${baseUrl}/generate`; 

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            template: templateName,
            data: data
        })
    });

    if (!response.ok) throw new Error(`Cloud Run Error: ${response.statusText}`);
    return await response.blob();
}

// ==========================================
// 2. ปรับปรุงฟังก์ชันสร้างเอกสาร (Fast Mode)
// ==========================================

/**
 * สร้างคำสั่ง (Command) แบบ Fast Hybrid
 * - รอแค่ Cloud Run เสร็จแล้วตอบกลับเลย
 * - GAS ทำงานเบื้องหลัง (Background) เพื่อเก็บ Backup
 */
async function generateCommandHybrid(data) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    const docId = data.id.replace(/\//g, '-');
    console.log("🚀 Starting Command Generation (Fast Hybrid)...");

    try {
        // 1. อัปเดตสถานะเริ่มต้น
        await db.collection('requests').doc(docId).set({
            commandStatus: 'กำลังดำเนินการสร้าง (Cloud Run)...',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. สั่ง GAS ทำงานเบื้องหลัง (Background Task) - ไม่ต้อง await
        // [แก้ไข 2] ลบ throw err ออก เพื่อไม่ให้เกิด Unhandled Promise Rejection
        apiCall('POST', 'generateCommand', data)
            .then(async (gasResult) => {
                if (gasResult.status === 'success') {
                    console.log("✅ GAS Background Backup Completed");
                    // เมื่อ GAS เสร็จ ให้มาอัปเดตลิงก์ Backup ทีหลัง
                    await db.collection('requests').doc(docId).set({
                        commandDocUrl: gasResult.data.docUrl || '',
                        driveBackupPdfUrl: gasResult.data.pdfUrl || ''
                    }, { merge: true });
                } else {
                    console.warn("⚠️ GAS Background Task Failed:", gasResult.message);
                }
            })
            .catch(err => {
                // แค่ log เตือน แต่ไม่ต้อง throw ให้ระบบพัง
                console.warn("⚠️ GAS Network Error (Backup skipped):", err.message);
            });

        // 3. เริ่ม Cloud Run (Main Task) - รออันนี้อันเดียว
        let templateName = PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SOLO;
        if (data.attendees && data.attendees.length > 0) {
            templateName = data.attendees.length <= 15 
                ? PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SMALL 
                : PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_LARGE;
        }

        // สร้าง PDF จาก Cloud Run
        const pdfBlob = await generatePdfFromCloudRun(templateName, data);
        const filename = `command_${docId}_${Date.now()}.pdf`;
        const cloudRunUrl = await uploadToStorage(pdfBlob, `generated_docs/${docId}/${filename}`);

        // 4. Cloud Run เสร็จแล้ว! บันทึกและตอบกลับทันที
        const updateData = {
            commandStatus: 'เสร็จสิ้น',
            commandBookUrl: cloudRunUrl, // ลิงก์หลักสำหรับแสดงผล
            pdfSource: 'cloud-run'
        };

        await db.collection('requests').doc(docId).set(updateData, { merge: true });
        console.log("⚡ Cloud Run Finished. Returning result immediately.");

        return { status: 'success', data: updateData };

    } catch (cloudRunError) {
        console.warn("🔥 Cloud Run failed:", cloudRunError);
        
        // บันทึก Error ลงฐานข้อมูลเพื่อให้ Admin ตรวจสอบได้
        await db.collection('requests').doc(docId).set({
            commandStatus: 'เกิดข้อผิดพลาด',
            errorLog: cloudRunError.message
        }, { merge: true });
        
        throw cloudRunError;
    }
}


/**
 * สร้างบันทึกข้อความ (Dispatch) แบบ Fast Hybrid
 */
async function generateDispatchHybrid(data) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    const docId = data.id.replace(/\//g, '-');
    console.log("🚀 Starting Dispatch Generation (Fast Hybrid)...");

    try {
        await db.collection('requests').doc(docId).set({
            dispatchStatus: 'กำลังดำเนินการสร้าง (Cloud Run)...',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // GAS Background Task (แก้ไขเหมือนกัน)
        apiCall('POST', 'generateDispatch', data)
            .then(async (gasResult) => {
                if (gasResult.status === 'success') {
                    console.log("✅ GAS Background Backup Completed");
                    await db.collection('requests').doc(docId).set({
                        dispatchDocUrl: gasResult.data.docUrl || '',
                        dispatchBookDocUrl: gasResult.data.docUrl || '',
                        driveBackupPdfUrl: gasResult.data.pdfUrl || ''
                    }, { merge: true });
                }
            })
            .catch(err => console.warn("⚠️ GAS Background Error (Backup skipped):", err.message));

        // Cloud Run Task (Main)
        const pdfBlob = await generatePdfFromCloudRun(PDF_ENGINE_CONFIG.TEMPLATES.DISPATCH, data);
        const filename = `dispatch_${docId}_${Date.now()}.pdf`;
        const cloudRunUrl = await uploadToStorage(pdfBlob, `generated_docs/${docId}/${filename}`);

        // Update & Return
        const updateData = {
            dispatchStatus: 'เสร็จสิ้น',
            dispatchBookUrl: cloudRunUrl,
            pdfSource: 'cloud-run'
        };

        await db.collection('requests').doc(docId).set(updateData, { merge: true });
        console.log("⚡ Cloud Run Finished. Returning result immediately.");

        return { status: 'success', data: updateData };

    } catch (error) {
        console.error("Dispatch Error:", error);
        await db.collection('requests').doc(docId).set({
            dispatchStatus: 'เกิดข้อผิดพลาด',
            errorLog: error.message
        }, { merge: true });
        throw error;
    }
}
