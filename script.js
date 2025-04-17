const { Sortable } = window.Draggable;

// New variables for audio conversion
let fileQueue = [];
let processedFiles = [];
const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusMessage = document.getElementById('statusMessage');

// Add new variables for bit rate display
const originalBitRateDisplay = document.getElementById('originalBitRate');
const newBitRateDisplay = document.getElementById('newBitRate');
const bitRateChangeDisplay = document.getElementById('bitRateChange');

// Add these variables at the top with your other variables
let originalBuffer = null;
let convertedBuffer = null;

function updateUI() {
  updatePadNames();
  updateTotalSampleLength();
  updateSettingsInputs();
  updateSettingsLink();
}

function updatePadNames() {
  pads.forEach(
    (pad, i) =>
      (pad.querySelector("button").textContent = settings.padNames[i] || "*")
  );
}

function updateTotalSampleLength() {
  const length = parseFloat(
    sources
      .filter(x => x)
      .reduce(
        (a, b, i) =>
          a +
          Math.min(settings.maxMs / 1000, b.buffer.duration / settings.speed) +
          (i ? settings.gapMs / 1000 : 0),
        0
      )
      .toFixed(1)
  );
  sampleLengthContainer.textContent = length;
  secondsContainer.textContent = length === 1 ? "second" : "seconds";
}

function updateSettingsInputs() {
  ["speed", "maxMs", "gapMs"].forEach(
    (setting, i) => (settingsInputs[i].value = settings[setting])
  );
  settingsInputs[3].value = settings.padNames
    .map(name => name.replace(/-/g, "\\-"))
    .join(" - ");
}

function updateSettingsLink() {
  const { location } = window;
  document.querySelector(".settings-link").href = `${location.origin}${
    location.pathname
  }?speed=${settings.speed}&maxMs=${settings.maxMs}&gapMs=${
    settings.gapMs
  }&padNames=${encodeURIComponent(
    settings.padNames.map(name => name.replace(/-/g, "%2D")).join("-")
  )}`;
}

const urlParams = new URLSearchParams(window.location.search);
const settings = {
  speed: parseFloat(urlParams.get("speed")) || 1,
  maxMs: parseFloat(urlParams.get("maxMs")) || 40000,
  gapMs: parseFloat(urlParams.get("gapMs")) || 0,
  padNames: (urlParams.get("padNames") || "bd-sn-ho-hc-bd-sn-ho-hc-bd-sn-*-cy")
    .split("-")
    .map(name => decodeURIComponent(name))
    .slice(0, 16)
};

const pads = Array.from({ length: 16 }, (_, i) => {
  const li = document.createElement("li");
  li.className = "empty";
  const input = document.createElement("input");
  const button = document.createElement("button");
  input.setAttribute("type", "file");
  input.setAttribute("accept", "audio/*");
  input.setAttribute("multiple", "");
  input.addEventListener("change", () => {
    if (input.files) {
      processFiles(input.files, i);
    }
  });
  li.append(input);
  li.append(button);
  return li;
});
const sampler = document.querySelector(".sampler-pane");
const container = document.createElement("ol");
container.className = "pads";
container.append(...pads);
const playButtonWrapper = document.createElement("div");
playButtonWrapper.id = "play-button-wrapper";
const playButton = document.createElement("button");
playButton.className = "play-all";
const sortable = new Sortable(container, {
  draggable: ".pads li",
  distance: 10
});

const settingsInputs = document.querySelectorAll(".settings input");
["speed", "maxMs", "gapMs"].forEach((setting, i) => {
  settingsInputs[i].addEventListener("change", e => {
    settings[setting] = +e.target.value;
    updateTotalSampleLength();
    updateSettingsLink();
  });
});
settingsInputs[3].addEventListener("change", e => {
  settings.padNames = e.target.value
    .replace(/\\-/g, "%2D")
    .replace(/ /g, "")
    .split("-")
    .map(name => decodeURIComponent(name))
    .slice(0, 16);
  updatePadNames();
  updateSettingsLink();
});

const infoBox = document.createElement("div");
infoBox.className = "info-box";
const sampleLengthContainer = document.createElement("span");
sampleLengthContainer.innerText = "0";
const secondsContainer = document.createElement("span");
secondsContainer.innerText = "seconds";
infoBox.append(
  sampleLengthContainer,
  document.createTextNode(" "),
  secondsContainer
);

