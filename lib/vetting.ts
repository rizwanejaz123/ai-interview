export type SkillEvidence = {
  skill: string;
  years?: number | null;
  quote?: string;
  section?: string;
};

export type SkillProfile = {
  name?: string | null;
  field?: string | null;
  industry?: string | null;
  years_total?: number | null;
  skills: SkillEvidence[];
};

export type QuestionTopic = {
  id: string;
  topic: string;
  prompt?: string;
  source?: string;
};

export type InterviewOption = {
  id: string;
  title: string;
  category: string;
  description: string;
  duration_minutes: number;
  question_count: number;
};

export type SelectedInterview = {
  id: string;
  title: string;
  category?: string;
  description?: string;
  duration_minutes?: number;
};

export type CreatedSession = {
  session_id: string;
  candidate_token: string;
  state: string;
  profile: SkillProfile | null;
  interviews: InterviewOption[];
  interview_type: string | null;
  interview: SelectedInterview | null;
  questions: QuestionTopic[];
};

export type JoinDetails = {
  serverUrl: string;
  roomName: string;
  participantToken: string;
  agentName: string;
};

export type AdminSessionSummary = {
  session_id: string;
  state: string;
  room_name: string | null;
  candidate_name: string | null;
  field: string | null;
  created_at: string;
  updated_at: string;
};

export type QuestionDetail = {
  id: string;
  topic: string;
  prompt?: string;
  skill?: string;
  grounding?: string;
  source?: string;
};

export type ScorecardRow = {
  question_id: string | null;
  topic: string | null;
  score: number | null;
  feedback: string | null;
};

export type IntegrityFlag = {
  signal: string;
  severity: string;
  rationale: string;
  evidence: {
    metrics?: Record<string, unknown>;
    count?: number;
    duration_s?: number;
    message?: string | null;
  } | null;
};

export type TranscriptTurn = {
  role: string;
  text: string;
  occurred_at: string | null;
};

export type AdminReport = {
  session_id: string;
  state: string;
  room_name: string | null;
  profile: SkillProfile | null;
  questions: QuestionDetail[];
  scorecard: ScorecardRow[];
  notes: string[];
  integrity: IntegrityFlag[];
  transcript: TranscriptTurn[];
};

export function skillLabel(skill: SkillEvidence): string {
  if (typeof skill.years === "number") return `${skill.skill} · ${skill.years}y`;
  return skill.skill;
}

export function formatWhen(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (data && typeof data === "object") {
      const record = data as { detail?: unknown; error?: unknown };
      if (typeof record.detail === "string") return record.detail;
      if (typeof record.error === "string") return record.error;
      if (record.detail != null) return JSON.stringify(record.detail);
    }
  } catch {
    // Response body was empty or not JSON.
  }
  return `Request failed (${response.status})`;
}

export function parseCreatedSession(value: unknown): CreatedSession | null {
  if (!isRecord(value)) return null;
  if (typeof value.session_id !== "string" || typeof value.candidate_token !== "string") {
    return null;
  }
  const questions = Array.isArray(value.questions)
    ? value.questions.flatMap((item) => {
        const topic = asQuestionTopic(item);
        return topic ? [topic] : [];
      })
    : [];
  const interviews = Array.isArray(value.interviews)
    ? value.interviews.flatMap((item) => {
        const option = asInterviewOption(item);
        return option ? [option] : [];
      })
    : [];
  return {
    session_id: value.session_id,
    candidate_token: value.candidate_token,
    state: typeof value.state === "string" ? value.state : "unknown",
    profile: asProfile(value.profile),
    interviews,
    interview_type: typeof value.interview_type === "string" ? value.interview_type : null,
    interview: asSelectedInterview(value.interview),
    questions,
  };
}

export function parseJoinDetails(value: unknown): JoinDetails | null {
  if (!isRecord(value)) return null;
  if (typeof value.serverUrl !== "string" || typeof value.participantToken !== "string") {
    return null;
  }
  return {
    serverUrl: value.serverUrl,
    roomName: typeof value.roomName === "string" ? value.roomName : "",
    participantToken: value.participantToken,
    agentName: typeof value.agentName === "string" ? value.agentName : "",
  };
}

export function parseSessionList(value: unknown): AdminSessionSummary[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.session_id !== "string") return [];
    return [
      {
        session_id: item.session_id,
        state: typeof item.state === "string" ? item.state : "unknown",
        room_name: typeof item.room_name === "string" ? item.room_name : null,
        candidate_name: typeof item.candidate_name === "string" ? item.candidate_name : null,
        field: typeof item.field === "string" ? item.field : null,
        created_at: typeof item.created_at === "string" ? item.created_at : "",
        updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
      },
    ];
  });
}

