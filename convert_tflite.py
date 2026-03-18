import tensorflow as tf

print("Loading model...")
model = tf.keras.models.load_model("model_optimal.h5")

print("Converting model to TFLite...")
converter = tf.lite.TFLiteConverter.from_keras_model(model)
tflite_model = converter.convert()

print("Saving TFLite model...")
with open("model_optimal.tflite", "wb") as f:
    f.write(tflite_model)

print("Done! TFLite model saved as model_optimal.tflite")
