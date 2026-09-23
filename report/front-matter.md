<div class="cover">

<img class="emblem" src="figures/mfu-emblem.png" alt="Mae Fah Luang University emblem">

<p class="cover-title-th">MedCode AI ระบบผู้ช่วยให้รหัสโรคและหัตถการด้วยปัญญาประดิษฐ์</p>

<p class="cover-title-en">(MedCode AI: AI-Assisted ICD-10 and ICD-9 Coding System)</p>

<p class="cover-names">Guntidamas Sangsawat<br>Aung Kyaw Si<br>Zwe Thura Aung<br>Phyo Wai Yan Lin Zaw<br>Xin Li</p>

<p class="cover-school">School of Applied Digital Technology</p>

<p class="cover-univ">MAE FAH LUANG UNIVERSITY<br>2026<br>© COPYRIGHT BY MAE FAH LUANG UNIVERSITY</p>

</div>

<div class="abstract-page">

<p class="abs-title-th">MedCode AI ระบบผู้ช่วยให้รหัสโรคและหัตถการด้วยปัญญาประดิษฐ์</p>

<p class="abs-title-en">(MedCode AI: AI-Assisted ICD-10 and ICD-9 Coding System)</p>

<p class="abs-names">Guntidamas Sangsawat, Aung Kyaw Si, Zwe Thura Aung, Phyo Wai Yan Lin Zaw, Xin Li</p>

<p class="abs-heading">บทคัดย่อ</p>

<p class="abs-body th">โครงงานนี้พัฒนา MedCode AI ระบบเว็บที่ช่วยเจ้าหน้าที่ให้รหัสโรคของโรงพยาบาลในการกำหนดรหัสการวินิจฉัย ICD-10 และรหัสหัตถการ ICD-9 ให้กับการมารับบริการของผู้ป่วยนอก ระบบดึงข้อมูลการมารับบริการจากระบบสารสนเทศโรงพยาบาล (iMed) มารวมเป็นรายการงานเดียว เสนอรหัสที่ค้นคืนจากคู่มือ ICD ที่อัปโหลดไว้พร้อมแสดงแหล่งที่มา และบันทึกรหัสที่ผู้ให้รหัสอนุมัติกลับลงระบบของโรงพยาบาล การออกแบบให้ผู้ให้รหัสเป็นผู้ตัดสินใจเสมอ การขอคำแนะนำไม่บันทึกข้อมูลใด ไม่มีรหัสที่ AI แนะนำถูกเลือกไว้ล่วงหน้า การอนุมัติทุกครั้งบันทึกบัญชีผู้อนุมัติ และการบันทึกกลับแบบเปรียบเทียบส่วนต่างพร้อมบันทึกประวัติทำให้ย้อนกลับการอนุมัติได้ การค้นคืนและการสร้างข้อความทำงานบนโมเดลภายในเครื่อง จึงไม่ส่งข้อมูลผู้ป่วยไปยังบริการ AI บนคลาวด์ ระบบประกอบด้วย 5 บริการที่รันเป็นคอนเทนเนอร์ ทดสอบกับระบบจำลอง API ของโรงพยาบาลที่ตรงตามสัญญาเชื่อมต่อ และใช้ข้อมูลสมมุติเท่านั้น การประเมินที่ระดับ TRL 4 พบว่าการทดสอบอัตโนมัติผ่าน 191 จาก 192 รายการ ไม่มีคำขอที่ล้มเหลวเมื่อมีผู้ใช้พร้อมกันสูงสุด 50 ราย แต่ความแม่นยำของ AI ยังต่ำ ใน 42 กรณีสมมุติ รหัส ICD-10 ที่ถูกต้องอยู่อันดับแรก 0 กรณี และอยู่ในรายการคำแนะนำ 3 กรณี เพราะการค้นคืนจากคำบรรยายอาการไปตกที่ส่วนดัชนีของคู่มือ แม้การค้นหาด้วยรหัสจะทำงานได้ถูกต้อง ระบบยังไม่ได้ทดสอบกับผู้ป่วยจริง ผู้ให้รหัสจริง หรือ API จริงของโรงพยาบาล และงานด้านการปฏิบัติตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคลยังต้องดำเนินการต่อ</p>

<p class="abs-keywords th"><strong>คำสำคัญ:</strong> การให้รหัสโรค, ICD-10-TM, ICD-9-CM, การสร้างข้อความเสริมด้วยการค้นคืน (RAG), มนุษย์ร่วมตัดสินใจ, การเชื่อมต่อระบบสารสนเทศโรงพยาบาล, PDPA</p>

<p class="abs-heading">Abstract</p>

<p class="abs-body">This project developed MedCode AI, a web system that helps hospital medical coders assign ICD-10 diagnosis codes and ICD-9 procedure codes to outpatient visits. It pulls visits from the hospital information system (iMed) into one worklist, suggests codes retrieved from the uploaded ICD manuals with their source shown, and writes the codes a coder approves back into the hospital's own records. The coder stays the decision maker: asking for suggestions writes nothing, no suggested code is pre-selected, every approval is attributed to the signed-in account, and a diff-based, journaled write-back makes every approval reversible. Retrieval and generation run on local models, so no patient data is sent to a cloud AI service. The five services run as containers against a contract-faithful mock of the hospital API, on synthetic data only. Evaluation at TRL 4 found 191 of 192 automated tests passing and zero failed requests at up to 50 concurrent clients, but a weak AI baseline: on 42 synthetic scenarios the correct ICD-10 code ranked first in none and appeared among the suggestions in three, because retrieval from symptom narratives lands on index-like pages of the manual even though lookup by code works. The system has not been tested with real patients, real coders or the real hospital API, and PDPA compliance work remains outstanding.</p>

<p class="abs-keywords"><strong>Keywords:</strong> medical coding, ICD-10-TM, ICD-9-CM, retrieval-augmented generation, human-in-the-loop, hospital information system integration, PDPA</p>

</div>
