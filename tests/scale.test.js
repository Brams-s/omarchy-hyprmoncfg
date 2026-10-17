const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const Model = require("../Model.js")

const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")

// Parity vectors generated from hyprmoncfg internal/scaling (GridScales(w, h, 1, 4),
// the editor_state scale_options list) and an independent Go implementation of the
// preset rule. The TUI mirrors the same vectors.
const CASES = [{"mode": [3840, 2160], "sharp": [1, 1.06667, 1.2, 1.25, 1.33333, 1.5, 1.6, 1.66667, 1.875, 2, 2.4, 2.5, 2.66667, 3, 3.2, 3.33333, 3.75, 4], "pills": [1, 1.25, 1.5, 1.6, 2, 3], "labels": ["1x", "1.25x", "1.5x", "1.6x", "2x", "3x"]}, {"mode": [2560, 1600], "sharp": [1, 1.06667, 1.25, 1.33333, 1.6, 1.66667, 2, 2.13333, 2.5, 2.66667, 3.2, 3.33333, 4], "pills": [1, 1.25, 1.6, 2, 3.2], "labels": ["1x", "1.25x", "1.6x", "2x", "3.2x"]}, {"mode": [2256, 1504], "sharp": [1, 1.06667, 1.175, 1.33333, 1.56667, 1.6, 1.95833, 2, 2.35, 2.66667, 3.13333, 3.2, 3.91667, 4], "pills": [1, 1.33333, 1.56667, 1.6, 2, 3.13333], "labels": ["1x", "1.33x", "1.57x", "1.6x", "2x", "3.13x"]}, {"mode": [5120, 2880], "sharp": [1, 1.06667, 1.25, 1.33333, 1.6, 1.66667, 2, 2.13333, 2.5, 2.66667, 3.2, 3.33333, 4], "pills": [1, 1.25, 1.6, 2, 3.2, 4], "labels": ["1x", "1.25x", "1.6x", "2x", "3.2x", "4x"]}, {"mode": [3024, 1964], "sharp": [1, 1.33333, 2, 4], "pills": [1, 1.33333, 2, 4], "labels": ["1x", "1.33x", "2x", "4x"]}, {"mode": [1366, 768], "sharp": [1, 2], "pills": [1, 2], "labels": ["1x", "2x"]}, {"mode": [7680, 4320], "sharp": [1, 1.06667, 1.2, 1.25, 1.33333, 1.5, 1.6, 1.66667, 1.875, 2, 2.13333, 2.4, 2.5, 2.66667, 3, 3.2, 3.33333, 3.75, 4], "pills": [1, 1.25, 1.5, 1.6, 2, 3, 4], "labels": ["1x", "1.25x", "1.5x", "1.6x", "2x", "3x", "4x"]}]

const STUDIO_4K = CASES[0].sharp
const displays = sharp => [{ key: "k", scale_options: sharp }]

test("preset pills map like Omarchy: next sharp scale at or above, deduplicated, preset order", () => {
  for (const c of CASES) {
    const [width] = c.mode
    const pills = Model.scalePresets(displays(c.sharp), "k", c.pills[0], width)
    assert.deepEqual(pills.map(p => Number(p.value)), c.pills, c.mode.join("x"))
    assert.deepEqual(pills.map(p => p.label), c.labels, c.mode.join("x") + " labels")
  }
})

test("4x is a preset only on 5K-class modes where it is sharp", () => {
  const fourK = Model.scalePresets(displays(STUDIO_4K), "k", 1, 3840).map(p => p.value)
  assert.ok(STUDIO_4K.includes(4) && !fourK.includes("4"), "sharp on 4K, but not offered as a preset")
  const fiveK = CASES.find(c => c.mode[0] === 5120)
  assert.ok(Model.scalePresets(displays(fiveK.sharp), "k", 1, 5120).some(p => p.value === "4"))
})

