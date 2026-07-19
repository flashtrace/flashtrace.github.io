// Per-pane file tabs and the new-file / delete-file dialogs. Each pane owns a
// tab strip over its files: click to switch, ✕ to delete (confirmed), + to
// create (name + type dialog validated against the datalist extensions).
// Locked chapters show padlocks instead and disable the "+".
import {
  specEditor,
  codeEditor,
  specTabs,
  codeTabs,
  argvInput,
  LOCK_TIP,
} from './tutorial-dom.mjs';
import { esc } from './report-colors.mjs';
import { current, panes, setPanes } from './tutorial-state.mjs';
import { refreshHighlights } from './tutorial-highlight.mjs';
import { saveBuffers } from './tutorial-persistence.mjs';
import { scheduleSilentRun } from './tutorial-runner.mjs';

export function isLocked() {
  return Boolean(current && current.locked);
}

export function tabStrip(pane) {
  return pane === 'spec' ? specTabs : codeTabs;
}

export function paneEditor(pane) {
  return pane === 'spec' ? specEditor : codeEditor;
}

export function activeFile(pane) {
  const state = panes[pane];
  return state.files[state.active];
}

// push both active files into their textareas after any model change
export function syncEditors() {
  specEditor.value = activeFile('spec').body;
  codeEditor.value = activeFile('code').body;
  refreshHighlights();
  renderAllTabs();
}

function renderTabs(pane) {
  const strip = tabStrip(pane);
  if (!strip) return;
  const state = panes[pane];
  const locked = isLocked();
  const tab = (file, i) => {
    const on = i === state.active;
    const trailer = locked
      ? '<span class="tab-lock" title="' + LOCK_TIP + '"></span>'
      : state.files.length > 1
        ? '<button type="button" class="tab-close" data-index="' + i + '" title="Delete ' + esc(file.name) + '" aria-label="Delete ' + esc(file.name) + '">✕</button>'
        : '';
    return (
      '<div class="pane-tab' + (on ? ' is-active' : '') + '">' +
      '<button type="button" class="tab-name" data-index="' + i + '"' + (on ? ' aria-current="true"' : '') + '>' + esc(file.name) + '</button>' +
      trailer +
      '</div>'
    );
  };
  const addAttrs = locked ? ' disabled title="' + LOCK_TIP + '"' : ' title="New file"';
  strip.innerHTML =
    state.files.map(tab).join('') +
    '<button type="button" class="tab-add"' + addAttrs + ' aria-label="New file">+</button>';
}

export function renderAllTabs() {
  renderTabs('spec');
  renderTabs('code');
}

export function selectTab(pane, index) {
  const state = panes[pane];
  if (!state.files[index] || index === state.active) return;
  state.active = index;
  syncEditors();
}

export function initTabs() {
  for (const pane of ['spec', 'code']) {
    const strip = tabStrip(pane);
    if (!strip) continue;
    strip.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.classList.contains('tab-name')) selectTab(pane, Number(button.dataset.index));
      else if (button.classList.contains('tab-close')) confirmDeleteFile(pane, Number(button.dataset.index));
      else if (button.classList.contains('tab-add')) openNewFileDialog(pane);
    });
  }
  initNewFileDialog();
  initDeleteFileDialog();
}

// --- deleting ----------------------------------------------------------------

let deleteFileContext = null; // { pane, index } while the confirm dialog is up

function initDeleteFileDialog() {
  const modal = document.getElementById('delfile-modal');
  const yes = document.getElementById('delfile-yes');
  const cancel = document.getElementById('delfile-cancel');
  if (!modal || !yes || !cancel) return;
  yes.addEventListener('click', () => {
    modal.close();
    if (deleteFileContext) deleteFile(deleteFileContext.pane, deleteFileContext.index);
    deleteFileContext = null;
  });
  cancel.addEventListener('click', () => {
    modal.close();
    deleteFileContext = null;
  });
  modal.addEventListener('cancel', () => {
    deleteFileContext = null;
  });
}

function confirmDeleteFile(pane, index) {
  const state = panes[pane];
  const file = state.files[index];
  if (isLocked() || !file || state.files.length < 2) return;
  const modal = document.getElementById('delfile-modal');
  if (!modal || typeof modal.showModal !== 'function') {
    if (window.confirm('Delete ' + file.name + '? Its content is lost.')) deleteFile(pane, index);
    return;
  }
  deleteFileContext = { pane, index };
  const text = document.getElementById('delfile-text');
  if (text) text.textContent = 'Delete ' + file.name + '? Its content is lost - this cannot be undone.';
  modal.showModal();
}

