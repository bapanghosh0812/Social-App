export type UserVerificationStatus = 'Guest' | 'Pending' | 'Verified Member' | 'Rejected' | 'Approved';
export type AuthProvider = 'google' | 'phone' | 'password';
export type Gender = 'Male' | 'Female' | 'Other' | 'Prefer not to say';
export type UserRole = 'student' | 'faculty' | 'recruiter' | 'admin';
export type FollowNotificationPreference = 'all' | 'highlights' | 'muted';
export type VerificationDocType =
  | 'fees_receipt'
  | 'marksheet'
  | 'admission_letter'
  | 'id_card'
  | 'faculty_id'
  | 'appointment_letter';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  role?: UserRole;
  gender?: Gender;
  avatarUrl: string;

  // Student specific
  collegeId?: string;
  collegeName?: string;
  isCollegeLocked: boolean; // Permanent immutable constraint
  verificationStatus: UserVerificationStatus;
  verificationScore?: number;
  verificationDocumentUrl?: string;
  verificationDocumentType?: VerificationDocType;
  academicYear?: string;

  // Professional profile (LinkedIn-style)
  headline?: string; // e.g. "B.Tech CSE '27" or "Assistant Professor of Physics"
  department?: string; // e.g. "Computer Science & Engineering"
  skills?: string[];

  // Recruiter / faculty designation
  companyName?: string;
  corporateEmail?: string;
  corporateTaxId?: string; // GSTIN / CIN
  designation?: string;
  isCorporateVerified?: boolean;
  mcaStatus?: 'verified' | 'pending' | 'rejected';
  authorizationLetterUrl?: string;

  authProvider: AuthProvider;
  isProfileComplete: boolean;
  isPrivate: boolean; // Privacy setting
  isAdmin?: boolean; // computed from ADMIN_EMAILS on every request, never trusted from storage
  bio?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  fcmToken?: string;
  collegeNotificationsEnabled: Record<string, boolean>; // Granular notification mapping
  globalNotificationsEnabled: boolean;
  mutedCollegeIds?: string[];
  tokenVersion?: number;
  isDemo?: boolean;
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
  isDemo?: boolean;
}

export interface RepostRef {
  type: 'post' | 'reel';
  id: string;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorRole?: UserRole;
  authorVerificationStatus: UserVerificationStatus;
  collegeId?: string;
  collegeName?: string;
  companyName?: string;
  content: string;
  mediaUrls: string[];
  mediaType: 'image' | 'video' | 'mixed' | 'text';
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  repostsCount?: number;
  repostOf?: RepostRef;
  isLikedByMe?: boolean;
  isSavedByMe?: boolean;
  pinnedToCollege?: boolean;
  createdAt: string;
  editedAt?: string;
  comments?: Comment[];
  isDemo?: boolean;
}

export interface JobPosting {
  id: string;
  recruiterId: string;
  recruiterName: string;
  recruiterAvatar: string;
  companyName: string;
  companyLogo: string;
  corporateTaxId: string; // GSTIN / CIN
  isCorporateVerified: boolean;
  jobTitle: string;
  jobType: 'Full-Time' | 'Internship' | 'Non-Profit';
  location: string;
  salaryBracket: string; // Mandatory (e.g. ₹15 LPA, ₹40,000/mo)
  detailedRequirements: string;
  officialCompanyEmail: string; // Must match corporate domain
  eligibleBatches: string;
  tags: string[];
  applicationCount: number;
  deadline: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface Comment {
  id: string;
  postId: string; // target id (post or reel)
  targetType?: 'post' | 'reel';
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorVerificationStatus: UserVerificationStatus;
  content: string;
  createdAt: string;
  likesCount?: number;
  isLikedByMe?: boolean;
  isDemo?: boolean;
}

export type ReelProvider = 'upload' | 'direct' | 'youtube' | 'vimeo' | 'instagram' | 'tiktok';

export interface Reel {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorCollege: string;
  videoUrl: string; // playable URL (upload/direct) or embed URL (providers)
  thumbnailUrl: string;
  caption: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  viewsCount?: number;
  repostsCount?: number;
  provider?: ReelProvider;
  sourceUrl?: string; // original external link
  audioTrack?: string;
  musicTrack?: string;
  isPublic?: boolean;
  isLikedByMe?: boolean;
  isSavedByMe?: boolean;
  createdAt: string;
  isDemo?: boolean;
}

export interface Story {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  collegeName: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption: string;
  ref?: RepostRef;
  createdAtISO: string;
  expiresAt: string;
  isDemo?: boolean;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  category: string;
  subject: string;
  description: string;
  screenshotUrl?: string;
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
  documentUrl: string; // private storage key — never exposed directly
  extractedText?: string;
  extractedName?: string;
  extractedCollege?: string;
  extractedYear?: string;
  fuzzyScore: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Verified Member';
  rejectionReason?: string;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export type ReportTarget = 'post' | 'reel' | 'comment' | 'user' | 'story';

export interface Report {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: ReportTarget;
  targetId: string;
  parentId?: string; // e.g. the post a reported comment belongs to
  targetOwnerId?: string;
  reason: string;
  details: string;
  snapshot: string;
  status: 'open' | 'actioned' | 'dismissed';
  createdAt: string;
  resolvedAt?: string;
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
  userId: string;
  type: NotificationType;
  actorId?: string;
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
}
