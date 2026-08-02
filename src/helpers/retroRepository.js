const { randomUUID } = require("crypto");
const { normalizeOwner, calculateEstimateMinutes } = require("../utils/retroActionUtils.ts");
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
          "sprint-24",
          "Sprint 24 — Payments",
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
          "sprint-23",
          "Sprint 23 — Payments",
          "2026-06-24",
          "2026-07-05",
          38,
          35,
          12,
          11,
          1,
          "on trend",
          35,
          "Staging database migration"
        );

        stmt.run(
          "sprint-22",
          "Sprint 22 — Checkout",
          "2026-06-10",
          "2026-06-21",
          36,
          36,
          10,
          10,
          0,
          "ahead of trend",
          36,
          ""
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
      committed_points,
      completed_points,
      total_issues,
      completed_issues,
      blocked_issues,
      burndown_trend,
      velocity,
      blockers,
    } = metrics;

    this.db
      .prepare(`
        UPDATE sprint_snapshots SET
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
      .prepare("SELECT * FROM retrospectives ORDER BY created_at DESC")
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
        WHERE retrospective_id = ? AND state = 'pending'
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
    const rows = this.db
      .prepare(`
        SELECT DISTINCT owner FROM retro_tracked_actions
        WHERE owner IS NOT NULL AND owner != ''
        ORDER BY owner_normalized ASC
      `)
      .all();
    return Promise.resolve(rows.map((r) => r.owner));
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
}

module.exports = {
  runRetroMigrations,
  RetroRepository,
};
