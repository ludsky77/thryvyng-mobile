// Communication Types - IDENTICAL to web app

export interface Channel {
    id: string;
    team_id: string | null;
    club_id: string | null;
    name: string;
    description: string | null;
    channel_type: 'team' | 'club' | 'dm' | 'group_dm' | 'direct' | 'group' | 'broadcast';
    is_default: boolean;
    is_private: boolean;
    is_archived: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    // DM-specific fields
    is_direct_message?: boolean;
    dm_participant_1?: string | null;
    dm_participant_2?: string | null;
    otherUser?: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
      email?: string | null;
    } | null;
    // Broadcast channel field
    allow_member_text?: boolean;
  }
  
  export interface ChannelMember {
    id: string;
    channel_id: string;
    user_id: string;
    role: 'admin' | 'member';
    is_muted: boolean;
    last_read_at: string;
    joined_at: string;
    // Joined data
    profile?: {
      id: string;
      full_name: string;
      avatar_url: string | null;
      email: string;
    };
  }
  
  export interface Message {
    id: string;
    channel_id: string;
    user_id: string;
    content: string;
    message_type: 'standard' | 'alert' | 'system' | 'poll';
    parent_id: string | null;
    poll_id?: string | null; // Link to poll for poll messages
    thread_count: number;
    is_pinned: boolean;
    is_edited: boolean;
    is_deleted: boolean;
    edited_at: string | null;
    created_at: string;
    // Joined data - profile for parents/staff
    profile?: {
      id: string;
      full_name: string;
      avatar_url: string | null;
      associated_player_name?: string | null;
    };
    // Joined data - for players with their own accounts
    sender_player?: {
      id: string;
      first_name: string;
      last_name: string;
      profile_image_url?: string | null;
    } | null;
    reactions?: MessageReaction[];
  }
  
  export interface MessageReaction {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
    created_at: string;
  }
  
  export interface Poll {
    id: string;
    channel_id: string;
    created_by: string;
    question: string;
    poll_type: 'single' | 'multiple' | 'ranked' | 'yes_no';
    allow_add_options: boolean;
    is_anonymous: boolean;
    show_results_live: boolean;
    ends_at: string | null;
    is_active: boolean;
    created_at: string;
    options?: PollOption[];
    votes?: PollVote[];
    user_votes?: PollVote[];
  }
  
  export interface PollOption {
    id: string;
    poll_id: string;
    option_text: string;
    sort_order: number;
    added_by: string | null;
    vote_count?: number;
  }
  
  export interface PollVote {
    id: string;
    poll_id: string;
    option_id: string;
    user_id: string;
    rank: number | null;
  }
  
  // Calendar Types
  export type EventType = 'game' | 'scrimmage' | 'practice' | 'other_event' | 'club_event';
  export type RSVPStatus = 'yes' | 'no' | 'maybe' | 'pending';

  export const EVENT_TYPES = [
    { value: 'game' as const, label: 'Game', icon: '🏆', color: '#ef4444' },
    { value: 'scrimmage' as const, label: 'Scrimmage', icon: '⚽', color: '#f97316' },
    { value: 'practice' as const, label: 'Practice', icon: '🏃', color: '#22c55e' },
    { value: 'other_event' as const, label: 'Other Event', icon: '📅', color: '#a855f7' },
    { value: 'club_event' as const, label: 'Club Event', icon: '👥', color: '#3b82f6' },
  ] as const;

  export const getEventTypeConfig = (type: EventType) =>
    EVENT_TYPES.find((t) => t.value === type) || EVENT_TYPES[3];
  
  export interface CalendarEvent {
    id: string;
    team_id: string;
    club_id: string | null;
    created_by: string;
    title: string;
    description: string | null;
    event_type: EventType;
    event_date: string;
    start_time: string | null;
    end_time: string | null;
    arrival_time: string | null;
    is_all_day: boolean;
    location_id: string | null;
    location_name: string | null;
    location_address: string | null;
    opponent: string | null;
    home_away: 'home' | 'away' | 'neutral' | null;
    uniform: string | null;
    notes: string | null;
    is_cancelled: boolean;
    cancelled_reason: string | null;
    created_at: string;
    updated_at: string;
    rsvp_counts?: {
      yes: number;
      no: number;
      maybe: number;
      pending: number;
    };
    user_rsvp?: EventRSVP | null;
  }
  
  export interface EventRSVP {
    id: string;
    event_id: string;
    user_id: string;
    player_id: string | null;
    status: RSVPStatus;
    decline_reason: string | null;
    responded_at: string | null;
    updated_at: string;
  }
  
  export interface SavedLocation {
    id: string;
    club_id: string;
    name: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    notes: string | null;
    is_home_field: boolean;
  }
  
  // Notification Types
  export type NotificationType = 
    | 'message' 
    | 'mention' 
    | 'event_created' 
    | 'event_updated' 
    | 'event_cancelled' 
    | 'rsvp_reminder' 
    | 'poll_created' 
    | 'poll_ended' 
    | 'system';
  
  export interface Notification {
    id: string;
    user_id: string;
    notification_type: NotificationType;
    title: string;
    body: string | null;
    reference_type: 'message' | 'event' | 'poll' | 'channel' | null;
    reference_id: string | null;
    is_read: boolean;
    read_at: string | null;
    created_at: string;
  }
  
  export interface NotificationPreferences {
    id: string;
    user_id: string;
    push_enabled: boolean;
    channel_messages: 'all' | 'mentions' | 'none';
    direct_messages: 'all' | 'none';
    event_reminders: boolean;
    reminder_hours: number;
    rsvp_requests: boolean;
    event_changes: boolean;
    new_polls: boolean;
    poll_results: boolean;
    quiet_start: string | null;
    quiet_end: string | null;
    updated_at: string | null;
  }
  
  // React Navigation Types
  export type RootStackParamList = {
    Auth: undefined;
    Dashboard: undefined;
    TeamChat: { channelId: string; channelName: string };
    Calendar: { teamId: string; teamName: string };
  };
  
  // User Role Interface (from useAuth)
  export interface UserRole {
    id: string;
    role: string;
    entity_id: string | null;
    role_metadata: any;
    entityName?: string;
  }