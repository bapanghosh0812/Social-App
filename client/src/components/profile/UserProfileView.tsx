import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, Settings, MoreHorizontal, Camera, Grid3x3, Clapperboard, Bookmark, Lock, MapPin, GraduationCap, Briefcase,
  MessageCircle, Share2, Link2, Flag, Ban, Repeat2, Layers, Play, Pencil, ShieldCheck, Clock, Plus,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { useAuthStore } from '../../store/useAuthStore.js';
import { useVerificationStore } from '../../store/useVerificationStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { toggleFollowUser, useRequireVerified } from '../../lib/actions.js';
import type { Post, ProfileData, Reel } from '../../types/index.js';
import { compact, copyText, shareUrl, shortCollege } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { Button, EmptyState, IconButton, Spinner, Tabs } from '../ui/primitives.js';
import { ActionSheet, ConfirmDialog } from '../ui/Sheet.js';
import { VerifiedBadge, RichText, RoleBadge } from '../ui/misc.js';

type MediaTab = 'posts' | 'reels' | 'saved';

export const UserProfileView: React.FC = () => {
  const { profileUserId, goBack, setSettingsOpen, openFollowList, openShare, openReport, openChatWith, openPost, openReels, openCollege, openPublish, addToast } =
    useAppStore();
  const { user: me, updateLocalUser } = useAuthStore();
  const openVerification = useVerificationStore((s) => s.openModal);
  const requireVerified = useRequireVerified();
  const targetId = profileUserId || me?.id;
  const isMe = targetId === me?.id;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [saved, setSaved] = useState<{ posts: Post[]; reels: Reel[] } | null>(null);
  const [tab, setTab] = useState<MediaTab>('posts');
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!targetId) return;
    setError(null);
    try {
      const res = await api.getUserProfile(targetId);
      setProfile(res.profile);
      setPosts(res.posts);
      setReels(res.reels);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    setProfile(null);
    setSaved(null);
    setTab('posts');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  useEffect(() => {
    if (tab === 'saved' && isMe && !saved) api.getSaved().then((r) => setSaved({ posts: r.posts, reels: r.reels })).catch(() => setSaved({ posts: [], reels: [] }));
  }, [tab]);

  // Keep my own profile in sync with edits made in Settings.
  const myProfileKey = me ? [me.fullName, me.bio, me.avatarUrl, me.isPrivate, me.headline, me.department, me.designation, (me.skills || []).join('|')].join('¦') : '';
  useEffect(() => {
    if (isMe && profile) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfileKey]);

  if (error) {
    return (
      <div className="px-4 pt-4">
        <button onClick={goBack} className="mb-4 flex items-center gap-1 text-sm text-ink2">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <EmptyState icon={<Lock className="h-6 w-6" />} title="Profile unavailable" subtitle={error} />
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    );
  }

  const changeAvatar = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await api.uploadMedia(file, 'avatars');
      await api.updateProfileSettings({ avatarUrl: up.url });
      updateLocalUser({ avatarUrl: up.url });
      setProfile((p) => (p ? { ...p, avatarUrl: up.url } : p));
      addToast('Profile photo updated', 'success');
    } catch (err: any) {
      addToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const follow = async () => {
    const prev = profile.followStatus;
    const next = await toggleFollowUser(profile.id, prev, profile.fullName);
    const delta = (next === 'following' ? 1 : 0) - (prev === 'following' ? 1 : 0);
    setProfile((p) => (p ? { ...p, followStatus: next, followersCount: Math.max(0, p.followersCount + delta) } : p));
    if (next === 'following' && profile.isLockedForViewer) load();
  };

  const block = async () => {
    try {
      const res = await api.block(profile.id);
      addToast(res.message, 'success');
      goBack();
    } catch (err: any) {
      addToast(err.message, 'error');
    }
  };

  const shareProfile = () =>
    openShare({ type: 'profile', id: profile.id, title: profile.collegeName || profile.companyName || 'College Campus', authorName: profile.fullName, thumbUrl: profile.avatarUrl });

  const verified = profile.verificationStatus === 'Verified Member';

  return (
    <div className="pb-28">
      {/* Top bar */}
      <div className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line px-2 safe-top">
        {!isMe || profileUserId ? (
          <IconButton label="Back" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate font-display text-lg font-semibold text-ink">
            {profile.isPrivate && <Lock className="h-4 w-4 shrink-0 text-ink3" />}
            <span className="truncate">{profile.fullName}</span>
            <VerifiedBadge status={profile.verificationStatus} />
          </p>
        </div>
        {isMe ? (
          <>
            <IconButton label="Create" onClick={() => requireVerified(() => openPublish('post'))}>
              <Plus className="h-5 w-5" />
            </IconButton>
            <IconButton label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-5 w-5" />
            </IconButton>
          </>
        ) : (
          <IconButton label="More" onClick={() => setMenu(true)}>
            <MoreHorizontal className="h-5 w-5" />
          </IconButton>
        )}
      </div>

      {/* Cover */}
      <div className="relative h-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#2B4796] via-[#1B3272] to-[#0F1B3D]" />
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-gold/30 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px]" />
      </div>

      <div className="relative -mt-14 space-y-4 px-4">
        <div className="flex items-end justify-between">
          <div className="relative">
            <Avatar src={profile.avatarUrl} name={profile.fullName} size={104} ring={verified ? 'gold' : null} online={!isMe && profile.isOnline} />
            {isMe && (
              <>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => changeAvatar(e.target.files?.[0])} />
                <button
                  onClick={() => fileRef.current?.click()}
                  aria-label="Change profile photo"
                  className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-brand-grad text-onbrand ring-4 ring-bg"
                >
                  {uploading ? <Spinner size={16} className="!text-onbrand" /> : <Camera className="h-4 w-4" />}
                </button>
              </>
            )}
          </div>
          <div className="flex gap-6 pb-2 pr-1">
            <Stat value={profile.postsCount + profile.reelsCount} label="Posts" />
            <Stat value={profile.followersCount} label="Followers" onClick={() => !profile.isLockedForViewer && openFollowList({ userId: profile.id, list: 'followers', name: profile.fullName })} />
            <Stat value={profile.followingCount} label="Following" onClick={() => !profile.isLockedForViewer && openFollowList({ userId: profile.id, list: 'following', name: profile.fullName })} />
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="flex flex-wrap items-center gap-1.5 font-display text-2xl font-semibold text-ink">
            {profile.fullName}
            <VerifiedBadge status={profile.verificationStatus} size={20} />
            <RoleBadge role={profile.role} className="font-sans" />
            {profile.followsMe && !isMe && <span className="rounded-md bg-ink/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink2">Follows you</span>}
          </h1>
          {profile.headline && <p className="text-[15px] leading-snug text-ink">{profile.headline}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[13px] text-ink2">
            {profile.collegeName && (
              <button onClick={() => profile.collegeId && openCollege(profile.collegeId)} className="flex items-center gap-1 text-left font-medium text-brand hover:underline">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {shortCollege(profile.collegeName)}
              </button>
            )}
            {profile.role === 'faculty' && profile.department && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" /> {profile.department}
              </span>
            )}
            {profile.role !== 'faculty' && profile.academicYear && (
              <span className="flex items-center gap-1">
                <GraduationCap className="h-3.5 w-3.5" /> Batch {profile.academicYear}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        {isMe ? (
          <div className="space-y-2">
            {profile.verificationStatus !== 'Verified Member' && (
              <button onClick={openVerification} className="flex w-full items-center gap-3 rounded-2xl border border-brand/30 bg-brand/[0.08] p-3 text-left">
                {profile.verificationStatus === 'Pending' ? <Clock className="h-5 w-5 text-brand" /> : <ShieldCheck className="h-5 w-5 text-brand" />}
                <span className="flex-1 text-sm font-semibold text-ink">
                  {profile.verificationStatus === 'Pending' ? 'Verification in review' : profile.role === 'faculty' ? 'Verify your faculty status' : 'Verify your student status'}
                </span>
                <span className="text-xs font-semibold text-brand">{profile.verificationStatus === 'Pending' ? 'Details' : 'Start'}</span>
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setSettingsOpen(true, 'editProfile')} icon={<Pencil className="h-4 w-4" />}>
                Edit profile
              </Button>
              <Button variant="secondary" onClick={shareProfile} icon={<Share2 className="h-4 w-4" />}>
                Share profile
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant={profile.followStatus === 'following' || profile.followStatus === 'pending' ? 'secondary' : 'primary'} onClick={follow}>
              {profile.followStatus === 'following' ? 'Following' : profile.followStatus === 'pending' ? 'Requested' : profile.followsMe ? 'Follow back' : 'Follow'}
            </Button>
            <Button variant="secondary" onClick={() => openChatWith(profile.id)} icon={<MessageCircle className="h-4 w-4" />}>
              Message
            </Button>
          </div>
        )}

        {/* About */}
        {(profile.bio || isMe) && !profile.isLockedForViewer && (
          <section className="card p-4">
            <div className="mb-1.5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">About</h2>
              {isMe && (
                <button onClick={() => setSettingsOpen(true, 'editProfile')} aria-label="Edit about" className="text-ink3 hover:text-brand">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            {profile.bio ? (
              <RichText text={profile.bio} clamp={280} className="text-[14px] leading-relaxed text-ink2" />
            ) : (
              <p className="text-sm text-ink3">Tell people about your studies, teaching, research or interests.</p>
            )}
          </section>
        )}

        {/* Skills */}
        {(profile.skills.length > 0 || isMe) && !profile.isLockedForViewer && (
          <section className="card p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">{profile.role === 'faculty' ? 'Expertise' : 'Skills'}</h2>
              {isMe && (
                <button onClick={() => setSettingsOpen(true, 'editProfile')} aria-label="Edit skills" className="text-ink3 hover:text-brand">
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
            {profile.skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {profile.skills.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      useAppStore.getState().setExploreQuery(s);
                      useAppStore.getState().setActiveTab('explore');
                    }}
                    className="chip"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink3">Add skills so classmates, teachers and placement officers can find you.</p>
            )}
          </section>
        )}
      </div>

      {/* Content */}
      {profile.isLockedForViewer ? (
        <div className="mx-4 mt-6">
          <EmptyState icon={<Lock className="h-6 w-6" />} title="This account is private" subtitle="Follow this account to see their posts and reels." />
        </div>
      ) : (
        <>
          <div className="mt-5">
            <Tabs
              id="profile-tabs"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'posts', label: 'Posts', icon: <Grid3x3 className="h-4 w-4" /> },
                { value: 'reels', label: 'Reels', icon: <Clapperboard className="h-4 w-4" /> },
                ...(isMe ? [{ value: 'saved' as const, label: 'Saved', icon: <Bookmark className="h-4 w-4" /> }] : []),
              ]}
            />
          </div>
          <div className="pt-0.5">
            {tab === 'posts' &&
              (posts.length ? (
                <PostGrid posts={posts} onOpen={openPost} />
              ) : (
                <EmptyState
                  compact
                  icon={<Grid3x3 className="h-6 w-6" />}
                  title={isMe ? 'Share your first post' : 'No posts yet'}
                  action={isMe ? <button onClick={() => requireVerified(() => openPublish('post'))} className="chip chip-active">Create a post</button> : undefined}
                />
              ))}
            {tab === 'reels' &&
              (reels.length ? (
                <ReelGrid reels={reels} onOpen={(id) => openReels({ reels, startId: id })} />
              ) : (
                <EmptyState
                  compact
                  icon={<Clapperboard className="h-6 w-6" />}
                  title={isMe ? 'Post your first reel' : 'No reels yet'}
                  action={isMe ? <button onClick={() => requireVerified(() => openPublish('reel'))} className="chip chip-active">Create a reel</button> : undefined}
                />
              ))}
            {tab === 'saved' &&
              (!saved ? (
                <div className="flex justify-center py-12">
                  <Spinner />
                </div>
              ) : saved.posts.length + saved.reels.length === 0 ? (
                <EmptyState compact icon={<Bookmark className="h-6 w-6" />} title="Nothing saved yet" subtitle="Tap the bookmark on posts and reels to save them here. Only you can see this." />
              ) : (
                <div className="space-y-4">
                  {saved.reels.length > 0 && <ReelGrid reels={saved.reels} onOpen={(id) => openReels({ reels: saved.reels, startId: id })} />}
                  {saved.posts.length > 0 && <PostGrid posts={saved.posts} onOpen={openPost} />}
                </div>
              ))}
          </div>
        </>
      )}

      <ActionSheet
        open={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: 'Share profile', icon: <Share2 className="h-5 w-5" />, onClick: shareProfile },
          { label: 'Copy profile link', icon: <Link2 className="h-5 w-5" />, onClick: async () => addToast((await copyText(shareUrl('user', profile.id))) ? 'Link copied' : 'Could not copy', 'success') },
          { label: 'Report', icon: <Flag className="h-5 w-5" />, danger: true, onClick: () => openReport({ targetType: 'user', targetId: profile.id, ownerId: profile.id, ownerName: profile.fullName }) },
          { label: 'Block', icon: <Ban className="h-5 w-5" />, danger: true, onClick: () => setConfirmBlock(true) },
        ]}
      />
      <ConfirmDialog
        open={confirmBlock}
        onClose={() => setConfirmBlock(false)}
        onConfirm={block}
        title={`Block ${profile.fullName}?`}
        message="They won't be able to find your profile, see your posts or message you. They won't be notified."
        confirmLabel="Block"
        danger
      />
    </div>
  );
};

