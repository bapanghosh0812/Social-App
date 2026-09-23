import React, { useEffect, useRef, useState } from 'react';
import { X, Volume2, VolumeX, Radio } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useFeedStore } from '../../store/useFeedStore.js';
import { api } from '../../services/api.js';
import { realtime } from '../../services/realtime.js';
import type { LiveChatMessage, LiveSession } from '../../types/index.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, Spinner } from '../ui/primitives.js';
import { VerifiedBadge } from '../ui/misc.js';
import { FloatingHearts, LiveBadge, LiveChat, LiveComposer } from './LiveOverlay.js';

type Phase = 'connecting' | 'waiting' | 'playing' | 'ended' | 'error';

/** Viewer side of a live broadcast (receives the host's WebRTC stream). */
export const LiveViewer: React.FC = () => {
  const { liveViewerId, openLiveViewer, openProfile, addToast } = useAppStore();
  const fetchLives = useFeedStore((s) => s.fetchLives);
  const [session, setSession] = useState<LiveSession | null>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const [message, setMessage] = useState('');
  const [viewers, setViewers] = useState(0);
  const [chat, setChat] = useState<LiveChatMessage[]>([]);
  const [hearts, setHearts] = useState<number[]>([]);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pending = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (!liveViewerId) return;
    const sid = liveViewerId;
    let ice: RTCIceServer[] = [];
    setPhase('connecting');
    setChat([]);
    setHearts([]);

    const setupPeer = () => {
      pcRef.current?.close();
      const pc = new RTCPeerConnection({ iceServers: ice });
      pcRef.current = pc;
      pending.current = [];
      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0];
          videoRef.current.play().catch(() => {
            // Autoplay with sound blocked — start muted and let the viewer unmute.
            if (videoRef.current) {
              videoRef.current.muted = true;
              setMuted(true);
              videoRef.current.play().catch(() => {});
            }
          });
        }
        setPhase('playing');
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) realtime.send({ type: 'LIVE_SIGNAL', sessionId: sid, to: 'host', data: { candidate: e.candidate.toJSON() } });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          setMessage('Connection lost. Your network may be blocking live video.');
          setPhase('error');
        }
      };
      return pc;
    };

    const offs = [
      realtime.on('LIVE_JOINED', (m) => m.sessionId === sid && !m.hostOnline && setPhase('waiting')),
      realtime.on('LIVE_SIGNAL', async (m) => {
        if (m.sessionId !== sid || m.from !== 'host') return;
        try {
          if (m.data?.sdp?.type === 'offer') {
            const pc = setupPeer();
            await pc.setRemoteDescription(m.data.sdp);
            for (const c of pending.current.splice(0)) await pc.addIceCandidate(c);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            realtime.send({ type: 'LIVE_SIGNAL', sessionId: sid, to: 'host', data: { sdp: pc.localDescription } });
          } else if (m.data?.candidate) {
            const pc = pcRef.current;
            if (pc?.remoteDescription) await pc.addIceCandidate(m.data.candidate);
            else pending.current.push(m.data.candidate);
          }
        } catch {
          /* ignore stale signaling */
        }
      }),
      realtime.on('LIVE_STATS', (m) => m.sessionId === sid && setViewers(m.viewerCount)),
      realtime.on('LIVE_CHAT', (m) => m.sessionId === sid && setChat((c) => [...c.slice(-60), m.message])),
      realtime.on('LIVE_HEART', (m) => m.sessionId === sid && setHearts((h) => [...h.slice(-20), Date.now() + Math.random()])),
      realtime.on('LIVE_ENDED', (m) => {
        if (m.sessionId !== sid) return;
        setPhase('ended');
        fetchLives();
      }),
      realtime.on('LIVE_ERROR', (m) => {
        if (m.sessionId !== sid) return;
        setMessage(m.message);
        setPhase('error');
      }),
      realtime.on('READY', () => realtime.send({ type: 'LIVE_JOIN', sessionId: sid })), // rejoin after reconnect
    ];

    (async () => {
      try {
        const [info, cfg] = await Promise.all([api.getLiveSession(sid), api.getIceConfig()]);
        setSession(info.session);
        setViewers(info.session.viewerCount);
        ice = cfg.iceServers;
        realtime.send({ type: 'LIVE_JOIN', sessionId: sid });
      } catch (err: any) {
        setMessage(err.message || 'This live has ended.');
        setPhase('ended');
      }
    })();

    return () => {
      offs.forEach((off) => off());
      realtime.send({ type: 'LIVE_LEAVE', sessionId: sid });
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [liveViewerId]);

  if (!liveViewerId) return null;
  const close = () => openLiveViewer(null);

  return (
    <div className="fixed inset-0 z-[85] flex justify-center bg-black">
      <div className="relative h-full w-full max-w-[480px] overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />

        <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 safe-top">
          {session && (
            <button onClick={() => openProfile(session.host.id)} className="flex min-w-0 items-center gap-2.5 text-left text-white">
              <Avatar src={session.host.avatarUrl} name={session.host.fullName} size={40} ring="live" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 truncate text-sm font-semibold">
                  {session.host.fullName} <VerifiedBadge status={session.host.verificationStatus} size={13} />
                </p>
                <LiveBadge viewers={viewers} />
              </div>
            </button>
          )}
          <div className="flex shrink-0 gap-2">
            <button onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <button onClick={close} aria-label="Leave" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {(phase === 'connecting' || phase === 'waiting') && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-white">
            {session && <Avatar src={session.host.avatarUrl} name={session.host.fullName} size={96} ring="live" />}
            <Spinner size={28} />
            <p className="text-sm">{phase === 'waiting' ? 'Waiting for the host to reconnect…' : 'Joining live…'}</p>
            {session?.title && <p className="max-w-xs text-center font-display text-lg">{session.title}</p>}
          </div>
        )}

        {(phase === 'ended' || phase === 'error') && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/85 px-8 text-center text-white backdrop-blur">
            <Radio className="h-10 w-10 text-[#FF5A5F]" />
            <p className="font-display text-2xl font-semibold">{phase === 'ended' ? 'This live has ended' : "Can't play this live"}</p>
            {message && <p className="text-sm text-white/70">{message}</p>}
            <Button onClick={close}>Close</Button>
          </div>
        )}

        {phase === 'playing' && (
          <>
            <FloatingHearts hearts={hearts} />
            <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 p-4 safe-bottom">
              {session?.title && <p className="text-sm font-semibold text-white drop-shadow">{session.title}</p>}
              <LiveChat messages={chat} />
              <LiveComposer
                onSend={(text) => realtime.send({ type: 'LIVE_CHAT', sessionId: liveViewerId, text })}
                onHeart={() => {
                  realtime.send({ type: 'LIVE_HEART', sessionId: liveViewerId });
                  if (!realtime.ready) addToast('Reconnecting…', 'info');
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
