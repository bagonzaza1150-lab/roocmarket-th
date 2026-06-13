/**
 * Icon Manager Fix - แก้ไขปัญหาการแสดงผลไอคอนแบบ Dynamic
 * ให้ใช้ร่วมกับ admin.html และ supabase-config.js
 */

(function() {
  // รอให้ supabase-config.js โหลดเสร็จ
  function waitForSupabase(callback, attempts = 0) {
    if (typeof getSupabaseClient === 'function') {
      callback();
    } else if (attempts < 50) {
      setTimeout(() => waitForSupabase(callback, attempts + 1), 100);
    }
  }

  waitForSupabase(() => {
    const supabaseClient = getSupabaseClient();
    if (!supabaseClient) return;

    // Mapping ของ icon types กับ preview IDs
    const iconPreviewMap = {
      'site-logo': 'preview-site-logo',
      'cat-mvp': 'preview-cat-mvp',
      'cat-acc': 'preview-cat-acc',
      'cat-fashion': 'preview-cat-fashion',
      'dash-sell': 'preview-dash-sell',
      'dash-buy': 'preview-dash-buy',
      'dash-service': 'preview-dash-service',
      'dash-account': 'preview-dash-account'
    };

    // ฟังก์ชันโหลดไอคอนปัจจุบันจากฐานข้อมูล
    async function loadCurrentIconsForAdmin() {
      try {
        const iconTypes = Object.keys(iconPreviewMap);
        const keys = iconTypes.map(t => `icon_${t}`);

        const { data, error } = await supabaseClient
          .from('marketplace_settings')
          .select('key, value')
          .in('key', keys);

        if (error) {
          console.warn('Icon Manager: Error loading icons -', error.message);
          return;
        }

        if (!data || data.length === 0) {
          console.log('Icon Manager: No custom icons found in database');
          return;
        }

        console.log('Icon Manager: Loaded', data.length, 'icons from database');

        // อัปเดต Preview ของแต่ละไอคอน
        data.forEach(row => {
          const iconType = row.key.replace('icon_', '');
          const previewId = iconPreviewMap[iconType];

          if (previewId) {
            const previewEl = document.getElementById(previewId);
            if (previewEl) {
              if (previewEl.tagName === 'IMG') {
                previewEl.src = row.value;
                console.log(`Icon Manager: Updated preview for ${iconType}`);
              } else if (previewEl.tagName === 'DIV') {
                // สำหรับ Dashboard Icons ที่เป็น SVG container
                previewEl.innerHTML = `<img src="${row.value}" style="max-width: 24px; max-height: 24px;" />`;
                console.log(`Icon Manager: Updated SVG preview for ${iconType}`);
              }
            } else {
              console.warn(`Icon Manager: Preview element not found for ${iconType} (ID: ${previewId})`);
            }
          }
        });
      } catch (err) {
        console.error('Icon Manager: Failed to load icons -', err);
      }
    }

    // โหลดไอคอนเมื่อหน้า Admin โหลดเสร็จ
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(loadCurrentIconsForAdmin, 500);
      });
    } else {
      setTimeout(loadCurrentIconsForAdmin, 500);
    }

    // Export ฟังก์ชันเพื่อให้ admin.html เรียกใช้หลังบันทึก
    window.loadCurrentIconsForAdmin = loadCurrentIconsForAdmin;
  });
})();
