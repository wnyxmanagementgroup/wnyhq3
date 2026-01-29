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

    // ลบเครื่องหมาย / ท้าย URL (ถ้ามี)
    const baseUrl = PDF_ENGINE_CONFIG.BASE_URL.replace(/\/$/, ""); 
    const url = `${baseUrl}/generate`; 

    // ★★★ ส่ง attachments ไปให้ Cloud Run ด้วย ★★★
    // data.attachments ควรเป็น Array ของ URL ไฟล์ PDF ที่ต้องการรวม
    
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
// 2. ปรับปรุงฟังก์ชันสร้างเอกสาร (Cloud Run Only Mode)
// ==========================================

/**
 * สร้างคำสั่ง (Command) โดยให้ Cloud Run จัดการรวมไฟล์ให้เลย
 */
async function generateCommandHybrid(data) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    const docId = data.id.replace(/[\/\\\:\.]/g, '-');
    console.log("🚀 Starting Command Generation (Cloud Run All-in-One)...");

    try {
        // 1. อัปเดตสถานะ
        await db.collection('requests').doc(docId).set({
            commandStatus: 'กำลังดำเนินการสร้างและรวมไฟล์ (Cloud Run)...',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. GAS Background (Backup Doc) - สั่งทำ Doc ต้นฉบับเก็บไว้ (ไม่รอ)
        apiCall('POST', 'generateCommand', data)
            .then(async (gasResult) => {
                if (gasResult.status === 'success') {
                    console.log("✅ GAS Doc Backup Completed");
                    await db.collection('requests').doc(docId).set({
                        commandDocUrl: gasResult.data.docUrl || ''
                    }, { merge: true });
                }
            })
            .catch(err => console.warn("⚠️ GAS Backup Error:", err.message));

        // 3. เริ่ม Cloud Run (Main Task + Merge)
        let templateName = PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SOLO;
        if (data.attendees && data.attendees.length > 0) {
            templateName = data.attendees.length <= 15 
                ? PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SMALL 
                : PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_LARGE;
        }

        // ★★★ เรียก Cloud Run ทีเดียว ได้ไฟล์รวมเสร็จสรรพ ★★★
        const finalPdfBlob = await generatePdfFromCloudRun(templateName, data);
        
        const filename = `command_${docId}_${Date.now()}.pdf`;
        const cloudRunUrl = await uploadToStorage(finalPdfBlob, `generated_docs/${docId}/${filename}`);

        // 4. บันทึกผลลัพธ์
        const updateData = {
            commandStatus: 'เสร็จสิ้น',
            commandBookUrl: cloudRunUrl, // ลิงก์นี้คือไฟล์ที่รวมเสร็จแล้ว
            pdfSource: 'cloud-run-integrated'
        };

        await db.collection('requests').doc(docId).set(updateData, { merge: true });
        console.log("⚡ Cloud Run Finished (Merged).");

        return { status: 'success', data: updateData };

    } catch (cloudRunError) {
        console.error("🔥 Cloud Run failed:", cloudRunError);
        await db.collection('requests').doc(docId).set({
            commandStatus: 'เกิดข้อผิดพลาด',
            errorLog: cloudRunError.message
        }, { merge: true });
        throw cloudRunError;
    }
}


/**
 * สร้างบันทึกข้อความ (Dispatch) แบบ Cloud Run Only
 */
async function generateDispatchHybrid(data) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    const docId = data.id.replace(/[\/\\\:\.]/g, '-');
    console.log("🚀 Starting Dispatch Generation (Cloud Run All-in-One)...");

    try {
        await db.collection('requests').doc(docId).set({
            dispatchStatus: 'กำลังดำเนินการสร้างและรวมไฟล์ (Cloud Run)...',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // GAS Background
        apiCall('POST', 'generateDispatch', data)
            .then(async (gasResult) => {
                if (gasResult.status === 'success') {
                    await db.collection('requests').doc(docId).set({
                        dispatchDocUrl: gasResult.data.docUrl || '',
                        dispatchBookDocUrl: gasResult.data.docUrl || ''
                    }, { merge: true });
                }
            })
            .catch(err => console.warn("⚠️ GAS Backup Error:", err.message));

        // Cloud Run (Main + Merge)
        const finalPdfBlob = await generatePdfFromCloudRun(PDF_ENGINE_CONFIG.TEMPLATES.DISPATCH, data);
        
        const filename = `dispatch_${docId}_${Date.now()}.pdf`;
        const cloudRunUrl = await uploadToStorage(finalPdfBlob, `generated_docs/${docId}/${filename}`);

        const updateData = {
            dispatchStatus: 'เสร็จสิ้น',
            dispatchBookUrl: cloudRunUrl,
            pdfSource: 'cloud-run-integrated'
        };

        await db.collection('requests').doc(docId).set(updateData, { merge: true });
        console.log("⚡ Cloud Run Finished (Merged).");

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