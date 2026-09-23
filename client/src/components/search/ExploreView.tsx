import React, { useEffect, useState } from 'react';
import { Search, X, Hash, Building2, Users, Award, MapPin, TrendingUp, Play, Layers, Film } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore.js';
import { api, mediaUrl } from '../../services/api.js';
import { toggleFollowUser } from '../../lib/actions.js';
import type { College, MiniUser, Post, Reel } from '../../types/index.js';
import { compact } from '../../lib/format.js';
import { Avatar } from '../ui/Avatar.js';
import { EmptyState, SectionTitle, Segmented, Skeleton } from '../ui/primitives.js';
import { VerifiedBadge } from '../ui/misc.js';
import { FollowPill } from '../profile/UserListSheet.js';
import { PostCard } from '../feed/PostCard.js';

type Tab = 'top' | 'people' | 'colleges' | 'posts';

const PeopleList: React.FC<{ list: MiniUser[]; onFollow: (u: MiniUser) => void }> = ({ list, onFollow }) => {
  const openProfile = useAppStore((s) => s.openProfile);
  return (
    <div className="space-y-1">
      {list.map((u) => (
        <div key={u.id} className="flex items-center gap-3 rounded-2xl p-2 transition-colors hover:bg-ink/5">
          <Avatar src={u.avatarUrl} name={u.fullName} size={48} onClick={() => openProfile(u.id)} />
          <button onClick={() => openProfile(u.id)} className="min-w-0 flex-1 text-left">
            <span className="flex items-center gap-1">
              <span className="truncate text-sm font-semibold text-ink">{u.fullName}</span>
              <VerifiedBadge status={u.verificationStatus} size={13} />
            </span>
            <span className="block truncate text-xs text-ink3">{u.headline || u.collegeName || u.companyName}</span>
          </button>
          {u.followStatus !== 'self' && <FollowPill status={u.followStatus} onClick={() => onFollow(u)} />}
        </div>
      ))}
    </div>
  );
};

