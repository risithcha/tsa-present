import Dexie, { type EntityTable } from "dexie";
import type { PracticeSession } from "./types";

class TSAPresentDatabase extends Dexie {
  sessions!: EntityTable<PracticeSession, "id">;

  constructor() {
    super("tsa-present-db");
    this.version(1).stores({
      sessions: "id, createdAt, title, rubricId",
    });
  }
}

let dbInstance: TSAPresentDatabase | null = null;

function getDb(): TSAPresentDatabase {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser.");
  }
  if (!dbInstance) {
    dbInstance = new TSAPresentDatabase();
  }
  return dbInstance;
}

export async function saveSession(session: PracticeSession): Promise<string> {
  const db = getDb();
  await db.sessions.put(session);
  return session.id;
}

export async function getSession(
  id: string
): Promise<PracticeSession | undefined> {
  const db = getDb();
  return db.sessions.get(id);
}

export async function listSessions(): Promise<PracticeSession[]> {
  const db = getDb();
  return db.sessions.orderBy("createdAt").reverse().toArray();
}

export async function deleteSession(id: string): Promise<void> {
  const db = getDb();
  await db.sessions.delete(id);
}