function deleteFile(pane, index) {
  const state = panes[pane];
  if (!state.files[index] || state.files.length < 2) return;
  state.files.splice(index, 1);
  if (state.active > index) state.active -= 1;
  else if (state.active >= state.files.length) state.active = state.files.length - 1;
  syncEditors();
  saveBuffers();
  scheduleSilentRun();
}

// --- creating ----------------------------------------------------------------

let newFilePane = null; // pane the new-file dialog was opened for

function supportedExtensions(pane) {
  const list = document.getElementById(pane === 'spec' ? 'ext-spec' : 'ext-code');
  return list ? Array.from(list.querySelectorAll('option'), (o) => o.value) : [];
}

// Resolve the dialog's two fields into a final file name or a user-facing
// error; an extension typed into the name itself wins over the type field.
// `issue: true` marks "unsupported anywhere" - the dialog then offers the
// tool's issue tracker for a new-language request.
function resolveNewFile(pane) {
  const name = (document.getElementById('newfile-name').value || '').trim();
  const typed = (document.getElementById('newfile-ext').value || '').trim().toLowerCase();
  if (!name) return { error: '' }; // nothing typed yet - just keep Create disabled
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return { error: 'Use letters, digits, dots, dashes and underscores only.' };
  const own = /\.[a-z0-9]+$/i.exec(name);
  const ext = own ? own[0].toLowerCase() : typed ? (typed.startsWith('.') ? typed : '.' + typed) : '';
  if (!ext) return { error: '' }; // waiting for a type
  const full = own ? name : name + ext;
  if (full.toLowerCase() === ext) return { error: 'Give the file a name before its extension.' };
  const here = supportedExtensions(pane);
  if (!here.includes(ext)) {
    const other = supportedExtensions(pane === 'spec' ? 'code' : 'spec');
    if (other.includes(ext)) {
      return {
        error:
          pane === 'spec'
            ? 'The left pane holds the Markdown spec - create ' + ext + ' files with the + on the right.'
            : 'Markdown belongs in the spec pane - use the + on the left.',
      };
    }
    return { error: 'flashtrace sadly does not support ' + ext + ' files yet.', issue: true };
  }
  const taken = [...panes.spec.files, ...panes.code.files].some((f) => f.name.toLowerCase() === full.toLowerCase());
  if (taken) return { error: 'A file named ' + full + ' already exists.' };
  return { name: full };
}

function initNewFileDialog() {
  const modal = document.getElementById('newfile-modal');
  const name = document.getElementById('newfile-name');
  const ext = document.getElementById('newfile-ext');
  const create = document.getElementById('newfile-create');
  const cancel = document.getElementById('newfile-cancel');
  const error = document.getElementById('newfile-error');
  const errorText = document.getElementById('newfile-error-text');
  const issue = document.getElementById('newfile-issue');
  if (!modal || !name || !ext || !create || !cancel) return;
  const validate = () => {
    const resolved = resolveNewFile(newFilePane);
    create.disabled = !resolved.name;
    if (error) error.hidden = !resolved.error;
    if (errorText) errorText.textContent = resolved.error || '';
    if (issue) issue.hidden = !resolved.issue;
    return resolved;
  };
  const submit = () => {
    const resolved = validate();
    if (!resolved.name) return;
    modal.close();
    createFile(newFilePane, resolved.name);
  };
  name.addEventListener('input', validate);
  ext.addEventListener('input', validate);
  create.addEventListener('click', submit);
  cancel.addEventListener('click', () => modal.close());
  for (const field of [name, ext]) {
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  }
}

function openNewFileDialog(pane) {
  const modal = document.getElementById('newfile-modal');
  const name = document.getElementById('newfile-name');
  const ext = document.getElementById('newfile-ext');
  if (isLocked() || !modal || !name || !ext || typeof modal.showModal !== 'function') return;
  newFilePane = pane;
  name.value = '';
  ext.value = pane === 'spec' ? '.md' : '.js';
  ext.setAttribute('list', pane === 'spec' ? 'ext-spec' : 'ext-code');
  const error = document.getElementById('newfile-error');
  if (error) error.hidden = true;
  document.getElementById('newfile-create').disabled = true;
  modal.showModal();
  name.focus();
}

function createFile(pane, fileName) {
  const state = panes[pane];
  state.files.push({ name: fileName, body: '' });
  state.active = state.files.length - 1;
  syncEditors();
  saveBuffers();
  scheduleSilentRun();
  paneEditor(pane).focus();
}

export function seedBuffers() {
  setPanes({
    spec: { files: [{ name: current.spec.file, body: current.spec.body }], active: 0 },
    code: { files: [{ name: current.variant.file, body: current.variant.body }], active: 0 },
  });
  syncEditors();
  if (argvInput) argvInput.value = current.argv.join(' ');
}
