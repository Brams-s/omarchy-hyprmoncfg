import QtQuick

// The bar loads this in place of the production panel. No IPC or processes.
QtObject {
  property bool backendConnected: false
  property int monitorCount: 1
  property bool opened: false
  property bool barIconDimmed: false
  property bool popoutSwitchClosing: false
  property string activeProfile: ""
}