let draggedOut;
sortable.on("drag:over:container", e => {
  draggedOut = false;
});
sortable.on("drag:out:container", e => {
  draggedOut = true;
});
sortable.on("sortable:stop", ({ newIndex, oldIndex, dragEvent }) => {
  if (draggedOut) {
    dragEvent.data.originalSource.className = "empty";
    sources[oldIndex] = undefined;
    updateTotalSampleLength();
  } else sourceOrder.splice(newIndex, 0, sourceOrder.splice(oldIndex, 1)[0]);
});

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const sources = Array.from({ length: 16 });
const sourceOrder = Array.from({ length: 16 }, (_, i) => i);

const initAudio = (data, i) => {
  const source = audioContext.createBufferSource();
  const pad = pads[i];
  const oldSource = sources[i];
  if (oldSource) {
    oldSource.stop(0);
    oldSource.disconnect(0);
  }

  audioContext.decodeAudioData(
    data,
    buffer => {
      source.buffer = buffer;
      pad.className = "playing";
      sources[i] = source;
      updateTotalSampleLength();
      playSource(source).then(() => {
        pad.className = "loaded";
        playButtonWrapper.className = pads.every(
          pad => pad.className === "loaded"
        )
          ? "loaded"
          : "";
      });
    },
    e => {
      console.error(e);
      pad.className = "failed";
      playButtonWrapper.className = "";
    }
  );
};

const playSource = source => {
  return new Promise((resolve, reject) => {
    source.playbackRate.value = settings.speed;
    source.connect(audioContext.destination);
    let ended = false;
    const end = () => {
      if (!ended) {
        ended = true;
        source.stop(0);
        source.disconnect(0);
        resolve();
      }
    };
    source.onended = e => {
      setTimeout(end, settings.gapMs);
    };
    source.start(0);
    setTimeout(end, settings.maxMs);
  });
};

// AudioBufferSourceNodes can only play once: https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start
const refreshSource = i => {
  const source = sources[i];
  try {
    source.stop(0);
  } finally {
    const newSource = audioContext.createBufferSource();
    newSource.buffer = source.buffer;
    return (sources[i] = newSource);
  }
};

const play = i => {
  if (sources[i]) {
    pads[i].className = "playing";
    const source = refreshSource(i);
    return playSource(source).then(() => (pads[i].className = "loaded"));
  }
};

const processFiles = (files, i) => {
  (function processFile(n) {
    const reader = new FileReader();
    reader.onload = e => {
      initAudio(e.target.result, i + n);
      if (++n < files.length && i + n < sources.length) processFile(n);
    };
    reader.readAsArrayBuffer(files[n]);
  })(0);
};

const dropEvent = i => e => {
  e.stopPropagation();
  e.preventDefault();
  processFiles(e.dataTransfer.files, i);
};

const blockEvent = e => {
  e.stopPropagation();
  e.preventDefault();
  return false;
};

pads.forEach((pad, i) => {
  pad.addEventListener("drop", dropEvent(i), false);
  pad.addEventListener("dragover", blockEvent, false);
  pad.querySelector("button").addEventListener(
    "click",
    () => {
      sources[i] ? play(i) : pad.querySelector("input").click();
    },
    false
  );
});
document.body.addEventListener("drop", blockEvent, false);
document.body.addEventListener("dragover", blockEvent, false);

const playAll = e => {
  const { className } = playButtonWrapper;
  playButtonWrapper.className = "playing";
  const playNext = i => {
    const playing = play(sourceOrder[i]);
    if (i >= sources.length) return (playButtonWrapper.className = className);
    else if (playing) {
      playing.then(() => playNext(i + 1));
    } else {
      playNext(i + 1);
    }
  };
  playNext(0);
};

updateUI();
playButton.append(document.createTextNode("Play all"));
playButton.addEventListener("click", playAll, false);
playButtonWrapper.append(playButton, infoBox);
sampler.append(container, playButtonWrapper);

