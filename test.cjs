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
    URLSearchParams,
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
      initHistory: function(){ lastSnap = snapshot(); }, undo, redo, flushCommit,
      buildCaptureOverrides, captureOverrideFileName, importCaptureOverrides,
      atsrDevelopmentFileName, parseCaptureOverrides, captureImportSim, exampleText:EXAMPLE_TEXT};
  })();`, context);
  return {app: context.app, get, requests, drafts};
}

const sample = '{"carName":"Test","carId":"test","carClass":"GT3","ledNumber":2,' +
  '"redlineBlinkInterval":0,"ledColor":["#FFFF0000","#FF00FF00","#FFFF0000"],' +
  '"ledRpm":[{"R":[8000,5000,7000],"N":[8000,5000,7000],"1":[8000,5000,7000]}]}';
const tick = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  const {app, get, requests, drafts} = setup();
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
  assert.equal(app.captureImportSim('?capture=clipboard&sim=automobilista2'), 'automobilista2');
  assert.equal(app.captureImportSim('?capture=clipboard&sim=unknown'), '');
  assert.equal(app.captureImportSim('?sim=automobilista2'), null);

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

  app.importFromText(sample);
  app.state.simId = 'lmu';
  app.state.carId = 'Lamborghini Iron Lynx 2024';
  app.state.ledNumber = 10;
  app.state.ledColors = Array.from({length: 11}, () => ({hex:'#FFFF0000', off:false}));
  for(const gear of app.state.gearOrder) app.state.gearRpm[gear] = Array(11).fill(5000);
  app.state.captureOverrides.colors = {'6':true, '7':true, '8':true};
  for(const i of [6,7,8]) app.state.ledColors[i].hex = '#FFFFFF00';
  assert.equal(app.captureOverrideFileName(), 'lamborghini-iron-lynx-2024.overrides.json');
  assert.equal(app.atsrDevelopmentFileName(), 'lamborghini-sc63.json');
  const sc63 = app.buildCaptureOverrides();
  assert.deepEqual(JSON.parse(JSON.stringify(sc63)), {game:'lmu', carId:'Lamborghini Iron Lynx 2024', ledNumber:10,
    ledColor:{'6':'#FFFFFF00','7':'#FFFFFF00','8':'#FFFFFF00'}});
  const rpmBefore = JSON.stringify(app.state.gearRpm);
  app.state.ledColors[6].hex = '#FFFF0000';
  app.importCaptureOverrides(JSON.stringify(sc63));
  assert.equal(app.state.ledColors[6].hex, '#FFFFFF00');
  assert.equal(app.state.ledColors[5].hex, '#FFFF0000');
  assert.equal(JSON.stringify(app.state.gearRpm), rpmBefore);
  assert.equal(app.state.redlineBlink, 0);
  assert.equal(app.buildJsonText().includes('captureOverrides'), false);
  assert.equal(app.buildJsonText().includes('"game"'), false);
  assert.equal(app.atsrDevelopmentFileName(), 'lamborghini-sc63.json');
  app.state.simId = 'assettocorsacompetizione';
  assert.equal(app.atsrDevelopmentFileName(), 'lamborghini-iron-lynx-2024.json');
  app.state.simId = 'le-mans-ultimate';
  assert.equal(app.atsrDevelopmentFileName(), 'lamborghini-sc63.json');

  app.importFromText(app.exampleText);
  app.state.simId = 'assettocorsacompetizione';
  const profileBefore = app.buildJsonText();
  const blinkOnly = {game:'assettocorsacompetizione', carId:'mclaren_720s_gt3_evo', ledNumber:12, redlineBlinkInterval:200};
  app.importCaptureOverrides(JSON.stringify(blinkOnly));
  assert.equal(app.captureOverrideFileName(), 'mclaren-720s-gt3-evo.overrides.json');
  assert.equal(app.state.redlineBlink, 200);
  assert.deepEqual(JSON.parse(app.buildJsonText()).ledColor, JSON.parse(profileBefore).ledColor);
  assert.deepEqual(JSON.parse(app.buildJsonText()).ledRpm, JSON.parse(profileBefore).ledRpm);
  assert.deepEqual(JSON.parse(JSON.stringify(app.buildCaptureOverrides())), blinkOnly);
  const stable = app.snapshot();
  for(const bad of [
    {...blinkOnly, game:'lmu'}, {...blinkOnly, carId:'other'}, {...blinkOnly, ledNumber:3},
    {...blinkOnly, ledRpm:[]}, {...blinkOnly, redlineBlinkInterval:-1},
    {...blinkOnly, redlineBlinkInterval:1.5}, {...blinkOnly, redlineBlinkInterval:2147483648},
    {...blinkOnly, redlineBlinkInterval:null},
    {game:blinkOnly.game, carId:blinkOnly.carId, ledNumber:12},
    {...blinkOnly, ledColor:{'13':'#FFFFFFFF'}}, {...blinkOnly, ledColor:{'01':'#FFFFFFFF'}},
    {...blinkOnly, ledColor:{'1':'red'}}, {...blinkOnly, ledColor:['#FFFFFFFF']}
  ]) {
    assert.throws(() => app.importCaptureOverrides(JSON.stringify(bad)));
    assert.equal(app.snapshot(), stable, 'Rejected override must preserve profile and selections');
  }
  for(const raw of ['"ledNumber":12.0', '"redlineBlinkInterval":2e2']) {
    assert.throws(() => app.importCaptureOverrides(JSON.stringify(blinkOnly).replace(raw.startsWith('"ledNumber"') ? '"ledNumber":12' : '"redlineBlinkInterval":200', raw)));
    assert.equal(app.snapshot(), stable);
  }
  assert.throws(() => app.importFromText(JSON.stringify(blinkOnly)), /capture override/);
  app.importCaptureOverrides(JSON.stringify({...blinkOnly, redlineBlinkInterval:0, ledColor:{'0':'#00000000'}}));
  assert.equal(app.state.ledColors[0].hex, '#00000000');
  assert.equal(app.state.gearRpm.R[0], 7200);
  assert.equal(app.buildCaptureOverrides().redlineBlinkInterval, 0);
  assert.equal(app.buildCaptureOverrides().ledColor['0'], '#00000000');
  app.flushCommit();
  assert.equal(JSON.parse(JSON.parse(drafts.get('rpm-led-builder:draft:v1')).snap).state.captureOverrides.blink, true);
  app.undo();
  assert.equal(app.state.redlineBlink, 200);
  app.redo();
  assert.equal(app.state.redlineBlink, 0);
  const oldDraft = JSON.parse(app.snapshot()); delete oldDraft.state.captureOverrides;
  app.restoreSnapshot(JSON.stringify(oldDraft));
  assert.deepEqual(JSON.parse(JSON.stringify(app.state.captureOverrides)), {colors:{},blink:false});
  app.importCaptureOverrides(JSON.stringify(blinkOnly));
  get('fCarId').value = 'another_car'; get('fCarId').listeners.input[0]();
  assert.equal(app.state.captureOverrides.blink, false);
  app.importCaptureOverrides(JSON.stringify({...blinkOnly, carId:'another_car'}));
  get('fLedNumber').value = '3'; get('fLedNumber').listeners.change[0]({target:get('fLedNumber')});
  assert.equal(app.state.captureOverrides.blink, false);
  app.loadBlank();
  assert.deepEqual(JSON.parse(JSON.stringify(app.state.captureOverrides)), {colors:{},blink:false});
  console.log('PASS: atomic imports, finite RPMs, preview range, stale loads, load undo, and fetch errors');
  console.log('PASS: sparse capture overrides, validation, history, identity, and ATSR filename');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
