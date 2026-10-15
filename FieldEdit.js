// Pure editing for KeyField, the panel's text field built from key events.
// A field's state is { text, cursor, anchor }: the caret sits at `cursor`, and
// the selection runs between `anchor` and `cursor` (none when they are equal).
// Every function returns a new state and leaves its argument alone, so the
// QML only assigns what these return and node tests cover the editing rules.

// The most a paste may insert, and the most the panel reads from the clipboard.
var pasteLimit = 4096

// The clipboard read, run only for an explicit paste (Ctrl+V or Shift+Insert):
// at most two seconds, killed a second later, and at most pasteLimit bytes.
// Fixed argv: nothing typed or pasted ever becomes a process argument.
function pasteCommand() {
  return ["sh", "-c",
    "timeout -k 1 2 wl-paste --no-newline --type text/plain 2>/dev/null | head -c " + pasteLimit]
}

function state(text, cursor, anchor) {
  var t = String(text === undefined || text === null ? "" : text)
  var c = clamp(cursor === undefined ? t.length : cursor, t)
  return { text: t, cursor: c, anchor: anchor === undefined ? c : clamp(anchor, t) }
}

function clamp(position, text) {
  var n = Math.floor(Number(position))
  if (!isFinite(n) || n < 0) return 0
  return Math.min(n, text.length)
}

function hasSelection(s) { return s.cursor !== s.anchor }
function selectionStart(s) { return Math.min(s.cursor, s.anchor) }
function selectionEnd(s) { return Math.max(s.cursor, s.anchor) }

// Text as one line of printable characters: C0 and C1 controls, DEL, and the
// Unicode line and paragraph separators are dropped (so a pasted newline,
// tab or escape sequence cannot reach the field), as are unpaired surrogates.
function sanitize(text) {
  var value = String(text === undefined || text === null ? "" : text)
  var out = ""
  for (var i = 0; i < value.length; i++) {
    var code = value.charCodeAt(i)
    if (code < 32 || (code >= 127 && code < 160) || code === 0x2028 || code === 0x2029) continue
    if (code >= 0xD800 && code <= 0xDBFF) {
      var next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0
      if (next >= 0xDC00 && next <= 0xDFFF) { out += value.charAt(i) + value.charAt(i + 1); i++ }
      continue
    }
    if (code >= 0xDC00 && code <= 0xDFFF) continue
    out += value.charAt(i)
  }
  return out
}

// Whether `text` is allowed while editing. `pattern` is a RegExp the whole text
// must match (the way Qt's RegularExpressionValidator rejects keystrokes), or
// null for free text.
function allowed(text, pattern) {
  if (!pattern) return true
  pattern.lastIndex = 0
  var match = pattern.exec(text)
  return !!match && match.index === 0 && match[0].length === text.length
}

function replaceSelection(s, insert, maxLength, pattern) {
  var start = selectionStart(s), end = selectionEnd(s)
  var room = Math.max(0, Number(maxLength === undefined ? 32767 : maxLength) - (s.text.length - (end - start)))
  var value = sanitize(insert)
  if (value.length > room) {
    value = value.slice(0, room)
    // Never keep half of a surrogate pair at the cut.
    var last = value.length ? value.charCodeAt(value.length - 1) : 0
    if (last >= 0xD800 && last <= 0xDBFF) value = value.slice(0, -1)
  }
  if (value === "" && start === end) return s
  var text = s.text.slice(0, start) + value + s.text.slice(end)
  if (!allowed(text, pattern)) return s
  return state(text, start + value.length)
}

function insert(s, value, maxLength, pattern) {
  return replaceSelection(s, value, maxLength, pattern)
}

// One character back or forward from `position`, stepping over a surrogate pair.
function previousPosition(text, position) {
  if (position <= 0) return 0
  var code = text.charCodeAt(position - 1)
  if (code >= 0xDC00 && code <= 0xDFFF && position >= 2) {
    var lead = text.charCodeAt(position - 2)
    if (lead >= 0xD800 && lead <= 0xDBFF) return position - 2
  }
  return position - 1
}

function nextPosition(text, position) {
  if (position >= text.length) return text.length
  var code = text.charCodeAt(position)
  if (code >= 0xD800 && code <= 0xDBFF && position + 1 < text.length) {
    var trail = text.charCodeAt(position + 1)
    if (trail >= 0xDC00 && trail <= 0xDFFF) return position + 2
  }
  return position + 1
}

function isWordChar(ch) { return /[0-9A-Za-z_À-￿]/.test(ch) }

