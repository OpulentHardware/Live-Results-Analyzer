export function parseSfrLiveText(rawText, options = {}) {
  const sourceUrl = options.sourceUrl || 'https://live.sfrautox.com/#N';
  const updatedAt = options.updatedAt || new Date().toISOString();
  const text = String(rawText || '').replace(/\r/g, '').replace(/\u00a0/g, ' ');
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);

  const meta = {
    title: findTitle(lines),
    date: findValueAfter(lines, /^Date$/i),
    participants: findValueAfter(lines, /^Participants$/i),
    sourceUrl,
    updatedAt,
    status: 'ok'
  };

  const overall = parseSimpleRanking(lines, 'Overall', ['PAX', 'Class', 'SELECT CLASS']);
  const pax = parseSimpleRanking(lines, 'PAX', ['Class', 'SELECT CLASS']);
  const classOrder = parseClassOrder(lines);
  const classes = parseClassBlocks(lines, classOrder);

  return { meta, overall, pax, classes, classOrder };
}

function findTitle(lines) {
  const title = lines.find(line => /Live Results/i.test(line));
  return title || 'SFR Solo Day of Event Results';
}

function findValueAfter(lines, labelRegex) {
  const idx = lines.findIndex(line => labelRegex.test(line));
  if (idx >= 0 && lines[idx + 1]) return lines[idx + 1];
  const inline = lines.find(line => labelRegex.test(line));
  if (!inline) return '';
  return inline.replace(labelRegex, '').replace(/^[:\s-]+/, '').trim();
}

function isRank(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function looksLikeTime(value) {
  return /^\d{1,3}\.\d{3}(\s*(\+\d+|DNF|RRN|OC|OFF|DNS))*$/i.test(String(value || '').trim());
}

function parseSimpleRanking(lines, sectionName, endMarkers) {
  const start = lines.findIndex(line => line.toLowerCase() === sectionName.toLowerCase());
  if (start < 0) return [];

  let end = lines.length;
  for (const marker of endMarkers) {
    const idx = lines.findIndex((line, i) => i > start && line.toLowerCase() === marker.toLowerCase());
    if (idx > start && idx < end) end = idx;
  }

  const slice = lines.slice(start + 1, end);
  const firstRank = slice.findIndex(isRank);
  if (firstRank < 0) return [];

  const results = [];
  for (let i = firstRank; i < slice.length;) {
    if (!isRank(slice[i])) { i++; continue; }
    const rank = Number(slice[i]);
    const driver = slice[i + 1] || '';
    const classNumber = slice[i + 2] || '';
    const time = slice[i + 3] || '';

    if (!driver || !classNumber || !time || !looksLikeTime(time)) {
      i++;
      continue;
    }

    results.push({ rank, driver, classNumber, time: cleanTime(time) });
    i += 4;
  }
  return results;
}

function parseClassOrder(lines) {
  const idx = lines.findIndex(line => /^SELECT CLASS$/i.test(line));
  if (idx < 0) return [];
  const knownStop = new Set(['Position', 'Driver', 'Car', 'Best Raw', 'Best Pax', 'Raw Times']);
  const order = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (knownStop.has(line)) break;
    if (/^[A-Z0-9-]{1,8}$/.test(line)) order.push(line);
    if (order.length > 40) break;
  }
  return [...new Set(order)];
}

function parseClassBlocks(lines, classOrder) {
  const classes = {};
  const order = classOrder.length ? classOrder : inferClassNames(lines);

  order.forEach((cls, index) => {
    const start = findClassStart(lines, cls);
    if (start < 0) return;

    let end = lines.length;
    for (let j = index + 1; j < order.length; j++) {
      const next = findClassStart(lines, order[j], start + 1);
      if (next > start) { end = next; break; }
    }

    const rows = parseOneClass(lines.slice(start, end), cls);
    if (rows.length) classes[cls] = rows;
  });

  return classes;
}

function inferClassNames(lines) {
  const names = [];
  for (let i = 0; i < lines.length - 6; i++) {
    if (/^[A-Z0-9-]{1,8}$/.test(lines[i]) && lines[i + 1] === 'Position' && lines[i + 2] === 'Driver') {
      names.push(lines[i]);
    }
  }
  return [...new Set(names)];
}

function findClassStart(lines, cls, fromIndex = 0) {
  for (let i = fromIndex; i < lines.length - 6; i++) {
    if (lines[i] === cls && lines[i + 1] === 'Position' && lines[i + 2] === 'Driver') return i;
  }
  return -1;
}

function parseOneClass(block, cls) {
  const headerEnd = block.findIndex(line => line === 'Raw Times');
  if (headerEnd < 0) return [];

  const rows = [];
  let i = headerEnd + 1;
  while (i < block.length) {
    if (!isRank(block[i])) { i++; continue; }

    const position = Number(block[i]);
    const driver = block[i + 1] || '';
    let cursor = i + 2;

    const carParts = [];
    while (cursor < block.length && !looksLikeTime(block[cursor])) {
      if (isRank(block[cursor]) && carParts.length > 0) break;
      carParts.push(block[cursor]);
      cursor++;
    }

    const bestRaw = block[cursor] || '';
    const bestPax = block[cursor + 1] || '';
    cursor += 2;

    const runs = [];
    while (cursor < block.length && !isRank(block[cursor])) {
      if (looksLikeTime(block[cursor]) || /^(DNF|DNS|RRN|OC|OFF)$/i.test(block[cursor])) {
        runs.push(cleanTime(block[cursor]));
      }
      cursor++;
    }

    if (driver && bestRaw) {
      rows.push({
        position,
        driver,
        className: cls,
        car: carParts.join(' ').trim(),
        bestRaw: cleanTime(bestRaw),
        bestPax: cleanTime(bestPax),
        runs
      });
    }

    i = Math.max(cursor, i + 1);
  }

  return rows;
}

function cleanTime(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
