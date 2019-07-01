let client;
let server;

/*
Examples of RTCQuicTransport API usage:
 - Connecting transports see: connectTransports() function.
 - Writing see: QuicFileSender.writeFileToStream().
 - Reading see: QuicFileReceiver.readFileFromStream().
*/
function setup() {
  client =
      new Transport(document.querySelector('.left-pane'));
  server =
      new Transport(document.querySelector('.right-pane'));

  connectTransports(client, server);

  const fileInput = document.getElementById('file-input');
  fileInput.onchange = () => {
    const {files} = fileInput;
    for (let i = 0; i < files.length; i++) {
      sendFile(files[i], client);
    }
  };
}

function connectTransports(client, server) {
  server.ice.onicecandidate = ({candidate}) => {
    if (candidate) {
      client.ice.addRemoteCandidate(candidate);
    }
  };
  server.ice.gather({
    iceServers: [{urls: ["stun:stun.l.google.com:19302"]}]
  });
  server.ice.start(client.ice.getLocalParameters());
  server.quic.listen(client.quic.getKey());

  client.ice.onicecandidate = ({candidate}) => {
    if (candidate) {
      server.ice.addRemoteCandidate(candidate);
    }
  };
  client.ice.gather({
    iceServers: [{urls: ["stun:stun.l.google.com:19302"]}]
  });
  client.ice.start(server.ice.getLocalParameters());
  client.quic.connect();
}

// Includes the RTCIceTransport, RTCQuicTransport and related html
// elements.
class Transport {
  constructor(element) {
    this.ice = new RTCIceTransport();
    this.quic = new RTCQuicTransport(this.ice);
    this.element = element;
    // Received a stream. This means data has been written to a RTCQuicStream
    // stream that is part of the remote (connected) Transport.
    this.quic.onquicstream = ({stream}) => {
      this.onStream(stream);
    };
    this.connected = new Promise(resolve => {
      this.quic.addEventListener('statechange', () => {
        if (this.quic.state === 'connected') {
          this.startUpdatingStats();
          // Resolve this.connected Promise.
          resolve();
        }
      });
    });

    // Stats key to its <li> element.
    this.stats = {};
    this.connectStateChangeElements();
  }

  onStream(stream) {
    const receiveFilesTable =
        this.element.querySelector('.receive-files-table');
    const template = receiveFilesTable.querySelector('template');
    const row = template.content.cloneNode(/*deep=*/true);
    receiveFilesTable.prepend(row);
    const receiver =
        new QuicFileReceiver(stream, receiveFilesTable.firstElementChild);
  }

  connectStateChangeElements() {
    const iceGatheringStateElement =
        this.element.querySelector('.ice-gathering-state');
    this.ice.addEventListener('gatheringstatechange', () => {
      setElementState(iceGatheringStateElement, this.ice.gatheringState);
    });
    const iceTransportStateElement =
        this.element.querySelector('.ice-transport-state');
    this.ice.onstatechange = () => {
      setElementState(iceTransportStateElement, this.ice.state);
    };
    const quicTransportStateElement =
        this.element.querySelector('.quic-transport-state');
    this.quic.onstatechange = () => {
      setElementState(quicTransportStateElement, this.quic.state);
    };
    let statsDisplayElement =
      this.element.querySelector('.stats-display');
    let statsButtonElement = statsDisplayElement.querySelector('#stats-button');
    let statsListElement = statsDisplayElement.querySelector('.quic-stats');

    statsButtonElement.onclick = async () => {
      if (statsListElement.style.display === "none") {
        statsListElement.style.display = "block";
        statsButtonElement.value = "Hide";
      } else {
        statsListElement.style.display = "none";
        statsButtonElement.value = "Show";
      }
    };
  }

  startUpdatingStats() {
    let statsDisplayElement =
      this.element.querySelector('.stats-display');
    let statsListElement = statsDisplayElement.querySelector('.quic-stats');
    let notConnectedStat = statsListElement.querySelector('#not-connected-stat');
    // Remove initial <li> element.
    statsListElement.removeChild(notConnectedStat);

    let handle;
    let updateStats = async () => {
      const stats = await this.quic.getStats();
      for (const [key, value] of Object.entries(stats)) {
        let listElement = document.createElement("LI");
        const text = document.createTextNode(key + ": " + value);
        if (this.stats[key]) {
          // Remove old stat.
          statsListElement.removeChild(this.stats[key]);
        }
        listElement.appendChild(text);
        listElement.className = "statItem";
        statsListElement.appendChild(listElement);
        this.stats[key] = listElement;
      }
      handle = setTimeout(updateStats, 100);
    };
    // Update stats every 100 ms.
    updateStats();
  }

}

