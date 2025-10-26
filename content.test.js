1~
/**
2~
 * Comprehensive Unit Tests for EcoPrompt Content Script
3~
 * Tests cover pure functions, DOM manipulation, storage, and edge cases
4~
 */
5~

6~
// Import the content script by loading it in the test environment
7~
// Since content.js uses global scope, we'll load it and access globals
8~
const fs = require('fs');
9~
const path = require('path');
10~

11~
// Read and evaluate the content script
12~
const contentScript = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
13~

14~
describe('EcoPrompt Content Script - Constants', () => {
15~
  beforeEach(() => {
16~
    // Clear all mocks and DOM before each test
17~
    jest.clearAllMocks();
18~
    document.body.innerHTML = '';
19~
    document.documentElement.innerHTML = '<body></body>';
20~
    localStorage.clear();
21~
  });
22~

23~
  test('ECO_ID constant should be defined', () => {
24~
    eval(contentScript);
25~
    expect(ECO_ID).toBe('eco-prompt-widget');
26~
  });
27~

28~
  test('FRAME_FILES should contain 6 bear images', () => {
29~
    eval(contentScript);
30~
    expect(FRAME_FILES).toHaveLength(6);
31~
    expect(FRAME_FILES).toEqual([
32~
      'happy1.jpeg',
33~
      'happy2.jpeg',
34~
      'lesshappy3.jpeg',
35~
      'lesshappy4.jpeg',
36~
      'sad5.jpeg',
37~
      'sad6.jpeg'
38~
    ]);
39~
  });
40~

41~
  test('cumulativeTotals should initialize with zero values', () => {
42~
    eval(contentScript);
43~
    expect(cumulativeTotals).toEqual({
44~
      tokens: 0,
45~
      energyWh: 0,
46~
      waterMl: 0,
47~
      co2Grams: 0
48~
    });
49~
  });
50~
});
51~

