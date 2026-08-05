const path = require("path");
const fs = require("fs");
const { app } = require("electron");
const { RetroRepository } = require("./retroRepository");
const debugLogger = require("./debugLogger");
const {
  chunkTranscript,
  deduplicateProposals,
  parseRetroResponse,
  buildRepairPrompt,
} = require("./retroAnalysisUtils");

class RetroAgentHandlers {
  constructor(databaseManager, broadcastToWindows) {
    this.databaseManager = databaseManager;
    this.broadcastToWindows = broadcastToWindows || (() => {});
    this._retroRepository = null;
  }

  _getRetroRepository() {
    if (!this._retroRepository && this.databaseManager?.db) {
      this._retroRepository = new RetroRepository(this.databaseManager.db);
    }
    return this._retroRepository;
  }

  async handleInvoke(op, payload = {}, event = null) {
    const repo = this._getRetroRepository();
    const ALLOWED_OPS = new Set([
      "sprints.list",
      "sprints.get",
      "sprints.updateMetrics",
      "retro.create",
      "retro.get",
      "retro.update",
      "retro.list",
      "retro.copyAudio",
      "proposals.list",
      "proposals.accept",
      "proposals.dismiss",
      "actions.list",
      "actions.createManual",
      "actions.update",
      "actions.delete",
      "actions.listOwners",
      "jira.createMock",
      "models.describe",
      "analysis.run",
      "projects.list",
      "projects.get",
      "projects.create",
      "projects.update",
      "projects.delete",
      "coach.suggestTopics",
      "coach.listTopics",
      "coach.updateTopic",
      "coach.acceptTopic",
      "coach.dismissTopic",
      "coach.listOutcomes",
      "coach.listInsights",
      "coach.listSlackNotifications",
      "coach.sendSlack",
      "demo.resetData",
    ]);

    if (!ALLOWED_OPS.has(op)) {
      throw new Error(`Invalid retro operation: ${op}`);
    }

    switch (op) {
      case "sprints.list":
        return repo.listSprints();
      case "sprints.get":
        return repo.getSprintSnapshot(payload.sprintId);
      case "sprints.updateMetrics":
        return repo.updateSprintMetrics(payload.sprintId, payload.metrics);
      case "retro.create":
        return repo.createRetrospective(payload);
      case "retro.get":
        return repo.getRetrospective(payload.id);
      case "retro.update":
        return repo.updateRetrospective(payload.id, payload.updates);
      case "retro.list":
        return repo.listRetrospectives();
      case "retro.copyAudio": {
        const { sourcePath, retrospectiveId } = payload;
        const ext = path.extname(sourcePath) || ".wav";
        const retroAudioDir = path.join(app.getPath("userData"), "retro-audio");
        fs.mkdirSync(retroAudioDir, { recursive: true });
        const destPath = path.join(retroAudioDir, `${retrospectiveId}${ext}`);
        fs.copyFileSync(sourcePath, destPath);
        return { copiedPath: destPath };
      }
      case "proposals.list":
        return repo.listProposals(payload.retrospectiveId);
      case "proposals.accept":
        return repo.acceptProposal(payload.proposalId, payload.editedData);
      case "proposals.dismiss":
        return repo.dismissProposal(payload.proposalId);
      case "actions.list":
        return repo.listTrackedActions(payload);
      case "actions.createManual":
        return repo.createManualAction(payload);
      case "actions.update":
        return repo.updateTrackedAction(payload.id, payload.updates);
      case "actions.delete":
        return repo.deleteTrackedAction(payload.id);
      case "actions.listOwners":
        return repo.listOwners();
      case "jira.createMock":
        return repo.createMockJiraTicket(
          payload.trackedActionId,
          payload.summary,
          payload.description
        );
      case "models.describe":
        return this.describeRetroModel(payload || {});
      case "analysis.run":
        return this.runRetroAnalysis(
          payload.retrospectiveId,
          payload.settings || {},
          event?.sender
        );
      case "projects.list":
        return repo.listProjects();
      case "projects.get":
        return repo.getProject(payload.id);
      case "projects.create":
        return repo.createProject(payload);
      case "projects.update":
        return repo.updateProject(payload.id, payload.updates);
      case "projects.delete":
        return repo.deleteProject(payload.id);
      case "coach.suggestTopics":
        return this.suggestCoachTopics(payload.projectId, payload.sprintId, payload.settings);
      case "coach.listTopics":
        return repo.listTopics(payload?.projectId, payload?.sprintId);
      case "coach.updateTopic":
        return repo.updateTopic(payload.id, payload.updates);
      case "coach.acceptTopic":
        return repo.acceptTopic(payload.id);
      case "coach.dismissTopic":
        return repo.dismissTopic(payload.id);
      case "coach.listOutcomes":
        return repo.listTopicOutcomes(payload.retrospectiveId);
      case "coach.listInsights":
        return repo.listInsights(payload?.projectId);
      case "coach.listSlackNotifications":
        return repo.listSlackNotifications(payload?.projectId);
      case "coach.sendSlack":
        return this.sendSlackNotification(payload);
      case "demo.resetData":
        return repo.resetDemoData();
      default:
        throw new Error(`Unsupported retro op: ${op}`);
    }
  }