const CollegeList: React.FC<{ list: College[] }> = ({ list }) => {
  const openCollege = useAppStore((s) => s.openCollege);
  return (
    <div className="space-y-2">
      {list.map((c) => (
        <button key={c.id} onClick={() => openCollege(c.id)} className="card flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-brand/40">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand/10 font-display text-sm font-bold text-brand">
            {c.shortCode.slice(0, 4)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink3">
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" /> {c.city}, {c.state}
              </span>
              {c.nirfRank ? (
                <span className="flex items-center gap-0.5 text-brand">
                  <Award className="h-3 w-3" /> NIRF #{c.nirfRank}
                </span>
              ) : null}
              <span className="flex items-center gap-0.5">
                <Users className="h-3 w-3" /> {compact(c.verifiedStudentCount)} verified
              </span>
            </p>
          </div>
        </button>
      ))}
    </div>
  );
};
const TYPES = ['All', 'IIT', 'NIT', 'IIM', 'University', 'College', 'Medical'];

export const ExploreView: React.FC = () => {
  const { exploreQuery, setExploreQuery, openProfile, openPost, openReels } = useAppStore();
  const [tab, setTab] = useState<Tab>('top');
  const [input, setInput] = useState(exploreQuery);
  const [people, setPeople] = useState<MiniUser[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [collegeType, setCollegeType] = useState('All');

  // Discovery data (no query)
  const [tags, setTags] = useState<{ tag: string; count: number }[]>([]);
  const [suggested, setSuggested] = useState<MiniUser[]>([]);
  const [gridReels, setGridReels] = useState<Reel[]>([]);
  const [gridPosts, setGridPosts] = useState<Post[]>([]);

  useEffect(() => setInput(exploreQuery), [exploreQuery]);

  useEffect(() => {
    api.getTrendingTags().then((r) => setTags(r.tags)).catch(() => {});
    api.getSuggestions().then((r) => setSuggested(r.suggestions)).catch(() => {});
    api.getReels().then((r) => setGridReels(r.reels.slice(0, 9))).catch(() => {});
    api.getFeed({ mode: 'forYou', limit: 24 }).then((r) => setGridPosts(r.posts.filter((p) => p.mediaItems.length > 0))).catch(() => {});
  }, []);

  const q = exploreQuery.trim();
  const isTag = q.startsWith('#');

  useEffect(() => {
    const t = setTimeout(() => setExploreQuery(input), 250);
    return () => clearTimeout(t);
  }, [input]);

  // Every new search starts on "Top" (hashtags go straight to posts).
  useEffect(() => {
    if (q) setTab(isTag ? 'posts' : 'top');
  }, [q]);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    const term = q.replace(/^#/, '');
    Promise.all([
      isTag ? Promise.resolve({ users: [] as MiniUser[] }) : api.searchUsers(term).catch(() => ({ users: [] as MiniUser[] })),
      isTag ? Promise.resolve({ results: [] as College[] }) : api.searchColleges(term, undefined, collegeType).catch(() => ({ results: [] as College[] })),
      api.searchPosts(q).catch(() => ({ posts: [] as Post[] })),
    ]).then(([u, c, p]) => {
      setPeople(u.users);
      setColleges(c.results);
      setPosts(p.posts);
      setLoading(false);
    });
  }, [q, collegeType]);

  // College directory browsing when there is no query.
  useEffect(() => {
    if (q && tab !== 'colleges') return;
    if (!q) api.searchColleges('', undefined, collegeType).then((r) => setColleges(r.results)).catch(() => {});
  }, [collegeType, q, tab]);

  const follow = async (u: MiniUser, list: 'people' | 'suggested') => {
    const next = await toggleFollowUser(u.id, u.followStatus, u.fullName);
    const upd = (arr: MiniUser[]) => arr.map((x) => (x.id === u.id ? { ...x, followStatus: next } : x));
    list === 'people' ? setPeople(upd) : setSuggested(upd);
  };

  return (
    <div className="space-y-4 px-4 pb-28 pt-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink3" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search people, colleges, #tags"
          className="input h-12 rounded-full pl-11 pr-11 text-[15px]"
        />
        {input && (
          <button onClick={() => setInput('')} aria-label="Clear" className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-ink/10 text-ink2">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!q ? (
        <>
          {tags.length > 0 && (
            <section className="space-y-2.5">
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-brand" /> Trending on campus
                </span>
              </SectionTitle>
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <button key={t.tag} onClick={() => setInput(`#${t.tag}`)} className="chip">
                    <Hash className="h-3.5 w-3.5 text-brand" />
                    {t.tag}
                    <span className="text-ink3">{t.count}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {suggested.length > 0 && (
            <section className="space-y-2">
              <SectionTitle>People you may know</SectionTitle>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
                {suggested.map((u) => (
                  <div key={u.id} className="card flex w-40 shrink-0 flex-col items-center gap-2 p-4 text-center">
                    <Avatar src={u.avatarUrl} name={u.fullName} size={64} onClick={() => openProfile(u.id)} />
                    <button onClick={() => openProfile(u.id)} className="w-full">
                      <p className="flex items-center justify-center gap-1 truncate text-sm font-semibold text-ink">
                        <span className="truncate">{u.fullName}</span>
                        <VerifiedBadge status={u.verificationStatus} size={13} />
                      </p>
                      <p className="truncate text-[11px] text-ink3">{u.collegeName}</p>
                    </button>
                    <FollowPill status={u.followStatus} onClick={() => follow(u, 'suggested')} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {(gridReels.length > 0 || gridPosts.length > 0) && (
            <section className="space-y-2">
              <SectionTitle>Explore</SectionTitle>
              <div className="-mx-4 grid grid-cols-3 gap-0.5">
                {gridReels.slice(0, 3).map((r, i) => (
                  <button
                    key={r.id}
                    onClick={() => openReels({ startId: r.id })}
                    className={`relative overflow-hidden bg-sunken ${i === 0 ? 'row-span-2' : 'aspect-square'}`}
                  >
                    {r.thumbnailUrl ? (
                      <img src={mediaUrl(r.thumbnailUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <video src={`${mediaUrl(r.videoUrl)}#t=0.5`} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    <Film className="absolute right-2 top-2 h-4 w-4 text-white drop-shadow" />
                    <span className="absolute bottom-1.5 left-2 flex items-center gap-1 text-[11px] font-semibold text-white drop-shadow">
                      <Play className="h-3 w-3" fill="currentColor" /> {compact(r.viewsCount)}
                    </span>
                  </button>
                ))}
                {gridPosts.slice(0, 9).map((p) => (
                  <button key={p.id} onClick={() => openPost(p.id)} className="relative aspect-square overflow-hidden bg-sunken">
                    {p.mediaItems[0].type === 'video' ? (
                      <video src={`${mediaUrl(p.mediaItems[0].url)}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      <img src={mediaUrl(p.mediaItems[0].url)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                    {p.mediaItems.length > 1 && <Layers className="absolute right-2 top-2 h-4 w-4 text-white drop-shadow" />}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2.5">
            <SectionTitle>Colleges</SectionTitle>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {TYPES.map((t) => (
                <button key={t} onClick={() => setCollegeType(t)} className={`chip shrink-0 ${collegeType === t ? 'chip-active' : ''}`}>
                  {t}
                </button>
              ))}
            </div>
            <CollegeList list={colleges.slice(0, 20)} />
          </section>
        </>
      ) : (
        <>
          {!isTag && (
            <Segmented
              id="explore-tab"
              size="sm"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'top', label: 'Top' },
                { value: 'people', label: 'People' },
                { value: 'colleges', label: 'Colleges' },
                { value: 'posts', label: 'Posts' },
              ]}
            />
          )}
          {isTag && (
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-grad text-onbrand">
                <Hash className="h-7 w-7" />
              </div>
              <div>
                <p className="font-display text-2xl font-semibold text-ink">{q.slice(1)}</p>
                <p className="text-xs text-ink3">
                  {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-40 rounded" />
                    <Skeleton className="h-3 w-24 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {(tab === 'top' || tab === 'people') && !isTag && people.length > 0 && (
                <section className="space-y-1">
                  {tab === 'top' && <SectionTitle>People</SectionTitle>}
                  <PeopleList list={tab === 'top' ? people.slice(0, 4) : people} onFollow={(u) => follow(u, 'people')} />
                </section>
              )}
              {(tab === 'top' || tab === 'colleges') && !isTag && colleges.length > 0 && (
                <section className="space-y-2">
                  {tab === 'top' && <SectionTitle>Colleges</SectionTitle>}
                  <CollegeList list={tab === 'top' ? colleges.slice(0, 4) : colleges} />
                </section>
              )}
              {(tab === 'top' || tab === 'posts' || isTag) && posts.length > 0 && (
                <section className="space-y-3">
                  {tab === 'top' && !isTag && <SectionTitle>Posts</SectionTitle>}
                  {posts.slice(0, tab === 'top' && !isTag ? 3 : 30).map((p) => (
                    <PostCard key={p.id} post={p} onRemove={() => setPosts((l) => l.filter((x) => x.id !== p.id))} />
                  ))}
                </section>
              )}
              {(tab === 'top' ? !people.length && !colleges.length && !posts.length : tab === 'people' ? !people.length : tab === 'colleges' ? !colleges.length : !posts.length) && (
                <EmptyState icon={<Search className="h-6 w-6" />} title="No results" subtitle={`Nothing matched “${q}” here. Try another tab or spelling — college search is typo-tolerant.`} />
              )}
              {tab === 'colleges' && (
                <div className="no-scrollbar flex gap-2 overflow-x-auto">
                  {TYPES.map((t) => (
                    <button key={t} onClick={() => setCollegeType(t)} className={`chip shrink-0 ${collegeType === t ? 'chip-active' : ''}`}>
                      <Building2 className="h-3.5 w-3.5" /> {t}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};
