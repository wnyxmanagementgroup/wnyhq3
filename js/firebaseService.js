/**
 * firebaseService.js
 * =====================================================================
 * Supabase เป็นฐานข้อมูลหลักผ่าน GAS/API ส่วน Google Sheets ใช้เป็นแหล่งข้อมูลสำรอง
 * Google Drive (ผ่าน GAS uploadGeneratedFile) เป็นที่เก็บไฟล์หลักของระบบ
 * =====================================================================
 */

// Firebase Storage instance (initialized in config.js)
let storage = null;
try {
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        storage = firebase.storage();
        console.log("📦 Firebase Storage ready in firebaseService.js");
    }
} catch(e) {
    console.warn("⚠️ Firebase Storage not available:", e.message);
}

// -----------------------------------------------------------------------
// 1. ID GENERATION — สร้างเลขที่เอกสารด้วย Firestore Atomic Counter
//    (แทนการเรียก GAS ซึ่งต้องรอนาน)
// -----------------------------------------------------------------------

/**
 * สร้างเลขที่เอกสารรูปแบบ "บค001/2568" ด้วย Firestore Transaction
 * ปลอดภัยจาก race condition เพราะใช้ Transaction
 */
async function generateRequestId(docDate) {
    if (!db) throw new Error('Firestore not initialized');

    const date = new Date(docDate);
    if (isNaN(date.getTime())) throw new Error('วันที่เอกสารไม่ถูกต้อง');

    const yearBE = date.getFullYear() + 543;
    const counterRef = db.doc(`counters/requests_${yearBE}`);

    // ตรวจว่า counter มีอยู่แล้วหรือยัง
    // ถ้ายังไม่มี ต้องอ่านเลขสูงสุดจาก GAS Sheets ก่อน เพื่อต่อเลขให้ถูกต้อง
    let startFrom = 0;
    const initialSnap = await counterRef.get();
    if (!initialSnap.exists) {
        try {
            const gasRes = await apiCall('GET', 'getMaxRequestSeq', { year: yearBE });
            if (gasRes.status === 'success' && gasRes.maxSeq > 0) {
                startFrom = gasRes.maxSeq;
                console.log(`📊 Counter init from GAS Sheets: maxSeq=${startFrom} (year ${yearBE})`);
            }
        } catch (e) {
            console.warn('⚠️ getMaxRequestSeq failed, starting from 0:', e.message);
        }
    }

    return await db.runTransaction(async (t) => {
        const counterDoc = await t.get(counterRef);
        const count = counterDoc.exists ? (counterDoc.data().count || 0) + 1 : startFrom + 1;
        t.set(counterRef, {
            count,
            year: yearBE,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        return `บค${String(count).padStart(3, '0')}/${yearBE}`;
    });
}

// -----------------------------------------------------------------------
// 2. FIREBASE AUTH — sign in anonymously เพื่อให้ Firestore rules ผ่าน
// -----------------------------------------------------------------------

async function ensureFirebaseAuth() {
    if (!firebase.auth) return;
    if (firebase.auth().currentUser) return;
    try {
        await firebase.auth().signInAnonymously();
        console.log('🔑 Signed in anonymously for Firestore access');
    } catch (e) {
        console.warn('⚠️ Anonymous sign-in failed:', e.message);
    }
}

// -----------------------------------------------------------------------
// 3. FILE UPLOAD — อัปโหลดไฟล์ไปยัง Google Drive ผ่าน GAS
//    ใช้ apiCall → GAS uploadGeneratedFile → DriveApp
// -----------------------------------------------------------------------

/**
 * อัปโหลดไฟล์ Blob ไปยัง Google Drive ผ่าน GAS (Generic)
 * รองรับ PDF, DOCX, รูปภาพ และไฟล์อื่น ๆ
 * คืนค่า Google Drive URL ที่ใช้งานได้ทันที
 */
async function uploadFileToStorage(blob, username, filename, mimeType) {
    const safeUsername = (username || 'unknown').replace(/[^a-zA-Z0-9ก-๙_-]/g, '_');
    const safeFilename = filename || `${safeUsername}_${Date.now()}`;
    const contentType = mimeType || blob.type || 'application/octet-stream';

    // แปลง Blob เป็น base64 แล้วส่งไป GAS
    const base64Data = await blobToBase64(blob);

    const result = await apiCall('POST', 'uploadGeneratedFile', {
        data: base64Data,
        filename: safeFilename,
        mimeType: contentType,
        username: safeUsername
    });

    if (!result || result.status !== 'success') {
        throw new Error(result?.message || 'Google Drive upload failed');
    }

    console.log('✅ File uploaded to Google Drive:', result.url);
    return result.url;
}

/**
 * อัปโหลด PDF Blob ไปยัง Google Drive
 * (wrapper ของ uploadFileToStorage สำหรับ PDF โดยเฉพาะ)
 */
async function uploadPdfToStorage(pdfBlob, username, filename) {
    return uploadFileToStorage(pdfBlob, username, filename, 'application/pdf');
}

// -----------------------------------------------------------------------
// 3.5 PDF UPLOAD COMPATIBILITY LAYER
// -----------------------------------------------------------------------

/**
 * เดิมใช้ชื่อฟังก์ชันนี้สำหรับอัปโหลดไป Firebase Storage
 * ตอนนี้ย้ายให้ใช้ Google Drive เป็นปลายทางหลักแทน
 * เพื่อให้จุดเรียกเดิมทั่วระบบยังทำงานได้โดยไม่ต้อง refactor ครั้งใหญ่
 */
async function uploadPdfToFirebaseStorage(pdfBlob, username, filename) {
    const driveUrl = await uploadPdfToStorage(pdfBlob, username, filename);
    console.log('✅ Uploaded PDF to Google Drive:', driveUrl);
    return driveUrl;
}

/**
 * ลบไฟล์ออกจาก Firebase Storage
 */
async function deleteFromFirebaseStorage(fileUrl) {
    if (!fileUrl || !fileUrl.includes('firebasestorage')) return;
    if (!storage) {
        try { storage = firebase.storage(); } catch(e) {}
    }
    if (!storage) return;
    try {
        const pathMatch = fileUrl.match(/o\/(.+?)\?/);
        if (!pathMatch) return;
        const filePath = decodeURIComponent(pathMatch[1]);
        await storage.ref(filePath).delete();
        console.log('🗑️ Deleted from Firebase Storage:', filePath);
    } catch (e) {
        console.warn('⚠️ Firebase Storage delete warning:', e.message);
    }
}

/**
 * ย้ายไฟล์จาก Firebase Storage ไป Google Drive (สำหรับการเก็บถาวร)
 * โดยอ่านจาก Firebase → อัปโหลดไป Google Drive ผ่าน GAS → ลบออกจาก Firebase
 */
async function archiveToGoogleDrive(firebaseUrl, username, filename) {
    // 1. ดาวน์โหลดจาก Firebase Storage
    const response = await fetch(firebaseUrl);
    if (!response.ok) throw new Error('ดาวน์โหลดจาก Firebase ไม่สำเร็จ');
    const fileBlob = await response.blob();

    // 2. อัปโหลดไป Google Drive ผ่าน GAS (ใช้ฟังก์ชันเดิม)
    const driveUrl = await uploadFileToStorage(fileBlob, username, filename, 'application/pdf');

    // 3. ลบออกจาก Firebase Storage
    await deleteFromFirebaseStorage(firebaseUrl);

    return driveUrl;
}

// -----------------------------------------------------------------------
// 3. BACKGROUND GAS SYNC — ส่งข้อมูลไป GAS/Sheets แบบ Async
//    ไม่บล็อก UI, ไม่แสดง error ถ้าล้มเหลว (เป็นแค่ backup)
// -----------------------------------------------------------------------

/**
 * ส่งข้อมูลไป GAS ในพื้นหลัง — ไม่ block, ไม่ throw error ถ้าล้มเหลว
 * @param {string} action  - GAS action name
 * @param {object} payload - ข้อมูลที่จะส่ง
 * @param {string} docId   - Firestore doc ID สำหรับอัปเดต URL กลับ (optional)
 */
function syncToGASBackground(action, payload, docId = null) {
    // ลบ field ใหญ่ที่ไม่จำเป็นก่อนส่งไป GAS
    const cleanPayload = { ...payload };
    delete cleanPayload.pdfBase64;
    delete cleanPayload.signatureBase64;
    delete cleanPayload._source;

    console.log(`🔄 Background GAS sync: ${action} (docId: ${docId || 'none'})`);

    apiCall('POST', action, cleanPayload)
        .then(result => {
            if (result && result.status === 'success') {
                console.log(`✅ GAS sync success: ${action}`);
                if (docId && db) {
                    const updateData = {
                        syncedToSheets: true,
                        sheetsSyncedAt: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    // ถ้า GAS สร้าง Google Doc ให้ เก็บ URL ไว้ด้วยเพื่อใช้ download .docx
                    if (result.data && result.data.docUrl) {
                        updateData.gasDocUrl = result.data.docUrl;
                    }
                    db.collection('requests').doc(docId)
                        .update(updateData)
                        .catch(() => {}); // ไม่ throw ถ้า update Firestore ล้มเหลว
                }
            } else {
                console.warn(`⚠️ GAS sync non-success: ${action}`, result?.message);
            }
        })
        .catch(e => {
            console.warn(`⚠️ Background GAS sync failed (non-critical): ${action}`, e.message);
        });
}

// -----------------------------------------------------------------------
// 4. SUBMIT REQUEST (Firestore-first)
// -----------------------------------------------------------------------

/**
 * ส่งคำขอไปราชการ — Firestore เป็นหลัก, GAS Sheets เป็น async backup
 * ไม่ต้องรอ GAS เลย ผู้ใช้เห็นข้อมูลทันที
 */
async function submitRequestWithHybrid(formData) {
    await ensureFirebaseAuth();
    showSavingOverlay('กำลังบันทึกคำขอ...');
    try {
        // 1. สร้าง ID จาก Firestore Counter (ไม่ต้องเรียก GAS)
        const requestId = await generateRequestId(formData.docDate);
        const docId = requestId.replace(/[\/\\:\.]/g, '-');

        console.log('📝 Generated ID:', requestId, '→ docId:', docId);

        // 2. เตรียมข้อมูลที่จะบันทึก Firestore
        const firestorePayload = { ...formData };
        delete firestorePayload.action;
        delete firestorePayload.btnId;
        delete firestorePayload.pdfBase64;
        delete firestorePayload.signatureBase64;

        // 3. บันทึกลง Firestore ทันที
        await db.collection('requests').doc(docId).set({
            ...firestorePayload,
            id: requestId,
            status: 'กำลังดำเนินการ',
            pdfStatus: 'pending',
            syncedToSheets: false,
            _source: 'firestore',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log('✅ Saved to Firestore:', docId);

        // 4. Sync ไป GAS Sheets ในพื้นหลัง (ไม่ block)
        syncToGASBackground('saveRequestAndGeneratePdf', {
            ...firestorePayload,
            id: requestId,
            preGeneratedPdfUrl: formData.pdfUrl || 'SKIP_GENERATION'
        }, docId);

        return { status: 'success', data: { id: requestId, docId } };
    } finally {
        hideSavingOverlay();
    }
}

// -----------------------------------------------------------------------
// 5. GENERATE COMMAND (Firestore-first)
// -----------------------------------------------------------------------

/**
 * สร้างคำสั่งไปราชการ — Firestore-first, GAS async
 */
async function generateCommandHybrid(data) {
    await ensureFirebaseAuth();
    showSavingOverlay('กำลังสร้างคำสั่งไปราชการ...');
    if (!data.id) { hideSavingOverlay(); throw new Error('ไม่พบรหัสเอกสาร (data.id) สำหรับการสร้างคำสั่ง'); }
    const docId = data.id.replace(/[\/\\:\.]/g, '-');

    try {
        // 1. สร้าง PDF ผ่าน Cloud Run ก่อน
        let commandPdfUrl = '';
        let commandDocUrl = '';

        try {
            let templateName = PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SOLO;
            if (data.attendees && data.attendees.length > 0) {
                templateName = data.attendees.length <= 15
                    ? PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_SMALL
                    : PDF_ENGINE_CONFIG.TEMPLATES.COMMAND_LARGE;
            }
            const commandData = {
                ...data,
                docType: 'command',
                templateType: templateName.replace('template_command_', '').replace('.docx', ''),
                btnId: null
            };
            const { pdfBlob } = await generateOfficialPDF(commandData);

            // อัปโหลดไป Google Drive ผ่าน GAS
            const filename = `command_${docId}_${Date.now()}.pdf`;
            commandPdfUrl = await uploadPdfToFirebaseStorage(pdfBlob, data.username || data.createdby || 'admin', filename);
            console.log('✅ Command PDF uploaded to Drive:', commandPdfUrl);

        } catch (e) {
            console.warn('⚠️ Command PDF generation failed, will use GAS fallback:', e.message);
        }

        // 2. อัปเดต Firestore ทันที (ไม่รอ GAS)
        const updateData = {
            commandStatus: 'รอตรวจสอบและออกคำสั่งไปราชการ',
            commandPdfUrl: commandPdfUrl,
            commandBookUrl: commandPdfUrl,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('requests').doc(docId).set(updateData, { merge: true });

        // 3. Sync ไป GAS ในพื้นหลัง
        syncToGASBackground('approveCommand', {
            ...data,
            preGeneratedPdfUrl: commandPdfUrl || null
        }, docId);

        return { status: 'success', data: { ...updateData, pdfUrl: commandPdfUrl, docUrl: commandDocUrl } };

    } catch (error) {
        await db.collection('requests').doc(docId).set({
            commandStatus: 'เกิดข้อผิดพลาด',
            errorLog: error.message
        }, { merge: true });
        throw error;
    } finally {
        hideSavingOverlay();
    }
}

// -----------------------------------------------------------------------
// 6. MONTHLY BACKUP — ส่งข้อมูลทั้งหมดจาก Supabase ไป GAS Sheets
// -----------------------------------------------------------------------

/**
 * สำรองข้อมูลทั้งหมดจาก Supabase ไปยัง Google Sheets ผ่าน GAS
 * เรียกใช้โดย Admin เดือนละครั้ง
 * @param {number} yearBE - ปี พ.ศ. ที่ต้องการ backup (default: ปีปัจจุบัน)
 */
async function backupSupabaseToSheets(yearBE) {
    const targetYear = yearBE || (new Date().getFullYear() + 543);
    console.log(`📦 Starting Supabase backup for year ${targetYear}...`);

    const [requestsResult, memosResult] = await Promise.all([
        apiCall('GET', 'getAllRequests', { year: targetYear, scope: 'year' }),
        apiCall('GET', 'getAllMemos', { year: targetYear, scope: 'year' })
    ]);

    const requests = requestsResult.status === 'success' ? (requestsResult.data || []) : [];
    const memos = memosResult.status === 'success' ? (memosResult.data || []) : [];

    if (!requests.length) {
        return { status: 'success', message: `ไม่มีข้อมูลในปี ${targetYear}`, count: 0 };
    }

    console.log(`📤 Sending ${requests.length} requests and ${memos.length} memos to GAS...`);

    const result = await apiCall('POST', 'batchSyncFromSupabase', {
        requests,
        memos,
        year: targetYear,
        syncedAt: new Date().toISOString()
    });

    console.log('📦 Backup result:', result);
    return { ...result, count: requests.length };
}

async function backupFirestoreToSheets(yearBE) {
    return backupSupabaseToSheets(yearBE);
}

// blobToBase64 is defined in utils.js (shared utility)
