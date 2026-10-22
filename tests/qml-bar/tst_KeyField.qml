import QtQuick
import QtTest
import "../.."

// Run with -import tests/qml-bar/stubs. The Quickshell.Io stub records the
// paste command instead of running it, so nothing reads the real clipboard.
Rectangle {
  id: stage
  width: 400
  height: 200
  color: "#101010"

  Component {
    id: fieldComponent
    KeyField { width: 240 }
  }

  Component {
    id: stepperComponent
    NumberStepper {
      id: stepper
      fieldWidth: 200
      from: 1
      to: 50
      value: 9
      property var commits: []
      onModified: function(v) { commits.push(v); value = v }
    }
  }

  // Disables itself while each edit is pending, as the panel's workspace and
  // group counts do through editPending.
  Component {
    id: pendingStepperComponent
    NumberStepper {
      id: pendingStepper
      fieldWidth: 200
      from: 1
      to: 50
      value: 1
      enabled: !pending
      property bool pending: false
      property var commits: []
      onModified: function(v) { commits.push(v); value = v; pending = true; reply.start() }
      Timer { id: reply; interval: 20; onTriggered: pendingStepper.pending = false }
    }
  }

  TestCase {
    name: "KeyField"
    when: windowShown

    function makeField(props) {
      var field = createTemporaryObject(fieldComponent, stage, props || {})
      verify(field !== null)
      field.forceActiveFocus()
      verify(field.activeFocus)
      return field
    }

    function pasteProcess(field) {
      for (var i = 0; i < field.data.length; i++)
        if (field.data[i] && field.data[i].command !== undefined && field.data[i].starts !== undefined) return field.data[i]
      return null
    }

    function test_typing_and_caret_editing() {
      var field = makeField()
      keyClick("a"); keyClick("b"); keyClick("d")
      compare(field.text, "abd")
      keyClick(Qt.Key_Left)
      keyClick("c")
      compare(field.text, "abcd")
      compare(field.cursorPosition, 3)
      keyClick(Qt.Key_Home)
      keyClick(Qt.Key_Delete)
      compare(field.text, "bcd")
      keyClick(Qt.Key_End)
      keyClick(Qt.Key_Backspace)
      compare(field.text, "bc")
      compare(field.cursorPosition, 2)
    }

    function test_ctrl_backspace_removes_a_word() {
      var field = makeField({ text: "dock left" })
      keyClick(Qt.Key_Backspace, Qt.ControlModifier)
      compare(field.text, "dock ")
    }

    function test_select_all_then_type_replaces() {
      var field = makeField({ text: "Desk" })
      keyClick(Qt.Key_A, Qt.ControlModifier)
      compare(field.selectedText, "Desk")
      keyClick("H")
      compare(field.text, "H")
    }

    function test_enter_accepts_and_finishes() {
      var field = makeField({ text: "Desk" })
      var accepted = 0, finished = 0
      field.accepted.connect(function() { accepted++ })
      field.editingFinished.connect(function() { finished++ })
      keyClick(Qt.Key_Return)
      compare(accepted, 1)
      compare(finished, 1)
    }

    function test_focus_loss_finishes_editing() {
      var field = makeField({ text: "1" })
      var finished = 0
      field.editingFinished.connect(function() { finished++ })
      stage.forceActiveFocus()
      compare(finished, 1)
    }

    function test_escape_and_tab_are_left_to_the_caller() {
      var field = makeField({ text: "x" })
      keyClick(Qt.Key_Escape)
      keyClick("y", Qt.ControlModifier)
      compare(field.text, "x")
    }

    function test_input_pattern_rejects_keystrokes() {
      var field = makeField({ inputPattern: /[-+]?\d{0,5}/, text: "" })
      keyClick("-"); keyClick("1"); keyClick("x"); keyClick("2")
      compare(field.text, "-12")
      for (var i = 0; i < 6; i++) keyClick("9")
      compare(field.text, "-1299999".slice(0, 6))
    }

    function test_up_down_step_only_when_asked() {
      var field = makeField()
      var steps = []
      field.stepRequested.connect(function(d) { steps.push(d) })
      keyClick(Qt.Key_Up)
      compare(steps.length, 0)
      field.stepKeys = true
      keyClick(Qt.Key_Up); keyClick(Qt.Key_Down)
      compare(steps, [1, -1])
    }

    function test_clipboard_is_read_only_on_explicit_paste() {
      var field = makeField({ text: "a" })
      var process = pasteProcess(field)
      verify(process !== null)
      // A plain v types; only Ctrl+V or Shift+Insert reads the clipboard.
      keyClick("v")
      compare(field.text, "av")
      compare(process.starts, 0)
      keyClick(Qt.Key_V, Qt.ControlModifier)
      compare(process.starts, 1)
      compare(process.command[0], "sh")
      compare(process.command[1], "-c")
      compare(process.command.length, 3)
      verify(process.command[2].indexOf("timeout -k 1 2 wl-paste") === 0)
      verify(process.command[2].indexOf("head -c 4096") > 0)
      process.finish("b\nc\u001b[0m\td")
      compare(field.text, "avbc[0md")
      keyClick(Qt.Key_Insert, Qt.ShiftModifier)
      compare(process.starts, 2)
      process.finish("")
      compare(field.text, "avbc[0md")
    }

    function test_paste_into_a_hidden_field_is_dropped() {
      var field = makeField({ text: "a" })
      var process = pasteProcess(field)
      keyClick(Qt.Key_V, Qt.ControlModifier)
      stage.forceActiveFocus()
      process.finish("leak")
      compare(field.text, "a")
    }

    function test_stepper_types_steps_and_clamps() {
      var stepper = createTemporaryObject(stepperComponent, stage)
      verify(stepper !== null)
      stepper.field.forceActiveFocus()
      keyClick(Qt.Key_Up)
      compare(stepper.value, 10)
      keyClick(Qt.Key_Down)
      compare(stepper.value, 9)
      keyClick(Qt.Key_A, Qt.ControlModifier)
      keyClick("9"); keyClick("9")
      keyClick(Qt.Key_Return)
      compare(stepper.value, 50)
      compare(stepper.field.text, "50")
      keyClick(Qt.Key_A, Qt.ControlModifier)
      keyClick(Qt.Key_Backspace)
      keyClick(Qt.Key_Return)
      compare(stepper.value, 50)
      compare(stepper.field.text, "50")
      keyClick("x")
      compare(stepper.field.text, "50")
    }

    function test_click_that_disables_the_stepper_steps_once() {
      var stepper = createTemporaryObject(pendingStepperComponent, stage)
      verify(stepper !== null)
      var field = stepper.field
      var plusX = field.width - stepper.buttonWidth / 2
      mousePress(field, plusX, field.height / 2)
      wait(40)
      mouseRelease(field, plusX, field.height / 2)
      // Past the 300 ms repeat delay and several 100 ms repeats.
      wait(800)
      compare(stepper.commits.length, 1)
      compare(stepper.value, 2)
    }
  }
}
