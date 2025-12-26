import { Phone } from 'lucide-react';

export default function VideoCall({
    callActive, receivingCall, callAccepted, activeChat,
    userVideo, myVideo, answerCall, leaveCall
}) {
    if (!callActive) return null;

    return (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center flex-col animate-in fade-in duration-300">
            <div className="relative w-full max-w-5xl aspect-video bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                {/* REMOTE VIDEO */}
                <video playsInline ref={userVideo} autoPlay className="w-full h-full object-cover" />

                {/* LOCAL VIDEO (PIP) */}
                <div className="absolute top-6 right-6 w-64 aspect-video bg-black rounded-xl border border-gray-700 shadow-2xl overflow-hidden">
                    <video playsInline muted ref={myVideo} autoPlay className="w-full h-full object-cover" />
                </div>

                {/* CONTROLS */}
                <div className="absolute bottom-10 left-0 w-full flex justify-center items-center gap-8">
                    {receivingCall && !callAccepted ? (
                        <div className="flex flex-col items-center animate-bounce">
                            <span className="text-white mb-4 text-xl font-bold drop-shadow-lg">Incoming Call...</span>
                            <button onClick={answerCall} className="bg-green-500 p-6 rounded-full hover:bg-green-600 transition shadow-lg shadow-green-500/50 transform hover:scale-110">
                                <Phone size={40} className="text-white fill-white" />
                            </button>
                        </div>
                    ) : (
                        <button onClick={leaveCall} className="bg-red-600 p-6 rounded-full hover:bg-red-700 transition shadow-lg shadow-red-600/50 transform hover:scale-110">
                            <Phone size={40} className="text-white rotate-[135deg] fill-white" />
                        </button>
                    )}
                </div>
            </div>
            {!callAccepted && !receivingCall && (
                <div className="text-white mt-8 text-2xl font-light tracking-wide animate-pulse">
                    Calling <span className="font-bold">{activeChat?.username}</span>...
                </div>
            )}
        </div>
    );
}