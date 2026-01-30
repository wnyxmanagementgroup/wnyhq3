/**
 * ฟังก์ชันหลักในการส่งคำขอไปราชการ (Hybrid Mode)
 */
async function submitRequestWithHybrid(formData) {
    const tempId = Date.now().toString(); // ID ชั่วคราวก่อนได้เลข บค. จาก GAS
    
    try {
        // --- 1. พยายามสร้าง PDF ผ่าน Cloud Run ก่อน ---
        let preGeneratedUrl = null;
        try {
            console.log("🚀 Attempting Cloud Run PDF Generation...");
            // สมมติใช้ template_memo.docx สำหรับบันทึกข้อความ
            const pdfBlob = await generatePdfFromCloudRun('template_memo.docx', formData);
            
            // อัปโหลดไฟล์ที่ได้ไปยัง Storage ทันที
            const fileName = `memo_pending_${tempId}.pdf`;
            preGeneratedUrl = await uploadToStorage(pdfBlob, `requests/temp/${fileName}`);
            console.log("✅ Cloud Run Success! File URL:", preGeneratedUrl);
        } catch (e) {
            console.warn("⚠️ Cloud Run Failed, will fallback to GAS generation:", e.message);
            // ถ้าตรงนี้พัง preGeneratedUrl จะเป็น null ซึ่งจะไปเปิด Trigger ให้ GAS สร้างเองใน Step ถัดไป
        }

        // --- 2. ส่งข้อมูลไปที่ GAS เพื่อบันทึกเลขที่ (ID) และลง Google Sheet ---
        // ส่ง preGeneratedUrl ไปด้วย ถ้ามีค่า GAS จะไม่สร้างไฟล์ซ้ำ
        const payload = {
            ...formData,
            preGeneratedPdfUrl: preGeneratedUrl, 
            action: 'saveRequestAndGeneratePdf'
        };

        const result = await apiCall('POST', 'saveRequestAndGeneratePdf', payload);
        
        if (result.status === 'success') {
            const finalId = result.data.id;
            const docId = finalId.replace(/[\/\\\:\.]/g, '-');

            // --- 3. บันทึกข้อมูลลง Firestore (เพื่อให้หน้าเว็บเห็นปุ่มดาวน์โหลดทันที) ---
            await db.collection('requests').doc(docId).set({
                ...formData,
                id: finalId,
                pdfUrl: result.data.pdfUrl, // นี่คือ URL จาก Cloud Run หรือ GAS (Fallback)
                docUrl: result.data.docUrl,
                status: 'กำลังดำเนินการ',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            return result;
        } else {
            throw new Error(result.message || "GAS บันทึกข้อมูลไม่สำเร็จ");
        }

    } catch (error) {
        console.error("🔥 Submission process failed:", error);
        throw error;
    }
}

/**
 * ปรับปรุงการสร้างคำสั่ง (Command) ให้เป็นแบบ Serial Success
 */
async function generateCommandHybrid(data) {
    const docId = data.id.replace(/[\/\\\:\.]/g, '-');
    
    try {
        // 1. ลอง Cloud Run ก่อน
        let cloudRunUrl = null;
        try {
            let templateName = PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SOLO;
            if (data.attendees && data.attendees.length > 0) {
                templateName = data.attendees.length <= 15 
                    ? PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SMALL 
                    : PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_LARGE;
            }

            const finalPdfBlob = await generatePdfFromCloudRun(templateName, data);
            const filename = `command_${docId}_${Date.now()}.pdf`;
            cloudRunUrl = await uploadToStorage(finalPdfBlob, `generated_docs/${docId}/${filename}`);
        } catch (e) {
            console.warn("Cloud Run Command failed, letting GAS handle it.");
        }

        // 2. เรียก GAS: ส่ง cloudRunUrl ไปด้วย 
        // ถ้า cloudRunUrl มีค่า GAS จะข้ามขั้นตอนสร้าง PDF และบันทึก URL นี้ลง Sheet เลย
        const gasPayload = {
            ...data,
            preGeneratedPdfUrl: cloudRunUrl,
            action: 'generateCommand'
        };

        const gasResult = await apiCall('POST', 'generateCommand', gasPayload);

        // 3. บันทึกผลลัพธ์ลง Firestore หลังทุกอย่างใน GAS เสร็จสิ้น
        const updateData = {
            commandStatus: 'เสร็จสิ้น',
            commandBookUrl: gasResult.data.pdfUrl, // ใช้ URL จาก GAS (ซึ่งอาจจะรับมาจาก Cloud Run อีกที)
            commandDocUrl: gasResult.data.docUrl || '',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('requests').doc(docId).set(updateData, { merge: true });
        return { status: 'success', data: updateData };

    } catch (error) {
        await db.collection('requests').doc(docId).set({
            commandStatus: 'เกิดข้อผิดพลาด',
            errorLog: error.message
        }, { merge: true });
        throw error;
    }
}
