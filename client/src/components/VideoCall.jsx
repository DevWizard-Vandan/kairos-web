import { useEffect, useRef } from 'react';
import { Phone, Mic, MicOff, Video, VideoOff } from 'lucide-react';

// Helper component for individual video streams
const VideoCard = ({ peer, stream }) => {
    const ref = useRef();
    useEffect(() => {
        if (stream && ref.current) ref.current.srcObject = stream;

        const handleStream = (s) => {
            if (ref.current) ref.current.srcObject = s;
        };
        peer.on("stream", handleStream);
        return () => { peer.off("stream", handleStream); };
    }, [peer, stream]);
    return <video playsInline autoPlay ref={ref} className="w-full h-full object-cover bg-gray-900 rounded-lg border border-gray-700" />;
};

export default function VideoCall({
    callActive, isGroup, peers, localStream, leaveCall,
    callAccepted, answerCall, receivingCall
}) {
    const localVideo = useRef();

    useEffect(() => {
        if (localStream && localVideo.current) localVideo.current.srcObject = localStream;
    }, [localStream, callActive]);

    if (!callActive) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col p-4 animate-in fade-in duration-300">
            {/* HEADER */}
            <div className="flex justify-between items-center mb-4 px-4">
                <span className="text-white text-xl font-bold">{isGroup ? "Group Call" : "Video Call"}</span>
                <div className="bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm animate-pulse">● Live</div>
            </div>

            {/* VIDEO GRID */}
            <div className={`flex-1 grid gap-4 p-4 ${peers.length === 0 ? 'grid-cols-1' : (peers.length <= 2 ? 'grid-cols-2' : 'grid-cols-3')}`}>
                {/* MY VIDEO */}
                <div className="relative rounded-xl overflow-hidden shadow-2xl border border-gray-700">
                    <video playsInline muted ref={localVideo} autoPlay className="w-full h-full object-cover" />
                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-xs">You</div>
                </div>

                {/* PEER VIDEOS */}
                {peers.map((peerObj, index) => (
                    <div key={index} className="relative rounded-xl overflow-hidden shadow-2xl border border-gray-700">
                        <VideoCard peer={peerObj.peer} stream={peerObj.stream} />
                        <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-xs">
                            {peerObj.info ? peerObj.info.username : 'Participant'}
                        </div>
                    </div>
                ))}
            </div>

            {/* CONTROLS */}
            <div className="h-24 flex items-center justify-center gap-8">
                {receivingCall && !callAccepted ? (
                    <div className="flex flex-col items-center animate-bounce">
                        <span className="text-white mb-2 text-lg font-bold">Incoming Call...</span>
                        <button onClick={answerCall} className="bg-green-500 p-4 rounded-full hover:bg-green-600 transition shadow-lg shadow-green-500/50">
                            <Phone size={32} className="text-white fill-white" />
                        </button>
                    </div>
                ) : (
                    <>
                        <button className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition"><Mic size={24} /></button>
                        <button onClick={leaveCall} className="bg-red-600 p-5 rounded-full hover:bg-red-700 transition shadow-lg shadow-red-600/50">
                            <Phone size={32} className="text-white rotate-[135deg] fill-white" />
                        </button>
                        <button className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition"><Video size={24} /></button>
                    </>
                )}
            </div>
        </div>
    );
}