test("compact labels: two decimals, zeros trimmed, exact when two would collide", () => {
  const labels = Model.compactScaleLabels([1, 1.06667, 1.33333, 1.875, 2, 2.13333])
  assert.deepEqual(labels, { "1": "1x", "1.06667": "1.07x", "1.33333": "1.33x", "1.875": "1.88x", "2": "2x", "2.13333": "2.13x" })
  const clash = Model.compactScaleLabels([1.33333, 1.334])
  assert.deepEqual(clash, { "1.33333": "1.33333x", "1.334": "1.334x" }, "no two choices read alike")
  const options = Model.scaleOptions(displays(STUDIO_4K), "k", 1.5)
  assert.equal(options[1].value, "1.06667", "the stored value stays exact")
  assert.equal(options[1].label, "1.07x")
})

test("More lists every sharp scale; a current scale that is not a pill shows on More", () => {
  const all = Model.scaleOptions(displays(STUDIO_4K), "k", 1.5)
  assert.deepEqual(all.map(o => Number(o.value)), STUDIO_4K)

  const unsharp = Model.scaleRow(displays(STUDIO_4K), "k", 1.7, 3840, 2160)
  assert.deepEqual(unsharp.presets.map(p => p.value), ["1", "1.25", "1.5", "1.6", "2", "3"], "no extra pill")
  assert.equal(unsharp.onMore, true)
  assert.equal(unsharp.moreText, "1.7x ⚠")
  assert.equal(unsharp.detail, "1.7x ⚠ Not sharp")
  assert.equal(unsharp.sharp, false)
  const listed = unsharp.options.find(o => o.value === "1.7")
  assert.deepEqual(listed, { value: "1.7", label: "1.7x ⚠", sharp: false }, "and it is in More, marked")

  const sharpNonPreset = Model.scaleRow(displays(STUDIO_4K), "k", 2.66667, 3840, 2160)
  assert.deepEqual(sharpNonPreset.presets.map(p => p.label), ["1x", "1.25x", "1.5x", "1.6x", "2x", "3x"])
  assert.equal(sharpNonPreset.moreText, "2.67x")
  assert.equal(sharpNonPreset.detail, "2.67x")
  assert.equal(sharpNonPreset.sharp, true)

  const preset = Model.scaleRow(displays(STUDIO_4K), "k", 1.5, 3840, 2160)
  assert.equal(preset.onMore, false)
  assert.equal(preset.moreText, "More")
  assert.equal(preset.detail, "1.5x")
  assert.ok(preset.presets.every(p => p.sharp))
  assert.equal(Model.scalePresets([], "none", 1.25, 0).length, 0, "no backend list: no pills, the value sits on More")
})

test("stepping through every sharp scale never changes the pill count", () => {
  const options = Model.scaleOptions(displays(STUDIO_4K), "k", 1)
  let value = "1"
  const counts = new Set()
  for (let i = 0; i < 25; i++) {
    counts.add(Model.scaleRow(displays(STUDIO_4K), "k", Number(value), 3840, 2160).presets.length)
    value = Model.stepScaleOption(options, value, 1)
  }
  assert.deepEqual([...counts], [6])
})

