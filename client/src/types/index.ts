export type UserVerificationStatus = 'Guest' | 'Pending' | 'Verified Member' | 'Rejected' | 'Approved';
export type AuthProvider = 'google' | 'phone' | 'password';
export type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';
export type UserRole = 'student' | 'faculty' | 'recruiter' | 'admin';
export type VerificationDocType = 'fees_receipt' | 'marksheet' | 'admission_letter' | 'id_card' | 'faculty_id' | 'appointment_letter';
export type FollowNotificationPreference = 'all' | 'highlights' | 'muted';
export type FollowStatus = 'none' | 'pending' | 'following' | 'self';
export type ActiveTab = 'home' | 'explore' | 'reels' | 'profile' | 'messages' | 'notifications';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  role?: UserRole;
  gender?: Gender;
  avatarUrl: string;
  collegeId?: string;
  collegeName?: string;
  isCollegeLocked: boolean;
  verificationStatus: UserVerificationStatus;
  verificationDocumentType?: VerificationDocType;
  academicYear?: string;
  headline?: string;
  department?: string;
  skills?: string[];
  companyName?: string;
  corporateEmail?: string;
  corporateTaxId?: string;
  designation?: string;
  isCorporateVerified?: boolean;
  mcaStatus?: 'verified' | 'pending' | 'rejected';
  authProvider: AuthProvider;
  isProfileComplete: boolean;
  isPrivate: boolean;
  isAdmin?: boolean;
  isDemo?: boolean;
  bio?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  collegeNotificationsEnabled: Record<string, boolean>;
  globalNotificationsEnabled: boolean;
  mutedCollegeIds?: string[];
}

export interface MiniUser {
  id: string;
  fullName: string;
  avatarUrl: string;
  collegeId?: string;
  collegeName?: string;
  verificationStatus: UserVerificationStatus;
  role?: UserRole;
  isPrivate: boolean;
  academicYear?: string;
  companyName?: string;
  headline?: string;
  department?: string;
  designation?: string;
  followStatus?: FollowStatus;
  followersCount?: number;
}

export interface College {
  id: string;
  name: string;
  shortCode: string;
  type: 'University' | 'IIT' | 'NIT' | 'IIM' | 'Medical' | 'College' | 'School';
  city: string;
  state: string;
  verifiedStudentCount: number;
  logoUrl: string;
  bannerUrl: string;
  nirfRank?: number;
  establishedYear: number;
  website: string;
  activePostsCount?: number;
  matchScore?: number;
  verifiedMembersList?: { id: string; name: string; avatar: string }[];
}

export interface NoticeItem {
  id: string;
  title: string;
  category: 'Exam' | 'Fest' | 'Holiday' | 'Placement' | 'Urgent';
  publishedAt: string;
  attachmentUrl?: string;
  isPinned: boolean;
}

export interface PlanningItem {
  id: string;
  title: string;
  time: string;
  location: string;
  organizer: string;
  badge: string;
}

export interface ClubHighlight {
  id: string;
  clubName: string;
  eventTitle: string;
  imageUrl: string;
  timeAgo: string;
}

export interface PinnedCollegeFeed {
  collegeId: string;
  collegeName: string;
  shortCode: string;
  announcementsCount: number;
  noticeBoard: NoticeItem[];
  todaysPlanning: PlanningItem[];
  clubHighlights: ClubHighlight[];
}

export interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole?: UserRole;
  authorHeadline?: string;
  authorVerificationStatus: UserVerificationStatus;
  collegeId?: string;
  collegeName?: string;
  content: string;
  mediaUrls: string[];
  mediaItems: MediaItem[];
  mediaType: 'image' | 'video' | 'mixed' | 'text';
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  repostsCount?: number;
  repostOf?: { type: 'post' | 'reel'; id: string };
  repost?: Post | Reel | null;
  isLikedByMe?: boolean;
  isSavedByMe?: boolean;
  isOwner?: boolean;
  createdAt: string;
  editedAt?: string;
}

export type ReelProvider = 'upload' | 'direct' | 'youtube' | 'vimeo' | 'instagram' | 'tiktok';

