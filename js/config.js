// --- CONFIGURATION & UTILITIES ---

// 1. Debug Mode — เปิดอัตโนมัติบน localhost, ปิดบน production
const IS_DEBUG = (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname === ''
);

if (!IS_DEBUG) {
    console.log = function() {};
    console.warn = function() {};
    console.error = function() {};
    console.info = function() {};
}

// 2. Firebase Configuration (ค่าจริงของคุณ)
const firebaseConfig = {
  apiKey: "AIzaSyDy_ucbp_8R_o3O4cZY_TPesbkptUERn2E",
  authDomain: "wny-hq.firebaseapp.com",
  projectId: "wny-hq",
  storageBucket: "wny-hq",
  messagingSenderId: "1046709727117",
  appId: "1:1046709727117:web:25570ee363e3a821a397c4"
};
// 5. Cloud Run Configuration (PDF Engine)
const PDF_ENGINE_CONFIG = {
    BASE_URL: "https://wny-pdf-engine-660310608742.asia-southeast1.run.app/", // URL เดิมของคุณ
    TIMEOUT: 15000, // เวลาสูงสุดที่รอได้ (15 วินาที)
    TEMPLATES: {
        COMMAND_SOLO: 'template_command_solo.docx',
        COMMAND_SMALL: 'template_command_small.docx',
        COMMAND_LARGE: 'template_command_large.docx',
        DISPATCH: 'แม่แบบหนังสือส่งใหม่.docx'
    }
};
// 3. Initialize Firebase & Hybrid Mode
let db = null; // ตัวแปรฐานข้อมูล Global
const USE_FIREBASE = true; // เปิดใช้งานระบบ Hybrid

try {
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        console.log("🔥 Firebase Connected: Ready to speed up!");

        // Initialize Firebase Storage
        if (firebaseConfig.storageBucket) {
            try {
                window.storage = firebase.storage();
                console.log("📦 Firebase Storage initialized");
            } catch(e) {
                console.warn("⚠️ Firebase Storage init failed:", e.message);
            }
        }
    } else if (document.getElementById('login-view')) {
        console.error("❌ Firebase SDK not found. Please check index.html");
    }
} catch (error) {
    console.error("❌ Firebase Init Error:", error);
}

// 4. Google Apps Script URL (Backend เดิม)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxRK-XX8Kk4TdMPRSa1Wy9fu9obubLQ1uPmBmd-S4QTQiAe2zKgU6v3_i1UtTpIjpJW/exec";

// Global State
let allRequestsCache = [];
let allMemosCache = [];
let userMemosCache = [];
let allUsersCache = [];
window.requestsChartInstance = null;
window.statusChartInstance = null;
let currentPublicWeeklyData = [];

// --- UTILITIES ---

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let specialPositionMap = {
    'รองผู้อำนวยการกลุ่มบริหารทั่วไป':'นางวชิรินทรา พัฒนกุลเดช',
    'รองผู้อำนวยการกลุ่มบริหารงานบุคคล':'นางปณิชา ภัสสิรากุล',
    'รองผู้อำนวยการกลุ่มบริหารงบประมาณ':'นางจันทิมา นกอยู่',
    'รองผู้อำนวยการกลุ่มบริหารวิชาการ': 'นายมงคล เกตมณี',
    'หัวหน้ากลุ่มบริหารทั่วไป':'นายสุชาติ สินทร',
    'หัวหน้ากลุ่มบริหารงานบุคคล':'นายพงษ์ศักดิ์ ทองโพธิกุล',
    'หัวหน้ากลุ่มบริหารงบประมาณ':'นางสาวนุชนาฎ อำพันเสน',
    'หัวหน้ากลุ่มบริหารวิชาการ':'นางสาวสาวิทตรี อุ่นทองศิริ',
    'หัวหน้ากลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี': 'นางสาวปิยราช พันธุ์กมลศิลป์',
    'รองหัวหน้ากลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี':'นายอำนาจ ทัศนา',
    'หัวหน้ากลุ่มสาระการเรียนรู้คณิตศาสตร์': 'นายสมฤทธิ์ ชาญสมร',
    'หัวหน้ากลุ่มสาระการเรียนรู้ภาษาไทย': 'นางสาวจิรภา กันยาน้อย',
    'หัวหน้ากลุ่มสาระการเรียนรู้ภาษาต่างประเทศ': 'นางจินดาศรี แหลมทอง',
    'หัวหน้ากลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม': 'นางปฐวีกานต์ ปริธรรมมัง',
    'หัวหน้ากลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา': 'นางสาวเกษร เขจรลาภ',
    'หัวหน้ากลุ่มสาระการเรียนรู้ศิลปะ': 'นางสาวปิยลักษณ์ ขันทา',
    'หัวหน้ากลุ่มสาระการเรียนรู้การงานอาชีพ': 'นายสุชาติ สินทร',
    'หัวหน้างานแนะแนว':'นายเริงศักดิ์ จันทร์นวล',
    'ผู้อำนวยการโรงเรียน':'',
    '.....................................':'.....................................'
};

