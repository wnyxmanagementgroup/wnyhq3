# WNY App ไปราชการ

ระบบจัดการคำขอไปราชการออนไลน์ของโรงเรียนวังน้ำเย็นวิทยาคม สำหรับผู้ขอ, ผู้อนุมัติ, งานสารบรรณ และผู้ดูแลระบบ โดยรองรับการสร้างเอกสาร, ลงลายเซ็น, ติดตามสถานะ, คลังข้อมูลย้อนหลัง และการทำงานร่วมกับ Firebase, Google Apps Script และ GitHub Pages

## ภาพรวม

โปรเจกต์นี้แบ่งการใช้งานหลักออกเป็น 3 ส่วน

- `index.html` หน้าแรกของเว็บไซต์
- `app/index.html` แอปหลักสำหรับ login และจัดการงานในระบบ
- `archive/index.html` คลังข้อมูลย้อนหลังแบบ public

ระบบรองรับงานสำคัญ เช่น

- สร้างคำขอไปราชการและเอกสารประกอบ
- ระบบอนุมัติหลายขั้น
- ระบบลงลายเซ็นบนเอกสาร PDF
- ส่งบันทึกข้อความและแนบไฟล์
- สร้างกำหนดการเดินทาง
- หน้าตั้งค่าระบบสำหรับแอดมิน
- สำรองข้อมูลและเชื่อมกับ Firebase / Google Sheets

## โครงสร้างไฟล์หลัก

```text
wnyhqt2/
├── index.html                  หน้าแรก
├── app/index.html              หน้าแอปหลัก
├── archive/index.html          หน้าคลังข้อมูลย้อนหลัง
├── css/style.css               สไตล์หลักของแอป
├── js/
│   ├── main.js                 navigation, dashboard, signature pad, workflow settings
│   ├── auth.js                 login / session / role handling
│   ├── requests.js             ฟอร์มคำขอ, สร้างเอกสาร, ส่งบันทึก, ตำแหน่งลายเซ็น
│   ├── admin.js                เครื่องมือแอดมิน, คำสั่ง, กำหนดการเดินทาง
│   ├── signature.js            ระบบลงนาม PDF สำหรับผู้อนุมัติ
│   ├── stats.js                สถิติและกราฟ
│   ├── utils.js                helper กลาง, API call, loader, signature helpers
│   ├── firebaseService.js      อัปโหลดไฟล์และคุยกับ Firebase
│   ├── config.js               config ฝั่ง client
│   ├── tokenSign.js            ลงนามผ่านลิงก์พิเศษ
│   └── sarabun.js              เครื่องมือเกี่ยวกับสารบรรณ/PDF บางส่วน
├── code.gs                     Google Apps Script backend
├── firestore.rules             Firestore security rules
├── storage.rules               Firebase Storage rules
├── firebase.json               Firebase config สำหรับ rules
├── template_memo.docx          แม่แบบเอกสารบันทึก
├── template_command_*.docx     แม่แบบคำสั่ง
└── template_travel_schedule.docx
                               แม่แบบกำหนดการเดินทาง
```

## เทคโนโลยีที่ใช้

- Frontend: HTML, CSS, JavaScript
- Hosting: GitHub Pages
- Database / Auth / Storage: Firebase
- Backend workflow บางส่วน: Google Apps Script (`code.gs`)
- PDF / DOCX tools:
  - `pdf-lib`
  - `pdf.js`
  - `docxtemplater`
  - `pizzip`
- Testing / smoke check: `playwright`

## จุดที่แก้บ่อย

ถ้าต้องการแก้หน้าตาหรือพฤติกรรมของระบบ ให้เริ่มดูจากไฟล์เหล่านี้

- หน้าและโครง UI: [app/index.html](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/app/index.html)
- สไตล์หลัก: [css/style.css](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/css/style.css)
- ฟอร์มคำขอและเอกสารผู้ใช้: [js/requests.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/requests.js)
- เครื่องมือแอดมิน: [js/admin.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/admin.js)
- ระบบลายเซ็น: [js/signature.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/signature.js), [js/main.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/main.js), [js/utils.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/utils.js)
- Login / session / role: [js/auth.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/auth.js)
- ฝั่ง Google Apps Script: [code.gs](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/code.gs)

## การตรวจสอบเบื้องต้น

