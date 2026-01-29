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
// 2. ปรับปรุงฟังก์ชันสร้างเอกสาร (Fast Mode + Attachments)
// ==========================================

/**
 * สร้างคำสั่ง (Command) แบบ Fast Hybrid
 */
async function generateCommandHybrid(data) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    const docId = data.id.replace(/\//g, '-');
    console.log("🚀 Starting Command Generation (Fast Hybrid)...");

    try {
        // 1. อัปเดตสถานะ
        await db.collection('requests').doc(docId).set({
            commandStatus: 'กำลังดำเนินการสร้าง (Cloud Run)...',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. GAS Background (Backup)
        apiCall('POST', 'generateCommand', data)
            .then(async (gasResult) => {
                if (gasResult.status === 'success') {
                    console.log("✅ GAS Background Backup Completed");
                    await db.collection('requests').doc(docId).set({
                        commandDocUrl: gasResult.data.docUrl || '',
                        driveBackupPdfUrl: gasResult.data.pdfUrl || ''
                    }, { merge: true });
                }
            })
            .catch(err => console.warn("⚠️ GAS Network Error (Backup skipped):", err.message));

        // 3. เริ่ม Cloud Run (Main Task)
        let templateName = PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SOLO;
        if (data.attendees && data.attendees.length > 0) {
            templateName = data.attendees.length <= 15 
                ? PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SMALL 
                : PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_LARGE;
        }

        // สร้าง PDF หลัก
        const mainPdfBlob = await generatePdfFromCloudRun(templateName, data);
        
        // =========================================================
        // ★★★ ส่วนที่เพิ่ม: รวมไฟล์แนบ (Merge Attachments) ★★★
        // =========================================================
        let finalPdfBlob = mainPdfBlob;
        
        // ตรวจสอบว่ามีไฟล์แนบไหม (รองรับทั้ง key 'attachments' และ 'attachmentFiles')
        const attachments = data.attachments || data.attachmentFiles;
        
        if (attachments && attachments.length > 0) {
            console.log("📎 Found attachments, merging...", attachments.length);
            try {
                // เรียกใช้ฟังก์ชัน mergePdfs จาก utils.js
                if (typeof mergePdfs === 'function') {
                    finalPdfBlob = await mergePdfs(mainPdfBlob, attachments);
                    console.log("✅ Merge attachments success");
                } else {
                    console.warn("⚠️ mergePdfs function not found in utils.js");
                }
            } catch (mergeError) {
                console.error("❌ Merge Failed (Using main file only):", mergeError);
                // ถ้า Merge พัง ให้ใช้ไฟล์หลักไปก่อน ดีกว่าพังทั้งหมด
            }
        }
        // =========================================================

        const filename = `command_${docId}_${Date.now()}.pdf`;
        const cloudRunUrl = await uploadToStorage(finalPdfBlob, `generated_docs/${docId}/${filename}`);

        // 4. บันทึกผลลัพธ์
        const updateData = {
            commandStatus: 'เสร็จสิ้น',
            commandBookUrl: cloudRunUrl, 
            pdfSource: 'cloud-run'
        };

        await db.collection('requests').doc(docId).set(updateData, { merge: true });
        console.log("⚡ Cloud Run Finished. Returning result immediately.");

        return { status: 'success', data: updateData };

    } catch (cloudRunError) {
        console.warn("🔥 Cloud Run failed:", cloudRunError);
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

        // GAS Background
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

        // Cloud Run (Main)
        const mainPdfBlob = await generatePdfFromCloudRun(PDF_ENGINE_CONFIG.TEMPLATES.DISPATCH, data);
        
        // =========================================================
        // ★★★ ส่วนที่เพิ่ม: รวมไฟล์แนบ (Merge Attachments) ★★★
        // =========================================================
        let finalPdfBlob = mainPdfBlob;
        const attachments = data.attachments || data.attachmentFiles;
        
        if (attachments && attachments.length > 0) {
            console.log("📎 Found attachments, merging...", attachments.length);
            try {
                if (typeof mergePdfs === 'function') {
                    finalPdfBlob = await mergePdfs(mainPdfBlob, attachments);
                    console.log("✅ Merge attachments success");
                }
            } catch (mergeError) {
                console.error("❌ Merge Failed:", mergeError);
            }
        }
        // =========================================================

        const filename = `dispatch_${docId}_${Date.now()}.pdf`;
        const cloudRunUrl = await uploadToStorage(finalPdfBlob, `generated_docs/${docId}/${filename}`);

        // Update
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
