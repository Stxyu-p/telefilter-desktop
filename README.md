<div align="center">

# ⚡ Telefilter Desktop <sub>v5.0.0</sub>

**Media Intelligence Suite & Precision Downloader for Telegram WebK**

*Ultra-compact Inline Toolbar · Mixed-Album ZIP · Local Bookmark Library*  
*Pure Vanilla JavaScript · Zero Dependencies · 100% Client-Side*

[![Install](https://img.shields.io/badge/Install-Userscript%20v5.0.0-0284c7?style=for-the-badge&logo=tampermonkey&logoColor=white)](telefilter_desktop.user.js)
[![Release](https://img.shields.io/badge/Release-v5.0.0-10b981?style=for-the-badge)](telefilter_desktop.user.js)
[![Platform](https://img.shields.io/badge/Platform-Telegram%20WebK-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://web.telegram.org/k/)
[![License: MIT](https://img.shields.io/badge/License-MIT-f59e0b?style=for-the-badge)](LICENSE)

![Dependencies](https://img.shields.io/badge/Dependencies-Zero-success?style=flat-square)
![Engine](https://img.shields.io/badge/Engine-Vanilla%20JS-cyan?style=flat-square)
![Storage](https://img.shields.io/badge/Storage-IndexedDB%20Vault-blue?style=flat-square)
![Design](https://img.shields.io/badge/Design-Clean%20Minimal%20Precision-purple?style=flat-square)

</div>

---

## 🧭 Visual Interface Map

แถบเครื่องมือ **Inline Toolbar** ฝังเรียบเนียนใต้หัวแชท ความสูง 34px ขนาดกะทัดรัด พร้อม Floating Popovers ไม่ดันข้อความแชท

<p align="center">
  <img src="assets/toolbar-map.svg" alt="Telefilter Desktop Interface Map" width="100%">
</p>

---

## ⚡ Core Features (ฟังก์ชันหลักที่ทำได้ทันที)

| ฟังก์ชัน | ไอคอน | ทำอะไรได้บ้าง | จุดเด่น |
| :--- | :---: | :--- | :--- |
| **Instant Media Filters** | 🎛️ | กรองแสดงเฉพาะ **Text, Photos, Videos, Files, Viral** ในห้องแชททันที | ใช้ CSS filter ไม่ต้องโหลดหน้าใหม่ สลับไปมาได้ลื่นไหล ไม่กระตุก |
| **Mixed-Album ZIP Engine** | 📦 | แตกอัลบั้มที่รวมรูปและวิดีโอหลายไฟล์ไว้ด้วยกัน แล้วมัดรวมเป็น **.zip ไฟล์เดียว** | ดึงไฟล์ครบทุกชิ้นในอัลบั้ม ตัดไฟล์ซ้ำ (Deduplicate) อัตโนมัติ |
| **Native Direct Download** | 📥 | สตรีมดาวน์โหลดตรงผ่าน Telegram Download Manager เดิมของระบบ | สปีดเต็มที่ ไม่ผ่านเซิร์ฟเวอร์ภายนอก ไม่เปลืองแรม |
| **Deep Harvester** | ⚡ | ระบบเลื่อนประวัติแชทขึ้นไปกวาด Index สื่อเก่าๆ ทั้งหมดมาเตรียมไว้ | ทะลุข้อจำกัด Virtual DOM ของ Telegram กวาดได้หลักพันข้อความ |
| **Workspace & Library** | 🔖 | บุ๊กมาร์กข้อความสำคัญ เก็บพิกัดข้อความ พร้อมติดแท็กและโน้ตส่วนตัว | ค้นหาด้วยแท็ก (`tag:important`) หรือประเภทสื่อ แล้วคลิกกระโดดกลับไปที่แชทได้ทันที |
| **Smart Naming & Captions** | 📝 | ตั้งชื่อไฟล์อัตโนมัติ `[YYYY-MM-DD]_[Chat]_[Sender]_[ID]` และเซฟแคปชัน `.txt` | ไฟล์ไม่ชนกัน รู้ที่มาของไฟล์ชัดเจน แคปชันไม่หาย |
| **MediaViewer Overlay** | 👁️ | เพิ่มปุ่มเซฟและบุ๊กมาร์กบนหน้าจอพรีวิวรูป/วิดีโอ/สตอรี่แบบเต็มจอ | เซฟสื่อตรงหน้าที่กำลังเปิดดูได้ทันทีในคลิกเดียว |
| **Deduplication Vault** | 🗄️ | จดจำประวัติการดาวน์โหลดลง IndexedDB ภายในเครื่อง | ป้องกันการกดดาวน์โหลดไฟล์เดิมซ้ำ ช่วยประหยัดพื้นที่ดิสก์ |

---

## 🎯 Quick Workflow (วิธีใช้งานง่ายๆ 3 สเต็ป)

### 1. กรองดูสื่อที่ต้องการ
คลิกปุ่มตัวกรองที่ต้องการบนแถบเครื่องมือ เช่น **Photos** หรือ **Videos** 
- ข้อความที่ไม่เกี่ยวข้องจะถูกซ่อนทันที
- ตัวเลขบนปุ่มจะแสดงจำนวนสื่อที่มีอยู่ในแชทปัจจุบัน
- ดับเบิ้ลคลิกที่ปุ่มตัวกรองเพื่อสั่งโหลดสื่อประเภทนั้นทั้งหมดในรอบเดียว

### 2. ดาวน์โหลดเดี่ยว หรือ มัดรวม ZIP
- **โหมดปกติ:** เลือกข้อความในแชทแล้วคลิกปุ่ม `Download`
- **โหมดรวมไฟล์ ZIP:** คลิกที่หัวลูกศร `▾` ด้านข้างปุ่ม แล้วเลือก `Bundle as ZIP` ปุ่มจะเปลี่ยนเป็น `ZIP Download` ทันที เมื่อกดดาวน์โหลด สื่อทั้งหมดในอัลบั้มจะถูกรวมเป็นก้อน .zip ก้อนเดียว

### 3. เปิดดูคลังหรือเครื่องมือขั้นสูง
- คลิก **`Library`** เพื่อเปิดสมุดบุ๊กมาร์ก ค้นหาโพสต์เก่า หรือกระโดดกลับไปยังตำแหน่งข้อความนั้นๆ ใน Telegram
- คลิก **`…`** เพื่อเปิด Deep Harvester สแกนย้อนประวัติแชท หรือเข้าสู่การตั้งค่าระบบ (Settings)

---

## 🛠️ Design & Architecture

| มาตรฐาน | รายละเอียด |
| :--- | :--- |
| **Zero Dependencies** | รหัส Vanilla JavaScript แท้ 100% ไม่มี jQuery, React หรือไลบรารีภายนอก |
| **Solid Neutral Surface** | คุมโทนสี Dark Slate สไตล์ Desktop Native เรียบหรู สบายตา ไร้แสงนีออนฟุ้ง |
| **Uniform Baseline** | ล็อกความสูงทุกปุ่มเท่ากันที่ 28px และแถบควบคุมบางเฉียบเพียง 34px |
| **Floating Popovers** | เมนูย่อยลอยอิสระ ไม่ดันหน้าจอ ไม่ทำลาย Layout แชท |
| **Client-Side Security** | รวม ZIP และบันทึกประวัติบนหน่วยความจำเบราว์เซอร์ ไม่ส่งข้อมูลออกภายนอก |

---

## 🚀 Installation (วิธีติดตั้ง)

1. ติดตั้งส่วนขยาย [Tampermonkey](https://www.tampermonkey.net/) บนเบราว์เซอร์ (Brave / Chrome / Edge)
2. คัดลอกโค้ดทั้งหมดจากไฟล์ [`telefilter_desktop.user.js`](telefilter_desktop.user.js)
3. ไปที่ Tampermonkey Dashboard → กดปุ่ม **+** (สร้าง Userscript ใหม่) → วางโค้ดแล้วกด **Ctrl + S** เพื่อบันทึก
4. เปิดหรือรีเฟรชหน้า [Telegram WebK](https://web.telegram.org/k/) เข้าห้องแชท แถบเครื่องมือจะปรากฏพร้อมใช้งานทันที

---

## 🧪 Verification & Health Checks

รันชุดทดสอบความถูกต้องและสเปกเลย์เอาต์ทั้งหมดได้ด้วย Node.js (Built-in test runner):

```bash
# 1. ตรวจสอบ語法ไวยากรณ์สคริปต์
node --check telefilter_desktop.user.js

# 2. ทดสอบระบบ ZIP, การแตกอัลบั้ม และกลไกดาวน์โหลด (15 ผ่าน 15)
node --test telefilter_desktop.regression.test.js

# 3. ตรวจสอบความถูกต้องของ UI และปุ่มกดบนเบราว์เซอร์เสมือน
node telefilter_desktop.ui.check.cjs

# 4. ทดสอบความสมบูรณ์ของเลย์เอาต์บน Telegram WebK Flexbox
node telefilter_desktop.webk_layout.test.cjs
```

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more details.

---

<div align="center">

**Telefilter Desktop** <sub>v5.0.0</sub> · Built for P Choke · Maintained with MIKA & the team  
*Clean Minimal Precision · High Taste · Zero Slop*

</div>
