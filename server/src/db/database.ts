import {
  User,
  College,
  Post,
  Reel,
  Comment,
  Story,
  Report,
  VerificationDocument,
  SupportTicket,
  NotificationItem,
  PinnedCollegeFeed,
  JobPosting,
} from '../types/index.js';
import { SEEDED_COLLEGES } from './seedColleges.js';
import { logger } from '../config/logger.js';
import {
  sqlite,
  PersistentMap,
  credentials,
  follows,
  postLikes,
  reelLikes,
  commentLikes,
  bookmarks,
  blocks,
  reelViews,
  storyViews,
  jobApplications,
  passwordResets,
} from './sqlite.js';

/**
 * Durable data layer.
 *
 * Collections behave like plain Maps but every write is mirrored to SQLite, so
 * all data survives restarts. The only always-present data is the read-only
 * directory of real Indian institutions. Optional demo content (DEMO_MODE) is
 * flagged `isDemo` and removed automatically when demo mode is switched off.
 */
class CampusDatabase {
  public users = new PersistentMap<User>('users');
  public colleges = new PersistentMap<College>('colleges');
  public posts = new PersistentMap<Post>('posts');
  public comments = new PersistentMap<Comment[]>('comments'); // targetId -> comments
  public reels = new PersistentMap<Reel>('reels');
  public verificationDocuments = new PersistentMap<VerificationDocument>('verification_documents');
  public supportTickets = new PersistentMap<SupportTicket>('support_tickets');
  public notifications = new PersistentMap<NotificationItem[]>('notifications'); // legacy (unused)
  public pinnedFeeds = new PersistentMap<PinnedCollegeFeed>('pinned_feeds'); // collegeId -> feed
  public stories = new PersistentMap<Story>('stories');
  public jobs = new PersistentMap<JobPosting>('jobs');
  public reports = new PersistentMap<Report>('reports');

  // Relational stores
  public credentials = credentials;
  public follows = follows;
  public postLikes = postLikes;
  public reelLikes = reelLikes;
  public commentLikes = commentLikes;
  public bookmarks = bookmarks;
  public blocks = blocks;
  public reelViews = reelViews;
  public storyViews = storyViews;
  public jobApplications = jobApplications;

  constructor() {
    this.seedCollegeDirectory();
    logger.info('Data layer ready', {
      colleges: this.colleges.size,
      users: this.users.size,
      posts: this.posts.size,
      reels: this.reels.size,
    });
  }

  /** Upsert the real institution directory (factual reference data). */
  private seedCollegeDirectory(): void {
    sqlite.exec('DELETE FROM kv_colleges');
    this.colleges.clear();
    for (const seed of SEEDED_COLLEGES) {
      this.colleges.set(seed.id, { ...seed, logoUrl: '', bannerUrl: '', verifiedStudentCount: 0 });
    }
  }

  /** Remove a post and everything hanging off it. */
  public deletePost(postId: string): void {
    this.comments.get(postId)?.forEach((c) => commentLikes.removeAllForItem(c.id));
    this.comments.delete(postId);
    postLikes.removeAllForItem(postId);
    bookmarks.removeAllForItem('post', postId);
    this.posts.delete(postId);
    sqlite.prepare(`DELETE FROM user_notifications WHERE json_extract(data, '$.targetId') = ?`).run(postId);
  }

  /** Remove a reel and everything hanging off it (including reposts of it). */
  public deleteReel(reelId: string): void {
    this.comments.get(reelId)?.forEach((c) => commentLikes.removeAllForItem(c.id));
    this.comments.delete(reelId);
    reelLikes.removeAllForItem(reelId);
    reelViews.removeAllForItem(reelId);
    bookmarks.removeAllForItem('reel', reelId);
    this.reels.delete(reelId);
    for (const p of Array.from(this.posts.values())) {
      if (p.repostOf?.type === 'reel' && p.repostOf.id === reelId) this.deletePost(p.id);
    }
    sqlite.prepare(`DELETE FROM user_notifications WHERE json_extract(data, '$.targetId') = ?`).run(reelId);
  }

  public deleteStory(storyId: string): void {
    storyViews.removeAllForItem(storyId);
    this.stories.delete(storyId);
  }

