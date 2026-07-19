// Shared DOM handles and storage keys for the /learn/ page modules. Element
// lookups run at module-eval time; the page loads tutorial.js as a deferred
// module, so the server-rendered nodes already exist.

export const ide = document.getElementById('ide');
export const specEditor = document.getElementById('ed-spec');
export const codeEditor = document.getElementById('ed-code');
export const terminal = document.getElementById('term-out');
export const runButton = document.getElementById('run-btn');
export const argvInput = document.getElementById('argv-input');
export const specTabs = document.getElementById('spec-tabs');
export const codeTabs = document.getElementById('code-tabs');

export const PROGRESS_KEY = 'ft-tutorial-progress';
export const BUFFERS_KEY = 'ft-tutorial-buffers';
export const STEPS_KEY = 'ft-tutorial-steps';
export const RUN_TIMEOUT_MS = 5000;

export const LOCK_TIP = 'This chapter does not allow file management';

export function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