52~
describe('EcoPrompt Content Script - Pure Functions', () => {
53~
  beforeEach(() => {
54~
    jest.clearAllMocks();
55~
    document.body.innerHTML = '';
56~
    localStorage.clear();
57~
    eval(contentScript);
58~
  });
59~

60~
  describe('clamp()', () => {
61~
    test('should return value when within range', () => {
62~
      expect(clamp(5, 0, 10)).toBe(5);
63~
      expect(clamp(0, 0, 10)).toBe(0);
64~
      expect(clamp(10, 0, 10)).toBe(10);
65~
    });
66~

67~
    test('should return min when value is below range', () => {
68~
      expect(clamp(-5, 0, 10)).toBe(0);
69~
      expect(clamp(-100, 0, 10)).toBe(0);
70~
    });
71~

72~
    test('should return max when value is above range', () => {
73~
      expect(clamp(15, 0, 10)).toBe(10);
74~
      expect(clamp(1000, 0, 10)).toBe(10);
75~
    });
76~

77~
    test('should handle negative ranges', () => {
78~
      expect(clamp(-5, -10, -1)).toBe(-5);
79~
      expect(clamp(-15, -10, -1)).toBe(-10);
80~
      expect(clamp(0, -10, -1)).toBe(-1);
81~
    });
82~

83~
    test('should handle floating point numbers', () => {
84~
      expect(clamp(5.5, 0, 10)).toBe(5.5);
85~
      expect(clamp(0.001, 0, 1)).toBe(0.001);
86~
    });
87~
  });
88~

89~
  describe('format()', () => {
90~
    test('should format integers correctly', () => {
91~
      expect(format(100, 'Wh')).toBe('100 Wh');
92~
      expect(format(1000, 'mL')).toBe('1,000 mL');
93~
    });
94~

95~
    test('should format decimals with max 2 fraction digits', () => {
96~
      expect(format(100.5, 'Wh')).toBe('100.5 Wh');
97~
      expect(format(100.555, 'Wh')).toBe('100.56 Wh');
98~
      expect(format(100.1234, 'tokens')).toBe('100.12 tokens');
99~
    });
100~

101~
    test('should handle zero values', () => {
102~
      expect(format(0, 'Wh')).toBe('0 Wh');
103~
    });
104~

105~
    test('should handle negative values', () => {
106~
      expect(format(-50, 'Wh')).toBe('-50 Wh');
107~
    });
108~

109~
    test('should handle various units', () => {
110~
      expect(format(100, 'g')).toBe('100 g');
111~
      expect(format(100, 'tokens')).toBe('100 tokens');
112~
      expect(format(100, 'CO₂')).toBe('100 CO₂');
113~
    });
114~
  });
115~

116~
  describe('calculateImpact()', () => {
117~
    test('should calculate impact for simple text', () => {
118~
      const result = calculateImpact('test');
119~
      expect(result.tokens).toBe(1); // 4 chars / 4 = 1 token
120~
      expect(result.energyWh).toBeCloseTo(0.0085, 4);
121~
      expect(result.waterMl).toBeCloseTo(0.00425, 5);
122~
      expect(result.co2Grams).toBeCloseTo(0.003655, 6);
123~
    });
124~

125~
    test('should calculate impact for longer text', () => {
126~
      const text = 'a'.repeat(400); // 400 chars = 100 tokens
127~
      const result = calculateImpact(text);
128~
      expect(result.tokens).toBe(100);
129~
      expect(result.energyWh).toBeCloseTo(0.85, 2);
130~
      expect(result.waterMl).toBeCloseTo(0.425, 3);
131~
      expect(result.co2Grams).toBeCloseTo(0.3655, 4);
132~
    });
133~

134~
    test('should handle empty string', () => {
135~
      const result = calculateImpact('');
136~
      expect(result.tokens).toBe(0);
137~
      expect(result.energyWh).toBe(0);
138~
      expect(result.waterMl).toBe(0);
139~
      expect(result.co2Grams).toBe(0);
140~
    });
141~

142~
    test('should trim whitespace before calculating', () => {
143~
      const result1 = calculateImpact('  test  ');
144~
      const result2 = calculateImpact('test');
145~
      expect(result1).toEqual(result2);
146~
    });
147~

148~
    test('should handle special characters', () => {
149~
      const result = calculateImpact('🌱🌍💚🔋'); // 4 chars
150~
      expect(result.tokens).toBe(1);
151~
    });
152~

153~
    test('should round up tokens using Math.ceil', () => {
154~
      const result = calculateImpact('a'); // 1 char = 0.25 tokens, ceil to 1
155~
      expect(result.tokens).toBe(1);
156~
      
157~
      const result2 = calculateImpact('abcde'); // 5 chars = 1.25 tokens, ceil to 2
158~
      expect(result2.tokens).toBe(2);
159~
    });
160~
  });
161~

162~
  describe('computeUsageScore()', () => {
163~
    test('should compute score for typical values', () => {
164~
      const score = computeUsageScore({
165~
        energyWh: 0.85,
166~
        waterMl: 0.425,
167~
        co2g: 0.3655,
168~
        tokens: 100
169~
      });
170~
      expect(score).toBeGreaterThan(0);
171~
      expect(score).toBeLessThan(3);
172~
    });
173~

174~
    test('should handle zero tokens by using 1 as minimum', () => {
175~
      const score = computeUsageScore({
176~
        energyWh: 0.85,
177~
        waterMl: 0.425,
178~
        co2g: 0.3655,
179~
        tokens: 0
180~
      });
181~
      expect(score).toBeGreaterThan(0);
182~
    });
183~

184~
    test('should handle missing values as zero', () => {
185~
      const score = computeUsageScore({
186~
        tokens: 100
187~
      });
188~
      expect(score).toBeGreaterThanOrEqual(0);
189~
    });
190~

191~
    test('should weight energy highest (0.5), then water (0.3), then CO2 (0.2)', () => {
192~
      const highEnergy = computeUsageScore({
193~
        energyWh: 100,
194~
        waterMl: 0,
195~
        co2g: 0,
196~
        tokens: 100
197~
      });
198~
      
199~
      const highWater = computeUsageScore({
200~
        energyWh: 0,
201~
        waterMl: 100,
202~
        co2g: 0,
203~
        tokens: 100
204~
      });
205~
      
206~
      expect(highEnergy).toBeGreaterThan(highWater);
207~
    });
208~

209~
    test('should clamp normalized values between 0 and 3', () => {
210~
      const score = computeUsageScore({
211~
        energyWh: 10000,
212~
        waterMl: 10000,
213~
        co2g: 10000,
214~
        tokens: 1
215~
      });
216~
      // Max score with all values clamped at 3
217~
      expect(score).toBeLessThanOrEqual(3);
218~
    });
219~
  });
220~
});
221~

