const container = document.querySelector("#main");
const recordButton = document.querySelector("#record-btn");
const stopRecordButton = document.querySelector("#stop-record-btn");
const recordStatus = document.querySelector("#record-status");
const recordTranscript = document.querySelector("#record-transcript");
const languageSelect = document.querySelector("#language");
let shouldStop = false;
const socket = io(
  "https://kikumemo-api.kiaidev.com/speech-to-text",
  {
    autoConnect: true
  }
);

function convertFloat32ToInt16(buffer) {
  let l = buffer.length;
  let buf = new Int16Array(l / 3);

  while (l--) {
    if (l % 3 === 0) {
      buf[l / 3] = buffer[l] * 0xFFFF;
    }
  }
  return buf.buffer
}
async function handleRecord({ stream, mimeType }) {
  // to collect stream chunks
  let recordedChunks = [];
  stopped = false;
  const mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = function (e) {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
    // shouldStop => forceStop by user
    if (shouldStop === true && stopped === false) {
      mediaRecorder.stop();
      stopped = true;
    }
  };
  mediaRecorder.onstop = function () {
    const blob = new Blob(recordedChunks, {
      type: mimeType
    });
    recordedChunks = []
    const filename = window.prompt('Enter file name'); // input filename from user for download
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob); // create download link for the file
    downloadLink.download = `${filename}.${mimeType}`; // naming the file with user provided name
    downloadLink.innerText = `Download: ${filename}.${mimeType}`
    container.appendChild(downloadLink);
  };

  mediaRecorder.start(200); // here 200ms is interval of chunk collection
};
async function recordAudio() {
  try {
    shouldStop = false;
    const audioOutputStream = new MediaStream;
    const [audioInputStream, screenStream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ audio: true })
        .catch(err => {
          alert("Please allow permission to use microphone");
          throw err;
        }),
      navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      }).then(stream => {
        if (stream.getAudioTracks()[0]) {
          audioOutputStream.addTrack(stream.getAudioTracks()[0].clone());
        }
        // stopping and removing the video track to enhance the performance
        stream.getVideoTracks()[0].stop();
        stream.removeTrack(stream.getVideoTracks()[0]);
      }).catch((err) => {
        console.error('get screenStream failed', err);
      }),
    ]);
    const audioContext = new AudioContext();
    const audioInputSorce = audioContext.createMediaStreamSource(audioInputStream);
    const mergedAudioSource = audioContext.createMediaStreamDestination();
    audioInputSorce.connect(mergedAudioSource);
    if (audioOutputStream.active && audioOutputStream.getAudioTracks().length > 0) {
      const audioOutPutSorce = audioContext.createMediaStreamSource(audioOutputStream);
      audioOutPutSorce.connect(mergedAudioSource);
    }

    const mergedStream = mergedAudioSource.stream;
    const newAudioContext = new AudioContext();
    const processor = newAudioContext.createScriptProcessor(2048, 1, 1);
    processor.connect(newAudioContext.destination);
    audioContext.resume();
    const newMergeStream = newAudioContext.createMediaStreamSource(mergedStream);
    newMergeStream.connect(processor);
    processor.onaudioprocess = function (e) {
      const left = e.inputBuffer.getChannelData(0);
      const left16 = convertFloat32ToInt16(left);
      socket.emit("audiodata", { data: left16 })
    };
    socket.emit("startGoogleSpeechToText", {
      config: {
        encoding: 'LINEAR16',
        sampleRateHertz: 16000,
        languageCode: languageSelect.value,
        profanityFilter: false,
        model: 'default',
        enableWordTimeOffsets: false,
        enableSpeakerDiarization: true,
        minSpeakerCount: 2,
        maxSpeakerCount: 2,
      },
    });
    socket.on('speechData', (data) => {
      console.log(data);
      console.log("GOT SPEECH DATA",);
      const dateTime = new Date(data.time);
      const pTag = document.createElement("p");
      pTag.innerText = `${dateTime.toLocaleDateString()} ${dateTime.toLocaleTimeString()} -- ${data.transcript.results[0]?.alternatives[0]?.transcript}`;
      const transcriptContainer = document.querySelector("#transcript-container");
      transcriptContainer.appendChild(pTag);
    });
    recordButton.style.display = "none";
    stopRecordButton.style.display = "block";
    recordStatus.style.display = "block";
    recordTranscript.style.display = "block";
    await handleRecord({ stream: mergedStream, mimeType: 'mp3' });

  } catch (err) {
    socket.emit('endGoogleCloudStream', '');
    console.log("RECORD AUDIO ERRORS: ", err);
  }
}

recordButton.addEventListener('click', recordAudio);
stopRecordButton.addEventListener('click', () => {
  shouldStop = true;
  socket.emit('endGoogleCloudStream', '');
  recordButton.style.display = "block";
  stopRecordButton.style.display = "none";
  recordStatus.style.display = "none";
  recordTranscript.style.display = "none";
});