  cancelAnalysis(retrospectiveId) {
    const localBridge = require("../services/localReasoningBridge").default;
    localBridge.cancelAnalysis(retrospectiveId);
    return { success: true };
  }

  async describeRetroModel(settings = {}) {
    const mode = settings.retroAnalystMode || "local";
    const provider = settings.retroAnalystProvider || settings.cleanupProvider || "qwen";
    const rawModelId = settings.retroAnalystModel || settings.retroReasoningModel || settings.cleanupModel || null;

    const isCloudMode = mode === "providers" || mode === "cloud" || mode === "byok" || mode === "openwhispr";
    const isCloudProvider = ["gemini", "openai", "anthropic", "groq", "tinfoil", "openrouter", "custom"].includes(provider);

    if (isCloudMode || isCloudProvider) {
      let displayName = rawModelId;
      if (provider === "gemini") {
        displayName = rawModelId ? `Google Gemini (${rawModelId})` : "Google Gemini";
      } else if (provider === "openai") {
        displayName = rawModelId ? `OpenAI (${rawModelId})` : "OpenAI";
      } else if (provider === "anthropic") {
        displayName = rawModelId ? `Anthropic (${rawModelId})` : "Anthropic";
      } else if (provider === "groq") {
        displayName = rawModelId ? `Groq (${rawModelId})` : "Groq";
      } else if (provider === "tinfoil") {
        displayName = rawModelId ? `Tinfoil (${rawModelId})` : "Tinfoil";
      } else if (provider === "openrouter") {
        displayName = rawModelId ? `OpenRouter (${rawModelId})` : "OpenRouter";
      } else if (!displayName) {
        displayName = `${provider || "Cloud"} Model`;
      }
      return {
        available: true,
        modelId: displayName,
        providerId: provider,
        contextLength: 32768,
      };
    }

    const modelManager = require("./modelManagerBridge").default;
    const localBridge = require("../services/localReasoningBridge").default;
    const isAvailable = await localBridge.isAvailable();

    let targetModelId = rawModelId;

    let isDownloaded = false;
    if (targetModelId) {
      isDownloaded = await modelManager.isModelDownloaded(targetModelId);
    }

    if (!isDownloaded) {
      try {
        const allModels = await modelManager.getAllModels();
        const downloadedModel = allModels.find((m) => m.isDownloaded);
        if (downloadedModel) {
          targetModelId = downloadedModel.id;
          isDownloaded = true;
        }
      } catch (err) {
        debugLogger.error("Failed to query downloaded local models", { error: err.message });
      }
    }

    if (!targetModelId || !isDownloaded || !isAvailable) {
      return { available: false, modelId: targetModelId || null, providerId: "local", contextLength: 4096 };
    }

    const modelInfo = modelManager.findModelById(targetModelId);
    const contextLength = modelInfo?.model?.contextLength || 4096;

    return {
      available: true,
      modelId: targetModelId,
      providerId: "local",
      contextLength,
    };
  }

