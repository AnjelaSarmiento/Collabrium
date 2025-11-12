import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import {
  VideoCameraIcon,
  VideoCameraSlashIcon,
  MicrophoneIcon,
  SpeakerXMarkIcon,
  PhoneIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';

interface VideoCallProps {
  roomId: string;
  onEndCall: () => void;
}

const VideoCall: React.FC<VideoCallProps> = ({ roomId, onEndCall }) => {
  const { sendVideoOffer, sendVideoAnswer, sendIceCandidate, onVideoOffer, onVideoAnswer, onIceCandidate } = useSocket();
  
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Wait a bit for the refs to be attached before initializing
    const initTimer = setTimeout(() => {
      if (isMounted) {
        initializeCall();
      }
    }, 100);
    
    const timerCleanup = startCallTimer();

    return () => {
      console.log('[VideoCall] Cleanup running - isMounted:', isMounted, 'hasStream:', !!localStreamRef.current, 'hasConnection:', !!peerConnectionRef.current);
      isMounted = false;
      clearTimeout(initTimer);
      timerCleanup();
      // Only call endCall if we actually initialized
      if (localStreamRef.current || peerConnectionRef.current) {
        console.log('[VideoCall] Cleanup calling endCall');
        endCall();
      } else {
        console.log('[VideoCall] Cleanup skipping endCall - nothing initialized yet');
      }
    };
  }, []);

  // Ensure video stream is set when ref becomes available
  useEffect(() => {
    const checkAndSetVideo = () => {
      if (localVideoRef.current && localStreamRef.current) {
        if (localVideoRef.current.srcObject !== localStreamRef.current) {
          console.log('[VideoCall] Setting video stream in useEffect');
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(err => {
            console.error('[VideoCall] Error playing video in useEffect:', err);
          });
        }
      }
    };
    
    // Check immediately
    checkAndSetVideo();
    
    // Also check after a short delay to ensure ref is ready
    const timeout = setTimeout(checkAndSetVideo, 100);
    
    return () => clearTimeout(timeout);
  });

  const initializeCall = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      console.log('[VideoCall] Initializing call for room:', roomId);
      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      console.log('[VideoCall] Got user media stream:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
        active: stream.active
      });
      
      localStreamRef.current = stream;
      
      // Try to set video immediately if ref is available
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('[VideoCall] Set local video srcObject');
        // Force play
        localVideoRef.current.play().catch(err => {
          console.error('[VideoCall] Error playing local video:', err);
        });
      } else {
        console.warn('[VideoCall] localVideoRef.current is null, will set in useEffect');
        // The useEffect will handle setting it when the ref becomes available
      }

      // Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      peerConnectionRef.current = peerConnection;

      // Add local stream to peer connection
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          sendIceCandidate(roomId, event.candidate);
        }
      };

      // Listen for offers
      onVideoOffer((data) => {
        if (data.roomId === roomId) {
          handleOffer(data.offer);
        }
      });

      // Listen for answers
      onVideoAnswer((data) => {
        if (data.roomId === roomId) {
          handleAnswer(data.answer);
        }
      });

      // Listen for ICE candidates
      onIceCandidate((data) => {
        if (data.roomId === roomId) {
          handleIceCandidate(data.candidate);
        }
      });

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      sendVideoOffer(roomId, offer);

      setIsInitializing(false);
    } catch (error: any) {
      console.error('[VideoCall] Failed to initialize call:', error);
      setError(error.message || 'Failed to initialize video call. Please check your camera and microphone permissions.');
      setIsInitializing(false);
      // Don't call onEndCall here - let user see the error and close manually
    }
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;

    try {
      await peerConnectionRef.current.setRemoteDescription(offer);
      const answer = await peerConnectionRef.current.createAnswer();
      await peerConnectionRef.current.setLocalDescription(answer);
      sendVideoAnswer(roomId, answer);
    } catch (error) {
      console.error('Failed to handle offer:', error);
    }
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) return;

    try {
      await peerConnectionRef.current.setRemoteDescription(answer);
    } catch (error) {
      console.error('Failed to handle answer:', error);
    }
  };

  const handleIceCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnectionRef.current) return;

    try {
      await peerConnectionRef.current.addIceCandidate(candidate);
    } catch (error) {
      console.error('Failed to handle ICE candidate:', error);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        screenStreamRef.current = screenStream;

        // Replace video track
        if (peerConnectionRef.current && localStreamRef.current) {
          const videoTrack = screenStream.getVideoTracks()[0];
          const sender = peerConnectionRef.current.getSenders().find(s => 
            s.track && s.track.kind === 'video'
          );
          
          if (sender) {
            await sender.replaceTrack(videoTrack);
          }

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = screenStream;
          }
        }

        setIsScreenSharing(true);

        // Handle screen share end
        screenStream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };

      } else {
        stopScreenShare();
      }
    } catch (error) {
      console.error('Failed to toggle screen share:', error);
    }
  };

  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    if (peerConnectionRef.current && localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => 
        s.track && s.track.kind === 'video'
      );
      
      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }

    setIsScreenSharing(false);
  };

  const startCallTimer = () => {
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    // Return cleanup function
    return () => {
      clearInterval(timer);
    };
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const endCall = () => {
    console.log('[VideoCall] endCall called');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    console.log('[VideoCall] Calling onEndCall to close modal');
    onEndCall();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-[9999] flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-secondary-900">Video Call</h2>
          <div className="text-sm text-secondary-600">
            Duration: {formatDuration(callDuration)}
          </div>
        </div>
        
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 font-medium">Error: {error}</p>
            <button
              onClick={endCall}
              className="mt-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Close
            </button>
          </div>
        )}
        
        {isInitializing && !error && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-800">Initializing video call...</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Remote Video */}
          <div className="bg-black rounded-lg aspect-video relative">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover rounded-lg"
              style={{ minHeight: '200px' }}
            />
            {!remoteVideoRef.current?.srcObject && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <p>Waiting for other participant...</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
              Remote User
            </div>
          </div>

          {/* Local Video */}
          <div className="bg-black rounded-lg aspect-video relative">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover rounded-lg"
              style={{ minHeight: '200px' }}
            />
            {!localStreamRef.current && (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-2"></div>
                  <p>Loading camera...</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 text-white text-sm bg-black bg-opacity-50 px-2 py-1 rounded">
              You
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center space-x-4">
          <button
            onClick={toggleAudio}
            className={`p-3 rounded-full ${
              isAudioEnabled 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isAudioEnabled ? (
              <MicrophoneIcon className="h-6 w-6" />
            ) : (
              <SpeakerXMarkIcon className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-3 rounded-full ${
              isVideoEnabled 
                ? 'bg-green-600 hover:bg-green-700 text-white' 
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isVideoEnabled ? (
              <VideoCameraIcon className="h-6 w-6" />
            ) : (
              <VideoCameraSlashIcon className="h-6 w-6" />
            )}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-3 rounded-full ${
              isScreenSharing 
                ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                : 'bg-secondary-600 hover:bg-secondary-700 text-white'
            }`}
          >
            <ComputerDesktopIcon className="h-6 w-6" />
          </button>

          <button
            onClick={endCall}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white"
          >
            <PhoneIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;