class FileTransferElement {
  constructor(stream, row) {
    this.stream = stream;
    this.row = row;
    this.offset = 0;
    this.fileSize = 0;
    this.updateFrequency = 100; // ms
    this.updateRateHandle = null;
    this.movingAverage = new MovingAverage(100);
    this.paused = Promise.resolve();
    const button = this.row.querySelector('.pause-unpause-button');
    button.onclick = () => {
      if (button.textContent === '\u23f8') {
        this.paused = new Promise(resolve => {
          this.unpause = resolve;
        });
        button.textContent = '\u25b6';
      } else {
        this.unpause();
        button.textContent = '\u23f8';
      }
    };
  }

  updateProgressBar() {
    const label = ByteCountFormatter.getFormattedBytesAmount(
        this.offset, this.fileSize);
    const progressElement = this.row.querySelector('.progress');
    progressElement.setAttribute('data-label', label);
    progressElement.querySelector('.value').style.width =
        `${(this.offset / this.fileSize * 100)}%`;
  }

  updateBpsText() {
    const average = this.movingAverage.averageBps();
    this.row.querySelector('.send-rate').innerText =
        ByteCountFormatter.getFormattedBpsRate(average);
  }

  startCalculatingDataRate() {
    this.movingAverage.start();
    const updateRate = () => {
      this.movingAverage.pushBytesValue(this.offset);
      this.updateBpsText();
      this.updateRateHandle =
          setTimeout(updateRate, this.updateFrequency);
    };
    this.updateRateHandle = setTimeout(updateRate, this.updateFrequency);
  }

  stopCalculatingDataRate() {
    clearTimeout(this.updateHandle);
    this.movingAverage.pushBytesValue(this.offset);
    this.movingAverage.done();
    this.updateBpsText();
  }
}

class QuicFileSender extends FileTransferElement {
  constructor(file, stream, row) {
    super(stream, row);
    this.file = file;
    this.fileSize = this.file.size;
    this.fileReader = new FileReader();
    this.fileReader.onerror = console.error;
    this.fileReader.onabort = console.log;
    this.fileReader.onload = this.onLoad.bind(this);
    row.querySelector('.file-name').textContent = file.name;
    this.updateProgressBar();
  }

  async startWritingFile() {
    this.startCalculatingDataRate();
    await writePrefixedString(this.file.name, this.stream);
    await writeUint32(this.file.size, this.stream);
    await this.writeFileToStream();
    this.stream.write({finish: true});
    this.stopCalculatingDataRate();
  }

  // This writes the file to an RTCQuicStream by using the
  // waitForWriteBufferedAmountBelow() and write() APIs.
  async writeFileToStream() {
    while (this.offset < this.file.size) {
      await this.paused;
      const buffer = await this.readChunk();
      await this.stream.waitForWriteBufferedAmountBelow(
          this.stream.maxWriteBufferedAmount - buffer.byteLength);
      this.stream.write({data: new Uint8Array(buffer)});
      this.updateProgressBar();
    }
  }

  readChunk() {
    const chunkSize = 16384;
    this.fileReader.readAsArrayBuffer(
        this.file.slice(this.offset, this.offset + chunkSize));
    return new Promise(resolve => {
      this.resolveNextChunk = resolve;
    });
  }

  onLoad({target: {result}}) {
    this.offset += result.byteLength;
    this.resolveNextChunk(result);
  }
}

class QuicFileReceiver extends FileTransferElement {
  constructor(stream, row) {
    super(stream, row);
    this.stream = stream;
    this.row = row;
    this.offset = 0;
    this.receiveBuffer = [];
    this.startReading();
  }

  get bytesRead() {
    return this.offset;
  }

  async startReading() {
    this.startCalculatingDataRate();
    const fileName = await readFilename(this.stream);
    this.row.querySelector('.file-name').textContent = fileName;
    this.fileSize = await readUint32(this.stream);
    await this.readFileFromStream();
    this.stopCalculatingDataRate();
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob(this.receiveBuffer));
    anchor.download = fileName;
    anchor.textContent = '\u2B07';
    anchor.style.display = 'block';
    this.row.querySelector('.button-column').prepend(anchor);
    this.row.querySelector('.button-column').removeChild(
        this.row.querySelector('.pause-unpause-button'));
  }

  // This reads the file from the RTCQuicStream by using the waitForReadable()
  // and readInto APIs.
  async readFileFromStream() {
    const chunkSize = 16384;
    while (this.offset < this.fileSize) {
      // This will resolve either when we have a chunkSize amount available to
      // read or we get a finish from the remote side.
      await this.stream.waitForReadable(chunkSize);
      await this.paused;
      const buffer = new Uint8Array(this.stream.readBufferedAmount);
      const {amount, finished} = this.stream.readInto(buffer);
      this.offset += amount;
      this.receiveBuffer.push(buffer);
      this.updateProgressBar();
    }
  }
}

