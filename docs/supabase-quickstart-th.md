# คู่มือเริ่มต้น Supabase สำหรับโปรเจกต์นี้

เอกสารนี้อธิบายเป็นภาษาไทยทั้งหมด เพื่อให้เริ่มย้ายระบบจาก Firebase ไป Supabase ได้ง่ายขึ้น โดยยังคง:

- `Google Apps Script`
- `Google Drive`
- `Cloud Run PDF Engine`

ไว้ทำงานเหมือนเดิม

## แนวคิดหลัก

ในโปรเจกต์นี้ เราไม่ได้ย้ายทุกอย่างไป Supabase พร้อมกัน

สิ่งที่ย้าย:

- ฐานข้อมูลหลักที่เดิมอิง Firestore

สิ่งที่คงไว้:

- GAS สำหรับ backend helper และ logic ที่ผูกกับ Google ecosystem
- Google Drive สำหรับไฟล์เอกสาร
- Cloud Run สำหรับแปลงเอกสารเป็น PDF

แบบนี้จะย้ายง่ายกว่า และเสี่ยงน้อยกว่า

## ไฟล์ที่เตรียมไว้ให้แล้ว

- schema ฐานข้อมูล: [supabase/schema.sql](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/supabase/schema.sql)
- แผน migration: [docs/supabase-migration-plan.md](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/docs/supabase-migration-plan.md)
- สคริปต์นำเข้าข้อมูลจาก Excel: [scripts/import_supabase_from_workbook.py](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/scripts/import_supabase_from_workbook.py)

## ขั้นตอนที่ 1: สร้างโปรเจกต์ Supabase

1. เข้าเว็บไซต์ [Supabase](https://supabase.com/)
2. สร้าง project ใหม่
3. เลือกแผน `Free`
4. ตั้งชื่อ project และรหัสผ่านฐานข้อมูล
5. รอจนโปรเจกต์พร้อมใช้งาน

## ขั้นตอนที่ 2: เตรียมค่าที่ต้องใช้

ในหน้า project settings ให้จด 2 ค่า:

- `Project URL`
- `service_role key`

คำเตือน:

- `service_role key` ห้ามฝังลงหน้าเว็บ
- ใช้เฉพาะในสคริปต์ import หรือใน GAS ฝั่ง backend เท่านั้น

## ขั้นตอนที่ 3: สร้างตารางใน Supabase

1. เปิด `SQL Editor`
2. คัดลอกเนื้อหาจาก [supabase/schema.sql](/Users/keeratiprasobpornrangsee/Desktop/งานปี%202569/ระบบไปราชการปรับปรุง/supabase/schema.sql)
3. กดรัน

หลังรันเสร็จ ควรเห็นตารางหลักเหล่านี้:

- `app_users`
- `requests`
- `attendees`
- `memos`
- `trash_requests`
- `request_counters`
- `approval_links`
- `app_settings`
- `system_config`

## ขั้นตอนที่ 4: ลองตรวจจำนวนข้อมูลก่อนนำเข้า

ใช้คำสั่งนี้เพื่อตรวจแบบไม่อัปโหลดจริง:

```bash
python3 scripts/import_supabase_from_workbook.py \
  --xlsx "/Users/keeratiprasobpornrangsee/Downloads/สำเนาของ WNY-App-ไปราชการ333.xlsx" \
  --url "https://PROJECT.supabase.co" \
  --service-role-key "SERVICE_ROLE_KEY" \
  --dry-run
```

ถ้าปกติ จะเห็นสรุปจำนวนข้อมูล เช่น:

- `app_users`
- `requests`
- `attendees`
- `memos`
- `trash_requests`
- `request_counters`

## ขั้นตอนที่ 5: นำเข้าข้อมูลจริง

เมื่อ dry-run ผ่านแล้ว ให้รันจริง:

```bash
python3 scripts/import_supabase_from_workbook.py \
  --xlsx "/Users/keeratiprasobpornrangsee/Downloads/สำเนาของ WNY-App-ไปราชการ333.xlsx" \
  --url "https://PROJECT.supabase.co" \
  --service-role-key "SERVICE_ROLE_KEY"
```

สคริปต์นี้จะนำเข้าข้อมูลจากชีต:

- `Users` -> `app_users`
- `Requests` -> `requests`
- `Attendees` -> `attendees`
- `Memos` -> `memos`
- `Trash` -> `trash_requests`

และจะคำนวณ `request_counters` ให้อัตโนมัติจากเลขคำขอเดิม

## ขั้นตอนที่ 6: ตรวจหลังนำเข้า

หลัง import เสร็จ ให้เปิด Table Editor แล้วเช็กอย่างน้อย:

1. `app_users` มีข้อมูลผู้ใช้ครบ
2. `requests` มีเลขคำขอครบ
3. `attendees` มีผู้ร่วมเดินทางครบ
4. `memos` มีเลข memo และลิงก์ไฟล์ครบ
5. `request_counters` มีค่าปีและเลขล่าสุด

## ข้อมูลที่ยังไม่ได้มาจากไฟล์ Excel นี้

ต้องเตรียมเพิ่มต่างหาก:

- `approval_links`
- `app_settings`
- `system_config`

ตัวอย่างสำคัญ:

- `settings/announcement`
- `systemConfig/workflowSettings`
- `systemConfig/signerPositions`

## ใช้ Supabase Free ได้ไหม

สำหรับโปรเจกต์นี้ ใช้ `Free` ได้ในช่วงเริ่มต้น เพราะข้อมูลยังไม่ใหญ่ และคุณไม่ได้ใช้ Supabase Storage เป็นที่เก็บไฟล์หลัก

แต่ต้องระวัง:

- egress มีเพดาน
- project free อาจ pause ถ้าไม่มีการใช้งานนาน
- ถ้าภายหลัง query หนักขึ้นมาก อาจต้องขยับไป Pro

## คำแนะนำการย้ายแบบปลอดภัย

ลำดับที่แนะนำคือ:

1. import ข้อมูลเข้า Supabase
2. ให้ GAS คุยกับ Supabase ก่อน
3. ให้หน้าเว็บยังเรียก `apiCall(...)` เหมือนเดิม
4. ค่อยลด dependency ของ Firestore ทีละส่วน
5. เมื่อทดสอบครบแล้วค่อยถอด Firebase ออก

## ขั้นต่อไปที่ควรทำ

หลังจาก import เสร็จแล้ว งานถัดไปที่เหมาะที่สุดคือ:

1. เพิ่ม helper ฝั่ง GAS สำหรับอ่าน/เขียน Supabase
2. เปลี่ยน endpoint สำคัญให้ใช้ Supabase แทน Firestore

ตัวอย่าง endpoint ที่ควรเริ่มก่อน:

- `getAllRequests`
- `getAllMemos`
- `getDraftRequest`
- `verifyCredentials`
- `submitRequest`
- `updateMemoStatus`

## สรุปสั้น

ถ้าจะเริ่มย้ายจริง ขั้นต่ำที่ต้องทำตอนนี้มี 4 อย่าง:

1. สร้าง Supabase project
2. รัน schema
3. import Excel เข้า Supabase
4. ทำ GAS helper ให้เริ่มอ่านจาก Supabase

เมื่อครบ 4 ขั้นนี้ ระบบจะพร้อมเข้าสู่ช่วง migration จริงแล้ว
