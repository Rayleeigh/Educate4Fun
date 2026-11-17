'use strict';
// Keep the native textarea for selection, accessibility, IME, and undo history.
let validationTimer;
function syncHighlight() {
  const input = document.getElementById('code');
  const highlight = document.getElementById('highlight');
  highlight.scrollTop = input.scrollTop;
  highlight.scrollLeft = input.scrollLeft;
}
function updateEditor(filename) {
  const input = document.getElementById('code');
  const source = input.value;
  const language = {'index.html':'markup', 'style.css':'css', 'script.js':'javascript'}[filename];
  document.getElementById('highlight').innerHTML = Prism.highlight(source + '\n', Prism.languages[language], language);
  syncHighlight();
  clearTimeout(validationTimer);
  document.getElementById('validation-summary').textContent = 'Checking syntax…';
  document.getElementById('diagnostics').replaceChildren();
  validationTimer = setTimeout(() => validateEditor(filename, source), 250);
}
function validateEditor(filename, source) {
  const issues = [];
  function add(message, line=1, column=1) { issues.push({message, line, column}); }
  try {
    if (filename === 'index.html') {
      const messages = HTMLHint.HTMLHint.verify(source, {
        'tag-pair':true, 'attr-no-duplication':true, 'attr-value-double-quotes':true,
        'tagname-lowercase':true, 'id-unique':true, 'spec-char-escape':true
      });
      for (const item of messages) add(item.message, item.line, item.col);
    } else if (filename === 'script.js') {
      // Parse only: learner code is never executed by validation.
      acorn.parse(source, {ecmaVersion:'latest', sourceType:'script', locations:true});
    } else {
      // CSS parsers recover from unfinished blocks; report those while typing too.
      const stack = [], types = csstree.tokenTypes;
      const pairs = new Map([[types.LeftCurlyBracket, types.RightCurlyBracket],
        [types.LeftSquareBracket, types.RightSquareBracket],
        [types.LeftParenthesis, types.RightParenthesis], [types.Function, types.RightParenthesis]]);
      const closing = new Set(pairs.values());
      function at(message, offset) {
        const prefix = source.slice(0, offset).split('\n');
        add(message, prefix.length, prefix[prefix.length - 1].length + 1);
      }
      csstree.tokenize(source, (type, start, end) => {
        if (pairs.has(type)) stack.push({expected:pairs.get(type), start});
        else if (closing.has(type)) {
          if (stack.at(-1)?.expected === type) stack.pop();
          else at('Unexpected closing bracket.', start);
        } else if (type === types.BadString || type === types.BadUrl) at('Unterminated string or URL.', start);
        else if (type === types.Comment && !source.slice(start, end).endsWith('*/')) at('Unterminated comment.', start);
        else if (type === types.String && source[end - 1] !== source[start]) at('Unterminated string.', start);
      });
      for (const item of stack) at('Missing closing bracket.', item.start);
      const ast = csstree.parse(source, {positions:true, onParseError(error) {
        add(error.message, error.line, error.column);
      }});
      csstree.walk(ast, node => {
        if (node.type !== 'Declaration' || node.property.startsWith('--')) return;
        const result = csstree.lexer.matchProperty(node.property, node.value);
        if (result.error && !/var\(|env\(/.test(csstree.generate(node.value))) {
          add(result.error.rawMessage || result.error.message.split('\n')[0], node.loc.start.line, node.loc.start.column);
        }
      });
    }
  } catch (error) {
    add(error.message.replace(/ \(\d+:\d+\)$/, ''), error.loc?.line || error.line || 1,
      error.loc ? error.loc.column + 1 : error.column || 1);
  }
  const summary = document.getElementById('validation-summary');
  summary.textContent = issues.length ? `${filename}: ${issues.length} syntax issue${issues.length === 1 ? '' : 's'}` : `${filename}: No syntax issues found`;
  summary.className = issues.length ? 'syntax-error' : 'syntax-ok';
  document.getElementById('diagnostics').replaceChildren(...issues.slice(0, 30).map(issue => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `Line ${issue.line}, column ${issue.column}: ${issue.message}`;
    button.onclick = () => {
      const editor = document.getElementById('code');
      const offset = source.split('\n').slice(0, issue.line - 1).reduce((n, line) => n + line.length + 1, 0) + issue.column - 1;
      editor.focus(); editor.setSelectionRange(offset, offset);
      const lineHeight = parseFloat(getComputedStyle(editor).lineHeight);
      editor.scrollTop = Math.max(0, (issue.line - 3) * lineHeight);
      syncHighlight();
      document.getElementById('line-numbers').scrollTop = editor.scrollTop;
    };
    li.append(button); return li;
  }));
}
