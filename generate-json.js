const fs = require('fs');
const path = require('path');

// ========== دوال مطابقة تماماً لتلك الموجودة في script.js ==========
function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}
function hashString(input) {
  let h = 0;
  const s = String(input || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}
function stripOptionPrefix(text) {
  return String(text || '').replace(/^[A-E][\)\.\-]\s*/i, '').trim();
}

function normalizeComparisonText(text) {
  return stripOptionPrefix(String(text || '').replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase()).replace(/\s+/g, ' ').trim();
}

function isPageLine(line) {
  return /^P\s*\(?\s*\d+\s*\)?$/i.test(line) || /^Page\s*\d+$/i.test(line);
}

function isBatchLine(line) {
  return /^Batch\s*:/i.test(line);
}

function isNoteLine(line) {
  return /^Note\s*:/i.test(line);
}

function parseBatchNames(line) {
  return String(line || '').replace(/^Batch\s*:\s*/i, '').split('/').map(s => s.trim()).filter(Boolean);
}

function parseNoteText(line) {
  return String(line || '').replace(/^Note\s*:\s*/i, '').trim();
}

function isMetadataLine(line) {
  return isPageLine(line) || isBatchLine(line) || isNoteLine(line);
}

function normalizeText(text) {
  return String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ').replace(/\/\/\/\/\/\//g, '\n').trim();
}

