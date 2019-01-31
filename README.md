# RTCQuicTransport-Origin-Trial-Documentation
Documentation and demos for developers using the RTCQuicTransport in Chrome's origin trial.

The specifications provide further documentation, but have diverged in some ways. The most
accurate documentation is below. The specifications can be found here:

 * [RTCQuicTransport](https://w3c.github.io/webrtc-quic/)
 * [RTCIceTransport](https://w3c.github.io/webrtc-ice/) 

## Origin Trial Information

1. Request a token for your origin.
2. Add the token to your pages, there are two ways to provide this token on
   any pages in your origin:
     - Add an `origin-trial` `<meta>` tag to the head of any page. For example,
       this may look something like:
       `<meta http-equiv="origin-trial" content="TOKEN_GOES_HERE">`
     - If you can configure your server, you can also provide the token on pages
       using an `Origin-Trial` HTTP header. The resulting response header should
       look something like: `Origin-Trial: TOKEN_GOES_HERE`

### Origin trial links

* [Origin Trial Overview](https://github.com/GoogleChrome/OriginTrials/blob/gh-pages/README.md)
* [Origin Trial Developer Guide](https://github.com/GoogleChrome/OriginTrials/blob/gh-pages/developer-guide.md)
* [Requesting for an Origin Trial Token](https://developers.chrome.com/origintrials/#/trials/active)

## API Glossary

### RTCIceTransport

#### Attributes:

```js
readonly attribute RTCIceRole? role;
readonly attribute RTCIceTransportState state;
readonly attribute RTCIceGatheringState gatheringState;
```

#### Methods

```js
sequence<RTCIceCandidate> getLocalCandidates();
sequence<RTCIceCandidate> getRemoteCandidates();
RTCIceCandidatePair? getSelectedCandidatePair();
RTCIceParameters? getLocalParameters();
RTCIceParameters? getRemoteParameters();
void gather(RTCIceGatherOptions options);
```

#### Events

```js
attribute EventHandler onstatechange;
attribute EventHandler ongatheringstatechange;
attribute EventHandler onselectedcandidatepairchange;
```

### RTCQuicTransport

#### Attributes:

```js
readonly attribute RTCIceTransport transport;
readonly attribute RTCQuicTransportState state;
```

#### Methods

```js
Constructor(RTCIceTransport transport);
ArrayBuffer getKey();
void connect();
void listen(BufferSource remote_key);
void stop();
RTCQuicStream createStream();
Promise<RTCQuicTransportStats> getStats();
```

#### Events

```js
attribute EventHandler onstatechange;
attribute EventHandler onerror;
attribute EventHandler onquicstream;
```

### RTCQuicStream

#### Attributes

```js
readonly attribute RTCQuicTransport transport;
readonly attribute RTCQuicStreamState state;
readonly attribute unsigned long readBufferedAmount;
readonly attribute unsigned long maxReadBufferedAmount;
readonly attribute unsigned long writeBufferedAmount;
readonly attribute unsigned long maxWriteBufferedAmount;
```

#### Methods

```js
RTCQuicStreamReadResult readInto(Uint8Array data);
void write(RTCQuicStreamWriteParameters data);
void reset();
Promise<void> waitForWriteBufferedAmountBelow(unsigned long amount);
Promise<void> waitForReadable(unsigned long amount);
```

#### Events
```js
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
