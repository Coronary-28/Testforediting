/* Local report rendering only: no remote service, uploads, bot credentials or dependencies. */
'use strict';
window.QuestionReportImages = (() => {
  const WIDTH = 1080, PAD = 56, MAX_HEIGHT = 2000, FONT_SIZE = 36, LINE_HEIGHT = 56;
  // The browser shapes Arabic and applies Unicode bidi to each complete line.
  // System fallbacks keep export working when the site's Google fonts are offline.
  const FAMILY = '"Inter", "Amiri", Arial, sans-serif';
  const text = value => value == null ? '' : String(value);
  function direction(value) {
    for (const char of value) {
      if (/\p{Letter}/u.test(char)) return /[\u0590-\u08ff\ufb1d-\ufeff]/u.test(char) ? 'rtl' : 'ltr';
    }
    return 'rtl';
  }
  function graphemes(value) {
    return typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, {granularity:'grapheme'}).segment(value), part => part.segment)
      : Array.from(value);
  }
  function wrap(ctx, value, width, size = FONT_SIZE, bold = false, forcedDirection) {
    ctx.font = `${bold ? '700' : '400'} ${size}px ${FAMILY}`;
    const rows = [];
    for (const paragraph of text(value).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
      const dir = forcedDirection || direction(paragraph);
      ctx.direction = dir;
      if (!paragraph) { rows.push({text:'', dir, size, bold}); continue; }
      let line = '';
      const emit = () => { rows.push({text:line, dir, size, bold}); line = ''; };
      const tokens = typeof Intl.Segmenter === 'function'
        ? Array.from(new Intl.Segmenter(undefined, {granularity:'word'}).segment(paragraph), part => part.segment)
        : (paragraph.match(/\s+|\S+/gu) || []);
      for (const token of tokens) {
        if (ctx.measureText(line + token).width <= width) { line += token; continue; }
        if (line) emit();
        if (ctx.measureText(token).width <= width) { line = token; continue; }
        // Split very long medical terms/URLs without losing code points or diacritics.
        for (const char of graphemes(token)) {
          if (line && ctx.measureText(line + char).width > width) emit();
          line += char;
          if (ctx.measureText(line).width > width) throw new Error('A glyph exceeds the report width');
        }
      }
      if (line) emit();
    }
    return rows;
  }
  function layout(model) {
    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) throw new Error('Canvas unavailable');
    const available = WIDTH - PAD * 2;
    const categories = wrap(measure, 'نوع البلاغ: ' + model.categories.join(' / '), available, 38, true, 'rtl');
    const headerHeight = 138 + categories.length * LINE_HEIGHT;
    const bottom = MAX_HEIGHT - 88;
    const pages = [];
    let page;
    function nextPage() {
      page = {rows:[], used:headerHeight};
      pages.push(page);
    }
    nextPage();
    const sections = [
      {title:'المادة', value:model.subject || 'غير متاحة في بيانات السؤال'},
      {title:'المحاضرة', value:model.lecture || 'غير متاحة في بيانات السؤال'},
      {title:'نَص السؤال', value:model.question},
      ...model.options.map(option => ({title:'الخيار ' + option.label, value:option.value})),
      ...(model.answer ? [{title:'الجواب الصحيح', value:model.answer}] : []),
      ...(model.explanation ? [{title:'التوضيح', value:model.explanation}] : [])
    ];
    for (const section of sections) {
      const rows = wrap(measure, section.value, available);
      // Never orphan a heading at the foot of a page.
      if (page.used + 80 + LINE_HEIGHT > bottom) nextPage();
      const heading = continued => {
        page.rows.push({heading:true, text:section.title + (continued ? ' (تابع)' : ''), y:page.used + 14});
        page.used += 80;
      };
      heading(false);
      for (const row of rows) {
        if (page.used + LINE_HEIGHT > bottom) { nextPage(); heading(true); }
        page.rows.push({...row, y:page.used});
        page.used += LINE_HEIGHT;
      }
      page.used += 18;
    }
    return {pages, categories, headerHeight};
  }
  function drawLine(ctx, row, y, color) {
    ctx.font = `${row.bold ? '700' : '400'} ${row.size || FONT_SIZE}px ${FAMILY}`;
    ctx.direction = row.dir || 'rtl';
    ctx.textAlign = ctx.direction === 'rtl' ? 'right' : 'left';
    // Alphabetic baseline plus generous leading leaves room for Arabic marks/descenders.
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    ctx.fillText(row.text, ctx.direction === 'rtl' ? WIDTH - PAD : PAD, y + 40);
  }
  async function generate(model, isCurrent = () => true) {
    if (document.fonts) await document.fonts.ready;
    if (!isCurrent()) throw new Error('Report cancelled');
    const result = layout(model);
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue('--primary').trim() || '#2563eb';
    const files = [];
    for (let i = 0; i < result.pages.length; i++) {
      if (!isCurrent()) throw new Error('Report cancelled');
      const page = result.pages[i];
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH;
      canvas.height = Math.min(MAX_HEIGHT, Math.ceil(page.used + 88));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      // Opaque light background preserves contrast in every site theme and Telegram.
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, WIDTH, canvas.height);
      ctx.fillStyle = accent; ctx.fillRect(0, 0, WIDTH, 12);
      drawLine(ctx, {text:'بلاغ عن سؤال', bold:true, size:40, dir:'rtl'}, 38, '#132238');
      result.categories.forEach((row, n) => drawLine(ctx, row, 108 + n * LINE_HEIGHT, '#132238'));
      for (const row of page.rows) {
        if (row.heading) {
          ctx.fillStyle = '#e2e8f0'; ctx.fillRect(PAD, row.y - 7, WIDTH - 2 * PAD, 2);
          drawLine(ctx, {text:row.text, bold:true, size:32, dir:'rtl'}, row.y, '#334155');
        } else drawLine(ctx, row, row.y, '#132238');
      }
      const number = model.number ? ` — سؤال ${model.number}` : '';
      drawLine(ctx, {text:`الجزء ${i + 1} من ${result.pages.length}${number}`, size:26, dir:'rtl'}, canvas.height - 62, '#475569');
      const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG export failed')), 'image/png'));
      canvas.width = canvas.height = 1; // Release the large backing store between pages.
      const numberSlug = text(model.number).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'question';
      files.push(new File([blob], `question-report-${numberSlug}-${String(i + 1).padStart(3, '0')}.png`, {type:'image/png'}));
      // Yield between pages so a long report does not lock the interface.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    return files;
  }
  return {generate};
})();