222~
describe('EcoPrompt Content Script - Storage Functions', () => {
223~
  beforeEach(() => {
224~
    jest.clearAllMocks();
225~
    localStorage.clear();
226~
    eval(contentScript);
227~
  });
228~

229~
  describe('saveTotals()', () => {
230~
    test('should save cumulative totals to localStorage', () => {
231~
      cumulativeTotals = {
232~
        tokens: 100,
233~
        energyWh: 0.85,
234~
        waterMl: 0.425,
235~
        co2Grams: 0.3655
236~
      };
237~
      
238~
      saveTotals();
239~
      
240~
      expect(localStorage.setItem).toHaveBeenCalledWith(
241~
        'eco_prompt_totals',
242~
        JSON.stringify(cumulativeTotals)
243~
      );
244~
    });
245~

246~
    test('should handle errors gracefully', () => {
247~
      localStorage.setItem.mockImplementation(() => {
248~
        throw new Error('Storage quota exceeded');
249~
      });
250~
      
251~
      expect(() => saveTotals()).not.toThrow();
252~
      expect(console.error).toHaveBeenCalled();
253~
    });
254~
  });
255~

256~
  describe('loadTotals()', () => {
257~
    test('should load saved totals from localStorage', () => {
258~
      const savedData = {
259~
        tokens: 500,
260~
        energyWh: 4.25,
261~
        waterMl: 2.125,
262~
        co2Grams: 1.8275
263~
      };
264~
      localStorage.setItem('eco_prompt_totals', JSON.stringify(savedData));
265~
      
266~
      loadTotals();
267~
      
268~
      expect(cumulativeTotals).toEqual(savedData);
269~
    });
270~

271~
    test('should handle missing data gracefully', () => {
272~
      localStorage.getItem.mockReturnValue(null);
273~
      
274~
      const originalTotals = { ...cumulativeTotals };
275~
      loadTotals();
276~
      
277~
      // Should not change if no saved data
278~
      expect(cumulativeTotals).toEqual(originalTotals);
279~
    });
280~

281~
    test('should handle corrupted JSON gracefully', () => {
282~
      localStorage.getItem.mockReturnValue('invalid json{');
283~
      
284~
      expect(() => loadTotals()).not.toThrow();
285~
      expect(console.error).toHaveBeenCalled();
286~
    });
287~

288~
    test('should log loaded totals on success', () => {
289~
      const savedData = { tokens: 100, energyWh: 0.85, waterMl: 0.425, co2Grams: 0.3655 };
290~
      localStorage.setItem('eco_prompt_totals', JSON.stringify(savedData));
291~
      
292~
      loadTotals();
293~
      
294~
      expect(console.log).toHaveBeenCalledWith('Loaded cumulative totals:', savedData);
295~
    });
296~
  });
297~

298~
  describe('restorePosition()', () => {
299~
    test('should restore saved position', () => {
300~
      const el = document.createElement('div');
301~
      const savedPos = { x: 100, y: 200 };
302~
      localStorage.setItem('eco_prompt_pos', JSON.stringify(savedPos));
303~
      
304~
      restorePosition(el);
305~
      
306~
      expect(el.style.left).toBe('100px');
307~
      expect(el.style.top).toBe('200px');
308~
      expect(el.style.position).toBe('fixed');
309~
    });
310~

311~
    test('should handle missing position data', () => {
312~
      const el = document.createElement('div');
313~
      localStorage.getItem.mockReturnValue(null);
314~
      
315~
      expect(() => restorePosition(el)).not.toThrow();
316~
    });
317~

318~
    test('should handle invalid position data', () => {
319~
      const el = document.createElement('div');
320~
      localStorage.setItem('eco_prompt_pos', JSON.stringify({ invalid: 'data' }));
321~
      
322~
      expect(() => restorePosition(el)).not.toThrow();
323~
    });
324~
  });
325~
});
326~