export function parseAdminReport(value: unknown): AdminReport | null {
  if (!isRecord(value) || typeof value.session_id !== "string") return null;
  return {
    session_id: value.session_id,
    state: typeof value.state === "string" ? value.state : "unknown",
    room_name: typeof value.room_name === "string" ? value.room_name : null,
    profile: asProfile(value.profile),
    questions: Array.isArray(value.questions)
      ? value.questions.flatMap((item) => {
          const question = asQuestionDetail(item);
          return question ? [question] : [];
        })
      : [],
    scorecard: Array.isArray(value.scorecard)
      ? value.scorecard.flatMap((item) => {
          const row = asScorecardRow(item);
          return row ? [row] : [];
        })
      : [],
    notes: Array.isArray(value.notes)
      ? value.notes.filter((note): note is string => typeof note === "string" && note.length > 0)
      : [],
    integrity: Array.isArray(value.integrity)
      ? value.integrity.flatMap((item) => {
          const flag = asFlag(item);
          return flag ? [flag] : [];
        })
      : [],
    transcript: Array.isArray(value.transcript)
      ? value.transcript.flatMap((item) => {
          const turn = asTurn(item);
          return turn ? [turn] : [];
        })
      : [],
  };
}

function asInterviewOption(value: unknown): InterviewOption | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    category: typeof value.category === "string" ? value.category : "general",
    description: typeof value.description === "string" ? value.description : "",
    duration_minutes: typeof value.duration_minutes === "number" ? value.duration_minutes : 20,
    question_count: typeof value.question_count === "number" ? value.question_count : 0,
  };
}

function asSelectedInterview(value: unknown): SelectedInterview | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }
  return {
    id: value.id,
    title: value.title,
    category: typeof value.category === "string" ? value.category : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    duration_minutes:
      typeof value.duration_minutes === "number" ? value.duration_minutes : undefined,
  };
}

function asQuestionTopic(value: unknown): QuestionTopic | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  return {
    id: value.id,
    topic: typeof value.topic === "string" ? value.topic : "Question",
    prompt: typeof value.prompt === "string" ? value.prompt : undefined,
    source: typeof value.source === "string" ? value.source : undefined,
  };
}

function asQuestionDetail(value: unknown): QuestionDetail | null {
  const topic = asQuestionTopic(value);
  if (!topic || !isRecord(value)) return null;
  return {
    ...topic,
    prompt: typeof value.prompt === "string" ? value.prompt : undefined,
    skill: typeof value.skill === "string" ? value.skill : undefined,
    grounding: typeof value.grounding === "string" ? value.grounding : undefined,
  };
}

function asScorecardRow(value: unknown): ScorecardRow | null {
  if (!isRecord(value)) return null;
  return {
    question_id: typeof value.question_id === "string" ? value.question_id : null,
    topic: typeof value.topic === "string" ? value.topic : null,
    score: typeof value.score === "number" ? value.score : null,
    feedback: typeof value.feedback === "string" ? value.feedback : null,
  };
}

function asFlag(value: unknown): IntegrityFlag | null {
  if (!isRecord(value) || typeof value.signal !== "string") return null;
  const evidence = isRecord(value.evidence) ? value.evidence : null;
  return {
    signal: value.signal,
    severity: typeof value.severity === "string" ? value.severity : "info",
    rationale: typeof value.rationale === "string" ? value.rationale : "",
    evidence: evidence
      ? {
          metrics: isRecord(evidence.metrics) ? evidence.metrics : undefined,
          count: typeof evidence.count === "number" ? evidence.count : undefined,
          duration_s: typeof evidence.duration_s === "number" ? evidence.duration_s : undefined,
          message: typeof evidence.message === "string" ? evidence.message : null,
        }
      : null,
  };
}

function asTurn(value: unknown): TranscriptTurn | null {
  if (!isRecord(value)) return null;
  const text = typeof value.text === "string" ? value.text : "";
  if (!text) return null;
  return {
    role: typeof value.role === "string" ? value.role : "unknown",
    text,
    occurred_at: typeof value.occurred_at === "string" ? value.occurred_at : null,
  };
}

function asProfile(value: unknown): SkillProfile | null {
  if (!isRecord(value)) return null;
  return {
    name: typeof value.name === "string" ? value.name : null,
    field: typeof value.field === "string" ? value.field : null,
    industry: typeof value.industry === "string" ? value.industry : null,
    years_total: typeof value.years_total === "number" ? value.years_total : null,
    skills: asSkills(value.skills),
  };
}

function asSkills(value: unknown): SkillEvidence[] {
  if (!Array.isArray(value)) return [];
  const skills: SkillEvidence[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      skills.push({ skill: item });
      continue;
    }
    if (!isRecord(item) || typeof item.skill !== "string") continue;
    skills.push({
      skill: item.skill,
      years: typeof item.years === "number" ? item.years : null,
      quote: typeof item.quote === "string" ? item.quote : undefined,
      section: typeof item.section === "string" ? item.section : undefined,
    });
  }
  return skills;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
