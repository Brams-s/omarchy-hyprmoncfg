import QtQuick

// Mirrors the Omarchy shell base: the bar injects these and reads settings
// through setting(), which falls back for missing or null values.
Item {
  property QtObject bar: null
  property string moduleName: ""
  property var settings: ({})

  function setting(name, fallback) {
    var value = settings ? settings[name] : undefined
    return value === undefined || value === null ? fallback : value
  }
}