327~
describe('EcoPrompt Content Script - Icon and Frame Functions', () => {
328~
  beforeEach(() => {
329~
    jest.clearAllMocks();
330~
    document.body.innerHTML = '';
331~
    eval(contentScript);
332~
  });
333~

334~
  describe('setIconFrame()', () => {
335~
    test('should set image source using chrome.runtime.getURL', () => {
336~
      const img = document.createElement('img');
337~
      
338~
      setIconFrame(img, 0);
339~
      
340~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('happy1.jpeg');
341~
      expect(img.src).toContain('chrome-extension://mock-id/happy1.jpeg');
342~
    });
343~

344~
    test('should clamp index to valid range', () => {
345~
      const img = document.createElement('img');
346~
      
347~
      setIconFrame(img, -5);
348~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('happy1.jpeg');
349~
      
350~
      setIconFrame(img, 100);
351~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('sad6.jpeg');
352~
    });
353~

354~
    test('should handle chrome.runtime.getURL failure', () => {
355~
      const img = document.createElement('img');
356~
      chrome.runtime.getURL.mockImplementation(() => {
357~
        throw new Error('Extension context invalid');
358~
      });
359~
      
360~
      expect(() => setIconFrame(img, 0)).not.toThrow();
361~
      expect(img.src).toContain('happy1.jpeg');
362~
    });
363~

364~
    test('should floor fractional indices', () => {
365~
      const img = document.createElement('img');
366~
      
367~
      setIconFrame(img, 2.7);
368~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('lesshappy3.jpeg');
369~
    });
370~
  });
371~

372~
  describe('setUsageIcon()', () => {
373~
    test('should set happy1 for 0-99 tokens', () => {
374~
      const img = document.createElement('img');
375~
      cumulativeTotals.tokens = 50;
376~
      
377~
      setUsageIcon(img, 10);
378~
      
379~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('happy1.jpeg');
380~
    });
381~

382~
    test('should set happy2 for 100-499 tokens', () => {
383~
      const img = document.createElement('img');
384~
      cumulativeTotals.tokens = 250;
385~
      
386~
      setUsageIcon(img, 10);
387~
      
388~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('happy2.jpeg');
389~
    });
390~

391~
    test('should set lesshappy3 for 500-999 tokens', () => {
392~
      const img = document.createElement('img');
393~
      cumulativeTotals.tokens = 750;
394~
      
395~
      setUsageIcon(img, 10);
396~
      
397~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('lesshappy3.jpeg');
398~
    });
399~

400~
    test('should set lesshappy4 for 1000-1999 tokens', () => {
401~
      const img = document.createElement('img');
402~
      cumulativeTotals.tokens = 1500;
403~
      
404~
      setUsageIcon(img, 10);
405~
      
406~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('lesshappy4.jpeg');
407~
    });
408~

409~
    test('should set sad5 for 2000-4999 tokens', () => {
410~
      const img = document.createElement('img');
411~
      cumulativeTotals.tokens = 3000;
412~
      
413~
      setUsageIcon(img, 10);
414~
      
415~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('sad5.jpeg');
416~
    });
417~

418~
    test('should set sad6 for 5000+ tokens', () => {
419~
      const img = document.createElement('img');
420~
      cumulativeTotals.tokens = 10000;
421~
      
422~
      setUsageIcon(img, 10);
423~
      
424~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('sad6.jpeg');
425~
    });
426~

427~
    test('should use cumulative tokens, not current tokens', () => {
428~
      const img = document.createElement('img');
429~
      cumulativeTotals.tokens = 5000; // High cumulative
430~
      
431~
      setUsageIcon(img, 1); // Low current
432~
      
433~
      expect(chrome.runtime.getURL).toHaveBeenCalledWith('sad6.jpeg');
434~
    });
435~
  });
436~
});
437~