// Generated from hyprmoncfg internal/scaling Sharp and ClosestSharp (0.25 to 4).
const SHARP = [{"mode":[3840,2160],"value":0.25,"sharp":true,"closest":0.25},{"mode":[3840,2160],"value":0.5,"sharp":true,"closest":0.5},{"mode":[3840,2160],"value":0.7,"sharp":false,"closest":0.66667},{"mode":[3840,2160],"value":1,"sharp":true,"closest":1},{"mode":[3840,2160],"value":1.07,"sharp":false,"closest":1.06667},{"mode":[3840,2160],"value":1.2,"sharp":true,"closest":1.2},{"mode":[3840,2160],"value":1.25,"sharp":true,"closest":1.25},{"mode":[3840,2160],"value":1.3,"sharp":false,"closest":1.33333},{"mode":[3840,2160],"value":1.33,"sharp":false,"closest":1.33333},{"mode":[3840,2160],"value":1.33333,"sharp":true,"closest":1.33333},{"mode":[3840,2160],"value":1.5,"sharp":true,"closest":1.5},{"mode":[3840,2160],"value":1.6,"sharp":true,"closest":1.6},{"mode":[3840,2160],"value":1.66667,"sharp":true,"closest":1.66667},{"mode":[3840,2160],"value":1.75,"sharp":false,"closest":1.66667},{"mode":[3840,2160],"value":2,"sharp":true,"closest":2},{"mode":[3840,2160],"value":2.4,"sharp":true,"closest":2.4},{"mode":[3840,2160],"value":3,"sharp":true,"closest":3},{"mode":[3840,2160],"value":3.2,"sharp":true,"closest":3.2},{"mode":[3840,2160],"value":3.7,"sharp":false,"closest":3.75},{"mode":[3840,2160],"value":4,"sharp":true,"closest":4},{"mode":[2560,1600],"value":0.25,"sharp":true,"closest":0.25},{"mode":[2560,1600],"value":0.5,"sharp":true,"closest":0.5},{"mode":[2560,1600],"value":0.7,"sharp":false,"closest":0.66667},{"mode":[2560,1600],"value":1,"sharp":true,"closest":1},{"mode":[2560,1600],"value":1.07,"sharp":false,"closest":1.06667},{"mode":[2560,1600],"value":1.2,"sharp":false,"closest":1.25},{"mode":[2560,1600],"value":1.25,"sharp":true,"closest":1.25},{"mode":[2560,1600],"value":1.3,"sharp":false,"closest":1.33333},{"mode":[2560,1600],"value":1.33,"sharp":false,"closest":1.33333},{"mode":[2560,1600],"value":1.33333,"sharp":true,"closest":1.33333},{"mode":[2560,1600],"value":1.5,"sharp":false,"closest":1.6},{"mode":[2560,1600],"value":1.6,"sharp":true,"closest":1.6},{"mode":[2560,1600],"value":1.66667,"sharp":true,"closest":1.66667},{"mode":[2560,1600],"value":1.75,"sharp":false,"closest":1.66667},{"mode":[2560,1600],"value":2,"sharp":true,"closest":2},{"mode":[2560,1600],"value":2.4,"sharp":false,"closest":2.5},{"mode":[2560,1600],"value":3,"sharp":false,"closest":3.2},{"mode":[2560,1600],"value":3.2,"sharp":true,"closest":3.2},{"mode":[2560,1600],"value":3.7,"sharp":false,"closest":4},{"mode":[2560,1600],"value":4,"sharp":true,"closest":4},{"mode":[2256,1504],"value":0.25,"sharp":true,"closest":0.25},{"mode":[2256,1504],"value":0.5,"sharp":true,"closest":0.5},{"mode":[2256,1504],"value":0.7,"sharp":false,"closest":0.66667},{"mode":[2256,1504],"value":1,"sharp":true,"closest":1},{"mode":[2256,1504],"value":1.07,"sharp":false,"closest":1.06667},{"mode":[2256,1504],"value":1.2,"sharp":false,"closest":1.175},{"mode":[2256,1504],"value":1.25,"sharp":false,"closest":1.175},{"mode":[2256,1504],"value":1.3,"sharp":false,"closest":1.33333},{"mode":[2256,1504],"value":1.33,"sharp":false,"closest":1.33333},{"mode":[2256,1504],"value":1.33333,"sharp":true,"closest":1.33333},{"mode":[2256,1504],"value":1.5,"sharp":false,"closest":1.56667},{"mode":[2256,1504],"value":1.6,"sharp":true,"closest":1.6},{"mode":[2256,1504],"value":1.66667,"sharp":false,"closest":1.6},{"mode":[2256,1504],"value":1.75,"sharp":false,"closest":1.6},{"mode":[2256,1504],"value":2,"sharp":true,"closest":2},{"mode":[2256,1504],"value":2.4,"sharp":false,"closest":2.35},{"mode":[2256,1504],"value":3,"sharp":false,"closest":3.13333},{"mode":[2256,1504],"value":3.2,"sharp":true,"closest":3.2},{"mode":[2256,1504],"value":3.7,"sharp":false,"closest":3.91667},{"mode":[2256,1504],"value":4,"sharp":true,"closest":4},{"mode":[1366,768],"value":0.25,"sharp":true,"closest":0.25},{"mode":[1366,768],"value":0.5,"sharp":true,"closest":0.5},{"mode":[1366,768],"value":0.7,"sharp":false,"closest":0.66667},{"mode":[1366,768],"value":1,"sharp":true,"closest":1},{"mode":[1366,768],"value":1.07,"sharp":false,"closest":1},{"mode":[1366,768],"value":1.2,"sharp":false,"closest":1},{"mode":[1366,768],"value":1.25,"sharp":false,"closest":1},{"mode":[1366,768],"value":1.3,"sharp":false,"closest":1},{"mode":[1366,768],"value":1.33,"sharp":false,"closest":1},{"mode":[1366,768],"value":1.33333,"sharp":false,"closest":1},{"mode":[1366,768],"value":1.5,"sharp":false,"closest":1},{"mode":[1366,768],"value":1.6,"sharp":false,"closest":2},{"mode":[1366,768],"value":1.66667,"sharp":false,"closest":2},{"mode":[1366,768],"value":1.75,"sharp":false,"closest":2},{"mode":[1366,768],"value":2,"sharp":true,"closest":2},{"mode":[1366,768],"value":2.4,"sharp":false,"closest":2},{"mode":[1366,768],"value":3,"sharp":false,"closest":2},{"mode":[1366,768],"value":3.2,"sharp":false,"closest":2},{"mode":[1366,768],"value":3.7,"sharp":false,"closest":2},{"mode":[1366,768],"value":4,"sharp":false,"closest":2},{"mode":[2880,1800],"value":0.25,"sharp":true,"closest":0.25},{"mode":[2880,1800],"value":0.5,"sharp":true,"closest":0.5},{"mode":[2880,1800],"value":0.7,"sharp":false,"closest":0.66667},{"mode":[2880,1800],"value":1,"sharp":true,"closest":1},{"mode":[2880,1800],"value":1.07,"sharp":false,"closest":1.125},{"mode":[2880,1800],"value":1.2,"sharp":true,"closest":1.2},{"mode":[2880,1800],"value":1.25,"sharp":true,"closest":1.25},{"mode":[2880,1800],"value":1.3,"sharp":false,"closest":1.33333},{"mode":[2880,1800],"value":1.33,"sharp":false,"closest":1.33333},{"mode":[2880,1800],"value":1.33333,"sharp":true,"closest":1.33333},{"mode":[2880,1800],"value":1.5,"sharp":true,"closest":1.5},{"mode":[2880,1800],"value":1.6,"sharp":true,"closest":1.6},{"mode":[2880,1800],"value":1.66667,"sharp":true,"closest":1.66667},{"mode":[2880,1800],"value":1.75,"sharp":false,"closest":1.8},{"mode":[2880,1800],"value":2,"sharp":true,"closest":2},{"mode":[2880,1800],"value":2.4,"sharp":true,"closest":2.4},{"mode":[2880,1800],"value":3,"sharp":true,"closest":3},{"mode":[2880,1800],"value":3.2,"sharp":false,"closest":3.33333},{"mode":[2880,1800],"value":3.7,"sharp":false,"closest":3.75},{"mode":[2880,1800],"value":4,"sharp":true,"closest":4},{"mode":[1920,1080],"value":0.25,"sharp":true,"closest":0.25},{"mode":[1920,1080],"value":0.5,"sharp":true,"closest":0.5},{"mode":[1920,1080],"value":0.7,"sharp":false,"closest":0.66667},{"mode":[1920,1080],"value":1,"sharp":true,"closest":1},{"mode":[1920,1080],"value":1.07,"sharp":false,"closest":1},{"mode":[1920,1080],"value":1.2,"sharp":true,"closest":1.2},{"mode":[1920,1080],"value":1.25,"sharp":true,"closest":1.25},{"mode":[1920,1080],"value":1.3,"sharp":false,"closest":1.33333},{"mode":[1920,1080],"value":1.33,"sharp":false,"closest":1.33333},{"mode":[1920,1080],"value":1.33333,"sharp":true,"closest":1.33333},{"mode":[1920,1080],"value":1.5,"sharp":true,"closest":1.5},{"mode":[1920,1080],"value":1.6,"sharp":true,"closest":1.6},{"mode":[1920,1080],"value":1.66667,"sharp":true,"closest":1.66667},{"mode":[1920,1080],"value":1.75,"sharp":false,"closest":1.66667},{"mode":[1920,1080],"value":2,"sharp":true,"closest":2},{"mode":[1920,1080],"value":2.4,"sharp":true,"closest":2.4},{"mode":[1920,1080],"value":3,"sharp":true,"closest":3},{"mode":[1920,1080],"value":3.2,"sharp":false,"closest":3.33333},{"mode":[1920,1080],"value":3.7,"sharp":false,"closest":3.75},{"mode":[1920,1080],"value":4,"sharp":true,"closest":4}]

