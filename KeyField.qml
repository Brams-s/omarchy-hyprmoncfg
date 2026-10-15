import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui
import "FieldEdit.js" as FieldEdit

// A single-line field built from key events instead of Qt's text input.
// Every editable Qt TextInput (TextField, SpinBox, TextEdit, TextArea) asks the
// clipboard for its contents whenever another application changes it, so a
// field in the shell let any clipboard owner make the shell read whatever it
// offered, with no paste. This field never connects to the clipboard. It
// takes key events and draws its text, caret and selection itself; the
// editing rules are in FieldEdit.js.
//
// The clipboard is read only on an explicit Ctrl+V or Shift+Insert, out of
// process, for at most two seconds and 4096 bytes (FieldEdit.pasteCommand),
// with control characters removed. Nothing else reads it.
//
// Keys: typing, Left/Right (Ctrl by word, Shift to select), Home/End,
// Backspace/Delete (Ctrl by word), Ctrl+A, Enter. Up/Down emit stepRequested
// when `stepKeys` is set. Escape and Tab are left to the caller and the focus
// chain. The look and the API follow the kit's TextField (qs.Ui) so callers
// change only the type name.
Item {
  id: root

  property string text: ""
  property string placeholderText: ""
  property int maximumLength: 32767
  property int horizontalAlignment: Text.AlignLeft
  // Whole-text RegExp an edit must keep matching, like a Qt validator's
  // Invalid state; null allows any text.
  property var inputPattern: null
  property bool stepKeys: false
  property color foreground: Color.foreground
  property color accent: Color.accent
  property bool hasCursor: false
  property real horizontalPadding: Style.spacing.controlPaddingX
  property real verticalPadding: Style.spacing.inputPaddingY
  property real leftPadding: horizontalPadding + Border.left(_borderSpec)
  property real rightPadding: horizontalPadding + Border.right(_borderSpec)
  property alias font: label.font
  readonly property bool hovered: mouse.containsMouse
  readonly property int cursorPosition: _state.cursor
  readonly property int selectionStart: FieldEdit.selectionStart(_state)
  readonly property int selectionEnd: FieldEdit.selectionEnd(_state)
  readonly property string selectedText: text.slice(selectionStart, selectionEnd)
  readonly property bool pasting: pasteProcess.running

  signal accepted()
  signal editingFinished()
  signal textEdited()
  signal stepRequested(int delta)

  property var _state: FieldEdit.state("", 0)
  property bool _editing: false
  property real _scroll: 0
  // Measured imperatively in layoutText(), never from a binding, because
  // measuring changes the shared TextMetrics.
  property real _textWidth: 0
  property real _caretX: 0
  property real _selectionX: 0
  property real _selectionWidth: 0
  readonly property bool _hot: hovered || hasCursor
  readonly property var _borderSpec: Border.controlSpec(activeFocus ? "focus" : (_hot ? "hover-cursor" : "normal"), root.foreground, root.accent)

  activeFocusOnTab: true
  implicitWidth: Style.space(160)
  implicitHeight: Math.ceil(label.implicitHeight) + 2 * verticalPadding + Border.top(_borderSpec) + Border.bottom(_borderSpec)

  function apply(next) {
    if (next === root._state) return
    var changed = next.text !== root.text
    root._editing = true
    root._state = next
    if (changed) root.text = next.text
    root._editing = false
    root.layoutText()
    blink.restart()
    blink.on = true
    if (changed) root.textEdited()
  }

  function insert(value) { root.apply(FieldEdit.insert(root._state, value, root.maximumLength, root.inputPattern)) }
  function selectAll() { root.apply(FieldEdit.selectAll(root._state)) }
  function deselect() { root.apply(FieldEdit.state(root.text, root._state.cursor)) }

  function paste() {
    if (pasteProcess.running) return
    pasteProcess.command = FieldEdit.pasteCommand()
    pasteProcess.running = true
  }

  function finishPaste(raw) {
    if (!root.activeFocus || !root.enabled) return
    var value = FieldEdit.pastedText(raw)
    if (value !== "") root.insert(value)
  }

  function widthOf(value) {
    metrics.text = value
    return metrics.advanceWidth
  }

  function layoutText() {
    var s = root._state
    var caretX = root.widthOf(root.text.slice(0, s.cursor))
    var startX = root.widthOf(root.text.slice(0, FieldEdit.selectionStart(s)))
    var endX = root.widthOf(root.text.slice(0, FieldEdit.selectionEnd(s)))
    root._textWidth = root.widthOf(root.text)
    root._caretX = caretX
    root._selectionX = startX
    root._selectionWidth = endX - startX
    var full = root._textWidth + caret.width
    var visible = inner.width
    if (full <= visible) { root._scroll = 0; return }
    var scroll = Math.min(root._scroll, full - visible)
    if (caretX - scroll > visible - caret.width) scroll = caretX - visible + caret.width
    if (caretX - scroll < 0) scroll = caretX
    root._scroll = Math.max(0, scroll)
  }

  // Character position nearest to x in the field's text coordinates.
  function positionAt(x) {
    var best = 0, bestDistance = Math.abs(x)
    for (var i = 1; i <= root.text.length; i++) {
      var distance = Math.abs(root.widthOf(root.text.slice(0, i)) - x)
      if (distance < bestDistance) { best = i; bestDistance = distance }
    }
    return best
  }

  onTextChanged: {
    if (root._editing) return
    root._state = FieldEdit.state(root.text, root.text.length)
    root.layoutText()
  }
  onWidthChanged: root.layoutText()
  Component.onCompleted: root.layoutText()
  onActiveFocusChanged: {
    if (activeFocus) {
      root._state = FieldEdit.state(root.text, root._state.cursor)
      root.layoutText()
    } else {
      root._state = FieldEdit.state(root.text, root._state.cursor)
      root.editingFinished()
    }
  }

  Keys.onPressed: function(event) {
    var ctrl = (event.modifiers & Qt.ControlModifier) !== 0
    var shift = (event.modifiers & Qt.ShiftModifier) !== 0
    var alt = (event.modifiers & Qt.AltModifier) !== 0
    var meta = (event.modifiers & Qt.MetaModifier) !== 0
    var kind = FieldEdit.action(event.key, ctrl, shift, alt, {
      V: Qt.Key_V, Insert: Qt.Key_Insert, A: Qt.Key_A, Backspace: Qt.Key_Backspace,
      Delete: Qt.Key_Delete, Left: Qt.Key_Left, Right: Qt.Key_Right, Home: Qt.Key_Home,
      End: Qt.Key_End, Return: Qt.Key_Return, Enter: Qt.Key_Enter, Up: Qt.Key_Up, Down: Qt.Key_Down
    })
    var s = root._state
    if (kind === "paste") root.paste()
    else if (kind === "selectAll") root.selectAll()
    else if (kind === "backspace") root.apply(FieldEdit.backspace(s, ctrl, root.inputPattern))
    else if (kind === "delete") root.apply(FieldEdit.deleteForward(s, ctrl, root.inputPattern))
    else if (kind === "left") root.apply(FieldEdit.move(s, -1, ctrl, shift))
    else if (kind === "right") root.apply(FieldEdit.move(s, 1, ctrl, shift))
    else if (kind === "home") root.apply(FieldEdit.home(s, shift))
    else if (kind === "end") root.apply(FieldEdit.end(s, shift))
    else if (kind === "accept") {
      root.accepted()
      root.editingFinished()
    } else if ((kind === "up" || kind === "down") && root.stepKeys) {
      root.stepRequested(kind === "up" ? 1 : -1)
    } else {
      var typed = FieldEdit.typedText(event.text, ctrl, alt, meta)
      if (typed === "") return
      root.insert(typed)
    }
    event.accepted = true
  }

  TextMetrics {
    id: metrics
    font: label.font
  }

  BorderSurface {
    anchors.fill: parent
    color: Style.controlFill(root.activeFocus, root._hot, root.foreground, root.accent)
    borderSpec: root._borderSpec
    radius: Style.cornerRadius
  }

  Item {
    id: inner
    anchors.fill: parent
    anchors.leftMargin: root.leftPadding
    // The caret may sit in the right padding, as Qt's does, so text aligns
    // to the same edge whether or not the field has focus.
    anchors.rightMargin: Math.max(0, root.rightPadding - caret.width)
    clip: true

    readonly property real textWidth: root._textWidth
    readonly property real textRoom: width - caret.width
    // Where the text starts: aligned while it fits, scrolled to keep the
    // caret visible once it does not.
    readonly property real origin: textWidth > textRoom ? -root._scroll
      : (root.horizontalAlignment === Text.AlignRight ? textRoom - textWidth
        : (root.horizontalAlignment === Text.AlignHCenter ? (textRoom - textWidth) / 2 : 0))

    Rectangle {
      visible: root.activeFocus && root.selectionStart !== root.selectionEnd
      x: inner.origin + root._selectionX
      width: root._selectionWidth
      anchors.verticalCenter: parent.verticalCenter
      height: label.font.pixelSize * 1.3
      color: Style.selectionFillFor(root.foreground, root.accent)
    }

    Text {
      id: label
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
      x: root.text !== "" ? inner.origin
        : (root.horizontalAlignment === Text.AlignRight ? inner.textRoom - implicitWidth
          : (root.horizontalAlignment === Text.AlignHCenter ? (inner.textRoom - implicitWidth) / 2 : 0))
      text: root.text !== "" ? root.text : root.placeholderText
      color: root.text !== "" ? root.foreground : Qt.darker(root.foreground, 1.6)
      font.family: Style.font.family
      font.pixelSize: Style.font.body
      onFontChanged: root.layoutText()
    }

    Rectangle {
      id: caret
      visible: root.activeFocus && blink.on
      x: inner.origin + root._caretX
      anchors.verticalCenter: parent.verticalCenter
      width: Math.max(2, Style.spaceReal(2))
      height: label.font.pixelSize * 1.2
      color: root.foreground
    }
  }

  Timer {
    id: blink
    property bool on: true
    interval: 530
    repeat: true
    running: root.activeFocus
    onRunningChanged: on = true
    onTriggered: on = !on
  }

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.IBeamCursor
    onPressed: function(event) {
      root.forceActiveFocus()
      var at = root.positionAt(event.x - inner.x - inner.origin)
      root.apply(FieldEdit.state(root.text, at, (event.modifiers & Qt.ShiftModifier) ? root._state.anchor : at))
    }
    onPositionChanged: function(event) {
      if (!pressed) return
      root.apply(FieldEdit.state(root.text, root.positionAt(event.x - inner.x - inner.origin), root._state.anchor))
    }
    onDoubleClicked: root.selectAll()
  }

  Process {
    id: pasteProcess
    stdout: StdioCollector {
      id: pasteOutput
      onStreamFinished: root.finishPaste(pasteOutput.text)
    }
  }
}