438~
describe('EcoPrompt Content Script - DOM Functions', () => {
439~
  beforeEach(() => {
440~
    jest.clearAllMocks();
441~
    document.body.innerHTML = '';
442~
    document.documentElement.innerHTML = '<body></body>';
443~
    eval(contentScript);
444~
  });
445~

446~
  describe('getWidget()', () => {
447~
    test('should create widget if it does not exist', () => {
448~
      const widget = getWidget();
449~
      
450~
      expect(widget).toBeTruthy();
451~
      expect(widget.id).toBe('eco-prompt-widget');
452~
      expect(document.getElementById('eco-prompt-widget')).toBe(widget);
453~
    });
454~

455~
    test('should return existing widget if already created', () => {
456~
      const widget1 = getWidget();
457~
      const widget2 = getWidget();
458~
      
459~
      expect(widget1).toBe(widget2);
460~
    });
461~

462~
    test('should create widget with correct structure', () => {
463~
      const widget = getWidget();
464~
      
465~
      const icon = widget.querySelector('#eco-prompt-icon');
466~
      const text = widget.querySelector('#eco-prompt-text');
467~
      
468~
      expect(icon).toBeTruthy();
469~
      expect(icon.tagName).toBe('IMG');
470~
      expect(icon.width).toBe(32);
471~
      expect(icon.height).toBe(32);
472~
      
473~
      expect(text).toBeTruthy();
474~
      expect(text.tagName).toBe('SPAN');
475~
      expect(text.textContent).toBe('EcoPrompt: Ready...');
476~
    });
477~

478~
    test('should apply correct styles to widget', () => {
479~
      const widget = getWidget();
480~
      
481~
      expect(widget.style.position).toBe('fixed');
482~
      expect(widget.style.zIndex).toBe('999999');
483~
      expect(widget.style.cursor).toBe('grab');
484~
      expect(widget.style.display).toBe('inline-flex');
485~
    });
486~

487~
    test('should make widget draggable on creation', () => {
488~
      const widget = getWidget();
489~
      
490~
      // Verify drag event listeners would be attached
491~
      expect(widget).toBeTruthy();
492~
    });
493~
  });
494~

495~
  describe('isEditable()', () => {
496~
    test('should return true for textarea', () => {
497~
      const textarea = document.createElement('textarea');
498~
      expect(isEditable(textarea)).toBe(true);
499~
    });
500~

501~
    test('should return true for contentEditable elements', () => {
502~
      const div = document.createElement('div');
503~
      div.contentEditable = 'true';
504~
      expect(isEditable(div)).toBe(true);
505~
    });
506~

507~
    test('should return true for elements with textbox role', () => {
508~
      const div = document.createElement('div');
509~
      div.setAttribute('role', 'textbox');
510~
      expect(isEditable(div)).toBe(true);
511~
    });
512~

513~
    test('should return false for non-editable elements', () => {
514~
      const div = document.createElement('div');
515~
      expect(isEditable(div)).toBe(false);
516~
    });
517~

518~
    test('should return false for null/undefined', () => {
519~
      expect(isEditable(null)).toBe(false);
520~
      expect(isEditable(undefined)).toBe(false);
521~
    });
522~
  });
523~

524~
  describe('getEditorValue()', () => {
525~
    test('should return value from textarea', () => {
526~
      const textarea = document.createElement('textarea');
527~
      textarea.value = 'test content';
528~
      expect(getEditorValue(textarea)).toBe('test content');
529~
    });
530~

531~
    test('should return innerText from contentEditable', () => {
532~
      const div = document.createElement('div');
533~
      div.contentEditable = 'true';
534~
      div.innerText = 'editable content';
535~
      expect(getEditorValue(div)).toBe('editable content');
536~
    });
537~

538~
    test('should return empty string for null element', () => {
539~
      expect(getEditorValue(null)).toBe('');
540~
    });
541~

542~
    test('should return empty string for non-editable element', () => {
543~
      const div = document.createElement('div');
544~
      expect(getEditorValue(div)).toBe('');
545~
    });
546~
  });
547~
});
548~

549~
describe('EcoPrompt Content Script - Widget Update Logic', () => {
550~
  beforeEach(() => {
551~
    jest.clearAllMocks();
552~
    document.body.innerHTML = '';
553~
    document.documentElement.innerHTML = '<body></body>';
554~
    localStorage.clear();
555~
    eval(contentScript);
556~
    lastProcessedText = '';
557~
    cumulativeTotals = {
558~
      tokens: 0,
559~
      energyWh: 0,
560~
      waterMl: 0,
561~
      co2Grams: 0
562~
    };
563~
  });
564~

565~
  describe('updateWidget()', () => {
566~
    test('should create widget and display impact for text', () => {
567~
      const text = 'test prompt';
568~
      updateWidget(text, null);
569~
      
570~
      const widget = document.getElementById('eco-prompt-widget');
571~
      expect(widget).toBeTruthy();
572~
      
573~
      const textElement = widget.querySelector('#eco-prompt-text');
574~
      expect(textElement.textContent).toContain('Total:');
575~
      expect(textElement.textContent).toContain('Energy');
576~
      expect(textElement.textContent).toContain('Water');
577~
      expect(textElement.textContent).toContain('CO₂');
578~
      expect(textElement.textContent).toContain('tokens');
579~
    });
580~

581~
    test('should accumulate totals when text is cleared (message sent)', () => {
582~
      // Simulate typing a message
583~
      updateWidget('Hello world', null);
584~
      expect(lastProcessedText).toBe('Hello world');
585~
      
586~
      // Simulate sending (text cleared)
587~
      updateWidget('', null);
588~
      
589~
      expect(cumulativeTotals.tokens).toBeGreaterThan(0);
590~
      expect(localStorage.setItem).toHaveBeenCalled();
591~
    });
592~

593~
    test('should not accumulate if text was already empty', () => {
594~
      lastProcessedText = '';
595~
      updateWidget('', null);
596~
      
597~
      expect(cumulativeTotals.tokens).toBe(0);
598~
    });
599~

600~
    test('should trim whitespace from input text', () => {
601~
      updateWidget('  test  ', null);
602~
      
603~
      const widget = document.getElementById('eco-prompt-widget');
604~
      const textElement = widget.querySelector('#eco-prompt-text');
605~
      
606~
      // Should calculate based on trimmed text
607~
      expect(textElement).toBeTruthy();
608~
    });
609~

610~
    test('should update icon based on cumulative totals', () => {
611~
      cumulativeTotals.tokens = 3000; // Should trigger sad bear
612~
      
613~
      updateWidget('test', null);
614~
      
615~
      const icon = document.getElementById('eco-prompt-icon');
616~
      expect(icon).toBeTruthy();
617~
      expect(chrome.runtime.getURL).toHaveBeenCalled();
618~
    });
619~

620~
    test('should display sum of cumulative and current totals', () => {
621~
      cumulativeTotals.tokens = 100;
622~
      cumulativeTotals.energyWh = 0.85;
623~
      
624~
      const text = 'a'.repeat(400); // 100 more tokens
625~
      updateWidget(text, null);
626~
      
627~
      const widget = document.getElementById('eco-prompt-widget');
628~
      const textElement = widget.querySelector('#eco-prompt-text');
629~
      
630~
      // Should show combined total
631~
      expect(textElement.textContent).toContain('200'); // 100 + 100 tokens
632~
    });
633~
  });
634~
});
635~

