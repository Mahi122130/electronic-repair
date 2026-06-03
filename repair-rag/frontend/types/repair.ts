// types/repair.ts
// Matches the Pydantic schemas returned by the FastAPI backend

export interface GuideChunk {
  id: string;
  title: string;
  device_type: string;
  manufacturer: string | null;
  model: string | null;
  chunk_text: string;
  similarity_score: number;
  source_url: string | null;
}

export interface RepairQueryResponse {
  session_id: string;
  message_id: string;
  answer: string;
  retrieved_guides: GuideChunk[];
  model_used: string;
  image_url: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  message: string;
  image_url?: string | null;
  created_at: string;
  // Only on assistant messages
  retrieved_guides?: GuideChunk[];
  model_used?: string;
  // UI-only: optimistic pending state
  pending?: boolean;
}

export interface Session {
  id: string;
  title: string | null;
  device_type: string | null;
  manufacturer: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionDetail extends Session {
  messages: Message[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserOut {
  id: string;
  email: string;
  created_at: string;
}