let openPane = "sampler";
const toggles = Array.from(document.querySelectorAll(".toggle"));
const panes = Array.from(document.querySelectorAll(".pane"));
const namedPanes = panes.reduce((acc, pane) => {
  acc[pane.className.match(/([^- ]+)-pane/)[1]] = pane;
  return acc;
}, {});
toggles.forEach(toggle => {
  const targetPane = toggle.className.match(/([^- ]+)-toggle/)[1];
  toggle.addEventListener("click", () => {
    if (openPane === targetPane) {
      openPane = "sampler";
      toggle.classList.remove("open");
      namedPanes[targetPane].classList.remove("open-pane");
      namedPanes.sampler.classList.add("open-pane");
    } else {
      toggles.forEach(t => t.classList.remove("open"));
      panes.forEach(p => p.classList.remove("open-pane"));
      toggle.classList.add("open");
      namedPanes[targetPane].classList.add("open-pane");
      openPane = targetPane;
    }
  });
});

const keyMap = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "KeyQ",
  "KeyW",
  "KeyE",
  "KeyR",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyF",
  "KeyZ",
  "KeyX",
  "KeyC",
  "KeyV"
];
document.addEventListener(
  "keydown",
  e => {
    if (e.repeat || openPane !== "sampler") return;
    const i = keyMap.indexOf(e.code);
    if (i >= 0) play(sourceOrder[i]);
  },
  false
);

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function calculateBitRate(file, bitDepth) {
  const sampleRate = 44100; // Standard sample rate
  const channels = 2; // Stereo
  const duration = file.size / (bitDepth / 8 * channels * sampleRate);
  return {
    size: file.size,
    bitRate: (file.size * 8) / duration,
    estimatedNewSize: (file.size * bitDepth) / (bitDepth === 32 ? 32 : 16) // Assuming original is 16-bit
  };
}

function updateBitRateDisplay(file, newBitDepth) {
  if (!file) {
    originalBitRateDisplay.textContent = 'Original: --';
    newBitRateDisplay.textContent = 'New: --';
    bitRateChangeDisplay.textContent = 'Change: --';
    return;
  }

  const original = calculateBitRate(file, 16); // Assume original is 16-bit
  const newRate = calculateBitRate(file, newBitDepth);

  originalBitRateDisplay.textContent = `Original: ${formatFileSize(original.size)} (${formatFileSize(original.bitRate)}/s)`;
  newBitRateDisplay.textContent = `New: ${formatFileSize(newRate.estimatedNewSize)} (${formatFileSize(newRate.bitRate)}/s)`;

  const change = newRate.estimatedNewSize - original.size;
  const changePercent = Math.abs((change / original.size) * 100).toFixed(1);
  
  bitRateChangeDisplay.className = '';
  if (change > 0) {
    bitRateChangeDisplay.textContent = `Change: +${formatFileSize(change)} (+${changePercent}%)`;
    bitRateChangeDisplay.classList.add('increase');
  } else if (change < 0) {
    bitRateChangeDisplay.textContent = `Change: ${formatFileSize(change)} (-${changePercent}%)`;
    bitRateChangeDisplay.classList.add('decrease');
  } else {
    bitRateChangeDisplay.textContent = 'Change: No change';
    bitRateChangeDisplay.classList.add('no-change');
  }
}

// Add event listeners for file input and buttons
document.getElementById('audioInput').addEventListener('change', handleFileUpload);
convertBtn.addEventListener('click', convertAudio);
downloadBtn.addEventListener('click', downloadConvertedAudio);

// Update the file upload handler
function handleFileUpload(e) {
  const files = e.target.files;
  if (!files.length) return;
  
  fileQueue = Array.from(files);
  showStatus(`Added ${fileQueue.length} files to queue`, 'success');
  convertBtn.disabled = false;
  
  // Update bit rate display for the first file
  const selectedBitDepth = document.querySelector('input[name="bitDepth"]:checked').value;
  updateBitRateDisplay(files[0], parseInt(selectedBitDepth));
  
  // If there's just one file, load it into the player
  if (fileQueue.length === 1) {
    const file = fileQueue[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const arrayBuffer = e.target.result;
      audioContext.decodeAudioData(arrayBuffer, function(buffer) {
        originalBuffer = buffer;
        audioBuffer = buffer;
        convertBtn.disabled = false;
        showStatus('Audio file loaded successfully. Ready to convert.', 'success');
      });
    };
    reader.readAsArrayBuffer(file);
  }
}

