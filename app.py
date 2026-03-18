import os
import cv2
import numpy as np
from flask import Flask, render_template, request, jsonify

try:
    from tflite_runtime.interpreter import Interpreter
except ImportError:
    from tensorflow.lite.python.interpreter import Interpreter

app = Flask(__name__)

# Load the lightweight TFLite model
MODEL_PATH = 'model_optimal.tflite'
interpreter = Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()
input_details = interpreter.get_input_details()
output_details = interpreter.get_output_details()

# Emotion labels (standard FER2013 alphabetical order)
EMOTIONS = ['Angry', 'Disgust', 'Fear', 'Happy', 'Neutral', 'Sad', 'Surprise']

# Load Haar Cascade for face detection
face_classifier = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get the image from the request
        file = request.files['image'].read()
        npimg = np.frombuffer(file, np.uint8)
        img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
        
        # Resize if image is too large (faster face detection)
        max_dimension = 800
        height, width = img.shape[:2]
        scale = 1.0
        if max(height, width) > max_dimension:
            scale = max_dimension / max(height, width)
            img = cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Optimized parameters: larger scaleFactor and minNeighbors for faster detection
        faces = face_classifier.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=3, minSize=(30, 30))
        
        if len(faces) == 0:
            return jsonify({'emotion': 'No Face Detected', 'confidence': 0})
        
        # Take the first face found
        (x, y, w, h) = faces[0]
        roi_gray = gray[y:y+h, x:x+w]
        
        # Apply histogram equalization to normalize lighting (improves accuracy)
        roi_gray = cv2.equalizeHist(roi_gray)
        
        roi_gray = cv2.resize(roi_gray, (48, 48), interpolation=cv2.INTER_AREA)
        
        # Preprocess for model
        roi = roi_gray.astype('float32') / 255.0
        roi = np.expand_dims(roi, axis=-1) # Add channel dimension (48, 48, 1)
        roi = np.expand_dims(roi, axis=0)  # Add batch dimension (1, 48, 48, 1)

        
        # Predict using TFLite interpreter
        interpreter.set_tensor(input_details[0]['index'], roi)
        interpreter.invoke()
        preds = interpreter.get_tensor(output_details[0]['index'])[0]
        
        label = EMOTIONS[preds.argmax()]
        confidence = float(preds.max())
        
        # Scale bounding box back to original image dimensions before returning
        return jsonify({
            'emotion': label,
            'confidence': round(confidence * 100, 2),
            'box': [int(x / scale), int(y / scale), int(w / scale), int(h / scale)]
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
