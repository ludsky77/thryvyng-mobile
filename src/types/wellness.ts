export interface WellnessCategory {
  id: string;
  name: string;
  name_es: string | null;
  description: string | null;
  description_es: string | null;
  icon_name: string | null;
  color_gradient: string | null;
  bg_color: string | null;
  display_order: number;
  requires_parent_approval: boolean;
  is_approved?: boolean;
  is_pending?: boolean;
  topic_count?: number;
}

export interface WellnessTopic {
  id: string;
  category_id: string;
  title: string;
  title_es: string | null;
  subtitle: string | null;
  subtitle_es: string | null;
  content_type: 'infographic' | 'tips' | 'checklist' | 'video' | 'links';
  content_json: Record<string, any>;
  estimated_read_time: string | null;
  display_order: number;
  expert_source: string | null;
  linked_course_id: string | null;
}

export interface WellnessEngagement {
  id: string;
  user_id: string;
  player_id: string | null;
  topic_id: string;
  view_started_at: string;
  view_ended_at: string | null;
  duration_seconds: number | null;
}

export interface WellnessEngagementSummary {
  total_views: number;
  total_time_seconds: number;
  topics_viewed: Array<{
    topic_id: string;
    title: string;
    category: string;
    last_viewed: string;
    duration_seconds: number | null;
  }>;
}
