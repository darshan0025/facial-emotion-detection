const video = document.getElementById('webcam');
const emotionText = document.getElementById('emotion-text');
const confidenceFill = document.getElementById('confidence-fill');
const confidenceText = document.getElementById('confidence-text');
const faceBox = document.getElementById('face-box');
const toggleBtn = document.getElementById('toggle-cam');
const navItems = document.querySelectorAll('.nav-item');
const viewContents = document.querySelectorAll('.viewport-content');
const fileUpload = document.getElementById('file-upload');
const imagePreview = document.getElementById('image-preview');
const imagePreviewContainer = document.getElementById('image-preview-container');
const dropzone = document.getElementById('dropzone');
const clearBtn = document.getElementById('clear-image');
const placeholder = document.getElementById('camera-placeholder');
const statusText = document.getElementById('status');
const serverTime = document.getElementById('server-time');

let isStreaming = false;
let stream = null;
let predictionInterval = null;
let recentPredictions = [];
const PREDICTION_HISTORY_SIZE = 3;
const CONFIDENCE_THRESHOLD = 40;

// Update HUD Real-time Clock
function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
    serverTime.innerText = `[${dateStr}] SYSTEM_TIME: ${timeStr} | UPTIME_STABLE`;
}
setInterval(updateClock, 1000);
updateClock();

async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user" 
            } 
        });
        video.srcObject = stream;
        video.style.display = 'block';
        placeholder.style.display = 'none';
        isStreaming = true;
        document.body.classList.add('streaming');
        toggleBtn.querySelector('.btn-text').innerText = 'TERMINATE CAM';
        statusText.innerText = 'NEURAL LINK ACTIVE';
        
        startPredicting();
    } catch (err) {
        console.error("Error accessing webcam:", err);
        emotionText.innerText = "LINK ERROR";
        statusText.innerText = 'HARDWARE FAILURE';
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        video.style.display = 'none';
        placeholder.style.display = 'flex';
        isStreaming = false;
        document.body.classList.remove('streaming');
        toggleBtn.querySelector('.btn-text').innerText = 'INITIALIZE CAM';
        statusText.innerText = 'NEURAL LINK STABLE';
        clearInterval(predictionInterval);
        recentPredictions = [];
        resetUI();
    }
}

function startPredicting() {
    predictionInterval = setInterval(async () => {
        if (!isStreaming) return;

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('image', blob);

            try {
                const response = await fetch('/predict', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                const activeTab = document.querySelector('.nav-item.active').dataset.tab;
                if (data.emotion && isStreaming && activeTab === 'live-feed') {
                    if (data.confidence >= CONFIDENCE_THRESHOLD) {
                        recentPredictions.push(data);
                        if (recentPredictions.length > PREDICTION_HISTORY_SIZE) {
                            recentPredictions.shift();
                        }
                        const smoothedData = getSmoothedPrediction();
                        updateUI(smoothedData);
                    } else {
                        emotionText.innerText = "UNCERTAIN";
                        confidenceFill.style.width = `${data.confidence}%`;
                        confidenceText.innerText = `${data.confidence}%`;
                    }
                }
            } catch (err) {
                console.error("Prediction error:", err);
            }
        }, 'image/jpeg');
    }, 200);
}

function getSmoothedPrediction() {
    const emotionCounts = {};
    let totalConfidence = 0;
    recentPredictions.forEach(pred => {
        emotionCounts[pred.emotion] = (emotionCounts[pred.emotion] || 0) + 1;
        totalConfidence += pred.confidence;
    });
    let maxCount = 0;
    let dominantEmotion = recentPredictions[recentPredictions.length - 1].emotion;
    for (const [emotion, count] of Object.entries(emotionCounts)) {
        if (count > maxCount) {
            maxCount = count;
            dominantEmotion = emotion;
        }
    }
    return {
        emotion: dominantEmotion,
        confidence: Math.round(totalConfidence / recentPredictions.length),
        box: recentPredictions[recentPredictions.length - 1].box
    };
}