const Stat: React.FC<{ value: number; label: string; onClick?: () => void }> = ({ value, label, onClick }) => (
  <button onClick={onClick} disabled={!onClick} className="text-center">
    <p className="font-display text-xl font-semibold text-ink">{compact(value)}</p>
    <p className="text-[11px] text-ink3">{label}</p>
  </button>
);

const PostGrid: React.FC<{ posts: Post[]; onOpen: (id: string) => void }> = ({ posts, onOpen }) => (
  <div className="grid grid-cols-3 gap-0.5">
    {posts.map((p) => {
      const source = (p.repost && 'mediaItems' in p.repost ? (p.repost as Post) : null) || p;
      const media = source.mediaItems?.[0];
      const reelRepost = p.repost && 'videoUrl' in p.repost ? (p.repost as Reel) : null;
      return (
        <button key={p.id} onClick={() => onOpen(p.id)} className="relative aspect-square overflow-hidden bg-sunken">
          {reelRepost ? (
            reelRepost.thumbnailUrl ? <img src={mediaUrl(reelRepost.thumbnailUrl)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="h-full w-full bg-black" />
          ) : media ? (
            media.type === 'video' ? (
              <video src={`${mediaUrl(media.url)}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={mediaUrl(media.url)} alt="" className="h-full w-full object-cover" loading="lazy" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/15 to-elev p-3">
              <p className="line-clamp-4 font-display text-[13px] leading-snug text-ink">{source.content || p.content}</p>
            </div>
          )}
          <span className="absolute right-1.5 top-1.5 flex gap-1 text-white drop-shadow">
            {p.repostOf && <Repeat2 className="h-4 w-4" />}
            {!p.repostOf && (p.mediaItems?.length || 0) > 1 && <Layers className="h-4 w-4" />}
            {!p.repostOf && media?.type === 'video' && <Play className="h-4 w-4" fill="currentColor" />}
          </span>
        </button>
      );
    })}
  </div>
);

const ReelGrid: React.FC<{ reels: Reel[]; onOpen: (id: string) => void }> = ({ reels, onOpen }) => (
  <div className="grid grid-cols-3 gap-0.5">
    {reels.map((r) => (
      <button key={r.id} onClick={() => onOpen(r.id)} className="relative aspect-[9/16] overflow-hidden bg-black">
        {r.thumbnailUrl ? (
          <img src={mediaUrl(r.thumbnailUrl)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : r.provider === 'upload' || r.provider === 'direct' ? (
          <video src={`${mediaUrl(r.videoUrl)}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/60">
            <Clapperboard className="h-6 w-6" />
          </div>
        )}
        <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[11px] font-semibold text-white drop-shadow">
          <Play className="h-3 w-3" fill="currentColor" /> {compact(r.viewsCount)}
        </span>
      </button>
    ))}
  </div>
);