  async runRetroAnalysis(retrospectiveId, settings = {}, senderWindow) {
    const repo = this._getRetroRepository();
    const retro = await repo.getRetrospective(retrospectiveId);
    if (!retro) throw new Error("Retrospective not found");

    const sprint = await repo.getSprintSnapshot(retro.sprint_id);
    const modelStatus = await this.describeRetroModel(settings);

    if (!modelStatus.available || !modelStatus.modelId) {
      throw new Error("No local reasoning model selected. Retrospective analysis requires a locally installed model.");
    }

    const localBridge = require("../services/localReasoningBridge").default;
    localBridge.clearCancelledAnalysis(retrospectiveId);

    await repo.updateRetrospective(retrospectiveId, { processing_state: "analyzing" });

    const emitProgress = (stage, chunkIndex = 0, chunkCount = 1, error = null) => {
      const data = { retrospectiveId, stage, chunkIndex, chunkCount, error };
      if (senderWindow && !senderWindow.isDestroyed()) {
        senderWindow.send("retro:analysis-progress", data);
      }
      this.broadcastToWindows("retro:analysis-progress", data);
    };

    const chunks = chunkTranscript(retro.transcript, modelStatus.contextLength);
    const totalChunks = chunks.length || 1;

    emitProgress("analyzing", 0, totalChunks);

    const rawParsedItems = [];
    const sprintContext = sprint
      ? `SPRINT CONTEXT:\nSprint: ${sprint.name}\nCommitted: ${sprint.committed_points} pts | Completed: ${sprint.completed_points} pts | Velocity: ${sprint.velocity} pts\nIssues: ${sprint.completed_issues}/${sprint.total_issues} completed (${sprint.blocked_issues} blocked)\nBurndown Trend: ${sprint.burndown_trend}\nBlockers: ${sprint.blockers || "None"}\n`
      : "";

    const meetingOwner = retro.meeting_owner || settings.meetingOwner || settings.uploaderIdentity || "";
    const meetingOwnerText = meetingOwner ? `Default Meeting Owner / Uploader: "${meetingOwner}"\n` : "";

    const systemPrompt =
      `You are an expert Agile coach analyzing a retrospective transcript.\n` +
      sprintContext +
      meetingOwnerText +
      `Extract explicitly stated action items and suggest agile-coach improvements.\n` +
      `For every item, estimate effort ("estimateValue" as a number and "estimateUnit" as "minutes", "hours", or "days") and assign an "owner".\n` +
      `Assign a transcript-supported owner if a specific participant is identified in the transcript; otherwise set "owner" to the default meeting owner: "${meetingOwner || "Unassigned"}". Do not invent named participants not mentioned in the transcript.\n` +
      `Return ONLY a JSON object with this exact schema (max 5 explicitActions and 5 coachSuggestions):\n` +
      `{\n  "explicitActions": [{ "title": "...", "description": "...", "owner": "...", "estimateValue": 1, "estimateUnit": "hours" }],\n  "coachSuggestions": [{ "title": "...", "description": "...", "basis": "...", "owner": "...", "estimateValue": 1, "estimateUnit": "hours" }]\n}\n` +
      `Do not include any prose, commentary, or markdown formatting outside JSON.`;

    for (let i = 0; i < chunks.length; i++) {
      if (localBridge.isAnalysisCancelled(retrospectiveId)) {
        emitProgress("completed", totalChunks, totalChunks);
        return [];
      }

      emitProgress("analyzing", i + 1, totalChunks);

      const chunk = chunks[i];
      let output;
      try {
        output = await localBridge.processText(chunk.text, modelStatus.modelId, {
          priority: "batch",
          retrospectiveId,
          systemPrompt,
          temperature: 0.0,
          maxTokens: 2048,
          timeoutMs: 120000,
        });
      } catch (err) {
        if (err.message && err.message.includes("cancelled")) {
          emitProgress("completed", totalChunks, totalChunks);
          return [];
        }
        debugLogger.error("Retro chunk inference failed", { chunkIndex: i, error: err.message });
        continue;
      }

      let parsed = parseRetroResponse(output);

      if (parsed.unparsed) {
        emitProgress("parsing", i + 1, totalChunks);
        try {
          const repairPrompt = buildRepairPrompt(output);
          const repairedOutput = await localBridge.processText(repairPrompt, modelStatus.modelId, {
            priority: "batch",
            retrospectiveId,
            systemPrompt: "Return only valid JSON.",
            temperature: 0.0,
            maxTokens: 2048,
            timeoutMs: 120000,
          });
          parsed = parseRetroResponse(repairedOutput);
        } catch (repairErr) {
          debugLogger.warn("Repair retry failed", { chunkIndex: i, error: repairErr.message });
        }
      }

      if (!parsed.unparsed) {
        for (const item of parsed.explicitActions) {
          rawParsedItems.push({
            title: item.title,
            description: item.description,
            owner: item.owner || meetingOwner,
            estimateValue: item.estimateValue,
            estimateUnit: item.estimateUnit,
            source: "explicit",
          });
        }
        for (const item of parsed.coachSuggestions) {
          rawParsedItems.push({
            title: item.title,
            description: item.description,
            basis: item.basis,
            owner: item.owner || meetingOwner,
            estimateValue: item.estimateValue,
            estimateUnit: item.estimateUnit,
            source: "coach",
          });
        }
      }
    }

    const existingProposals = await repo.listProposals(retrospectiveId);
    const existingActions = await repo.listTrackedActions();
    const excludeTitlesSet = new Set([
      ...existingProposals.map((p) => p.title),
      ...existingActions.map((a) => a.title),
    ]);

    const deduped = deduplicateProposals(rawParsedItems, excludeTitlesSet);

    const nextRunCount = (retro.analysis_run_count || 0) + 1;
    const saved = await repo.saveProposals(retrospectiveId, deduped, nextRunCount);

    emitProgress("completed", totalChunks, totalChunks);

    try {
      await this.evaluateTopicCoverage(retrospectiveId, retro.sprint_id, retro.transcript, modelStatus);
    } catch (covErr) {
      debugLogger.warn("Topic coverage evaluation error", { error: covErr.message });
    }

    return saved;
  }

