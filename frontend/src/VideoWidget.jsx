import React, { useRef, useState } from 'react';
import axios from 'axios';

const VideoWidget = () => {
  const [showDialog, setShowDialog] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      const recorder = new MediaRecorder(stream);
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' }); // Changed to webm for better browser support
        setRecordedBlob(blob);
        chunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
        setShowDialog(false);
      };
      
      recorder.start(1000); // Collect data every 1 second
      setMediaRecorder(recorder);
    } catch (err) {
      console.error("Error accessing media devices:", err);
      alert("Could not access camera/microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  };

  const saveVideo = async () => {
    if (!recordedBlob) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append('file', recordedBlob, 'recording.webm'); // Consistent with blob type
      
      const response = await axios.post('http://localhost:8000/upload/', formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
        },
      });
      
      alert(`Result: ${response.data.status}\nTranscript: ${response.data.transcript}\nExpected: ${response.data.expected}`);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.response?.data?.detail || err.message);
      alert(`Upload failed: ${error}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <input 
        type="text" 
        placeholder="Result will appear here..." 
        style={{ width: 200, marginRight: '10px' }} 
        readOnly 
      />
      <button onClick={() => setShowDialog(true)} disabled={isLoading}>🎥 Record</button>
      <button onClick={saveVideo} disabled={!recordedBlob || isLoading}>
        {isLoading ? 'Uploading...' : '💾 Save'}
      </button>

      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}

      {showDialog && (
        <div style={{
          position: 'fixed', 
          top: '20%', 
          left: '30%', 
          backgroundColor: '#fff',
          border: '1px solid #ccc', 
          padding: '20px', 
          zIndex: 10,
          boxShadow: '0 0 10px rgba(0,0,0,0.2)'
        }}>
          <video ref={videoRef} autoPlay muted style={{ width: 300 }} />
          <div style={{ marginTop: '10px' }}>
            {!mediaRecorder || mediaRecorder.state === 'inactive' ? (
              <button onClick={startRecording}>Start Recording</button>
            ) : (
              <button onClick={stopRecording}>Stop Recording</button>
            )}
            <button 
              onClick={() => {
                if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                  stopRecording();
                }
                setShowDialog(false);
              }}
              style={{ marginLeft: '10px' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoWidget;