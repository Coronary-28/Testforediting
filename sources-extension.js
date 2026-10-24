(function() {
    'use strict';

    // ==========================================
    // 1. قاعدة البيانات (عدّل هذا القسم: أضف موادك ومصادرها)
    //    لكل مادة انسخ الكتلة التالية داخل القوسين [ ] وعدّل البيانات:
    //    {
    //        subject: "اسم المادة",
    //        details: "تفاصيل المراجع (تظهر في عمود المراجع)",
    //        link: "https://رابط-المصدر"
    //    }
    // ==========================================
    const driveSources = [
        {
            subject: "Radiology",
            details: "<b>Mini-OSCE:</b> ( Serotonin / Waman A7yaha / Vagus / Aorta / Endorphin / Iris / Coronary )<br><b>Final:</b> ( Serotonin / Waman A7yaha / Overdose / Vagus / Aorta / Endorphin / Iris )",
            link: "https://drive.google.com/drive/folders/18wQI6EXhwvzSDkkoAunrWEBlMgHKP1HA"
        },
        {
            subject: "Emergency",
            details: "<b>Mini-OSCE:</b> ( Serotonin / Waman A7yaha / Vagus / Aorta / Endorphin / Iris / Coronary )<br><b>Final:</b> ( Serotonin / Waman A7yaha / Overdose / Vagus / Aorta / Endorphin / Iris )",
            link: "https://drive.google.com/drive/folders/14BE9zkF3Xt-u-IglYe2NbxTvZxsK7xeM"
        },
        {
            subject: "Forensic",
            details: "<b>Mini-OSCE:</b> ( Serotonin / Waman A7yaha / Vagus / Aorta / Endorphin / Iris / Coronary )<br><b>Final:</b> ( Serotonin / Waman A7yaha / Overdose / Vagus / Aorta / Endorphin / Iris )",
            link: "https://drive.google.com/drive/folders/1OCvt0iH9hYmIAjONxgNceyy1V2f1EmNC"
        }
    ];

    // ==========================================
    // 2. حقن أكواد التصميم (CSS) ديناميكياً
    // ==========================================
    const style = document.createElement('style');
    style.textContent = `
        .sources-trigger-btn {
            display: inline-block;
            margin: 5px auto 15px auto;
            color: var(--primary-color, #f97316);
            cursor: pointer;
            text-decoration: underline;
            font-weight: 600;
            font-size: 1rem;
            transition: color 0.2s;
        }
        .sources-trigger-btn:hover {
            color: #ea580c;
        }
        .sources-modal-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7);
            z-index: 9999;
            display: none;
            justify-content: center;
            align-items: center;
        }
        .sources-modal-overlay.active {
            display: flex;
        }
        /* تثبيت ألوان النافذة المنبثقة: أبيض وأسود دائماً */
        .sources-modal-card {
            background: #ffffff !important;
            color: #000000 !important;
            width: 95%;
            max-width: 800px;
            border-radius: 12px;
            padding: 20px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 10px 25px rgba(0,0,0,0.2);
            direction: rtl; /* اتجاه عربي */
            text-align: right;
        }
        .sources-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #eeeeee;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        .sources-modal-close {
            background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #000000 !important; font-weight: bold;
        }
        /* تصميم الجدول */
        .sources-table-container {
            overflow-x: auto; /* للسماح بالتمرير في الهواتف */
            margin-bottom: 20px;
        }
        .sources-table {
            width: 100%;
            border-collapse: collapse;
            min-width: 600px; /* لضمان عدم تداخل الكلمات في الشاشات الصغيرة */
        }
        .sources-table th, .sources-table td {
            border: 1px solid #dddddd;
            padding: 12px;
            text-align: center;
            vertical-align: middle;
        }
        .sources-table th {
            background-color: #f8f9fa;
            font-weight: bold;
            font-size: 1.1rem;
        }
        .sources-table td {
            font-size: 0.95rem;
            line-height: 1.6;
        }
        /* تنسيق عمود المراجع ليكون من اليسار إلى اليمين */
        .sources-table td:nth-child(2) {
            text-align: left;
            direction: ltr;
        }
        .source-file-btn {
            background: #f97316 !important;
            color: #ffffff !important;
            text-decoration: none;
            padding: 8px 15px;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: bold;
            display: inline-block;
            transition: background 0.2s;
        }
        .source-file-btn:hover {
            background: #ea580c !important;
        }
        /* تصميم الملاحظة الحمراء */
        .sources-warning-note {
            color: #dc2626 !important; /* لون أحمر */
            font-size: 0.85rem;
            text-align: center;
            margin-top: 15px;
            font-weight: bold;
            line-height: 1.5;
            background: #fef2f2;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid #fca5a5;
        }
    `;
    document.head.appendChild(style);

    // ==========================================
    // 3. بناء واجهة النافذة المنبثقة (Modal)
    // ==========================================
    function buildModal() {
        const overlay = document.createElement('div');
        overlay.className = 'sources-modal-overlay';
        overlay.id = 'sources-modal';
        
        let tableRows = driveSources.map(item => `
            <tr>
                <td style="font-weight:bold; font-size:1.1rem; color:#1e3a8a;">${item.subject}</td>
                <td>${item.details}</td>
                <td><a href="${item.link}" target="_blank" class="source-file-btn">انتقال للمصادر 🔗</a></td>
            </tr>
        `).join('');

        overlay.innerHTML = `
            <div class="sources-modal-card">
                <div class="sources-modal-header">
                    <h3 style="margin: 0; color: #000;">مصادر الأسئلة</h3>
                    <button class="sources-modal-close" id="close-sources-modal">✕</button>
                </div>
                <div class="sources-modal-body">
                    <div class="sources-table-container">
                        <table class="sources-table">
                            <thead>
                                <tr>
                                    <th style="width: 20%;">اسم المادة</th>
                                    <th style="width: 60%;">المراجع</th>
                                    <th style="width: 20%;">الرابط</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRows}
                            </tbody>
                        </table>
                    </div>
                    <div class="sources-warning-note">
                        قد تحتوي هذه الملفات على أخطاء ، ولذلك تم تنقيحها وتدقيقها ورفعها لهذا الموقع ، إن وجدتم سؤال خاطئ بهذا الموقع الرجاء التواصل مع فريق السنوات دفعة آل التاجي
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // إغلاق النافذة
        document.getElementById('close-sources-modal').onclick = () => overlay.classList.remove('active');
        overlay.onclick = (e) => { if(e.target === overlay) overlay.classList.remove('active'); };
    }

    // ==========================================
    // 4. حقن الزر في الصفحة الرئيسية
    // ==========================================
    function injectTrigger() {
        const bismillahEl = document.querySelector('.bismillah'); 
        if (bismillahEl) {
            const triggerBtn = document.createElement('div');
            triggerBtn.className = 'sources-trigger-btn';
            triggerBtn.textContent = 'اضغط هنا لمعرفة مصادر الأسئلة';
            
            triggerBtn.onclick = () => {
                const modal = document.getElementById('sources-modal');
                if (modal) modal.classList.add('active');
            };

            bismillahEl.insertAdjacentElement('afterend', triggerBtn);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        buildModal();
        injectTrigger();
    });

})();