test("sharpness and the closest sharp scale match the backend", () => {
  for (const v of SHARP) {
    const [w, h] = v.mode
    assert.equal(Model.scaleIsSharp(w, h, v.value), v.sharp, w + "x" + h + " @ " + v.value)
    assert.equal(Model.closestSharpScale(w, h, v.value), v.closest, w + "x" + h + " closest to " + v.value)
  }
})

test("Custom… validates like the TUI and explains sharpness the same way", () => {
  assert.deepEqual(Model.parseScaleEntry(""), { error: "scale is required" })
  assert.deepEqual(Model.parseScaleEntry("1."), { error: "scale must be a number" })
  assert.deepEqual(Model.parseScaleEntry("abc"), { error: "scale must be a number" })
  assert.deepEqual(Model.parseScaleEntry("5"), { error: "scale must be between 0.25 and 4" })
  assert.deepEqual(Model.parseScaleEntry("0.2"), { error: "scale must be between 0.25 and 4" })
  assert.deepEqual(Model.parseScaleEntry(" 1.333333 "), { value: 1.33333 })

  const sharp = Model.scaleEntryFeedback(3840, 2160, "1.5")
  assert.equal(sharp.apply, 1.5)
  assert.deepEqual(sharp.lines, [{ tone: "ok", text: "Sharp: 3840 / 1.5 = 2560, 2160 / 1.5 = 1440 logical px." }])

  const blurry = Model.scaleEntryFeedback(3840, 2160, "1.33")
  assert.equal(blurry.apply, 1.33333, "Enter applies the closest sharp scale, as in the TUI")
  assert.deepEqual(blurry.lines.map(l => l.text), [
    "⚠ Not sharp: final size has fractional px (3840 / 1.33 = 2887.22, 2160 / 1.33 = 1624.06).",
    "Closest sharp: 1.33333 -> 2880 x 1620 logical px. Enter applies it."
  ])
  const invalid = Model.scaleEntryFeedback(3840, 2160, "9")
  assert.equal(invalid.apply, null)
  assert.equal(invalid.lines[0].tone, "error")
})