// Convert audio to selected bit depth
async function convertAudio() {
  console.log('Convert button clicked');
  if (fileQueue.length === 0) {
    showStatus('No files to convert', 'error');
    return;
  }

  const bitDepth = parseInt(document.querySelector('input[name="bitDepth"]:checked').value);
  console.log('Selected bit depth:', bitDepth);

  try {
    const file = fileQueue[0];
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Store the converted buffer
    convertedBuffer = audioBuffer;
    
    // Create a blob from the converted audio
    const wavBlob = await convertToWav(audioBuffer, bitDepth);
    
    // Create a URL for the converted audio
    const audioUrl = URL.createObjectURL(wavBlob);
    
    // Load the converted audio into the first pad
    const firstPad = pads[0];
    const firstPadInput = firstPad.querySelector('input');
    const firstPadButton = firstPad.querySelector('button');
    
    // Create a new File object from the blob
    const convertedFile = new File([wavBlob], `converted_${file.name}`, { type: 'audio/wav' });
    
    // Update the pad UI
    firstPad.className = 'loaded';
    firstPadButton.textContent = convertedFile.name;
    
    // Store the converted file in the sources array
    sources[0] = {
      buffer: audioBuffer,
      file: convertedFile,
      url: audioUrl
    };
    
    // Update the UI
    updateUI();
    
    showStatus('Conversion complete! Audio loaded into first pad.', 'success');
    convertBtn.disabled = true;
    downloadBtn.disabled = false;
    
  } catch (error) {
    console.error('Error during conversion:', error);
    showStatus('Error during conversion: ' + error.message, 'error');
  }
}

// Download converted audio
function downloadConvertedAudio() {
  if (!convertedBuffer) {
    showStatus('No converted audio available', 'error');
    return;
  }
  
  const selectedBitDepth = document.querySelector('input[name="bitDepth"]:checked').value;
  const audioData = convertBufferToWave(convertedBuffer, parseInt(selectedBitDepth));
  const blob = new Blob([audioData], { type: 'audio/wav' });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `converted-${selectedBitDepth}bit-audio.wav`;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 100);
  
  showStatus('Download started', 'success');
}

// Display status messages
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = `status ${type}`;
  statusMessage.style.display = 'block';
  
  // Hide status after 5 seconds
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, 5000);
}

// Add event listener for bit depth changes
document.querySelectorAll('input[name="bitDepth"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (fileQueue.length > 0) {
      updateBitRateDisplay(fileQueue[0], parseInt(radio.value));
    }
  });
});

function convertBufferToWave(buffer, bitDepth) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  
  let bytesPerSample;
  let isFloat = false;
  
  switch (bitDepth) {
    case 8:
      bytesPerSample = 1;
      break;
    case 16:
      bytesPerSample = 2;
      break;
    case 24:
      bytesPerSample = 3;
      break;
    case 32:
    default:
      bytesPerSample = 4;
      isFloat = true;
      break;
  }
  
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, isFloat ? 3 : 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      
      if (bitDepth === 8) {
        const val = Math.floor((sample + 1) * 127.5);
        view.setUint8(offset, val);
        offset += 1;
      } else if (bitDepth === 16) {
        const val = Math.floor(sample * 32767);
        view.setInt16(offset, val, true);
        offset += 2;
      } else if (bitDepth === 24) {
        const val = Math.floor(sample * 8388607);
        view.setUint8(offset, val & 0xFF);
        view.setUint8(offset + 1, (val >> 8) & 0xFF);
        view.setUint8(offset + 2, (val >> 16) & 0xFF);
        offset += 3;
      } else {
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
  }
  
  return arrayBuffer;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function convertToWav(audioBuffer, bitDepth) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  
  // Calculate bytes per sample based on bit depth
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  
  // Create WAV header
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  
  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // Format code (1 for PCM, 3 for float)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = audioBuffer.getChannelData(channel)[i];
      
      if (bitDepth === 8) {
        // 8-bit samples are unsigned
        const val = Math.floor((sample + 1) * 127.5);
        view.setUint8(offset, val);
        offset += 1;
      } else if (bitDepth === 16) {
        // 16-bit samples are signed
        const val = Math.floor(sample * 32767);
        view.setInt16(offset, val, true);
        offset += 2;
      } else if (bitDepth === 24) {
        // 24-bit samples are signed
        const val = Math.floor(sample * 8388607);
        view.setUint8(offset, val & 0xFF);
        view.setUint8(offset + 1, (val >> 8) & 0xFF);
        view.setUint8(offset + 2, (val >> 16) & 0xFF);
        offset += 3;
      } else if (bitDepth === 32) {
        // 32-bit samples are float
        view.setFloat32(offset, sample, true);
        offset += 4;
      }
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
