import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const SCREENSHOTS_DIR = '/root/LojistikGirisimleri/doculog/screenshots';
const ARTIFACT_DIR = '/root/.gemini/antigravity-cli/brain/ac3e7dc0-bea8-48c8-b4d0-b055d735e26c';

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

async function captureScreenshots() {
  console.log('--- Puppeteer Ekran Görüntüsü Alma Başlatıldı ---');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  // 1. MASAÜSTÜ GENEL GÖRÜNÜM (1920x1080)
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:8000', { waitUntil: 'networkidle2' });
  await page.waitForSelector('main', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 1200));

  const desktopGeneral = path.join(SCREENSHOTS_DIR, '01_desktop_workstation.png');
  await page.screenshot({ path: desktopGeneral });
  console.log('[OK] 01_desktop_workstation.png');

  // 2. İRSALİYE SEÇİLİ GÖRÜNÜM (Hayat Kimya irsaliyesi)
  // Kuyruktaki ilk irsaliye kartına tıkla
  try {
    const irsaliyeItem = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[data-testid^="queue-item-"], div'));
      const found = items.find(el => el.textContent && el.textContent.includes('HYT2024000049182'));
      if (found) {
        found.click();
        return true;
      }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    const desktopInvoice = path.join(SCREENSHOTS_DIR, '02_desktop_invoice_verified.png');
    await page.screenshot({ path: desktopInvoice });
    console.log('[OK] 02_desktop_invoice_verified.png');
  } catch (e) {
    console.error('İrsaliye kartına tıklanamadı:', e.message);
  }

  // 3. İRSALİYE DIŞI NESNE (TELEFON) SEÇİLİ GÖRÜNÜM (UYARI KARTI)
  try {
    const phoneItem = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div, span, button'));
      const found = items.find(el => el.textContent && (el.textContent.includes('test_phone') || el.textContent.includes('telefon')));
      if (found) {
        found.click();
        return true;
      }
      return false;
    });
    await new Promise(r => setTimeout(r, 1000));
    const desktopNonInvoice = path.join(SCREENSHOTS_DIR, '03_desktop_non_invoice_warning.png');
    await page.screenshot({ path: desktopNonInvoice });
    console.log('[OK] 03_desktop_non_invoice_warning.png');
  } catch (e) {
    console.error('Telefon kartına tıklanamadı:', e.message);
  }

  // 4. MOBİL GÖRÜNÜM (390x844 - iPhone 14 Pro)
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mobilePage.goto('http://127.0.0.1:8000', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1200));

  const mobileScreen = path.join(SCREENSHOTS_DIR, '04_mobile_station.png');
  await mobilePage.screenshot({ path: mobileScreen });
  console.log('[OK] 04_mobile_station.png');

  await browser.close();

  // Artifact klasörüne de kopyala (kullanıcıya görsel sunabilmek için)
  for (const f of fs.readdirSync(SCREENSHOTS_DIR)) {
    if (f.endsWith('.png')) {
      fs.copyFileSync(path.join(SCREENSHOTS_DIR, f), path.join(ARTIFACT_DIR, f));
      console.log(`[KOPYALANDI] Artifact dizinine: ${f}`);
    }
  }

  console.log('=== TÜM EKRAN GÖRÜNTÜLERİ ALINDI ===');
}

captureScreenshots().catch(console.error);
