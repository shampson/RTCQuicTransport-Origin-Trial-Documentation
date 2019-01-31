# RTCQuicTransport-Origin-Trial-Documentation
Documentation and demos for developers using the RTCQuicTransport in Chrome's origin trial.

## API Glossary

### RTCIceTransport

#### Attributes:

```
readonly attribute RTCIceRole? role;
readonly attribute RTCIceTransportState state;
readonly attribute RTCIceGatheringState gatheringState;
```

#### Methods

```
sequence<RTCIceCandidate> getLocalCandidates();
sequence<RTCIceCandidate> getRemoteCandidates();
RTCIceCandidatePair? getSelectedCandidatePair();
RTCIceParameters? getLocalParameters();
RTCIceParameters? getRemoteParameters();
void gather(RTCIceGatherOptions options);
```

#### Events

```
attribute EventHandler onstatechange;
attribute EventHandler ongatheringstatechange;
attribute EventHandler onselectedcandidatepairchange;
```

### RTCQuicTransport

#### Attributes:

```
readonly attribute RTCIceTransport transport;
readonly attribute RTCQuicTransportState state;
```

#### Methods

```
Constructor(RTCIceTransport transport);
ArrayBuffer getKey();
void connect();
void listen(BufferSource remote_key);
void stop();
RTCQuicStream createStream();
Promise<RTCQuicTransportStats> getStats();
```

#### Events

```
attribute EventHandler onstatechange;
attribute EventHandler onerror;
attribute EventHandler onquicstream;
```

### RTCQuicStream

#### Attributes

```
readonly attribute RTCQuicTransport transport;
readonly attribute RTCQuicStreamState state;
readonly attribute unsigned long readBufferedAmount;
readonly attribute unsigned long maxReadBufferedAmount;
readonly attribute unsigned long writeBufferedAmount;
readonly attribute unsigned long maxWriteBufferedAmount;
```

#### Methods

```
RTCQuicStreamReadResult readInto(Uint8Array data);
void write(RTCQuicStreamWriteParameters data);
void reset();
Promise<void> waitForWriteBufferedAmountBelow(unsigned long amount);
Promise<void> waitForReadable(unsigned long amount);
```

#### Events
```
attribute EventHandler onstatechange;
```

## Transferring data

### Basic Example

#### Writing

```js
while (haveDataToWrite()) {
  await waitForWriteBufferedAmountBelow(writeStream.maxWriteBufferedAmount / 2);
  const nextChunkSize =
      writeStream.maxWriteBufferedAmount - writeStream.writeBufferedAmount;
  writeStream.write({ data: getNextChunk(nextChunkSize) })
}
// All waitForReadable promises are resolved when the finish arrives to the read
// buffer on the remote side. Writing it after we are done here ensures that
// all chunks of data are read out on the remote side.
writeStream.write({ finish: true });
```

#### Reading

```js
let readAllData = false;
while (!readAllData) {
  await readStream.waitForReadable(readStream.maxReadBufferedAmount / 2);
  const readBuffer = new Uint8Array(stream.maxReadBufferedAmount);
  const { amount, finished } = readStream.readInto(readBuffer);
  // Do something with the data.
}
// Close the stream. Writing a finish back to the remote side also will close
// the stream.
readStream.reset();
```
