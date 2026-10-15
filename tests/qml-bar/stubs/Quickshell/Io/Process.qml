import QtQml

// Records the command instead of running it; a test finishes it with
// Process.finish(output), as the real collector does when the stream ends.
QtObject {
  property var command: []
  property bool running: false
  property QtObject stdout: null
  property int starts: 0
  onRunningChanged: if (running) starts++
  function finish(output) {
    running = false
    if (stdout) stdout.deliver(output)
  }
}