  async suggestCoachTopics(projectId, sprintId, settings = {}) {
    const repo = this._getRetroRepository();
    const sprint = await repo.getSprintSnapshot(sprintId);
    const existingActions = await repo.listTrackedActions({ sprintId });
    const modelStatus = await this.describeRetroModel(settings);

    const contextText =
      `Sprint: ${sprint ? sprint.name : sprintId || "Current"}\n` +
      `Committed Points: ${sprint ? sprint.committed_points : 0} | Completed: ${sprint ? sprint.completed_points : 0} | Velocity: ${sprint ? sprint.velocity : 0}\n` +
      `Blockers: ${sprint ? sprint.blockers : "None"}\n` +
      `Burndown Trend: ${sprint ? sprint.burndown_trend : "on_track"}\n` +
      `Open Tracked Actions (${existingActions.length}): ${existingActions.map((a) => a.title).join(", ") || "None"}\n`;

    const defaultTopics = [
      {
        project_id: projectId || "proj-default-gen-eng",
        sprint_id: sprintId,
        title: "Sprint Blocker Resolution & PR Review Delays",
        rationale: `Metrics show velocity impacted by blockers (${sprint?.blockers || "PR review delays"}).`,
        category: "metric_driven",
        priority: 1,
        state: "suggested",
      },
      {
        project_id: projectId || "proj-default-gen-eng",
        sprint_id: sprintId,
        title: "Capacity Planning & Commitment vs Completion Gap",
        rationale: `Team completed ${sprint?.completed_points || 0} out of ${sprint?.committed_points || 0} committed points.`,
        category: "metric_driven",
        priority: 2,
        state: "suggested",
      },
      {
        project_id: projectId || "proj-default-gen-eng",
        sprint_id: sprintId,
        title: "Carried-Over Action Item Follow-Through",
        rationale: `${existingActions.length} action items carried over from previous sprints need attention.`,
        category: "carryover",
        priority: 3,
        state: "suggested",
      },
    ];

    if (!modelStatus.available || !modelStatus.modelId) {
      await repo.saveTopics(defaultTopics);
      return repo.listTopics(projectId, sprintId);
    }

    try {
      const localBridge = require("../services/localReasoningBridge").default;
      const prompt =
        `You are an expert Agile Coach preparing for an upcoming team retrospective.\n` +
        `Based on the team's sprint metrics and open action items below, suggest 3 to 5 targeted discussion topics for the team's retrospective meeting.\n\n` +
        `${contextText}\n\n` +
        `Return ONLY a JSON object with this exact schema:\n` +
        `{\n` +
        `  "topics": [\n` +
        `    {\n` +
        `      "title": "Topic title",\n` +
        `      "rationale": "Explanation based on metrics or blockers",\n` +
        `      "category": "metric_driven",\n` +
        `      "priority": 1\n` +
        `    }\n` +
        `  ]\n` +
        `}\n` +
        `Category must be one of: "metric_driven", "carryover", "blind_spot", "best_practice", "recurring". Priority is 1 to 5. Return valid JSON only with no prose.`;

      const output = await localBridge.processText(prompt, modelStatus.modelId, {
        priority: "batch",
        temperature: 0.2,
        maxTokens: 2048,
        timeoutMs: 60000,
      });

      const cleanJson = output.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      const generated = (parsed.topics || []).map((t) => ({
        project_id: projectId || "proj-default-gen-eng",
        sprint_id: sprintId,
        title: t.title,
        rationale: t.rationale || "",
        category: t.category || "metric_driven",
        priority: Number(t.priority) || 3,
        state: "suggested",
      }));

      const finalTopics = generated.length > 0 ? generated : defaultTopics;
      await repo.saveTopics(finalTopics);
    } catch (err) {
      debugLogger.warn("Failed LLM topic suggestion, fallback to defaults", { error: err.message });
      await repo.saveTopics(defaultTopics);
    }

    return repo.listTopics(projectId, sprintId);
  }