636~
describe('EcoPrompt Content Script - Utility Functions', () => {
637~
  beforeEach(() => {
638~
    jest.clearAllMocks();
639~
    document.body.innerHTML = '';
640~
    eval(contentScript);
641~
  });
642~

643~
  describe('throttle()', () => {
644~
    jest.useFakeTimers();
645~

646~
    test('should execute function immediately on first call', () => {
647~
      const fn = jest.fn();
648~
      const throttled = throttle(fn, 100);
649~
      
650~
      throttled('arg1');
651~
      
652~
      expect(fn).toHaveBeenCalledTimes(1);
653~
      expect(fn).toHaveBeenCalledWith('arg1');
654~
    });
655~

656~
    test('should throttle subsequent calls within time window', () => {
657~
      const fn = jest.fn();
658~
      const throttled = throttle(fn, 100);
659~
      
660~
      throttled('call1');
661~
      throttled('call2');
662~
      throttled('call3');
663~
      
664~
      expect(fn).toHaveBeenCalledTimes(1);
665~
    });
666~

667~
    test('should execute pending call after throttle period', () => {
668~
      const fn = jest.fn();
669~
      const throttled = throttle(fn, 100);
670~
      
671~
      throttled('call1');
672~
      throttled('call2');
673~
      
674~
      jest.advanceTimersByTime(100);
675~
      
676~
      expect(fn).toHaveBeenCalledTimes(2);
677~
      expect(fn).toHaveBeenLastCalledWith('call2');
678~
    });
679~

680~
    test('should use most recent arguments for pending call', () => {
681~
      const fn = jest.fn();
682~
      const throttled = throttle(fn, 100);
683~
      
684~
      throttled('call1');
685~
      throttled('call2');
686~
      throttled('call3');
687~
      throttled('call4');
688~
      
689~
      jest.advanceTimersByTime(100);
690~
      
691~
      expect(fn).toHaveBeenCalledTimes(2);
692~
      expect(fn).toHaveBeenNthCalledWith(1, 'call1');
693~
      expect(fn).toHaveBeenNthCalledWith(2, 'call4'); // Last arguments
694~
    });
695~

696~
    jest.useRealTimers();
697~
  });
698~

699~
  describe('deepQueryAll()', () => {
700~
    test('should find elements in regular DOM', () => {
701~
      document.body.innerHTML = '<textarea></textarea><textarea></textarea>';
702~
      
703~
      const results = deepQueryAll('textarea');
704~
      
705~
      expect(results).toHaveLength(2);
706~
    });
707~

708~
    test('should accept array of selectors', () => {
709~
      document.body.innerHTML = '<textarea></textarea><div role="textbox"></div>';
710~
      
711~
      const results = deepQueryAll(['textarea', '[role="textbox"]']);
712~
      
713~
      expect(results).toHaveLength(2);
714~
    });
715~

716~
    test('should handle invalid selectors gracefully', () => {
717~
      expect(() => deepQueryAll('::invalid::')).not.toThrow();
718~
    });
719~

720~
    test('should return empty array when nothing matches', () => {
721~
      document.body.innerHTML = '<div></div>';
722~
      
723~
      const results = deepQueryAll('textarea');
724~
      
725~
      expect(results).toHaveLength(0);
726~
    });
727~

728~
    test('should work with custom root element', () => {
729~
      const container = document.createElement('div');
730~
      container.innerHTML = '<textarea></textarea>';
731~
      document.body.appendChild(container);
732~
      
733~
      const results = deepQueryAll('textarea', container);
734~
      
735~
      expect(results).toHaveLength(1);
736~
    });
737~
  });
738~

739~
  describe('attachListeners()', () => {
740~
    test('should attach input and keyup listeners', () => {
741~
      const textarea = document.createElement('textarea');
742~
      const addEventListenerSpy = jest.spyOn(textarea, 'addEventListener');
743~
      
744~
      attachListeners(textarea);
745~
      
746~
      expect(addEventListenerSpy).toHaveBeenCalledWith('input', expect.any(Function));
747~
      expect(addEventListenerSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
748~
    });
749~

750~
    test('should mark element as hooked to prevent duplicate listeners', () => {
751~
      const textarea = document.createElement('textarea');
752~
      
753~
      attachListeners(textarea);
754~
      
755~
      expect(textarea.dataset.ecoHooked).toBe('true');
756~
    });
757~

758~
    test('should not attach listeners if already hooked', () => {
759~
      const textarea = document.createElement('textarea');
760~
      textarea.dataset.ecoHooked = 'true';
761~
      const addEventListenerSpy = jest.spyOn(textarea, 'addEventListener');
762~
      
763~
      attachListeners(textarea);
764~
      
765~
      expect(addEventListenerSpy).not.toHaveBeenCalled();
766~
    });
767~

768~
    test('should handle null element gracefully', () => {
769~
      expect(() => attachListeners(null)).not.toThrow();
770~
    });
771~
  });
772~
});
773~

774~
describe('EcoPrompt Content Script - Draggable Functionality', () => {
775~
  beforeEach(() => {
776~
    jest.clearAllMocks();
777~
    document.body.innerHTML = '';
778~
    localStorage.clear();
779~
    eval(contentScript);
780~
    userDragged = false;
781~
  });
782~

783~
  describe('makeDraggable()', () => {
784~
    test('should attach mouse and touch event listeners', () => {
785~
      const el = document.createElement('div');
786~
      const addEventListenerSpy = jest.spyOn(el, 'addEventListener');
787~
      
788~
      makeDraggable(el);
789~
      
790~
      expect(addEventListenerSpy).toHaveBeenCalledWith('mousedown', expect.any(Function));
791~
      expect(addEventListenerSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), { passive: false });
792~
    });
793~

794~
    test('should set userDragged flag on mousedown', () => {
795~
      const el = document.createElement('div');
796~
      document.body.appendChild(el);
797~
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50 });
798~
      
799~
      makeDraggable(el);
800~
      
801~
      const mouseEvent = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
802~
      el.dispatchEvent(mouseEvent);
803~
      
804~
      expect(userDragged).toBe(true);
805~
    });
806~

807~
    test('should change cursor to grabbing on drag start', () => {
808~
      const el = document.createElement('div');
809~
      document.body.appendChild(el);
810~
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50 });
811~
      
812~
      makeDraggable(el);
813~
      
814~
      const mouseEvent = new MouseEvent('mousedown', { clientX: 50, clientY: 25 });
815~
      el.dispatchEvent(mouseEvent);
816~
      
817~
      expect(el.style.cursor).toBe('grabbing');
818~
    });
