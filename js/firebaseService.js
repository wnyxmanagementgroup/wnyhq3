// --- เพิ่มในไฟล์ js/firebaseService.js ---

/**
 * [ใหม่] สร้างคำสั่ง (Command) แบบ Hybrid
 * 1. บันทึกสถานะลง Firebase ก่อน (เพื่อให้ UI ตอบสนองไว)
 * 2. เรียก GAS เพื่อสร้างไฟล์ Google Doc และ PDF
 * 3. อัปเดตลิงก์กลับมาที่ Firebase
 */
async function generateCommandHybrid(data) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    try {
        console.log("🚀 Starting Command Generation (Hybrid)...");
        const docId = data.id.replace(/\//g, '-'); // แปลง ID ให้ปลอดภัยสำหรับ Firestore Document

        // 1. บันทึกลง Firebase ก่อน (Status: กำลังสร้าง...)
        const updatePayload = {
            commandStatus: 'กำลังดำเนินการสร้าง...',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('requests').doc(docId).set(updatePayload, { merge: true });
        console.log("✅ Firebase status updated: Generating...");

        // 2. ส่งงานให้ Google Apps Script (GAS)
        // ต้องมั่นใจว่า GAS ของคุณมีฟังก์ชัน 'generateCommand' ที่คืนค่า { docUrl, pdfUrl }
        const gasResult = await apiCall('POST', 'generateCommand', data);

        if (gasResult.status === 'success') {
            // 3. เมื่อ GAS ทำเสร็จ ให้บันทึก Link ทั้ง 2 แบบลง Firebase
            const finalUpdate = {
                commandStatus: 'เสร็จสิ้น',
                commandDocUrl: gasResult.data.docUrl || '', // ลิงก์ Google Doc (สำหรับแก้ไข)
                commandPdfUrl: gasResult.data.pdfUrl || ''  // ลิงก์ PDF (สำหรับใช้งาน)
            };
            
            await db.collection('requests').doc(docId).set(finalUpdate, { merge: true });
            
            return { status: 'success', data: { ...gasResult.data } };
        } else {
            throw new Error(gasResult.message || "GAS Error");
        }

    } catch (error) {
        console.error("🔥 Command Generation Error:", error);
        // แจ้ง Error ลง Firebase
        const docId = data.id.replace(/\//g, '-');
        await db.collection('requests').doc(docId).set({ 
            commandStatus: 'เกิดข้อผิดพลาด',
            note: error.message 
        }, { merge: true });
        
        throw error;
    }
}

/**
 * [ใหม่] สร้างหนังสือส่ง (Dispatch) แบบ Hybrid
 * ทำงานลักษณะเดียวกับ Command
 */
async function generateDispatchHybrid(data) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    try {
        console.log("🚀 Starting Dispatch Generation (Hybrid)...");
        const docId = data.id.replace(/\//g, '-');

        // 1. Update Firebase
        await db.collection('requests').doc(docId).set({
            dispatchStatus: 'กำลังดำเนินการสร้าง...',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 2. Call GAS
        const gasResult = await apiCall('POST', 'generateDispatch', data);

        if (gasResult.status === 'success') {
            // 3. Save Links (Doc + PDF)
            await db.collection('requests').doc(docId).set({
                dispatchStatus: 'เสร็จสิ้น',
                dispatchDocUrl: gasResult.data.docUrl || '',
                dispatchBookUrl: gasResult.data.pdfUrl || '', // ใช้ชื่อ dispatchBookUrl ตาม Schema เดิม
                dispatchBookDocUrl: gasResult.data.docUrl || '' // เก็บลิงก์ Doc แยกไว้ด้วย
            }, { merge: true });
            
            return { status: 'success', data: gasResult.data };
        } else {
            throw new Error(gasResult.message);
        }

    } catch (error) {
        console.error("🔥 Dispatch Generation Error:", error);
        throw error;
    }
}