  async evaluateTopicCoverage(retrospectiveId, sprintId, transcript, modelStatus) {
    const repo = this._getRetroRepository();
    const topics = await repo.listTopics(null, sprintId);
    const acceptedTopics = topics.filter((t) => t.state === "accepted");
    if (!acceptedTopics.length) return [];

    const localBridge = require("../services/localReasoningBridge").default;
    const topicListText = acceptedTopics
      .map((t, idx) => `${idx + 1}. [ID: ${t.id}] Title: "${t.title}" — Rationale: "${t.rationale}"`)
      .join("\n");

    const prompt =
      `Analyze the retrospective transcript below and evaluate how well the accepted coaching topics were discussed in the meeting:\n\n` +
      `COACHING TOPICS:\n${topicListText}\n\n` +
      `TRANSCRIPT:\n${transcript.slice(0, 8000)}\n\n` +
      `Return ONLY a JSON object with this exact schema:\n` +
      `{\n` +
      `  "outcomes": [\n` +
      `    {\n` +
      `      "topic_id": "...",\n` +
      `      "coverage_score": 0.8,\n` +
      `      "engagement_depth": "deep",\n` +
      `      "speaker_count": 3,\n` +
      `      "sentiment": "positive",\n` +
      `      "agent_notes": "...",\n` +
      `      "relevant_quotes": ["..."]\n` +
      `    }\n` +
      `  ]\n` +
      `}\n` +
      `coverage_score is 0.0 to 1.0. engagement_depth is "superficial", "moderate", or "deep". sentiment is "positive", "neutral", or "frustrated". Return valid JSON only with no prose.`;

    const output = await localBridge.processText(prompt, modelStatus.modelId, {
      priority: "batch",
      temperature: 0.1,
      maxTokens: 2048,
      timeoutMs: 60000,
    });

    const cleanJson = output.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    const outcomes = (parsed.outcomes || []).map((o) => ({
      topic_id: o.topic_id,
      retrospective_id: retrospectiveId,
      coverage_score: Number(o.coverage_score) || 0.5,
      engagement_depth: o.engagement_depth || "moderate",
      speaker_count: Number(o.speaker_count) || 1,
      sentiment: o.sentiment || "neutral",
      agent_notes: o.agent_notes || "",
      relevant_quotes: JSON.stringify(o.relevant_quotes || []),
    }));

    return repo.saveTopicOutcomes(outcomes);
  }