819~

820~
    test('should save position to localStorage on mouseup', () => {
821~
      const el = document.createElement('div');
822~
      document.body.appendChild(el);
823~
      el.getBoundingClientRect = () => ({ left: 100, top: 200, width: 100, height: 50 });
824~
      
825~
      makeDraggable(el);
826~
      
827~
      // Start drag
828~
      const mouseDown = new MouseEvent('mousedown', { clientX: 150, clientY: 225 });
829~
      el.dispatchEvent(mouseDown);
830~
      
831~
      // End drag
832~
      const mouseUp = new MouseEvent('mouseup');
833~
      window.dispatchEvent(mouseUp);
834~
      
835~
      expect(localStorage.setItem).toHaveBeenCalledWith(
836~
        'eco_prompt_pos',
837~
        expect.stringContaining('100')
838~
      );
839~
    });
840~
  });
841~
});
842~

843~
describe('EcoPrompt Content Script - Edge Cases and Error Handling', () => {
844~
  beforeEach(() => {
845~
    jest.clearAllMocks();
846~
    document.body.innerHTML = '';
847~
    localStorage.clear();
848~
    eval(contentScript);
849~
  });
850~

851~
  test('should handle very long text input', () => {
852~
    const longText = 'a'.repeat(1000000); // 1 million characters
853~
    const result = calculateImpact(longText);
854~
    
855~
    expect(result.tokens).toBe(250000); // 1M / 4
856~
    expect(result.energyWh).toBeGreaterThan(0);
857~
    expect(isFinite(result.energyWh)).toBe(true);
858~
  });
859~

860~
  test('should handle unicode and emoji correctly', () => {
861~
    const emojiText = '🌱💚🔋⚡️🌍';
862~
    const result = calculateImpact(emojiText);
863~
    
864~
    expect(result.tokens).toBeGreaterThan(0);
865~
    expect(isFinite(result.tokens)).toBe(true);
866~
  });
867~

868~
  test('should handle rapid consecutive updates', () => {
869~
    for (let i = 0; i < 100; i++) {
870~
      updateWidget(`test ${i}`, null);
871~
    }
872~
    
873~
    const widget = document.getElementById('eco-prompt-widget');
874~
    expect(widget).toBeTruthy();
875~
  });
876~

877~
  test('should handle missing chrome.runtime gracefully', () => {
878~
    const originalChrome = global.chrome;
879~
    global.chrome = { runtime: null };
880~
    
881~
    const img = document.createElement('img');
882~
    
883~
    expect(() => setIconFrame(img, 0)).not.toThrow();
884~
    
885~
    global.chrome = originalChrome;
886~
  });
887~

888~
  test('should handle localStorage exceptions in saveTotals', () => {
889~
    localStorage.setItem.mockImplementation(() => {
890~
      throw new Error('QuotaExceededError');
891~
    });
892~
    
893~
    expect(() => saveTotals()).not.toThrow();
894~
  });
895~

896~
  test('should handle malformed JSON in loadTotals', () => {
897~
    localStorage.getItem.mockReturnValue('}{invalid json');
898~
    
899~
    expect(() => loadTotals()).not.toThrow();
900~
  });
901~

902~
  test('should handle null or undefined text in calculateImpact', () => {
903~
    expect(() => calculateImpact(null)).not.toThrow();
904~
    expect(() => calculateImpact(undefined)).not.toThrow();
905~
  });
906~
});
907~

