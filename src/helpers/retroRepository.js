const { randomUUID } = require("crypto");
const { normalizeOwner, calculateEstimateMinutes, extractParticipantsFromTranscript } = require("../utils/retroActionUtils.ts");
const { normalizeDedupKey } = require("../utils/retroDedup.ts");

function runRetroMigrations(db) {
  let currentVersion = db.pragma("user_version", { simple: true });
  if (currentVersion < 2) {
    const migrateV2 = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sprint_snapshots (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          start_date TEXT,
          end_date TEXT,
          committed_points INTEGER NOT NULL DEFAULT 0,
          completed_points INTEGER NOT NULL DEFAULT 0,
          total_issues INTEGER NOT NULL DEFAULT 0,
          completed_issues INTEGER NOT NULL DEFAULT 0,
          blocked_issues INTEGER NOT NULL DEFAULT 0,
          burndown_trend TEXT NOT NULL DEFAULT 'on_track',
          velocity INTEGER NOT NULL DEFAULT 0,
          blockers TEXT DEFAULT '',
          is_user_edited INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS retrospectives (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          sprint_id TEXT NOT NULL REFERENCES sprint_snapshots(id),
          transcript TEXT NOT NULL,
          source_kind TEXT NOT NULL DEFAULT 'text',
          audio_path TEXT,
          meeting_owner TEXT,
          processing_state TEXT NOT NULL DEFAULT 'idle',
          analysis_run_count INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS retro_proposals (
          id TEXT PRIMARY KEY,
          retrospective_id TEXT NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          basis TEXT,
          source TEXT NOT NULL,
          state TEXT NOT NULL DEFAULT 'pending',
          dedup_key TEXT NOT NULL,
          analysis_run INTEGER NOT NULL DEFAULT 1,
          suggested_owner TEXT,
          suggested_estimate_value REAL,
          suggested_estimate_unit TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS retro_tracked_actions (
          id TEXT PRIMARY KEY,
          proposal_id TEXT REFERENCES retro_proposals(id) ON DELETE SET NULL,
          retrospective_id TEXT REFERENCES retrospectives(id) ON DELETE CASCADE,
          sprint_id TEXT NOT NULL REFERENCES sprint_snapshots(id),
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          original_title TEXT,
          original_description TEXT,
          source TEXT NOT NULL,
          owner TEXT NOT NULL DEFAULT '',
          owner_normalized TEXT NOT NULL DEFAULT '',
          estimate_value REAL NOT NULL DEFAULT 0,
          estimate_unit TEXT NOT NULL DEFAULT 'hours',
          estimate_minutes REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'open',
          jira_key TEXT UNIQUE,
          jira_creation_state TEXT,
          jira_payload_snapshot TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS mock_jira_counter (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          counter INTEGER NOT NULL DEFAULT 1000
        )
      `);

      db.exec(`INSERT OR IGNORE INTO mock_jira_counter (id, counter) VALUES (1, 1000)`);

      // Seed initial mock sprints if table empty
      const count = db.prepare("SELECT COUNT(*) as c FROM sprint_snapshots").get();
      if (count.c === 0) {
        const stmt = db.prepare(`
          INSERT INTO sprint_snapshots (
            id, name, start_date, end_date, committed_points, completed_points,
            total_issues, completed_issues, blocked_issues, burndown_trend, velocity, blockers
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          "sprint-23",
          "Sprint 23 — Payments",
          "2026-07-08",
          "2026-07-19",
          40,
          29,
          14,
          10,
          3,
          "behind trend",
          32,
          "PR review delays on API gateway, Auth service deployment lock"
        );

        stmt.run(
          "sprint-22",
          "Sprint 22 — Checkout",
          "2026-06-24",
          "2026-07-05",
          36,
          36,
          10,
          10,
          0,
          "ahead of trend",
          36,
          ""
        );

        stmt.run(
          "sprint-21",
          "Sprint 21 — Onboarding",
          "2026-06-10",
          "2026-06-21",
          32,
          26,
          11,
          8,
          3,
          "behind trend",
          26,
          "Onboarding flow QA handoff delays, Flaky integration test suite still intermittent"
        );

        stmt.run(
          "sprint-20",
          "Sprint 20 — Onboarding",
          "2026-05-27",
          "2026-06-07",
          34,
          22,
          12,
          7,
          4,
          "behind trend",
          22,
          "CI pipeline flaky tests blocking merges, Unclear ownership on onboarding API endpoints"
        );
      }

      db.pragma("user_version = 2");
    });
    migrateV2();
    currentVersion = 2;
  }

  if (currentVersion < 3) {
    const migrateV3 = db.transaction(() => {
      try {
        db.exec(`ALTER TABLE retrospectives ADD COLUMN meeting_owner TEXT;`);
      } catch (_) {}
      try {
        db.exec(`ALTER TABLE retro_proposals ADD COLUMN suggested_owner TEXT;`);
      } catch (_) {}
      try {
        db.exec(`ALTER TABLE retro_proposals ADD COLUMN suggested_estimate_value REAL;`);
      } catch (_) {}
      try {
        db.exec(`ALTER TABLE retro_proposals ADD COLUMN suggested_estimate_unit TEXT;`);
      } catch (_) {}

      db.pragma("user_version = 3");
    });
    migrateV3();
  }

  if (currentVersion < 4) {
    const migrateV4 = db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          project_id TEXT NOT NULL UNIQUE,
          slack_channel_id TEXT NOT NULL DEFAULT '',
          description TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      try {
        db.exec(`ALTER TABLE sprint_snapshots ADD COLUMN project_id TEXT REFERENCES projects(id);`);
      } catch (_) {}
      try {
        db.exec(`ALTER TABLE retrospectives ADD COLUMN project_id TEXT REFERENCES projects(id);`);
      } catch (_) {}

      db.exec(`
        CREATE TABLE IF NOT EXISTS coach_topics (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          sprint_id TEXT NOT NULL REFERENCES sprint_snapshots(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          rationale TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT 'general',
          priority INTEGER NOT NULL DEFAULT 3,
          state TEXT NOT NULL DEFAULT 'suggested',
          source_data TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS coach_topic_outcomes (
          id TEXT PRIMARY KEY,
          topic_id TEXT NOT NULL REFERENCES coach_topics(id) ON DELETE CASCADE,
          retrospective_id TEXT NOT NULL REFERENCES retrospectives(id) ON DELETE CASCADE,
          coverage_score REAL NOT NULL DEFAULT 0.0,
          engagement_depth TEXT NOT NULL DEFAULT 'none',
          speaker_count INTEGER NOT NULL DEFAULT 0,
          sentiment TEXT NOT NULL DEFAULT 'neutral',
          produced_actions INTEGER NOT NULL DEFAULT 0,
          agent_notes TEXT DEFAULT '',
          relevant_quotes TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS coach_insights (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          insight_type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          confidence REAL NOT NULL DEFAULT 0.5,
          related_sprint_ids TEXT DEFAULT '[]',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS coach_slack_notifications (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          recipient_name TEXT NOT NULL,
          recipient_slack_id TEXT DEFAULT '',
          message_type TEXT NOT NULL,
          message_content TEXT NOT NULL,
          sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT NOT NULL DEFAULT 'sent'
        );
      `);

      const projCount = db.prepare("SELECT COUNT(*) as c FROM projects").get();
      let defaultProjectId = "proj-default-gen-eng";
      if (projCount.c === 0) {
        db.prepare(`
          INSERT INTO projects (id, name, project_id, slack_channel_id, description)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          defaultProjectId,
          "General Engineering",
          "PROJ-GEN-ENG",
          "C012345678",
          "Default engineering team project"
        );
      } else {
        const first = db.prepare("SELECT id FROM projects LIMIT 1").get();
        if (first) defaultProjectId = first.id;
      }

      db.prepare(`UPDATE sprint_snapshots SET project_id = ? WHERE project_id IS NULL OR project_id = ''`).run(defaultProjectId);
      db.prepare(`UPDATE retrospectives SET project_id = ? WHERE project_id IS NULL OR project_id = ''`).run(defaultProjectId);

      db.pragma("user_version = 4");
    });
    migrateV4();
  }

  if (currentVersion < 5) {
    const migrateV5 = db.transaction(() => {
      try {
        db.exec(`ALTER TABLE projects ADD COLUMN notification_settings TEXT DEFAULT '{}';`);
      } catch (_) {}
      db.pragma("user_version = 5");
    });
    migrateV5();
  }
}

class RetroRepository {
  constructor(db) {
    this.db = db;
    runRetroMigrations(this.db);
  }

  async listSprints() {
    const rows = this.db
      .prepare("SELECT * FROM sprint_snapshots ORDER BY start_date DESC")
      .all();
    return Promise.resolve(rows);
  }

  async getSprintSnapshot(sprintId) {
    const row = this.db
      .prepare("SELECT * FROM sprint_snapshots WHERE id = ?")
      .get(sprintId);
    return Promise.resolve(row || null);
  }

  async updateSprintMetrics(sprintId, metrics) {
    const {
      name,
      start_date,
      end_date,
      committed_points,
      completed_points,
      total_issues,
      completed_issues,
      blocked_issues,
      burndown_trend,
      velocity,
      blockers,
      project_id,
    } = metrics;

    const existing = this.db.prepare("SELECT id FROM sprint_snapshots WHERE id = ?").get(sprintId);

    if (!existing) {
      const defaultProjectId = project_id || "proj-default-gen-eng";
      const sprintName = name || `Sprint ${sprintId.replace(/[^0-9]/g, "") || "New"}`;
      this.db
        .prepare(`
          INSERT INTO sprint_snapshots (
            id, name, start_date, end_date, committed_points, completed_points,
            total_issues, completed_issues, blocked_issues, burndown_trend, velocity, blockers, is_user_edited, project_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `)
        .run(
          sprintId,
          sprintName,
          start_date || new Date().toISOString().split("T")[0],
          end_date || new Date().toISOString().split("T")[0],
          committed_points ?? 0,
          completed_points ?? 0,
          total_issues ?? 0,
          completed_issues ?? 0,
          blocked_issues ?? 0,
          burndown_trend || "on_track",
          velocity ?? 0,
          blockers || "",
          defaultProjectId
        );
    } else {
      this.db
        .prepare(`
          UPDATE sprint_snapshots SET
            name = COALESCE(?, name),
            start_date = COALESCE(?, start_date),
            end_date = COALESCE(?, end_date),
            committed_points = ?,
            completed_points = ?,
            total_issues = ?,
            completed_issues = ?,
            blocked_issues = ?,
            burndown_trend = ?,
            velocity = ?,
            blockers = ?,
            is_user_edited = 1,
            updated_at = datetime('now')
          WHERE id = ?
        `)
        .run(
          name || null,
          start_date || null,
          end_date || null,
          committed_points ?? 0,
          completed_points ?? 0,
          total_issues ?? 0,
          completed_issues ?? 0,
          blocked_issues ?? 0,
          burndown_trend || "on_track",
          velocity ?? 0,
          blockers || "",
          sprintId
        );
    }

    return this.getSprintSnapshot(sprintId);
  }

  async createRetrospective({ sprintId, title, transcript, sourceKind, audioPath, meetingOwner }) {
    const id = randomUUID();
    const retroTitle = title || `Retrospective — ${new Date().toLocaleDateString()}`;

    this.db
      .prepare(`
        INSERT INTO retrospectives (id, title, sprint_id, transcript, source_kind, audio_path, meeting_owner, processing_state)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'idle')
      `)
      .run(id, retroTitle, sprintId, transcript || "", sourceKind || "text", audioPath || null, meetingOwner || null);

    return this.getRetrospective(id);
  }

  async getRetrospective(id) {
    const row = this.db.prepare("SELECT * FROM retrospectives WHERE id = ?").get(id);
    return Promise.resolve(row || null);
  }

  async listRetrospectives() {
    const rows = this.db
      .prepare(`
        SELECT r.*,
          (SELECT COUNT(*) FROM retro_proposals p WHERE p.retrospective_id = r.id AND (p.state IS NULL OR p.state NOT IN ('accepted', 'dismissed', 'superseded'))) AS pending_proposals_count
        FROM retrospectives r
        ORDER BY r.created_at DESC
      `)
      .all();
    return Promise.resolve(rows);
  }

  async updateRetrospective(id, data) {
    const fields = [];
    const values = [];

    if (data.title !== undefined) {
      fields.push("title = ?");
      values.push(data.title);
    }
    if (data.transcript !== undefined) {
      fields.push("transcript = ?");
      values.push(data.transcript);
    }
    if (data.processing_state !== undefined) {
      fields.push("processing_state = ?");
      values.push(data.processing_state);
    }
    if (data.analysis_run_count !== undefined) {
      fields.push("analysis_run_count = ?");
      values.push(data.analysis_run_count);
    }
    if (data.audio_path !== undefined) {
      fields.push("audio_path = ?");
      values.push(data.audio_path);
    }
    if (data.meeting_owner !== undefined) {
      fields.push("meeting_owner = ?");
      values.push(data.meeting_owner);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db
        .prepare(`UPDATE retrospectives SET ${fields.join(", ")} WHERE id = ?`)
        .run(...values);
    }

    return this.getRetrospective(id);
  }

  async saveProposals(retrospectiveId, proposals, analysisRun = 1) {
    const transaction = this.db.transaction(() => {
      // Mark existing pending proposals for this retro as superseded
      this.db
        .prepare(`
          UPDATE retro_proposals SET state = 'superseded', updated_at = datetime('now')
          WHERE retrospective_id = ? AND state = 'pending'
        `)
        .run(retrospectiveId);

      const insertStmt = this.db.prepare(`
        INSERT INTO retro_proposals (
          id, retrospective_id, title, description, basis, source, state, dedup_key, analysis_run,
          suggested_owner, suggested_estimate_value, suggested_estimate_unit
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
      `);

      const savedList = [];
      for (const p of proposals) {
        const id = randomUUID();
        const dedupKey = normalizeDedupKey(p.title);
        const sugOwner = p.suggestedOwner || p.owner || null;
        const sugEstVal = p.suggestedEstimateValue ?? p.estimateValue ?? null;
        const sugEstUnit = p.suggestedEstimateUnit || p.estimateUnit || null;

        insertStmt.run(
          id,
          retrospectiveId,
          p.title,
          p.description || "",
          p.basis || null,
          p.source || "explicit",
          dedupKey,
          analysisRun,
          sugOwner,
          sugEstVal,
          sugEstUnit
        );
        savedList.push({
          id,
          retrospective_id: retrospectiveId,
          title: p.title,
          description: p.description || "",
          basis: p.basis || null,
          source: p.source || "explicit",
          state: "pending",
          dedup_key: dedupKey,
          analysis_run: analysisRun,
          suggested_owner: sugOwner,
          suggested_estimate_value: sugEstVal,
          suggested_estimate_unit: sugEstUnit,
        });
      }

      // Update analysis run count on retro
      this.db
        .prepare(`
          UPDATE retrospectives SET analysis_run_count = ?, processing_state = 'review', updated_at = datetime('now')
          WHERE id = ?
        `)
        .run(analysisRun, retrospectiveId);

      return savedList;
    });

    return Promise.resolve(transaction());
  }

  async listProposals(retrospectiveId) {
    const rows = this.db
      .prepare(`
        SELECT * FROM retro_proposals
        WHERE retrospective_id = ? AND (state IS NULL OR state NOT IN ('accepted', 'dismissed', 'superseded'))
        ORDER BY created_at ASC
      `)
      .all(retrospectiveId);
    return Promise.resolve(rows);
  }

  async dismissProposal(proposalId) {
    this.db
      .prepare("UPDATE retro_proposals SET state = 'dismissed', updated_at = datetime('now') WHERE id = ?")
      .run(proposalId);
    return Promise.resolve(true);
  }

  async acceptProposal(proposalId, editedData = {}) {
    const transaction = this.db.transaction(() => {
      const proposal = this.db
        .prepare("SELECT * FROM retro_proposals WHERE id = ?")
        .get(proposalId);

      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      const retro = this.db
        .prepare("SELECT sprint_id, meeting_owner FROM retrospectives WHERE id = ?")
        .get(proposal.retrospective_id);

      const title = editedData.title || proposal.title;
      const description = editedData.description !== undefined ? editedData.description : proposal.description;

      let owner = editedData.owner !== undefined && editedData.owner !== null && String(editedData.owner).trim() !== ""
        ? String(editedData.owner).trim()
        : (proposal.suggested_owner || "");

      if (!owner && retro && retro.meeting_owner) {
        owner = retro.meeting_owner;
      }
      if (!owner) {
        owner = "Unassigned";
      }

      const ownerNormalized = normalizeOwner(owner);

      let estimateValue = editedData.estimate_value !== undefined && editedData.estimate_value !== null
        ? Number(editedData.estimate_value)
        : (proposal.suggested_estimate_value !== null && proposal.suggested_estimate_value !== undefined
          ? Number(proposal.suggested_estimate_value)
          : 1);

      let estimateUnit = editedData.estimate_unit || proposal.suggested_estimate_unit || "hours";
      if (!["minutes", "hours", "days"].includes(estimateUnit)) {
        estimateUnit = "hours";
      }
      const estimateMinutes = calculateEstimateMinutes(estimateValue, estimateUnit);

      const actionId = randomUUID();

      this.db
        .prepare(`
          INSERT INTO retro_tracked_actions (
            id, proposal_id, retrospective_id, sprint_id, title, description,
            original_title, original_description, source, owner, owner_normalized,
            estimate_value, estimate_unit, estimate_minutes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
        `)
        .run(
          actionId,
          proposal.id,
          proposal.retrospective_id,
          retro ? retro.sprint_id : "",
          title,
          description,
          proposal.title, // Keep original unmodified AI title
          proposal.description, // Keep original unmodified AI description
          proposal.source,
          owner,
          ownerNormalized,
          estimateValue,
          estimateUnit,
          estimateMinutes
        );

      // Update proposal state to accepted
      this.db
        .prepare("UPDATE retro_proposals SET state = 'accepted', updated_at = datetime('now') WHERE id = ?")
        .run(proposalId);

      return this.db
        .prepare("SELECT * FROM retro_tracked_actions WHERE id = ?")
        .get(actionId);
    });

    return Promise.resolve(transaction());
  }

  async createManualAction({ sprintId, title, description, owner, estimate_value, estimate_unit }) {
    const actionId = randomUUID();
    const ownerName = owner || "";
    const ownerNormalized = normalizeOwner(ownerName);
    const estVal = Number(estimate_value) || 0;
    const estUnit = estimate_unit || "hours";
    const estMins = calculateEstimateMinutes(estVal, estUnit);

    this.db
      .prepare(`
        INSERT INTO retro_tracked_actions (
          id, proposal_id, retrospective_id, sprint_id, title, description,
          original_title, original_description, source, owner, owner_normalized,
          estimate_value, estimate_unit, estimate_minutes, status
        ) VALUES (?, NULL, NULL, ?, ?, ?, NULL, NULL, 'manual', ?, ?, ?, ?, ?, 'open')
      `)
      .run(
        actionId,
        sprintId,
        title,
        description || "",
        ownerName,
        ownerNormalized,
        estVal,
        estUnit,
        estMins
      );

    const row = this.db
      .prepare("SELECT * FROM retro_tracked_actions WHERE id = ?")
      .get(actionId);
    return Promise.resolve(row);
  }

  async listTrackedActions(filters = {}) {
    let query = "SELECT * FROM retro_tracked_actions WHERE 1=1";
    const params = [];

    if (filters.status) {
      query += " AND status = ?";
      params.push(filters.status);
    }
    if (filters.owner) {
      query += " AND owner_normalized = ?";
      params.push(normalizeOwner(filters.owner));
    }
    if (filters.sprintId) {
      query += " AND sprint_id = ?";
      params.push(filters.sprintId);
    }
    if (Array.isArray(filters.sprintIds)) {
      if (filters.sprintIds.length === 0) {
        return Promise.resolve([]);
      }
      const placeholders = filters.sprintIds.map(() => "?").join(", ");
      query += ` AND sprint_id IN (${placeholders})`;
      params.push(...filters.sprintIds);
    }

    query += " ORDER BY created_at DESC";

    const rows = this.db.prepare(query).all(...params);
    return Promise.resolve(rows);
  }

  async updateTrackedAction(id, data) {
    const action = this.db
      .prepare("SELECT * FROM retro_tracked_actions WHERE id = ?")
      .get(id);

    if (!action) {
      throw new Error(`Action ${id} not found`);
    }

    const fields = [];
    const values = [];

    if (data.title !== undefined) {
      fields.push("title = ?");
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push("description = ?");
      values.push(data.description);
    }
    if (data.owner !== undefined) {
      fields.push("owner = ?");
      fields.push("owner_normalized = ?");
      values.push(data.owner);
      values.push(normalizeOwner(data.owner));
    }
    if (data.estimate_value !== undefined || data.estimate_unit !== undefined) {
      const val = data.estimate_value !== undefined ? data.estimate_value : action.estimate_value;
      const unit = data.estimate_unit !== undefined ? data.estimate_unit : action.estimate_unit;
      fields.push("estimate_value = ?");
      fields.push("estimate_unit = ?");
      fields.push("estimate_minutes = ?");
      values.push(val);
      values.push(unit);
      values.push(calculateEstimateMinutes(val, unit));
    }
    if (data.status !== undefined) {
      fields.push("status = ?");
      values.push(data.status);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db
        .prepare(`UPDATE retro_tracked_actions SET ${fields.join(", ")} WHERE id = ?`)
        .run(...values);
    }

    const updated = this.db
      .prepare("SELECT * FROM retro_tracked_actions WHERE id = ?")
      .get(id);
    return Promise.resolve(updated);
  }

  async deleteTrackedAction(id) {
    const res = this.db
      .prepare("DELETE FROM retro_tracked_actions WHERE id = ?")
      .run(id);
    return Promise.resolve(res.changes > 0);
  }

  async listOwners() {
    const namesSet = new Set();

    try {
      const actionRows = this.db
        .prepare(`SELECT DISTINCT owner FROM retro_tracked_actions WHERE owner IS NOT NULL AND owner != ''`)
        .all();
      actionRows.forEach((r) => r.owner && namesSet.add(r.owner.trim()));
    } catch {}

    try {
      const proposalRows = this.db
        .prepare(`SELECT DISTINCT suggested_owner FROM retro_proposals WHERE suggested_owner IS NOT NULL AND suggested_owner != ''`)
        .all();
      proposalRows.forEach((r) => r.suggested_owner && namesSet.add(r.suggested_owner.trim()));
    } catch {}

    try {
      const retroRows = this.db
        .prepare(`SELECT meeting_owner, transcript FROM retrospectives`)
        .all();
      retroRows.forEach((r) => {
        if (r.meeting_owner && r.meeting_owner.trim()) {
          namesSet.add(r.meeting_owner.trim());
        }
        if (r.transcript) {
          const speakers = extractParticipantsFromTranscript(r.transcript);
          speakers.forEach((s) => namesSet.add(s.trim()));
        }
      });
    } catch {}

    const list = Array.from(namesSet).filter((n) => n && n !== "Unassigned");
    list.sort((a, b) => a.localeCompare(b));
    return Promise.resolve(list);
  }

  async createMockJiraTicket(trackedActionId, summary, description) {
    const transaction = this.db.transaction(() => {
      const action = this.db
        .prepare("SELECT * FROM retro_tracked_actions WHERE id = ?")
        .get(trackedActionId);

      if (!action) {
        throw new Error(`Tracked action ${trackedActionId} not found`);
      }

      // Idempotency: if ticket already created for this action, return existing
      if (action.jira_key) {
        return {
          jira_key: action.jira_key,
          jira_creation_state: action.jira_creation_state,
          jira_payload_snapshot: action.jira_payload_snapshot
            ? JSON.parse(action.jira_payload_snapshot)
            : null,
        };
      }

      // Atomic increment counter
      const counterRow = this.db
        .prepare("SELECT counter FROM mock_jira_counter WHERE id = 1")
        .get();
      const nextCounter = (counterRow ? counterRow.counter : 1000) + 1;

      this.db
        .prepare("UPDATE mock_jira_counter SET counter = ? WHERE id = 1")
        .run(nextCounter);

      const jiraKey = `AGILE-${nextCounter}`;
      const payloadSnapshot = JSON.stringify({
        summary: summary || action.title,
        description: description || action.description,
        sprintId: action.sprint_id,
        owner: action.owner,
        estimateValue: action.estimate_value,
        estimateUnit: action.estimate_unit,
        createdAt: new Date().toISOString(),
      });

      this.db
        .prepare(`
          UPDATE retro_tracked_actions
          SET jira_key = ?, jira_creation_state = 'created', jira_payload_snapshot = ?, updated_at = datetime('now')
          WHERE id = ?
        `)
        .run(jiraKey, payloadSnapshot, trackedActionId);

      return {
        jira_key: jiraKey,
        jira_creation_state: "created",
        jira_payload_snapshot: JSON.parse(payloadSnapshot),
      };
    });

    return Promise.resolve(transaction());
  }

  // --- Projects API ---
  async listProjects() {
    const rows = this.db.prepare("SELECT * FROM projects ORDER BY name ASC").all();
    return Promise.resolve(rows);
  }

  async getProject(id) {
    const row = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
    return Promise.resolve(row || null);
  }

  async createProject({ name, project_id, slack_channel_id, description }) {
    const id = randomUUID();
    const pid = (project_id || name.toLowerCase().replace(/[^a-z0-9]/g, "-")).toUpperCase();
    this.db.prepare(`
      INSERT INTO projects (id, name, project_id, slack_channel_id, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, pid, slack_channel_id || '', description || '');
    return this.getProject(id);
  }

  async updateProject(id, updates) {
    const fields = [];
    const values = [];
    if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name); }
    if (updates.project_id !== undefined) { fields.push("project_id = ?"); values.push(updates.project_id); }
    if (updates.slack_channel_id !== undefined) { fields.push("slack_channel_id = ?"); values.push(updates.slack_channel_id); }
    if (updates.description !== undefined) { fields.push("description = ?"); values.push(updates.description); }
    if (updates.notification_settings !== undefined) {
      fields.push("notification_settings = ?");
      values.push(typeof updates.notification_settings === 'object' ? JSON.stringify(updates.notification_settings) : updates.notification_settings);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }
    return this.getProject(id);
  }

  async deleteProject(id) {
    const res = this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return Promise.resolve(res.changes > 0);
  }

  // --- Coach Topics API ---
  async listTopics(projectId, sprintId) {
    let query = "SELECT * FROM coach_topics WHERE 1=1";
    const params = [];
    if (projectId) { query += " AND project_id = ?"; params.push(projectId); }
    if (sprintId) { query += " AND sprint_id = ?"; params.push(sprintId); }
    query += " ORDER BY priority ASC, created_at DESC";
    const rows = this.db.prepare(query).all(...params);
    return Promise.resolve(rows);
  }

  async saveTopics(topics) {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO coach_topics (id, project_id, sprint_id, title, rationale, category, priority, state, source_data)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const inserted = [];
      for (const t of topics) {
        const id = t.id || randomUUID();
        stmt.run(
          id,
          t.project_id,
          t.sprint_id,
          t.title,
          t.rationale || '',
          t.category || 'general',
          t.priority || 3,
          t.state || 'suggested',
          typeof t.source_data === 'object' ? JSON.stringify(t.source_data) : (t.source_data || '{}')
        );
        inserted.push(id);
      }
      return inserted;
    });
    return Promise.resolve(transaction());
  }

  async updateTopic(id, updates) {
    const fields = [];
    const values = [];
    if (updates.title !== undefined) { fields.push("title = ?"); values.push(updates.title); }
    if (updates.rationale !== undefined) { fields.push("rationale = ?"); values.push(updates.rationale); }
    if (updates.category !== undefined) { fields.push("category = ?"); values.push(updates.category); }
    if (updates.priority !== undefined) { fields.push("priority = ?"); values.push(updates.priority); }
    if (updates.state !== undefined) { fields.push("state = ?"); values.push(updates.state); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      values.push(id);
      this.db.prepare(`UPDATE coach_topics SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }
    const row = this.db.prepare("SELECT * FROM coach_topics WHERE id = ?").get(id);
    return Promise.resolve(row || null);
  }

  async acceptTopic(id) {
    return this.updateTopic(id, { state: 'accepted' });
  }

  async dismissTopic(id) {
    return this.updateTopic(id, { state: 'dismissed' });
  }

  // --- Topic Outcomes & Insights ---
  async saveTopicOutcomes(outcomes) {
    const transaction = this.db.transaction(() => {
      const stmt = this.db.prepare(`
        INSERT INTO coach_topic_outcomes (
          id, topic_id, retrospective_id, coverage_score, engagement_depth,
          speaker_count, sentiment, produced_actions, agent_notes, relevant_quotes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const o of outcomes) {
        const id = o.id || randomUUID();
        stmt.run(
          id,
          o.topic_id,
          o.retrospective_id,
          o.coverage_score ?? 0.0,
          o.engagement_depth || 'none',
          o.speaker_count ?? 0,
          o.sentiment || 'neutral',
          o.produced_actions ?? 0,
          o.agent_notes || '',
          typeof o.relevant_quotes === 'object' ? JSON.stringify(o.relevant_quotes) : (o.relevant_quotes || '[]')
        );
      }
    });
    return Promise.resolve(transaction());
  }

  async listTopicOutcomes(retrospectiveId) {
    const rows = this.db.prepare(`
      SELECT o.*, t.title as topic_title, t.category as topic_category
      FROM coach_topic_outcomes o
      JOIN coach_topics t ON o.topic_id = t.id
      WHERE o.retrospective_id = ?
    `).all(retrospectiveId);
    return Promise.resolve(rows);
  }

  async listInsights(projectId) {
    let query = "SELECT * FROM coach_insights WHERE is_active = 1";
    const params = [];
    if (projectId) { query += " AND project_id = ?"; params.push(projectId); }
    query += " ORDER BY confidence DESC, created_at DESC";
    const rows = this.db.prepare(query).all(...params);
    return Promise.resolve(rows);
  }

  async saveInsight({ project_id, insight_type, title, description, confidence, related_sprint_ids }) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO coach_insights (id, project_id, insight_type, title, description, confidence, related_sprint_ids)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, project_id, insight_type, title, description,
      confidence ?? 0.5,
      typeof related_sprint_ids === 'object' ? JSON.stringify(related_sprint_ids) : (related_sprint_ids || '[]')
    );
    const row = this.db.prepare("SELECT * FROM coach_insights WHERE id = ?").get(id);
    return Promise.resolve(row);
  }

  async listSlackNotifications(projectId) {
    let query = "SELECT * FROM coach_slack_notifications";
    const params = [];
    if (projectId) { query += " WHERE project_id = ?"; params.push(projectId); }
    query += " ORDER BY sent_at DESC LIMIT 50";
    const rows = this.db.prepare(query).all(...params);
    return Promise.resolve(rows);
  }

  async saveSlackNotification({ project_id, recipient_name, recipient_slack_id, message_type, message_content, status }) {
    const id = randomUUID();
    this.db.prepare(`
      INSERT INTO coach_slack_notifications (id, project_id, recipient_name, recipient_slack_id, message_type, message_content, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, project_id, recipient_name, recipient_slack_id || '', message_type, message_content, status || 'sent');
    const row = this.db.prepare("SELECT * FROM coach_slack_notifications WHERE id = ?").get(id);
    return Promise.resolve(row);
  }

  async resetDemoData() {
    const txn = this.db.transaction(() => {
      // Preserve notification settings
      const existingProject = this.db.prepare("SELECT notification_settings FROM projects WHERE id = 'proj-default-gen-eng'").get();
      const savedNotificationSettings = existingProject?.notification_settings || '{}';

      // Clear all retro data (order matters for foreign keys - child tables first)
      this.db.exec(`DELETE FROM coach_slack_notifications`);
      this.db.exec(`DELETE FROM coach_topic_outcomes`);
      this.db.exec(`DELETE FROM coach_insights`);
      this.db.exec(`DELETE FROM coach_topics`);
      this.db.exec(`DELETE FROM retro_tracked_actions`);
      this.db.exec(`DELETE FROM retro_proposals`);
      this.db.exec(`DELETE FROM retrospectives`);
      this.db.exec(`DELETE FROM sprint_snapshots`);
      this.db.exec(`DELETE FROM projects`);

      const defaultProjectId = "proj-default-gen-eng";

      // 1. Re-seed default project with preserved notification settings FIRST
      this.db.prepare(`
        INSERT INTO projects (id, name, project_id, slack_channel_id, description, notification_settings)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        defaultProjectId,
        "General Engineering",
        "PROJ-GEN-ENG",
        "C012345678",
        "Default engineering team project",
        savedNotificationSettings
      );

      // 2. Re-seed sprint snapshots SECOND (referencing defaultProjectId)
      const sprintStmt = this.db.prepare(`
        INSERT INTO sprint_snapshots (
          id, name, start_date, end_date, committed_points, completed_points,
          total_issues, completed_issues, blocked_issues, burndown_trend, velocity, blockers, project_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      sprintStmt.run("sprint-23", "Sprint 23 — Payments", "2026-07-08", "2026-07-19", 40, 29, 14, 10, 3, "behind trend", 32, "PR review delays on API gateway, Auth service deployment lock", defaultProjectId);
      sprintStmt.run("sprint-22", "Sprint 22 — Checkout", "2026-06-24", "2026-07-05", 36, 36, 10, 10, 0, "ahead of trend", 36, "", defaultProjectId);
      sprintStmt.run("sprint-21", "Sprint 21 — Onboarding", "2026-06-10", "2026-06-21", 32, 26, 11, 8, 3, "behind trend", 26, "Onboarding flow QA handoff delays, Flaky integration test suite still intermittent", defaultProjectId);
      sprintStmt.run("sprint-20", "Sprint 20 — Onboarding", "2026-05-27", "2026-06-07", 34, 22, 12, 7, 4, "behind trend", 22, "CI pipeline flaky tests blocking merges, Unclear ownership on onboarding API endpoints", defaultProjectId);

      // Re-seed Retrospectives for Sprints 20 and 21
      const retroStmt = this.db.prepare(`
        INSERT INTO retrospectives (id, title, sprint_id, project_id, transcript, source_kind, meeting_owner, processing_state, analysis_run_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      retroStmt.run(
        "retro-sprint-20",
        "Sprint 20 Retrospective — Onboarding",
        "sprint-20",
        defaultProjectId,
        `Jordan: Welcome everyone to the Sprint 20 retrospective. It was a tough sprint — we only finished 22 of 34 committed points. Let's start with what went wrong.\nAlex: The CI pipeline flaky integration tests hit us hard. Merges were constantly blocked because test runs failed randomly.\nSarah: Also, nobody was clear on who owned the onboarding API endpoints. When a bug came up, it bounced between Alex and Marcus for two days.\nMarcus: We need clear service ownership. I'll take explicit ownership of the Onboarding API endpoints.\nJordan: Great. Alex, can you look into why the CI integration test suite is flaky?\nAlex: Yeah, I'll investigate the CI test container memory limits and flaky test runs.\nSarah: Let's also set up a team SLA for PR code reviews so pull requests don't sit in review forever.\nJordan: Good idea. Sarah will draft the PR review SLA proposal.`,
        "paste",
        "Jordan Smith",
        "completed",
        1,
        "2026-06-08 10:00:00"
      );

      retroStmt.run(
        "retro-sprint-21",
        "Sprint 21 Retrospective — Onboarding",
        "sprint-21",
        defaultProjectId,
        `Sarah: Sprint 21 retro. We hit 26 points out of 32 committed, which is an improvement over Sprint 20!\nMarcus: The onboarding API endpoint documentation really helped. I handled all incoming endpoint requests smoothly.\nAlex: But the QA handoff process was really bumpy. QA didn't get build artifacts until Thursday afternoon, which created a massive testing bottleneck.\nJordan: We should automate the QA staging deploy as soon as a PR lands in main.\nSarah: Excellent suggestion. Jordan, will you build the automated staging deploy pipeline step?\nJordan: Yes, I can set that up in GitHub Actions.\nAlex: Also, the staging database config drifted from production during the migration test. We need automated config validation.\nMarcus: I can own the staging config validation check script.`,
        "paste",
        "Sarah Jenkins",
        "completed",
        1,
        "2026-06-22 10:00:00"
      );

      // Re-seed proposals & tracked actions for Sprints 20, 21, 22
      const propStmt = this.db.prepare(`
        INSERT INTO retro_proposals (id, retrospective_id, title, description, basis, source, state, dedup_key, suggested_owner, suggested_estimate_value, suggested_estimate_unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const actionStmt = this.db.prepare(`
        INSERT INTO retro_tracked_actions (id, proposal_id, retrospective_id, sprint_id, title, description, original_title, original_description, source, owner, owner_normalized, estimate_value, estimate_unit, estimate_minutes, status, jira_key, jira_creation_state, jira_payload_snapshot)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Sprint 20 Actions
      propStmt.run("prop-20-1", "retro-sprint-20", "Audit and stabilize flaky CI integration test suite", "Investigate memory limits and intermittent test failures in CI runner", "Transcript discussion", "explicit", "accepted", "audit and stabilize flaky ci integration test suite", "Alex Chen", 4, "hours");
      actionStmt.run("act-20-1", "prop-20-1", "retro-sprint-20", "sprint-20", "Audit and stabilize flaky CI integration test suite", "Investigate memory limits and intermittent test failures in CI runner", "Audit and stabilize flaky CI integration test suite", "Investigate memory limits and intermittent test failures in CI runner", "explicit", "Alex Chen", "alex chen", 4, "hours", 240, "completed", "AGILE-1001", "created", '{"key":"AGILE-1001","summary":"Audit and stabilize flaky CI integration test suite"}');

      propStmt.run("prop-20-2", "retro-sprint-20", "Document ownership and SLA for Onboarding API endpoints", "Assign explicit component owner to resolve bounce-around bug reports", "Coach analysis", "coach", "accepted", "document ownership and sla for onboarding api endpoints", "Marcus Vance", 2, "hours");
      actionStmt.run("act-20-2", "prop-20-2", "retro-sprint-20", "sprint-20", "Document ownership and SLA for Onboarding API endpoints", "Assign explicit component owner to resolve bounce-around bug reports", "Document ownership and SLA for Onboarding API endpoints", "Assign explicit component owner to resolve bounce-around bug reports", "coach", "Marcus Vance", "marcus vance", 2, "hours", 120, "completed", null, null, null);

      propStmt.run("prop-20-3", "retro-sprint-20", "Draft initial PR review response time SLA (24h target)", "Establish team SLA to ensure code reviews happen within 24 hours", "Transcript discussion", "explicit", "accepted", "draft initial pr review response time sla (24h target)", "Sarah Jenkins", 1, "days");
      actionStmt.run("act-20-3", "prop-20-3", "retro-sprint-20", "sprint-20", "Draft initial PR review response time SLA (24h target)", "Establish team SLA to ensure code reviews happen within 24 hours", "Draft initial PR review response time SLA (24h target)", "Establish team SLA to ensure code reviews happen within 24 hours", "explicit", "Sarah Jenkins", "sarah jenkins", 1, "days", 480, "open", "AGILE-1002", "created", '{"key":"AGILE-1002","summary":"Draft initial PR review response time SLA (24h target)"}');

      // Sprint 21 Actions
      propStmt.run("prop-21-1", "retro-sprint-21", "Automate QA staging deployment in CI/CD pipeline on main branch merge", "Deploy automatically to staging upon PR merge to eliminate QA handoff delays", "Transcript discussion", "explicit", "accepted", "automate qa staging deployment in ci/cd pipeline on main branch merge", "Jordan Smith", 1, "days");
      actionStmt.run("act-21-1", "prop-21-1", "retro-sprint-21", "sprint-21", "Automate QA staging deployment in CI/CD pipeline on main branch merge", "Deploy automatically to staging upon PR merge to eliminate QA handoff delays", "Automate QA staging deployment in CI/CD pipeline on main branch merge", "Deploy automatically to staging upon PR merge to eliminate QA handoff delays", "explicit", "Jordan Smith", "jordan smith", 1, "days", 480, "completed", null, null, null);

      propStmt.run("prop-21-2", "retro-sprint-21", "Implement staging vs production database configuration drift validation script", "Automated check to ensure staging database schema matches production", "Coach analysis", "coach", "accepted", "implement staging vs production database configuration drift validation script", "Marcus Vance", 4, "hours");
      actionStmt.run("act-21-2", "prop-21-2", "retro-sprint-21", "sprint-21", "Implement staging vs production database configuration drift validation script", "Automated check to ensure staging database schema matches production", "Implement staging vs production database configuration drift validation script", "Automated check to ensure staging database schema matches production", "coach", "Marcus Vance", "marcus vance", 4, "hours", 240, "completed", "AGILE-1003", "created", '{"key":"AGILE-1003","summary":"Implement staging vs production database configuration drift validation script"}');

      propStmt.run("prop-21-3", "retro-sprint-21", "Establish QA handoff checklist and definition of ready for testing", "Document requirements before tickets transition to QA testing", "Transcript discussion", "explicit", "accepted", "establish qa handoff checklist and definition of ready for testing", "Sarah Jenkins", 2, "hours");
      actionStmt.run("act-21-3", "prop-21-3", "retro-sprint-21", "sprint-21", "Establish QA handoff checklist and definition of ready for testing", "Document requirements before tickets transition to QA testing", "Establish QA handoff checklist and definition of ready for testing", "Document requirements before tickets transition to QA testing", "explicit", "Sarah Jenkins", "sarah jenkins", 2, "hours", 120, "completed", null, null, null);

      // Re-seed coach topics for Sprints 20, 21, 22
      const topicStmt = this.db.prepare(`
        INSERT INTO coach_topics (id, project_id, sprint_id, title, rationale, category, priority, state)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      topicStmt.run("topic-20-1", defaultProjectId, "sprint-20", "CI Pipeline Flakiness & Test Memory Allocation", "Flaky integration tests caused 4 blocked issues and velocity drop", "metric_driven", 1, "accepted");
      topicStmt.run("topic-20-2", defaultProjectId, "sprint-20", "Onboarding API Endpoint Service Ownership", "Unclear ownership created multi-day resolution delays on API bugs", "blind_spot", 2, "accepted");

      topicStmt.run("topic-21-1", defaultProjectId, "sprint-21", "Automated QA Deployment & Handoff Pipeline", "QA handoff bottleneck delayed testing until end of sprint", "metric_driven", 1, "accepted");
      topicStmt.run("topic-21-2", defaultProjectId, "sprint-21", "Staging Database Drift Prevention", "Configuration mismatch between staging and production during migration", "recurring", 2, "accepted");

      topicStmt.run("topic-22-1", defaultProjectId, "sprint-22", "PR Size Optimization & Fast Review SLAs", "Keeping PR size under 300 LOC accelerated review turnaround", "best_practice", 1, "accepted");
      topicStmt.run("topic-22-2", defaultProjectId, "sprint-22", "Sustaining 100% Completion Velocity", "Analyzing team factors behind zero-blocker, 36/36 point sprint completion", "metric_driven", 2, "accepted");

      // Re-seed coach insights
      const insightStmt = this.db.prepare(`
        INSERT INTO coach_insights (id, project_id, insight_type, title, description, confidence, related_sprint_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insightStmt.run(
        "insight-1",
        defaultProjectId,
        "recurring_issue",
        "PR Review Bottleneck Pattern",
        "PR review delays on API gateway reviews appeared as blockers in 3 of the last 4 sprints. Team velocity improves by 24% when code review SLA is explicitly discussed.",
        0.88,
        JSON.stringify(["sprint-20", "sprint-21", "sprint-24"])
      );

      insightStmt.run(
        "insight-2",
        defaultProjectId,
        "improving_trend",
        "Action Item Completion Arc",
        "Action item completion rate increased from 40% to 75% over recent sprints since owner attribution was enforced in retro intake.",
        0.92,
        JSON.stringify(["sprint-20", "sprint-21", "sprint-22"])
      );

      insightStmt.run(
        "insight-3",
        defaultProjectId,
        "blind_spot",
        "Testing & QA Blind Spot",
        "Automated test coverage has not been brought up in retro meetings despite accounting for 30% of sprint blockers. The coach recommends adding test automation as a pre-retro topic.",
        0.75,
        JSON.stringify(["sprint-20", "sprint-21", "sprint-24"])
      );

      // Reset Jira counter
      this.db.exec(`UPDATE mock_jira_counter SET counter = 1004 WHERE id = 1`);
    });

    txn();
    return Promise.resolve({ success: true });
  }
}

module.exports = {
  runRetroMigrations,
  RetroRepository,
};
