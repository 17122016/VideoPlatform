import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { Badge, IconButton, TextField, Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import styles from '../styles/videoComponent.module.css';
import server from '../environment';

const server_url = server;

var connections = {};

const peerConfigConnections = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export default function VideoMeetComponent() {
    const socketRef = useRef();
    const socketIdRef = useRef();
    const localVideoref = useRef();
    const videoRef = useRef([]);

    const [videoAvailable, setVideoAvailable] = useState(true);
    const [audioAvailable, setAudioAvailable] = useState(true);
    const [video, setVideo] = useState([]);
    const [audio, setAudio] = useState();
    const [screen, setScreen] = useState();
    const [showModal, setModal] = useState(true);
    const [screenAvailable, setScreenAvailable] = useState();
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [newMessages, setNewMessages] = useState(3);
    const [askForUsername, setAskForUsername] = useState(true);
    const [username, setUsername] = useState('');
    const [videos, setVideos] = useState([]);

    useEffect(() => {
        getPermissions();
    }, []);

    const getPermissions = async () => {
        try {
            const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
            setVideoAvailable(!!videoPermission);
            const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
            setAudioAvailable(!!audioPermission);
            setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);
            
            if (videoAvailable || audioAvailable) {
                const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });
                window.localStream = userMediaStream;
                if (localVideoref.current) {
                    localVideoref.current.srcObject = userMediaStream;
                }
            }
        } catch (error) {
            console.log(error);
        }
    };

    const connectToSocketServer = () => {
        socketRef.current = io.connect(server_url, { secure: false });

        socketRef.current.on('signal', gotMessageFromServer);

        socketRef.current.on('connect', () => {
            socketRef.current.emit('join-call', window.location.href);
            socketIdRef.current = socketRef.current.id;

            socketRef.current.on('user-left', (id) => {
                setVideos((videos) => videos.filter((video) => video.socketId !== id));
            });

            socketRef.current.on('user-joined', (id, clients) => {
                clients.forEach((socketListId) => {
                    connections[socketListId] = new RTCPeerConnection(peerConfigConnections);
                    connections[socketListId].onicecandidate = (event) => {
                        if (event.candidate != null) {
                            socketRef.current.emit('signal', socketListId, JSON.stringify({ ice: event.candidate }));
                        }
                    };

                    connections[socketListId].onaddstream = (event) => {
                        let videoExists = videoRef.current.find((video) => video.socketId === socketListId);

                        if (videoExists) {
                            setVideos((videos) => {
                                return videos.map((video) =>
                                    video.socketId === socketListId ? { ...video, stream: event.stream } : video
                                );
                            });
                        } else {
                            let newVideo = {
                                socketId: socketListId,
                                stream: event.stream,
                                autoplay: true,
                                playsinline: true,
                            };

                            setVideos((videos) => [...videos, newVideo]);
                        }
                    };

                    if (window.localStream !== undefined && window.localStream !== null) {
                        connections[socketListId].addStream(window.localStream);
                    } else {
                        let blackSilence = () => new MediaStream([black(), silence()]);
                        window.localStream = blackSilence();
                        connections[socketListId].addStream(window.localStream);
                    }
                });
            });
        });
    };

    const gotMessageFromServer = (fromId, message) => {
        const signal = JSON.parse(message);

        if (fromId !== socketIdRef.current) {
            if (signal.sdp) {
                connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
                    if (signal.sdp.type === 'offer') {
                        connections[fromId].createAnswer().then((description) => {
                            connections[fromId].setLocalDescription(description).then(() => {
                                socketRef.current.emit('signal', fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
                            });
                        });
                    }
                });
            }

            if (signal.ice) {
                connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice));
            }
        }
    };

    const handleVideo = () => {
        setVideo(!video);
    };

    const handleAudio = () => {
        setAudio(!audio);
    };

    const handleScreen = () => {
        setScreen(!screen);
    };

    const handleEndCall = () => {
        try {
            let tracks = localVideoref.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
        } catch (e) {}
        window.location.href = '/';
    };

    const addMessage = (data, sender) => {
        setMessages((prevMessages) => [...prevMessages, { sender: sender, data: data }]);
        if (socketIdRef.current !== socketIdRef.current) {
            setNewMessages((prevNewMessages) => prevNewMessages + 1);
        }
    };

    const sendMessage = () => {
        socketRef.current.emit('chat-message', message, username);
        setMessage('');
    };

    const connect = () => {
        setAskForUsername(false);
        connectToSocketServer();
    };

    return (
        <div>
            {askForUsername ? (
                <div>
                    <h2>Enter into Lobby </h2>
                    <TextField label="Username" value={username} onChange={(e) => setUsername(e.target.value)} variant="outlined" />
                    <Button variant="contained" onClick={connect}>Connect</Button>
                    <div>
                        <video ref={localVideoref} autoPlay muted></video>
                    </div>
                </div>
            ) : (
                <div className={styles.meetVideoContainer}>
                    <div className={styles.buttonContainers}>
                        <IconButton onClick={handleVideo}>
                            {video ? <VideocamIcon /> : <VideocamOffIcon />}
                        </IconButton>
                        <IconButton onClick={handleEndCall} style={{ color: 'red' }}>
                            <CallEndIcon />
                        </IconButton>
                        <IconButton onClick={handleAudio}>
                            {audio ? <MicIcon /> : <MicOffIcon />}
                        </IconButton>
                        {screenAvailable && (
                            <IconButton onClick={handleScreen}>
                                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
                            </IconButton>
                        )}
                        <Badge badgeContent={newMessages} max={999} color="orange">
                            <IconButton onClick={() => setModal(!showModal)}>
                                <ChatIcon />
                            </IconButton>
                        </Badge>
                    </div>
                    <video className={styles.meetUserVideo} ref={localVideoref} autoPlay muted></video>
                    <div className={styles.conferenceView}>
                        {videos.map((video) => (
                            <div key={video.socketId}>
                                <video ref={(ref) => { if (ref && video.stream) ref.srcObject = video.stream; }} autoPlay></video>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
