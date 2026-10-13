import QtQuick
import QtTest
import "../.."

// Run with -import tests/qml-bar/stubs: the stubs stand in for the Omarchy
// shell modules, so this exercises BarWidget.qml itself without a compositor.
// Panel.qml cannot build against them, so its loader stays empty and nothing
// reaches hyprmoncfg or Hyprland.
Rectangle {
  id: stage
  width: 200
  height: 40
  color: "#101010"

  Component {
    id: barComponent

    // Laid out the way the Omarchy bar lays out module slots: a Row with no
    // spacing, each slot sized from the widget's implicit size.
    Row {
      property alias widget: widget
      property alias after: after

      Rectangle { width: 24; height: 26; color: "#444444" }
      BarWidget { id: widget }
      Rectangle { id: after; width: 24; height: 26; color: "#444444" }
    }
  }

  TestCase {
    name: "BarWidget"
    when: windowShown
    property var bar
    property var widget

    function init() {
      bar = createTemporaryObject(barComponent, stage)
      verify(bar !== null)
      widget = bar.widget
    }

    function iconButton() {
      for (var i = 0; i < widget.children.length; i++) {
        if ("tooltipText" in widget.children[i]) return widget.children[i]
      }
      return null
    }

    function test_icon_is_shown_without_a_setting() {
      var button = iconButton()
      verify(button !== null)
      compare(widget.showBarIcon, true)
      compare(widget.implicitWidth, button.implicitWidth)
      compare(widget.implicitHeight, button.implicitHeight)
      verify(widget.implicitWidth > 0)
      compare(button.opacity, 1)
      tryCompare(bar.after, "x", 24 + button.implicitWidth)
    }

    function test_null_or_true_keeps_the_icon() {
      widget.settings = { showBarIcon: null }
      compare(widget.showBarIcon, true)
      widget.settings = { showBarIcon: true }
      compare(widget.showBarIcon, true)
      verify(widget.implicitWidth > 0)
    }

    function test_hidden_icon_collapses_the_slot_but_keeps_the_anchor() {
      var button = iconButton()
      widget.settings = { showBarIcon: false }
      compare(widget.showBarIcon, false)
      compare(widget.implicitWidth, 0)
      compare(widget.implicitHeight, 0)
      tryCompare(bar.after, "x", 24)
      // The bar skips invisible widgets and the panel cannot map from an
      // invisible anchor, so both stay visible with nothing to show.
      compare(widget.visible, true)
      compare(button.visible, true)
      compare(button.opacity, 0)
      compare(button.width, 0)
      compare(button.height, 0)
    }

    function test_hidden_widget_still_answers_summon() {
      widget.settings = { showBarIcon: false }
      // Bar.findPanelWidget only routes to widgets with these members.
      compare(typeof widget.open, "function")
      compare(typeof widget.close, "function")
      verify(widget.opened !== undefined)
      compare(widget.moduleName, "crmne.hyprmoncfg")
    }

    function test_live_setting_change_restores_the_icon() {
      var button = iconButton()
      widget.settings = { showBarIcon: false }
      compare(widget.implicitWidth, 0)
      widget.settings = { showBarIcon: true }
      compare(widget.implicitWidth, button.implicitWidth)
      compare(button.opacity, 1)
      tryCompare(bar.after, "x", 24 + button.implicitWidth)
    }
  }
}
