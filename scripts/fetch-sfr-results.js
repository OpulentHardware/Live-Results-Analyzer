import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { parseSfrLiveText } from '../assets/parser.js';

const SOURCE_URL = process.env.SFR_SOURCE_URL || 'https://live.sfrautox.com/#N';
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const JSON_PATH = path.join(DATA_DIR, 'current-event.json');
const TEXT_PATH = path.join(DATA_DIR, 'source-text.txt');

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1800 } });

  console.log(`Opening ${SOURCE_URL}`);
  await page.goto(SOURCE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3500);

  const visibleText = await page.locator('body').innerText({ timeout: 30000 });
  await browser.close();

  if (!visibleText || visibleText.length < 100) {
    throw new Error('Visible source text was empty or too short. The live page may not have loaded results.');
  }

  const parsed = parseSfrLiveText(visibleText, {
    sourceUrl: SOURCE_URL,
    updatedAt: new Date().toISOString()
  });

  await fs.writeFile(TEXT_PATH, visibleText, 'utf8');
  await fs.writeFile(JSON_PATH, JSON.stringify(parsed, null, 2), 'utf8');

  const classCount = Object.keys(parsed.classes || {}).length;
  console.log(`Wrote ${JSON_PATH}`);
  console.log(`Parsed ${parsed.overall.length} overall, ${parsed.pax.length} PAX, ${classCount} class groups.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