class MovingAverage {
  constructor(pollFrequencyMs) {
    this.samples = [];
    this.pollFrequencyMs = pollFrequencyMs;
  }

  start() {
    this.startTime = new Date();
  }

  pushBytesValue(count) {
    if (this.samples.length == 10) {
      this.samples.shift();
    }
    this.samples.push(count);
  }

  done() {
    this.doneTime = new Date();
  }

  // Average bits per second.
  averageBps() {
    if (this.samples.length === 0) {
      return 0;
    }
    if (this.doneTime) {
      const elapsedSeconds = (this.doneTime - this.startTime) / 1000;
      return (8 * this.samples[this.samples.length - 1]) / elapsedSeconds;
    }
    const elapsedSeconds = (this.samples.length * this.pollFrequencyMs) / 1000;
    return (8 * (this.samples[this.samples.length - 1] - this.samples[0])) / elapsedSeconds;
  }
}

class ByteCountFormatter {
  static getRange(value) {
    if (value < Math.pow(10, 3)) {
      return 'byte';
    } else if (value < Math.pow(10, 6)) {
      return 'kilo-byte';
    } else if (value < Math.pow(10, 9)) {
      return 'mega-byte';
    } else {
      return 'giga-byte';
    }
  }

  static labelFromRange(range) {
    switch (range) {
      case 'byte':
        return 'bytes';
      case 'kilo-byte':
        return 'KB';
      case 'mega-byte':
        return 'MB';
      case 'giga-byte':
        return 'GB';
    }
  }

  static rateLabelFromRange(range) {
    switch (range) {
      case 'byte':
        return 'bps';
      case 'kilo-byte':
        return 'Kbps';
      case 'mega-byte':
        return 'Mbps';
      case 'giga-byte':
        return 'Gbps';
    }
  }

  static formatToRange(value, range) {
    switch (range) {
      case 'byte':
        return value.toFixed(0);
      case 'kilo-byte':
        return (value / Math.pow(10, 3)).toFixed(2);
      case 'mega-byte':
        return (value / Math.pow(10, 6)).toFixed(2);
      case 'giga-byte':
        return (value / Math.pow(10, 9)).toFixed(2);
    }
  }

  static getFormattedBytesAmount(value, totalAmount) {
    const range = this.getRange(totalAmount);
    return this.formatToRange(value, range) + ' / ' + this.formatToRange(totalAmount, range) +
           ' ' + this.labelFromRange(range);
  }

  static getFormattedBpsRate(value) {
    const range = this.getRange(value);
    return this.formatToRange(value, range) + ' ' +
        this.rateLabelFromRange(range);
  }
}

async function sendFile(file, transport) {
  await transport.connected;
  const sendFilesTable = transport.element.querySelector('.send-files-table');
  const template = sendFilesTable.querySelector('template');
  const row = template.content.cloneNode(/*deep=*/true);
  sendFilesTable.prepend(row);
  const sender =
      new QuicFileSender(file, transport.quic.createStream(),
          sendFilesTable.firstElementChild);
  sender.startWritingFile();
}

async function writeUint32(value, stream) {
  const buffer = new ArrayBuffer(4);
  new Uint32Array(buffer)[0] = value;
  await stream.waitForWriteBufferedAmountBelow(
      stream.maxWriteBufferedAmount - 4);
  stream.write({data: new Uint8Array(buffer)});
}

async function readUint32(stream) {
  await stream.waitForReadable(4);
  const buffer = new ArrayBuffer(4);
  stream.readInto(new Uint8Array(buffer));
  return new Uint32Array(buffer)[0];
}

async function writePrefixedString(string, stream) {
  const encodedBytes = new TextEncoder().encode(string);
  await writeUint32(encodedBytes.length, stream);
  await stream.waitForWriteBufferedAmountBelow(
      stream.maxWriteBufferedAmount - encodedBytes.length);
  stream.write({data: encodedBytes});
}

async function readFilename(stream) {
  const length = await readUint32(stream);
  await stream.waitForReadable(length);
  const encodedBytes = new Uint8Array(length);
  stream.readInto(encodedBytes);
  return new TextDecoder().decode(encodedBytes);
}

function setElementState(element, newState) {
  for (const stateElement of element.querySelectorAll('[value]')) {
    if (stateElement.getAttribute('value') === newState) {
      stateElement.classList.add('state-selected');
      stateElement.classList.remove('state-to');
    } else if (stateElement.classList.contains('state-selected')) {
      stateElement.classList.add('state-to');
      stateElement.classList.remove('state-selected');
    }
  }
}

function displayPage() {
  const enabled = typeof RTCQuicTransport != "undefined";
  document.getElementById("originTrialDisabled").style.display =
      enabled ? "none" : "block";
  document.getElementById("originTrialEnabled").style.display =
      enabled ? "block" : "none";
  setup();
}
