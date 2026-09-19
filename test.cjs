// Run with: node test.cjs. Executes the page's script with a minimal DOM and deferred fetches.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const elements = new Map(), requests = [], drafts = new Map();
  function element() {
    return {
      value: '', children: [], dataset: {}, hidden: false, listeners: {},
      style: {setProperty() {}}, classList: {toggle() {}, remove() {}, add() {}},
      set innerHTML(value) { this.children = []; },
      setAttribute() {}, insertBefore() {}, focus() {}, querySelector() { return null; },
      appendChild(child) { this.children.push(child); return child; },
      addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
      getContext() { return {}; }
    };
  }
  const get = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const context = vm.createContext({
    document: {getElementById: get, createElement: element, createTextNode: text => ({textContent: text}),
      querySelectorAll: () => [], addEventListener() {}},
    window: {matchMedia: () => ({matches: false})},
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    localStorage: {setItem: (k, v) => drafts.set(k, v), getItem: k => drafts.get(k)},
    fetch: () => new Promise((resolve, reject) => requests.push({resolve, reject}))
  });
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(script); // Check the complete script, including boot.
  vm.runInContext(script.slice(0, script.indexOf('  // ---------- boot ----------')) + `
    globalThis.app = {state, importFromText, buildJsonText, renderAll, loadBlank,
      loadRepoCar, closeRepoModal, restoreSnapshot, snapshot, renderPreview,
      initHistory: function(){ lastSnap = snapshot(); }, undo};
  })();`, context);
  return {app: context.app, get, requests};
}

const sample = '{"carName":"Test","carId":"test","carClass":"GT3","ledNumber":2,' +
  '"redlineBlinkInterval":0,"ledColor":["#FFFF0000","#FF00FF00","#FFFF0000"],' +
  '"ledRpm":[{"R":[8000,5000,7000],"N":[8000,5000,7000],"1":[8000,5000,7000]}]}';
const tick = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  const {app, get, requests} = setup();
  app.importFromText(sample);
  const before = app.snapshot();
  for (const key of ['carName', 'carId', 'carClass']) {
    assert.throws(() => app.importFromText(JSON.stringify({...JSON.parse(sample), [key]: 123})), /must be a string/);
    assert.equal(app.snapshot(), before, 'Rejected identity must preserve the current car');
  }
  for (const value of ['1e400', '-1e400', '"' + '9'.repeat(400) + '"']) {
    assert.throws(() => app.importFromText(sample.replace('5000', value)), /finite/);
    assert.equal(app.snapshot(), before, 'Rejected RPM must preserve the current car');
  }
  assert.deepEqual(JSON.parse(app.buildJsonText()), JSON.parse(sample));

  app.renderAll();
  const input = get('gearTableBody').children[0].children[1].children[0];
  input.value = '20000';
  input.listeners.input[0]();
  assert.equal(app.state.gearRpm.R[0], 20000);
  assert.equal(get('prevRpm').max, 23000, 'Manual edits must expand the preview range');
  input.value = '8000'; input.listeners.input[0]();
  assert.equal(get('prevRpm').max, 9200, 'Manual edits must also shrink the range');

  const entry = {path: 'assettocorsa/test.json'};
  const respond = (request, name) => request.resolve({ok: true, text: () => Promise.resolve(sample.replace('Test', name))});
  for (const cancel of [() => app.closeRepoModal(), () => app.loadBlank(),
    () => app.importFromText(sample), () => app.restoreSnapshot(before)]) {
    app.loadRepoCar('assettocorsa', entry);
    cancel();
    const expected = app.snapshot();
    respond(requests.shift(), 'Stale'); await tick();
    assert.equal(app.snapshot(), expected, 'A stale response must not replace current work');
  }
  app.loadRepoCar('assettocorsa', entry);
  const old = requests.shift();
  app.loadRepoCar('assettocorsa', entry);
  app.initHistory();
  respond(requests.shift(), 'Latest'); await tick();
  assert.equal(app.state.carName, 'Latest', 'The latest request must still load');
  respond(old, 'Stale'); await tick();
  assert.equal(app.state.carName, 'Latest', 'An older request must not win a race');
  app.undo();
  assert.equal(app.state.carName, 'Test', 'A completed load must remain undoable');
  app.loadRepoCar('assettocorsa', entry); app.closeRepoModal();
  get('repoStatus').textContent = 'Unchanged';
  requests.shift().reject(new Error('Late failure')); await tick();
  assert.equal(get('repoStatus').textContent, 'Unchanged', 'Ignore stale failures too');
  app.loadRepoCar('assettocorsa', entry);
  requests.shift().reject(new Error('Current failure')); await tick();
  assert.match(get('repoStatus').textContent, /Current failure/);
  console.log('PASS: atomic imports, finite RPMs, preview range, stale loads, load undo, and fetch errors');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