function updateUI(data) {
    emotionText.innerText = data.emotion.toUpperCase();
    confidenceFill.style.width = `${data.confidence}%`;
    confidenceText.innerText = `${data.confidence}%`;

    if (data.box && isStreaming) {
        const [x, y, w, h] = data.box;
        const videoRect = video.getBoundingClientRect();
        const containerRect = video.parentElement.getBoundingClientRect();
        const actualWidth = video.videoWidth;
        const actualHeight = video.videoHeight;
        const videoAspect = actualWidth / actualHeight;
        const containerAspect = videoRect.width / videoRect.height;
        
        let displayWidth, displayHeight, offsetX, offsetY;
        if (videoAspect > containerAspect) {
            displayWidth = videoRect.width;
            displayHeight = videoRect.width / videoAspect;
            offsetX = 0;
            offsetY = (videoRect.height - displayHeight) / 2;
        } else {
            displayHeight = videoRect.height;
            displayWidth = videoRect.height * videoAspect;
            offsetX = (videoRect.width - displayWidth) / 2;
            offsetY = 0;
        }
        
        const scaleX = displayWidth / actualWidth;
        const scaleY = displayHeight / actualHeight;

        faceBox.style.display = 'block';
        faceBox.style.left = `${offsetX + x * scaleX}px`;
        faceBox.style.top = `${offsetY + y * scaleY}px`;
        faceBox.style.width = `${w * scaleX}px`;
        faceBox.style.height = `${h * scaleY}px`;
    } else {
        faceBox.style.display = 'none';
    }
}

// Nav Navigation Logic
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const target = item.dataset.tab;
        resetUI();
        
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        viewContents.forEach(content => {
            content.classList.remove('active');
            if(content.id === target) content.classList.add('active');
        });

        if (target === 'live-feed') {
            document.querySelector('.viewport-controls').style.visibility = 'visible';
        } else {
            document.querySelector('.viewport-controls').style.visibility = 'hidden';
            stopCamera();
        }
    });
});

function resetUI() {
    emotionText.innerText = "SCANNING...";
    confidenceFill.style.width = "0%";
    confidenceText.innerText = "0%";
    faceBox.style.display = 'none';
}

function clearUpload() {
    fileUpload.value = '';
    imagePreview.src = '';
    imagePreviewContainer.style.display = 'none';
    dropzone.style.display = 'flex';
    resetUI();
}

clearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearUpload();
});

fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    emotionText.innerText = "DECRYPTING...";
    statusText.innerText = 'DATA INGESTION IN PROGRESS';

    const reader = new FileReader();
    reader.onload = async (e) => {
        imagePreview.src = e.target.result;
        imagePreviewContainer.style.display = 'flex';
        dropzone.style.display = 'none';

        const img = new Image();
        img.onload = async () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 800;
            let width = img.width;
            let height = img.height;

            if (width > height && width > MAX_SIZE) {
                height = (height * MAX_SIZE) / width;
                width = MAX_SIZE;
            } else if (height > MAX_SIZE) {
                width = (width * MAX_SIZE) / height;
                height = MAX_SIZE;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(async (blob) => {
                const formData = new FormData();
                formData.append('image', blob, 'image.jpg');

                try {
                    const response = await fetch('/predict', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();

                    if (data.emotion && data.emotion !== 'No Face Detected') {
                        updateUI(data);
                        statusText.innerText = 'ANALYSIS COMPLETE';
                    } else {
                        emotionText.innerText = "NO SIGNAL";
                        statusText.innerText = 'SUBJECT NOT FOUND';
                    }
                } catch (err) {
                    console.error("Upload prediction error:", err);
                    emotionText.innerText = "ERROR";
                }
            }, 'image/jpeg', 0.85);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
});

toggleBtn.addEventListener('click', () => {
    if (isStreaming) {
        stopCamera();
    } else {
        startCamera();
    }
});
