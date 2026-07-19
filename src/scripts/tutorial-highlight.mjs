// Editor highlight overlay: a transparent textarea over a highlightTokens-
// rendered <pre> with identical metrics, scroll-synced. Built at runtime so
// the no-JS page keeps plain server-rendered textareas.
import { specEditor, codeEditor } from './tutorial-dom.mjs';
import { highlightTokens } from './highlight.mjs';
import { esc } from './report-colors.mjs';

const highlightRenderers = [];

export function setupHighlight(editor) {
  const wrap = document.createElement('div');
  wrap.className = 'editor-wrap';
  const pre = document.createElement('pre');
  pre.className = 'editor-highlight';
  pre.setAttribute('aria-hidden', 'true');
  const code = document.createElement('code');
  pre.appendChild(code);
  editor.parentNode.insertBefore(wrap, editor);
  wrap.appendChild(pre);
  wrap.appendChild(editor);
  editor.classList.add('editor-overlaid');
  const sync = () => {
    pre.scrollTop = editor.scrollTop;
    pre.scrollLeft = editor.scrollLeft;
  };
  const render = () => {
    // trailing newline keeps the pre's last line height in step with the textarea
    code.innerHTML = highlightTokens(esc(editor.value)) + '\n';
    sync();
  };
  editor.addEventListener('input', render);
  editor.addEventListener('scroll', sync);
  highlightRenderers.push(render);
  render();
}

// call after every programmatic .value assignment (seeding, resume, reset)
export function refreshHighlights() {
  for (const render of highlightRenderers) render();
}

// Both editors carry a native vertical resize grip, and a drag writes an inline
// height onto that one textarea only. The grid stretches the panes to the
// taller side, but a shorter inline height overrides the CSS fill, so dragging
// each grip in turn would drift the two windows apart. Mirror whichever grip is
// dragged onto the other editor so the left and right windows stay one height.
export function syncEditorHeights() {
  if (typeof ResizeObserver === 'undefined') return;
  const editors = [specEditor, codeEditor];
  let shared = ''; // the height last propagated to both, as an inline string
  const observer = new ResizeObserver(() => {
    for (const editor of editors) {
      const height = editor.style.height; // set by a resize drag, else ''
      if (height && height !== shared) {
        shared = height;
        for (const other of editors) {
          if (other !== editor) other.style.height = height;
        }
        return; // the mirrored write settles to `shared`, so no feedback loop
      }
    }
  });
  for (const editor of editors) observer.observe(editor);
}