export interface Reel {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorCollege: string;
  authorVerificationStatus?: UserVerificationStatus;
  authorFollowStatus?: 'accepted' | 'pending' | null;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount: number;
  repostsCount?: number;
  provider: ReelProvider;
  sourceUrl?: string;
  audioTrack: string;
  isLikedByMe?: boolean;
  isSavedByMe?: boolean;
  isOwner?: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  targetType?: 'post' | 'reel';
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorCollege?: string;
  authorHeadline?: string;
  authorRole?: UserRole;
  authorVerificationStatus: UserVerificationStatus;
  content: string;
  createdAt: string;
  likesCount: number;
  isLikedByMe?: boolean;
  canDelete?: boolean;
}

export interface CampusStory {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  collegeName: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  ref?: { type: 'post' | 'reel'; id: string };
  createdAt: string;
  expiresAt: string;
  seenByMe?: boolean;
  viewsCount?: number;
  isOwner?: boolean;
}

export interface JobPosting {
  id: string;
  recruiterId: string;
  recruiterName: string;
  recruiterAvatar: string;
  companyName: string;
  companyLogo: string;
  corporateTaxId: string;
  isCorporateVerified: boolean;
  jobTitle: string;
  jobType: 'Full-Time' | 'Internship' | 'Non-Profit';
  location: string;
  salaryBracket: string;
  detailedRequirements: string;
  officialCompanyEmail: string;
  eligibleBatches: string;
  tags: string[];
  applicationCount: number;
  deadline: string;
  createdAt: string;
  hasApplied?: boolean;
  isMine?: boolean;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: string;
  subject: string;
  description: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'Investigating' | 'Resolved';
  adminNote?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface VerificationDocument {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail?: string;
  collegeName: string;
  documentType: VerificationDocType;
  documentViewUrl?: string | null;
  isPdf?: boolean;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Verified Member';
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
}

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'post' | 'reel' | 'comment' | 'user' | 'story';
  targetId: string;
  parentId?: string;
  reason: string;
  details: string;
  snapshot: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: string;
  owner?: MiniUser | null;
}

export type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'follow_accept'
  | 'like'
  | 'comment'
  | 'comment_like'
  | 'repost'
  | 'live'
  | 'verification'
  | 'job'
  | 'system';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  actorId?: string;
  actor?: MiniUser | null;
  actorFollowStatus?: 'none' | 'pending' | 'following';
  targetType?: 'post' | 'reel' | 'user' | 'live' | 'story' | 'job';
  targetId?: string;
  thumbUrl?: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface MessageAttachment {
  type: 'post' | 'reel' | 'story' | 'profile';
  id: string;
  title?: string;
  thumbUrl?: string;
  authorName?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachment?: MessageAttachment | null;
  createdAt: string;
  deleted?: boolean;
  pending?: boolean;
}

export interface Conversation {
  id: string;
  otherUserId: string;
  otherUser: MiniUser;
  lastMessage?: ChatMessage | null;
  unreadCount?: number;
  updatedAt?: string;
  otherLastReadAt?: string | null;
  isOnline?: boolean;
  isBlocked?: boolean;
}

export interface LiveSession {
  id: string;
  title: string;
  startedAt: string;
  likes: number;
  viewerCount: number;
  host: MiniUser;
}

export interface LiveChatMessage {
  id: string;
  user: MiniUser;
  text: string;
  createdAt: string;
}

export interface ProfileData extends MiniUser {
  email?: string;
  phoneNumber?: string;
  gender?: Gender;
  designation?: string;
  customHeadline?: string;
  skills: string[];
  isCollegeLocked: boolean;
  bio?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  reelsCount: number;
  createdAt: string;
  isOwner: boolean;
  followStatus: FollowStatus;
  isFollowedByMe: boolean;
  followsMe: boolean;
  isOnline: boolean;
  isLockedForViewer: boolean;
}

export interface ShareTarget {
  type: 'post' | 'reel' | 'story' | 'profile';
  id: string;
  title: string;
  authorName: string;
  thumbUrl?: string;
  canRepost?: boolean;
  isReposted?: boolean;
}

export interface ReportTarget {
  targetType: 'post' | 'reel' | 'comment' | 'user' | 'story';
  targetId: string;
  parentId?: string;
  ownerId?: string;
  ownerName?: string;
}
