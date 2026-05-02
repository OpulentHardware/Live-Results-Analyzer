function cleanLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  const num = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function parseMeta(lines) {
  const participantsLine = lines.find(line => /^Participants:/i.test(line));
  const dateLine = lines.find(line => /^Date:/i.test(line));
  const titleLine = lines.find(line => /Live Results/i.test(line));

  return {
    title: titleLine || 'SFR Live Results',
    date: dateLine ? dateLine.replace(/^Date:\s*/i, '').trim() : '',
    participants: participantsLine ? toNumber(participantsLine.replace(/^Participants:\s*/i, '')) : null
  };
}

function parseRankingRow(line, mode = 'overall') {
  const cleaned = cleanLine(line);

  // Matches rows like:
  // 1 Tom Exley P-XP #25 58.287
  // 15 Arvind Govindaraj ST1-AST #1 62.356
  const match = cleaned.match(/^(\d+)\s+(.+?)\s+([A-Z0-9]+(?:-[A-Z0-9]+)?)\s+(#[A-Za-z0-9]+)\s+(\d+(?:\.\d+)?)$/);

  if (!match) return null;

  const rank = Number(match[1]);
  const driver = match[2].trim();
  const cls = match[3].trim();
  const number = match[4].trim();
  const time = Number(match[5]);

  return {
    rank,
    driver,
    class: cls,
    cls,
    number,
    classNumber: `${cls} ${number}`,
    time,
    rawTime: mode === 'overall' ? time : null,
    indexedTime: mode === 'pax' ? time : null
  };
}

function parseOverallAndPax(lines) {
  const overall = [];
  const pax = [];

  let section = '';

  for (const line of lines) {
    const cleaned = cleanLine(line);

    if (!cleaned) continue;

    if (/^Overall$/i.test(cleaned)) {
      section = 'overall';
      continue;
    }

    if (/^PAX$/i.test(cleaned)) {
      section = 'pax';
      continue;
    }

    if (/^Class$/i.test(cleaned) || /^SELECT CLASS/i.test(cleaned)) {
      section = '';
      continue;
    }

    if (/^Rank Driver/i.test(cleaned)) continue;
    if (/^Overall Class PAX$/i.test(cleaned)) continue;

    if (section === 'overall') {
      const row = parseRankingRow(cleaned, 'overall');
      if (row) overall.push(row);
    }

    if (section === 'pax') {
      const row = parseRankingRow(cleaned, 'pax');
      if (row) pax.push(row);
    }
  }

  return { overall, pax };
}

function looksLikeClassHeader(line) {
  const cleaned = cleanLine(line);
  return /^[A-Z0-9]{1,4}$/.test(cleaned) || /^(AS|BS|CS|DS|ES|FS|GS|HS|S1|S2|S3|S4|ST1|ST2|STL|CST|DST|AST|BST|CAMC|CAMS|CAMT|EVX|XA|XB|XS|M|P|SS|SP|SM|SPL)$/i.test(cleaned);
}

function parseClassRow(line, currentClass) {
  const cleaned = cleanLine(line);

  // Very loose fallback for class detail rows.
  // Expected source can vary, so this captures:
  // position, driver, best raw, best pax, and leaves middle text as car/runs candidate.
  const match = cleaned.match(/^(\d+)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s+(.+))?$/);
  if (!match) return null;

  return {
    position: Number(match[1]),
    rank: Number(match[1]),
    driver: match[2].trim(),
    class: currentClass,
    cls: currentClass,
    car: '',
    bestRaw: Number(match[3]),
    bestPax: Number(match[4]),
    runs: match[5] ? match[5].trim().split(/\s+/) : []
  };
}

function parseClasses(lines) {
  const classes = {};
  let currentClass = '';
  let inClassArea = false;

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;

    if (/^SELECT CLASS/i.test(cleaned)) {
      inClassArea = true;
      continue;
    }

    if (!inClassArea) continue;

    if (looksLikeClassHeader(cleaned)) {
      currentClass = cleaned.toUpperCase();
      if (!classes[currentClass]) classes[currentClass] = [];
      continue;
    }

    if (/^(Pos|Position|Rank)\s+Driver/i.test(cleaned)) continue;
    if (!currentClass) continue;

    const row = parseClassRow(cleaned, currentClass);
    if (row) classes[currentClass].push(row);
  }

  Object.keys(classes).forEach(cls => {
    if (!classes[cls].length) delete classes[cls];
  });

  return classes;
}

export function parseSfrLiveText(sourceText, options = {}) {
  const lines = String(sourceText || '')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const meta = parseMeta(lines);
  const { overall, pax } = parseOverallAndPax(lines);
  const classes = parseClasses(lines);

  return {
    status: 'ok',
    sourceUrl: options.sourceUrl || 'https://live.sfrautox.com/#N',
    updatedAt: options.updatedAt || new Date().toISOString(),
    event: meta,
    meta,
    title: meta.title,
    date: meta.date,
    participants: meta.participants,
    overall,
    pax,
    classes,
    diagnostics: {
      sourceLineCount: lines.length,
      overallRows: overall.length,
      paxRows: pax.length,
      classGroups: Object.keys(classes).length
    }
  };
}

export default parseSfrLiveText;
