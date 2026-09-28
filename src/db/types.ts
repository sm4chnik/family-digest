/** Row shapes mirrored from migrations/0001_init.sql */

export interface UserRow {
  telegram_id: number;
  display_name: string;
  timezone: string | null;
  dnd_enabled: number;
  dnd_start_minute: number | null;
  dnd_end_minute: number | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
  pending_action: string | null;
  reminders_paused: number;
}

export type RoundStatus = "open" | "closing" | "published";

export interface RoundRow {
  id: number;
  started_at: string;
  window_ends_at: string;
  soft_ping_at: string;
  soft_ping_sent_at: string | null;
  closed_at: string | null;
  published_at: string | null;
  status: RoundStatus;
}

export type MediaType = "photo" | "video" | "video_note";

export interface SubmissionRow {
  id: number;
  user_id: number;
  round_id: number | null;
  target_round_id: number | null;
  telegram_file_id: string;
  media_type: MediaType;
  received_at: string;
  published_at: string | null;
  channel_message_id: number | null;
}