function resolveCorrectIndex(options, correctAnswer) {
  if (!Array.isArray(options) || !options.length) return -1;
  const m = String(correctAnswer || '').match(/^([A-E])/i);
  if (m) {
    const ix = m[1].toUpperCase().charCodeAt(0) - 65;
    if (ix >= 0 && ix < options.length) return ix;
  }
  const ans = normalizeComparisonText(correctAnswer);
  for (let i = 0; i < options.length; i++) {
    const opt = normalizeComparisonText(options[i]);
    if (opt && (opt === ans || opt.includes(ans) || ans.includes(opt))) return i;
  }
  return -1;
}
function parseQuestionFile(raw, meta) {
  const text = normalizeText(raw);
  if (!text) return [];
  let blocks = text.split(/(?:^|\n)\s*###\s*(?=\n|$)/g).map(x => x.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    const paragraphs = text.split(/\n{2,}/).map(x => x.trim()).filter(Boolean);
    if (paragraphs.length <= 1) blocks = [text];
    else {
      blocks = [];
      let current = [];
      let hasCorrect = false;
      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const first = (p.split('\n').find(l => l.trim()) || '').trim();
        const looksNew = current.length > 0 && hasCorrect && !/^(Correct\s*Answer|Explanation)\s*:/i.test(first) && !/^[A-E][\)\.\-]/.test(first) && !isPageLine(first);
        if (looksNew) {
          blocks.push(current.join('\n\n').trim());
          current = [];
          hasCorrect = false;
        }
        current.push(p);
        if (/^\s*Correct\s*Answer\s*:/im.test(p)) hasCorrect = true;
        if (i === paragraphs.length - 1 && current.length) blocks.push(current.join('\n\n').trim());
      }
    }
  }

  const questions = [];
  let fallback = meta.startCounter || 1;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const lines = blocks[blockIndex].split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length || !lines.some(l => /^Correct\s*Answer\s*:/i.test(l))) continue;
    
    let isMultiple = false;
    const multiIdx = lines.findIndex(l => l === '~Choose the correct answers~');
    if (multiIdx !== -1) {
      isMultiple = true;
      lines.splice(multiIdx, 1);
    }
    
    let questionNumber = '';
    let questionText = '';
    let options = [];
    let correctAnswer = '';
    let correctAnswerLetter = '';
    let explanation = '';
    let batchName = '';
    let batchNames = [];
    let note = '';
    let pageNumber = '';
    let startIndex = 0;
    const head = (lines[0] || '').match(/^Question\s*(\d+)\s*[:\-.]?\s*(.*)$/i);
    if (head) {
      questionNumber = head[1] || '';
      if (head[2]) lines[0] = head[2].trim();
      else startIndex = 1;
    }
    const ansIdx = lines.findIndex(l => /^Correct\s*Answer\s*:/i.test(l));
    if (ansIdx === -1) continue;
    const before = lines.slice(startIndex, ansIdx);
    const firstOpt = before.findIndex(l => /^[A-E][\)\.\-]\s*/i.test(l));
    if (firstOpt === -1) continue;
    questionText = before.slice(0, firstOpt).join(' ').trim() || ('Question ' + fallback);
    options = before.slice(firstOpt).filter(l => /^[A-E][\)\.\-]\s*/i.test(l)).map(stripOptionPrefix);
    correctAnswer = lines[ansIdx].replace(/^Correct\s*Answer\s*:\s*/i, '').trim();
    
    let correctIndex = -1;
    let correctAnswerText = '';
    let correctIndices = [];
    
    if (isMultiple) {
      const parts = correctAnswer.split('/').map(p => p.trim()).filter(Boolean);
      parts.forEach(part => {
        const m = part.match(/^([A-E])/i);
        if (m) {
          const idx = m[1].toUpperCase().charCodeAt(0) - 65;
          if (idx >= 0 && idx < options.length) correctIndices.push(idx);
        }
      });
      correctAnswerText = correctAnswer;
    } else {
      const letterMatch = correctAnswer.match(/^([A-E])\s*[\)\.\-]\s*/i);
      if(letterMatch) correctAnswerLetter = letterMatch[1].toUpperCase();
      if(correctAnswerLetter){
        const letterIndex = correctAnswerLetter.charCodeAt(0) - 65;
        if(letterIndex >= 0 && letterIndex < options.length){
          correctIndex = letterIndex;
          correctAnswerText = options[letterIndex];
        }
      }
      if(correctIndex === -1){
        const possibleIndex = resolveCorrectIndex(options, correctAnswer);
        if(possibleIndex >= 0 && options[possibleIndex]){
          correctIndex = possibleIndex;
          correctAnswerText = options[possibleIndex];
        } else {
          correctAnswerText = stripOptionPrefix(correctAnswer);
          const fallbackIndex = resolveCorrectIndex(options, correctAnswerText);
          if(fallbackIndex >= 0 && options[fallbackIndex]){
            correctIndex = fallbackIndex;
            correctAnswerText = options[fallbackIndex];
          }
        }
      }
    }
    
    let i = ansIdx + 1;
    if (i < lines.length && /^Explanation\s*:/i.test(lines[i])) {
      const exp = [];
      const first = lines[i].replace(/^Explanation\s*:\s*/i, '').trim();
      if (first) exp.push(first);
      i++;
      while (i < lines.length && !isMetadataLine(lines[i])) {
        exp.push(lines[i]);
        i++;
      }
      explanation = exp.join(' ').trim();
    }
        while (i < lines.length) {
      const line = lines[i];
      if (isPageLine(line)) pageNumber = line;
      else if (isBatchLine(line)) { batchNames = batchNames.concat(parseBatchNames(line)); batchName = batchNames.join(' / '); }
      else if (isNoteLine(line)) note = parseNoteText(line);
      else if (!explanation && !/^Explanation\s*:/i.test(line)) explanation = [explanation, line].filter(Boolean).join(' ').trim();
      i++;
    }
    if (!questionNumber) questionNumber = String(fallback);
    
    const id = [slugify(meta.subjectName), slugify(meta.sourceType), slugify(meta.lectureName), slugify(questionNumber), hashString(questionText).slice(0, 10)].join('__');
    questions.push({
      id,
      number: questionNumber,
      text: questionText,
      options,
      originalOptions: options.slice(),
      correctAnswer,
      correctAnswerText,
      correctIndex,
      correctIndices,
      isMultiple,
      correctAnswerLetter,
      explanation,
      batchName,
      batchNames,
      note,
      pageNumber,
      subjectName: meta.subjectName,
      subjectId: meta.subjectId || slugify(meta.subjectName),
      lectureName: meta.lectureName,
      groupName: meta.lectureName,
      sourceType: meta.sourceType,
      sourcePath: meta.sourcePath
    });
    fallback++;
  }
  return questions;
}
function buildGroupFromFile(filePath, subjectName, subjectId, sourceType) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lectureName = path.basename(filePath, '.txt');
  const questions = parseQuestionFile(raw, {
    subjectName,
    subjectId,
    lectureName,
    sourceType,
    startCounter: 1
  });
  if (!questions.length) return null;
  return {
    id: `${slugify(subjectName)}__${sourceType}__${slugify(lectureName)}`,
    name: lectureName,
    type: sourceType,
    subjectName,
    path: filePath,
    questions
  };
}