  async sendSlackNotification(payload) {
    const repo = this._getRetroRepository();
    const { projectId, recipientName, messageType, content } = payload;

    let finalContent = content;
    if (!finalContent || finalContent.startsWith("[TEST")) {
      switch (messageType) {
        case "preRetroPreview":
          finalContent = `🤖 [Agile Coach Agent via MCP Dispatch]\n\n📋 *Pre-Retro Discussion Agenda Preview*\nTarget Channel/Recipient: ${recipientName || "Team Channel"}\n\nCoach Suggested Agenda Topics for upcoming Retrospective:\n• ⚡ *PR Size Optimization & Fast Review SLAs* (Turnaround SLA < 24h)\n• 📈 *Sustaining 100% Completion Velocity* (Zero-blocker sprint analysis)\n\n👉 Team members: Please review and mark accepted topics before the retro kick-off meeting!`;
          break;
        case "ownerReminder":
          finalContent = `🤖 [Agile Coach Agent via MCP Dispatch]\n\n⏰ *Action Item Owner Reminder*\nTarget Recipient: ${recipientName || "Action Item Owners"}\n\nReminder for assigned retro action items:\n• 📌 *Create GitHub PR template with 300 LOC guidelines* (Marcus Vance — 2 hours est.)\n• 📌 *Draft initial PR review response time SLA* (Sarah Jenkins — 1 day est.)\n\nPlease check in status before the sprint boundary!`;
          break;
        case "metricAlert":
          finalContent = `🤖 [Agile Coach Agent via MCP Dispatch]\n\n🚨 *Sprint Metric Alert*\nTarget Channel: ${recipientName || "Engineering Leads"}\n\n• *Burndown Trend*: Behind trend (29/40 completed points)\n• *Active Blockers*: 3 PR review bottlenecks on API Gateway\n\n💡 *Coach Recommendation*: Focus engineering effort on clearing API Gateway code reviews today to recover sprint commitment.`;
          break;
        case "postRetroSummary":
          finalContent = `🤖 [Agile Coach Agent via MCP Dispatch]\n\n📊 *Post-Retro Personal Summary*\nTarget Recipient: ${recipientName || "Team Members"}\n\n• Retrospective session completed successfully.\n• 3 new action items created and synced to Jira (AGILE-1004, AGILE-1005).\n• Accepted coach discussion topics recorded for team velocity playbook.`;
          break;
        case "actionFollowup":
          finalContent = `🤖 [Agile Coach Agent via MCP Dispatch]\n\n🔄 *Mid-Sprint Action Item Follow-Up*\nTarget Recipient: ${recipientName || "Team Channel"}\n\n• Carried-over action items status check: 2 of 3 carried items resolved!\n• Remaining carried item: *Setup automated performance regression benchmark check in CI* (Jordan Smith)`;
          break;
        case "insightShare":
          finalContent = `🤖 [Agile Coach Agent via MCP Dispatch]\n\n💡 *Agile Coach Team Insight Share*\nTarget Channel: ${recipientName || "Team Channel"}\n\n• *Detected Pattern*: PR review delays on API gateway reviews appeared as blockers in 3 of the last 4 sprints.\n• *Impact*: Team velocity improves by +24% when code review SLA is explicitly discussed.`;
          break;
        default:
          finalContent = `🤖 [Agile Coach Agent via MCP Dispatch]\n\n📢 *Agile Coach Notification*\nTarget Recipient: ${recipientName || "Team"}\n\nAutomated dispatch for trigger '${messageType}' delivered successfully.`;
          break;
      }
    }

    return repo.saveSlackNotification({
      project_id: projectId || "proj-default-gen-eng",
      recipient_name: recipientName || "Team Channel",
      recipient_slack_id: payload.recipientSlackId || "",
      message_type: messageType,
      message_content: finalContent,
      status: "sent",
    });
  }
}

module.exports = { RetroAgentHandlers };