  /** Permanently delete a user and every trace of their data. */
  public deleteUser(userId: string): void {
    const user = this.users.get(userId);
    if (!user) return;

    for (const post of Array.from(this.posts.values())) {
      if (post.authorId === userId) this.deletePost(post.id);
    }
    for (const reel of Array.from(this.reels.values())) {
      if (reel.authorId === userId) this.deleteReel(reel.id);
    }
    // Comments the user left anywhere.
    for (const [targetId, list] of Array.from(this.comments.entries())) {
      const mine = list.filter((c) => c.authorId === userId);
      if (mine.length) {
        mine.forEach((c) => commentLikes.removeAllForItem(c.id));
        const kept = list.filter((c) => c.authorId !== userId);
        this.comments.set(targetId, kept);
        const post = this.posts.get(targetId);
        if (post) this.posts.set(post.id, { ...post, commentsCount: kept.length });
        const reel = this.reels.get(targetId);
        if (reel) this.reels.set(reel.id, { ...reel, commentsCount: kept.length });
      }
    }
    for (const [id, s] of Array.from(this.stories.entries())) {
      if (s.userId === userId) this.deleteStory(id);
    }
    for (const [id, d] of Array.from(this.verificationDocuments.entries())) {
      if (d.userId === userId) this.verificationDocuments.delete(id);
    }
    for (const [id, t] of Array.from(this.supportTickets.entries())) {
      if (t.userId === userId) this.supportTickets.delete(id);
    }
    for (const [id, j] of Array.from(this.jobs.entries())) {
      if (j.recruiterId === userId) this.jobs.delete(id);
    }
    for (const [id, r] of Array.from(this.reports.entries())) {
      if (r.reporterId === userId) this.reports.delete(id);
    }

    // Direct messages.
    const convIds = (
      sqlite.prepare('SELECT id FROM conversations WHERE user_a = ? OR user_b = ?').all(userId, userId) as { id: string }[]
    ).map((r) => r.id);
    for (const id of convIds) {
      sqlite.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
      sqlite.prepare('DELETE FROM conversation_reads WHERE conversation_id = ?').run(id);
      sqlite.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    }

    // Relational + credentials.
    follows.removeAllFor(userId);
    postLikes.removeAllForUser(userId);
    reelLikes.removeAllForUser(userId);
    commentLikes.removeAllForUser(userId);
    bookmarks.removeAllForUser(userId);
    blocks.removeAllFor(userId);
    reelViews.removeAllForUser(userId);
    storyViews.removeAllForUser(userId);
    jobApplications.removeAllForUser(userId);
    sqlite.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId);
    sqlite
      .prepare(`DELETE FROM user_notifications WHERE user_id = ? OR json_extract(data, '$.actorId') = ?`)
      .run(userId, userId);
    if (user.email) credentials.remove(user.email);

    this.users.delete(userId);
    logger.info(`Deleted user and all associated data: ${userId}`);
  }

  /** Delete accounts inactive for more than `days` (demo accounts are exempt). */
  public pruneInactiveUsers(days = 30): number {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const user of Array.from(this.users.values())) {
      if (user.isDemo) continue;
      const last = new Date(user.lastActiveAt || user.updatedAt || user.createdAt).getTime();
      if (Number.isFinite(last) && last < cutoff) {
        this.deleteUser(user.id);
        removed++;
      }
    }
    passwordResets.purgeExpired();
    if (removed > 0) logger.info(`Pruned ${removed} inactive account(s) (>${days} days).`);
    return removed;
  }

  /** Remove expired stories. */
  public pruneExpiredStories(): void {
    const now = Date.now();
    for (const s of Array.from(this.stories.values())) {
      if (new Date(s.expiresAt).getTime() < now) this.deleteStory(s.id);
    }
  }

  /** Live count of verified members affiliated with a college. */
  public verifiedMemberCount(collegeId: string): number {
    let count = 0;
    for (const u of this.users.values()) {
      if (u.collegeId === collegeId && u.verificationStatus === 'Verified Member') count++;
    }
    return count;
  }

  // --- Trigram / fuzzy college search (typo-tolerant) ---
  public searchColleges(query: string, limit = 20): (College & { matchScore: number })[] {
    if (!query || query.trim().length === 0) {
      return Array.from(this.colleges.values())
        .sort((a, b) => (a.nirfRank || 9999) - (b.nirfRank || 9999))
        .slice(0, limit)
        .map((c) => ({ ...c, matchScore: 1.0 }));
    }

    const cleanQuery = query.toLowerCase().trim().slice(0, 100);
    const queryTrigrams = this.generateTrigrams(cleanQuery);

    const scored = Array.from(this.colleges.values()).map((college) => {
      const targetString = `${college.name} ${college.shortCode} ${college.city} ${college.state}`.toLowerCase();
      let score = 0;
      if (targetString.includes(cleanQuery)) {
        score = 0.8 + (cleanQuery.length / targetString.length) * 0.2;
      } else {
        score = this.calculateTrigramSimilarity(queryTrigrams, this.generateTrigrams(targetString));
      }
      if (college.shortCode.toLowerCase() === cleanQuery) score = Math.max(score, 0.99);
      return { ...college, matchScore: Math.round(score * 100) / 100 };
    });

    return scored
      .filter((item) => item.matchScore > 0.15)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  private generateTrigrams(text: string): Set<string> {
    const padded = `  ${text}  `;
    const trigrams = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) trigrams.add(padded.substring(i, i + 3));
    return trigrams;
  }

  private calculateTrigramSimilarity(setA: Set<string>, setB: Set<string>): number {
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    setA.forEach((tri) => {
      if (setB.has(tri)) intersection++;
    });
    return (2 * intersection) / (setA.size + setB.size);
  }
}

export const db = new CampusDatabase();