// แมปตำแหน่ง → role code ในระบบ (ใช้กำหนดคิวอนุมัติและสิทธิ์เมนูลงนาม)
const POSITION_TO_ROLE = {
    'หัวหน้ากลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี': 'head_science',
    'รองหัวหน้ากลุ่มสาระการเรียนรู้วิทยาศาสตร์และเทคโนโลยี': 'head_science',
    'หัวหน้ากลุ่มสาระการเรียนรู้คณิตศาสตร์': 'head_math',
    'หัวหน้ากลุ่มสาระการเรียนรู้ภาษาไทย': 'head_thai',
    'หัวหน้ากลุ่มสาระการเรียนรู้ภาษาต่างประเทศ': 'head_foreign',
    'หัวหน้ากลุ่มสาระการเรียนรู้สังคมศึกษา ศาสนา และวัฒนธรรม': 'head_social',
    'หัวหน้ากลุ่มสาระการเรียนรู้สุขศึกษาและพลศึกษา': 'head_health',
    'หัวหน้ากลุ่มสาระการเรียนรู้ศิลปะ': 'head_art',
    'หัวหน้ากลุ่มสาระการเรียนรู้การงานอาชีพ': 'head_career',
    'หัวหน้างานแนะแนว': 'head_guidance',
    'หัวหน้ากลุ่มบริหารทั่วไป': 'head_general',
    'หัวหน้ากลุ่มบริหารงานบุคคล': 'head_personnel',
    'หัวหน้ากลุ่มบริหารงบประมาณ': 'head_budget',
    'หัวหน้ากลุ่มบริหารวิชาการ': 'head_acad',
    'รองผู้อำนวยการกลุ่มบริหารทั่วไป': 'deputy_general',
    'รองผู้อำนวยการกลุ่มบริหารงบประมาณ': 'deputy_budget',
    'รองผู้อำนวยการกลุ่มบริหารวิชาการ': 'deputy_acad',
    'รองผู้อำนวยการกลุ่มบริหารงานบุคคล': 'deputy_personnel',
    'ผู้อำนวยการโรงเรียน': 'director',
};

const statusTranslations = {
    'Pending': 'กำลังดำเนินการ',
    'Submitted': 'รอการตรวจสอบ',
    'Approved': 'เสร็จสิ้น',
    'Pending Approval': 'รอการตรวจสอบ',
    'เสร็จสิ้น/รับไฟล์ไปใช้งาน': 'เสร็จสิ้น',
    'เสร็จสิ้น': 'เสร็จสิ้น',
    'รับไฟล์กลับไปใช้งาน': '✅ รับไฟล์กลับไปใช้งาน',
    'รอเอกสาร (เบิก)': 'รอเอกสาร (เบิก)',
    'นำกลับไปแก้ไข': 'นำกลับไปแก้ไข',
    'ถูกตีกลับ': '❌ ถูกตีกลับ (รอแก้ไข)',
    'เสร็จสิ้นรอออกคำสั่งไปราชการ': 'เสร็จสิ้นรอออกคำสั่ง',
    'รอตรวจสอบและออกคำสั่งไปราชการ': 'รอตรวจสอบและออกคำสั่ง',
    'กำลังดำเนินการ': 'กำลังดำเนินการ',
    'สิ้นสุดกระบวนการ': '🚫 สิ้นสุดกระบวนการ (แอดมิน)'
};

function translateStatus(status) {
    return statusTranslations[status] || status;
}
