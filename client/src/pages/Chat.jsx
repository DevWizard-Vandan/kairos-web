import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useReactMediaRecorder } from "react-media-recorder";
import SimplePeer from 'simple-peer';

// Components
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import VideoCall from '../components/VideoCall';
import SettingsModal from '../components/SettingsModal';
import CreateGroupModal from '../components/CreateGroupModal';
import AddMemberModal from '../components/AddMemberModal';

export const ENDPOINT = "http://localhost:3000";

export default function Chat({ user, onLogout }) {
    // --- STATE ---
    const [socket, setSocket] = useState(null);
    const [chats, setChats] = useState([]);
    const [activeChat, setActiveChat] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [currentUser, setCurrentUser] = useState(user);

    // Modals
    const [showSettings, setShowSettings] = useState(false);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showAddMember, setShowAddMember] = useState(false);

    // VIDEO STATE (1-on-1 & GROUP)
    const [callActive, setCallActive] = useState(false);
    const [peers, setPeers] = useState([]); // Array of peer objects
    const [stream, setStream] = useState(null);
    const streamRef = useRef(null); // Ref to current stream for callbacks

    // Sync streamRef
    useEffect(() => {
        streamRef.current = stream;
    }, [stream]);

    // 1-on-1 specific
    const [receivingCall, setReceivingCall] = useState(false);
    const [callAccepted, setCallAccepted] = useState(false);
    const [callerSignal, setCallerSignal] = useState(null);
    const [caller, setCaller] = useState("");

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const peersRef = useRef([]); // To keep track of peer objects
    const connectionRef = useRef(); // For 1-on-1

    const { status, startRecording, stopRecording } = useReactMediaRecorder({
        audio: true, onStop: (blobUrl, blob) => handleVoiceUpload(blob)
    });

    // --- INIT SOCKET ---
    useEffect(() => {
        const newSocket = io(ENDPOINT);
        setSocket(newSocket);
        // Send object with username for group calls
        newSocket.emit("login", { id: user.id, username: user.username });

        // PRIVATE MESSAGE
        newSocket.on("private_message", (msg) => {
            loadAllChats();
            setActiveChat(current => {
                if (current && !current.isGroup && (msg.from === current.other_user_id || msg.to === current.other_user_id)) {
                    setMessages(p => (p.some(m => m.timestamp === msg.timestamp && m.text === msg.text) ? p : [...p, msg]));
                    setTimeout(scrollToBottom, 100);
                }
                return current;
            });
        });

        // GROUP MESSAGE
        newSocket.on("group_message", (msg) => {
            loadAllChats();
            setActiveChat(current => {
                if (current && current.isGroup && current.id === msg.group_id) {
                    setMessages(p => (p.some(m => m.timestamp === msg.timestamp && m.text === msg.text) ? p : [...p, { ...msg, isGroupMsg: true }]));
                    setTimeout(scrollToBottom, 100);
                }
                return current;
            });
        });

        // 1-on-1 INCOMING CALL
        newSocket.on("call_incoming", (data) => {
            setReceivingCall(true);
            setCaller(data.from);
            setCallerSignal(data.signal);
            setCallActive(true);
        });

        // GROUP - NEW USER JOINED
        newSocket.on("user_joined", payload => {
            // Use streamRef to ensure we send the current stream
            const peer = addPeer(payload.signal, payload.callerID, streamRef.current, newSocket);
            const peerObj = {
                peerID: payload.callerID,
                peer,
                info: payload.info
            };
            peersRef.current.push(peerObj);
            setPeers(users => [...users, peerObj]);
        });

        // GROUP - RETURNED SIGNAL
        newSocket.on("receiving_returned_signal", payload => {
            const item = peersRef.current.find(p => p.peerID === payload.id);
            if (item) item.peer.signal(payload.signal);
        });

        // GROUP - USER LEFT
        newSocket.on("user_left", id => {
            const peerObj = peersRef.current.find(p => p.peerID === id);
            if (peerObj) peerObj.peer.destroy();
            const newPeers = peersRef.current.filter(p => p.peerID !== id);
            peersRef.current = newPeers;
            setPeers(newPeers);
        });

        // ADDED TO GROUP NOTIFICATION
        newSocket.on("added_to_group", (data) => {
            newSocket.emit("join_group", data.groupId);
            loadAllChats();
        });

        loadAllChats();
        return () => newSocket.close();
    }, [user.id]);

    // --- DATA LOADING ---
    const loadAllChats = async () => {
        try {
            const [convRes, groupRes] = await Promise.all([
                axios.get(`${ENDPOINT}/api/conversations/${user.id}`),
                axios.get(`${ENDPOINT}/api/groups/${user.id}`)
            ]);
            const direct = convRes.data.map(c => ({ ...c, isGroup: false, id: c.other_user_id, name: c.username, avatar: c.avatar_url, updated_at: new Date(c.updated_at) }));
            const groups = groupRes.data.map(g => ({ ...g, isGroup: true, name: g.name, avatar: g.avatar_url, updated_at: new Date(g.updated_at) }));
            setChats([...direct, ...groups].sort((a, b) => b.updated_at - a.updated_at));
        } catch (e) { console.error(e); }
    };

    const openChat = async (chat) => {
        setActiveChat(chat);
        setMessages([]);
        try {
            const endpoint = chat.isGroup ? `/api/groups/${chat.id}/messages` : `/api/messages/${user.id}/${chat.other_user_id}`;
            const res = await axios.get(`${ENDPOINT}${endpoint}`);
            const history = res.data.map(m => ({
                from: m.sender_id, text: m.text, type: m.type, mediaUrl: m.media_url, timestamp: m.created_at,
                sender_name: m.sender_name, sender_avatar: m.sender_avatar, isGroupMsg: chat.isGroup
            }));
            setMessages(history);
            setTimeout(scrollToBottom, 50);
            if (chat.isGroup && socket) socket.emit('join_group', chat.id);
        } catch (e) { console.error(e); }
    };

    const sendMessage = (text, type = 'text', mediaUrl = null) => {
        if (!activeChat || (!text && !mediaUrl)) return;
        const msgData = {
            groupId: activeChat.isGroup ? activeChat.id : null,
            to: activeChat.isGroup ? null : activeChat.other_user_id,
            from: user.id, text, type, mediaUrl, timestamp: new Date()
        };
        if (activeChat.isGroup) socket.emit("group_message", msgData);
        else {
            setMessages(p => [...p, msgData]);
            socket.emit("private_message", msgData);
        }
        setNewMessage(""); setTimeout(scrollToBottom, 50);
    };

    // --- VIDEO LOGIC (HYBRID) ---
    const startCall = () => {
        setCallActive(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(currentStream => {
            setStream(currentStream);

            if (activeChat.isGroup) {
                // GROUP LOGIC
                const videoRoomId = `video_${activeChat.id}`;
                socket.emit("join_room", videoRoomId);

                socket.on("all_users", (users) => {
                    const peersArr = [];
                    users.forEach(userObj => {
                        const peer = createPeer(userObj.socketId, socket.id, currentStream, socket);
                        const pObj = { peerID: userObj.socketId, peer, info: userObj.info };
                        peersRef.current.push(pObj);
                        peersArr.push(pObj);
                    });
                    setPeers(peersArr);
                });
            } else {
                // 1-ON-1 LOGIC
                const peer = new SimplePeer({ initiator: true, trickle: false, stream: currentStream });
                peer.on("signal", data => socket.emit("call_user", { userToCall: activeChat.other_user_id, signalData: data, from: user.id }));

                peer.on("stream", remoteStream => {
                    // Pass info so 1-on-1 also has a name label
                    setPeers([{ peerID: activeChat.other_user_id, peer, stream: remoteStream, info: { username: activeChat.name } }]);
                });

                socket.on("call_accepted", signal => { setCallAccepted(true); peer.signal(signal); });
                connectionRef.current = peer;
            }
        }).catch(err => {
            console.error("Failed to get media", err);
            alert("Could not access camera/microphone");
            setCallActive(false);
        });
    };

    const answerCall = () => {
        setCallAccepted(true);
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(currentStream => {
            setStream(currentStream);
            const peer = new SimplePeer({ initiator: false, trickle: false, stream: currentStream });
            peer.on("signal", data => socket.emit("answer_call", { signal: data, to: caller }));

            peer.on("stream", remoteStream => {
                // For 1-on-1 answer, we just set the single peer
                setPeers([{ peerID: caller, peer, stream: remoteStream, info: { username: "Caller" } }]);
            });

            peer.signal(callerSignal);
            connectionRef.current = peer;
        });
    };

    // Group Peer Helpers
    function createPeer(userToSignal, callerID, stream, socket) {
        const peer = new SimplePeer({ initiator: true, trickle: false, stream });
        peer.on("signal", signal => socket.emit("sending_signal", { userToSignal, callerID, signal }));
        peer.on("stream", remoteStream => {
            setPeers(prev => prev.map(p => p.peer === peer ? { ...p, stream: remoteStream } : p));
        });
        return peer;
    }
    function addPeer(incomingSignal, callerID, stream, socket) {
        const peer = new SimplePeer({ initiator: false, trickle: false, stream });
        peer.on("signal", signal => socket.emit("returning_signal", { signal, callerID }));
        peer.on("stream", remoteStream => {
            setPeers(prev => prev.map(p => p.peer === peer ? { ...p, stream: remoteStream } : p));
        });
        peer.signal(incomingSignal);
        return peer;
    }

    const leaveCall = () => {
        setCallActive(false); setCallAccepted(false); setReceivingCall(false);

        if (connectionRef.current) connectionRef.current.destroy();
        peersRef.current.forEach(p => { if (p.peer) p.peer.destroy(); });
        peersRef.current = []; setPeers([]);

        if (stream) stream.getTracks().forEach(t => t.stop());
        setStream(null);

        if (activeChat && activeChat.isGroup) {
            socket.emit('leave_room', `video_${activeChat.id}`);
            socket.off("all_users"); // Clean up listener to prevent duplicates
        }

        // Remove 1-on-1 listeners
        if (socket) {
            socket.off("call_accepted");
        }
    };

    const handleCreateGroup = async (name, selected) => {
        try {
            const res = await axios.post(`${ENDPOINT}/api/groups`, { name, userIds: selected, adminId: user.id });
            socket.emit('join_group', res.data.id);
            setShowCreateGroup(false); loadAllChats();
        } catch (e) { }
    };

    const handleAddMember = async (selectedUsers) => {
        try {
            await axios.post(`${ENDPOINT}/api/groups/${activeChat.id}/members`, { userIds: selectedUsers });
            setShowAddMember(false); alert("Members Added!");
        } catch (e) { alert("Failed to add members"); }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const formData = new FormData(); formData.append('file', file);
        const res = await axios.post(`${ENDPOINT}/api/upload`, formData);
        sendMessage(null, res.data.type, res.data.url);
    };
    const handleVoiceUpload = async (blob) => {
        const file = new File([blob], "voice.wav", { type: "audio/wav" });
        const formData = new FormData(); formData.append('file', file);
        const res = await axios.post(`${ENDPOINT}/api/upload`, formData);
        sendMessage(null, 'audio', res.data.url);
    };
    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        const res = await axios.put(`${ENDPOINT}/api/users/profile`, { userId: user.id, bio: e.target.bio.value });
        setCurrentUser({ ...currentUser, bio: res.data.bio }); setShowSettings(false);
    };
    const handleAvatarUpload = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const formData = new FormData(); formData.append('file', file);
        const res = await axios.post(`${ENDPOINT}/api/upload`, formData);
        await axios.put(`${ENDPOINT}/api/users/profile`, { userId: user.id, avatarUrl: res.data.url });
        setCurrentUser({ ...currentUser, avatar_url: res.data.url });
    };
    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    return (
        <div className="flex h-screen bg-[#0b141a] overflow-hidden text-[#e9edef] font-sans">
            <Sidebar
                user={currentUser} chats={chats} activeChat={activeChat} openChat={openChat}
                searchTerm={searchTerm} handleSearch={(e) => setSearchTerm(e.target.value)} setShowSettings={setShowSettings} onLogout={onLogout}
                onOpenCreateGroup={() => setShowCreateGroup(true)}
            />
            <ChatWindow
                activeChat={activeChat} messages={messages} user={user}
                newMessage={newMessage} setNewMessage={setNewMessage} sendMessage={sendMessage}
                fileInputRef={fileInputRef} handleFileUpload={handleFileUpload}
                status={status} startRecording={startRecording} stopRecording={stopRecording}
                messagesEndRef={messagesEndRef} callUser={startCall}
                onAddMember={() => setShowAddMember(true)}
            />
            <VideoCall
                callActive={callActive} receivingCall={receivingCall} callAccepted={callAccepted}
                isGroup={activeChat?.isGroup} peers={peers} localStream={stream}
                answerCall={answerCall} leaveCall={leaveCall}
            />
            <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} currentUser={currentUser} onUpdateProfile={handleProfileUpdate} onUploadAvatar={handleAvatarUpload} />
            <CreateGroupModal show={showCreateGroup} onClose={() => setShowCreateGroup(false)} onCreate={handleCreateGroup} currentUserId={user.id} />
            <AddMemberModal show={showAddMember} onClose={() => setShowAddMember(false)} onAdd={handleAddMember} groupId={activeChat?.id} currentUserId={user.id} />
        </div>
    );
}