// Shared engine state for the /learn/ modules. Everything imports these as
// live bindings, so reads always see the current value; reassignment happens
// only through the setters below (ES module bindings are read-only to
// importers). Object/Set members are mutated in place by their owners.

export let data = null; // compiled chapter data, or null in the bare runner
export let current = null; // active chapter object
export let currentIndex = 0;
// Editable files, one list per pane: the left pane holds the Markdown spec
// side, the right the code side. Each pane shows its active file in the
// textarea; the editors' input listeners keep the active body in sync, so the
// model is always current. Chapters marked `locked` render padlocks instead
// of close buttons and a disabled "+".
export let panes = null; // { spec: { files: [{ name, body }], active }, code: { ... } }
export let assists = { help: 0, auto: 0 }; // in-memory per chapter visit
export let assistedSteps = new Set(); // step indices solved with an assist, current chapter
// `run: true` steps ask the user to press Run: an index lands here once a
// real, user-triggered run happened while every step before it passed, so
// background silent runs never clear one. Seeded from the persisted done
// count on open, so a revisit does not regress past a run already made.
export let realRunCleared = new Set();
export let lastResult = null; // r-context of the latest (also silent) run
export let active = null; // { worker, watchdog, silent } of the run in flight
export let saveTimer = null;
export let checkTimer = null;
export let lastSyncedStep = null; // step the accordion was last folded to; guards manual folds
export let typing = false; // typewriter in flight - runs and assists wait
export let assistRestoreFocus = null;

export function setData(v) { data = v; }
export function setCurrent(v) { current = v; }
export function setCurrentIndex(v) { currentIndex = v; }
export function setPanes(v) { panes = v; }
export function setAssists(v) { assists = v; }
export function setAssistedSteps(v) { assistedSteps = v; }
export function setRealRunCleared(v) { realRunCleared = v; }
export function setLastResult(v) { lastResult = v; }
export function setActive(v) { active = v; }
export function setSaveTimer(v) { saveTimer = v; }
export function setCheckTimer(v) { checkTimer = v; }
export function setLastSyncedStep(v) { lastSyncedStep = v; }
export function setTyping(v) { typing = v; }
export function setAssistRestoreFocus(v) { assistRestoreFocus = v; }
