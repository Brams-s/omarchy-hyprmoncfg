import QtQuick

// A fixed icon slot, like the shell's bar icon button.
Item {
  property QtObject bar: null
  property string text: ""
  property bool dimmed: false
  property string tooltipText: ""
  property Component iconComponent: null
  property color foreground: "white"
  property string fontFamily: ""
  property int fontSize: 14
  property real opticalSize: 16
  signal pressed(int mouseButton)

  implicitWidth: 30
  implicitHeight: 26
}