test("keyboard steps through the full sharp list like the TUI and stops at the ends", () => {
  const options = Model.scaleOptions(displays(STUDIO_4K), "k", 1.5)
  assert.equal(Model.stepScaleOption(options, "1.5", 1), "1.6")
  assert.equal(Model.stepScaleOption(options, "1.5", -1), "1.33333", "steps include sharp scales that are not presets")
  assert.equal(Model.stepScaleOption(options, "4", 1), "4")
  assert.equal(Model.stepScaleOption(options, "1", -1), "1")
  assert.equal(Model.stepScaleOption(options, "1.55", 1), "1.6")
  assert.equal(Model.stepScaleOption(options, "1.55", -1), "1.5")
  assert.equal(Model.stepScaleOption([], "1.5", 1), "1.5")
})

test("arrows step Scale; Enter opens More", () => {
  const edits = []
  let opened = 0
  const root = {
    selectedOutput: { scale: 1.5 }, managedChecked: true, editPending: false, previewTransaction: "",
    keyboardInspectorField: 2, selectedOutputKey: "k",
    editorDocument: { displays: displays(STUDIO_4K) },
    editOutput: edit => edits.push(JSON.parse(JSON.stringify(edit))),
    bounded: (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  }
  const source = name => qml.match(new RegExp("^  function " + name + "\\([\\s\\S]*?^  }", "m"))[0]
  root.adjustInspectorField = vm.runInNewContext("(" + source("adjustInspectorField") + ")", { root, Model })
  const activate = vm.runInNewContext("(" + source("activateInspectorField") + ")",
    { root, Model, scaleField: { more: { open() { opened++ } } } })
  root.adjustInspectorField(1)
  root.adjustInspectorField(-1)
  activate()
  assert.deepEqual(edits, [{ scale: 1.6 }, { scale: 1.33333 }])
  assert.equal(opened, 1)
})

test("Scale is Omarchy's pill row plus a More dropdown, fed by the backend list", () => {
  const scale = fs.readFileSync(path.join(__dirname, "..", "ScaleField.qml"), "utf8")
  const dropdown = fs.readFileSync(path.join(__dirname, "..", "PanelDropdown.qml"), "utf8")
  assert.match(qml, /ScaleField \{\s+id: scaleField/)
  assert.match(qml, /readonly property var row: Model\.scaleRow\(root\.editorDocument\.displays, root\.selectedOutputKey,/)
  assert.match(qml, /presets: row\.presets\s+allOptions: row\.options/)
  assert.match(qml, /else if \(field === 2\) scaleField\.more\.open\(\)/)
  assert.match(qml, /scaleField\.more\.popupOpen/)
  assert.match(qml, /scaleField\.customInput\.activeFocus/, "typing a custom scale holds the panel's keys")
  assert.doesNotMatch(qml, /scaleDropdown/)
  assert.match(scale, /bordered: true/)
  assert.match(scale, /active: String\(modelData\.value\) === root\.value/, "Omarchy's ScalePill marks the current scale as active")
  assert.match(scale, /triggerText: root\.moreText/)
  assert.match(scale, /active: root\.onMore/, "More carries an off-preset current scale as active")
  assert.match(scale, /options: root\.allOptions\.concat\(\[\{ value: "custom", label: "Custom…" \}\]\)/)
  assert.match(scale, /KeyField \{\s+id: customInput/, "Custom… is built from key events")
  assert.doesNotMatch(scale, /TextField|TextInput|SpinBox/)
  assert.match(scale, /text: "SCALE"/)
  assert.match(dropdown, /text: root\.triggerText !== "" \? root\.triggerText : root\.currentLabel\(\)/)
})

test("pill rows stop at their ends like Omarchy's ButtonGroup", () => {
  const vrr = [{ value: "0", label: "Off" }, { value: "1", label: "On" }, { value: "2", label: "Fullscreen" }]
  assert.equal(Model.stepOptionValue(vrr, "2", 1), "2")
  assert.equal(Model.stepOptionValue(vrr, "0", -1), "0")
  assert.equal(Model.stepOptionValue(vrr, "1", 1), "2")
  assert.equal(Model.stepOptionValue(vrr, "7", 1), "7", "an unrecognised value is never rewritten")
  const qml = fs.readFileSync(path.join(__dirname, "..", "Panel.qml"), "utf8")
  for (const field of ["edit.vrr", "edit.bitdepth", "edit.sdr_eotf", "edit.supports_wide_color", "edit.supports_hdr"]) {
    const line = qml.split("\n").find(l => l.includes(field + " = "))
    assert.match(line, /root\.pillStep\(/, field + " should stop at the ends")
  }
})
