import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createSide, preferences } from "./shared/preferences";
import { connectLocalDaemon } from "./server/daemon";
import { copyCompletedSession, removeSessionCopy } from "./server/full-memory";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(preferences);
  server.handle(createSide, async ({ parentId, task, mode: requestedMode }, { paseo }) => {
    const saved = await settings.read();
    if (!requestedMode && saved.status !== "ready") throw new Error("Side agent settings are invalid; restore defaults in plugin settings.");
    const mode = requestedMode ?? (saved.status === "ready" ? saved.values.defaultMode : "fork");
    const result = await paseo.agents.ref(parentId).refresh();
    if (!result || result.agent.archivedAt) throw new Error("The parent agent is no longer available.");
    const parent = result.agent;
    const featureValues = Object.fromEntries((parent.features ?? []).map(feature => [feature.id, feature.value]));
    const title = `Side: ${task.replace(/\s+/g, " ").slice(0, 64)}`;
    const prompt = `You are a side agent forked from Paseo chat ${parent.id}. The preceding conversation or attached chat history belongs to the parent; earlier tasks are not yours. Work only on the task below and report concisely.\n\nTask:\n${task}`;
    const daemon = await connectLocalDaemon();
    let sessionCopy: string | undefined;
    let importedId: string | undefined;
    try {
      // Refuse mismatched daemon homes before any filesystem or agent mutation.
      if (!(await daemon.fetchAgent(parent.id))) throw new Error("Parent is unavailable on this local daemon.");
      if (mode === "fork") {
        const context = await daemon.buildAgentForkContext(parent.id);
        if (!context.attachment) throw new Error(context.error ?? "Paseo could not build fork context.");
        const attachment = { ...context.attachment };
        const prefix = "<chat-history-summary>\n[Earlier history omitted; newest kept]\n";
        if (attachment.text.length > 100_000) attachment.text = prefix + attachment.text.slice(-(100_000 - prefix.length));
        const child = await paseo.agents.create({
          cwd: parent.cwd, parent: parent.id, title, prompt,
          labels: { "side-agent.mode": mode },
          config: {
            provider: parent.model ? `${parent.provider}/${parent.model}` : parent.provider,
            ...(parent.currentModeId ? { modeId: parent.currentModeId } : {}),
            ...(parent.thinkingOptionId ? { thinkingOptionId: parent.thinkingOptionId } : {}),
            featureValues,
          },
          attachments: [attachment],
        });
        return { agentId: child.id, mode };
      }
      if (parent.provider !== "omp") throw new Error("Full memory is OMP-only; use /side --fork for this provider.");
      if (!parent.persistence?.nativeHandle) throw new Error("Parent OMP session file is unavailable.");
      sessionCopy = await copyCompletedSession(parent.persistence.nativeHandle);
      const child = await daemon.importAgent({
        providerId: "omp", providerHandleId: sessionCopy, cwd: parent.cwd,
        ...(parent.workspaceId ? { workspaceId: parent.workspaceId } : {}),
        labels: { "paseo.parent-agent-id": parent.id, "side-agent.mode": mode },
      });
      importedId = child.id;
      await daemon.updateAgent(child.id, { name: title });
      await daemon.applyAgentConfig(child.id, {
        modelId: parent.model, thinkingOptionId: parent.thinkingOptionId ?? null,
        ...(parent.currentModeId ? { modeId: parent.currentModeId } : {}), featureValues,
      });
      await daemon.sendAgentMessage(child.id, prompt);
      return { agentId: child.id, mode };
    } catch (error) {
      // A failed full-mode launch must not leave an active half-configured child.
      if (importedId) await daemon.archiveAgent(importedId);
      if (sessionCopy) await removeSessionCopy(sessionCopy);
      throw error;
    } finally { await daemon.close(); }
  });
  return () => {};
}