function scanSubjectFolder(folderPath) {
  const subjectName = path.basename(folderPath);
  const subjectId = slugify(subjectName);
  const lectures = [];
  const ai = [];

  const files = fs.readdirSync(folderPath);
  const txtFiles = files.filter(f => f.endsWith('.txt') && f !== 'AI'); // استبعاد مجلد AI
  for (const file of txtFiles) {
    const group = buildGroupFromFile(path.join(folderPath, file), subjectName, subjectId, 'lecture');
    if (group) lectures.push(group);
  }

  const aiFolder = path.join(folderPath, 'AI');
  if (fs.existsSync(aiFolder) && fs.statSync(aiFolder).isDirectory()) {
    const aiFiles = fs.readdirSync(aiFolder).filter(f => f.endsWith('.txt')).sort();
    for (const file of aiFiles) {
      const group = buildGroupFromFile(path.join(aiFolder, file), subjectName, subjectId, 'ai');
      if (group) ai.push(group);
    }
  }

    const allQuestions = lectures.flatMap(g => g.questions).concat(ai.flatMap(g => g.questions));
  const yearsMap = new Map();
  allQuestions.forEach(q => {
    const list = Array.isArray(q.batchNames) && q.batchNames.length ? q.batchNames.map(s => String(s).trim()).filter(Boolean) : [String(q.batchName || '').trim()].filter(Boolean);
    list.forEach(batch => {
      if (!yearsMap.has(batch)) yearsMap.set(batch, []);
      yearsMap.get(batch).push({ ...q, batchName: batch, sourceType: 'year', originalSourceType: q.sourceType });
    });
  });
  const years = Array.from(yearsMap.entries()).sort((a, b) => a[0].localeCompare(b[0], 'en', { sensitivity: 'base' })).map(([name, questions]) => ({
    id: `${subjectId}__year__${slugify(name)}`,
    name,
    type: 'year',
    subjectName,
    questions
  }));

  return {
    id: subjectId,
    name: subjectName,
    lectures,
    ai,
    years,
    allQuestions,
    totalQuestions: allQuestions.length,
    totalLectures: lectures.length + ai.length + years.length,
    hasAiFolder: fs.existsSync(aiFolder)
  };
}

// ========== التنفيذ الرئيسي ==========
const MATERIALS_DIR = '.';   // يقرأ الجذر مباشرة

if (!fs.existsSync(MATERIALS_DIR)) {
  console.error(`❌ Folder not found: ${MATERIALS_DIR}`);
  process.exit(1);
}
// استبعاد المجلدات غير المرغوبة (النظامية)
const subjectFolders = fs.readdirSync(MATERIALS_DIR).filter(item => {
  const full = path.join(MATERIALS_DIR, item);
  return fs.statSync(full).isDirectory() && !['.git', 'node_modules', '.github', 'scripts', 'audio', 'images', 'subjects', 'assets'].includes(item);
});

const subjects = [];
for (const folder of subjectFolders) {
  console.log(`📖 Processing: ${folder}`);
  const subject = scanSubjectFolder(path.join(MATERIALS_DIR, folder));
  subjects.push(subject);
}

fs.writeFileSync('subjects.json', JSON.stringify(subjects, null, 2));
console.log(`✅ subjects.json generated, subjects count: ${subjects.length}`);