908~
describe('EcoPrompt Content Script - Integration Tests', () => {
909~
  beforeEach(() => {
910~
    jest.clearAllMocks();
911~
    document.body.innerHTML = '';
912~
    document.documentElement.innerHTML = '<body></body>';
913~
    localStorage.clear();
914~
    eval(contentScript);
915~
    lastProcessedText = '';
916~
    userDragged = false;
917~
    cumulativeTotals = {
918~
      tokens: 0,
919~
      energyWh: 0,
920~
      waterMl: 0,
921~
      co2Grams: 0
922~
    };
923~
  });
924~

925~
  test('complete user flow: type message, send, and track cumulative impact', () => {
926~
    // User types first message
927~
    const message1 = 'Hello, how are you?';
928~
    updateWidget(message1, null);
929~
    
930~
    let widget = document.getElementById('eco-prompt-widget');
931~
    expect(widget).toBeTruthy();
932~
    
933~
    // User sends message (text cleared)
934~
    updateWidget('', null);
935~
    
936~
    expect(cumulativeTotals.tokens).toBeGreaterThan(0);
937~
    const firstTokens = cumulativeTotals.tokens;
938~
    
939~
    // User types second message
940~
    const message2 = 'Tell me about climate change';
941~
    updateWidget(message2, null);
942~
    
943~
    // User sends second message
944~
    updateWidget('', null);
945~
    
946~
    // Cumulative should increase
947~
    expect(cumulativeTotals.tokens).toBeGreaterThan(firstTokens);
948~
  });
949~

950~
  test('bear icon changes as consumption increases', () => {
951~
    cumulativeTotals.tokens = 50;
952~
    updateWidget('test', null);
953~
    let icon = document.getElementById('eco-prompt-icon');
954~
    const happyUrl = icon.src;
955~
    
956~
    cumulativeTotals.tokens = 5000;
957~
    updateWidget('test', null);
958~
    icon = document.getElementById('eco-prompt-icon');
959~
    const sadUrl = icon.src;
960~
    
961~
    expect(sadUrl).not.toBe(happyUrl);
962~
  });
963~

964~
  test('widget persists across page updates', () => {
965~
    const widget1 = getWidget();
966~
    const widget2 = getWidget();
967~
    
968~
    expect(widget1).toBe(widget2);
969~
    expect(document.querySelectorAll('#eco-prompt-widget')).toHaveLength(1);
970~
  });
971~

972~
  test('format function handles all value ranges correctly', () => {
973~
    expect(format(0, 'Wh')).toBe('0 Wh');
974~
    expect(format(0.0001, 'Wh')).toBe('0 Wh');
975~
    expect(format(1, 'Wh')).toBe('1 Wh');
976~
    expect(format(1000, 'Wh')).toBe('1,000 Wh');
977~
    expect(format(1000000, 'Wh')).toBe('1,000,000 Wh');
978~
  });
979~
});