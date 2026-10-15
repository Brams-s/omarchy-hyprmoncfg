import QtQml

QtObject {
  property string text: ""
  signal streamFinished()
  function deliver(output) {
    text = output
    streamFinished()
  }
}