// Start of the word before `position`, skipping separators first, as
// Ctrl+Backspace and Ctrl+Left do in Qt's own line edits.
function previousWord(text, position) {
  var i = position
  while (i > 0 && !isWordChar(text.charAt(i - 1))) i--
  while (i > 0 && isWordChar(text.charAt(i - 1))) i--
  return i
}

function nextWord(text, position) {
  var i = position
  while (i < text.length && !isWordChar(text.charAt(i))) i++
  while (i < text.length && isWordChar(text.charAt(i))) i++
  return i
}

function removeRange(s, start, end, pattern) {
  if (start === end) return s
  var text = s.text.slice(0, start) + s.text.slice(end)
  if (!allowed(text, pattern)) return s
  return state(text, start)
}

function backspace(s, word, pattern) {
  if (hasSelection(s)) return removeRange(s, selectionStart(s), selectionEnd(s), pattern)
  var start = word ? previousWord(s.text, s.cursor) : previousPosition(s.text, s.cursor)
  return removeRange(s, start, s.cursor, pattern)
}

function deleteForward(s, word, pattern) {
  if (hasSelection(s)) return removeRange(s, selectionStart(s), selectionEnd(s), pattern)
  var end = word ? nextWord(s.text, s.cursor) : nextPosition(s.text, s.cursor)
  return removeRange(s, s.cursor, end, pattern)
}

// Caret movement. `direction` is -1 or 1; `word` moves by word; `extend`
// keeps the anchor (Shift). Without Shift, Left/Right collapse a selection to
// its start or end, as Qt does.
function move(s, direction, word, extend) {
  if (!extend && hasSelection(s) && !word)
    return state(s.text, direction < 0 ? selectionStart(s) : selectionEnd(s))
  var target = direction < 0
    ? (word ? previousWord(s.text, s.cursor) : previousPosition(s.text, s.cursor))
    : (word ? nextWord(s.text, s.cursor) : nextPosition(s.text, s.cursor))
  return state(s.text, target, extend ? s.anchor : target)
}

function home(s, extend) { return state(s.text, 0, extend ? s.anchor : 0) }
function end(s, extend) { return state(s.text, s.text.length, extend ? s.anchor : s.text.length) }
function selectAll(s) { return state(s.text, s.text.length, 0) }

// The clipboard text a paste inserts: sanitized and at most pasteLimit
// characters, whatever the reader returned.
function pastedText(raw) {
  // A byte cut in the middle of a UTF-8 character decodes as U+FFFD; drop it.
  var value = sanitize(raw).replace(/\uFFFD+$/, "")
  return value.length > pasteLimit ? value.slice(0, pasteLimit) : value
}

// Which editing action a key press is, independent of Qt types so it can be
// tested: key names are passed in as `keys` (Qt.Key_* values in QML).
// Returns one of "paste", "selectAll", "backspace", "delete", "left", "right",
// "home", "end", "accept", "up", "down", or "" for a key the field ignores
// (or "type" for printable text, checked by typedText).
function action(key, ctrl, shift, alt, keys) {
  if (key === keys.V && ctrl && !alt) return "paste"
  if (key === keys.Insert && shift && !ctrl && !alt) return "paste"
  if (key === keys.A && ctrl && !alt) return "selectAll"
  if (key === keys.Backspace) return "backspace"
  if (key === keys.Delete) return "delete"
  if (key === keys.Left) return "left"
  if (key === keys.Right) return "right"
  if (key === keys.Home) return "home"
  if (key === keys.End) return "end"
  if (key === keys.Return || key === keys.Enter) return "accept"
  if (key === keys.Up) return "up"
  if (key === keys.Down) return "down"
  return ""
}

// The printable text a key event types, or "" when it types nothing: any
// Ctrl, Alt or Meta chord types nothing, and control characters never do.
function typedText(text, ctrl, alt, meta) {
  if (ctrl || alt || meta) return ""
  var value = String(text || "")
  return sanitize(value) === value ? value : ""
}

if (typeof module !== "undefined") {
  module.exports = {
    pasteLimit: pasteLimit,
    pasteCommand: pasteCommand,
    state: state,
    hasSelection: hasSelection,
    selectionStart: selectionStart,
    selectionEnd: selectionEnd,
    sanitize: sanitize,
    allowed: allowed,
    insert: insert,
    backspace: backspace,
    deleteForward: deleteForward,
    move: move,
    home: home,
    end: end,
    selectAll: selectAll,
    pastedText: pastedText,
    action: action,
    typedText: typedText,
    previousWord: previousWord,
    nextWord: nextWord
  }
}