ตัวอย่างคำสั่งที่ใช้เช็ก syntax ของไฟล์ JS

```bash
node --check js/main.js
node --check js/requests.js
node --check js/admin.js
node --check js/signature.js
node --check js/utils.js
```

ถ้าต้องการทดสอบ UI หรือ smoke test สามารถใช้ `playwright` ที่ติดตั้งไว้ในโปรเจกต์ได้

## การพัฒนาในเครื่อง

โปรเจกต์นี้เป็น frontend แบบ static เป็นหลัก ดังนั้นหลายหน้าสามารถเปิดจากไฟล์ได้โดยตรง เช่น

- `index.html`
- `app/index.html`
- `archive/index.html`

แต่ถ้าต้องการทดสอบ flow ที่เกี่ยวข้องกับ

- Firebase
- login
- การอัปโหลดไฟล์
- การอ่าน query string / redirect
- การ cache ของ browser

ควรทดสอบผ่านหน้า deploy จริง หรือเปิดผ่าน local server แทนการเปิดไฟล์ `file://`

### dependency ที่มีใน repo

ตอนนี้ `package.json` ใช้หลัก ๆ เพื่อเก็บ `playwright`

```bash
npm install
```

## ลำดับการทำงานของระบบโดยย่อ

### ฝั่งผู้ขอ

1. login เข้าระบบ
2. กรอกคำขอไปราชการ
3. แนบลายเซ็นผู้ขอได้จาก signature pad
4. สร้างเอกสาร PDF
5. ส่งคำขอเข้าสู่สายอนุมัติ
6. ติดตามสถานะใน dashboard
7. เมื่อมีเอกสารที่ต้องดำเนินการต่อ เช่น ส่งบันทึกข้อความ หรือกรอกกำหนดการเดินทาง ระบบจะแสดงในเมนูที่เกี่ยวข้อง

### ฝั่งผู้อนุมัติ

1. เปิดรายการเอกสารที่รอลงนาม
2. เปิด preview PDF
3. วาดลายเซ็น
4. ลากวางหรือประทับลายเซ็นลงตำแหน่ง
5. ยืนยันเพื่อส่งต่อไปยังขั้นถัดไป

### ฝั่งแอดมิน

1. ตรวจสอบคำขอใน `จัดการบันทึก/คำสั่ง`
2. สร้างหรือแก้ไขกำหนดการเดินทาง
3. อัปโหลดไฟล์ขั้นสุดท้าย / ไฟนอลงาน
4. ใช้ `ตั้งค่าระบบ` เพื่อจัดการ workflow, archive, backup และงานเชิงระบบ
5. ตรวจสอบสถิติและรายการค้างผ่านหน้า dashboard / stats

## เมนูสำคัญของแอดมิน

### `ตั้งค่าระบบ`

ใช้สำหรับงานที่เกี่ยวข้องกับค่ากลางของระบบ เช่น

- sync ข้อมูลสู่ Firebase
- backup ข้อมูลไปยัง Sheets
- ส่ง email สำรอง
- เปิดคลังข้อมูลย้อนหลัง
- ตั้งค่า workflow การส่งบันทึก
- กำหนดว่าไฟล์ใดบังคับแนบใน flow ส่งบันทึก

ไฟล์หลักที่เกี่ยวข้อง

- [app/index.html](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/app/index.html)
- [js/main.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/main.js)

### `จัดการบันทึก/คำสั่ง`

เป็นหน้าหลักของแอดมินสำหรับจัดการงานเอกสาร เช่น

- เปิดคำขอแต่ละรายการ
- สร้างกำหนดการเดินทาง
- ออกคำสั่ง
- ออกหนังสือส่ง
- เปลี่ยนสถานะ
- ตรวจไฟล์ก่อนจบกระบวนการ

ไฟล์หลักที่เกี่ยวข้อง

- [js/admin.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/admin.js)

## ระบบลายเซ็น

ระบบลายเซ็นในโปรเจกต์นี้มีหลายจุด

- ลายเซ็นผู้ขอในฟอร์ม
- ลายเซ็นในหน้าแก้ไข
- ลายเซ็นใน modal ก่อนประทับเอกสาร
- ลายเซ็นใน flow ผู้อนุมัติ
- ลายเซ็นในกำหนดการเดินทาง

