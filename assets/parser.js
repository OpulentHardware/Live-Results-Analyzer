function cleanLine(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  const num = Number(String(value || '').replace(/,/g, '').trim());
  return Number.isFinite(num) ? num : null;
}

function isTime(value) {
  const num = toNumber(value);
  return num !== null && num >= 20 && num <= 120;
}

function formatTime(value) {
  const num = toNumber(value);
  return isTime(num) ? Number(num.toFixed(3)) : null;
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

  // Matches:
  // 1 Tom Exley P-XP #25 58.287
  // 15 Arvind Govindaraj ST1-AST #1 62.356
  const match = cleaned.match(
    /^(\d+)\s+(.+?)\s+([A-Z0-9]+(?:-[A-Z0-9]+)?)\s+(#[A-Za-z0-9]+)\s+(\d+(?:\.\d+)?)$/
  );

  if (!match) return null;

  const rank = Number(match[1]);
  const driver = match[2].trim();
  const cls = match[3].trim();
  const number = match[4].trim();
  const time = formatTime(match[5]);

  if (!time) return null;

  return {
    rank,
    position: rank,
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

    if (/^\[\[OVERALL_VIEW\]\]$/i.test(cleaned)) {
      section = '';
      continue;
    }

    if (/^\[\[PAX_VIEW\]\]$/i.test(cleaned)) {
      section = '';
      continue;
    }

    if (/^\[\[CLASS_VIEW\]\]$/i.test(cleaned)) {
      section = '';
      continue;
    }

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
    if (/^Participants:/i.test(cleaned)) continue;
    if (/^Date:/i.test(cleaned)) continue;
    if (/Live Results/i.test(cleaned)) continue;

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

const KNOWN_CLASSES = new Set([
  'AS', 'BS', 'CS', 'DS', 'ES', 'FS', 'GS', 'HS',
  'SS', 'SST',
  'AST', 'BST', 'CST', 'DST',
  'ST1', 'ST2', 'STL', 'STR', 'STS', 'STX', 'STU', 'STH',
  'CAM', 'CAMC', 'CAMS', 'CAMT',
  'EVX',
  'XA', 'XB', 'XS',
  'M', 'P',
  'SM', 'SMF', 'SSM',
  'SP', 'SPL',
  'S1', 'S2', 'S3', 'S4',
  'N', 'NS'
]);

function looksLikeClassHeader(line) {
  const cleaned = cleanLine(line).toUpperCase();
  return KNOWN_CLASSES.has(cleaned);
}

function isHeaderOrNoise(line) {
  const cleaned = cleanLine(line);

  return (
    !cleaned ||
    /^Participants:/i.test(cleaned) ||
    /^Date:/i.test(cleaned) ||
    /Live Results/i.test(cleaned) ||
    /^Overall Class PAX$/i.test(cleaned) ||
    /^Overall$/i.test(cleaned) ||
    /^PAX$/i.test(cleaned) ||
    /^Class$/i.test(cleaned) ||
    /^SELECT CLASS/i.test(cleaned) ||
    /^(Rank|Pos|Position)\s+Driver/i.test(cleaned) ||
    /^\[\[.+\]\]$/.test(cleaned)
  );
}

function parseRunToken(token) {
  const cleaned = cleanLine(token);

  if (!cleaned) return null;

  if (/^(DNF|DNS|RRN|OFF|DSQ)$/i.test(cleaned)) {
    return cleaned.toUpperCase();
  }

  // Times with penalties:
  // 63.855+1
  // 63.855 +1
  // 63.855+2
  if (/^\d{2,3}\.\d{3}\+?\d*$/i.test(cleaned)) {
    return cleaned;
  }

  if (/^\+\d+$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

function splitDriverNumberCar(leftText) {
  const cleaned = cleanLine(leftText);

  // Typical left side:
  // Shelly Monfort #196 2018 Porsche Cayman GTS 2.5
  // Michael Scott #2 2023 Tesla Model 3
  const numberMatch = cleaned.match(/^(.*?)\s+(#[A-Za-z0-9]+)\s+(.+)$/);

  if (numberMatch) {
    return {
      driver: numberMatch[1].trim(),
      number: numberMatch[2].trim(),
      car: numberMatch[3].trim()
    };
  }

  return {
    driver: cleaned,
    number: '',
    car: ''
  };
}

function parseClassRow(line, currentClass) {
  const cleaned = cleanLine(line);
  if (!cleaned || !currentClass) return null;

  const tokens = cleaned.split(' ');
  if (!tokens.length) return null;

  const positionToken = tokens.shift();
  const position = Number(positionToken);

  if (!Number.isInteger(position) || position < 1 || position > 999) {
    return null;
  }

  // We parse from the right side because car names often contain misleading numbers:
  // "Porsche Cayman GTS 2.5"
  // "Tesla Model 3"
  // "2004 Chevrolet"
  //
  // The timing values are near the end of the line.
  const runTokens = [];
  const timingTokens = [];

  while (tokens.length) {
    const last = tokens[tokens.length - 1];

    if (parseRunToken(last)) {
      runTokens.unshift(tokens.pop());
      continue;
    }

    if (isTime(last)) {
      timingTokens.unshift(tokens.pop());
      continue;
    }

    break;
  }

  // We need at least Best Raw and Best PAX.
  // Some source layouts may include only those two times.
  if (timingTokens.length < 2) {
    return null;
  }

  const bestRaw = formatTime(timingTokens[0]);
  const bestPax = formatTime(timingTokens[1]);

  if (!bestRaw || !bestPax) {
    return null;
  }

  const leftText = tokens.join(' ');
  const { driver, number, car } = splitDriverNumberCar(leftText);

  if (!driver) return null;

  return {
    position,
    rank: position,
    driver,
    class: currentClass,
    cls: currentClass,
    number,
    car,
    classNumber: number ? `${currentClass} ${number}` : currentClass,
    bestRaw,
    bestPax,
    rawTime: bestRaw,
    indexedTime: bestPax,
    time: bestRaw,
    runs: runTokens
  };
}

function parseClasses(lines) {
  const classes = {};
  let currentClass = '';
  let inClassArea = false;

  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (!cleaned) continue;

    if (/^\[\[CLASS_VIEW\]\]$/i.test(cleaned)) {
      inClassArea = true;
      currentClass = '';
      continue;
    }

    if (/^SELECT CLASS/i.test(cleaned)) {
      inClassArea = true;
      currentClass = '';
      continue;
    }

    if (!inClassArea) continue;

    if (isHeaderOrNoise(cleaned)) continue;

    if (looksLikeClassHeader(cleaned)) {
      currentClass = cleaned.toUpperCase();
      if (!classes[currentClass]) classes[currentClass] = [];
      continue;
    }

    if (!currentClass) continue;

    const row = parseClassRow(cleaned, currentClass);
    if (row) {
      classes[currentClass].push(row);
    }
  }

  Object.keys(classes).forEach(cls => {
    if (!classes[cls].length) {
      delete classes[cls];
    } else {
      classes[cls].sort((a, b) => a.position - b.position);
    }
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
      classGroups: Object.keys(classes).length,
      classRows: Object.fromEntries(
        Object.entries(classes).map(([cls, rows]) => [cls, rows.length])
      )
    }
  };
}

export default parseSfrLiveText;