ไฟล์ที่เกี่ยวข้องโดยตรง

- [js/utils.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/utils.js)
- [js/main.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/main.js)
- [js/signature.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/signature.js)
- [js/requests.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/requests.js)
- [js/admin.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/admin.js)

ข้อควรระวังเวลาแก้:

- อย่าแก้เฉพาะ pad ตัวเดียวถ้าต้องการเปลี่ยนมาตรฐานทั้งระบบ
- ทดสอบทั้งตอนวาดและตอนฝังลง PDF
- ทดสอบทั้ง desktop และ touch device

## Checklist ก่อน deploy

ก่อน push งานขึ้น GitHub Pages หรือระบบจริง ควรเช็กอย่างน้อย:

1. `node --check` ผ่านในไฟล์ JS ที่แก้
2. หน้า `app/`, `archive/`, `index.html` เปิดได้
3. ปุ่มสำคัญไม่มีปัญหาสีตัวอักษรกลืนกับพื้นหลัง
4. flow login ใช้งานได้
5. ถ้าแก้ลายเซ็น ให้ลองวาดจริงและสร้างไฟล์ PDF จริง 1 รอบ
6. ถ้าแก้ workflow settings ให้ลอง save, reload, และตรวจว่า policy อ่านกลับได้
7. ถ้าแก้เอกสาร template ให้เช็ก output ไฟล์ที่สร้างจริง

## Deployment

ระบบนี้ใช้งานร่วมกับหลายส่วน

- GitHub Pages สำหรับ frontend
- Firebase สำหรับ auth, database, storage
- Google Apps Script สำหรับ workflow ฝั่ง server และเชื่อม Google Sheets / Drive

การเปลี่ยนแปลงฝั่งหน้าเว็บมักอยู่ในไฟล์:

- `index.html`
- `app/index.html`
- `archive/index.html`
- `css/style.css`
- `js/*.js`

ส่วนกฎของ Firebase อยู่ที่:

- `firestore.rules`
- `storage.rules`

## ปัญหาที่เจอบ่อย

### 1. หน้าเว็บขึ้นแต่ behavior ไม่เปลี่ยน

มักเกิดจาก browser cache หรือ GitHub Pages ยังไม่ refresh asset ใหม่

แนวทางตรวจ:

- refresh หน้า
- เติม query string เช่น `?ts=...` ตอนเช็กไฟล์ JS
- ตรวจว่าไฟล์ live ตรงกับ commit ล่าสุดแล้ว

### 2. บันทึก workflow ไม่ได้ / ขึ้น permission

เกี่ยวข้องกับ Firestore permissions หรือเอกสารผู้ใช้แอดมินใน `users/{uid}`

ไฟล์ที่มักต้องตรวจ:

- [firestore.rules](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/firestore.rules)
- [js/main.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/main.js)
- [js/auth.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/auth.js)

### 3. ลายเซ็นไม่คมหรือขนาดเพี้ยน

เกี่ยวข้องกับการตั้งค่า canvas ratio, การ trim ขอบโปร่ง และการฝังรูปลง PDF

ไฟล์ที่มักต้องตรวจ:

- [js/utils.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/utils.js)
- [js/signature.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/signature.js)
- [js/requests.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/requests.js)
- [js/admin.js](/Users/keeratiprasobpornrangsee/Desktop/ระบบไปราชการปรับปรุงของ%20V1/ระบบไปราชการปรับปรุงของ%20V2/wnyhqt2/js/admin.js)

## หมายเหตุ

- ใน repo นี้มีไฟล์ template จริงที่ใช้สร้างเอกสาร ดังนั้นก่อนแก้แม่แบบ `.docx` ควรทดสอบ output ทุกครั้ง
- ระบบมีหลาย flow ที่เกี่ยวข้องกับสถานะเอกสารและ role ผู้ใช้ จึงควรทดสอบทั้งฝั่งผู้ใช้และแอดมินหลังแก้ logic
- ถ้าแก้ส่วนลายเซ็นหรือ PDF ควรทดสอบทั้งการวาด, การวางตำแหน่ง, และไฟล์ PDF ที่สร้างออกมาจริง
- ถ้าจะทำ README สำหรับเผยแพร่สาธารณะ อาจต้องตัด path ภายในเครื่องและข้อมูล implementation บางส่วนออกก่อน
